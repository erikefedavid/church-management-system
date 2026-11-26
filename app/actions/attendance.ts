'use server';

import { prisma } from '@/lib/prisma';
import { isWithinChurchGeofence } from '@/lib/geo';
import {
  getActiveChurchService,
  getNigerianDateMidnight,
  getNigerianTimeInfo,
  isFirstSundayOfMonth,
} from '@/lib/service-resolver';
import { CheckInMethod, PersonCategory, PersonStatus, ServiceSchedule, DayOfWeek } from '@prisma/client';
import { NextUpcomingService } from '@/lib/service-resolver';

export type ActiveServiceResponse =
  | {
      success: true;
      church: {
        id: string;
        name: string;
        latitude: number;
        longitude: number;
        geofenceRadius: number;
      };
      activeService: ServiceSchedule | null;
      todayServices: ServiceSchedule[];
      concurrentServices?: ServiceSchedule[];
      currentDay: DayOfWeek;
      currentTimeString: string;
      portalSubtitle?: string;
      isLiveNow?: boolean;
      isOvertime?: boolean;
      nigerianTimeFormatted?: string;
      nextUpcomingService?: NextUpcomingService | null;
      isFirstSunday?: boolean;
      isThirdSaturday?: boolean;
      error?: undefined;
    }
  | {
      success: false;
      error: string;
      church?: undefined;
      activeService?: undefined;
      todayServices?: undefined;
      currentDay?: undefined;
      currentTimeString?: undefined;
    };

/**
 * 1. Resolves the active service for today and current time.
 */
export async function getActiveServiceAction(overrideTime?: string): Promise<ActiveServiceResponse> {
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const church = await prisma.church.findFirst();
      if (!church) {
        return { success: false, error: 'No church found. Please seed the database.' };
      }

      const serviceResult = await getActiveChurchService(church.id, new Date(), overrideTime);

      return {
        success: true,
        church: {
          id: church.id,
          name: church.name,
          latitude: church.latitude,
          longitude: church.longitude,
          geofenceRadius: church.geofenceRadius,
        },
        ...serviceResult,
      };
    } catch (error) {
      console.warn(`Attempt ${attempt} to resolve active church service encountered:`, error);
      if (attempt < 2) {
        await new Promise((r) => setTimeout(r, 200));
      }
    }
  }

  // Resilient fallback so church attendance portal remains operational
  try {
    const fallbackChurch = await prisma.church.findFirst();
    if (fallbackChurch) {
      const fallbackSchedule = await prisma.serviceSchedule.findFirst({
        where: { churchId: fallbackChurch.id },
      });
      return {
        success: true,
        church: {
          id: fallbackChurch.id,
          name: fallbackChurch.name,
          latitude: fallbackChurch.latitude,
          longitude: fallbackChurch.longitude,
          geofenceRadius: fallbackChurch.geofenceRadius,
        },
        activeService: null,
        todayServices: fallbackSchedule ? [fallbackSchedule] : [],
        currentDay: 'SUNDAY',
        currentTimeString: '09:00',
        portalSubtitle: 'Attendance Portal (Off-Hours)',
        isLiveNow: false,
      };
    }
  } catch (fallbackError) {
    console.error('Critical fallback error in getActiveServiceAction:', fallbackError);
  }

  return { success: false, error: 'Unable to connect to church portal.' };
}

/**
 * 2. Look up members by the last 4 digits of their phone with collision support.
 */
export async function lookupByPhoneSuffix(phoneSuffix: string) {
  try {
    const cleanDigits = (phoneSuffix || '').replace(/\D/g, '');
    if (cleanDigits.length !== 4) {
      return { success: false, error: 'Please enter exactly 4 digits.', count: 0, members: [] };
    }

    const church = await prisma.church.findFirst();
    if (!church) {
      return { success: false, error: 'Church not found.', count: 0, members: [] };
    }

    const members = await prisma.person.findMany({
      where: {
        churchId: church.id,
        isActive: true,
        OR: [
          { phoneLast4: cleanDigits },
          { phone: { endsWith: cleanDigits } },
        ],
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        phone: true,
        phoneLast4: true,
        category: true,
        subCategory: true,
        status: true,
        photoUrl: true,
      },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    });

    return {
      success: true,
      count: members.length,
      members,
    };
  } catch (error) {
    console.error('Error looking up member by phone suffix:', error);
    return { success: false, error: 'Failed to lookup member.', count: 0, members: [] };
  }
}

