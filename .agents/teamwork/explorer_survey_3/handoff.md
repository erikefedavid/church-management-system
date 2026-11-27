# Explorer Survey 3: Telegram Birthday Bot & Testing Infrastructure Report

**Report Path**: `c:\Users\dafen\OneDrive\Desktop\church-management-system\.agents\teamwork\explorer_survey_3\handoff.md`  
**Date**: 2026-11-12T14:41:00Z  
**Author**: Explorer Survey 3 (Telegram Birthday & Test Infra Explorer)  
**Status**: Completed (Hard Handoff)

---

## 1. Observation

### 1.1 Project Dependencies & Scripts (`package.json`)
- **Package Manifest (`package.json:1-34`)**:
  - `name`: `"church-management-system"`
  - `type`: `"module"` (ESM native)
  - `scripts`:
    ```json
    "scripts": {
      "dev": "next dev",
      "build": "next build",
      "start": "next start",
      "lint": "eslint"
    }
    ```
    - **Critical Finding**: There is **no `"test"` script** in `package.json`.
  - `dependencies`:
    - `@prisma/client`: `^6.4.1` (runtime version: `6.19.3`)
    - `lucide-react`: `^1.51.0`
    - `next`: `16.3.7`
    - `react`: `19.2.8`
    - `react-dom`: `19.2.8`
  - `devDependencies`:
    - `@tailwindcss/postcss`: `^4`
    - `@types/node`: `^20`
    - `@types/react`: `^19`
    - `@types/react-dom`: `^19`
    - `eslint`: `^9`
    - `eslint-config-next`: `16.3.7`
    - `prisma`: `^6.4.1`
    - `tailwindcss`: `^4`
    - `tsx`: `^4.19.3`
    - `typescript`: `^5`
  - **Critical Observation**: No test framework (`vitest`, `jest`, `playwright`, `@testing-library/react`) is installed. No Telegram library (e.g. `telegraf`, `node-telegram-bot-api`) is installed. No motion library (`framer-motion`) is installed.
  - Node runtime: **Node.js v24.18.0** is installed on the host. `npx tsx --test` was directly verified and executed successfully on `scratch/test-time.ts` (`tests 1, pass 1, duration_ms 1112`).

### 1.2 Prisma Database Schema (`prisma/schema.prisma`)
- **`Person` Model (`prisma/schema.prisma:123-159`)**:
  - Birthday fields already present in schema:
    ```prisma
    dateOfBirth     DateTime?      // Optional for now (ready for future birthday system)
    birthDay        Int?           // 1 - 31 (for fast calendar queries)
    birthMonth      Int?           // 1 - 12 (for fast calendar queries)
    photoUrl        String?        // Profile / avatar picture for birthday flyer design
    ```
  - Indexing: `@@index([churchId, birthMonth, birthDay])` (line 157) guarantees $O(1)$ fast calendar lookups for any given month/day.
  - Relation: `birthdayLogs BirthdayReminderLog[]` (line 152).
- **`BirthdayReminderLog` Model (`prisma/schema.prisma:234-248`)**:
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
  - **Idempotency Constraint**: `@@unique([personId, year, type])` guarantees at the database engine level that no member can have duplicate dispatches of the same type within the same calendar year.
  - `type` is declared as a `String` (not an Enum), which provides flexible forward compatibility to support additional notification types such as `'DAY_OF_MEMBER_DM'` or `'GRAPHICS_T_MINUS_1'` without schema migrations.
  - Current usage: Repository-wide search showed `BirthdayReminderLog` is only referenced in `prisma/schema.prisma` lines 152 and 234. No server action or API route queries or creates `BirthdayReminderLog` records.

### 1.3 Birthday Application Code State
- **Birthday UI / Pages**:
  - `Test-Path app/birthdays` returned `False`.
  - No birthday dashboard or media team graphics board currently exists.
- **Birthday Actions**:
  - `Test-Path app/actions/birthdays.ts` returned `False`.
  - No server actions exist for querying upcoming birthdays or marking flyer status.
- **Telegram Bot Integration**:
  - `Test-Path lib/telegram.ts` returned `False`.
  - No Telegram Bot API wrapper or dispatch functions exist.
