'use server';

import { prisma } from '@/lib/prisma';
import { getActiveChurchService, getNigerianTimeInfo } from '@/lib/service-resolver';
import { CheckInMethod, PersonCategory, PersonStatus } from '@prisma/client';

/**
 * 1. Fetch church service schedules with intelligent grouping.
 * Separates Today's Schedule (e.g. Workers Meeting, 1st Service, Sunday School, 2nd Service)
 * from Other/Midweek/Special Services (Hour of Mercy, Digging Deep, Faith Clinic, etc.).
 * Also identifies if a service just finished so ushers can download its report immediately!
 */
export async function usherGetServicesAction() {
  try {
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

    // Services occurring on current day of week (accurately filtered for Thanksgiving, Hour of Mercy, etc.)
    const todayServices = activeRes.todayServices;
    const otherServices = services.filter((s) => !todayServices.some((ts) => ts.id === s.id));

    const defaultServiceId =
      activeRes.activeService?.id ||
      (todayServices.length > 0 ? todayServices[0].id : services[0]?.id || '');

    // Check if any service just finished recently today
    const currentMins = (() => {
      const [h, m] = ngInfo.currentTimeString.split(':').map(Number);
      return h * 60 + m;
    })();

    let justFinishedService = null;
    for (const svc of todayServices) {
      const [eh, em] = svc.endTime.split(':').map(Number);
      const endMins = eh * 60 + em;
      // Ended within the last 120 minutes
      if (currentMins >= endMins && currentMins - endMins <= 120) {
        justFinishedService = svc;
      }
    }

    return {
      success: true,
      church: {
        id: church.id,
        name: church.name,
      },
      services,
      todayServices,
      otherServices,
      activeService: activeRes.activeService || null,
      activeServiceId: defaultServiceId,
      justFinishedService,
      currentDay: ngInfo.weekday,
      isLiveNow: activeRes.isLiveNow,
      nigerianTimeFormatted: activeRes.nigerianTimeFormatted,
      nextUpcomingService: activeRes.nextUpcomingService,
    };
  } catch (error) {
    console.error('Error getting usher services:', error);
    return { success: false, error: 'Failed to fetch services.' };
  }
}

/**
 * 2. Get the full member roster sorted alphabetically (A-Z)
 * Joined with today's attendance status, arrival time, and demographic subCategory.
 */
