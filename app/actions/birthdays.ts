'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { getNigerianTimeInfo } from '@/lib/service-resolver';
import { renderTemplate, formatBirthdayDate } from '@/lib/template-engine';
import { dispatchDirectMessage, generateWaMeLink, normalizePhoneNumber } from '@/lib/direct-dispatch';
import { sendMediaBirthdayAlert } from '@/lib/telegram';
import { runBirthdayPipeline, calculateDaysUntilBirthday } from '@/lib/birthday-engine';
import { requireStaffSession } from './auth';

export type BirthdayTimeframeFilter =
  | 'ALL'
  | 'TODAY'
  | 'TOMORROW'
  | 'NEXT_7_DAYS'
  | 'THIS_MONTH';

export interface BirthdayMetrics {
  todayCount: number;
  tomorrowCount: number;
  next7DaysCount: number;
  monthCount: number;
  totalCelebrantsThisYear: number;
  totalLogsCount: number;
  pendingFlyersCount: number;
  lastUpdatedWat: string;
  currentYear?: number;
  currentMonth?: number;
  currentDay?: number;
  isLast7DaysOfMonth?: boolean;
}

export interface BirthdayCelebrantItem {
  personId: string;
  firstName: string;
  lastName: string;
  fullName: string;
  phone: string;
  formattedPhone: string;
  phoneLast4: string;
  category: string;
  subCategory: string | null;
  department: string;
  photoUrl: string | null;
  birthDay: number;
  birthMonth: number;
  birthDateFormatted: string;
  daysUntil: number;
  isToday: boolean;
  isTomorrow: boolean;
  tMinus1Log?: {
    id: string;
    status: string; // 'SENT' | 'ACKNOWLEDGED' | 'FLYER_READY'
    flyerUrl?: string | null;
    sentAt: string;
  } | null;
  dayOfLog?: {
    id: string;
    status: string;
    sentAt: string;
  } | null;
  deterministicGreeting: string;
  waMeGreetingUrl: string;
}

export interface BirthdayAuditLogItem {
  id: string;
  personId: string;
  personName: string;
  department: string;
  year: number;
  type: string;
  status: string;
  flyerUrl?: string | null;
  sentAtFormatted: string;
  sentAtIso: string;
}

export interface BirthdayDashboardResponse {
  success: boolean;
  metrics: BirthdayMetrics;
  celebrants: BirthdayCelebrantItem[];
  flyerQueueCelebrants?: BirthdayCelebrantItem[];
  recentLogs: BirthdayAuditLogItem[];
  error?: string;
}

/**
 * 1. Fetch Birthday Dashboard Metrics, Celebrant Queue & Recent Logs
 */
