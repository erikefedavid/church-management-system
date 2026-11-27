# Handoff Report: FollowUpTask Lifecycle, 48-Hour Auto-Escalation Engine & Authorized Cron Handler

**Explorer**: `m3_explorer_2`  
**Milestone**: Milestone 3 (Requirement R2: Zero-Forgotten-Member Follow-Up System)  
**Date**: 2026-11-12  

---

## 1. Observation

### 1.1 Prisma Schema (`prisma/schema.prisma`)
Lines 216–269 define `FollowUpResult` and `FollowUpTask`:
```prisma
model FollowUpResult {
  id         String   @id @default(cuid())
  personId   String
  person     Person   @relation(fields: [personId], references: [id], onDelete: Cascade)

  callerName String   // Name of volunteer who called
  weekNumber Int      // Which calendar week of the year
  outcome    String   // "Doing well", "Needs prayer", "Wants a visit", etc.
  note       String?  // Short note if "Needs attention"

  createdAt  DateTime @default(now())

  @@index([personId])
}

model FollowUpTask {
  id          String    @id @default(cuid())
  personId    String
  person      Person    @relation(fields: [personId], references: [id], onDelete: Cascade)

  reason      String    // "FIRST_TIMER" | "MISSED_1_WEEK" | "MISSED_2_WEEKS" | "DORMANT_CRITICAL"
  status      String    @default("PENDING") // "PENDING" | "CONTACTED" | "ESCALATED"
  assignedTo  String?   // Name of assigned youth worker / volunteer
  aiDraftNote String?   // AI-generated contextual check-in message starter
  escalatedTo String?   // "YOUTH_PASTOR"
  dueDate     DateTime
  contactedAt DateTime?
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt

  @@index([status, dueDate])
  @@index([personId])
}
```
**Key Direct Observations**:
1. `FollowUpTask` has string fields for `reason` (`"FIRST_TIMER" | "MISSED_1_WEEK" | "MISSED_2_WEEKS" | "DORMANT_CRITICAL"`) and `status` (`"PENDING" | "CONTACTED" | "ESCALATED"`).
2. `escalatedTo` is a nullable string intended to record `"YOUTH_PASTOR"`.
3. `dueDate` is indexed together with `status`: `@@index([status, dueDate])`.
4. **Critical Schema Fact**: There is **no database-level unique constraint** on `FollowUpTask` (e.g. no unique `[personId, reason, status]` or cycle identifier). Duplicate task prevention must be enforced at the application layer.

### 1.2 Current Server Actions (`app/actions/followup.ts`)
Inspection of lines 1–600 reveals:
1. `getFollowUpOverviewAction` (lines 76–244) queries `prisma.person`, `prisma.attendanceRecord`, and `prisma.followUpResult`, but **does NOT query `FollowUpTask`**.
2. `getMembersForFollowUpAction` (lines 249–386) queries `Person` records without returning or joining active `FollowUpTask` entities.
3. `logFollowUpResultAction` (lines 391–437) inserts into `prisma.followUpResult` but **does NOT update or resolve any corresponding `FollowUpTask`**.
4. `sendFollowUpBroadcastAction` (lines 468–553) computes in-memory `DispatchItem[]` with hardcoded templates and `wa.me` links without writing to `FollowUpTask` or using `lib/template-engine.ts`.

### 1.3 Available Core Infrastructure Modules
1. **Deterministic 0-Token Template Engine (`lib/template-engine.ts`)**:
   - `renderTemplate(category, context, options)`: Returns `RenderedTemplate` with `text`, `tokensConsumed: 0`.
   - Supports categories: `'FIRST_TIMER_72H'`, `'MISSED_1_WEEK'`, `'MISSED_2_WEEKS'`, `'DORMANT_CRITICAL'`.
   - Supports deterministic FNV-1a variant rotation via seed (`context.phone || context.firstName`).
2. **Multi-Provider Direct Dispatch Gateway (`lib/direct-dispatch.ts`)**:
   - `dispatchDirectMessage(payload)`: Dispatches via Termii, Meta WhatsApp Cloud API, Twilio, or generates universal 1-click fallback `waMeUrl`.
   - `normalizePhoneNumber(raw)`: Returns `NormalizedPhone` (`digitsOnly`, `e164`, `isNigerian`).
   - `generateWaMeLink(digitsOnly, text)`: Produces clean `https://wa.me/{digitsOnly}?text={encoded}`.
3. **Africa/Lagos Time Resolver (`lib/service-resolver.ts`)**:
   - `getNigerianTimeInfo(date)` and `getNigerianDateMidnight(date)` guarantee timezone precision in Africa/Lagos (WAT UTC+1) without server clock drift.
