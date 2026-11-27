# Handoff Report — Absence Detection Radar & Data Models (Milestone 3 / Requirement R2)

**Author**: `m3_explorer_1`
**Recipient**: `9ffc4707-a26f-4abc-94bd-08bbb49a081e` (Orchestrator) & `m3_worker_1` (Implementer)
**Date**: 2026-11-12T17:42:00Z
**Type**: Hard Handoff (Investigation & Architecture Design Complete)

---

## 1. Observation

### 1.1 Database Schema State (`prisma/schema.prisma`)
Inspection of `prisma/schema.prisma` reveals existing models and indexing:
- **`Person` (lines 123-159)**:
  - Fields: `id`, `churchId`, `firstName`, `lastName`, `phone`, `phoneLast4`, `category` (enum `ADULT`, `YOUTH`, `WORKER`, `CHILD`), `subCategory` (`String?`), `status` (enum `MEMBER`, `FIRST_TIMER`, `EVANGELISM`), `groupId` (`String?`), `isActive` (`Boolean @default(true)`), `createdAt` (`DateTime @default(now())`).
  - Existing indexes:
    ```prisma
    @@index([churchId, phoneLast4])
    @@index([churchId, groupId])
    @@index([churchId, birthMonth, birthDay])
    ```
- **`AttendanceRecord` (lines 163-187)**:
  - Fields: `id`, `churchId`, `personId`, `serviceScheduleId`, `date` (`DateTime`), `subClass` (`String?`), `method` (`CheckInMethod`), `createdAt`.
  - Existing constraints & indexes:
    ```prisma
    @@unique([personId, serviceScheduleId, date])
    @@index([churchId, date])
    ```
