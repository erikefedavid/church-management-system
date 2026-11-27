## 2026-11-12T16:44:53Z

You are m3_worker_1 (Zero-Forgotten-Member Follow-Up Engine Builder).
Your State Folder is: c:\Users\dafen\OneDrive\Desktop\church-management-system\.agents\teamwork\m3_worker_1
Your Working Directory is: c:\Users\dafen\OneDrive\Desktop\church-management-system
Original Request Path: c:\Users\dafen\OneDrive\Desktop\church-management-system\.agents\teamwork\ORIGINAL_REQUEST.md
Project Document Path: c:\Users\dafen\OneDrive\Desktop\church-management-system\.agents\teamwork\orchestrator\PROJECT.md

Read the three Explorer handoffs before implementing:
- Explorer 1 Report: c:\Users\dafen\OneDrive\Desktop\church-management-system\.agents\teamwork\m3_explorer_1\handoff.md
- Explorer 2 Report: c:\Users\dafen\OneDrive\Desktop\church-management-system\.agents\teamwork\m3_explorer_2\handoff.md
- Explorer 3 Report: c:\Users\dafen\OneDrive\Desktop\church-management-system\.agents\teamwork\m3_explorer_3\handoff.md

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

EXCLUSIVE WRITE BOUNDARIES (You own these files exclusively):
- `lib/absence-radar.ts` (Core absence detection radar algorithm & date calculations)
- `lib/follow-up-engine.ts` (Task synchronization, 48h auto-escalation scanner, task completion)
- `app/actions/followup.ts` (Server actions for follow-up dashboard, direct dispatch, AI polish, task completion)
- `app/api/cron/follow-up/route.ts` (Authorized Next.js Route Handler validating CRON_SECRET)
- `app/followup/page.tsx` & `app/components/followup/*` (Youth-First Follow-Up Dashboard UI)
- `tests/unit/absence-radar.test.ts`
- `tests/unit/followup-engine.test.ts`
- `tests/unit/cron-followup.test.ts`

MISSION:
Implement Milestone 3 (Requirement R2: Zero-Forgotten-Member Follow-Up Engine):
1. **Core Absence Radar (`lib/absence-radar.ts`)**:
   - Precise Sunday date calculations in Africa/Lagos (WAT UTC+1) timezone.
   - Classification logic: Missed 1 Week, Missed 2 Consecutive Weeks, First-Timers (72h care window).
   - 4-query batch strategy using Prisma indexes (`@@index([churchId, date])`), guaranteeing zero N+1 queries.
   - Exclusion of inactive members, archived members, and unonboarded members with 0 attendance history.
2. **FollowUpTask Lifecycle & 48h Auto-Escalation (`lib/follow-up-engine.ts`)**:
   - Idempotent task sync: Prevents duplicate pending tasks; supports cooldown window (144h).
   - 48-Hour auto-escalation scanner: Identifies pending tasks where `now > dueDate` and updates `status: 'ESCALATED'`, `escalatedTo: 'YOUTH_PASTOR'`, and logs audit row in `FollowUpResult`.
   - Pre-renders deterministic 0-token check-in drafts using `lib/template-engine.ts` (`renderTemplate`).
3. **Authorized Cron Route Handler (`app/api/cron/follow-up/route.ts`)**:
   - Validates `Authorization: Bearer ${process.env.CRON_SECRET}` with query parameter fallback (`?secret=...`).
   - Returns HTTP 401 if unauthorized.
   - Runs absence radar, synchronizes tasks, scans for 48h escalations, and returns structured JSON telemetry.
4. **Server Actions (`app/actions/followup.ts`)**:
   - `getFollowUpRadarDashboardAction`: Returns live radar metrics and member queue.
   - `dispatchDirectMessageAction`: Dispatches via `lib/direct-dispatch.ts` and auto-completes task on success.
   - `polishFollowUpDraftAction`: On-demand AI polish with 7-day deduplication cache via `lib/ai-assistant.ts`.
   - `completeFollowUpTaskAction`: Records mandated outcomes (`Contacted (WhatsApp)`, `Contacted (Call)`, `Prayed With`, `Visit Scheduled`, `No Response`), marks `FollowUpTask.status = 'CONTACTED'`, and creates `FollowUpResult`.
   - `triggerRadarSyncAction`: On-demand radar sync trigger.
5. **Youth Follow-Up Dashboard UI (`app/followup/page.tsx` & `app/components/followup/*`)**:
   - Refactor into modular components: `FollowUpHeader.tsx`, `RadarOverview.tsx` (4 interactive KPI cards for active filtering), `MemberFollowUpCard.tsx`, `MessagePreviewBubble.tsx`, `TaskOutcomeSelector.tsx`, `EscalationBanner.tsx`.
   - Strictly comply with Holy Trinity frontend standards: Emil Kowalski momentum deceleration `cubic-bezier(0.23, 1, 0.32, 1)`, scale entrance from 0.95, tactile click feedback (`whileTap={{ scale: 0.97 }}` < 100ms), 44px min touch targets, WCAG AAA text contrast, zero fake grids, zero purple radial glows, zero bounce animations.
6. **Automated Test Suites**:
   - Author comprehensive unit tests in `tests/unit/absence-radar.test.ts`, `tests/unit/followup-engine.test.ts`, and `tests/unit/cron-followup.test.ts`.
   - Run `npm test` and `npm run build`.
   - Document all test outcomes and commands in `handoff.md`.
   - Call send_message to report completion.