export async function getBirthdayDashboardAction(filters: {
  timeframe?: BirthdayTimeframeFilter;
  searchQuery?: string;
} = {}): Promise<BirthdayDashboardResponse> {
  try {
    const auth = await requireStaffSession(['MEDIA', 'ADMIN']);
    if (!auth.authorized) {
      return {
        success: false,
        metrics: {
          todayCount: 0,
          tomorrowCount: 0,
          next7DaysCount: 0,
          monthCount: 0,
          totalCelebrantsThisYear: 0,
          totalLogsCount: 0,
          pendingFlyersCount: 0,
          lastUpdatedWat: '',
        },
        celebrants: [],
        recentLogs: [],
        error: auth.error || 'Unauthorized staff access.',
      };
    }

    const ngTime = getNigerianTimeInfo();
    const currentYear = ngTime.year;
    const currentMonth = ngTime.month;
    const currentDay = ngTime.dayOfMonth;

    // Fetch active church
    const church = await prisma.church.findFirst();

    // Query active members with birthday info
    const people = await prisma.person.findMany({
      where: {
        isActive: true,
        ...(church ? { churchId: church.id } : {}),
        OR: [
          { AND: [{ birthDay: { not: null } }, { birthMonth: { not: null } }] },
          { dateOfBirth: { not: null } },
        ],
      },
      include: {
        birthdayLogs: {
          where: { year: currentYear },
        },
      },
      orderBy: [{ birthMonth: 'asc' }, { birthDay: 'asc' }],
    });

    let todayCount = 0;
    let tomorrowCount = 0;
    let next7DaysCount = 0;
    let monthCount = 0;
    let pendingFlyersCount = 0;

    const formattedCelebrants: BirthdayCelebrantItem[] = [];

    for (const p of people) {
      let bMonth = p.birthMonth;
      let bDay = p.birthDay;

      if ((!bMonth || !bDay) && p.dateOfBirth) {
        const dob = new Date(p.dateOfBirth);
        bMonth = dob.getUTCMonth() + 1;
        bDay = dob.getUTCDate();
      }

      if (!bMonth || !bDay) continue;

      const daysUntil = calculateDaysUntilBirthday(bMonth, bDay, currentMonth, currentDay, currentYear);
      const isToday = daysUntil === 0;
      const isTomorrow = daysUntil === 1;
      const isNext7Days = daysUntil >= 0 && daysUntil <= 7;
      const isThisMonth = bMonth === currentMonth && daysUntil <= 31;

      if (isToday) todayCount++;
      if (isTomorrow) tomorrowCount++;
      if (isNext7Days) next7DaysCount++;
      if (isThisMonth) monthCount++;

      const tMinus1Log = p.birthdayLogs.find((l) => l.type === 'GRAPHICS_T_MINUS_1') || null;
      const dayOfLog = p.birthdayLogs.find((l) => l.type === 'DAY_OF_CELEBRATION') || null;

      if ((isToday || isTomorrow) && (!tMinus1Log || tMinus1Log.status !== 'FLYER_READY')) {
        pendingFlyersCount++;
      }

      const normPhone = normalizePhoneNumber(p.phone);
      const dept = p.status === 'FIRST_TIMER' ? 'First-Timer' : 'Youth Member';
      const birthDateFormatted = formatBirthdayDate(bMonth, bDay);

      // Pre-render 0-token celebratory message
      const renderedGreeting = renderTemplate('BIRTHDAY_DAY_OF_DM', {
        firstName: p.firstName,
        lastName: p.lastName,
        fullName: `${p.firstName} ${p.lastName}`,
        department: dept,
        subCategory: p.subCategory,
        category: p.category,
        birthDateFormatted,
        churchName: church?.name || 'RCCG Jesus Covenant Zone',
      });

      const waMeUrl = generateWaMeLink(normPhone.digitsOnly, renderedGreeting.text);

      formattedCelebrants.push({
        personId: p.id,
        firstName: p.firstName,
        lastName: p.lastName,
        fullName: `${p.firstName} ${p.lastName}`.trim(),
        phone: p.phone,
        formattedPhone: normPhone.formattedNational || p.phone,
        phoneLast4: p.phoneLast4,
        category: p.category,
        subCategory: p.subCategory,
        department: dept,
        photoUrl: p.photoUrl,
        birthDay: bDay,
        birthMonth: bMonth,
        birthDateFormatted,
        daysUntil,
        isToday,
        isTomorrow,
        tMinus1Log: tMinus1Log
          ? {
              id: tMinus1Log.id,
              status: tMinus1Log.status,
              flyerUrl: tMinus1Log.flyerUrl,
              sentAt: tMinus1Log.sentAt.toISOString(),
            }
          : null,
        dayOfLog: dayOfLog
          ? {
              id: dayOfLog.id,
              status: dayOfLog.status,
              sentAt: dayOfLog.sentAt.toISOString(),
            }
          : null,
        deterministicGreeting: renderedGreeting.text,
        waMeGreetingUrl: waMeUrl,
      });
    }

    // Filter celebrants by timeframe
    const activeTimeframe = filters.timeframe || 'ALL';
    let filtered = formattedCelebrants;

    switch (activeTimeframe) {
      case 'TODAY':
        filtered = formattedCelebrants.filter((c) => c.isToday);
        break;
      case 'TOMORROW':
        filtered = formattedCelebrants.filter((c) => c.isTomorrow);
        break;
      case 'NEXT_7_DAYS':
        filtered = formattedCelebrants.filter((c) => c.daysUntil >= 0 && c.daysUntil <= 7);
        break;
      case 'THIS_MONTH':
        filtered = formattedCelebrants.filter((c) => c.birthMonth === currentMonth && c.daysUntil <= 31);
        break;
      case 'ALL':
      default:
        break;
    }

    // Apply search query filter
    const query = (filters.searchQuery || '').trim().toLowerCase();
    if (query) {
      filtered = filtered.filter(
        (c) =>
          c.fullName.toLowerCase().includes(query) ||
          c.phone.includes(query) ||
          c.phoneLast4.includes(query) ||
          c.department.toLowerCase().includes(query)
      );
    }

    // Sort by daysUntil asc
    filtered.sort((a, b) => a.daysUntil - b.daysUntil);

    // Unfiltered next-7-days queue for MediaFlyerQueue so it does not inherit active timeframe filters
    const flyerQueueCelebrants = formattedCelebrants
      .filter((c) => c.daysUntil <= 7)
      .sort((a, b) => a.daysUntil - b.daysUntil);

    // Fetch recent 20 reminder logs
    const recentLogs = await prisma.birthdayReminderLog.findMany({
      where: church ? { person: { churchId: church.id } } : {},
      orderBy: { sentAt: 'desc' },
      take: 20,
      include: {
        person: {
          select: { firstName: true, lastName: true, status: true },
        },
      },
    });

    const formattedLogs: BirthdayAuditLogItem[] = recentLogs.map((l) => ({
      id: l.id,
      personId: l.personId,
      personName: `${l.person.firstName} ${l.person.lastName}`.trim(),
      department: l.person.status === 'FIRST_TIMER' ? 'First-Timer' : 'Youth Member',
      year: l.year,
      type: l.type,
      status: l.status,
      flyerUrl: l.flyerUrl,
      sentAtIso: l.sentAt.toISOString(),
      sentAtFormatted: l.sentAt.toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      }),
    }));

    const totalLogsCount = await prisma.birthdayReminderLog.count({
      where: church ? { person: { churchId: church.id } } : {},
    });

    const daysInCurrentMonth = new Date(Date.UTC(currentYear, currentMonth, 0)).getUTCDate();
    const isLast7DaysOfMonth = daysInCurrentMonth - currentDay < 7;

    return {
      success: true,
      metrics: {
        todayCount,
        tomorrowCount,
        next7DaysCount,
        monthCount,
        totalCelebrantsThisYear: formattedCelebrants.length,
        totalLogsCount,
        pendingFlyersCount,
        lastUpdatedWat: `${ngTime.formatted12Hour} WAT`,
        currentYear,
        currentMonth,
        currentDay,
        isLast7DaysOfMonth,
      },
      celebrants: filtered,
      flyerQueueCelebrants,
      recentLogs: formattedLogs,
    };
  } catch (error) {
    console.error('Error in getBirthdayDashboardAction:', error);
    return {
      success: false,
      metrics: {
        todayCount: 0,
        tomorrowCount: 0,
        next7DaysCount: 0,
        monthCount: 0,
        totalCelebrantsThisYear: 0,
        totalLogsCount: 0,
        pendingFlyersCount: 0,
        lastUpdatedWat: '',
      },
      celebrants: [],
      recentLogs: [],
      error: error instanceof Error ? error.message : 'Failed to retrieve birthday dashboard',
    };
  }
}

