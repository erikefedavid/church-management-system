/**
 * Core Birthday Detection, Leap Year Resolution & Automation Pipeline Engine
 * RCCG Jesus Covenant Zone (Milestone 4 / Requirement R3)
 *
 * Guarantees:
 * - 100% African/Lagos (WAT UTC+1) Timezone Alignment.
 * - Accurate Leap Year Handling: In non-leap years (e.g. 2026), Feb 29 celebrants
 *   are celebrated on Feb 28 without being forgotten. In leap years (e.g. 2028),
 *   they celebrate on Feb 29.
 * - Strict Database-Level Idempotency: Uses `BirthdayReminderLog` with unique
 *   constraint `@@unique([personId, year, type])`, gracefully handling P2002
 *   concurrency collisions.
 * - Triple-Channel Notification Pipeline:
 *   1. T-1 Media Telegram alerts for flyer graphic preparation.
 *   2. Day-Of church Telegram celebration alerts.
 *   3. Day-Of 0-token deterministic WhatsApp/SMS greetings sent directly to members
 *      with 1-click wa.me fallback.
 */

import { prisma } from './prisma';
import { getNigerianTimeInfo } from './service-resolver';
import { renderTemplate, formatBirthdayDate } from './template-engine';
import { dispatchDirectMessage, generateWaMeLink, normalizePhoneNumber } from './direct-dispatch';
import { sendMediaBirthdayAlert } from './telegram';

export const BIRTHDAY_REMINDER_TYPES = {
  T_MINUS_1_MEDIA: 'GRAPHICS_T_MINUS_1',
  DAY_OF_CELEBRATION: 'DAY_OF_CELEBRATION',
  DIRECT_MEMBER_DM: 'DIRECT_MEMBER_DM',
} as const;

export type BirthdayReminderType =
  | 'GRAPHICS_T_MINUS_1'
  | 'DAY_OF_CELEBRATION'
  | 'DIRECT_MEMBER_DM';

export interface BirthdayCelebrant {
  personId: string;
  firstName: string;
  lastName: string;
  fullName: string;
  phone: string;
  photoUrl: string | null;
  department: string;
  category: string;
  subCategory: string | null;
  birthDay: number;
  birthMonth: number;
  birthDateFormatted: string;
  isLeapDayBorn: boolean;
  daysUntil: number;
  isToday: boolean;
  isTomorrow: boolean;
}

export interface BirthdayPipelineOptions {
  churchId?: string;
  targetDate?: Date;
  refDate?: Date;
  dryRun?: boolean;
  force?: boolean;
}

export interface BirthdayStageTelemetry {
  celebrantsCount: number;
  mediaAlertsSent: number;
  memberDmsSent?: number;
  memberDmsFallbackWaMe?: number;
  skippedAlreadyLogged: number;
  failed: number;
  celebrantIds: string[];
}

export interface BirthdayPipelineResult {
  success: boolean;
  timestamp: string;
  targetDateWat: string; // "YYYY-MM-DD"
  referenceDateLagos?: string;
  year: number;
  durationMs: number;
  dryRun: boolean;
  tMinus1: BirthdayStageTelemetry;
  dayOf: BirthdayStageTelemetry;
  logsCreated: number;
  totalCelebrants: number;
  stats: {
    tMinus1Detected: number;
    tMinus1Dispatched: number;
    tMinus1Skipped: number;
    dayOfDetected: number;
    dayOfDispatched: number;
    dayOfSkipped: number;
    directDmDetected: number;
    directDmDispatched: number;
    directDmSkipped: number;
    totalErrors: number;
  };
  details: {
    tMinus1: Array<{ personId: string; name: string; status: string; error?: string }>;
    dayOf: Array<{ personId: string; name: string; status: string; error?: string }>;
    directDms: Array<{ personId: string; name: string; status: string; waMeUrl?: string; error?: string }>;
  };
  errors: Array<{ personId: string; type: string; error: string }>;
}

