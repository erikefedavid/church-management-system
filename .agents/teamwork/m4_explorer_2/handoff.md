# Milestone 4 Technical Investigation & Architecture Handoff Report
## Birthday Detection, Idempotency & Pipeline Engine (Requirement R3)

**Author:** `m4_explorer_2` (Birthday Detection, Idempotency & Pipeline Engine Explorer)  
**Date:** 2026-11-12  
**Target Milestone:** Milestone 4 (Media Telegram Birthday Bot & Pipeline)  
**Status:** COMPLETE (Read-Only Investigation & Architectural Specification)  

---

## 1. Observation

### 1.1 Database Schema (`prisma/schema.prisma`)
Direct inspection of `prisma/schema.prisma` reveals:
1. **`Person` Model (`lines 123-159`):**
   ```prisma
   model Person {
     id              String         @id @default(cuid())
     churchId        String
     church          Church         @relation(fields: [churchId], references: [id], onDelete: Cascade)
     firstName       String
     lastName        String
     phone           String         // Full phone e.g. "08012345678"
     phoneLast4      String         // "5678" (for instant 4-digit search)
     dateOfBirth     DateTime?      // Optional for now (ready for future birthday system)
     birthDay        Int?           // 1 - 31 (for fast calendar queries)
     birthMonth      Int?           // 1 - 12 (for fast calendar queries)
     photoUrl        String?        // Profile / avatar picture for birthday flyer design
     category        PersonCategory @default(YOUTH)
     subCategory     String?        // "YOUTH_WORKER" | "ADULT_WORKER" | "YOUTH" | "ADULT" | "CHILD"
     status          PersonStatus   @default(MEMBER)
     groupId         String?
     group           Group?         @relation(fields: [groupId], references: [id])
     isActive        Boolean        @default(true)
     createdAt       DateTime       @default(now())
     updatedAt       DateTime       @updatedAt
     attendanceRecords AttendanceRecord[]
     followUpResults   FollowUpResult[]
     followUpTasks     FollowUpTask[]
     birthdayLogs      BirthdayReminderLog[]

     @@index([churchId, phoneLast4])
     @@index([churchId, groupId])
     @@index([churchId, birthMonth, birthDay])
   }
   ```
   - **Key Finding:** `Person` explicitly has indexed `birthMonth` (Int 1-12) and `birthDay` (Int 1-31) alongside `dateOfBirth`. The composite index `@@index([churchId, birthMonth, birthDay])` enables index-scanned calendar lookups without slow database-side date functions.
   - **Department / Role Resolution:** `Person` does not have separate scalar fields named `department` or `role`. Department is derived from `person.subCategory` (e.g. `"MEDIA"`, `"USHERING"`, `"YOUTH_WORKER"`), `person.group?.name` (e.g. `"Calling Team"`), or `person.category` (`YOUTH`, `WORKER`, `ADULT`, `CHILD`), with fallback to `"Youth Member"`, consistent with `lib/template-engine.ts:formatDepartment()`.
   - **Photo & Active Status:** `photoUrl: String?` holds the celebrant portrait for media flyer preparation. `isActive: Boolean` (default true) must be filtered in all queries.

2. **`BirthdayReminderLog` Model (`lines 234-247`):**
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
   - **Key Finding:** The model enforces hard database-level idempotency via composite unique constraint: `@@unique([personId, year, type])`.
   - Any second dispatch attempt for the same person, calendar year, and reminder type will be blocked by `findUnique` pre-check or trigger Prisma error `P2002`, guaranteeing zero duplicate dispatches.
   - The field `type: String` accommodates the three required reminder pipelines:
     - `T_MINUS_1_MEDIA` (or `GRAPHICS_T_MINUS_1`)
     - `DAY_OF_CELEBRATION`
     - `DIRECT_MEMBER_DM`

### 1.2 Timezone Math & Nigerian Calendar
- In `lib/service-resolver.ts:getNigerianTimeInfo()`, the project establishes West Africa Time (`Africa/Lagos`, UTC+1) via `Intl.DateTimeFormat`:
  ```ts
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Africa/Lagos',
    hour12: false,
    ...
  });
  ```