- **Existing Birthday Logic in `lib/ai-assistant.ts`**:
  - `lib/ai-assistant.ts:25-34`: Defines `BirthdayContext` (`firstName`, `lastName`, `phone`, `category`, `subCategory`, `birthDay`, `birthMonth`, `photoUrl`).
  - `lib/ai-assistant.ts:130-155`: `generateGraphicsDesignerAlert(member: BirthdayContext)`:
    - Generates a WhatsApp-formatted alert string:
      ```
      🎨 *RCCG YOUTH MEDIA ALERT (T-1 Day Design Reminder)*
      🎂 *Celebrant:* {firstName} {lastName}
      📅 *Birthday:* Tomorrow ({dateFormatted})
      🏢 *Department/Role:* {dept}
      📞 *Phone:* {phone}
      📸 *Photo:* {photoUrl}
      ⚡ *Action Required:* Please generate the official birthday flyer today...
      ```
  - `lib/ai-assistant.ts:160-171`: `generateDayOfBirthdayWish(member: BirthdayContext)`:
    - Generates `whatsappGreeting` (for member DM) and `communityAnnouncement`.

### 1.4 API Cron Routes & Authorization (`app/api/`)
- `Test-Path app/api` returned `False`.
- No Route Handlers exist at `/api/cron/birthdays` or `/api/cron/follow-up`.
- Neither `CRON_SECRET`, `TELEGRAM_BOT_TOKEN`, nor `TELEGRAM_MEDIA_CHAT_ID` exists in `.env`.
- `.env` currently contains only `DATABASE_URL` pointing to a Neon Postgres instance.

### 1.5 Direct DM Messaging & Token Optimization State
- `app/actions/followup.ts:523-533`: Currently constructs manual `https://wa.me/{phone}?text={encoded}` links on the fly.
- No direct SMS/WhatsApp gateway client (Termii, Twilio, WhatsApp Cloud API) exists.
- `lib/ai-assistant.ts:48-86`: `generateFollowUpDraft` invokes external Gemini 1.5 Flash endpoint (`https://generativelanguage.googleapis.com/...`) whenever `GEMINI_API_KEY` is present, with zero caching and with a single fallback template per severity level.

### 1.6 Remote Database Connectivity Observation
- Prisma schema validation (`npx prisma validate`) passed successfully.
- Query test against remote Neon database (`npx tsx -e "prisma.person.findMany()"`) failed with `PrismaClientInitializationError: Can't reach database server at ep-shy-frost-ax738n5q-pooler.c-4.us-east-2.aws.neon.tech:5432`.
- `Test-NetConnection` confirmed TCP connectivity to port 5432 is open (`TcpTestSucceeded: True`), indicating remote serverless connection pooler latency, cold-start timeouts, or IPv6 routing friction on Windows.
- **Direct Impact on Testing**: Unit test suites must be completely self-contained and mockable so tests run deterministically offline without blocking on remote DB latency.

---

## 2. Logic Chain

