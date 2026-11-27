## 2026-11-12T18:04:12Z
You are m4_worker_1, an expert full-stack TypeScript/Next.js engineer.

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Context:
You are implementing Milestone 4: Media Telegram Birthday Bot & Pipeline (Requirement R3) in:
c:\Users\dafen\OneDrive\Desktop\church-management-system

Please read the following documents first:
1. ORIGINAL_REQUEST.md at: c:\Users\dafen\OneDrive\Desktop\church-management-system\.agents\teamwork\ORIGINAL_REQUEST.md
2. PROJECT.md at: c:\Users\dafen\OneDrive\Desktop\church-management-system\.agents\teamwork\orchestrator_gen2\PROJECT.md
3. Explorer 1 Handoff at: c:\Users\dafen\OneDrive\Desktop\church-management-system\.agents\teamwork\m4_explorer_1\handoff.md
4. Explorer 2 Handoff at: c:\Users\dafen\OneDrive\Desktop\church-management-system\.agents\teamwork\m4_explorer_2\handoff.md
5. Explorer 3 Handoff at: c:\Users\dafen\OneDrive\Desktop\church-management-system\.agents\teamwork\m4_explorer_3\handoff.md

Your Assigned Tasks & Files:
1. `lib/telegram.ts`:
   - Implement `TelegramBotClient` and exported helper functions (`sendTelegramMessage`, `sendTelegramPhoto`, `sendMediaBirthdayAlert`, `sendMediaBirthdayAlertBatch`).
   - Markdown formatting (`formatBirthdayAlertMarkdown`, `escapeMarkdown`) formatted with Celebrant name, role/department, birth date, countdown (T-1 vs Day-Of), photo asset link, and call to action for the media team ("Please prepare birthday flyer...").
   - `sendPhoto` with caption, with automatic fallback to `sendMessage` with photo link if `sendPhoto` fails or photo is missing.
   - Automatic dry-run mode when `TELEGRAM_BOT_TOKEN` or `TELEGRAM_MEDIA_CHAT_ID` are missing/unset (returns simulated success without calling fetch).
   - Handles HTTP 400, 401, 429 (extracts `retry_after`), and network errors without throwing uncaught exceptions.
2. `lib/birthday-engine.ts`:
   - Africa/Lagos (WAT UTC+1) timezone date calculations.
   - `getUpcomingBirthdays`: queries active members with birthdays for today and tomorrow. Accurately handles leap-year Feb 29 (in non-leap years, Feb 29 birthdays match Feb 28; in leap years, match Feb 29).
   - `runBirthdayPipeline`: executes T-1 media flyer alerts via Telegram, Day-Of celebration alerts, and direct member DMs via `lib/direct-dispatch.ts` using 0-token `renderTemplate('BIRTHDAY_DAY_OF_DM')` with 1-click wa.me fallback.
   - Idempotently logs dispatches in `prisma.birthdayReminderLog` with `@@unique([personId, year, type])`, gracefully catching P2002 errors and skipping already-logged dispatches.
   - Returns structured JSON telemetry with counts of detected, sent, skipped, and errors.
3. `app/api/cron/birthdays/route.ts`:
   - Route handler for `GET` and `POST`, `export const dynamic = 'force-dynamic'`.
   - Security gate: strictly validates `Authorization: Bearer <CRON_SECRET>` (`parts.length === 2 && parts[0]?.toLowerCase() === 'bearer' && parts[1] === validSecret`), `x-cron-secret`, or `?secret=...`.
   - Calls `runBirthdayPipeline()`.
   - Returns structured JSON telemetry with HTTP 200 (or HTTP 401 on unauthorized, HTTP 500 on unexpected errors).
4. `app/actions/birthdays.ts`:
   - Server Actions: `getBirthdayDashboardAction`, `triggerBirthdayCronAction`, `dispatchManualBirthdayAlertAction`, `updateFlyerStatusAction`.
5. Modular UI Components in `app/components/birthdays/*` and `app/birthdays/page.tsx`:
   - `BirthdayHeader.tsx`: Official RCCG logo (`/rccg-logo.png`), WAT clock badge, search bar, manual trigger button with spinner.
   - `BirthdayKpiGrid.tsx`: 4 interactive KPI metric cards (Today's Celebrants, T-1 Flyer Alerts, Upcoming This Month, Total Broadcasts Logged) with active ring states and tactile feedback.
   - `CelebrantCard.tsx`: Celebrant avatar/photo, category badge, timing pill (Today, Tomorrow, Upcoming), 1-click WhatsApp button, direct gateway dispatch, manual flyer alert trigger, flyer status badge.
   - `MediaFlyerQueue.tsx`: Media team flyer preparation queue with photo link and flyer upload/attachment input.
   - `BirthdayAuditLog.tsx`: Audit table of `BirthdayReminderLog` entries.
   - `app/birthdays/page.tsx`: Page assembling components, PIN authentication gate (`1234`, `7777`, `4444` and `sessionStorage`), timeframe filters, search, and toast notifications.
   - Holy Trinity Compliance: zero AI tells (no fake grid lines, no floating purple blur spots, no cartoon bounces), Emil Kowalski momentum deceleration `[0.23, 1, 0.32, 1]`, scale entrance from 0.95, tactile feedback `whileTap={{ scale: 0.97 }}` <100ms, minimum 44px touch targets on all interactive elements, WCAG AAA text contrast.
6. Automated Test Suites:
   - `tests/unit/telegram.test.ts`: Telegram formatting, markdown escaping, dry-run simulation, mocked `fetch` success, photo fallback to text, error handling (400, 401, 429).
   - `tests/unit/birthday-engine.test.ts`: WAT UTC+1 date calculations, T-1 vs Day-Of detection, non-leap year Feb 29 mapping to Feb 28, idempotency and duplicate skipping in `BirthdayReminderLog`, direct DM generation.
   - `tests/unit/cron-birthdays.test.ts`: Authorized cron route testing (missing secret -> 401, wrong secret -> 401, trailing garbage -> 401, valid Bearer -> 200 with structured JSON telemetry, GET and POST methods).

Verification Requirements:
1. Run `npx vitest run tests/unit/telegram.test.ts tests/unit/birthday-engine.test.ts tests/unit/cron-birthdays.test.ts`
2. Run `npx vitest run` (ensure all 269 existing tests + new tests pass, 0 failures)
3. Run `npm run build` (ensure clean compilation, exit code 0)
4. Run `npx eslint lib/telegram.ts lib/birthday-engine.ts app/api/cron/birthdays/route.ts app/actions/birthdays.ts app/birthdays/page.tsx app/components/birthdays`