/**
 * Checks if a 4-digit calendar year is a leap year
 */
export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/**
 * Calculates days remaining until the celebrant's next birthday relative to target date.
 * Seamlessly maps Feb 29 to Feb 28 in non-leap years.
 */
export function calculateDaysUntilBirthday(
  birthMonth: number,
  birthDay: number,
  currentMonth: number,
  currentDay: number,
  currentYear: number
): number {
  const isLeapDay = birthMonth === 2 && birthDay === 29;

  // Effective day in current year
  let effectiveDayThisYear = birthDay;
  if (isLeapDay && !isLeapYear(currentYear)) {
    effectiveDayThisYear = 28;
  }

  const todayUtc = Date.UTC(currentYear, currentMonth - 1, currentDay);
  const thisYearBdayUtc = Date.UTC(currentYear, birthMonth - 1, effectiveDayThisYear);

  const diffMs = thisYearBdayUtc - todayUtc;
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays >= 0) {
    return diffDays;
  }

  // Birthday already passed this year -> calculate for next year
  const nextYear = currentYear + 1;
  let effectiveDayNextYear = birthDay;
  if (isLeapDay && !isLeapYear(nextYear)) {
    effectiveDayNextYear = 28;
  }

  const nextYearBdayUtc = Date.UTC(nextYear, birthMonth - 1, effectiveDayNextYear);
  return Math.round((nextYearBdayUtc - todayUtc) / (1000 * 60 * 60 * 24));
}

/**
 * Normalizes member's birth day and month, falling back to dateOfBirth if null.
 */
export function extractBirthDayMonth(person: {
  birthDay: number | null;
  birthMonth: number | null;
  dateOfBirth: Date | null;
}): { birthDay: number | null; birthMonth: number | null } {
  if (person.birthDay && person.birthMonth) {
    return { birthDay: person.birthDay, birthMonth: person.birthMonth };
  }
  if (person.dateOfBirth) {
    const dob = new Date(person.dateOfBirth);
    return {
      birthMonth: dob.getUTCMonth() + 1,
      birthDay: dob.getUTCDate(),
    };
  }
  return { birthDay: null, birthMonth: null };
}

/**
 * Detects upcoming birthdays for Today (Day-Of) and Tomorrow (T-1) anchored in Africa/Lagos (WAT UTC+1).
 * Accurately handles leap-year Feb 29 mapping to Feb 28 in non-leap years.
 */