- **`FollowUpTask` (lines 252-269)**:
  - Fields:
    ```prisma
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
- **`FollowUpResult` (lines 216-230)**:
  - Records manual call logs (`callerName`, `weekNumber`, `outcome`, `note`, `createdAt`).

### 1.2 Timezone & Date Normalization (`lib/service-resolver.ts`)
- In `lib/service-resolver.ts` lines 33-73, `getNigerianTimeInfo` formats UTC timestamps to `'Africa/Lagos'` without server location bias:
  ```ts
  export function getNigerianTimeInfo(date: Date = new Date()) {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Africa/Lagos',
      hour12: false,
      weekday: 'long',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    ...
  ```
- Lines 79-82 normalize Nigerian calendar days to UTC midnight:
  ```ts
  export function getNigerianDateMidnight(date: Date = new Date()): Date {
    const info = getNigerianTimeInfo(date);
    return new Date(Date.UTC(info.year, info.month - 1, info.dayOfMonth, 0, 0, 0, 0));
  }
  ```
- In `app/actions/attendance.ts` lines 323-357, every attendance check-in writes `date: getNigerianDateMidnight()`. Therefore, attendance records are stored consistently at `YYYY-MM-DDT00:00:00.000Z` corresponding to the Nigerian calendar day.

### 1.3 Message Templates & Near-Zero Token Integration (`lib/template-engine.ts` & `lib/ai-assistant.ts`)
- `lib/template-engine.ts` lines 12-20 define categories:
  `FIRST_TIMER_72H`, `MISSED_1_WEEK`, `MISSED_2_WEEKS`, `DORMANT_CRITICAL`.
- `renderTemplate(category, context)` provides deterministic 0-token messages with youth-friendly Nigerian church tone, personalized with `{FirstName}`, `{Department}`, `{DaysAbsent}`, etc.
- In `lib/ai-assistant.ts` lines 71-83, severities match `FollowUpTask.reason` strings (`FIRST_TIMER`, `MISSED_1_WEEK`, `MISSED_2_WEEKS`, `DORMANT_CRITICAL`).

### 1.4 Test Infrastructure (`tests/setup.ts` & `tests/helpers/prisma-mock.ts`)
- `npx vitest run` executes 7 test files with 179 passing tests in 3.8s.
- `mockPrisma` in `tests/helpers/prisma-mock.ts` lines 75-85 already mocks `followUpTask` methods: `findUnique`, `findFirst`, `findMany`, `create`, `update`, `updateMany`, `upsert`, `delete`, `count`.

---

## 2. Logic Chain

### 2.1 Timezone Arithmetic for Target Sunday Determination
1. **Observation**: Attendance is recorded per service on Sundays with `date: Date.UTC(year, month - 1, day)`.
2. **Step**: Nigeria (Africa/Lagos) is UTC+1 year-round with zero Daylight Saving Time changes.
3. **Algorithm**:
   - Determine current Nigerian day and hour using `getNigerianTimeInfo(refDate)`.
   - Let `dayOfWeekIndex` be: Sunday=0, Monday=1, Tuesday=2, Wednesday=3, Thursday=4, Friday=5, Saturday=6.
   - If today is Sunday (`dayOfWeekIndex === 0`):
     - If Nigerian hour $\ge 13$:00 WAT (after church services finish), today is the most recent completed Sunday ($S_1$, offset = 0 days).
     - If Nigerian hour $< 13$:00 WAT (service not finished yet), $S_1$ is last week's Sunday (offset = 7 days).
   - If today is Monday through Saturday (`dayOfWeekIndex > 0`):
     - The most recent Sunday $S_1$ was `dayOfWeekIndex` days ago.
   - $S_2$ (previous Sunday) = $S_1 - 7\text{ days}$.
   - $S_3$ (3 Sundays ago) = $S_1 - 14\text{ days}$.
4. **Drift-Free Computation**:
   ```ts
   const baseUtc = Date.UTC(ng.year, ng.month - 1, ng.dayOfMonth, 0, 0, 0, 0);
   const s1Date = new Date(baseUtc - daysBackToS1 * 86400000);
   const s2Date = new Date(s1Date.getTime() - 7 * 86400000);
   const s3Date = new Date(s1Date.getTime() - 14 * 86400000);
   ```
   Because all values are anchored at UTC midnight, subtracting multiples of $86,400,000\text{ ms}$ (exact 24 hours) guarantees exact matching with the database records.

### 2.2 Member Classification Radar Rules
From requirement R2, members must be partitioned into three key follow-up segments:

1. **`FIRST_TIMER_72H` (First-Timers within 72h Window)**:
   - Condition:
     - `person.isActive === true`
     - `person.status === 'FIRST_TIMER'`
     - (`now - person.createdAt <= 72 hours` OR person attended $S_1$ and has `contactedAt === null`).
   - Rationale: First-timers require rapid touchpoints within 72 hours before retention drops.
   - Priority: Highest.
   - Task `reason = 'FIRST_TIMER'`, `dueDate = person.createdAt + 72 hours`.

2. **`MISSED_1_WEEK` (Missed 1 Week)**:
   - Condition:
     - `person.isActive === true`
     - `person.status === 'MEMBER'`
     - Did **NOT** attend $S_1$ (`personId` not in $S_1$ attendee set)
     - **AND** attended $S_2$ (`personId` in $S_2$ attendee set) *OR* was created between $S_2$ and $S_1$.
   - Rationale: Member was active 1 week ago but missed this past Sunday. This catches absences early.
   - Task `reason = 'MISSED_1_WEEK'`, `dueDate = now + 48 hours`.

3. **`MISSED_2_WEEKS` (Missed 2 Consecutive Weeks)**:
   - Condition:
     - `person.isActive === true`
     - `person.status === 'MEMBER'`
     - Did **NOT** attend $S_1$
     - Did **NOT** attend $S_2$
     - **AND** attended $S_3$ *OR* attended at least once within the past 60 days (historically active).
   - Rationale: Member missed both recent Sundays consecutively, signaling an active disengagement risk requiring leadership check-in.
   - Task `reason = 'MISSED_2_WEEKS'`, `dueDate = now + 48 hours`.

4. **Edge Case: Zero Attendance History**:
   - If a person has zero lifetime attendance records:
     - If created as `FIRST_TIMER` within 72h -> captured under `FIRST_TIMER_72H`.
     - If registered as `MEMBER` with 0 records -> they are classified as "Unonboarded" and excluded from 1-week/2-week miss to prevent spamming false absence alerts.

### 2.3 48-Hour Escalation Mechanics to Youth Pastor
- Requirement R2 mandates: "48-hour escalation tracking to the Youth Pastor, integrated with the existing FollowUpTask schema."
- Logic:
  1. For any `FollowUpTask`:
     - Initial state: `status = 'PENDING'`, `escalatedTo = null`, `dueDate = createdAt + 48 hours` (72 hours for first timers).
  2. When `/api/cron/follow-up` runs (or when task scanner checks overdue tasks):
     - Identify all tasks where `status === 'PENDING'` AND `now > dueDate` AND `escalatedTo === null`.
     - Update in batch:
       ```ts
       await prisma.followUpTask.updateMany({
         where: {
           id: { in: overdueTaskIds },
           status: 'PENDING',
         },
         data: {
           status: 'ESCALATED',
           escalatedTo: 'YOUTH_PASTOR',
         },
       });
       ```
  3. Escalated tasks are visually flagged in the Follow-Up dashboard under the "Pastor Escalations" badge with an alert indicator.

### 2.4 Prevention of N+1 Query Bottlenecks (The 4-Batch Query Strategy)
- Running queries inside a `for (const person of people)` loop causes $O(N)$ database requests, introducing connection pool starvation.
- **Batching Strategy**: Execute exactly 4 queries in parallel via `Promise.all`:
  1. `prisma.person.findMany({ where: { churchId, isActive: true }, ... })` — gets all active members.
  2. `prisma.attendanceRecord.findMany({ where: { churchId, date: { in: [s1Date, s2Date, s3Date] } }, select: { personId: true, date: true } })` — leverages `@@index([churchId, date])`.
  3. `prisma.attendanceRecord.findMany({ where: { churchId, date: { gte: sixtyDaysAgo } }, select: { personId: true }, distinct: ['personId'] })` — identifies all historically active members in 1 index seek.
  4. `prisma.followUpTask.findMany({ where: { person: { churchId }, status: { in: ['PENDING', 'ESCALATED'] } } })` — provides open task deduplication index.
- In-memory sets (`Set<string>` and `Map<string, Task>`) resolve all classifications in $O(1)$ memory lookups, reducing DB round-trips from hundreds to **4 constant queries**.

---

## 3. Caveats

1. **Midweek Attendance Exemption**:
   - While Wednesday Faith Clinic, Tuesday Digging Deep, and Friday Youth Prayer exist in `ServiceSchedule`, corporate absence detection is keyed to **Sunday** worship. Attendance on a Tuesday does not substitute for Sunday service absence, but can be viewed as supplementary context in call notes.
2. **First-Timer Attendance Date**:
   - First-timers who attend without registering on Sunday (e.g. registered 1 day later via phone) will still have their `createdAt` fall within the 72-hour window.
3. **Database Migration Requirement**:
   - The existing `prisma/schema.prisma` contains all necessary fields (`FollowUpTask`, `Person`, `AttendanceRecord`, `FollowUpResult`). No schema migration or breaking database changes are required!

---

## 4. Conclusion & Architecture Blueprint for `m3_worker_1`

### 4.1 Recommended Implementation Architecture

```
church-management-system/
├── lib/
│   └── absence-radar.ts              # Core pure algorithm: Sunday dates, batch query, classification, 48h escalation
├── app/
│   ├── actions/
│   │   └── followup.ts               # Enhanced server actions: getAbsenceRadarAction, syncAbsenceTasksAction, escalateAction
│   ├── api/
│   │   └── cron/
│   │       └── follow-up/
│   │           └── route.ts          # Authorized Route Handler (CRON_SECRET) for automated radar scan & 48h escalation
│   └── followup/
│       └── page.tsx                  # Absence Radar dashboard with tabs, 1-click wa.me dispatch & pastor escalation badge
└── tests/
    ├── unit/
    │   └── absence-radar.test.ts     # Unit tests: dates, classification, 48h escalation, deduplication
    └── adversarial/
        └── absence-radar-adversarial.test.ts # Stress tests: edge cases, timezone leap days, DB connection errors, N+1 mock counts
```

### 4.2 Data Contracts & Types (`lib/absence-radar.ts`)

```ts
export type AbsenceReason = 'FIRST_TIMER' | 'MISSED_1_WEEK' | 'MISSED_2_WEEKS' | 'DORMANT_CRITICAL';

export interface TargetSundays {
  s1Date: Date;         // Most recent Sunday (UTC midnight)
  s2Date: Date;         // Previous Sunday (S1 - 7 days)
  s3Date: Date;         // 3 Sundays ago (S1 - 14 days)
  s1Formatted: string;  // e.g. "8 Nov 2026"
  s2Formatted: string;
}

export interface RadarClassifiedMember {
  personId: string;
  firstName: string;
  lastName: string;
  phone: string;
  category: string;
  subCategory: string | null;
  reason: AbsenceReason;
  daysAbsent: number;
  lastAttendedDate: Date | null;
  lastAttendedFormatted: string;
  existingTaskId?: string;
  taskStatus?: string;
  isEscalated: boolean;
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
  };
}
```

### 4.3 Server Action Signatures (`app/actions/followup.ts`)

```ts
// 1. Fetch Radar Dashboard Data (used by UI)
export async function getAbsenceRadarAction(filters?: {
  reason?: AbsenceReason | 'ALL';
  category?: string;
  searchQuery?: string;
}): Promise<{ success: boolean; data?: AbsenceRadarScanResult; error?: string }>;

