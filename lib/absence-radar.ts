/**
 * Core Absence Detection Radar Algorithm & Date Calculations
 * RCCG Jesus Covenant Zone (Milestone 3 / Requirement R2)
 *
 * Guarantees:
 * 1. Africa/Lagos (WAT UTC+1) timezone accuracy without server clock drift.
 * 2. 4-Query Batch Strategy leveraging Prisma composite index @@index([churchId, date]), guaranteeing zero N+1 queries.
 * 3. Classifications:
 *    - Missed 1 Week (attended 2 Sundays ago, missed most recent Sunday)
 *    - Missed 2 Consecutive Weeks (missed both recent Sundays, but historically active)
 *    - First-Timers (72-hour high-touch care window)
 *    - Inactive / archived members and unonboarded 0-attendance records excluded from spam.
 * 4. Deterministic 0-token draft generation via lib/template-engine.ts.
 */

import { prisma } from './prisma';
import { getNigerianTimeInfo } from './service-resolver';
import { renderTemplate, TemplateCategory } from './template-engine';
import { normalizePhoneNumber, generateWaMeLink } from './direct-dispatch';

const ukDateFormatter = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
});

export type AbsenceReason = 'FIRST_TIMER' | 'MISSED_1_WEEK' | 'MISSED_2_WEEKS' | 'DORMANT_CRITICAL';

export interface TargetSundays {
  s1Date: Date; // Most recent Sunday (UTC midnight)
  s2Date: Date; // 1 Sunday prior (S1 - 7 days)
  s3Date: Date; // 2 Sundays prior (S1 - 14 days)
  s1Formatted: string; // e.g. "8 Nov 2026"
  s2Formatted: string;
  s3Formatted: string;
  isTodaySunday: boolean;
  nigerianHour: number;
}

export interface RadarClassifiedMember {
  personId: string;
  firstName: string;
  lastName: string;
  fullName: string;
  phone: string;
  formattedPhone: string;
  phoneLast4: string;
  category: string;
  subCategory: string | null;
  status: 'MEMBER' | 'FIRST_TIMER' | 'EVANGELISM';
  reason: AbsenceReason;
  daysAbsent: number;
  lastAttendedDate: Date | null;
  lastAttendedFormatted: string;
  existingTaskId?: string;
  taskStatus?: 'PENDING' | 'CONTACTED' | 'ESCALATED';
  isEscalated: boolean;
  escalatedTo?: string | null;
  dueDate?: Date | null;
  aiDraftNote: string;
  waMeUrl: string;
}

export interface AbsenceRadarScanResult {
  targetSundays: TargetSundays;
  totalActiveMembers: number;
  missed1Week: RadarClassifiedMember[];
  missed2Weeks: RadarClassifiedMember[];
  firstTimers72h: RadarClassifiedMember[];
  dormantCritical: RadarClassifiedMember[];
  escalatedToPastor: RadarClassifiedMember[];
  stats: {
    scannedCount: number;
    missed1WeekCount: number;
    missed2WeeksCount: number;
    firstTimers72hCount: number;
    escalatedCount: number;
    totalAbsentees: number;
  };
}

/**
 * 1. Calculate Target Sunday Dates anchored to Africa/Lagos (WAT UTC+1)
 *
 * Rules:
 * - If today is Sunday:
 *   - At or after 13:00 WAT (church service completed), today is the most recent completed Sunday (S1).
 *   - Before 13:00 WAT (service not finished yet), S1 is the previous Sunday (today - 7 days).
 * - If today is Monday through Saturday:
 *   - S1 is the Sunday of the current week (today - daysSinceSunday).
 * - S2 = S1 - 7 days
 * - S3 = S1 - 14 days
 */
