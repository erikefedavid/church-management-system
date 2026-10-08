'use server';

import { prisma } from '@/lib/prisma';
import { PersonStatus, CheckInMethod, DayOfWeek } from '@prisma/client';
import { getNigerianTimeInfo, getActiveChurchService } from '@/lib/service-resolver';

export interface ServiceScorecard {
  id: string;
  name: string;
  startTime: string;
  endTime: string;
  dayOfWeek?: DayOfWeek;
  totalPresent: number;
  adultCount?: number;
  youthCount?: number;
  workersCount?: number;
  adultSundaySchoolCount?: number;
  youthSundaySchoolCount?: number;
  firstTimersCount?: number;
  hasSubClasses: boolean;
  status: 'LIVE' | 'CONCLUDED' | 'UPCOMING';
  records: any[];
}

export interface FirstTimerEntry {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
  serviceName: string;
  timeString: string;
  category: string;
}

export type AdminTimeRange = 'TODAY' | 'CUSTOM_DATE' | '1_MONTH' | '3_MONTHS' | '6_MONTHS' | '1_YEAR';

export interface CategoryBreakdown {
  totalWorkers: number;
  totalYouth: number;
  totalAdults: number;
  youthSundaySchool: number;
  adultSundaySchool: number;
  totalFirstTimers: number;
}

export interface DayTrendPoint {
  dateKey: string;
  formattedDate: string;
  count: number;
}

export interface AdminScorecardResponse {
  success: boolean;
  error?: string;
  churchName?: string;
  todayDateString?: string;
  activeDateFormatted?: string;
  activeDateISO?: string;
  timeRangeLabel?: string;
  isLiveNow?: boolean;
  activeService?: {
    id: string;
    name: string;
    startTime: string;
    endTime: string;
  } | null;
  totalUniqueAttendees?: number;
  totalFirstTimers?: number;
  selfScanPercentage?: number;
  categoryBreakdown?: CategoryBreakdown;
  servicesBreakdown?: ServiceScorecard[];
  firstTimersList?: FirstTimerEntry[];
  recentAttendanceRecords?: any[];
  trendHistory?: DayTrendPoint[];
}

/**
 * Computes live Sunday or historical (specific date, 1m, 3m, 6m, 1yr) attendance statistics for leadership.
 */
