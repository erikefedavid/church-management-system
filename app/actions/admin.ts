'use server';

import { prisma } from '@/lib/prisma';
import { PersonStatus, PersonCategory, CheckInMethod, DayOfWeek } from '@prisma/client';
import * as XLSX from 'xlsx';
import mammoth from 'mammoth';
import { requireStaffSession } from './auth';
import { normalizePhoneNumber } from '@/lib/direct-dispatch';
import {
  getNigerianTimeInfo,
  getActiveChurchService,
  getNigerianDateMidnight,
  parseDateStringToMidnight,
} from '@/lib/service-resolver';
import { calculateDaysUntilBirthday } from '@/lib/birthday-engine';
import { formatBirthdayDate } from '@/lib/template-engine';

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

export interface FollowUpOutcomeEntry {
  id: string;
  personId: string;
  personName: string;
  phone: string;
  personStatus: string;
  callerName: string;
  weekNumber: number;
  outcome: string;
  note: string | null;
  createdAtISO: string;
  createdAtFormatted: string;
}

export interface FollowUpTaskSummary {
  id: string;
  personId: string;
  personName: string;
  phone: string;
  reason: string;
  status: string;
  assignedTo: string | null;
  escalatedTo: string | null;
  dueDateFormatted: string;
  isOverdue: boolean;
}

export interface AdminFollowUpSummary {
  pendingCount: number;
  contactedCount: number;
  escalatedCount: number;
  totalResultsCount: number;
  recentResults: FollowUpOutcomeEntry[];
  activeTasks: FollowUpTaskSummary[];
}

export interface AdminBirthdayItem {
  personId: string;
  fullName: string;
  phone: string;
  birthDay: number;
  birthMonth: number;
  birthDateFormatted: string;
  daysUntil: number;
  isToday: boolean;
  isTomorrow: boolean;
}

export interface AdminBirthdaySummary {
  todayCount: number;
  tomorrowCount: number;
  next7DaysCount: number;
  thisMonthCount: number;
  totalWithBirthdayCount: number;
  celebrants: AdminBirthdayItem[];
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
  sundayLabel?: string | null;
  nextUpcomingService?: {
    name: string;
    dayOfWeek: string;
    startTime: string;
    endTime: string;
    formattedSchedule: string;
  } | null;
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
  followUpSummary?: AdminFollowUpSummary;
  upcomingBirthdays?: AdminBirthdaySummary;
}

/**
 * Computes live Sunday or historical (specific date, 1m, 3m, 6m, 1yr) attendance statistics for leadership.
 */
