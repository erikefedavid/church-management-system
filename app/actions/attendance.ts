'use server';

import { prisma } from '@/lib/prisma';
import { isWithinChurchGeofence } from '@/lib/geo';
import { getActiveChurchService } from '@/lib/service-resolver';
import { CheckInMethod, PersonCategory, PersonStatus } from '@prisma/client';

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
      activeService: any;
      todayServices: any[];
      concurrentServices?: any[];
      currentDay: any;
      currentTimeString: string;
      portalSubtitle?: string;
      isLiveNow?: boolean;
      isOvertime?: boolean;
      nigerianTimeFormatted?: string;
      nextUpcomingService?: any;
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
        activeService: fallbackSchedule || null,
        todayServices: fallbackSchedule ? [fallbackSchedule] : [],
        currentDay: 'SUNDAY',
        currentTimeString: '09:00',
        portalSubtitle: 'Attendance Portal',
        isLiveNow: false,
      };
    }
  } catch (fallbackError) {
    console.error('Critical fallback error in getActiveServiceAction:', fallbackError);
  }

  return { success: false, error: 'Unable to connect to church portal.' };
}

/**
 * 2. Look up members by the last 4 digits of their phone.
 */
export async function lookupMemberByLast4Action(phoneLast4: string) {
  try {
    if (!phoneLast4 || phoneLast4.length !== 4) {
      return { success: false, error: 'Please enter exactly 4 digits.' };
    }

    const church = await prisma.church.findFirst();
    if (!church) {
      return { success: false, error: 'Church not found.' };
    }

    const members = await prisma.person.findMany({
      where: {
        churchId: church.id,
        phoneLast4: phoneLast4,
        isActive: true,
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        category: true,
        status: true,
      },
    });

    return {
      success: true,
      members,
      count: members.length,
    };
  } catch (error) {
    console.error('Error looking up member:', error);
    return { success: false, error: 'Failed to lookup member.' };
  }
}

/**
 * 3. Self Check-in with Geofence validation.
 */
export async function selfCheckInAction({
  personId,
  serviceScheduleId,
  subClass,
  userLatitude,
  userLongitude,
}: {
  personId: string;
  serviceScheduleId: string;
  subClass?: string;
  userLatitude?: number;
  userLongitude?: number;
}) {
  try {
    const church = await prisma.church.findFirst();
    if (!church) {
      return { success: false, error: 'Church not found.' };
    }

    // Geofence check strictly enforced
    if (userLatitude === undefined || userLongitude === undefined) {
      return {
        success: false,
        error: 'Location permission is required to confirm you are on church premises.',
      };
    }

    const geoCheck = isWithinChurchGeofence(
      { latitude: userLatitude, longitude: userLongitude },
      { latitude: church.latitude, longitude: church.longitude },
      church.geofenceRadius
    );

    if (!geoCheck.isAllowed) {
      return {
        success: false,
        error: `Check-in rejected: You are ${geoCheck.distanceMeters}m away from church premises. Must be within ${church.geofenceRadius}m.`,
      };
    }

    // Set today's date at midnight for accurate daily uniqueness
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [person, targetSchedule] = await Promise.all([
      prisma.person.findUnique({ where: { id: personId } }),
      prisma.serviceSchedule.findUnique({ where: { id: serviceScheduleId } }),
    ]);

    if (!person || !targetSchedule) {
      return { success: false, error: 'Member or Service not found.' };
    }

    let actualScheduleId = serviceScheduleId;
    let actualSchedule = targetSchedule;
    let isEarlyBird = false;

    // Intelligent check: Workers' Meeting is strictly for workers.
    // If a non-worker (Adult or Youth) arrives early during Workers' Meeting,
    // gracefully route their check-in to First Service (or Thanksgiving Service) so Workers' Meeting remains pure!
    if (targetSchedule.name.toLowerCase().includes('workers')) {
      const isWorker =
        person.category === 'WORKER' ||
        person.subCategory === 'WORKER' ||
        person.subCategory === 'YOUTH_WORKER' ||
        person.subCategory === 'ADULT_WORKER';

      if (!isWorker) {
        const nextService = await prisma.serviceSchedule.findFirst({
          where: {
            churchId: church.id,
            dayOfWeek: targetSchedule.dayOfWeek,
            startTime: { gt: targetSchedule.startTime },
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

    // Check if already checked in today for this service
    const existing = await prisma.attendanceRecord.findFirst({
      where: {
        personId,
        serviceScheduleId: actualScheduleId,
        date: today,
      },
    });

    if (existing) {
      return {
        success: false,
        alreadyCheckedIn: true,
        error: isEarlyBird
          ? `Early arrival already recorded! You are already checked in for ${actualSchedule.name} today.`
          : `Attendance already recorded! You have already marked your attendance for ${actualSchedule.name} today.`,
      };
    }

    // Create the attendance receipt
    const record = await prisma.attendanceRecord.create({
      data: {
        churchId: church.id,
        personId,
        serviceScheduleId: actualScheduleId,
        date: today,
        subClass: subClass || null,
        method: CheckInMethod.QR_SELF,
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
      message: isEarlyBird
        ? `Early arrival confirmed! Welcome, ${record.person.firstName}. Your attendance has been logged for ${actualSchedule.name}.`
        : `Welcome, ${record.person.firstName}! You have been checked in for ${record.serviceSchedule.name}.`,
    };
  } catch (error) {
    console.error('Error during self check-in:', error);
    return { success: false, error: 'Failed to record attendance.' };
  }
}

/**
 * 4. Register a First-Timer on the spot and mark attendance.
 */
export async function registerFirstTimerAction({
  firstName,
  lastName,
  phone,
  category = PersonCategory.ADULT,
  serviceScheduleId,
  subClass,
  userLatitude,
  userLongitude,
}: {
  firstName: string;
  lastName: string;
  phone: string;
  category?: PersonCategory;
  serviceScheduleId: string;
  subClass?: string;
  userLatitude?: number;
  userLongitude?: number;
}) {
  try {
    const church = await prisma.church.findFirst();
    if (!church) {
      return { success: false, error: 'Church not found.' };
    }

    // Clean phone number and get last 4 digits
    const cleanPhone = phone.trim().replace(/\s+/g, '');
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
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          phone: cleanPhone,
          phoneLast4: phoneLast4,
          category,
          subCategory: category === PersonCategory.YOUTH ? 'YOUTH' : 'ADULT',
          status: PersonStatus.FIRST_TIMER,
        },
      });
    }

    // Now mark their attendance using our selfCheckInAction
    const checkInResult = await selfCheckInAction({
      personId: person.id,
      serviceScheduleId,
      subClass,
      userLatitude,
      userLongitude,
    });

    return {
      ...checkInResult,
      personId: person.id,
    };
  } catch (error) {
    console.error('Error registering first timer:', error);
    return { success: false, error: 'Failed to register first timer.' };
  }
}

/**
 * 5. Quick dev helper to verify recorded attendance in DB
 */
export async function getRecentAttendanceStatsAction() {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

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
