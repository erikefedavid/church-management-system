'use server';

import { prisma } from '@/lib/prisma';
import {
  getActiveChurchService,
  getNigerianTimeInfo,
  getNigerianDateMidnight,
  parseDateStringToMidnight,
} from '@/lib/service-resolver';
import { CheckInMethod, PersonCategory, PersonStatus } from '@prisma/client';
import { requireStaffSession } from './auth';

function computeYouthCounts(records: any[]) {
  const firstTimers = records.filter((r) => r.person?.status === 'FIRST_TIMER').length;
  const members = records.length - firstTimers;
  return {
    total: records.length,
    members,
    firstTimers,
  };
}

/**
 * 1. Fetch church service schedules with intelligent grouping.
 * Separates Today's Schedule from Other/Midweek/Special Services.
 * Also identifies if a service just finished so ushers can download its report immediately.
 */
export async function usherGetServicesAction() {
  try {
    const auth = await requireStaffSession(['USHER', 'ADMIN']);
    if (!auth.authorized) {
      return { success: false, error: auth.error || 'Unauthorized staff access.' };
    }

    const church = await prisma.church.findFirst();
    if (!church) {
      return { success: false, error: 'Church not found. Please run seed script.' };
    }

    const services = await prisma.serviceSchedule.findMany({
      where: { churchId: church.id },
      orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }],
    });

    // Determine current active and today's services based on West Africa Time
    const activeRes = await getActiveChurchService(church.id, new Date());
    const ngInfo = getNigerianTimeInfo(new Date());

    const todayServices = activeRes.todayServices;
    const otherServices = services.filter((s) => !todayServices.some((ts) => ts.id === s.id));

    const currentMins = (() => {
      const [h, m] = ngInfo.currentTimeString.split(':').map(Number);
      return h * 60 + m;
    })();

    let justFinishedService = null;
    let latestCompletedService = null;
    let usherGraceService = null;
    for (const svc of todayServices) {
      const [eh, em] = svc.endTime.split(':').map(Number);
      const endMins = eh * 60 + em;
      if (currentMins >= endMins) {
        latestCompletedService = svc;
        // Ushers get 30 minutes after service endTime to mark latecomers
        if (currentMins - endMins <= 30) {
          usherGraceService = svc;
        }
        // Ended within the last 120 minutes (for report download)
        if (currentMins - endMins <= 120) {
          justFinishedService = svc;
        }
      }
    }

    const usherCanMark = Boolean(activeRes.isLiveNow && activeRes.activeService) || Boolean(usherGraceService);
    const effectiveActiveService = activeRes.activeService || usherGraceService || null;

    const defaultServiceId =
      effectiveActiveService?.id ||
      justFinishedService?.id ||
      latestCompletedService?.id ||
      (todayServices.length > 0 ? todayServices[0].id : services[0]?.id || '');

    return {
      success: true,
      church: {
        id: church.id,
        name: church.name,
      },
      services,
      todayServices,
      otherServices,
      activeService: effectiveActiveService,
      activeServiceId: defaultServiceId,
      justFinishedService,
      currentDay: ngInfo.weekday,
      isLiveNow: usherCanMark,
      isUsherGrace: !activeRes.isLiveNow && Boolean(usherGraceService),
      nigerianTimeFormatted: activeRes.nigerianTimeFormatted,
      nextUpcomingService: activeRes.nextUpcomingService,
    };
  } catch (error) {
    console.error('Error getting usher services:', error);
    return { success: false, error: 'Failed to fetch services.' };
  }
}

/**
 * 2. Get the full Youth roster sorted alphabetically (A-Z)
 * Joined with today's attendance status and arrival time (WAT).
 */
export async function usherGetRosterAction(serviceScheduleId?: string) {
  try {
    const auth = await requireStaffSession(['USHER', 'ADMIN']);
    if (!auth.authorized) {
      return { success: false, error: auth.error || 'Unauthorized staff access.' };
    }

    const church = await prisma.church.findFirst();
    if (!church) {
      return { success: false, error: 'Church not found.' };
    }

    const today = getNigerianDateMidnight();

    // Fetch all active members ordered alphabetically A to Z
    const people = await prisma.person.findMany({
      where: {
        churchId: church.id,
        isActive: true,
      },
      orderBy: [
        { firstName: 'asc' },
        { lastName: 'asc' },
      ],
    });

    // Map today's attendance records for the selected service
    const attendanceMap = new Map<string, { id: string; time: string; method: string }>();

    if (serviceScheduleId) {
      const records = await prisma.attendanceRecord.findMany({
        where: {
          churchId: church.id,
          serviceScheduleId,
          date: today,
        },
      });

      for (const r of records) {
        const timeFormatted = new Date(r.createdAt).toLocaleTimeString('en-US', {
          timeZone: 'Africa/Lagos',
          hour: '2-digit',
          minute: '2-digit',
          hour12: true,
        });
        attendanceMap.set(r.personId, {
          id: r.id,
          time: timeFormatted,
          method: r.method,
        });
      }
    }

    const roster = people.map((p) => {
      const att = attendanceMap.get(p.id);
      return {
        id: p.id,
        firstName: p.firstName,
        lastName: p.lastName,
        phone: p.phone,
        phoneLast4: p.phoneLast4,
        category: p.category,
        subCategory: p.subCategory || null,
        status: p.status,
        isCheckedIn: !!att,
        checkInTime: att?.time || null,
        checkInMethod: att?.method || null,
      };
    });

    return {
      success: true,
      roster,
      totalMembers: people.length,
      checkedInCount: attendanceMap.size,
    };
  } catch (error) {
    console.error('Error fetching usher roster:', error);
    return { success: false, error: 'Failed to fetch church roster.' };
  }
}