export async function getAdminScorecardAction(
  timeRange: AdminTimeRange = 'TODAY',
  customDate?: string // YYYY-MM-DD
): Promise<AdminScorecardResponse> {
  try {
    const auth = await requireStaffSession(['ADMIN']);
    if (!auth.authorized) {
      return { success: false, error: auth.error || 'Unauthorized: Admin session required.' };
    }

    const church = await prisma.church.findFirst();
    if (!church) {
      return { success: false, error: 'No church found.' };
    }

    const now = new Date();
    const today = getNigerianDateMidnight(now);
    let tomorrow = new Date(today.getTime() + 86400000);

    const ngInfo = getNigerianTimeInfo(now);
    const activeRes = await getActiveChurchService(church.id, now);

    let startDate = today;
    let timeRangeLabel = 'Today';
    let targetDayOfWeek: DayOfWeek = ngInfo.weekday;

    if (customDate) {
      const parsed = parseDateStringToMidnight(customDate);
      startDate = parsed;
      tomorrow = new Date(parsed.getTime() + 86400000);

      const dayNames: DayOfWeek[] = [
        'SUNDAY',
        'MONDAY',
        'TUESDAY',
        'WEDNESDAY',
        'THURSDAY',
        'FRIDAY',
        'SATURDAY',
      ];
      targetDayOfWeek = dayNames[parsed.getUTCDay()];
      timeRangeLabel = `Date: ${parsed.toLocaleDateString('en-US', {
        timeZone: 'UTC',
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })}`;
    } else if (timeRange === '1_MONTH') {
      startDate = new Date(today.getTime() - 30 * 86400000);
      timeRangeLabel = 'Past 30 Days (1 Month)';
    } else if (timeRange === '3_MONTHS') {
      startDate = new Date(today.getTime() - 90 * 86400000);
      timeRangeLabel = 'Past 3 Months (Quarterly)';
    } else if (timeRange === '6_MONTHS') {
      startDate = new Date(today.getTime() - 180 * 86400000);
      timeRangeLabel = 'Past 6 Months (Biannual)';
    } else if (timeRange === '1_YEAR') {
      startDate = new Date(today.getTime() - 365 * 86400000);
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
      // Use monthly-aware todayServices from service-resolver + any service that has attendance logged today
      const filteredToday = activeRes.todayServices;
      const serviceIdsWithRecords = new Set(records.map((r) => r.serviceScheduleId));

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

    // 10. Fetch Follow-Up Outcomes & Tasks + Upcoming Birthdays in parallel
    const [
      pendingTaskCount,
      contactedTaskCount,
      escalatedTaskCount,
      totalResultsCount,
      recentFollowUpResults,
      activeFollowUpTasks,
      birthdayPeople,
    ] = await Promise.all([
      prisma.followUpTask.count({
        where: { person: { churchId: church.id }, status: 'PENDING' },
      }),
      prisma.followUpTask.count({
        where: { person: { churchId: church.id }, status: 'CONTACTED' },
      }),
      prisma.followUpTask.count({
        where: { person: { churchId: church.id }, status: 'ESCALATED' },
      }),
      prisma.followUpResult.count({
        where: { person: { churchId: church.id } },
      }),
      prisma.followUpResult.findMany({
        where: { person: { churchId: church.id } },
        include: {
          person: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              phone: true,
              status: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: 25,
      }),
      prisma.followUpTask.findMany({
        where: {
          person: { churchId: church.id },
          status: { in: ['PENDING', 'ESCALATED'] },
        },
        include: {
          person: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              phone: true,
            },
          },
        },
        orderBy: [{ status: 'desc' }, { dueDate: 'asc' }],
        take: 25,
      }),
      prisma.person.findMany({
        where: {
          churchId: church.id,
          isActive: true,
          OR: [
            { AND: [{ birthDay: { not: null } }, { birthMonth: { not: null } }] },
            { dateOfBirth: { not: null } },
          ],
        },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          phone: true,
          birthDay: true,
          birthMonth: true,
          dateOfBirth: true,
        },
      }),
    ]);

    const followUpSummary: AdminFollowUpSummary = {
      pendingCount: pendingTaskCount,
      contactedCount: contactedTaskCount,
      escalatedCount: escalatedTaskCount,
      totalResultsCount,
      recentResults: recentFollowUpResults.map((r) => ({
        id: r.id,
        personId: r.personId,
        personName: `${r.person.firstName} ${r.person.lastName}`.trim(),
        phone: r.person.phone,
        personStatus: r.person.status,
        callerName: r.callerName,
        weekNumber: r.weekNumber,
        outcome: r.outcome,
        note: r.note,
        createdAtISO: r.createdAt.toISOString(),
        createdAtFormatted: r.createdAt.toLocaleDateString('en-US', {
          timeZone: 'Africa/Lagos',
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        }),
      })),
      activeTasks: activeFollowUpTasks.map((t) => ({
        id: t.id,
        personId: t.personId,
        personName: `${t.person.firstName} ${t.person.lastName}`.trim(),
        phone: t.person.phone,
        reason: t.reason,
        status: t.status,
        assignedTo: t.assignedTo,
        escalatedTo: t.escalatedTo,
        dueDateFormatted: t.dueDate.toLocaleDateString('en-US', {
          timeZone: 'Africa/Lagos',
          month: 'short',
          day: 'numeric',
        }),
        isOverdue: t.dueDate.getTime() < now.getTime(),
      })),
    };

    let bdayTodayCount = 0;
    let bdayTomorrowCount = 0;
    let bdayNext7DaysCount = 0;
    let bdayThisMonthCount = 0;
    const allCelebrants: AdminBirthdayItem[] = [];

    for (const p of birthdayPeople) {
      let bMonth = p.birthMonth;
      let bDay = p.birthDay;
      if ((!bMonth || !bDay) && p.dateOfBirth) {
        const dob = new Date(p.dateOfBirth);
        bMonth = dob.getUTCMonth() + 1;
        bDay = dob.getUTCDate();
      }
      if (!bMonth || !bDay) continue;

      const daysUntil = calculateDaysUntilBirthday(
        bMonth,
        bDay,
        ngInfo.month,
        ngInfo.dayOfMonth,
        ngInfo.year
      );
      const isToday = daysUntil === 0;
      const isTomorrow = daysUntil === 1;
      if (isToday) bdayTodayCount++;
      if (isTomorrow) bdayTomorrowCount++;
      if (daysUntil >= 0 && daysUntil <= 7) bdayNext7DaysCount++;
      if (bMonth === ngInfo.month) bdayThisMonthCount++;

      allCelebrants.push({
        personId: p.id,
        fullName: `${p.firstName} ${p.lastName}`.trim(),
        phone: p.phone,
        birthDay: bDay,
        birthMonth: bMonth,
        birthDateFormatted: formatBirthdayDate(bMonth, bDay),
        daysUntil,
        isToday,
        isTomorrow,
      });
    }

    allCelebrants.sort((a, b) => a.daysUntil - b.daysUntil);

    const upcomingBirthdays: AdminBirthdaySummary = {
      todayCount: bdayTodayCount,
      tomorrowCount: bdayTomorrowCount,
      next7DaysCount: bdayNext7DaysCount,
      thisMonthCount: bdayThisMonthCount,
      totalWithBirthdayCount: allCelebrants.length,
      celebrants: allCelebrants.slice(0, 50),
    };

    return {
      success: true,
      churchName: church.name,
      todayDateString: activeDateFormatted,
      activeDateFormatted,
      activeDateISO,
      timeRangeLabel,
      isLiveNow: activeRes.isLiveNow,
      sundayLabel: activeRes.sundayLabel ?? null,
      nextUpcomingService: activeRes.nextUpcomingService ?? null,
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
      followUpSummary,
      upcomingBirthdays,
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
    const auth = await requireStaffSession(['ADMIN']);
    if (!auth.authorized) {
      return { success: false, error: auth.error || 'Unauthorized: Admin session required.' };
    }

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
    const auth = await requireStaffSession(['ADMIN']);
    if (!auth.authorized) {
      return { success: false, error: auth.error || 'Unauthorized: Admin session required.' };
    }

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
    const auth = await requireStaffSession(['ADMIN']);
    if (!auth.authorized) {
      return { success: false, error: auth.error || 'Unauthorized: Admin session required.' };
    }

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

// -------------------------------------------------------------
// 5. Bulk Member Import (Excel / CSV / Word .docx)
// -------------------------------------------------------------

export interface ParsedMemberRow {
  firstName: string;
  lastName: string;
  phone: string;
  normalizedPhone: string;
  phoneLast4: string;
  birthDay?: number | null;
  birthMonth?: number | null;
  dateOfBirthISO?: string | null;
  birthdayDisplay?: string;
  warning?: string;
}

export interface ParseMembersResponse {
  success: boolean;
  error?: string;
  fileName?: string;
  members?: ParsedMemberRow[];
  warnings?: string[];
}

export interface ImportMembersResponse {
  success: boolean;
  error?: string;
  createdCount?: number;
  updatedCount?: number;
  skippedCount?: number;
  totalProcessed?: number;
  message?: string;
}

const MONTH_MAP: Record<string, number> = {
  jan: 1, january: 1,
  feb: 2, february: 2,
  mar: 3, march: 3,
  apr: 4, april: 4,
  may: 5,
  jun: 6, june: 6,
  jul: 7, july: 7,
  aug: 8, august: 8,
  sep: 9, sept: 9, september: 9,
  oct: 10, october: 10,
  nov: 11, november: 11,
  dec: 12, december: 12,
};

const MONTH_NAMES = [
  '', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

function formatBirthdayDisplay(day?: number | null, month?: number | null, iso?: string | null): string {
  if (!day || !month) return '';
  const mName = MONTH_NAMES[month] || String(month);
  if (iso && /^\d{4}-/.test(iso)) {
    const year = iso.slice(0, 4);
    return `${day} ${mName} ${year}`;
  }
  return `${day} ${mName}`;
}

function parseBirthdayValue(raw: unknown): {
  birthDay: number | null;
  birthMonth: number | null;
  dateOfBirthISO: string | null;
  birthdayDisplay: string;
} {
  if (raw === null || raw === undefined || raw === '') {
    return { birthDay: null, birthMonth: null, dateOfBirthISO: null, birthdayDisplay: '' };
  }

  // Date object (from xlsx cellDates: true)
  if (raw instanceof Date && !Number.isNaN(raw.getTime())) {
    const year = raw.getUTCFullYear();
    const month = raw.getUTCMonth() + 1;
    const day = raw.getUTCDate();
    const iso = year >= 1920 && year <= 2025 ? raw.toISOString().slice(0, 10) : null;
    return {
      birthDay: day,
      birthMonth: month,
      dateOfBirthISO: iso,
      birthdayDisplay: formatBirthdayDisplay(day, month, iso),
    };
  }

  // Excel serial number (e.g. 20000 - 50000)
  if (typeof raw === 'number' && raw > 1000 && raw < 70000) {
    const utcDays = Math.floor(raw - 25569);
    const d = new Date(utcDays * 86400 * 1000);
    if (!Number.isNaN(d.getTime())) {
      const year = d.getUTCFullYear();
      const month = d.getUTCMonth() + 1;
      const day = d.getUTCDate();
      const iso = year >= 1920 && year <= 2025 ? d.toISOString().slice(0, 10) : null;
      return {
        birthDay: day,
        birthMonth: month,
        dateOfBirthISO: iso,
        birthdayDisplay: formatBirthdayDisplay(day, month, iso),
      };
    }
  }

  const str = String(raw).trim();
  if (!str) {
    return { birthDay: null, birthMonth: null, dateOfBirthISO: null, birthdayDisplay: '' };
  }

  // ISO YYYY-MM-DD or YYYY/MM/DD
  const isoMatch = str.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (isoMatch) {
    const year = Number(isoMatch[1]);
    const month = Number(isoMatch[2]);
    const day = Number(isoMatch[3]);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      const iso = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      return {
        birthDay: day,
        birthMonth: month,
        dateOfBirthISO: year >= 1920 && year <= 2025 ? iso : null,
        birthdayDisplay: formatBirthdayDisplay(day, month, iso),
      };
    }
  }

  // DD/MM/YYYY or DD-MM-YYYY (or DD/MM)
  const dmyMatch = str.match(/^(\d{1,2})[-/](\d{1,2})(?:[-/](\d{2,4}))?$/);
  if (dmyMatch) {
    const a = Number(dmyMatch[1]);
    const b = Number(dmyMatch[2]);
    const rawYear = dmyMatch[3] ? Number(dmyMatch[3]) : null;
    // If second part > 12, it must be MM/DD
    let day = a;
    let month = b;
    if (b > 12 && a <= 12) {
      month = a;
      day = b;
    }
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      let year: number | null = null;
      if (rawYear !== null) {
        year = rawYear < 100 ? (rawYear > 30 ? 1900 + rawYear : 2000 + rawYear) : rawYear;
      }
      const iso =
        year && year >= 1920 && year <= 2025
          ? `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
          : null;
      return {
        birthDay: day,
        birthMonth: month,
        dateOfBirthISO: iso,
        birthdayDisplay: formatBirthdayDisplay(day, month, iso),
      };
    }
  }

  // Named month: "14 May", "14th May 1999", "May 14", "May 14, 1999", "14-May"
  const cleaned = str.replace(/(\d+)(st|nd|rd|th)\b/gi, '$1').replace(/,/g, ' ').trim();
  const dayFirst = cleaned.match(/^(\d{1,2})[\s-]+([A-Za-z]+)(?:[\s-]+(\d{4}))?$/);
  if (dayFirst) {
    const day = Number(dayFirst[1]);
    const month = MONTH_MAP[dayFirst[2].toLowerCase()];
    const year = dayFirst[3] ? Number(dayFirst[3]) : null;
    if (month && day >= 1 && day <= 31) {
      const iso =
        year && year >= 1920 && year <= 2025
          ? `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
          : null;
      return {
        birthDay: day,
        birthMonth: month,
        dateOfBirthISO: iso,
        birthdayDisplay: formatBirthdayDisplay(day, month, iso),
      };
    }
  }

  const monthFirst = cleaned.match(/^([A-Za-z]+)[\s-]+(\d{1,2})(?:[\s-]+(\d{4}))?$/);
  if (monthFirst) {
    const month = MONTH_MAP[monthFirst[1].toLowerCase()];
    const day = Number(monthFirst[2]);
    const year = monthFirst[3] ? Number(monthFirst[3]) : null;
    if (month && day >= 1 && day <= 31) {
      const iso =
        year && year >= 1920 && year <= 2025
          ? `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
          : null;
      return {
        birthDay: day,
        birthMonth: month,
        dateOfBirthISO: iso,
        birthdayDisplay: formatBirthdayDisplay(day, month, iso),
      };
    }
  }

  return { birthDay: null, birthMonth: null, dateOfBirthISO: null, birthdayDisplay: '' };
}

function splitFullName(fullName: string): { firstName: string; lastName: string } {
  const cleaned = fullName.replace(/\s+/g, ' ').trim();
  if (!cleaned) return { firstName: '', lastName: '' };
  const parts = cleaned.split(' ');
  if (parts.length === 1) {
    return { firstName: parts[0], lastName: '' };
  }
  return {
    firstName: parts[0],
    lastName: parts.slice(1).join(' '),
  };
}

function normalizePhoneField(rawPhone: string): {
  phone: string;
  normalizedPhone: string;
  phoneLast4: string;
  warning?: string;
} {
  const raw = (rawPhone || '').trim();
  if (!raw || raw.toUpperCase() === 'NO-PHONE' || raw.toUpperCase() === 'NONE' || raw === '-') {
    return {
      phone: 'NO-PHONE',
      normalizedPhone: '',
      phoneLast4: 'NONE',
      warning: 'No phone number provided',
    };
  }

  // Handle Excel stripping leading 0 on 10-digit Nigerian numbers (e.g. 8031234567)
  const norm = normalizePhoneNumber(raw);
  if (norm.isValid) {
    const stored = norm.isNigerian ? norm.nationalFormat : norm.e164;
    return {
      phone: stored,
      normalizedPhone: norm.e164,
      phoneLast4: norm.phoneLast4,
    };
  }

  const digits = raw.replace(/\D/g, '');
  if (digits.length >= 7) {
    return {
      phone: digits,
      normalizedPhone: digits,
      phoneLast4: digits.slice(-4),
      warning: 'Unrecognized phone format; kept digits',
    };
  }

  return {
    phone: 'NO-PHONE',
    normalizedPhone: '',
    phoneLast4: 'NONE',
    warning: 'Invalid or short phone number',
  };
}

function normalizeHeaderName(val: unknown): string {
  return String(val ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function buildParsedRow(
  firstNameRaw: string,
  lastNameRaw: string,
  phoneRaw: string,
  birthdayRaw: unknown
): ParsedMemberRow | null {
  let firstName = firstNameRaw.replace(/\s+/g, ' ').trim();
  let lastName = lastNameRaw.replace(/\s+/g, ' ').trim();

  if (firstName && !lastName && firstName.includes(' ')) {
    const split = splitFullName(firstName);
    firstName = split.firstName;
    lastName = split.lastName;
  }

  if (!firstName && lastName) {
    firstName = lastName;
    lastName = '';
  }

  if (!firstName) return null;

  // Skip obvious header-like rows
  const combinedLower = `${firstName} ${lastName}`.toLowerCase();
  if (
    combinedLower === 'first name last name' ||
    combinedLower === 'full name' ||
    combinedLower === 'name' ||
    combinedLower === 's n'
  ) {
    return null;
  }

  const phoneInfo = normalizePhoneField(phoneRaw);
  const bday = parseBirthdayValue(birthdayRaw);

  return {
    firstName,
    lastName,
    phone: phoneInfo.phone,
    normalizedPhone: phoneInfo.normalizedPhone,
    phoneLast4: phoneInfo.phoneLast4,
    birthDay: bday.birthDay,
    birthMonth: bday.birthMonth,
    dateOfBirthISO: bday.dateOfBirthISO,
    birthdayDisplay: bday.birthdayDisplay,
    warning: phoneInfo.warning,
  };
}

function parseTableRows(rows: unknown[][]): ParsedMemberRow[] {
  const nonEmptyRows = rows.filter(
    (r) => Array.isArray(r) && r.some((cell) => String(cell ?? '').trim() !== '')
  );
  if (nonEmptyRows.length === 0) return [];

  // Detect header row in first 5 rows
  let headerIdx = -1;
  let colFirst = -1;
  let colLast = -1;
  let colFull = -1;
  let colPhone = -1;
  let colBday = -1;
  let colBirthDay = -1;
  let colBirthMonth = -1;

  for (let i = 0; i < Math.min(5, nonEmptyRows.length); i++) {
    const row = nonEmptyRows[i].map(normalizeHeaderName);
    const fIdx = row.findIndex((h) => h === 'first name' || h === 'firstname' || h === 'first' || h === 'fname' || h === 'given name');
    const lIdx = row.findIndex((h) => h === 'last name' || h === 'lastname' || h === 'last' || h === 'lname' || h === 'surname' || h === 'family name');
    const fullIdx = row.findIndex((h) => h === 'name' || h === 'full name' || h === 'fullname' || h === 'member name' || h === 'names');
    const pIdx = row.findIndex((h) => h.includes('phone') || h.includes('mobile') || h === 'tel' || h === 'telephone' || h.includes('whatsapp') || h === 'contact');
    const bIdx = row.findIndex((h) => h.includes('birthday') || h === 'dob' || h.includes('date of birth') || h.includes('birth date') || h === 'birthdate' || h === 'bday');
    const bdIdx = row.findIndex((h) => h === 'birth day' || h === 'day');
    const bmIdx = row.findIndex((h) => h === 'birth month' || h === 'month');

    const hasNameCol = fIdx !== -1 || lIdx !== -1 || fullIdx !== -1;
    if (hasNameCol && (pIdx !== -1 || fIdx !== -1 || lIdx !== -1)) {
      headerIdx = i;
      colFirst = fIdx;
      colLast = lIdx;
      colFull = fullIdx;
      colPhone = pIdx;
      colBday = bIdx;
      colBirthDay = bdIdx;
      colBirthMonth = bmIdx;
      break;
    }
  }

  const parsed: ParsedMemberRow[] = [];

  if (headerIdx !== -1) {
    for (let i = headerIdx + 1; i < nonEmptyRows.length; i++) {
      const row = nonEmptyRows[i];
      let firstName = colFirst !== -1 ? String(row[colFirst] ?? '').trim() : '';
      let lastName = colLast !== -1 ? String(row[colLast] ?? '').trim() : '';
      if (!firstName && !lastName && colFull !== -1) {
        const split = splitFullName(String(row[colFull] ?? ''));
        firstName = split.firstName;
        lastName = split.lastName;
      }
      const phoneRaw = colPhone !== -1 ? String(row[colPhone] ?? '').trim() : '';
      let bdayRaw: unknown = colBday !== -1 ? row[colBday] : '';
      if (!bdayRaw && colBirthDay !== -1 && colBirthMonth !== -1) {
        const d = String(row[colBirthDay] ?? '').trim();
        const m = String(row[colBirthMonth] ?? '').trim();
        if (d && m) bdayRaw = `${d} ${m}`;
      }

      const member = buildParsedRow(firstName, lastName, phoneRaw, bdayRaw);
      if (member) parsed.push(member);
    }
    return parsed;
  }

  // Fallback: no header row detected — inspect each row heuristically
  for (const row of nonEmptyRows) {
    const cells = row.map((c) => String(c ?? '').trim()).filter(Boolean);
    if (cells.length === 0) continue;

    // Skip serial-number-only first cell like "1" or "1."
    const filtered = /^\d{1,4}\.?$/.test(cells[0]) && cells.length > 1 ? cells.slice(1) : cells;

    let phoneRaw = '';
    let bdayRaw: unknown = '';
    const nameParts: string[] = [];

    for (const cell of filtered) {
      if (!phoneRaw && /(?:\+?\d[\d\s\-()]{6,16}\d)/.test(cell) && !/^\d{4}[-/]\d{1,2}[-/]\d{1,2}$/.test(cell)) {
        phoneRaw = cell;
      } else if (!bdayRaw && parseBirthdayValue(cell).birthDay !== null) {
        bdayRaw = cell;
      } else {
        nameParts.push(cell);
      }
    }

    if (nameParts.length === 0) continue;
    const firstName = nameParts[0];
    const lastName = nameParts.slice(1).join(' ');
    const member = buildParsedRow(firstName, lastName, phoneRaw, bdayRaw);
    if (member) parsed.push(member);
  }

  return parsed;
}

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function parseTextLines(rawText: string): ParsedMemberRow[] {
  const lines = rawText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const parsed: ParsedMemberRow[] = [];

  for (const rawLine of lines) {
    // Strip leading bullet or numbering e.g. "1. ", "1) ", "- ", "• "
    const line = rawLine.replace(/^(?:\d+[.)]\s*|[-•*]\s+)/, '').trim();
    if (!line || line.length < 2) continue;

    // If delimited by tab, pipe, comma, semicolon, or " - "
    if (/[|\t;]|,\s*|\s+[-–]\s+/.test(line)) {
      const parts = line
        .split(/[|\t;]|,\s*|\s+[-–]\s+/)
        .map((p) => p.trim())
        .filter(Boolean);

      if (parts.length >= 2) {
        let phoneRaw = '';
        let bdayRaw = '';
        const nameParts: string[] = [];

        for (const part of parts) {
          if (!phoneRaw && /(?:\+?\d[\d\s\-()]{6,16}\d)/.test(part) && !/^\d{4}[-/]\d{1,2}[-/]\d{1,2}$/.test(part)) {
            phoneRaw = part;
          } else if (!bdayRaw && parseBirthdayValue(part).birthDay !== null) {
            bdayRaw = part;
          } else {
            nameParts.push(part);
          }
        }

        if (nameParts.length > 0) {
          const firstName = nameParts[0];
          const lastName = nameParts.slice(1).join(' ');
          const member = buildParsedRow(firstName, lastName, phoneRaw, bdayRaw);
          if (member) {
            parsed.push(member);
            continue;
          }
        }
      }
    }

    // Free-form line: extract phone number via regex, then birthday if present
    const phoneMatch = line.match(/(?:\+?234[\s-]?\d{3}[\s-]?\d{3}[\s-]?\d{4}|0[789]\d{2}[\s-]?\d{3}[\s-]?\d{4}|\+?\d[\d\s\-()]{7,15}\d)/);
    const phoneRaw = phoneMatch ? phoneMatch[0] : '';
    let remainder = phoneMatch ? line.replace(phoneMatch[0], ' ').trim() : line;

    // Try extracting trailing date token like "14 May", "14/05/1999", "1999-05-14", "May 14"
    let bdayRaw = '';
    const dateMatch = remainder.match(
      /(?:\d{4}[-/]\d{1,2}[-/]\d{1,2}|\d{1,2}[-/]\d{1,2}(?:[-/]\d{2,4})?|\d{1,2}(?:st|nd|rd|th)?\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*(?:\s+\d{4})?|(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\s+\d{1,2}(?:st|nd|rd|th)?(?:,?\s*\d{4})?)$/i
    );
    if (dateMatch) {
      bdayRaw = dateMatch[0];
      remainder = remainder.slice(0, dateMatch.index).trim();
    }

    remainder = remainder.replace(/[-–,|]+$/g, '').trim();
    if (!remainder || !phoneRaw) continue;

    const { firstName, lastName } = splitFullName(remainder);
    const member = buildParsedRow(firstName, lastName, phoneRaw, bdayRaw);
    if (member) parsed.push(member);
  }

  return parsed;
}

async function extractMembersFromFile(file: File): Promise<{
  members: ParsedMemberRow[];
  warnings: string[];
}> {
  const fileName = file.name.toLowerCase();
  const buffer = Buffer.from(await file.arrayBuffer());
  const warnings: string[] = [];

  if (fileName.endsWith('.xlsx') || fileName.endsWith('.xls') || fileName.endsWith('.csv')) {
    const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });
    const firstSheetName = workbook.SheetNames[0];
    if (!firstSheetName) {
      return { members: [], warnings: ['No sheets found in the uploaded spreadsheet.'] };
    }
    const sheet = workbook.Sheets[firstSheetName];
    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '' });
    const members = parseTableRows(rows);
    return { members, warnings };
  }

  if (fileName.endsWith('.docx')) {
    const htmlResult = await mammoth.convertToHtml({ buffer });
    const html = htmlResult.value || '';

    // Extract tables first if present in the Word document
    const tableRowMatches = [...html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)];
    if (tableRowMatches.length > 0) {
      const tableRows: string[][] = tableRowMatches.map((trMatch) => {
        const cellMatches = [...trMatch[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)];
        return cellMatches.map((cellMatch) =>
          decodeHtmlEntities(cellMatch[1].replace(/<[^>]+>/g, ' '))
        );
      });
      const tableMembers = parseTableRows(tableRows);
      if (tableMembers.length > 0) {
        return { members: tableMembers, warnings };
      }
    }

    // Fallback to raw text line extraction
    const textResult = await mammoth.extractRawText({ buffer });
    const textMembers = parseTextLines(textResult.value || '');
    return { members: textMembers, warnings };
  }

  throw new Error('Unsupported file type. Please upload .xlsx, .xls, .csv, or .docx.');
}

async function upsertParsedMembers(
  churchId: string,
  members: ParsedMemberRow[]
): Promise<ImportMembersResponse> {
  const existingPeople = await prisma.person.findMany({
    where: { churchId },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      phone: true,
      phoneLast4: true,
    },
  });

  const byNormalizedPhone = new Map<string, string>();
  const byFullName = new Map<string, string>();

  for (const p of existingPeople) {
    const norm = normalizePhoneNumber(p.phone);
    if (norm.isValid && norm.e164) {
      byNormalizedPhone.set(norm.e164, p.id);
    } else if (p.phone && p.phone !== 'NO-PHONE') {
      byNormalizedPhone.set(p.phone.trim(), p.id);
    }
    const nameKey = `${p.firstName.trim().toLowerCase()}|${p.lastName.trim().toLowerCase()}`;
    byFullName.set(nameKey, p.id);
  }

  let createdCount = 0;
  let updatedCount = 0;
  let skippedCount = 0;

  for (const row of members) {
    const firstName = (row.firstName || '').trim();
    const lastName = (row.lastName || '').trim();
    if (!firstName) {
      skippedCount += 1;
      continue;
    }

    const phoneInfo = normalizePhoneField(row.phone || row.normalizedPhone || '');
    const nameKey = `${firstName.toLowerCase()}|${lastName.toLowerCase()}`;

    const matchedId =
      (phoneInfo.normalizedPhone ? byNormalizedPhone.get(phoneInfo.normalizedPhone) : undefined) ||
      byFullName.get(nameKey);

    const birthDay = row.birthDay ?? null;
    const birthMonth = row.birthMonth ?? null;
    const dateOfBirth =
      row.dateOfBirthISO && !Number.isNaN(Date.parse(row.dateOfBirthISO))
        ? new Date(row.dateOfBirthISO)
        : null;

    if (matchedId) {
      await prisma.person.update({
        where: { id: matchedId },
        data: {
          firstName,
          lastName,
          category: PersonCategory.YOUTH,
          subCategory: 'YOUTH',
          status: PersonStatus.MEMBER,
          isActive: true,
          ...(phoneInfo.phone !== 'NO-PHONE'
            ? { phone: phoneInfo.phone, phoneLast4: phoneInfo.phoneLast4 }
            : {}),
          ...(birthDay !== null && birthMonth !== null
            ? { birthDay, birthMonth }
            : {}),
          ...(dateOfBirth ? { dateOfBirth } : {}),
        },
      });
      updatedCount += 1;
    } else {
      const created = await prisma.person.create({
        data: {
          churchId,
          firstName,
          lastName,
          phone: phoneInfo.phone,
          phoneLast4: phoneInfo.phoneLast4,
          category: PersonCategory.YOUTH,
          subCategory: 'YOUTH',
          status: PersonStatus.MEMBER,
          birthDay,
          birthMonth,
          dateOfBirth,
        },
      });
      if (phoneInfo.normalizedPhone) {
        byNormalizedPhone.set(phoneInfo.normalizedPhone, created.id);
      }
      byFullName.set(nameKey, created.id);
      createdCount += 1;
    }
  }

  return {
    success: true,
    createdCount,
    updatedCount,
    skippedCount,
    totalProcessed: createdCount + updatedCount,
    message: `Imported ${createdCount + updatedCount} Youth members (${createdCount} new, ${updatedCount} updated${skippedCount > 0 ? `, ${skippedCount} skipped` : ''}).`,
  };
}

/**
 * Parses an uploaded Excel (.xlsx, .xls, .csv) or Word (.docx) file and returns preview rows.
 */
export async function parseMembersFileAction(formData: FormData): Promise<ParseMembersResponse> {
  try {
    const auth = await requireStaffSession(['ADMIN']);
    if (!auth.authorized) {
      return { success: false, error: auth.error || 'Unauthorized: Admin session required.' };
    }

    const file = formData.get('file') as File | null;
    if (!file) {
      return { success: false, error: 'Please select a file to upload.' };
    }

    if (file.size > 10 * 1024 * 1024) {
      return { success: false, error: 'File size exceeds 10MB limit.' };
    }

    const { members, warnings } = await extractMembersFromFile(file);
    if (members.length === 0) {
      return {
        success: false,
        fileName: file.name,
        error:
          'No member rows could be extracted. Ensure the file has columns or lines with Name and Phone.',
      };
    }

    return {
      success: true,
      fileName: file.name,
      members,
      warnings,
    };
  } catch (error) {
    console.error('Error parsing members file:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to parse uploaded file.',
    };
  }
}

/**
 * Upserts confirmed preview rows into Person (Youth Members), deduplicating by phone or full name.
 */
export async function importMembersAction(
  members: ParsedMemberRow[]
): Promise<ImportMembersResponse> {
  try {
    const auth = await requireStaffSession(['ADMIN']);
    if (!auth.authorized) {
      return { success: false, error: auth.error || 'Unauthorized: Admin session required.' };
    }

    if (!Array.isArray(members) || members.length === 0) {
      return { success: false, error: 'No members provided for import.' };
    }

    const church = await prisma.church.findFirst();
    if (!church) {
      return { success: false, error: 'No church found.' };
    }

    return await upsertParsedMembers(church.id, members);
  } catch (error) {
    console.error('Error importing members:', error);
    return { success: false, error: 'Failed to import members into database.' };
  }
}

/**
 * Parses an uploaded Excel/Word file and immediately imports all extracted Youth members.
 */
export async function parseAndImportMembers(
  formData: FormData
): Promise<ImportMembersResponse & { members?: ParsedMemberRow[] }> {
  try {
    const auth = await requireStaffSession(['ADMIN']);
    if (!auth.authorized) {
      return { success: false, error: auth.error || 'Unauthorized: Admin session required.' };
    }

    const file = formData.get('file') as File | null;
    if (!file) {
      return { success: false, error: 'Please select a file to upload.' };
    }

    const church = await prisma.church.findFirst();
    if (!church) {
      return { success: false, error: 'No church found.' };
    }

    const { members } = await extractMembersFromFile(file);
    if (members.length === 0) {
      return {
        success: false,
        error: 'No member rows could be extracted from the uploaded file.',
      };
    }

    const importRes = await upsertParsedMembers(church.id, members);
    return { ...importRes, members };
  } catch (error) {
    console.error('Error in parseAndImportMembers:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to parse and import members.',
    };
  }
}

/**
 * Fetch current Sanctuary GPS coordinates and geofence radius.
 */
export async function getChurchLocationAction(): Promise<{
  success: boolean;
  latitude?: number;
  longitude?: number;
  geofenceRadius?: number;
  error?: string;
}> {
  try {
    const auth = await requireStaffSession(['ADMIN']);
    if (!auth.authorized) {
      return { success: false, error: auth.error || 'Unauthorized: Admin session required.' };
    }

    const church = await prisma.church.findFirst();
    if (!church) {
      return { success: false, error: 'No church found.' };
    }

    return {
      success: true,
      latitude: church.latitude,
      longitude: church.longitude,
      geofenceRadius: church.geofenceRadius,
    };
  } catch (error) {
    console.error('Error fetching church location:', error);
    return { success: false, error: 'Failed to load church location.' };
  }
}

/**
 * Update Sanctuary GPS coordinates and geofence radius (Admin only).
 */
export async function updateChurchLocationAction(params: {
  latitude: number;
  longitude: number;
  geofenceRadius?: number;
}): Promise<{ success: boolean; error?: string }> {
  try {
    const auth = await requireStaffSession(['ADMIN']);
    if (!auth.authorized) {
      return { success: false, error: auth.error || 'Unauthorized: Admin session required.' };
    }

    const { latitude, longitude, geofenceRadius } = params;
    if (
      typeof latitude !== 'number' ||
      typeof longitude !== 'number' ||
      isNaN(latitude) ||
      isNaN(longitude) ||
      Math.abs(latitude) > 90 ||
      Math.abs(longitude) > 180 ||
      (latitude === 0 && longitude === 0)
    ) {
      return { success: false, error: 'Invalid GPS coordinates.' };
    }

    const radius = Math.max(50, Math.min(2000, Math.round(geofenceRadius ?? 150)));
    const church = await prisma.church.findFirst();
    if (!church) {
      return { success: false, error: 'No church found.' };
    }

    await prisma.church.update({
      where: { id: church.id },
      data: {
        latitude,
        longitude,
        geofenceRadius: radius,
      },
    });

    return { success: true };
  } catch (error) {
    console.error('Error updating church location:', error);
    return { success: false, error: 'Failed to save church location.' };
  }
}