// Backward-compatible alias
export const lookupMemberByLast4Action = lookupByPhoneSuffix;

/**
 * 3. Look up a single member by their unique Person ID (used by QR scanner).
 */
export async function lookupMemberByIdAction(personId: string) {
  try {
    if (!personId) {
      return { success: false, error: 'Invalid member ID.' };
    }

    const member = await prisma.person.findUnique({
      where: { id: personId },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        phone: true,
        phoneLast4: true,
        category: true,
        subCategory: true,
        status: true,
        photoUrl: true,
      },
    });

    if (!member) {
      return { success: false, error: 'Member not found.' };
    }

    return {
      success: true,
      member,
    };
  } catch (error) {
    console.error('Error looking up member by ID:', error);
    return { success: false, error: 'Failed to find member.' };
  }
}

/**
 * 4. Register Attendance with Geofencing, Duplicate Prevention, and Workers' Routing.
 */
export type RegisterAttendanceResult =
  | {
      success: true;
      alreadyCheckedIn: false;
      isEarlyBird: boolean;
      serviceId: string;
      serviceName: string;
      personId: string;
      personName: string;
      message: string;
      error?: undefined;
      distanceMeters?: number;
    }
  | {
      success: false;
      alreadyCheckedIn?: boolean;
      error: string;
      distanceMeters?: number;
      serviceId?: string;
      serviceName?: string;
      personId?: undefined;
      personName?: undefined;
      isEarlyBird?: undefined;
      message?: undefined;
    };

export interface RegisterAttendanceParams {
  personId: string;
  latitude?: number;
  longitude?: number;
  method: 'QR' | 'LOOKUP_4DIGIT' | 'ONE_TAP';
  serviceScheduleId?: string;
  subClass?: string;
}