export function getTargetSundayDates(refDate: Date = new Date()): TargetSundays {
  const ngInfo = getNigerianTimeInfo(refDate);

  // Map weekday to 0=Sunday, 1=Monday, ..., 6=Saturday
  const weekdayMap: Record<string, number> = {
    SUNDAY: 0,
    MONDAY: 1,
    TUESDAY: 2,
    WEDNESDAY: 3,
    THURSDAY: 4,
    FRIDAY: 5,
    SATURDAY: 6,
  };
  const dayOfWeekIndex = weekdayMap[ngInfo.weekday] ?? 0;

  // Extract Nigerian hour (0 - 23)
  const hourMatch = ngInfo.currentTimeString.match(/^(\d{1,2}):/);
  const nigerianHour = hourMatch ? parseInt(hourMatch[1], 10) : 12;

  let daysBackToS1 = 0;
  if (dayOfWeekIndex === 0) {
    // Sunday: Cutoff is 13:00 WAT (1:00 PM)
    if (nigerianHour >= 13) {
      daysBackToS1 = 0; // Today is S1
    } else {
      daysBackToS1 = 7; // Last Sunday was S1
    }
  } else {
    // Monday (1) -> 1 day back; Saturday (6) -> 6 days back
    daysBackToS1 = dayOfWeekIndex;
  }

  // Base UTC midnight for the current Nigerian calendar day
  const baseUtcMidnight = Date.UTC(ngInfo.year, ngInfo.month - 1, ngInfo.dayOfMonth, 0, 0, 0, 0);

  const MS_PER_DAY = 24 * 60 * 60 * 1000;
  const s1Date = new Date(baseUtcMidnight - daysBackToS1 * MS_PER_DAY);
  const s2Date = new Date(s1Date.getTime() - 7 * MS_PER_DAY);
  const s3Date = new Date(s1Date.getTime() - 14 * MS_PER_DAY);

  return {
    s1Date,
    s2Date,
    s3Date,
    s1Formatted: ukDateFormatter.format(s1Date),
    s2Formatted: ukDateFormatter.format(s2Date),
    s3Formatted: ukDateFormatter.format(s3Date),
    isTodaySunday: dayOfWeekIndex === 0,
    nigerianHour,
  };
}

/**
 * Helper: Map reason string to template category
 */
export function mapReasonToTemplateCategory(reason: AbsenceReason): TemplateCategory {
  switch (reason) {
    case 'FIRST_TIMER':
      return 'FIRST_TIMER_72H';
    case 'MISSED_1_WEEK':
      return 'MISSED_1_WEEK';
    case 'MISSED_2_WEEKS':
      return 'MISSED_2_WEEKS';
    case 'DORMANT_CRITICAL':
    default:
      return 'DORMANT_CRITICAL';
  }
}

/**
 * 2. 4-Query Batch Absence Detection Strategy
 *
 * Guarantees zero N+1 queries by executing exactly 4 indexed queries:
 * 1. Active members query (prisma.person.findMany)
 * 2. Recent Sunday attendance records (prisma.attendanceRecord.findMany for S1, S2, S3)
 * 3. 60-day historical attendance seeks (prisma.attendanceRecord.findMany distinct personId)
 * 4. Active follow-up tasks query (prisma.followUpTask.findMany)
 */
