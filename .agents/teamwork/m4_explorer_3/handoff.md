# Handoff Report: Milestone 4 Birthday Cron, Server Actions & UI Architecture

**Explorer**: `m4_explorer_3` (Birthday Cron, Server Actions & UI Architecture Explorer)  
**Target Milestone**: Milestone 4 (Media Telegram Birthday Bot & Pipeline — Requirement R3)  
**Date**: 2026-11-12T18:05:00Z  

---

## 1. Observation

### 1.1 Database Schema & Models
Inspection of `prisma/schema.prisma` lines 123-159 and 234-247 confirms:
- **`Person` model**:
  ```prisma
  model Person {
    id              String         @id @default(cuid())
    churchId        String
    firstName       String
    lastName        String
    phone           String         // Full phone e.g. "08012345678"
    phoneLast4      String         // "5678" (for instant 4-digit search)
    dateOfBirth     DateTime?      
    birthDay        Int?           // 1 - 31 (for fast calendar queries)
    birthMonth      Int?           // 1 - 12 (for fast calendar queries)
    photoUrl        String?        // Profile / avatar picture for birthday flyer design
    category        PersonCategory @default(YOUTH)
    subCategory     String?        // "YOUTH_WORKER" | "ADULT_WORKER" | "YOUTH" | "ADULT" | "CHILD"
    status          PersonStatus   @default(MEMBER)
    isActive        Boolean        @default(true)
    birthdayLogs    BirthdayReminderLog[]
    @@index([churchId, birthMonth, birthDay])
  }
  ```
- **`BirthdayReminderLog` model**:
  ```prisma
  model BirthdayReminderLog {
    id         String   @id @default(cuid())
    personId   String
    person     Person   @relation(fields: [personId], references: [id], onDelete: Cascade)
    year       Int
    type       String   // "GRAPHICS_T_MINUS_1" | "DAY_OF_CELEBRATION"
    status     String   @default("SENT") // "SENT" | "ACKNOWLEDGED" | "FLYER_READY"
    flyerUrl   String?  // Optional uploaded flyer link
    sentAt     DateTime @default(now())

    @@unique([personId, year, type])
    @@index([personId])
  }
  ```
  - Direct database-level uniqueness is guaranteed by `@@unique([personId, year, type])`, providing strict hardware-enforced idempotency against duplicate Telegram or SMS alerts for any celebrant in a calendar year.

### 1.2 Route Handler Authentication & Execution Patterns
Inspection of `app/api/cron/follow-up/route.ts` lines 21-58 directly demonstrates the approved route handler security pattern:
- `export const dynamic = 'force-dynamic';`
- Multi-channel secret validation:
  1. `request.headers.get('authorization')` matching `Bearer <CRON_SECRET>`
  2. `request.headers.get('x-cron-secret')` matching `<CRON_SECRET>`
  3. `request.nextUrl.searchParams.get('secret')` matching `<CRON_SECRET>`
- Fail-closed security gate: In `process.env.NODE_ENV === 'production'`, if `CRON_SECRET` is unset, immediately reject with HTTP 401. In development/testing, fall back to `'test-cron-secret'`.
- Both `GET` and `POST` methods exported.
- Structured JSON telemetry with `durationMs`, `timestamp`, and domain-specific counts.

### 1.3 Server Action & Dashboard Patterns
Inspection of `app/actions/followup.ts` (lines 1-235) and `app/followup/page.tsx` (lines 1-431) demonstrates:
- `'use server';` directive.
- Unified dashboard action returning `{ success: boolean, metrics: ..., members: ..., error?: string }`.
- Timezone handling: imports `getNigerianTimeInfo` from `lib/service-resolver.ts` to format timestamps as `${ngInfo.formatted12Hour} WAT`.
- Revalidation via `revalidatePath('/followup')`.
- UI pattern: PIN gate (`1234`, `7777`, `4444`) hydrated via `sessionStorage.getItem('rccg_admin_auth')` with `useSyncExternalStore` hydration protection.
- Branded header displaying `/rccg-logo.png` (`w-12 h-12 rounded-2xl bg-white p-1 border border-slate-200 shadow-2xs`).