// 2. Trigger Radar Sync & Create/Update FollowUpTasks (used by UI "Scan Now" button)
export async function syncAbsenceTasksAction(): Promise<{
  success: boolean;
  createdCount: number;
  updatedCount: number;
  escalatedCount: number;
  error?: string;
}>;

// 3. Mark Follow-Up Task as Contacted
export async function completeFollowUpTaskAction(params: {
  taskId: string;
  outcome: FollowUpOutcome;
  note?: string;
  callerName?: string;
}): Promise<{ success: boolean; message?: string; error?: string }>;

// 4. Manually Escalate Task to Youth Pastor
export async function escalateTaskToPastorAction(taskId: string): Promise<{
  success: boolean;
  message?: string;
  error?: string;
}>;
```

### 4.4 Authorized Route Handler Contract (`app/api/cron/follow-up/route.ts`)
- **Method**: `GET` / `POST`
- **Headers**:
  `Authorization: Bearer <CRON_SECRET>` or `x-cron-secret: <CRON_SECRET>`
- **Response Format**:
  ```json
  {
    "success": true,
    "timestamp": "2026-11-12T17:42:00.000Z",
    "scanned": 150,
    "missed1Week": 12,
    "missed2Weeks": 5,
    "firstTimers72h": 4,
    "tasksCreated": 8,
    "tasksEscalated": 2
  }
  ```
- **Unauthorized**: Returns 401 Unauthorized if secret is missing or mismatched.

---

## 5. Verification Method

### 5.1 Automated Test Execution Command
Run the Vitest test suite to verify zero regressions and complete coverage:
```powershell
npx vitest run
```

### 5.2 Verification Scenarios for `m3_worker_1` Test Suite
1. **Timezone Boundaries**: Test `getTargetSundayDates` with dates on Sunday 08:00 (before cutoff) vs Sunday 16:00 (after cutoff) vs Monday vs Friday.
2. **Classification Correctness**:
   - Member attended $S_2$, missed $S_1$ $\rightarrow$ `MISSED_1_WEEK`.
   - Member missed $S_1$ and $S_2$, but attended $S_3$ $\rightarrow$ `MISSED_2_WEEKS`.
   - First-timer created 24 hours ago $\rightarrow$ `FIRST_TIMER_72H`.
   - Inactive member (`isActive: false`) $\rightarrow$ Excluded.
   - Zero attendance member $\rightarrow$ Excluded from absence spam.
3. **Task Deduplication**: Running sync twice must not duplicate open `FollowUpTask` records.
4. **48-Hour Escalation**: A `FollowUpTask` with `createdAt = now - 50h` and `status = 'PENDING'` must transition to `status = 'ESCALATED'` with `escalatedTo = 'YOUTH_PASTOR'`.
5. **Cron Security**: Request without valid `CRON_SECRET` returns 401; request with valid secret returns 200 with JSON summary.
6. **Frontend Compliance**: UI tabs in `app/followup/page.tsx` must adhere to anti-AI tells (zero fake grid lines, zero arbitrary purple glows, scale from 0.95 entrance animations, 44px minimum touch targets).