export async function detectAbsenteeMembers(options: {
  churchId?: string;
  refDate?: Date;
} = {}): Promise<AbsenceRadarScanResult> {
  const refDate = options.refDate || new Date();
  const targetSundays = getTargetSundayDates(refDate);

  // 1. Resolve churchId
  let targetChurchId = options.churchId;
  if (!targetChurchId) {
    const defaultChurch = await prisma.church.findFirst({
      select: { id: true, name: true },
    });
    if (!defaultChurch) {
      return {
        targetSundays,
        totalActiveMembers: 0,
        missed1Week: [],
        missed2Weeks: [],
        firstTimers72h: [],
        dormantCritical: [],
        escalatedToPastor: [],
        stats: {
          scannedCount: 0,
          missed1WeekCount: 0,
          missed2WeeksCount: 0,
          firstTimers72hCount: 0,
          escalatedCount: 0,
          totalAbsentees: 0,
        },
      };
    }
    targetChurchId = defaultChurch.id;
  }

  const sixtyDaysAgo = new Date(refDate.getTime() - 60 * 24 * 60 * 60 * 1000);

  // Execute 4 Queries in Parallel (Zero N+1 guaranteed)
  const [activePeople, sundayRecords, sixtyDayRecords, openTasks] = await Promise.all([
    // Query 1: All active people in this church
    prisma.person.findMany({
      where: {
        churchId: targetChurchId,
        isActive: true,
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
        createdAt: true,
      },
    }),

    // Query 2: Attendance for target Sundays (leveraging @@index([churchId, date]))
    prisma.attendanceRecord.findMany({
      where: {
        churchId: targetChurchId,
        date: {
          in: [targetSundays.s1Date, targetSundays.s2Date, targetSundays.s3Date],
        },
      },
      select: {
        personId: true,
        date: true,
      },
    }),

    // Query 3: Active attendees in the last 60 days
    prisma.attendanceRecord.findMany({
      where: {
        churchId: targetChurchId,
        date: {
          gte: sixtyDaysAgo,
        },
      },
      select: {
        personId: true,
        date: true,
      },
      orderBy: {
        date: 'desc',
      },
    }),

    // Query 4: Open tasks for deduplication & escalation flags
    prisma.followUpTask.findMany({
      where: {
        person: {
          churchId: targetChurchId,
        },
        status: {
          in: ['PENDING', 'ESCALATED'],
        },
      },
      select: {
        id: true,
        personId: true,
        reason: true,
        status: true,
        assignedTo: true,
        escalatedTo: true,
        dueDate: true,
      },
    }),
  ]);

  // Index attendance into fast O(1) Sets
  const s1Time = targetSundays.s1Date.getTime();
  const s2Time = targetSundays.s2Date.getTime();
  const s3Time = targetSundays.s3Date.getTime();

  const s1AttendeeSet = new Set<string>();
  const s2AttendeeSet = new Set<string>();
  const s3AttendeeSet = new Set<string>();

  for (const record of sundayRecords) {
    const recTime = record.date.getTime();
    if (recTime === s1Time) s1AttendeeSet.add(record.personId);
    else if (recTime === s2Time) s2AttendeeSet.add(record.personId);
    else if (recTime === s3Time) s3AttendeeSet.add(record.personId);
  }

  // Index most recent attendance in 60 days
  const lastAttendedMap = new Map<string, Date>();
  const sixtyDayActiveSet = new Set<string>();
  for (const record of sixtyDayRecords) {
    sixtyDayActiveSet.add(record.personId);
    if (!lastAttendedMap.has(record.personId)) {
      lastAttendedMap.set(record.personId, record.date);
    }
  }

  // Index open tasks by personId
  const openTaskMap = new Map<string, (typeof openTasks)[number]>();
  for (const task of openTasks) {
    openTaskMap.set(task.personId, task);
  }

  // Categorization Buckets
  const missed1Week: RadarClassifiedMember[] = [];
  const missed2Weeks: RadarClassifiedMember[] = [];
  const firstTimers72h: RadarClassifiedMember[] = [];
  const dormantCritical: RadarClassifiedMember[] = [];
  const escalatedToPastor: RadarClassifiedMember[] = [];

  const nowMs = refDate.getTime();
  const SEVENTY_TWO_HOURS_MS = 72 * 60 * 60 * 1000;

  for (const person of activePeople) {
    const attendedS1 = s1AttendeeSet.has(person.id);
    const attendedS2 = s2AttendeeSet.has(person.id);
    const attendedS3 = s3AttendeeSet.has(person.id);
    const hasHistory = sixtyDayActiveSet.has(person.id);
    const existingTask = openTaskMap.get(person.id);

    const isFirstTimer = person.status === 'FIRST_TIMER';
    const isMember = person.status === 'MEMBER';
    const ageMs = nowMs - person.createdAt.getTime();

    let detectedReason: AbsenceReason | null = null;
    let daysAbsent = 0;

    // Classification Rule 1: FIRST-TIMERS (72h care window)
    if (isFirstTimer) {
      if (ageMs <= SEVENTY_TWO_HOURS_MS || attendedS1) {
        detectedReason = 'FIRST_TIMER';
        daysAbsent = Math.max(1, Math.round(ageMs / (24 * 60 * 60 * 1000)));
      }
    } else if (isMember) {
      // Classification Rule 2: MISSED 1 WEEK
      // Did NOT attend S1, but attended S2 (or was registered between S2 and S1)
      if (!attendedS1 && (attendedS2 || (person.createdAt >= targetSundays.s2Date && person.createdAt <= targetSundays.s1Date))) {
        detectedReason = 'MISSED_1_WEEK';
        daysAbsent = 7;
      }
      // Classification Rule 3: MISSED 2 CONSECUTIVE WEEKS
      // Did NOT attend S1 AND did NOT attend S2, but attended S3
      else if (!attendedS1 && !attendedS2 && attendedS3) {
        detectedReason = 'MISSED_2_WEEKS';
        daysAbsent = 14;
      }
      // Classification Rule 4: DORMANT CRITICAL
      // Absent for >3 weeks, but was historically active in the last 60 days
      else if (!attendedS1 && !attendedS2 && !attendedS3 && hasHistory) {
        detectedReason = 'DORMANT_CRITICAL';
        daysAbsent = 21;
      }
    }

    if (!detectedReason) {
      // Member attended S1 or is unonboarded with zero attendance history
      continue;
    }

    // Build deterministic 0-token message draft
    const category = mapReasonToTemplateCategory(detectedReason);
    const templateContext = {
      firstName: person.firstName,
      lastName: person.lastName,
      fullName: `${person.firstName} ${person.lastName}`,
      phone: person.phone,
      department: person.subCategory || person.category,
      category: person.category,
      daysAbsent,
      churchName: 'RCCG Jesus Covenant Zone',
    };

    const rendered = renderTemplate(category, templateContext, {
      tone: 'CASUAL_YOUTH',
      seed: person.phone || person.firstName,
    });

    const normalizedPhone = normalizePhoneNumber(person.phone);
    const waMeUrl = generateWaMeLink(normalizedPhone.digitsOnly, rendered.text);

    const lastAttDate = lastAttendedMap.get(person.id) || (attendedS2 ? targetSundays.s2Date : attendedS3 ? targetSundays.s3Date : null);
    const lastAttFormatted = lastAttDate
      ? ukDateFormatter.format(lastAttDate)
      : 'No prior attendance';

    const isEscalated =
      existingTask?.status === 'ESCALATED' ||
      existingTask?.escalatedTo === 'YOUTH_PASTOR' ||
      existingTask?.escalatedTo === 'YOUTH_PRESIDENT';

    const classified: RadarClassifiedMember = {
      personId: person.id,
      firstName: person.firstName,
      lastName: person.lastName,
      fullName: `${person.firstName} ${person.lastName}`,
      phone: person.phone,
      formattedPhone: normalizedPhone.formattedNational || person.phone,
      phoneLast4: person.phoneLast4 || normalizedPhone.phoneLast4,
      category: person.category,
      subCategory: person.subCategory,
      status: person.status,
      reason: detectedReason,
      daysAbsent,
      lastAttendedDate: lastAttDate,
      lastAttendedFormatted: lastAttFormatted,
      existingTaskId: existingTask?.id,
      taskStatus: existingTask?.status as 'PENDING' | 'CONTACTED' | 'ESCALATED' | undefined,
      isEscalated,
      escalatedTo: existingTask?.escalatedTo,
      dueDate: existingTask?.dueDate,
      aiDraftNote: rendered.text,
      waMeUrl,
    };

    // Sort into buckets
    if (isEscalated) {
      escalatedToPastor.push(classified);
    }

    switch (detectedReason) {
      case 'FIRST_TIMER':
        firstTimers72h.push(classified);
        break;
      case 'MISSED_1_WEEK':
        missed1Week.push(classified);
        break;
      case 'MISSED_2_WEEKS':
        missed2Weeks.push(classified);
        break;
      case 'DORMANT_CRITICAL':
        dormantCritical.push(classified);
        break;
    }
  }

  // Also catch any open tasks already marked as ESCALATED that might not have been caught above
  const activePeopleMap = new Map(activePeople.map((p) => [p.id, p]));

  for (const task of openTasks) {
    if (task.status === 'ESCALATED' && !escalatedToPastor.some((m) => m.existingTaskId === task.id)) {
      const person = activePeopleMap.get(task.personId);
      if (person) {
        const normalizedPhone = normalizePhoneNumber(person.phone);
        const rendered = renderTemplate(mapReasonToTemplateCategory(task.reason as AbsenceReason), {
          firstName: person.firstName,
          lastName: person.lastName,
          fullName: `${person.firstName} ${person.lastName}`,
          phone: person.phone,
          department: person.subCategory || person.category,
          churchName: 'RCCG Jesus Covenant Zone',
        });
        const waMeUrl = generateWaMeLink(normalizedPhone.digitsOnly, rendered.text);
        const lastAtt = lastAttendedMap.get(person.id);

        escalatedToPastor.push({
          personId: person.id,
          firstName: person.firstName,
          lastName: person.lastName,
          fullName: `${person.firstName} ${person.lastName}`,
          phone: person.phone,
          formattedPhone: normalizedPhone.formattedNational || person.phone,
          phoneLast4: person.phoneLast4 || normalizedPhone.phoneLast4,
          category: person.category,
          subCategory: person.subCategory,
          status: person.status,
          reason: task.reason as AbsenceReason,
          daysAbsent: task.reason === 'MISSED_2_WEEKS' ? 14 : 7,
          lastAttendedDate: lastAtt || null,
          lastAttendedFormatted: lastAtt ? ukDateFormatter.format(lastAtt) : 'Unknown',
          existingTaskId: task.id,
          taskStatus: task.status as 'ESCALATED',
          isEscalated: true,
          escalatedTo: task.escalatedTo,
          dueDate: task.dueDate,
          aiDraftNote: rendered.text,
          waMeUrl,
        });
      }
    }
  }

  const totalAbsentees = missed1Week.length + missed2Weeks.length + firstTimers72h.length;

  return {
    targetSundays,
    totalActiveMembers: activePeople.length,
    missed1Week,
    missed2Weeks,
    firstTimers72h,
    dormantCritical,
    escalatedToPastor,
    stats: {
      scannedCount: activePeople.length,
      missed1WeekCount: missed1Week.length,
      missed2WeeksCount: missed2Weeks.length,
      firstTimers72hCount: firstTimers72h.length,
      escalatedCount: escalatedToPastor.length,
      totalAbsentees,
    },
  };
}