4. **Prisma Mock for Tests (`tests/helpers/prisma-mock.ts`)**:
   - Lines 75–85 already define `mockPrisma.followUpTask` with `findUnique`, `findFirst`, `findMany`, `create`, `update`, `updateMany`, `upsert`, `delete`, `count`.
5. **Existing Automated Test Suite**:
   - Ran `npm test`: 179 tests passing across 7 test files (`tests/adversarial/*` and `tests/unit/*`).

---

## 2. Logic Chain

### 2.1 Idempotent Task Creation & Synchronization Workflow
1. **Observation**: `FollowUpTask` lacks a unique constraint; running radar checks repeatedly could produce duplicate pending tasks.
2. **Inference**: Synchronization must use an explicit de-duplication check before inserting or updating records.
3. **Algorithm**:
   - When radar identifies a member requiring follow-up (`personId`, `reason`):
     - **Active Task Check**: Query for an existing task with `personId` and `status: { in: ['PENDING', 'ESCALATED'] }`.
       - If found with the **same reason**: Skip insertion (`skippedDuplicate++`).
       - If found with a **different reason** (e.g. upgraded from `MISSED_1_WEEK` to `MISSED_2_WEEKS`): Update the existing task's `reason` and regenerate `aiDraftNote` without resetting escalation due date.
     - **Cycle Cooldown Check**: If no active task exists, query if a task for `personId` was completed (`status: 'CONTACTED'`) within the current weekly cycle (last 6 days / 144 hours).
       - If recently contacted: Skip insertion (`skippedRecentlyContacted++`) to prevent nagging.
     - **Creation**: If no active task and no recent completion:
       - Set `reason: detectedReason`.
       - Set `status: 'PENDING'`.
       - Set `assignedTo: person.group?.name ? `${person.group.name} Caller` : 'Youth Volunteer'`.
       - Set `dueDate: new Date(now.getTime() + 48 * 60 * 60 * 1000)` (48 hours from generation).
       - Generate `aiDraftNote` via `renderTemplate(category, context)`.

### 2.2 48-Hour Auto-Escalation Engine
1. **Observation**: Requirement R2 requires auto-escalation to the Youth Pastor after 48 hours without contact.
2. **Inference**: Overdue criteria is deterministically evaluated where `status === 'PENDING'`, `dueDate <= now`, and `escalatedTo === null`.
3. **Action & Auditability**:
   - Update `FollowUpTask`:
     - `status: 'ESCALATED'`
     - `escalatedTo: 'YOUTH_PASTOR'`
     - `assignedTo: 'Youth Pastor (Escalated)'`
   - Create Audit Record in `FollowUpResult`:
     - `personId: task.personId`
     - `callerName: 'SYSTEM_ESCALATION_BOT'`
     - `weekNumber: getWeekNumber(now)`
     - `outcome: 'ESCALATED_TO_PASTOR'`
     - `note: '[48H AUTO-ESCALATION] Task overdue by 48h (Reason: ${task.reason}). Auto-escalated to Youth Pastor for direct pastoral intervention.'`
   - Benefit: Complete auditability in both the task table and the member's permanent call history.

### 2.3 Authorized Cron Route Handler (`app/api/cron/follow-up/route.ts`)
1. **Observation**: R3 / R2 mandate authorized cron endpoints (`/api/cron/follow-up`) validating `CRON_SECRET`.
2. **Inference**: Vercel Cron sends `Authorization: Bearer <secret>`, while third-party cron services (e.g. cron-job.org) often pass URL query parameters (`?secret=<secret>`).
3. **Security Architecture**:
   - Check `request.headers.get('authorization')` for `Bearer ${process.env.CRON_SECRET}`.
   - Fall back to checking `url.searchParams.get('secret') === process.env.CRON_SECRET`.
   - If missing or mismatching, immediately return HTTP 401:
     `{ success: false, error: 'Unauthorized: Invalid or missing authorization header/secret', code: 'UNAUTHORIZED' }`.
   - If authorized, execute the full pipeline:
     1. Absence radar detection.
     2. Task synchronization & 0-token draft generation.
     3. 48-hour auto-escalation scan.
     4. Return HTTP 200 with telemetry metrics (radar counts, tasks created, escalations processed, execution time ms).
   - Export both `GET` and `POST` handlers with `export const dynamic = 'force-dynamic'`.

