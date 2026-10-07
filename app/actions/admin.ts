'use server';

import { prisma } from '@/lib/prisma';
import { PersonStatus, CheckInMethod, DayOfWeek } from '@prisma/client';

export interface ServiceScorecard {
  id: string;
  name: string;
  startTime: string;
  endTime: string;
  totalPresent: number;
  adultCount?: number;
  youthCount?: number;
  hasSubClasses: boolean;
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

export type AdminTimeRange = 'TODAY' | '1_MONTH' | '3_MONTHS' | '6_MONTHS' | '1_YEAR';

export interface CategoryBreakdown {
  totalWorkers: number;
  totalYouth: number;
  totalAdults: number;
  totalChildren: number;
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
  timeRangeLabel?: string;
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
 * Computes live Sunday or historical (1m, 3m, 6m, 1yr) attendance statistics for leadership.
 */
export async function getAdminScorecardAction(
  timeRange: AdminTimeRange = 'TODAY'
): Promise<AdminScorecardResponse> {
  try {
    const church = await prisma.church.findFirst();
    if (!church) {
      return { success: false, error: 'No church found.' };
    }

    const now = new Date();
    const today = new Date(now);
    today.setHours(0, 0, 0, 0);

    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    let startDate = today;
    let timeRangeLabel = 'Today';

    if (timeRange === '1_MONTH') {
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

    // 1. Fetch all services for this church
    const services = await prisma.serviceSchedule.findMany({
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
      take: 2000,
    });

    // 3. Compute unique people who attended church in this window
    const uniquePersonIds = new Set(records.map((r) => r.personId));
    const totalUniqueAttendees = uniquePersonIds.size;

    // 4. Compute First-Timers captured in this timeframe
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

    // 5. Category Breakdown for Excel/Auditing
    const categoryBreakdown: CategoryBreakdown = {
      totalWorkers: records.filter((r) => r.person?.category === 'WORKER').length,
      totalYouth: records.filter((r) => r.person?.category === 'YOUTH' || r.subClass === 'YOUTH').length,
      totalAdults: records.filter((r) => r.person?.category === 'ADULT').length,
      totalChildren: records.filter((r) => r.person?.category === 'CHILD').length,
      totalFirstTimers: timeframeFirstTimers.length,
    };

    // 6. Compute Service Breakdown
    const servicesBreakdown: ServiceScorecard[] = services.map((svc) => {
      const recordsForSvc = records.filter((r) => r.serviceScheduleId === svc.id);
      const totalPresent = recordsForSvc.length;

      let adultCount = 0;
      let youthCount = 0;

      if (svc.hasSubClasses) {
        adultCount = recordsForSvc.filter((r) => r.subClass === 'ADULT').length;
        youthCount = recordsForSvc.filter((r) => r.subClass === 'YOUTH').length;
      }

      return {
        id: svc.id,
        name: svc.name,
        startTime: svc.startTime,
        endTime: svc.endTime,
        totalPresent,
        adultCount: svc.hasSubClasses ? adultCount : undefined,
        youthCount: svc.hasSubClasses ? youthCount : undefined,
        hasSubClasses: svc.hasSubClasses,
      };
    });

    // 7. Compute Self-Scan vs Usher-Manual Ratio
    const selfScanCount = records.filter((r) => r.method === CheckInMethod.QR_SELF).length;
    const selfScanPercentage = records.length > 0 ? Math.round((selfScanCount / records.length) * 100) : 0;

    // 8. Compute Daily/Sunday Trend
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

    return {
      success: true,
      churchName: church.name,
      todayDateString: today.toLocaleDateString('en-US', {
        weekday: 'long',
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      }),
      timeRangeLabel,
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