/**
 * 3. Search Youth members by first name, last name, or phone number.
 */
export async function usherSearchMembersAction(query: string) {
  try {
    const auth = await requireStaffSession(['USHER', 'ADMIN']);
    if (!auth.authorized) {
      return { success: false, error: auth.error || 'Unauthorized staff access.' };
    }

    const trimmed = query.trim();
    if (!trimmed || trimmed.length < 2) {
      return { success: true, members: [] };
    }

    const church = await prisma.church.findFirst();
    if (!church) {
      return { success: false, error: 'Church not found.' };
    }

    const members = await prisma.person.findMany({
      where: {
        churchId: church.id,
        isActive: true,
        OR: [
          { firstName: { contains: trimmed, mode: 'insensitive' } },
          { lastName: { contains: trimmed, mode: 'insensitive' } },
          { phone: { contains: trimmed } },
          { phoneLast4: { contains: trimmed } },
        ],
      },
      take: 25,
      orderBy: [
        { firstName: 'asc' },
        { lastName: 'asc' },
      ],
    });

    return { success: true, members };
  } catch (error) {
    console.error('Error searching members:', error);
    return { success: false, error: 'Failed to search members.' };
  }
}

/**
 * 4. Usher marks attendance manually for a person.
 * Returns exact arrival time (WAT) and updates record.
 */
export async function usherCheckInAction({
  personId,
  subClass,
  usherUserId,
}: {
  personId: string;
  serviceScheduleId: string;
  subClass?: string;
  usherUserId?: string;
}) {
  try {
    const auth = await requireStaffSession(['USHER', 'ADMIN']);
    if (!auth.authorized) {
      return { success: false, error: auth.error || 'Unauthorized staff access.' };
    }

    const church = await prisma.church.findFirst();
    if (!church) {
      return { success: false, error: 'Church not found.' };
    }

    // Ushers can mark during live service (including 20m buffer) OR up to 30m after service endTime
    const activeRes = await getActiveChurchService(church.id, new Date());
    let targetService = activeRes.activeService;

    if (!activeRes.isLiveNow || !targetService) {
      const ngInfo = getNigerianTimeInfo(new Date());
      const [ch, cm] = ngInfo.currentTimeString.split(':').map(Number);
      const currentMins = ch * 60 + cm;

      for (const svc of activeRes.todayServices) {
        const [eh, em] = svc.endTime.split(':').map(Number);
        const endMins = eh * 60 + em;
        if (currentMins >= endMins && currentMins - endMins <= 30) {
          targetService = svc;
        }
      }
    }

    if (!targetService) {
      return {
        success: false,
        error: 'Service grace window (30 mins) has ended. Attendance marking is now closed.',
      };
    }
    const actualServiceId = targetService.id;
    const actualServiceName = targetService.name;
    const today = getNigerianDateMidnight();

    // Check if already checked in today for this service
    const existing = await prisma.attendanceRecord.findFirst({
      where: {
        personId,
        serviceScheduleId: actualServiceId,
        date: today,
      },
      include: { person: true, serviceSchedule: true },
    });

    if (existing) {
      const existingTime = new Date(existing.createdAt).toLocaleTimeString('en-US', {
        timeZone: 'Africa/Lagos',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
      });
      return {
        success: true,
        alreadyCheckedIn: true,
        checkInTime: existingTime,
        message: `${existing.person.firstName} ${existing.person.lastName} is already marked present for ${actualServiceName} at ${existingTime}!`,
      };
    }

    const record = await prisma.attendanceRecord.create({
      data: {
        churchId: church.id,
        personId,
        serviceScheduleId: actualServiceId,
        date: today,
        subClass: subClass || null,
        method: CheckInMethod.USHER_MANUAL,
        usherId: usherUserId || null,
      },
      include: {
        person: true,
        serviceSchedule: true,
      },
    });

    const timeFormatted = new Date(record.createdAt).toLocaleTimeString('en-US', {
      timeZone: 'Africa/Lagos',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });

    return {
      success: true,
      alreadyCheckedIn: false,
      checkInTime: timeFormatted,
      serviceName: actualServiceName,
      message: `Marked present at ${timeFormatted}: ${record.person.firstName} ${record.person.lastName} (${record.serviceSchedule.name})`,
    };
  } catch (error) {
    console.error('Error during usher check-in:', error);
    return { success: false, error: 'Failed to mark attendance.' };
  }
}