```
Observation 1.1: package.json has NO test script and NO testing framework installed.
Observation 1.1: Node.js v24.18.0 is present; "tsx --test" runs natively.
    │
    ▼
Step 1: Test infrastructure must be established.
Option A: Vitest (recommended for full ESM compatibility, fast execution, vi.fn()/vi.mock() mocking utilities, and standard "npm test" workflow).
Option B: Native Node 24 test runner ("tsx --test") for zero-extra-dependency test execution.
Both options can be configured so developers can run "npm test".
    │
    ▼
Observation 1.2: BirthdayReminderLog has @@unique([personId, year, type]), but is unreferenced in app code.
Observation 1.3: lib/telegram.ts and app/birthdays do not exist.
Observation 1.4: app/api/ does not exist (no cron routes or CRON_SECRET auth).
    │
    ▼
Step 2: Media Team Telegram Bot Pipeline architecture:
1. Create `lib/telegram.ts` with direct HTTP calls (via native fetch) to Telegram Bot API:
   - `sendMessage` with Markdown / HTML parse mode.
   - `sendPhoto` with photo URL + caption when celebrant avatar is available.
   - Graceful fallback: when TELEGRAM_BOT_TOKEN is missing or during tests, return simulated delivery without crashing.
2. Create `app/actions/birthdays.ts`:
   - `getUpcomingBirthdaysAction()`: queries persons where (birthMonth, birthDay) match today, tomorrow (T-1), and this week in WAT (Africa/Lagos).
   - `getBirthdayDeskAction()`: aggregates today's celebrants, T-1 flyer alerts, and flyer upload tracking.
   - `markFlyerUploadedAction()`: updates BirthdayReminderLog status to "FLYER_READY".
    │
    ▼
Observation 1.2: Idempotency is enforced by @@unique([personId, year, type]).
    │
    ▼
Step 3: Cron Routine at `/api/cron/birthdays/route.ts`:
1. Authenticate incoming request via `Authorization: Bearer ${process.env.CRON_SECRET}`. Reject 401 if missing/invalid.
2. Resolve Nigerian date (WAT / Africa/Lagos) via `getNigerianTimeInfo()`.
3. Compute T-1 date (tomorrow) and Day-Of date (today).
4. For T-1 celebrants:
   - Check if `BirthdayReminderLog` already has `{ personId, year, type: 'GRAPHICS_T_MINUS_1' }`.
   - If not logged: format Telegram Markdown alert with celebrant name, department/role, photo URL, phone, and flyer preparation CTA.
   - Dispatch to `TELEGRAM_MEDIA_CHAT_ID`.
   - On success, insert record into `BirthdayReminderLog` with `status: 'SENT'`.
5. For Day-Of celebrants:
   - Check if `BirthdayReminderLog` already has `{ personId, year, type: 'DAY_OF_CELEBRATION' }`.
   - If not logged: dispatch celebration announcement to Telegram and trigger direct DM greeting.
   - On success, insert record into `BirthdayReminderLog`.
6. Return structured JSON payload with execution summary.
    │
    ▼
Observation 1.5: Direct DM and 0-token optimization requirements.
    │
    ▼
Step 4: Direct Dispatch & Deterministic Template Engine:
1. Create `lib/direct-dispatch.ts`:
   - Adapter pattern checking `TERMII_API_KEY` (Termii Nigerian SMS/WhatsApp) -> `TWILIO_ACCOUNT_SID` (Twilio) -> `WHATSAPP_CLOUD_API_TOKEN` -> 1-click `wa.me` fallback URL.
2. Create `lib/message-templates.ts`:
   - Deterministic 0-token interpolation engine replacing `{FirstName}`, `{FullName}`, `{Category}`, `{Department}`, `{DaysAbsent}`, `{BirthDate}`.
   - Curated high-variety message bank with multiple rotating youth-friendly options.
   - AI generation (`@google/genai`) remains strictly opt-in on-demand with local SHA-256 caching.
    │
    ▼
Step 5: Automated Programmatic Test Suites:
Create unit and API tests in `tests/`:
- `tests/unit/geo.test.ts`: Haversine formula, 150m boundary, 35m hysteresis, 20m roof cushion, anti-spoofing flags.
- `tests/unit/attendance-paths.test.ts`: 4-digit lookup, phone collision handling, self check-in rejection, early bird routing.
- `tests/unit/absence-detection.test.ts`: 1-week miss, 2-week miss, 72h first-timer window, 48h pastor escalation.
- `tests/unit/birthday-formatting.test.ts`: Telegram Markdown alert format, role/photo extraction, template replacement.
- `tests/api/cron-endpoints.test.ts`: Bearer token auth (401 vs 200), idempotency checks, error resilience.
```

---

## 3. Caveats

1. **Telegram API Rate Limits & Token Configuration**:
   - The Telegram Bot API allows up to 30 messages/second globally and 20 messages/minute per group chat. Since daily church celebrants typically range from 0 to 10 individuals, rate limits will not be exceeded under normal operations.
   - If `TELEGRAM_BOT_TOKEN` or `TELEGRAM_MEDIA_CHAT_ID` is absent in production, the cron endpoint and server actions must safely record status as `SIMULATED` or `PENDING_CONFIG` rather than crashing the HTTP request.
2. **Special Characters in Telegram Markdown**:
   - Telegram Bot API Markdown (`parse_mode: 'Markdown'`) can fail if member names or departments contain unescaped underscores (e.g. `YOUTH_WORKER`).
   - Using `parse_mode: 'HTML'` or sanitizing Markdown underscores (`.replace(/_/g, ' ')`) is essential to prevent Telegram API 400 Bad Request errors.
3. **Leap Year Calendar Edge Cases**:
   - For members born on February 29th, in non-leap years the system should evaluate their birthday on February 28th or March 1st.
4. **Offline Database Isolation for Tests**:
   - Given the remote Neon connection pooler latency observed during testing, all unit and API logic tests must use mocked repositories or pure domain functions to ensure test runs pass cleanly in CI and local development.

---

## 4. Conclusion