export async function getUpcomingBirthdays(options?: {
  churchId?: string;
  refDate?: Date;
  targetDate?: Date;
}): Promise<{
  todayCelebrants: BirthdayCelebrant[];
  tomorrowCelebrants: BirthdayCelebrant[];
  nigerianDate: { year: number; month: number; dayOfMonth: number };
}> {
  const refDate = options?.refDate || options?.targetDate || new Date();
  const ngTime = getNigerianTimeInfo(refDate);

  const year = ngTime.year;
  const month = ngTime.month;
  const day = ngTime.dayOfMonth;

  // Resolve tomorrow's calendar date in WAT
  const tomorrowUtc = new Date(Date.UTC(year, month - 1, day + 1));
  const tYear = tomorrowUtc.getUTCFullYear();
  const tMonth = tomorrowUtc.getUTCMonth() + 1;
  const tDay = tomorrowUtc.getUTCDate();

  // Find target church
  const churchWhere = options?.churchId ? { id: options.churchId } : {};
  const church = await prisma.church.findFirst({ where: churchWhere });

  // Query all active members with birthday fields
  const people = await prisma.person.findMany({
    where: {
      isActive: true,
      ...(church ? { churchId: church.id } : {}),
      OR: [
        { AND: [{ birthDay: { not: null } }, { birthMonth: { not: null } }] },
        { dateOfBirth: { not: null } },
      ],
    },
  });

  const todayCelebrants: BirthdayCelebrant[] = [];
  const tomorrowCelebrants: BirthdayCelebrant[] = [];

  for (const person of people) {
    const { birthDay, birthMonth } = extractBirthDayMonth(person);
    if (!birthDay || !birthMonth) continue;

    const isLeapDayBorn = birthMonth === 2 && birthDay === 29;
    const dept = person.status === 'FIRST_TIMER'
      ? 'First-Timer'
      : 'Youth Member';
    const birthDateFormatted = formatBirthdayDate(birthMonth, birthDay);

    // 1. Check if Today (Day-Of)
    let isToday = false;
    if (birthMonth === month && birthDay === day) {
      isToday = true;
    } else if (isLeapDayBorn && !isLeapYear(year) && month === 2 && day === 28) {
      // In non-leap year, Feb 29 celebrants celebrate on Feb 28
      isToday = true;
    }

    // 2. Check if Tomorrow (T-1)
    let isTomorrow = false;
    if (birthMonth === tMonth && birthDay === tDay) {
      isTomorrow = true;
    } else if (isLeapDayBorn && !isLeapYear(tYear) && tMonth === 2 && tDay === 28) {
      // In non-leap year, Feb 29 celebrants have T-1 alert on Feb 27
      isTomorrow = true;
    }

    const daysUntil = isToday ? 0 : isTomorrow ? 1 : calculateDaysUntilBirthday(birthMonth, birthDay, month, day, year);

    const celebrantRecord: BirthdayCelebrant = {
      personId: person.id,
      firstName: person.firstName,
      lastName: person.lastName,
      fullName: `${person.firstName} ${person.lastName}`.trim(),
      phone: person.phone,
      photoUrl: person.photoUrl,
      department: dept,
      category: person.category,
      subCategory: person.subCategory,
      birthDay,
      birthMonth,
      birthDateFormatted,
      isLeapDayBorn,
      daysUntil,
      isToday,
      isTomorrow,
    };

    if (isToday) {
      todayCelebrants.push(celebrantRecord);
    }
    if (isTomorrow) {
      tomorrowCelebrants.push(celebrantRecord);
    }
  }

  return {
    todayCelebrants,
    tomorrowCelebrants,
    nigerianDate: { year, month, dayOfMonth: day },
  };
}

/**
 * Executes the complete automated birthday pipeline:
 * 1. Dispatches T-1 alerts to Media Team Telegram for flyer preparation.
 * 2. Dispatches Day-Of celebration alerts to Church/Media Telegram.
 * 3. Dispatches 0-token direct greetings to celebrant DMs via multi-provider direct dispatch.
 * 4. Strictly logs all dispatches in BirthdayReminderLog with @@unique([personId, year, type]).
 */
const inFlightBirthdayPipelineMap = new Map<string, Promise<BirthdayPipelineResult>>();

export async function runBirthdayPipeline(
  options?: BirthdayPipelineOptions
): Promise<BirthdayPipelineResult> {
  if (options?.force) {
    return internalRunBirthdayPipeline(options);
  }

  const lockKey = `${options?.churchId || 'default'}:${options?.targetDate ? options.targetDate.toISOString().slice(0, 10) : 'today'}:${Boolean(options?.dryRun)}`;
  const existingPromise = inFlightBirthdayPipelineMap.get(lockKey);

  if (existingPromise) {
    const leaderResult = await existingPromise;
    return {
      ...leaderResult,
      logsCreated: 0,
      tMinus1: {
        ...leaderResult.tMinus1,
        mediaAlertsSent: 0,
        skippedAlreadyLogged: leaderResult.tMinus1.mediaAlertsSent + leaderResult.tMinus1.skippedAlreadyLogged,
      },
      dayOf: {
        ...leaderResult.dayOf,
        mediaAlertsSent: 0,
        memberDmsSent: 0,
        skippedAlreadyLogged: (leaderResult.dayOf.mediaAlertsSent || 0) + leaderResult.dayOf.skippedAlreadyLogged,
      },
      stats: {
        ...leaderResult.stats,
        tMinus1Dispatched: 0,
        tMinus1Skipped: leaderResult.stats.tMinus1Dispatched + leaderResult.stats.tMinus1Skipped,
        dayOfDispatched: 0,
        dayOfSkipped: leaderResult.stats.dayOfDispatched + leaderResult.stats.dayOfSkipped,
        directDmDispatched: 0,
        directDmSkipped: leaderResult.stats.directDmDispatched + leaderResult.stats.directDmSkipped,
      },
    };
  }

  const pipelinePromise = internalRunBirthdayPipeline(options);
  inFlightBirthdayPipelineMap.set(lockKey, pipelinePromise);

  try {
    return await pipelinePromise;
  } finally {
    inFlightBirthdayPipelineMap.delete(lockKey);
  }
}