/**
 * 2. Manual Trigger for Birthday Daily Pipeline (T-1 Media + Day-Of DMs)
 */
export async function triggerBirthdayCronAction(): Promise<{
  success: boolean;
  message: string;
  telemetry?: unknown;
  error?: string;
}> {
  try {
    const auth = await requireStaffSession(['MEDIA', 'ADMIN']);
    if (!auth.authorized) {
      return { success: false, message: '', error: auth.error || 'Unauthorized staff access.' };
    }

    const pipelineResult = await runBirthdayPipeline();
    revalidatePath('/birthdays');

    const t1Sent = pipelineResult.tMinus1.mediaAlertsSent;
    const dayOfDms = pipelineResult.dayOf.memberDmsSent;

    return {
      success: true,
      message: `Birthday pipeline executed: ${t1Sent} T-1 flyer alerts dispatched, ${dayOfDms} day-of greetings sent.`,
      telemetry: pipelineResult,
    };
  } catch (error) {
    console.error('Error triggering birthday cron action:', error);
    return {
      success: false,
      message: '',
      error: error instanceof Error ? error.message : 'Failed to trigger birthday pipeline',
    };
  }
}

/**
 * 3. Manual 1-Click Dispatch or Resend Alert
 */
export async function dispatchManualBirthdayAlertAction(params: {
  personId: string;
  type: 'T_MINUS_1_MEDIA' | 'DAY_OF_CELEBRATION' | 'DIRECT_MEMBER_DM';
}): Promise<{
  success: boolean;
  message: string;
  waMeUrl?: string;
  error?: string;
}> {
  try {
    const auth = await requireStaffSession(['MEDIA', 'ADMIN']);
    if (!auth.authorized) {
      return { success: false, message: '', error: auth.error || 'Unauthorized staff access.' };
    }

    const ngTime = getNigerianTimeInfo();
    const person = await prisma.person.findUnique({
      where: { id: params.personId },
    });

    if (!person) {
      return { success: false, message: '', error: 'Member not found.' };
    }

    const dept = person.status === 'FIRST_TIMER' ? 'First-Timer' : 'Youth Member';
    const birthDateFormatted = formatBirthdayDate(person.birthMonth, person.birthDay);

    if (params.type === 'T_MINUS_1_MEDIA') {
      let bMonth = person.birthMonth;
      let bDay = person.birthDay;
      if ((!bMonth || !bDay) && person.dateOfBirth) {
        const dob = new Date(person.dateOfBirth);
        bMonth = dob.getUTCMonth() + 1;
        bDay = dob.getUTCDate();
      }

      const daysUntil =
        bMonth && bDay
          ? calculateDaysUntilBirthday(bMonth, bDay, ngTime.month, ngTime.dayOfMonth, ngTime.year)
          : 1;

      const telegramResult = await sendMediaBirthdayAlert({
        celebrantId: person.id,
        celebrantName: `${person.firstName} ${person.lastName}`.trim(),
        department: dept,
        birthDateFormatted,
        phone: person.phone,
        photoUrl: person.photoUrl,
        daysUntilBirthday: daysUntil,
        isTomorrow: daysUntil === 1,
        isToday: daysUntil === 0,
      });

      await prisma.birthdayReminderLog.upsert({
        where: {
          personId_year_type: {
            personId: person.id,
            year: ngTime.year,
            type: 'GRAPHICS_T_MINUS_1',
          },
        },
        create: {
          personId: person.id,
          year: ngTime.year,
          type: 'GRAPHICS_T_MINUS_1',
          status: 'SENT',
        },
        update: {
          status: 'SENT',
          sentAt: new Date(),
        },
      });

      revalidatePath('/birthdays');
      return {
        success: telegramResult.success,
        message: telegramResult.dryRun
          ? `[Dry-run] Media flyer alert simulated for ${person.firstName}.`
          : `Media flyer alert sent to Telegram bot for ${person.firstName}.`,
      };
    }

    if (params.type === 'DIRECT_MEMBER_DM') {
      const church = await prisma.church.findFirst();
      const greeting = renderTemplate('BIRTHDAY_DAY_OF_DM', {
        firstName: person.firstName,
        lastName: person.lastName,
        fullName: `${person.firstName} ${person.lastName}`.trim(),
        department: dept,
        subCategory: person.subCategory,
        category: person.category,
        birthDateFormatted,
        churchName: church?.name || 'RCCG Jesus Covenant Zone',
      });

      const dispatchResult = await dispatchDirectMessage({
        to: person.phone,
        body: greeting.text,
        channel: 'AUTO',
        recipientName: `${person.firstName} ${person.lastName}`.trim(),
      });

      await prisma.birthdayReminderLog.upsert({
        where: {
          personId_year_type: {
            personId: person.id,
            year: ngTime.year,
            type: 'DAY_OF_CELEBRATION',
          },
        },
        create: {
          personId: person.id,
          year: ngTime.year,
          type: 'DAY_OF_CELEBRATION',
          status: dispatchResult.status === 'DELIVERED' ? 'SENT' : 'ACKNOWLEDGED',
        },
        update: {
          status: dispatchResult.status === 'DELIVERED' ? 'SENT' : 'ACKNOWLEDGED',
          sentAt: new Date(),
        },
      });

      revalidatePath('/birthdays');
      return {
        success: dispatchResult.success,
        message: `Birthday greeting processed via ${dispatchResult.provider} (${dispatchResult.status}).`,
        waMeUrl: dispatchResult.waMeUrl,
      };
    }

    if (params.type === 'DAY_OF_CELEBRATION') {
      const telegramResult = await sendMediaBirthdayAlert({
        celebrantId: person.id,
        celebrantName: `${person.firstName} ${person.lastName}`.trim(),
        department: dept,
        birthDateFormatted,
        phone: person.phone,
        photoUrl: person.photoUrl,
        daysUntilBirthday: 0,
        isToday: true,
      });

      await prisma.birthdayReminderLog.upsert({
        where: {
          personId_year_type: {
            personId: person.id,
            year: ngTime.year,
            type: 'DAY_OF_CELEBRATION',
          },
        },
        create: {
          personId: person.id,
          year: ngTime.year,
          type: 'DAY_OF_CELEBRATION',
          status: 'SENT',
        },
        update: {
          status: 'SENT',
          sentAt: new Date(),
        },
      });

      revalidatePath('/birthdays');
      return {
        success: telegramResult.success,
        message: telegramResult.dryRun
          ? `[Dry-run] Day-of celebration alert simulated for ${person.firstName}.`
          : `Day-of celebration alert sent to Telegram bot for ${person.firstName}.`,
      };
    }

    return { success: false, message: '', error: 'Unsupported alert type.' };
  } catch (error) {
    console.error('Error dispatching manual birthday alert:', error);
    return {
      success: false,
      message: '',
      error: error instanceof Error ? error.message : 'Dispatch failed',
    };
  }
}