export async function registerAttendance({
  personId,
  latitude,
  longitude,
  method = 'LOOKUP_4DIGIT',
  serviceScheduleId,
  subClass,
}: RegisterAttendanceParams): Promise<RegisterAttendanceResult> {
  try {
    const church = await prisma.church.findFirst();
    if (!church) {
      return { success: false, error: 'Church configuration not found.' };
    }

    // 1. Server-Side Geofence Enforcement
    if (latitude === undefined || longitude === undefined) {
      return {
        success: false,
        error: 'Location permission is required to confirm you are on church premises.',
      };
    }

    const geoCheck = isWithinChurchGeofence(
      { latitude, longitude },
      { latitude: church.latitude, longitude: church.longitude },
      church.geofenceRadius || 150
    );

    if (!geoCheck.isAllowed) {
      return {
        success: false,
        error: `Check-in rejected: You are ${geoCheck.distanceMeters}m away from church premises. Must be within ${church.geofenceRadius || 150}m.`,
        distanceMeters: geoCheck.distanceMeters,
      };
    }

    // 2. Resolve Target Service
    let targetScheduleId = serviceScheduleId;
    if (!targetScheduleId) {
      const activeResult = await getActiveChurchService(church.id, new Date());
      if (activeResult.activeService) {
        targetScheduleId = activeResult.activeService.id;
      } else {
        return {
          success: false,
          error: 'No church service is currently in session. Please check in during service hours.',
        };
      }
    }

    const [person, targetSchedule] = await Promise.all([
      prisma.person.findUnique({ where: { id: personId } }),
      prisma.serviceSchedule.findUnique({ where: { id: targetScheduleId } }),
    ]);

    if (!person || !targetSchedule) {
      return { success: false, error: 'Member or Service Schedule not found.' };
    }

    // 3. Workers' Meeting Integrity Routing
    let actualScheduleId = targetSchedule.id;
    let actualSchedule = targetSchedule;
    let isEarlyBird = false;

    if (targetSchedule.name.toLowerCase().includes('workers')) {
      const isWorker =
        person.category === 'WORKER' ||
        person.subCategory === 'WORKER' ||
        person.subCategory === 'YOUTH_WORKER' ||
        person.subCategory === 'ADULT_WORKER';

      if (!isWorker) {
        const ngTime = getNigerianTimeInfo();
        const isFirstSunday = isFirstSundayOfMonth(ngTime.dayOfMonth, targetSchedule.dayOfWeek);
        const nextService = await prisma.serviceSchedule.findFirst({
          where: {
            churchId: church.id,
            dayOfWeek: targetSchedule.dayOfWeek,
            startTime: { gt: targetSchedule.startTime },
            ...(isFirstSunday
              ? {
                  name: { contains: 'Thanksgiving', mode: 'insensitive' },
                }
              : {
                  NOT: { name: { contains: 'Thanksgiving', mode: 'insensitive' } },
                }),
          },
          orderBy: { startTime: 'asc' },
        });

        if (nextService) {
          actualScheduleId = nextService.id;
          actualSchedule = nextService;
          isEarlyBird = true;
        }
      }
    }

    // 4. WAT Africa/Lagos Duplicate Prevention
    const todayWAT = getNigerianDateMidnight();

    const existing = await prisma.attendanceRecord.findFirst({
      where: {
        personId,
        serviceScheduleId: actualScheduleId,
        date: todayWAT,
      },
    });

    if (existing) {
      return {
        success: false,
        alreadyCheckedIn: true,
        error: isEarlyBird
          ? `Early arrival already recorded! You are already checked in for ${actualSchedule.name} today.`
          : `Attendance already recorded! You have already marked your attendance for ${actualSchedule.name} today.`,
        serviceId: actualSchedule.id,
        serviceName: actualSchedule.name,
      };
    }

    // Map method parameter to database CheckInMethod enum
    const dbMethod =
      method === 'QR' || method === 'LOOKUP_4DIGIT' || method === 'ONE_TAP'
        ? CheckInMethod.QR_SELF
        : CheckInMethod.QR_SELF;

    // 5. Database Record Creation with Concurrency Handling
    const record = await prisma.attendanceRecord.create({
      data: {
        churchId: church.id,
        personId,
        serviceScheduleId: actualScheduleId,
        date: todayWAT,
        subClass: subClass || null,
        method: dbMethod,
      },
      include: {
        person: true,
        serviceSchedule: true,
      },
    });

    return {
      success: true,
      alreadyCheckedIn: false,
      isEarlyBird,
      serviceId: actualSchedule.id,
      serviceName: actualSchedule.name,
      personId: record.person.id,
      personName: `${record.person.firstName} ${record.person.lastName || ''}`.trim(),
      message: isEarlyBird
        ? `Early arrival confirmed! Welcome, ${record.person.firstName}. Your attendance has been logged for ${actualSchedule.name}.`
        : `Welcome, ${record.person.firstName}! You have been checked in for ${record.serviceSchedule.name}.`,
    };
  } catch (error: unknown) {
    const errObj = error as { code?: string };
    if (errObj?.code === 'P2002') {
      return {
        success: false,
        alreadyCheckedIn: true,
        error: 'Attendance already recorded for this service today.',
      };
    }
    console.error('Error during registerAttendance:', error);
    return { success: false, error: 'Failed to record attendance.' };
  }
}

// Backward-compatible alias
export async function selfCheckInAction(params: {
  personId: string;
  serviceScheduleId: string;
  subClass?: string;
  userLatitude?: number;
  userLongitude?: number;
}) {
  return registerAttendance({
    personId: params.personId,
    serviceScheduleId: params.serviceScheduleId,
    subClass: params.subClass,
    latitude: params.userLatitude,
    longitude: params.userLongitude,
    method: 'LOOKUP_4DIGIT',
  });
}

export type RegisterFirstTimerResult =
  | {
      success: true;
      alreadyCheckedIn: false;
      isEarlyBird: boolean;
      serviceId: string;
      serviceName: string;
      personId: string;
      personName: string;
      message: string;
      error?: undefined;
    }
  | {
      success: false;
      alreadyCheckedIn?: boolean;
      error: string;
      personId?: string;
      distanceMeters?: number;
      serviceId?: string;
      serviceName?: string;
      personName?: undefined;
      isEarlyBird?: undefined;
      message?: undefined;
    };