export async function getAdminScorecardAction(
  timeRange: AdminTimeRange = 'TODAY',
  customDate?: string // YYYY-MM-DD
): Promise<AdminScorecardResponse> {
  try {
    const church = await prisma.church.findFirst();
    if (!church) {
      return { success: false, error: 'No church found.' };
    }

    const now = new Date();
    const today = new Date(now);
    today.setHours(0, 0, 0, 0);

    let tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const ngInfo = getNigerianTimeInfo(now);
    const activeRes = await getActiveChurchService(church.id, now);

    let startDate = today;
    let timeRangeLabel = 'Today';
    let targetDayOfWeek: DayOfWeek = ngInfo.weekday;

    if (customDate) {
      const parsed = new Date(customDate);
      parsed.setHours(0, 0, 0, 0);
      startDate = parsed;
      const parsedEnd = new Date(parsed);
      parsedEnd.setDate(parsedEnd.getDate() + 1);
      tomorrow = parsedEnd;

      const dayNames: DayOfWeek[] = [
        'SUNDAY',
        'MONDAY',
        'TUESDAY',
        'WEDNESDAY',
        'THURSDAY',
        'FRIDAY',
        'SATURDAY',
      ];
      targetDayOfWeek = dayNames[parsed.getDay()];
      timeRangeLabel = `Date: ${parsed.toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })}`;
    } else if (timeRange === '1_MONTH') {
      startDate = new Date(today);
      startDate.setDate(startDate.getDate() - 30);
      timeRangeLabel = 'Past 30 Days (1 Month)';
    } else if (timeRange === '3_MONTHS') {
      startDate = new Date(today);
      startDate.setDate(startDate.getDate() - 90);
      timeRangeLabel = 'Past 3 Months (Quarterly)';
    } else if (timeRange === '6_MONTHS') {
      startDate = new Date(today);
      startDate.setDate(startDate.getDate() - 180);
      timeRangeLabel = 'Past 6 Months (Biannual)';
    } else if (timeRange === '1_YEAR') {
      startDate = new Date(today);
      startDate.setDate(startDate.getDate() - 365);
      timeRangeLabel = 'Past Year (Annual)';
    }

    // 1. Fetch services for this church
    const allServices = await prisma.serviceSchedule.findMany({
      where: { churchId: church.id },
      orderBy: { startTime: 'asc' },
    });

    // 2. Fetch attendance records in timeframe
    const records = await prisma.attendanceRecord.findMany({
      where: {
        churchId: church.id,
        date: {
          gte: startDate,
          lt: tomorrow,
        },
      },
      include: {
        person: true,
        serviceSchedule: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 2500,
    });

    // 3. Filter services to show based on timeframe
    let targetServices = allServices;
    if (customDate) {
      const dayServices = allServices.filter((s) => s.dayOfWeek === targetDayOfWeek);
      const serviceIdsWithRecords = new Set(records.map((r) => r.serviceScheduleId));
      const otherServices = allServices.filter(
        (s) => !dayServices.some((ds) => ds.id === s.id) && serviceIdsWithRecords.has(s.id)
      );
      targetServices = [...dayServices, ...otherServices];
    } else if (timeRange === 'TODAY') {
      // Prioritize services for today's weekday, plus any service that has attendance logged today
      const todayWeekdayServices = allServices.filter((s) => s.dayOfWeek === ngInfo.weekday);
      const serviceIdsWithRecords = new Set(records.map((r) => r.serviceScheduleId));

      let filteredToday = todayWeekdayServices;
      if (ngInfo.weekday === 'SUNDAY') {
        const isThanksgiving = activeRes.isFirstSunday;
        if (isThanksgiving) {
          filteredToday = todayWeekdayServices.filter(
            (s) =>
              s.name.toLowerCase().includes('thanksgiving') ||
              s.name.toLowerCase().includes('sunday school (thanksgiving)') ||
              s.name.toLowerCase().includes('workers')
          );
        } else {
          filteredToday = todayWeekdayServices.filter(
            (s) => !s.name.toLowerCase().includes('thanksgiving')
          );
        }
      }

      // Combine scheduled today with any non-scheduled service that has attendance today
      const otherServicesWithAttendance = allServices.filter(
        (s) => !filteredToday.some((ft) => ft.id === s.id) && serviceIdsWithRecords.has(s.id)
      );

      targetServices = [...filteredToday, ...otherServicesWithAttendance];
    } else {
      // In historical view, prioritize services that actually had attendees
      const serviceIdsWithRecords = new Set(records.map((r) => r.serviceScheduleId));
      const servicesWithAttendance = allServices.filter((s) => serviceIdsWithRecords.has(s.id));
      targetServices = servicesWithAttendance.length > 0 ? servicesWithAttendance : allServices;
    }

    // 4. Compute unique people who attended church in this window
    const uniquePersonIds = new Set(records.map((r) => r.personId));
    const totalUniqueAttendees = uniquePersonIds.size;

    // 5. Compute First-Timers captured in this timeframe
    const timeframeFirstTimers = await prisma.person.findMany({
      where: {
        churchId: church.id,
        status: PersonStatus.FIRST_TIMER,
        createdAt: {
          gte: startDate,
          lt: tomorrow,
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const firstTimersList: FirstTimerEntry[] = timeframeFirstTimers.map((ft) => {
      const attend = records.find((r) => r.personId === ft.id);
      return {
        id: ft.id,
        firstName: ft.firstName,
        lastName: ft.lastName,
        phone: ft.phone,
        serviceName: attend?.serviceSchedule.name || 'Sunday Service',
        timeString: new Date(ft.createdAt).toLocaleDateString([], {
          month: 'short',
          day: 'numeric',
        }),
        category: ft.category,
      };
    });

    // 6. Category Breakdown for Excel/Auditing (Workers, Youth, Adults, Sunday School, First-Timers)
    // A worker is a worker whether youth or adult - all united under totalWorkers
    const totalWorkers = records.filter(
      (r) =>
        r.person?.category === 'WORKER' ||
        r.person?.subCategory === 'WORKER' ||
        r.person?.subCategory === 'YOUTH_WORKER' ||
        r.person?.subCategory === 'ADULT_WORKER'
    ).length;

    // Total youth attendees (excluding workers)
    const totalYouth = records.filter(
      (r) =>
        (r.person?.category === 'YOUTH' || r.person?.subCategory === 'YOUTH') &&
        r.person?.category !== 'WORKER' &&
        r.person?.subCategory !== 'WORKER' &&
        r.person?.subCategory !== 'YOUTH_WORKER'
    ).length;

    // Total adult attendees (excluding workers)
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

    const categoryBreakdown: CategoryBreakdown = {
      totalWorkers,
      totalYouth,
      totalAdults,
      youthSundaySchool,
      adultSundaySchool,
      totalFirstTimers: timeframeFirstTimers.length,
    };

    // 7. Compute Service Breakdown
    const [curH, curM] = ngInfo.currentTimeString.split(':').map(Number);
    const currentMins = curH * 60 + curM;

    const servicesBreakdown: ServiceScorecard[] = targetServices.map((svc) => {
      const recordsForSvc = records.filter((r) => r.serviceScheduleId === svc.id);
      const totalPresent = recordsForSvc.length;

      const [sh, sm] = svc.startTime.split(':').map(Number);
      const [eh, em] = svc.endTime.split(':').map(Number);
      const endMins = eh * 60 + em;

      let status: 'LIVE' | 'CONCLUDED' | 'UPCOMING' = 'UPCOMING';
      if (timeRange === 'TODAY' && !customDate) {
        if (activeRes.isLiveNow && activeRes.activeService?.id === svc.id) {
          status = 'LIVE';
        } else if (currentMins >= endMins || totalPresent > 0) {
          status = 'CONCLUDED';
        }
      } else {
        status = 'CONCLUDED';
      }

      // Adult & Youth Sunday School counts
      const adultSundaySchoolCount = recordsForSvc.filter(
        (r) =>
          r.subClass === 'ADULT' ||
          r.person?.subCategory === 'ADULT' ||
          r.person?.subCategory === 'ADULT_WORKER' ||
          r.person?.category === 'ADULT' ||
          r.person?.category === 'WORKER'
      ).length;

      const youthSundaySchoolCount = recordsForSvc.filter(
        (r) =>
          r.subClass === 'YOUTH' ||
          r.person?.subCategory === 'YOUTH' ||
          r.person?.subCategory === 'YOUTH_WORKER' ||
          r.person?.category === 'YOUTH'
      ).length;

      const workersCount = recordsForSvc.filter(
        (r) =>
          r.person?.category === 'WORKER' ||
          r.person?.subCategory === 'WORKER' ||
          r.person?.subCategory === 'YOUTH_WORKER' ||
          r.person?.subCategory === 'ADULT_WORKER'
      ).length;

      const youthCount = recordsForSvc.filter(
        (r) =>
          (r.person?.category === 'YOUTH' || r.person?.subCategory === 'YOUTH') &&
          r.person?.category !== 'WORKER' &&
          r.person?.subCategory !== 'WORKER' &&
          r.person?.subCategory !== 'YOUTH_WORKER'
      ).length;

      const adultCount = recordsForSvc.filter(
        (r) =>
          (r.person?.category === 'ADULT' || r.person?.subCategory === 'ADULT') &&
          r.person?.category !== 'WORKER' &&
          r.person?.subCategory !== 'WORKER' &&
          r.person?.subCategory !== 'ADULT_WORKER'
      ).length;

      const firstTimersCount = recordsForSvc.filter((r) => r.person?.status === 'FIRST_TIMER').length;

      return {
        id: svc.id,
        name: svc.name,
        startTime: svc.startTime,
        endTime: svc.endTime,
        dayOfWeek: svc.dayOfWeek,
        totalPresent,
        adultCount,
        youthCount,
        workersCount,
        adultSundaySchoolCount,
        youthSundaySchoolCount,
        firstTimersCount,
        hasSubClasses: svc.hasSubClasses,
        status,
        records: recordsForSvc,
      };
    });

    // 8. Compute Self-Scan vs Usher-Manual Ratio
    const selfScanCount = records.filter((r) => r.method === CheckInMethod.QR_SELF).length;
    const selfScanPercentage = records.length > 0 ? Math.round((selfScanCount / records.length) * 100) : 0;

    // 9. Compute Daily/Sunday Trend
    const dayMap = new Map<string, { formattedDate: string; count: number }>();
    for (const rec of records) {
      const d = new Date(rec.date);
      const key = d.toISOString().slice(0, 10);
      const existing = dayMap.get(key);
      if (existing) {
        existing.count += 1;
      } else {
        dayMap.set(key, {
          formattedDate: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
          count: 1,
        });
      }
    }
    const trendHistory: DayTrendPoint[] = Array.from(dayMap.entries())
      .map(([dateKey, val]) => ({
        dateKey,
        formattedDate: val.formattedDate,
        count: val.count,
      }))
      .reverse();

    const displayDate = customDate ? new Date(customDate) : today;
    const activeDateFormatted = displayDate.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
    const activeDateISO = customDate || today.toISOString().slice(0, 10);

    return {
      success: true,
      churchName: church.name,
      todayDateString: activeDateFormatted,
      activeDateFormatted,
      activeDateISO,
      timeRangeLabel,
      isLiveNow: activeRes.isLiveNow,
      activeService: activeRes.activeService
        ? {
            id: activeRes.activeService.id,
            name: activeRes.activeService.name,
            startTime: activeRes.activeService.startTime,
            endTime: activeRes.activeService.endTime,
          }
        : null,
      totalUniqueAttendees,
      totalFirstTimers: timeframeFirstTimers.length,
      selfScanPercentage,
      categoryBreakdown,
      servicesBreakdown,
      firstTimersList,
      recentAttendanceRecords: records,
      trendHistory,
    };
  } catch (error) {
    console.error('Error getting admin scorecard:', error);
    return { success: false, error: 'Failed to compute admin scorecard.' };
  }
}

/**
 * 2. Fetches all church service schedules for management.
 */
export async function getAllChurchServicesAction() {
  try {
    const church = await prisma.church.findFirst();
    if (!church) {
      return { success: false, error: 'No church found.' };
    }

    const services = await prisma.serviceSchedule.findMany({
      where: { churchId: church.id },
      orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }],
    });

    return { success: true, services };
  } catch (error) {
    console.error('Error fetching church services:', error);
    return { success: false, error: 'Failed to fetch services.' };
  }
}

/**
 * 3. Updates an existing church service schedule (Time, Name, etc.).
 */
export async function updateServiceScheduleAction({
  id,
  name,
  startTime,
  endTime,
  hasSubClasses,
}: {
  id: string;
  name: string;
  startTime: string;
  endTime: string;
  hasSubClasses?: boolean;
}) {
  try {
    const updated = await prisma.serviceSchedule.update({
      where: { id },
      data: {
        name: name.trim(),
        startTime: startTime.trim(),
        endTime: endTime.trim(),
        hasSubClasses: hasSubClasses !== undefined ? hasSubClasses : undefined,
      },
    });

    return {
      success: true,
      service: updated,
      message: `Updated "${updated.name}" schedule to ${updated.startTime} - ${updated.endTime}`,
    };
  } catch (error) {
    console.error('Error updating service schedule:', error);
    return { success: false, error: 'Failed to update service schedule.' };
  }
}

/**
 * 4. Creates a new church service schedule.
 */
export async function createServiceScheduleAction({
  name,
  dayOfWeek,
  startTime,
  endTime,
  hasSubClasses = false,
}: {
  name: string;
  dayOfWeek: DayOfWeek;
  startTime: string;
  endTime: string;
  hasSubClasses?: boolean;
}) {
  try {
    const church = await prisma.church.findFirst();
    if (!church) {
      return { success: false, error: 'No church found.' };
    }

    const created = await prisma.serviceSchedule.create({
      data: {
        churchId: church.id,
        name: name.trim(),
        dayOfWeek,
        startTime: startTime.trim(),
        endTime: endTime.trim(),
        hasSubClasses,
      },
    });

    return {
      success: true,
      service: created,
      message: `Created new service: "${created.name}"`,
    };
  } catch (error) {
    console.error('Error creating service schedule:', error);
    return { success: false, error: 'Failed to create service schedule.' };
  }
}