- Because hosting environments (Vercel, AWS us-east-1, Neon) run on UTC or US Pacific, querying birthdays using naive JavaScript `new Date().getDate()` or `new Date().getMonth()` causes off-by-one errors when executing between 23:00 UTC and 00:00 UTC (00:00 - 01:00 WAT).
- Nigerian calendar projection requires resolving the current date in `Africa/Lagos`, then advancing exactly 1 calendar day via UTC date math (`Date.UTC(Y, M - 1, D + 1)`) for T-1 (Tomorrow) lookups.

### 1.3 Template Engine & Direct Dispatch Infrastructure
- `lib/template-engine.ts` already defines message banks for:
  - `BIRTHDAY_T_MINUS_1_MEDIA` (`lines 223-281`): Markdown alert with celebrant name, department, phone, and photo link.
  - `BIRTHDAY_DAY_OF_DM` (`lines 283-310`): Direct member celebration messages.
  - `BIRTHDAY_COMMUNITY` (`lines 312-336`): Church group celebratory announcements.
  - Generates 0-token messages deterministically via FNV-1a hash seed rotation (`seed: "${person.id}-${year}"`).
- `lib/direct-dispatch.ts:dispatchDirectMessage()` supports multi-provider delivery (Termii, Twilio, WhatsApp Cloud API, and 1-click `wa.me` fallback) and never throws uncaught exceptions.

### 1.4 Test Infrastructure
- Vitest suite in `tests/` currently executes 269 passing tests across 12 files in ~4.38s.
- `tests/helpers/prisma-mock.ts` already mocks `birthdayReminderLog` with `findUnique`, `findFirst`, `findMany`, `create`, `update`, `upsert`, `delete`, and `count`.

---

## 2. Logic Chain

### 2.1 Timezone & Calendar Math Logic Chain
1. **Observation:** Lagos is in `Africa/Lagos` (WAT UTC+1, no DST).
2. **Step 1 — Today Resolution:**
   - Extract Nigerian calendar day $(Y_0, M_0, D_0)$ from `getNigerianTimeInfo(refDate)`.
   - $M_0 \in [1, 12]$, $D_0 \in [1, 31]$, $Y_0$ = 4-digit year (e.g. 2026).
3. **Step 2 — Tomorrow (T-1) Resolution:**
   - Construct UTC date: `new Date(Date.UTC(Y0, M0 - 1, D0 + 1))`.
   - Read UTC components: $(Y_1, M_1, D_1) = (\text{getUTCFullYear()}, \text{getUTCMonth()} + 1, \text{getUTCDate()})$.
   - This cleanly handles month roll-overs (e.g. Oct 31 $\to$ Nov 1, Dec 31 $\to$ Jan 1) and leap years without timezone bias.

### 2.2 Leap Year & February 29 Matching Logic Chain
1. **Observation:** A leap year satisfies $(Y \pmod 4 = 0 \land Y \pmod{100} \neq 0) \lor (Y \pmod{400} = 0)$.
2. **Problem:** In non-leap years (e.g. 2026, 2027), February has only 28 days. A naive query for $M=2, D=29$ returns 0 records, causing Feb 29 celebrants to be skipped forever in non-leap years.
3. **Church Convention & Zero-Forgotten-Member Mandate:**
   - In non-leap years, February 29 celebrants are celebrated on **February 28** (the final day of February).
   - Therefore:
     - On **February 28 in a non-leap year**:
       - **Day-Of query target:** matches $(M=2, D=28) \lor (M=2, D=29)$.
       - **T-1 query target (for March 1):** matches $(M=3, D=1)$.
     - On **February 27 in a non-leap year**:
       - **Day-Of query target:** matches $(M=2, D=27)$.
       - **T-1 query target (for Feb 28):** matches $(M=2, D=28) \lor (M=2, D=29)$.
     - In **leap years** (e.g. 2028):
       - Feb 28 queries only $M=2, D=28$ (Day-Of) and $M=2, D=29$ (T-1).
       - Feb 29 queries $M=2, D=29$ (Day-Of) and $M=3, D=1$ (T-1).
4. **Conclusion:** Leap year handling is deterministic, comprehensive, and guarantees every church member is celebrated every calendar year.