/**
 * 4. Update Graphic Flyer URL & Status
 */
export async function updateFlyerStatusAction(params: {
  personId: string;
  year?: number;
  flyerUrl?: string;
  status: 'SENT' | 'ACKNOWLEDGED' | 'FLYER_READY';
}): Promise<{ success: boolean; message: string; error?: string }> {
  try {
    const auth = await requireStaffSession(['MEDIA', 'ADMIN']);
    if (!auth.authorized) {
      return { success: false, message: '', error: auth.error || 'Unauthorized staff access.' };
    }

    const ngTime = getNigerianTimeInfo();
    const targetYear = params.year || ngTime.year;

    await prisma.birthdayReminderLog.upsert({
      where: {
        personId_year_type: {
          personId: params.personId,
          year: targetYear,
          type: 'GRAPHICS_T_MINUS_1',
        },
      },
      create: {
        personId: params.personId,
        year: targetYear,
        type: 'GRAPHICS_T_MINUS_1',
        status: params.status,
        flyerUrl: params.flyerUrl?.trim() || null,
      },
      update: {
        status: params.status,
        flyerUrl: params.flyerUrl?.trim() || undefined,
        sentAt: new Date(),
      },
    });

    revalidatePath('/birthdays');
    return {
      success: true,
      message: `Flyer status updated to "${params.status}".`,
    };
  } catch (error) {
    console.error('Error updating flyer status:', error);
    return {
      success: false,
      message: '',
      error: error instanceof Error ? error.message : 'Failed to update flyer status',
    };
  }
}