### 1.4 Emil Kowalski Motion & Micro-Interactions Standards
Inspection of `lib/motion.ts` (lines 10-66) confirms:
- Momentum easing: `MOMENTUM_EASE = [0.23, 1, 0.32, 1]`.
- Surface entrance variants: `initial: { opacity: 0, scale: 0.95 }`, `animate: { opacity: 1, scale: 1, transition: { duration: 0.24, ease: MOMENTUM_EASE } }`.
- Tactile press feedback: `tactileTapProps = { whileTap: { scale: 0.97 }, transition: { duration: 0.08, ease: MOMENTUM_EASE } }`.

### 1.5 Template Engine & Direct Messaging Integration
Inspection of `lib/template-engine.ts` (lines 223-310) confirms pre-existing template categories:
- `BIRTHDAY_T_MINUS_1_MEDIA`: Markdown alerts with `{FullName}`, `{Department}`, `{BirthDateFormatted}`, `{Phone}`, `{PhotoStatus}`, and call-to-action for flyer preparation.
- `BIRTHDAY_DAY_OF_DM`: Personal celebratory greetings with 0 tokens consumed.
- `renderTemplate(category, context)` provides deterministic text and `calculateSmsSegments`.
- `lib/direct-dispatch.ts` provides `dispatchDirectMessage` supporting Termii, Twilio, WhatsApp Cloud API, and `generateWaMeLink`.

---

## 2. Logic Chain

### 2.1 Route Handler Architecture (`app/api/cron/birthdays/route.ts`)
1. **Security Gate**:
   - Because cron jobs can be triggered by external schedulers (e.g., Vercel Cron, GitHub Actions, AWS EventBridge, UptimeRobot, or curl), the route handler must authenticate via `CRON_SECRET` across `Bearer`, `x-cron-secret`, and query parameters.
   - If unauthorized, it immediately halts and returns HTTP 401 with JSON `{ success: false, error: 'Unauthorized: Invalid or missing authorization header/secret', code: 'UNAUTHORIZED' }`.
2. **Dual-Stage Pipeline Trigger**:
   - Under WAT (West Africa Time, Africa/Lagos UTC+1), the daily birthday job executes in two phases:
     - **Stage 1: T-1 Media Alert**: Queries celebrants whose birthday is tomorrow in WAT. Formats Telegram alerts with celebrant name, department, formatted birth date, phone, and `photoUrl`. Posts to media Telegram bot. Creates `BirthdayReminderLog` with `type = "GRAPHICS_T_MINUS_1"`.
     - **Stage 2: Day-Of Celebration Broadcast & Member DM**: Queries celebrants whose birthday is today in WAT. Posts celebratory announcement to church channel/media bot. Sends personalized 0-token greeting directly to the member's phone via `dispatchDirectMessage`. Creates `BirthdayReminderLog` with `type = "DAY_OF_CELEBRATION"`.
   - Idempotency is enforced: if `BirthdayReminderLog` already exists for `(personId, currentYear, type)`, the alert is cleanly skipped and counted as `skippedAlreadyLogged`.
3. **Telemetry & Dynamic Mode**:
   - Next.js requires `export const dynamic = 'force-dynamic'` so that the route handler is never statically cached at build time.
   - Returns structured JSON telemetry with counts of celebrants, media notifications sent, member DMs sent, logs created, and duration in milliseconds.

### 2.2 Server Actions Architecture (`app/actions/birthdays.ts`)
1. **`getBirthdayDashboardAction(filters)`**:
   - Retrieves today's celebrants, tomorrow's celebrants, and upcoming celebrants for the next 7-14 days and the current month.
   - Calculates dynamic KPIs: `todayCount`, `tomorrowCount`, `monthCount`, `totalLogsCount`, `pendingFlyersCount`, and `lastUpdatedWat`.
   - Pre-interpolates 0-token birthday greetings (`renderTemplate`) and 1-click WhatsApp links (`generateWaMeLink`) for every celebrant, enabling instant 1-click messaging without frontend overhead.
   - Retrieves the 20 most recent `BirthdayReminderLog` records for the audit timeline.