### 2.3 Triple-Channel Idempotency Architecture
1. **Observation:** Requirements specify three distinct dispatches:
   - `T_MINUS_1_MEDIA`: Media team Telegram alert with photoUrl for flyer design.
   - `DAY_OF_CELEBRATION`: Morning Telegram celebration announcement.
   - `DIRECT_MEMBER_DM`: Direct WhatsApp/SMS to the celebrant.
2. **Idempotency Rule:**
   - Before executing any dispatch for `personId`, `year`, `type`:
     ```ts
     const existing = await prisma.birthdayReminderLog.findUnique({
       where: {
         personId_year_type: { personId, year, type }
       }
     });
     if (existing) {
       // Skip dispatch — record as SKIPPED_IDEMPOTENT
       return;
     }
     ```
   - After dispatch succeeds (or wa.me fallback is generated):
     ```ts
     await prisma.birthdayReminderLog.create({
       data: {
         personId,
         year,
         type,
         status: 'SENT'
       }
     });
     ```
   - **Race-Condition Protection:** If concurrent cron executions run simultaneously, Prisma unique constraint violation `P2002` on `personId_year_type` is caught gracefully and treated as already completed.

### 2.4 Telegram Bot Integration (`lib/telegram.ts`)
1. **Observation:** Next.js 16 supports native `fetch`. Telegram Bot API provides:
   - `POST https://api.telegram.org/bot<TOKEN>/sendMessage`
   - `POST https://api.telegram.org/bot<TOKEN>/sendPhoto`
2. **Resilience Strategy:**
   - If `person.photoUrl` is provided, attempt `sendPhoto` with caption.
   - If `sendPhoto` fails (e.g. invalid photo URL or Telegram fetch failure), automatically fall back to `sendMessage` containing the photo URL link in the text.
   - If `TELEGRAM_BOT_TOKEN` or `TELEGRAM_MEDIA_CHAT_ID` is missing in non-production environments, return a mock success response (`provider: 'MOCK_TELEGRAM'`) with warning telemetry, preventing test/development environment blockage.

---

## 3. Caveats

1. **Missing `birthDay`/`birthMonth` on legacy records:**
   - If a member record has `dateOfBirth` populated but `birthDay` and `birthMonth` are null, query matching on `birthMonth` and `birthDay` will not match them unless normalized.
   - *Mitigation:* `lib/birthday-engine.ts` should include an internal helper `syncBirthdayFields(person)` or query both `[birthMonth, birthDay]` and people whose `dateOfBirth` month/day match.
2. **Missing `photoUrl` on members:**
   - Some members will not have uploaded a photo.
   - *Mitigation:* `lib/template-engine.ts` handles this cleanly with fallback text: `[Photo requested / Use standard template]`. The Telegram bot dispatches standard text when photoUrl is absent.
3. **Telegram Rate Limits:**
   - Telegram Bot API enforces a limit of ~30 messages per second across chats, and 1 message per second in a specific group.
   - *Mitigation:* The engine should sequence dispatches with a 50ms delay or process in small batches, which easily accommodates typical church sizes (5-20 celebrants per day).

---

## 4. Conclusion & Architecture Plan for `lib/birthday-engine.ts`

### 4.1 Module Decomposition
```
lib/
├── telegram.ts            # Telegram Bot client (sendMessage, sendPhoto, formatting, mock fallbacks)
├── birthday-engine.ts     # Core detection, Africa/Lagos math, leap year resolution, pipeline orchestration
app/
├── api/cron/birthdays/route.ts # Authorized cron route handler (CRON_SECRET)
└── birthdays/             # Youth-First UI Dashboard for birthday automation & test triggers
```