export async function usherGetRosterAction(serviceScheduleId?: string) {
  try {
    const church = await prisma.church.findFirst();
    if (!church) {
      return { success: false, error: 'Church not found.' };
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

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
 * 3. Search members by first name, last name, or phone number.
 */
export async function usherSearchMembersAction(query: string) {
  try {
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
  serviceScheduleId,
  subClass,
  usherUserId,
}: {
  personId: string;
  serviceScheduleId: string;
  subClass?: string;
  usherUserId?: string;
}) {
  try {
    const church = await prisma.church.findFirst();
    if (!church) {
      return { success: false, error: 'Church not found.' };
    }

    // Strict Guard: Attendance marking is ONLY active when a service is live right now!
    const activeRes = await getActiveChurchService(church.id, new Date());
    if (!activeRes.isLiveNow || !activeRes.activeService) {
      return {
        success: false,
        error: 'No church service is currently live. Attendance marking only opens during official service hours.',
      };
    }

    const targetService = activeRes.activeService;
    let actualServiceId = targetService.id;
    let actualServiceName = targetService.name;
    let isEarlyArrival = false;

    // Intelligent check: Workers' Meeting is strictly for workers.
    // If an usher marks an Adult or Youth (non-worker) during Workers' Meeting,
    // route their attendance to First Service (or Thanksgiving Service) so Workers' Meeting remains pure!
    if (targetService.name.toLowerCase().includes('workers')) {
      const person = await prisma.person.findUnique({ where: { id: personId } });
      if (person) {
        const isWorker =
          person.category === 'WORKER' ||
          person.subCategory === 'WORKER' ||
          person.subCategory === 'YOUTH_WORKER' ||
          person.subCategory === 'ADULT_WORKER';

        if (!isWorker) {
          const nextService = await prisma.serviceSchedule.findFirst({
            where: {
              churchId: church.id,
              dayOfWeek: targetService.dayOfWeek,
              startTime: { gt: targetService.startTime },
            },
            orderBy: { startTime: 'asc' },
          });

          if (nextService) {
            actualServiceId = nextService.id;
            actualServiceName = nextService.name;
            isEarlyArrival = true;
          }
        }
      }
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

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
        message: isEarlyArrival
          ? `${existing.person.firstName} ${existing.person.lastName} is already checked in as an early arrival for ${actualServiceName} at ${existingTime}!`
          : `${existing.person.firstName} ${existing.person.lastName} is already marked present for ${actualServiceName} at ${existingTime}!`,
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
      isEarlyArrival,
      serviceName: actualServiceName,
      message: isEarlyArrival
        ? `Early Arrival: ${record.person.firstName} ${record.person.lastName} logged for ${actualServiceName} (Non-Worker).`
        : `Marked present at ${timeFormatted}: ${record.person.firstName} ${record.person.lastName} (${record.serviceSchedule.name})`,
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
    const cleanPhone = newPhone.trim().replace(/\s+/g, '');
    if (cleanPhone.length < 7) {
      return { success: false, error: 'Invalid phone number.' };
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
 * 6. Get today's attendance live list and breakdown counts for the selected service.
 */
export async function usherGetTodayAttendanceAction(serviceScheduleId?: string) {
  try {
    const church = await prisma.church.findFirst();
    if (!church) {
      return { success: false, error: 'Church not found.' };
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

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

    const totalWorkers = records.filter(
      (r) =>
        r.person?.category === 'WORKER' ||
        r.person?.subCategory === 'WORKER' ||
        r.person?.subCategory === 'YOUTH_WORKER' ||
        r.person?.subCategory === 'ADULT_WORKER'
    ).length;

    const totalYouth = records.filter(
      (r) =>
        (r.person?.category === 'YOUTH' || r.person?.subCategory === 'YOUTH') &&
        r.person?.category !== 'WORKER' &&
        r.person?.subCategory !== 'WORKER' &&
        r.person?.subCategory !== 'YOUTH_WORKER'
    ).length;

    const totalAdults = records.filter(
      (r) =>
        (r.person?.category === 'ADULT' || r.person?.subCategory === 'ADULT') &&
        r.person?.category !== 'WORKER' &&
        r.person?.subCategory !== 'WORKER' &&
        r.person?.subCategory !== 'ADULT_WORKER'
    ).length;

    const youthSundaySchool = records.filter(
      (r) =>
        r.subClass === 'YOUTH' ||
        (r.serviceSchedule?.hasSubClasses &&
          (r.person?.category === 'YOUTH' || r.person?.subCategory === 'YOUTH' || r.person?.subCategory === 'YOUTH_WORKER'))
    ).length;

    const adultSundaySchool = records.filter(
      (r) =>
        r.subClass === 'ADULT' ||
        (r.serviceSchedule?.hasSubClasses &&
          (r.person?.category === 'ADULT' ||
            r.person?.subCategory === 'ADULT' ||
            r.person?.category === 'WORKER' ||
            r.person?.subCategory === 'ADULT_WORKER'))
    ).length;

    const totalFirstTimers = records.filter((r) => r.person?.status === 'FIRST_TIMER').length;

    return {
      success: true,
      count: records.length,
      counts: {
        total: records.length,
        workers: totalWorkers,
        youth: totalYouth,
        adults: totalAdults,
        youthSundaySchool,
        adultSundaySchool,
        firstTimers: totalFirstTimers,
      },
      records,
    };
  } catch (error) {
    console.error('Error fetching today attendance:', error);
    return { success: false, error: 'Failed to fetch attendance.' };
  }
}

/**
 * 7. Usher registers a person (Existing Member or First-Timer).
 * Demographic roles supported: Worker, Youth, Adult.
 * Phone number is completely OPTIONAL.
 */
export async function usherRegisterPersonAction({
  firstName,
  lastName = '',
  phone = '',
  roleType = 'ADULT',
  status = PersonStatus.MEMBER,
  serviceScheduleId,
  usherUserId,
}: {
  firstName: string;
  lastName?: string;
  phone?: string;
  roleType?: 'WORKER' | 'YOUTH' | 'ADULT' | 'YOUTH_WORKER' | 'ADULT_WORKER';
  status?: PersonStatus;
  serviceScheduleId?: string;
  usherUserId?: string;
}) {
  try {
    const church = await prisma.church.findFirst();
    if (!church) {
      return { success: false, error: 'Church not found.' };
    }

    const trimmedFirst = firstName.trim();
    if (!trimmedFirst) {
      return { success: false, error: 'First name is required.' };
    }

    let cleanPhone = (phone || '').trim().replace(/\s+/g, '');
    let phoneLast4 = 'NONE';

    if (cleanPhone.length > 0) {
      if (cleanPhone.length < 7) {
        return { success: false, error: 'Please enter a valid phone number (or leave empty if no phone).' };
      }
      phoneLast4 = cleanPhone.slice(-4);
    } else {
      cleanPhone = 'NO-PHONE';
      phoneLast4 = 'NONE';
    }

    // Map demographic roleType: Worker covers both youth and adult workers
    let category: PersonCategory = PersonCategory.ADULT;
    let subCategory = roleType;

    if (roleType === 'WORKER' || roleType === 'YOUTH_WORKER' || roleType === 'ADULT_WORKER') {
      category = PersonCategory.WORKER;
      subCategory = 'WORKER';
    } else if (roleType === 'YOUTH') {
      category = PersonCategory.YOUTH;
      subCategory = 'YOUTH';
    } else {
      category = PersonCategory.ADULT;
      subCategory = 'ADULT';
    }

    // Create the person
    const person = await prisma.person.create({
      data: {
        churchId: church.id,
        firstName: trimmedFirst,
        lastName: (lastName || '').trim(),
        phone: cleanPhone,
        phoneLast4,
        category,
        subCategory,
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
      message: `Successfully registered ${person.firstName} ${person.lastName || ''} into the church database.`,
    };
  } catch (error) {
    console.error('Error in usher registering person:', error);
    return { success: false, error: 'Failed to add person to database.' };
  }
}

/**
 * 8. Query historical attendance records by date and/or service.
 * Allows viewing and downloading past attendance sheets (e.g. past Sundays, Hour of Mercy, etc.)
 */
export async function usherGetAttendanceHistoryAction({
  targetDate,
  serviceScheduleId,
}: {
  targetDate?: string; // YYYY-MM-DD
  serviceScheduleId?: string;
}) {
  try {
    const church = await prisma.church.findFirst();
    if (!church) {
      return { success: false, error: 'Church not found.' };
    }

    const whereClause: any = {
      churchId: church.id,
    };

    if (targetDate) {
      const parsedDate = new Date(targetDate);
      parsedDate.setHours(0, 0, 0, 0);
      whereClause.date = parsedDate;
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

    const totalWorkers = records.filter(
      (r) =>
        r.person?.category === 'WORKER' ||
        r.person?.subCategory === 'WORKER' ||
        r.person?.subCategory === 'YOUTH_WORKER' ||
        r.person?.subCategory === 'ADULT_WORKER'
    ).length;

    const totalYouth = records.filter(
      (r) =>
        (r.person?.category === 'YOUTH' || r.person?.subCategory === 'YOUTH') &&
        r.person?.category !== 'WORKER' &&
        r.person?.subCategory !== 'WORKER' &&
        r.person?.subCategory !== 'YOUTH_WORKER'
    ).length;

    const totalAdults = records.filter(
      (r) =>
        (r.person?.category === 'ADULT' || r.person?.subCategory === 'ADULT') &&
        r.person?.category !== 'WORKER' &&
        r.person?.subCategory !== 'WORKER' &&
        r.person?.subCategory !== 'ADULT_WORKER'
    ).length;

    const youthSundaySchool = records.filter(
      (r) =>
        r.subClass === 'YOUTH' ||
        (r.serviceSchedule?.hasSubClasses &&
          (r.person?.category === 'YOUTH' || r.person?.subCategory === 'YOUTH' || r.person?.subCategory === 'YOUTH_WORKER'))
    ).length;

    const adultSundaySchool = records.filter(
      (r) =>
        r.subClass === 'ADULT' ||
        (r.serviceSchedule?.hasSubClasses &&
          (r.person?.category === 'ADULT' ||
            r.person?.subCategory === 'ADULT' ||
            r.person?.category === 'WORKER' ||
            r.person?.subCategory === 'ADULT_WORKER'))
    ).length;

    const totalFirstTimers = records.filter((r) => r.person?.status === 'FIRST_TIMER').length;

    return {
      success: true,
      records,
      count: records.length,
      counts: {
        total: records.length,
        workers: totalWorkers,
        youth: totalYouth,
        adults: totalAdults,
        youthSundaySchool,
        adultSundaySchool,
        firstTimers: totalFirstTimers,
      },
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
  workersCount: number;
  youthCount: number;
  adultCount: number;
  adultSundaySchoolCount: number;
  youthSundaySchoolCount: number;
  firstTimersCount: number;
  records: any[];
}

/**
 * 9. Get Today's Completed Services & Live Attendance Breakdown.
 * Returns each service scheduled for today along with its attendee count,
 * subcategory numbers (Workers, Adult Sunday School, Youth Sunday School, First-Timers),
 * and individual attendance records for download/viewing.
 * When midnight passes to the next day, today's list clears automatically and joins History.
 */
export async function usherGetTodayServicesSummaryAction() {
  try {
    const church = await prisma.church.findFirst();
    if (!church) {
      return { success: false, error: 'Church not found.' };
    }

    const ngInfo = getNigerianTimeInfo(new Date());
    const today = new Date();
    today.setHours(0, 0, 0, 0);

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

    // Services scheduled for today (auto-resolved from activeRes: Thanksgiving Sunday, regular Sunday, Hour of Mercy, etc.)
    const filteredSchedules = activeRes.todayServices;

    // Build report item for each service of today
    const servicesReport: TodayServiceReportItem[] = filteredSchedules.map((svc) => {
      const svcRecords = todayRecords.filter((r) => r.serviceScheduleId === svc.id);

      const [sh, sm] = svc.startTime.split(':').map(Number);
      const [eh, em] = svc.endTime.split(':').map(Number);
      const startMins = sh * 60 + sm;
      const endMins = eh * 60 + em;

      let status: 'LIVE' | 'CONCLUDED' | 'UPCOMING' = 'UPCOMING';
      if (activeRes.isLiveNow && activeRes.activeService?.id === svc.id) {
        status = 'LIVE';
      } else if (currentMins >= endMins || svcRecords.length > 0) {
        status = 'CONCLUDED';
      }

      const workersCount = svcRecords.filter(
        (r) =>
          r.person?.category === 'WORKER' ||
          r.person?.subCategory === 'WORKER' ||
          r.person?.subCategory === 'YOUTH_WORKER' ||
          r.person?.subCategory === 'ADULT_WORKER'
      ).length;

      const youthCount = svcRecords.filter(
        (r) =>
          (r.person?.category === 'YOUTH' || r.person?.subCategory === 'YOUTH') &&
          r.person?.category !== 'WORKER' &&
          r.person?.subCategory !== 'WORKER' &&
          r.person?.subCategory !== 'YOUTH_WORKER'
      ).length;

      const adultCount = svcRecords.filter(
        (r) =>
          (r.person?.category === 'ADULT' || r.person?.subCategory === 'ADULT') &&
          r.person?.category !== 'WORKER' &&
          r.person?.subCategory !== 'WORKER' &&
          r.person?.subCategory !== 'ADULT_WORKER'
      ).length;

      const adultSundaySchoolCount = svcRecords.filter(
        (r) =>
          r.subClass === 'ADULT' ||
          r.person?.subCategory === 'ADULT' ||
          r.person?.subCategory === 'ADULT_WORKER' ||
          r.person?.category === 'ADULT' ||
          r.person?.category === 'WORKER'
      ).length;

      const youthSundaySchoolCount = svcRecords.filter(
        (r) =>
          r.subClass === 'YOUTH' ||
          r.person?.subCategory === 'YOUTH' ||
          r.person?.subCategory === 'YOUTH_WORKER' ||
          r.person?.category === 'YOUTH'
      ).length;

      const firstTimersCount = svcRecords.filter((r) => r.person?.status === 'FIRST_TIMER').length;

      return {
        id: svc.id,
        name: svc.name,
        startTime: svc.startTime,
        endTime: svc.endTime,
        hasSubClasses: svc.hasSubClasses,
        status,
        totalCount: svcRecords.length,
        workersCount,
        youthCount,
        adultCount,
        adultSundaySchoolCount,
        youthSundaySchoolCount,
        firstTimersCount,
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