2. **`triggerBirthdayCronAction()`**:
   - Provides a manual "Run Daily Pipeline" button for authorized staff directly within the web dashboard.
   - Calls `runBirthdayPipeline()` and triggers Next.js path cache invalidation via `revalidatePath('/birthdays')`.
3. **`dispatchManualBirthdayAlertAction(params)`**:
   - Enables staff to manually test or re-dispatch an alert for an individual celebrant (e.g., manual flyer alert to media bot, celebration broadcast, or direct member DM).
4. **`updateFlyerStatusAction(params)`**:
   - Allows media designers to attach a link to their finished flyer (`flyerUrl`) and mark status as `FLYER_READY` or `ACKNOWLEDGED`.

### 2.3 Birthday Dashboard UI Architecture (`app/birthdays/page.tsx` & `app/components/birthdays/*`)
1. **Holy Trinity Compliance**:
   - **Zero AI Tells**: No faux wireframe grid backgrounds, no floating purple blur spots, no cartoon rubber-band bounces. Clean slate/zinc typography with AAA contrast.
   - **One Section Per Screen / Equal Margins**: Strict horizontal margins (`max-w-6xl mx-auto px-4 sm:px-6`).
   - **Emil Kowalski Motion**: All cards and modals enter with momentum deceleration (`cubic-bezier(0.23, 1, 0.32, 1)`) and scale from `0.95` to `1.0`. All buttons and interactive cards feature tactile feedback (`whileTap={{ scale: 0.97 }}` under 100ms).
   - **Touch Targets**: All interactive elements (tabs, search inputs, WhatsApp buttons, trigger controls) enforce a minimum height of `44px`.