### 4.2 Exact Type Definitions for `lib/birthday-engine.ts`
```ts
export const BIRTHDAY_REMINDER_TYPES = {
  T_MINUS_1_MEDIA: 'T_MINUS_1_MEDIA',
  DAY_OF_CELEBRATION: 'DAY_OF_CELEBRATION',
  DIRECT_MEMBER_DM: 'DIRECT_MEMBER_DM',
} as const;

export type BirthdayReminderType =
  typeof BIRTHDAY_REMINDER_TYPES[keyof typeof BIRTHDAY_REMINDER_TYPES];

export interface BirthdayCelebrant {
  personId: string;
  firstName: string;
  lastName: string;
  fullName: string;
  phone: string;
  photoUrl: string | null;
  department: string;
  category: string;
  birthDay: number;
  birthMonth: number;
  birthDateFormatted: string;
  isLeapDayBorn: boolean;
}

export interface BirthdayPipelineOptions {
  churchId?: string;
  refDate?: Date;
  dryRun?: boolean;
  force?: boolean;
  targetChannels?: ('TELEGRAM_T_MINUS_1' | 'TELEGRAM_DAY_OF' | 'DIRECT_MEMBER_DM')[];
}

export interface BirthdayPipelineResult {
  success: boolean;
  timestamp: string;
  referenceDateLagos: string; // "YYYY-MM-DD"
  year: number;
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
```

### 4.3 Proposed Implementation Blueprint for `lib/birthday-engine.ts`
```ts
/**
 * Detects upcoming birthdays for T-1 (Tomorrow) and Day-Of (Today) anchored to Africa/Lagos WAT (UTC+1).
 * Seamlessly handles non-leap year Feb 29 mapping to Feb 28.
 */
export async function getUpcomingBirthdays(options?: {
  churchId?: string;
  refDate?: Date;
}): Promise<{
  todayCelebrants: BirthdayCelebrant[];
  tomorrowCelebrants: BirthdayCelebrant[];
  nigerianDate: { year: number; month: number; dayOfMonth: number };
}>;

/**
 * Runs the full end-to-end birthday pipeline:
 * 1. Dispatches T-1 alerts to Media Team Telegram.
 * 2. Dispatches Day-Of celebration notices to Media/Church Telegram.
 * 3. Dispatches 0-token direct WhatsApp/SMS birthday messages to members.
 * 4. Logs all dispatches in BirthdayReminderLog with strict idempotency.
 */
export async function runBirthdayPipeline(
  options?: BirthdayPipelineOptions
): Promise<BirthdayPipelineResult>;
```

### 4.4 Authorized Route Handler Blueprint (`app/api/cron/birthdays/route.ts`)
- Mirrors `app/api/cron/follow-up/route.ts`.
- Validates `Authorization: Bearer <CRON_SECRET>`, `x-cron-secret`, or `?secret=...`.
- Executes `runBirthdayPipeline()`.
- Returns structured JSON telemetry with HTTP 200 (or HTTP 401 for unauthorized, HTTP 500 for unhandled errors).

---

## 5. Verification Method

To independently verify the implementation once authored:
1. **Unit Tests (`tests/unit/birthday-engine.test.ts`):**
   - **Timezone Accuracy:** Verify that at `2026-11-13T23:30:00Z` (23:30 UTC = 00:30 WAT on Nov 14), Day-Of detects Nov 14 birthdays and T-1 detects Nov 15 birthdays.
   - **Leap Year Logic:**
     - In non-leap year `2026-02-28`: both Feb 28 and Feb 29 celebrants are detected for Day-Of celebration.
     - In non-leap year `2026-02-27`: both Feb 28 and Feb 29 celebrants are detected for T-1 flyer alerts.
     - In leap year `2028-02-28`: only Feb 28 is Day-Of; Feb 29 is T-1.
   - **Idempotency:** Call `runBirthdayPipeline()` twice on the same reference date. Verify that `create` in `birthdayReminderLog` is called only once per person per reminder type, and second run marks them as `SKIPPED_IDEMPOTENT`.
2. **API & Cron Tests (`tests/unit/cron-birthdays.test.ts`):**
   - Missing/invalid bearer token returns HTTP 401.
   - Valid token returns HTTP 200 with structured telemetry (`stats`, `details`).
3. **Telegram Bot Tests (`tests/unit/telegram.test.ts`):**
   - Markdown formatting with celebrant details, role, and photoUrl.
   - Graceful fallback when photoUrl fails or environment credentials are unset.
4. **Command Execution:**
   - Execute `npm test` to verify all 269 existing tests plus new Milestone 4 tests pass with 0 failures.