async function internalRunBirthdayPipeline(
  options?: BirthdayPipelineOptions
): Promise<BirthdayPipelineResult> {
  const startTime = Date.now();
  const targetDate = options?.targetDate || options?.refDate || new Date();
  const dryRun = Boolean(options?.dryRun);

  const ngTime = getNigerianTimeInfo(targetDate);
  const currentYear = ngTime.year;
  const targetDateWat = `${currentYear}-${String(ngTime.month).padStart(2, '0')}-${String(ngTime.dayOfMonth).padStart(2, '0')}`;

  // 1. Detect upcoming celebrants
  const { todayCelebrants, tomorrowCelebrants } = await getUpcomingBirthdays({
    churchId: options?.churchId,
    targetDate,
  });

  const tMinus1Details: Array<{ personId: string; name: string; status: string; error?: string }> = [];
  const dayOfDetails: Array<{ personId: string; name: string; status: string; error?: string }> = [];
  const directDmDetails: Array<{ personId: string; name: string; status: string; waMeUrl?: string; error?: string }> = [];
  const errors: Array<{ personId: string; type: string; error: string }> = [];

  let tMinus1Sent = 0;
  let tMinus1Skipped = 0;
  let tMinus1Failed = 0;

  let dayOfSent = 0;
  let dayOfSkipped = 0;
  let dayOfFailed = 0;

  let directDmSent = 0;
  let directDmFallbackWaMe = 0;
  let directDmSkipped = 0;

  let logsCreated = 0;

  // -------------------------------------------------------------
  // Stage 1: T-1 Media Flyer Alerts (Tomorrow Celebrants)
  // -------------------------------------------------------------
  for (const celebrant of tomorrowCelebrants) {
    try {
      // Check existing log for idempotency
      const existingLog = await prisma.birthdayReminderLog.findUnique({
        where: {
          personId_year_type: {
            personId: celebrant.personId,
            year: currentYear,
            type: BIRTHDAY_REMINDER_TYPES.T_MINUS_1_MEDIA,
          },
        },
      });

      if (existingLog && !options?.force) {
        tMinus1Skipped++;
        tMinus1Details.push({
          personId: celebrant.personId,
          name: celebrant.fullName,
          status: 'SKIPPED_ALREADY_LOGGED',
        });
        continue;
      }

      // Dispatch Telegram Media Alert
      const alertResult = await sendMediaBirthdayAlert(
        {
          celebrantId: celebrant.personId,
          celebrantName: celebrant.fullName,
          department: celebrant.department,
          birthDateFormatted: celebrant.birthDateFormatted,
          phone: celebrant.phone,
          photoUrl: celebrant.photoUrl,
          daysUntilBirthday: 1,
          isTomorrow: true,
        },
        { dryRun }
      );

      if (!alertResult.success) {
        tMinus1Failed++;
        errors.push({
          personId: celebrant.personId,
          type: 'T_MINUS_1_MEDIA_TELEGRAM',
          error: alertResult.error || 'Telegram dispatch failed',
        });
        tMinus1Details.push({
          personId: celebrant.personId,
          name: celebrant.fullName,
          status: 'FAILED',
          error: alertResult.error,
        });
        continue;
      }

      // Record dispatch log with race-condition catch
      try {
        await prisma.birthdayReminderLog.create({
          data: {
            personId: celebrant.personId,
            year: currentYear,
            type: BIRTHDAY_REMINDER_TYPES.T_MINUS_1_MEDIA,
            status: alertResult.dryRun ? 'SENT' : 'SENT',
          },
        });
        logsCreated++;
      } catch (logErr: unknown) {
        // Gracefully ignore P2002 duplicate key collisions
        const errObj = logErr as { code?: string };
        if (errObj.code !== 'P2002') {
          console.warn('Non-fatal error creating BirthdayReminderLog:', logErr);
        }
      }

      tMinus1Sent++;
      tMinus1Details.push({
        personId: celebrant.personId,
        name: celebrant.fullName,
        status: alertResult.dryRun ? 'DRY_RUN_SIMULATED' : 'DISPATCHED',
      });
    } catch (err: unknown) {
      tMinus1Failed++;
      const msg = err instanceof Error ? err.message : String(err);
      errors.push({
        personId: celebrant.personId,
        type: 'T_MINUS_1_MEDIA_EXCEPTION',
        error: msg,
      });
      tMinus1Details.push({
        personId: celebrant.personId,
        name: celebrant.fullName,
        status: 'FAILED',
        error: msg,
      });
    }
  }

  // -------------------------------------------------------------
  // Stage 2: Day-Of Celebration Alerts & Direct Member DMs (Today Celebrants)
  // -------------------------------------------------------------
  for (const celebrant of todayCelebrants) {
    try {
      // Check existing log for idempotency
      const existingLog = await prisma.birthdayReminderLog.findUnique({
        where: {
          personId_year_type: {
            personId: celebrant.personId,
            year: currentYear,
            type: BIRTHDAY_REMINDER_TYPES.DAY_OF_CELEBRATION,
          },
        },
      });

      if (existingLog && !options?.force) {
        dayOfSkipped++;
        directDmSkipped++;
        dayOfDetails.push({
          personId: celebrant.personId,
          name: celebrant.fullName,
          status: 'SKIPPED_ALREADY_LOGGED',
        });
        directDmDetails.push({
          personId: celebrant.personId,
          name: celebrant.fullName,
          status: 'SKIPPED_ALREADY_LOGGED',
        });
        continue;
      }

      // 2A. Telegram Day-Of Broadcast Alert
      const alertResult = await sendMediaBirthdayAlert(
        {
          celebrantId: celebrant.personId,
          celebrantName: celebrant.fullName,
          department: celebrant.department,
          birthDateFormatted: celebrant.birthDateFormatted,
          phone: celebrant.phone,
          photoUrl: celebrant.photoUrl,
          daysUntilBirthday: 0,
          isToday: true,
        },
        { dryRun }
      );

      if (alertResult.success) {
        dayOfSent++;
        dayOfDetails.push({
          personId: celebrant.personId,
          name: celebrant.fullName,
          status: alertResult.dryRun ? 'DRY_RUN_SIMULATED' : 'DISPATCHED',
        });
      } else {
        dayOfFailed++;
        errors.push({
          personId: celebrant.personId,
          type: 'DAY_OF_TELEGRAM',
          error: alertResult.error || 'Day-of broadcast failed',
        });
      }

      // 2B. Direct Member DM (WhatsApp/SMS with wa.me fallback)
      const renderedGreeting = renderTemplate('BIRTHDAY_DAY_OF_DM', {
        firstName: celebrant.firstName,
        lastName: celebrant.lastName,
        fullName: celebrant.fullName,
        department: celebrant.department,
        subCategory: celebrant.subCategory,
        category: celebrant.category,
        birthDateFormatted: celebrant.birthDateFormatted,
        phone: celebrant.phone,
      });

      let waMeUrl = '';
      if (dryRun) {
        const normPhone = normalizePhoneNumber(celebrant.phone);
        waMeUrl = generateWaMeLink(normPhone.digitsOnly, renderedGreeting.text);
        directDmSent++;
        directDmDetails.push({
          personId: celebrant.personId,
          name: celebrant.fullName,
          status: 'DRY_RUN_SIMULATED',
          waMeUrl,
        });
      } else {
        const dispatchResult = await dispatchDirectMessage({
          to: celebrant.phone,
          body: renderedGreeting.text,
          channel: 'AUTO',
          recipientName: celebrant.fullName,
        });

        waMeUrl = dispatchResult.waMeUrl;

        if (dispatchResult.status === 'DELIVERED' || dispatchResult.status === 'QUEUED') {
          directDmSent++;
        } else {
          directDmFallbackWaMe++;
        }

        directDmDetails.push({
          personId: celebrant.personId,
          name: celebrant.fullName,
          status: dispatchResult.status,
          waMeUrl: dispatchResult.waMeUrl,
        });
      }

      // 2C. Log Day-Of Celebration in DB
      try {
        await prisma.birthdayReminderLog.create({
          data: {
            personId: celebrant.personId,
            year: currentYear,
            type: BIRTHDAY_REMINDER_TYPES.DAY_OF_CELEBRATION,
            status: 'SENT',
          },
        });
        logsCreated++;
      } catch (logErr: unknown) {
        const errObj = logErr as { code?: string };
        if (errObj.code !== 'P2002') {
          console.warn('Non-fatal error creating BirthdayReminderLog:', logErr);
        }
      }
    } catch (err: unknown) {
      dayOfFailed++;
      const msg = err instanceof Error ? err.message : String(err);
      errors.push({
        personId: celebrant.personId,
        type: 'DAY_OF_EXCEPTION',
        error: msg,
      });
      dayOfDetails.push({
        personId: celebrant.personId,
        name: celebrant.fullName,
        status: 'FAILED',
        error: msg,
      });
    }
  }

  const durationMs = Date.now() - startTime;

  return {
    success: errors.length === 0 || tMinus1Sent > 0 || dayOfSent > 0,
    timestamp: new Date().toISOString(),
    targetDateWat,
    referenceDateLagos: targetDateWat,
    year: currentYear,
    durationMs,
    dryRun,
    tMinus1: {
      celebrantsCount: tomorrowCelebrants.length,
      mediaAlertsSent: tMinus1Sent,
      skippedAlreadyLogged: tMinus1Skipped,
      failed: tMinus1Failed,
      celebrantIds: tomorrowCelebrants.map((c) => c.personId),
    },
    dayOf: {
      celebrantsCount: todayCelebrants.length,
      mediaAlertsSent: dayOfSent,
      memberDmsSent: directDmSent,
      memberDmsFallbackWaMe: directDmFallbackWaMe,
      skippedAlreadyLogged: dayOfSkipped,
      failed: dayOfFailed,
      celebrantIds: todayCelebrants.map((c) => c.personId),
    },
    logsCreated,
    totalCelebrants: tomorrowCelebrants.length + todayCelebrants.length,
    stats: {
      tMinus1Detected: tomorrowCelebrants.length,
      tMinus1Dispatched: tMinus1Sent,
      tMinus1Skipped: tMinus1Skipped,
      dayOfDetected: todayCelebrants.length,
      dayOfDispatched: dayOfSent,
      dayOfSkipped: dayOfSkipped,
      directDmDetected: todayCelebrants.length,
      directDmDispatched: directDmSent,
      directDmSkipped: directDmSkipped,
      totalErrors: errors.length,
    },
    details: {
      tMinus1: tMinus1Details,
      dayOf: dayOfDetails,
      directDms: directDmDetails,
    },
    errors,
  };
}