/**
 * 5. Update a member's phone number when they change SIM cards.
 */
export async function usherUpdatePhoneAction({
  personId,
  newPhone,
}: {
  personId: string;
  newPhone: string;
}) {
  try {
    const auth = await requireStaffSession(['USHER', 'ADMIN']);
    if (!auth.authorized) {
      return { success: false, error: auth.error || 'Unauthorized staff access.' };
    }

    const cleanPhone = (newPhone || '').trim().replace(/\D/g, '');
    if (cleanPhone.length < 7) {
      return { success: false, error: 'Invalid phone number.' };
    }
    if (cleanPhone.length > 11) {
      return { success: false, error: 'Phone number cannot be more than 11 digits.' };
    }

    const phoneLast4 = cleanPhone.slice(-4);

    const updated = await prisma.person.update({
      where: { id: personId },
      data: {
        phone: cleanPhone,
        phoneLast4,
      },
    });

    return {
      success: true,
      message: `Updated phone number for ${updated.firstName}. New last 4 digits: ${updated.phoneLast4}`,
      updatedPerson: updated,
    };
  } catch (error) {
    console.error('Error updating phone number:', error);
    return { success: false, error: 'Failed to update phone number.' };
  }
}

/**
 * 6. Get today's attendance live list and Youth counts for the selected service.
 */