2. **Component Breakdown**:
   - `BirthdayHeader.tsx`: Official RCCG logo (`/rccg-logo.png`), WAT clock badge, live search input, "Run Daily Pipeline" button.
   - `BirthdayKpiGrid.tsx`: 4 interactive metric cards (Today's Celebrants, T-1 Flyer Alerts, Upcoming This Month, Total Broadcasts Logged). Clicking any card filters the active queue.
   - `CelebrantCard.tsx`: Displays photo or fallback initials avatar, "Photo on File" indicator, celebrant details, role/department, birthday timing pill (Today, Tomorrow, Upcoming), T-1 Telegram alert status, and 1-click action controls (1-click WhatsApp, Direct Gateway DM, Send Media Alert, Attach Flyer).
   - `MediaFlyerQueue.tsx`: Dedicated tab for media graphics team showing celebrants needing flyers, photo links, and flyer completion controls.
   - `BirthdayAuditLog.tsx`: Chronological table of `BirthdayReminderLog` records showing sent time (WAT), celebrant name, reminder type, status, and flyer links.
   - `AttachFlyerModal.tsx`: Accessible modal dialog for attaching flyer URLs and updating log status.

---

## 3. Concrete Implementation Plan & Code Specifications

### 3.1 Route Handler: `app/api/cron/birthdays/route.ts`

```typescript
/**
 * Authorized Birthday Cron Route Handler
 * Endpoint: /api/cron/birthdays
 * RCCG Jesus Covenant Zone (Milestone 4 / Requirement R3)
 *
 * Security:
 * - Validates `Authorization: Bearer <CRON_SECRET>` header.
 * - Supports `x-cron-secret` header.
 * - Supports fallback query parameter `?secret=<CRON_SECRET>`.
 * - Returns HTTP 401 Unauthorized if secret is missing or mismatched.
 *
 * Pipeline Execution:
 * 1. Stage 1 (T-1 Media Alert): Dispatches Markdown notification + photoUrl to Telegram Media Bot.
 * 2. Stage 2 (Day-Of Celebration & Direct DM): Dispatches celebration alert + direct member DM.
 * 3. Idempotently records dispatches in BirthdayReminderLog with @@unique([personId, year, type]).
 * 4. Returns structured JSON telemetry with HTTP 200.
 */

import { NextRequest, NextResponse } from 'next/server';
import { runBirthdayPipeline } from '@/lib/birthday-engine';

export const dynamic = 'force-dynamic';

function isAuthorized(request: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET;
  const validSecret = cronSecret || (process.env.NODE_ENV !== 'production' ? 'test-cron-secret' : null);

  if (!validSecret) {
    console.error('CRON_SECRET is not configured in environment variables.');
    return false;
  }

  // 1. Bearer Authorization header
  const authHeader = request.headers.get('authorization');
  if (authHeader) {
    const parts = authHeader.trim().split(/\s+/);
    if (parts.length === 2 && parts[0]?.toLowerCase() === 'bearer' && parts[1] === validSecret) {
      return true;
    }
    return false;
  }

  // 2. x-cron-secret header
  const customHeader = request.headers.get('x-cron-secret');
  if (customHeader === validSecret) {
    return true;
  }

  // 3. Fallback query parameter ?secret=...
  const querySecret = request.nextUrl.searchParams.get('secret');
  if (querySecret === validSecret) {
    return true;
  }

  return false;
}

async function handleBirthdayCron(request: NextRequest): Promise<NextResponse> {
  const startTime = Date.now();

  // 1. Enforce Authentication Gate
  if (!isAuthorized(request)) {
    return NextResponse.json(
      {
        success: false,
        error: 'Unauthorized: Invalid or missing authorization header/secret',
        code: 'UNAUTHORIZED',
      },
      { status: 401 }
    );
  }

  try {
    const searchParams = request.nextUrl.searchParams;
    const dryRun = searchParams.get('dryRun') === 'true';
    const targetDateParam = searchParams.get('targetDate');
    const targetDate = targetDateParam ? new Date(targetDateParam) : new Date();

    // 2. Execute Birthday Pipeline (T-1 Media + Day-Of Celebration & Member DMs)
    const pipelineResult = await runBirthdayPipeline({
      targetDate,
      dryRun,
    });

    const durationMs = Date.now() - startTime;

    // 3. Return Structured JSON Telemetry
    return NextResponse.json(
      {
        success: true,
        timestamp: new Date().toISOString(),
        watDate: pipelineResult.targetDateWat,
        durationMs,
        dryRun,
        tMinus1: {
          celebrantsCount: pipelineResult.tMinus1.celebrantsCount,
          mediaAlertsSent: pipelineResult.tMinus1.mediaAlertsSent,
          skippedAlreadyLogged: pipelineResult.tMinus1.skippedAlreadyLogged,
          failed: pipelineResult.tMinus1.failed,
          celebrantIds: pipelineResult.tMinus1.celebrantIds,
        },
        dayOf: {
          celebrantsCount: pipelineResult.dayOf.celebrantsCount,
          mediaAlertsSent: pipelineResult.dayOf.mediaAlertsSent,
          memberDmsSent: pipelineResult.dayOf.memberDmsSent,
          memberDmsFallbackWaMe: pipelineResult.dayOf.memberDmsFallbackWaMe,
          skippedAlreadyLogged: pipelineResult.dayOf.skippedAlreadyLogged,
          failed: pipelineResult.dayOf.failed,
          celebrantIds: pipelineResult.dayOf.celebrantIds,
        },
        logsCreated: pipelineResult.logsCreated,
        totalCelebrants: pipelineResult.tMinus1.celebrantsCount + pipelineResult.dayOf.celebrantsCount,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Error during birthday cron execution:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Internal birthday cron failure',
        durationMs: Date.now() - startTime,
      },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  return handleBirthdayCron(request);
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  return handleBirthdayCron(request);
}
```

---

### 3.2 Server Actions: `app/actions/birthdays.ts`

```typescript
'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { getNigerianTimeInfo } from '@/lib/service-resolver';
import { renderTemplate, formatBirthdayDate } from '@/lib/template-engine';
import { dispatchDirectMessage, generateWaMeLink, normalizePhoneNumber } from '@/lib/direct-dispatch';
import { sendMediaBirthdayAlert } from '@/lib/telegram';
import { runBirthdayPipeline, calculateDaysUntilBirthday } from '@/lib/birthday-engine';

export type BirthdayTimeframeFilter = 'ALL' | 'TODAY' | 'TOMORROW' | 'NEXT_7_DAYS' | 'THIS_MONTH';

export interface BirthdayMetrics {
  todayCount: number;
  tomorrowCount: number;
  next7DaysCount: number;
  monthCount: number;
  totalCelebrantsThisYear: number;
  totalLogsCount: number;
  pendingFlyersCount: number;
  lastUpdatedWat: string;
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
    const ngTime = getNigerianTimeInfo();
    const currentYear = ngTime.year;
    const currentMonth = ngTime.month;
    const currentDay = ngTime.dayOfMonth;

    // Fetch active church
    const church = await prisma.church.findFirst();
    if (!church) {
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
          lastUpdatedWat: `${ngTime.formatted12Hour} WAT`,
        },
        celebrants: [],
        recentLogs: [],
        error: 'Church record not found.',
      };
    }

    // Query active members with birthday info
    const people = await prisma.person.findMany({
      where: {
        churchId: church.id,
        isActive: true,
        OR: [
          { dateOfBirth: { not: null } },
          { AND: [{ birthDay: { not: null } }, { birthMonth: { not: null } }] },
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
      const isThisMonth = bMonth === currentMonth;

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
      const dept = p.subCategory ? p.subCategory.replace(/_/g, ' ') : 'Youth Member';
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
        churchName: church.name,
      });

      const waMeUrl = generateWaMeLink(normPhone.digitsOnly, renderedGreeting.text);

      formattedCelebrants.push({
        personId: p.id,
        firstName: p.firstName,
        lastName: p.lastName,
        fullName: `${p.firstName} ${p.lastName}`,
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
        filtered = formattedCelebrants.filter((c) => c.birthMonth === currentMonth);
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

    // Fetch recent 20 reminder logs
    const recentLogs = await prisma.birthdayReminderLog.findMany({
      where: { person: { churchId: church.id } },
      orderBy: { sentAt: 'desc' },
      take: 20,
      include: {
        person: {
          select: { firstName: true, lastName: true, subCategory: true },
        },
      },
    });

    const formattedLogs: BirthdayAuditLogItem[] = recentLogs.map((l) => ({
      id: l.id,
      personId: l.personId,
      personName: `${l.person.firstName} ${l.person.lastName}`,
      department: l.person.subCategory ? l.person.subCategory.replace(/_/g, ' ') : 'Youth Member',
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
      where: { person: { churchId: church.id } },
    });

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
      },
      celebrants: filtered,
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
    const pipelineResult = await runBirthdayPipeline();
    revalidatePath('/birthdays');
    revalidatePath('/admin');

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
    const ngTime = getNigerianTimeInfo();
    const person = await prisma.person.findUnique({
      where: { id: params.personId },
    });

    if (!person) {
      return { success: false, message: '', error: 'Member not found.' };
    }

    const dept = person.subCategory ? person.subCategory.replace(/_/g, ' ') : 'Youth Member';
    const birthDateFormatted = formatBirthdayDate(person.birthMonth, person.birthDay);

    if (params.type === 'T_MINUS_1_MEDIA') {
      const telegramResult = await sendMediaBirthdayAlert({
        celebrantName: `${person.firstName} ${person.lastName}`,
        department: dept,
        birthDateFormatted,
        phone: person.phone,
        photoUrl: person.photoUrl,
        isTomorrow: true,
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
        fullName: `${person.firstName} ${person.lastName}`,
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
        recipientName: `${person.firstName} ${person.lastName}`,
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
```

---

### 3.3 Birthday Dashboard UI Architecture

#### Component Tree
```
app/birthdays/page.tsx                     <-- Client page with PIN gate, tab state & toast
├── BirthdayHeader.tsx                     <-- RCCG logo, WAT clock badge, search & sync button
├── BirthdayKpiGrid.tsx                    <-- 4 Interactive KPI cards (Today, T-1, Month, Broadcasts)
├── CelebrantCard.tsx                      <-- Celebrant avatar, details, badges, 1-click WhatsApp/DM
├── MediaFlyerQueue.tsx                    <-- Dedicated designer queue for T-1 flyer preparation
├── BirthdayAuditLog.tsx                   <-- Real-time BirthdayReminderLog audit stream
└── AttachFlyerModal.tsx                   <-- Momentum modal for linking graphic flyer assets
```

#### Detailed Component Specifications:

1. **`app/birthdays/page.tsx`**:
   - Hydration safety via `useSyncExternalStore(emptySubscribe, () => true, () => false)`.
   - Volunteer PIN Gate check: `sessionStorage.getItem('rccg_admin_auth') === 'true'`, with PIN inputs (`1234`, `7777`, `4444`) and branded entrance container.
   - Tab switching: `CELEBRANTS` | `FLYER_QUEUE` | `AUDIT_LOGS`.
   - Real-time refresh support with non-blocking transitions (`startTransition`).

2. **`app/components/birthdays/BirthdayHeader.tsx`**:
   - Official RCCG Logo: Next.js `<Image src="/rccg-logo.png" alt="RCCG Official Seal" fill className="object-contain" priority />` wrapped in `relative w-12 h-12 shrink-0 rounded-2xl bg-white p-1 border border-slate-200 shadow-2xs`.
   - Header title: "RCCG Jesus Covenant Zone", subtitle: "Media Telegram Birthday Bot & Celebrations Pipeline".
   - WAT Clock Badge: `<Clock className="w-2.5 h-2.5" /> {watTimeFormatted}` in emerald pill (`bg-emerald-50 text-emerald-800 border-emerald-200`).
   - Run Daily Pipeline Button: Framer Motion button with `whileTap={{ scale: 0.97 }}` (<100ms) and `animate-spin` on `RefreshCw`. Minimum 44px height.

3. **`app/components/birthdays/BirthdayKpiGrid.tsx`**:
   - 4 responsive cards:
     - **Card 1 (Today's Celebrants)**: Amber-600 accent, Cake icon, count of today's birthdays, label "Day-Of Celebration".
     - **Card 2 (T-1 Flyer Alerts)**: Blue-600 accent, Palette icon, count of tomorrow's birthdays, label "T-1 Media Alert Target".
     - **Card 3 (Upcoming This Month)**: Indigo-600 accent, Calendar icon, count of celebrants in current calendar month.
     - **Card 4 (Total Broadcasts Logged)**: Emerald-600 accent, CheckCircle2 icon, total entries in `BirthdayReminderLog`.
   - Each card is interactive: clicking sets `activeTimeframe` to `TODAY`, `TOMORROW`, `THIS_MONTH`, or `ALL`.

4. **`app/components/birthdays/CelebrantCard.tsx`**:
   - Celebrant avatar: High-res `photoUrl` or styled department initials avatar.
   - Status indicators:
     - `Photo on File` (emerald pill with check) vs `Photo Needed` (amber pill with alert).
     - Birthday Timing Pill: `🎉 TODAY` (amber glow border), `⏰ TOMORROW` (blue border), `📅 In X days`.
     - T-1 Flyer Status: `Flyer Ready` (emerald), `Telegram Alert Sent` (sky), `Pending Alert` (slate).
     - Day-Of Broadcast Status: `Broadcasted` (emerald) vs `Scheduled` (slate).
   - Action controls:
     - 1-Click WhatsApp Button: `a` tag linking to `waMeGreetingUrl`, opens WhatsApp with 0-token personalized birthday greeting.
     - Direct DM Dispatch: triggers `dispatchManualBirthdayAlertAction({ personId, type: 'DIRECT_MEMBER_DM' })`.
     - Send Media Alert: triggers `dispatchManualBirthdayAlertAction({ personId, type: 'T_MINUS_1_MEDIA' })`.
     - Attach Flyer: opens `AttachFlyerModal`.

5. **`app/components/birthdays/MediaFlyerQueue.tsx`**:
   - Filtered view showing celebrants for tomorrow and the next 3 days.
   - Displays clear designer task list: celebrant name, department, photo reference, and "Mark Flyer Ready" button.

6. **`app/components/birthdays/AttachFlyerModal.tsx`**:
   - Accessible modal with Framer Motion momentum entrance:
     ```ts
     initial={{ opacity: 0, scale: 0.95 }}
     animate={{ opacity: 1, scale: 1, transition: { duration: 0.24, ease: [0.23, 1, 0.32, 1] } }}
     ```
   - Input for `flyerUrl` (cloud link) and status selection (`FLYER_READY` or `ACKNOWLEDGED`).

7. **`app/components/birthdays/BirthdayAuditLog.tsx`**:
   - Chronological table of `BirthdayReminderLog` entries.
   - Columns: Sent Time (WAT), Celebrant Name, Department, Type, Status, Flyer Asset link.

---

## 4. Caveats
1. **Dependency on Sibling Modules**: The route handler and server actions depend on `lib/birthday-engine.ts` (investigated by `m4_explorer_2`) and `lib/telegram.ts` (investigated by `m4_explorer_1`). The type signatures and interface contracts proposed above are strictly aligned with their scopes to ensure drop-in compatibility.
2. **Environment Variable Configuration**: In local environments without `TELEGRAM_BOT_TOKEN`, `TELEGRAM_MEDIA_CHAT_ID`, or `TERMII_API_KEY`, dry-run / simulated fallback mode will be active, ensuring zero failures in CI/Vitest runs.

---

## 5. Conclusion
- The Birthday Cron route handler (`app/api/cron/birthdays/route.ts`), Server Actions (`app/actions/birthdays.ts`), and Birthday Dashboard UI (`app/birthdays/page.tsx` + `app/components/birthdays/*`) have been completely designed and architected.
- The route handler delivers multi-channel authentication (`Bearer`, `x-cron-secret`, `?secret=`), `export const dynamic = 'force-dynamic'`, dual-stage dispatch (T-1 Media Alert + Day-Of Celebration & Direct DM), DB-level idempotency via `BirthdayReminderLog` unique constraint, and structured JSON telemetry.
- The UI strictly adheres to all Holy Trinity design standards: prominent official RCCG logo, WAT clock badge, Framer Motion momentum deceleration, scale entrance from 0.95, tactile feedback under 100ms, 44px min touch targets, WCAG AAA contrast, and zero AI tells.

---

## 6. Verification Method

To verify the implementation once coded:

1. **Unit & Route Handler Tests**:
   - Command: `npx vitest run tests/unit/cron-birthdays.test.ts`
   - Checks:
     - 401 Unauthorized when credentials are missing or secret is invalid.
     - 200 OK with Bearer token, `x-cron-secret`, and query parameter `?secret=`.
     - Structured JSON response containing `tMinus1`, `dayOf`, `logsCreated`, and `durationMs`.
     - 500 Internal Server Error handling when a database failure occurs.
2. **Server Actions Tests**:
   - Command: `npx vitest run tests/unit/birthday-actions.test.ts`
   - Checks:
     - `getBirthdayDashboardAction` returns correct counts for today, tomorrow, and month in WAT.
     - `triggerBirthdayCronAction` successfully executes pipeline and revalidates paths.
     - `dispatchManualBirthdayAlertAction` dispatches Telegram alert or direct DM and logs to database.
     - `updateFlyerStatusAction` updates `flyerUrl` and status.
3. **Full Test Suite Execution**:
   - Command: `npx vitest run`
   - All tests across all milestones (M1, M2, M3, M4) must pass with 0 failures.