1. **Telegram Bot & Birthday Automation Gaps**:
   - The database schema in `prisma/schema.prisma` already possesses the required models (`BirthdayReminderLog` and `Person` birthday fields) with proper unique constraints (`@@unique([personId, year, type])`).
   - However, the operational layer is 100% missing: no `lib/telegram.ts`, no `app/api/cron/birthdays/route.ts`, no `app/birthdays/page.tsx`, and no server actions in `app/actions/birthdays.ts`.
2. **Direct Dispatch & 0-Token Interpolation Engine**:
   - A deterministic template engine (`lib/message-templates.ts`) and direct messaging adapter (`lib/direct-dispatch.ts`) are required to support SMS/WhatsApp gateway APIs (Termii, Twilio, WhatsApp Cloud API) with a reliable 1-click `wa.me` fallback.
3. **Testing Infrastructure Blueprint**:
   - The project lacks a test framework and test scripts.
   - Recommended resolution:
     - Install `vitest` (`npm install -D vitest`).
     - Add `"test": "vitest run"` and `"test:watch": "vitest"` to `package.json`.
     - Author comprehensive test suites in `tests/unit/` and `tests/api/` covering all acceptance criteria (geofencing, attendance paths, absence radar, birthday bot formatting, and cron authorization).

---

## 5. Verification Method

### 5.1 Independent Verification Commands

1. **Verify TypeScript Type Integrity**:
   ```bash
   npx tsc --noEmit
   ```
   *(Expected result: exit code 0, 0 type errors)*

2. **Verify Prisma Schema Validation**:
   ```bash
   npx prisma validate
   ```
   *(Expected result: "The schema at prisma\schema.prisma is valid")*

3. **Verify Native Test Runner Execution (Node 24)**:
   ```bash
   npx tsx --test scratch/test-time.ts
   ```
   *(Expected result: "pass 1, fail 0")*

4. **Verify Vitest Installation & Test Suite Execution**:
   ```bash
   npm run test
   ```
   *(Expected result: All unit and API test suites pass)*

### 5.2 Test Suite Architecture to Implement

| Target Area | Test File | Test Cases |
| :--- | :--- | :--- |
| **Geofencing Engine** | `tests/unit/geo.test.ts` | 1. Calculate Haversine distance between coordinates.<br/>2. Allow check-in within 150m (RCCG 6.5244, 3.3792).<br/>3. Reject check-in outside 150m.<br/>4. Allow check-in up to 185m if previously inside (hysteresis).<br/>5. Apply up to 20m indoor accuracy cushion.<br/>6. Detect and flag spoofed coordinates (Null Island, zero accuracy). |
| **Attendance Paths** | `tests/unit/attendance-paths.test.ts` | 1. Phone last-4 digit lookup returns matching members.<br/>2. Phone collision returns multiple candidates.<br/>3. Self check-in records attendance record.<br/>4. Duplicate check-in on the same date/service is rejected.<br/>5. Early bird worker rerouting functions correctly. |
| **Absence Radar** | `tests/unit/absence-detection.test.ts` | 1. Detect members missing 1 week.<br/>2. Detect members missing 2 consecutive weeks.<br/>3. Identify first-timers within the 72-hour golden window.<br/>4. Trigger 48-hour pastor escalation for unresolved tasks. |
| **Birthday Formatting** | `tests/unit/birthday-formatting.test.ts` | 1. Format T-1 media flyer Telegram alert with celebrant name, role, photo URL, date, and CTA.<br/>2. Format Day-Of celebration announcement.<br/>3. Deterministic template engine correctly injects `{FirstName}`, `{Category}`, `{Department}`.<br/>4. Idempotency prevents duplicate reminder logs for the same member/year/type. |
| **Cron Authorization** | `tests/api/cron-endpoints.test.ts` | 1. `/api/cron/birthdays` returns 401 when Authorization header is missing.<br/>2. `/api/cron/birthdays` returns 401 when Bearer token is invalid.<br/>3. `/api/cron/birthdays` returns 200 and dispatches when Bearer token matches `CRON_SECRET`.<br/>4. `/api/cron/follow-up` returns 401 when unauthorized, 200 when authorized.<br/>5. Cron batch execution does not crash if an individual dispatch encounters an error. |

### 5.3 Invalidation Conditions
- Any changes that alter the established church coordinates (`6.5244, 3.3792`) or base geofence radius (`150m`).
- Alterations to `BirthdayReminderLog` schema that break the `@@unique([personId, year, type])` constraint.
- Cron endpoints that execute without validating the `CRON_SECRET` Bearer token.
- Unhandled exceptions during batch dispatches that cause the cron route handler to terminate prematurely.