export async function usherGetTodayAttendanceAction(serviceScheduleId?: string) {
  try {
    const auth = await requireStaffSession(['USHER', 'ADMIN']);
    if (!auth.authorized) {
      return { success: false, error: auth.error || 'Unauthorized staff access.' };
    }

    const church = await prisma.church.findFirst();
    if (!church) {
      return { success: false, error: 'Church not found.' };
    }

    const today = getNigerianDateMidnight();

    const whereClause: any = {
      churchId: church.id,
      date: today,
    };

    if (serviceScheduleId) {
      whereClause.serviceScheduleId = serviceScheduleId;
    }

    const records = await prisma.attendanceRecord.findMany({
      where: whereClause,
      include: {
        person: true,
        serviceSchedule: true,
        usher: {
          select: { name: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return {
      success: true,
      count: records.length,
      counts: computeYouthCounts(records),
      records,
    };
  } catch (error) {
    console.error('Error fetching today attendance:', error);
    return { success: false, error: 'Failed to fetch attendance.' };
  }
}

/**
 * 7. Usher registers a Youth Member or First-Timer.
 * Phone number is completely OPTIONAL.
 */
export async function usherRegisterPersonAction({
  firstName,
  lastName = '',
  phone = '',
  status = PersonStatus.MEMBER,
  serviceScheduleId,
  usherUserId,
}: {
  firstName: string;
  lastName?: string;
  phone?: string;
  roleType?: 'YOUTH';
  status?: PersonStatus;
  serviceScheduleId?: string;
  usherUserId?: string;
}) {
  try {
    const auth = await requireStaffSession(['USHER', 'ADMIN']);
    if (!auth.authorized) {
      return { success: false, error: auth.error || 'Unauthorized staff access.' };
    }

    const church = await prisma.church.findFirst();
    if (!church) {
      return { success: false, error: 'Church not found.' };
    }

    const trimmedFirst = firstName.trim();
    if (!trimmedFirst) {
      return { success: false, error: 'First name is required.' };
    }

    let cleanPhone = (phone || '').trim().replace(/\D/g, '');
    let phoneLast4 = 'NONE';

    if (cleanPhone.length > 0) {
      if (cleanPhone.length < 7) {
        return { success: false, error: 'Please enter a valid phone number (or leave empty if no phone).' };
      }
      if (cleanPhone.length > 11) {
        return { success: false, error: 'Phone number cannot be more than 11 digits.' };
      }
      phoneLast4 = cleanPhone.slice(-4);
    } else {
      cleanPhone = 'NO-PHONE';
      phoneLast4 = 'NONE';
    }

    const person = await prisma.person.create({
      data: {
        churchId: church.id,
        firstName: trimmedFirst,
        lastName: (lastName || '').trim(),
        phone: cleanPhone,
        phoneLast4,
        category: PersonCategory.YOUTH,
        subCategory: 'YOUTH',
        status,
      },
    });

    // If an active service was selected, automatically mark attendance as well
    let checkInTime: string | null = null;
    if (serviceScheduleId) {
      const checkInRes = await usherCheckInAction({
        personId: person.id,
        serviceScheduleId,
        usherUserId,
      });
      if (checkInRes.success && checkInRes.checkInTime) {
        checkInTime = checkInRes.checkInTime;
      }
    }

    return {
      success: true,
      person,
      checkInTime,
      message: `Successfully registered ${person.firstName} ${person.lastName || ''} into the Youth roster.`,
    };
  } catch (error) {
    console.error('Error in usher registering person:', error);
    return { success: false, error: 'Failed to add person to database.' };
  }
}

/**
 * 8. Query historical attendance records by date and/or service.
 */
export async function usherGetAttendanceHistoryAction({
  targetDate,
  serviceScheduleId,
}: {
  targetDate?: string; // YYYY-MM-DD
  serviceScheduleId?: string;
}) {
  try {
    const auth = await requireStaffSession(['USHER', 'ADMIN']);
    if (!auth.authorized) {
      return { success: false, error: auth.error || 'Unauthorized staff access.' };
    }

    const church = await prisma.church.findFirst();
    if (!church) {
      return { success: false, error: 'Church not found.' };
    }

    const whereClause: any = {
      churchId: church.id,
    };

    if (targetDate) {
      whereClause.date = parseDateStringToMidnight(targetDate);
    }

    if (serviceScheduleId) {
      whereClause.serviceScheduleId = serviceScheduleId;
    }

    const records = await prisma.attendanceRecord.findMany({
      where: whereClause,
      include: {
        person: true,
        serviceSchedule: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });

    return {
      success: true,
      records,
      count: records.length,
      counts: computeYouthCounts(records),
    };
  } catch (error) {
    console.error('Error fetching attendance history:', error);
    return { success: false, error: 'Failed to fetch attendance history.' };
  }
}

export interface TodayServiceReportItem {
  id: string;
  name: string;
  startTime: string;
  endTime: string;
  hasSubClasses: boolean;
  status: 'LIVE' | 'CONCLUDED' | 'UPCOMING';
  totalCount: number;
  membersCount: number;
  firstTimersCount: number;
  records: any[];
}

/**
 * 9. Get Today's Completed Services & Live Youth Attendance Breakdown.
 */
export async function usherGetTodayServicesSummaryAction() {
  try {
    const auth = await requireStaffSession(['USHER', 'ADMIN']);
    if (!auth.authorized) {
      return { success: false, error: auth.error || 'Unauthorized staff access.' };
    }

    const church = await prisma.church.findFirst();
    if (!church) {
      return { success: false, error: 'Church not found.' };
    }

    const ngInfo = getNigerianTimeInfo(new Date());
    const today = getNigerianDateMidnight();

    const activeRes = await getActiveChurchService(church.id, new Date());

    // Fetch all attendance records logged today
    const todayRecords = await prisma.attendanceRecord.findMany({
      where: {
        churchId: church.id,
        date: today,
      },
      include: {
        person: true,
        serviceSchedule: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    const [curH, curM] = ngInfo.currentTimeString.split(':').map(Number);
    const currentMins = curH * 60 + curM;

    const filteredSchedules = activeRes.todayServices;

    const servicesReport: TodayServiceReportItem[] = filteredSchedules.map((svc) => {
      const svcRecords = todayRecords.filter((r) => r.serviceScheduleId === svc.id);

      const [, ] = svc.startTime.split(':').map(Number);
      const [eh, em] = svc.endTime.split(':').map(Number);
      const endMins = eh * 60 + em;

      let status: 'LIVE' | 'CONCLUDED' | 'UPCOMING' = 'UPCOMING';
      if (activeRes.isLiveNow && activeRes.activeService?.id === svc.id) {
        status = 'LIVE';
      } else if (currentMins >= endMins || svcRecords.length > 0) {
        status = 'CONCLUDED';
      }

      const counts = computeYouthCounts(svcRecords);

      return {
        id: svc.id,
        name: svc.name,
        startTime: svc.startTime,
        endTime: svc.endTime,
        hasSubClasses: svc.hasSubClasses,
        status,
        totalCount: counts.total,
        membersCount: counts.members,
        firstTimersCount: counts.firstTimers,
        records: svcRecords,
      };
    });

    return {
      success: true,
      currentDay: ngInfo.weekday,
      currentTime: ngInfo.currentTimeString,
      isLiveNow: activeRes.isLiveNow,
      activeService: activeRes.activeService,
      nextUpcomingService: activeRes.nextUpcomingService,
      services: servicesReport,
      allTodayRecords: todayRecords,
    };
  } catch (error) {
    console.error('Error getting today services summary:', error);
    return { success: false, error: 'Failed to fetch today services summary.' };
  }
}