### 2.4 Integration with Direct Dispatch & 1-Click WhatsApp
1. **Observation**: Direct dispatch (`lib/direct-dispatch.ts`) and template interpolation (`lib/template-engine.ts`) already exist and have 100% test coverage.
2. **Integration Plan**:
   - Every `FollowUpTask.aiDraftNote` is pre-populated at creation with 0-token rendered text.
   - 1-Click WhatsApp: Use `generateWaMeLink(normalizePhoneNumber(person.phone).digitsOnly, task.aiDraftNote)`.
   - Direct Dispatch Action: Calling `dispatchTaskMessageAction(taskId, channel)` invokes `dispatchDirectMessage`.
   - Auto-Completion: When direct dispatch succeeds (`DELIVERED` or `QUEUED`), the task is automatically updated to `status: 'CONTACTED'`, `contactedAt: new Date()`, and a `FollowUpResult` record is logged.

---

## 3. Caveats

1. **Absence Radar Query Integration**: `m3_explorer_1` is responsible for the exact SQL/Prisma query logic for identifying 1-week and 2-week absentees based on Sunday attendance records. The synchronization engine designed here interfaces with `detectAbsenteeMembers()` via a standardized data contract.
2. **Local Development Cron Secret**: If `CRON_SECRET` is not set in `.env` during local test runs, the route should either allow calls with a warning or fallback to a default test secret (`process.env.CRON_SECRET || 'test-cron-secret'`) in non-production environments.
3. **Bulk Messaging Rate Limits**: If batch direct dispatch is invoked during cron runs, provider rate limits (e.g. Termii 10 req/s, Twilio concurrency limits) must be respected using sequential iteration or throttled concurrency.

---

## 4. Conclusion & Technical Recommendations

### 4.1 Recommended File Architecture
`m3_worker_1` should implement the following modules:

1. **`lib/follow-up-engine.ts`**:
   - `syncFollowUpTasks(options)`: Idempotently creates/updates `FollowUpTask` records from radar results with deterministic 0-token drafts.
   - `executeAutoEscalationScan(now?: Date)`: Queries overdue pending tasks (`dueDate <= now`), updates to `ESCALATED`, sets `escalatedTo: 'YOUTH_PASTOR'`, and logs audit rows in `FollowUpResult`.
   - `completeFollowUpTask(params)`: Marks task as `CONTACTED` and creates `FollowUpResult`.

2. **`app/api/cron/follow-up/route.ts`**:
   - Next.js App Router Route Handler exporting `GET` and `POST`.
   - Dual-mode Bearer token + query param secret validation.
   - Returns HTTP 401 on unauthorized, HTTP 200 with structured JSON telemetry.

3. **`app/actions/followup.ts` Enhancements**:
   - `getActiveFollowUpTasksAction()`: Returns active tasks with person details, rendered `aiDraftNote`, 1-click `waMeUrl`, and escalation status.
   - `completeFollowUpTaskAction({ taskId, callerName, outcome, note })`: Completes task and writes call log.
   - `dispatchFollowUpTaskAction({ taskId, channel })`: Sends message via `dispatchDirectMessage` and auto-completes on success.

4. **Automated Test Suites**:
   - `tests/unit/followup-task.test.ts`: Idempotent sync, cycle cooldown, 48h escalation scanning, task completion.
   - `tests/unit/cron-followup.test.ts`: Route authorization (Bearer header, query secret, invalid token HTTP 401, success HTTP 200).
   - `tests/adversarial/followup-escalation-adversarial.test.ts`: Clock shifts, duplicate rapid triggers, missing member data, network errors.

---

## 5. Verification Method

### 5.1 Test Execution
Run Vitest to verify all existing and newly authored test suites:
```bash
npm test
```
Or targeted execution:
```bash
npx vitest run tests/unit/followup-task.test.ts tests/unit/cron-followup.test.ts
```

### 5.2 Verification Checklist for Implementation
1. **Authorization Gate**:
   - Request to `/api/cron/follow-up` without header/param returns HTTP 401.
   - Request with `Authorization: Bearer wrong-secret` returns HTTP 401.
   - Request with `Authorization: Bearer valid-secret` returns HTTP 200 with JSON telemetry.
   - Request with `?secret=valid-secret` returns HTTP 200 with JSON telemetry.
2. **Idempotency**:
   - Running the cron endpoint twice sequentially does NOT create duplicate `FollowUpTask` records.
3. **Escalation Trigger**:
   - A task with `createdAt` set to 49 hours ago is successfully upgraded to `status: 'ESCALATED'`, `escalatedTo: 'YOUTH_PASTOR'`, and logs an audit row in `FollowUpResult`.
4. **Direct Dispatch Integration**:
   - Calling dispatch on a task returns a valid `waMeUrl` and marks the task `CONTACTED` upon successful delivery.