/**
 * 5. Register a First-Timer on the spot and mark attendance.
 */
export async function registerFirstTimerAction({
  firstName,
  lastName,
  phone,
  category = PersonCategory.YOUTH,
  serviceScheduleId,
  subClass,
  userLatitude,
  userLongitude,
}: {
  firstName: string;
  lastName: string;
  phone: string;
  category?: PersonCategory;
  serviceScheduleId?: string;
  subClass?: string;
  userLatitude?: number;
  userLongitude?: number;
}): Promise<RegisterFirstTimerResult> {
  try {
    const church = await prisma.church.findFirst();
    if (!church) {
      return { success: false, error: 'Church not found.' };
    }

    const cleanFirstName = (firstName || '').trim();
    const cleanLastName = (lastName || '').trim();
    if (!cleanFirstName) {
      return { success: false, error: 'Please enter your first name.' };
    }

    // Clean phone number: extract numeric digits only
    const cleanPhone = (phone || '').trim().replace(/\D/g, '');
    if (cleanPhone.length < 10) {
      return { success: false, error: 'Please enter a valid Nigerian phone number (at least 10 digits).' };
    }
    const phoneLast4 = cleanPhone.slice(-4);

    // Check if this phone already exists
    let person = await prisma.person.findFirst({
      where: {
        churchId: church.id,
        phone: cleanPhone,
      },
    });

    if (!person) {
      // Create new First-Timer record
      person = await prisma.person.create({
        data: {
          churchId: church.id,
          firstName: cleanFirstName,
          lastName: cleanLastName || '(First-Timer)',
          phone: cleanPhone,
          phoneLast4: phoneLast4,
          category,
          subCategory: category === PersonCategory.YOUTH ? 'YOUTH' : 'ADULT',
          status: PersonStatus.FIRST_TIMER,
        },
      });
    }

    // Now mark their attendance using our registerAttendance
    const checkInResult = await registerAttendance({
      personId: person.id,
      serviceScheduleId,
      subClass,
      latitude: userLatitude,
      longitude: userLongitude,
      method: 'LOOKUP_4DIGIT',
    });

    if (!checkInResult.success) {
      return {
        success: false,
        alreadyCheckedIn: checkInResult.alreadyCheckedIn,
        error: checkInResult.error || 'Failed to record attendance.',
        personId: person.id,
        distanceMeters: checkInResult.distanceMeters,
      };
    }

    return {
      success: true,
      alreadyCheckedIn: false,
      isEarlyBird: checkInResult.isEarlyBird,
      serviceId: checkInResult.serviceId,
      serviceName: checkInResult.serviceName,
      personId: person.id,
      personName: checkInResult.personName,
      message: checkInResult.message,
    };
  } catch (error) {
    console.error('Error registering first timer:', error);
    return { success: false, error: 'Failed to register first timer.' };
  }
}

/**
 * 6. Quick dev helper to verify recorded attendance in DB
 */
export async function getRecentAttendanceStatsAction() {
  try {
    const today = getNigerianDateMidnight();

    const count = await prisma.attendanceRecord.count({
      where: { date: today },
    });

    const recent = await prisma.attendanceRecord.findMany({
      where: { date: today },
      orderBy: { createdAt: 'desc' },
      take: 5,
      include: {
        person: {
          select: { firstName: true, lastName: true, phoneLast4: true, category: true },
        },
        serviceSchedule: {
          select: { name: true },
        },
      },
    });

    return {
      success: true,
      count,
      recent: recent.map((r) => ({
        id: r.id,
        name: `${r.person.firstName} ${r.person.lastName || ''}`.trim(),
        phoneLast4: r.person.phoneLast4,
        service: r.serviceSchedule.name,
        time: new Date(r.createdAt).toLocaleTimeString('en-US', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        }),
      })),
    };
  } catch (error) {
    console.error('Error fetching recent attendance stats:', error);
    return { success: false, count: 0, recent: [] };
  }
}
