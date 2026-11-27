# Survey Report: Follow-Up & Dispatch Engine (Explorer 2)

**Report Path**: `c:\Users\dafen\OneDrive\Desktop\church-management-system\.agents\teamwork\explorer_survey_2\handoff.md`  
**Date**: 2026-11-12T14:36:00Z  
**Author**: Explorer Survey 2 (Follow-Up & Dispatch Engine Explorer)  
**Status**: Completed (Hard Handoff)

---

## 1. Observation

### 1.1. Database Schema (`prisma/schema.prisma`)
- **`Person` (lines 123–158)**:
  - Models members, first-timers, and evangelism contacts.
  - Fields include `firstName`, `lastName`, `phone`, `phoneLast4`, `category` (`ADULT` | `YOUTH` | `WORKER` | `CHILD`), `subCategory` (`String?`, e.g. "YOUTH_WORKER"), `status` (`MEMBER` | `FIRST_TIMER` | `EVANGELISM`), `groupId`, `isActive`.
  - Relations include `attendanceRecords AttendanceRecord[]`, `followUpResults FollowUpResult[]`, `followUpTasks FollowUpTask[]`, `birthdayLogs BirthdayReminderLog[]`.
  - Indexes: `@@index([churchId, phoneLast4])`, `@@index([churchId, groupId])`, `@@index([churchId, birthMonth, birthDay])`.
- **`AttendanceRecord` (lines 163–187)**:
  - Fields: `personId`, `serviceScheduleId`, `date` (`DateTime`), `method` (`QR_SELF` | `USHER_MANUAL`), `subClass` (`String?`).
  - Unique constraint: `@@unique([personId, serviceScheduleId, date])`.
  - Index: `@@index([churchId, date])`.
- **`FollowUpTask` (lines 252–269)**:
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
- **`FollowUpResult` (lines 216–230)**:
  - Captures historical manual call outcomes (`outcome: "DOING_WELL" | "NEEDS_PRAYER" | "SICK" | "WANTS_VISIT" | "TRAVELLED" | "UNREACHABLE"`, `callerName`, `weekNumber`, `note`).

### 1.2. Application Code Gaps for `FollowUpTask`
- A repository-wide regex search for `FollowUpTask` returned zero occurrences across `app/`, `lib/`, and `scratch/`.
- `FollowUpTask` exists solely as a schema definition; no server actions or UI components query, create, or update `FollowUpTask` records.

### 1.3. Absence Detection State (`app/actions/followup.ts` vs Requirements)
- **Current `getFollowUpOverviewAction` (lines 143–178)**:
  - Fetches only the single most recent Sunday date (`latestSundayRecord = prisma.attendanceRecord.findFirst({ orderBy: { date: 'desc' } })`).
  - Computes `absentCount` as active members who were not present on that single date.
- **Current `getMembersForFollowUpAction` (lines 280–318)**:
  - `FIRST_TIMERS`: Filters by `status: 'FIRST_TIMER'`. **Gap**: Does not apply the 72-hour golden window filter. First-timers registered months ago remain in this list forever.
  - `ABSENT`: Filters by `id: { notIn: attendedIds }` from that single latest Sunday. **Gap**: No categorization into "Missed 1 Week", "Missed 2 Weeks", or "Dormant Critical".
  - `ALERTS`: Queries `FollowUpResult` from the last 14 days with `outcome in ['NEEDS_PRAYER', 'SICK', 'WANTS_VISIT']`.

### 1.4. Pastor Escalation State
- In `app/actions/followup.ts` and `app/followup/page.tsx`, there is zero logic checking for unresolved follow-up tasks older than 48 hours.
- `FollowUpTask.escalatedTo` is never populated.
- The UI tab "Pastoral Red Alerts" only displays emergency call logs from `FollowUpResult`, not overdue escalations.

### 1.5. Cron API Endpoints (`app/api/`)
- Command `Test-Path app/api` returned `False`.
- No Route Handlers exist at `/api/cron/follow-up` or `/api/cron/birthdays`.
- No authorization token check (`CRON_SECRET`) exists in the project.

### 1.6. Direct Messaging Gateways
- In `app/actions/followup.ts` (lines 458–553), `sendFollowUpBroadcastAction` generates URLs of the format `https://wa.me/{phone}?text={encoded}` in memory.
- There is no direct backend dispatch integration for **Termii**, **Twilio**, or **WhatsApp Cloud API**.
- `.env` contains only `DATABASE_URL`. No API keys or gateway variables are currently configured.

### 1.7. Message Generation & Token Optimization (`lib/ai-assistant.ts`)
- In `lib/ai-assistant.ts` (lines 48–86), `generateFollowUpDraft` attempts an external HTTP call to `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiKey}` whenever `GEMINI_API_KEY` is present.
- Its fallback `getHeuristicDraft` contains only 1 fixed message string per severity level, lacking dynamic token replacement or variety.
- There is no caching mechanism to prevent redundant token consumption when re-rendering or viewing member tasks.

### 1.8. Frontend & UI Standards Inspection
- `app/followup/page.tsx` uses custom tabs (`CALL_DESK`, `MESSAGING`, `ALERTS`) and client state for PIN authentication (`1234`, `7777`, `4444`).
- `app/components/AmbientBackground.tsx` (lines 17–25) injects a radial-gradient dot grid background and animated blur blobs, which violates the strict **Zero AI Tells** rule (no decorative grid matrices, no floating blur orbs).

---

## 2. Logic Chain

```
Observation 1.2: FollowUpTask exists in schema but is unreferenced in app/
Observation 1.3: Absence check only looks at 1 single date with no 72h or 2-week logic
Observation 1.5: app/api/ does not exist (no cron endpoints)
    │
    ▼
Step 1: The Zero-Forgotten-Member engine requires a dedicated Radar Service (lib/followup-radar.ts)
to evaluate member attendance across two consecutive Sunday service dates (S0 and S1) in WAT (Africa/Lagos)
and first-timers within 72 hours.
    │
    ▼
Step 2: FollowUpTask records must be idempotently populated by this Radar Service, assigning:
  - reason: FIRST_TIMER | MISSED_1_WEEK | MISSED_2_WEEKS | DORMANT_CRITICAL
  - status: PENDING
  - dueDate: createdAt + 48h (or Friday before next Sunday)
  - aiDraftNote: Pre-filled with deterministic 0-token template.
    │
    ▼
Observation 1.4: 48-hour pastor escalation logic is missing
    │
    ▼
Step 3: Escalation engine must query FollowUpTask where status == 'PENDING' and (now >= dueDate or now - createdAt >= 48h),
updating status to 'ESCALATED' and escalatedTo to 'YOUTH_PASTOR'.
    │
    ▼
Observation 1.5: No /api/cron/follow-up route handler exists
    │
    ▼
Step 4: Create app/api/cron/follow-up/route.ts protected by Authorization: Bearer ${CRON_SECRET} or ?key=${CRON_SECRET}.
When triggered, it executes:
  1) Anomaly Radar Scan -> creates/syncs FollowUpTasks.
  2) 48-Hour Escalation Scan -> marks overdue tasks ESCALATED.
  3) Direct Dispatch (if AUTO_DISPATCH_FOLLOWUP is enabled).
  4) Returns structured JSON metrics.
    │
    ▼
Observation 1.6 & 1.7: Direct dispatch and zero-token template requirements from user
    │
    ▼
Step 5: Create lib/messaging-gateway.ts implementing Termii (Nigeria-first), Twilio, and WhatsApp Cloud API
with 1-click wa.me URL fallback when unconfigured or in dry-run mode.
    │
    ▼
Step 6: Create lib/template-engine.ts with high-variety youth-friendly message banks (5+ variants per category)
interpolating {FirstName}, {LastName}, {Category}, {DaysAbsent}, {ChurchName}.
Ensure LLM polish is strictly opt-in on-demand and cached in FollowUpTask.aiDraftNote (0 tokens baseline).
```

---

## 3. Caveats

1. **Database Server Connectivity**: During turn execution, `prisma.church.count()` threw `PrismaClientInitializationError: Can't reach database server at ep-shy-frost-ax738n5q-pooler.c-4.us-east-2.aws.neon.tech:5432`. Local or offline tests must either use a local SQLite/Postgres shadow instance or mock Prisma queries in unit tests.
2. **First-Timer Attendance Linking**: A first-timer may be recorded via `registerFirstTimerAction` with `status: FIRST_TIMER`. If they never attended a service, their arrival is timed by `Person.createdAt`. If they attended, the first `AttendanceRecord.date` is used. The radar should check `Math.min(Person.createdAt, AttendanceRecord.date)`.
3. **Multi-tenant / Single Church Scope**: The schema supports `Church` tenancy, but currently the codebase uses `prisma.church.findFirst()`. The radar and cron routines should operate on all active churches or default to the primary church record.

---

## 4. Conclusion & System Architecture Specification

### 4.1. Core Modules to Implement

| Module | File Path | Responsibilities |
|---|---|---|
| **Absence Detection Radar** | `lib/followup-radar.ts` | Calculates $S_0$ and $S_1$ Sundays in `Africa/Lagos` (WAT); queries active members; detects 1-week miss, 2-week miss, 72h first-timer window, dormant; syncs `FollowUpTask`. |
| **Pastor Escalation Service** | `lib/followup-escalation.ts` | Scans `FollowUpTask` with `status: PENDING` older than 48 hours; transitions to `status: ESCALATED`, `escalatedTo: YOUTH_PASTOR`. |
| **Direct Messaging Gateway** | `lib/messaging-gateway.ts` | Unified provider interface for Termii (SMS/WhatsApp), Twilio, WhatsApp Cloud API; formats Nigerian numbers (`234...`); automatic 1-click `wa.me` fallback. |
| **0-Token Template Engine** | `lib/template-engine.ts` | Deterministic interpolation engine with 5+ youth-friendly message variants per category; injects `{FirstName}`, `{Category}`, `{DaysAbsent}`; opt-in LLM polish with database caching. |
| **Follow-Up Cron Route** | `app/api/cron/follow-up/route.ts` | Authenticated Next.js App Router route (`Bearer ${CRON_SECRET}`); executes radar, escalation, and optional direct dispatch. |
| **Follow-Up Server Actions** | `app/actions/followup.ts` | Updated to query `FollowUpTask`, assign volunteers, log call results, trigger on-demand AI polish, and execute 1-click or direct dispatches. |
| **Follow-Up Desk UI** | `app/followup/page.tsx` | Redesigned with youth-first aesthetics, radar KPI cards (1W, 2W, 72h, Escalated), 48h escalation drawer, "Polish with AI" button, and direct dispatch triggers. |

---

### 4.2. Detailed Technical Specifications

#### A. Radar Time & Sunday Calculation Logic
```ts
// Timezone: Africa/Lagos (WAT, UTC+1)
// 1. Identify S0 (most recent Sunday) and S1 (previous Sunday = S0 - 7 days)
// 2. Query attendance in {S0, S1}
// 3. Classification:
//    - FIRST_TIMER_72H: person.status === 'FIRST_TIMER' && (now - person.createdAt <= 72 * 3600 * 1000)
//    - MISSED_1_WEEK: attended S1 && absent S0
//    - MISSED_2_WEEKS: absent S0 && absent S1 && attended within last 60 days
//    - DORMANT_CRITICAL: absent > 21 days
```

#### B. Direct Messaging Gateway Architecture (`lib/messaging-gateway.ts`)
```ts
export type GatewayProvider = 'termii' | 'twilio' | 'whatsapp_cloud' | 'none';

export interface DispatchPayload {
  toPhone: string;
  message: string;
  channel?: 'WHATSAPP' | 'SMS' | 'AUTO';
  isDryRun?: boolean;
}

export interface DispatchResult {
  success: boolean;
  provider: GatewayProvider;
  messageId?: string;
  fallbackUrl: string; // Always available: https://wa.me/234XXXXXXXXXX?text=...
  error?: string;
  isSimulated: boolean;
}
```

- **Termii Integration**:
  - `POST https://api.ng.termii.com/api/sms/send`
  - Body: `{ to: "234...", from: process.env.TERMII_SENDER_ID || "RCCG-JCZ", sms: message, type: "plain", channel: "generic", api_key: process.env.TERMII_API_KEY }`
- **Twilio Integration**:
  - Basic Auth with `TWILIO_ACCOUNT_SID` and `TWILIO_AUTH_TOKEN`.
  - Body: `To=whatsapp:+234...&From=${process.env.TWILIO_WHATSAPP_FROM}&Body=...`
- **WhatsApp Cloud API Integration**:
  - `POST https://graph.facebook.com/v21.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`
  - Headers: `Authorization: Bearer ${process.env.WHATSAPP_CLOUD_ACCESS_TOKEN}`
- **Fallback Guarantee**:
  - If any provider fails, or if env keys are not present, return `fallbackUrl: https://wa.me/234...` with `success: true, provider: 'none', isSimulated: true`. No dispatch action will ever crash.

#### C. Zero-Token Deterministic Template Engine (`lib/template-engine.ts`)
Message Banks (sample excerpt):
```ts
export const MESSAGE_BANKS = {
  FIRST_TIMER: [
    "Hey {FirstName}! 🎉 It was such an honour having you with us at RCCG Jesus Covenant Zone! How was your Sunday? We'd love to see you again this coming week—you're family now! 🙌",
    "Good day {FirstName}! ✨ Thank you for worshipping with our youth church on Sunday! We're praying that God's grace and favour distinguish you in your school, work, and endeavors this week. Always here for you! 🙏",
    "Calvary greetings {FirstName}! We really enjoyed fellowshipping with you on Sunday. Hope you felt right at home! If you need any prayer support this week, feel free to reply. Have a supernatural week! 🕊️",
    "Hi {FirstName}, blessed week ahead! So glad you stopped by Jesus Covenant Zone. Looking forward to catching up more this coming Sunday. God bless you richly! 💫",
    "Hey {FirstName}! Big welcome to the Jesus Covenant family! 🎉 May this new week bring divine elevation and answers to your secret prayers. See you soon! 🔥"
  ],
  MISSED_1_WEEK: [
    "Hey {FirstName}! We noticed you couldn't make it to church yesterday and wanted to check in. Hope everything went well with your weekend and that your week is starting on a high note! 🌟",
    "Hi {FirstName}, just checking in on you! We missed your presence at Jesus Covenant Zone yesterday. Hope school/work is treating you well! Sending prayers your way! ❤️",
    "Hey {FirstName}, hope you're having a fruitful week! Just wanted to let you know you were missed in youth fellowship yesterday. Let us know if you need anything at all! 🙏",
    "Good day {FirstName}! Thinking of you today. Hope you're doing great and staying strong in the Lord. We missed you on Sunday—can't wait to see you this week! 🕊️",
    "Hey {FirstName}! Checking in on our champion. How is your week going? Praying God's peace and strength over everything you touch this week! Missed you yesterday! ✨"
  ],
  MISSED_2_WEEKS: [
    "Hello {FirstName}! You've been in our thoughts and prayers. We haven't seen you the past two Sundays and wanted to make sure you're doing okay. Let us know if you ever need anything or any prayer support! ❤️",
    "Hey {FirstName}, checking in with you! It's been a little while since we caught up at fellowship. Thinking of you and sending God's peace your way. How have you been holding up? 🤗",
    "Hi {FirstName}, warm greetings from RCCG Jesus Covenant Zone! Just reaching out because you're very precious to our church family. How are things with you? Always here if you need a listening ear! 🙏",
    "Calvary greetings {FirstName}! Hope you and your family are doing great. We missed you the last couple of services and wanted to send some love and prayer your way. You're never forgotten! 🕊️",
    "Hey {FirstName}! How's everything going? We've really missed your energy and fellowship the past two weeks. Please let us know how we can stand in prayer with you this week! 💫"
  ],
  DORMANT_CRITICAL: [
    "Dear {FirstName}, the youth leadership and pastoral team at Jesus Covenant Zone are sending our warmest love and prayers your way. We value you deeply and wanted to see how you are doing. Let's catch up whenever you're free! ❤️",
    "Hi {FirstName}, praying that God's grace and supernatural peace surround you today. You remain a treasured part of our fellowship family. We are always here for you in prayer and fellowship! 🙏"
  ]
};
```

- **Rotation Algorithm**:
  `const index = Math.abs(hashString(person.id + cycleKey)) % variants.length;`
  Guarantees:
  - Zero token consumption ($0 cost).
  - Variety across members on the same Sunday.
  - Variety across consecutive weeks for the same member.
- **Opt-in LLM Polish & Cache Flow**:
  1. Default: `task.aiDraftNote` is filled with deterministic template.
  2. If user clicks "Polish with AI":
     - Check if `task.aiDraftNote` has custom flag or if cache key exists.
     - Call Gemini API (`gemini-1.5-flash`) with concise prompt under 250 characters.
     - Save polished note to `FollowUpTask.aiDraftNote` in DB.
     - Subsequent reads consume cached `aiDraftNote` with 0 tokens.

#### D. Cron Route Specification (`app/api/cron/follow-up/route.ts`)
- **Method**: `GET` and `POST`
- **Headers**: `Authorization: Bearer <CRON_SECRET>` or query `?key=<CRON_SECRET>`
- **Response Format**:
  ```json
  {
    "success": true,
    "timestamp": "2026-11-12T07:00:00.000Z",
    "radar": {
      "firstTimers72h": 4,
      "missed1Week": 12,
      "missed2Weeks": 5,
      "dormantCritical": 8
    },
    "tasksCreated": 16,
    "tasksEscalated": 3,
    "dispatchesSent": 0,
    "executionTimeMs": 245
  }
  ```

---

## 5. Verification Method

### 5.1. How to Independently Verify Observations
1. **Schema Verification**:
   ```bash
   npx prisma validate
   ```
2. **FollowUpTask Absence in App Code**:
   ```powershell
   Get-ChildItem -Path app,lib -Recurse -File -Include *.ts,*.tsx | Select-String -Pattern "FollowUpTask"
   ```
   *(Expected result: 0 matches, confirming it is not currently utilized).*
3. **Cron Route Absence**:
   ```powershell
   Test-Path app/api/cron/follow-up/route.ts
   ```
   *(Expected result: `False`).*

### 5.2. Post-Implementation Verification Commands
1. **Type Checking & Linting**:
   ```bash
   npx tsc --noEmit
   npm run lint
   ```
2. **Unit Test Suite Execution**:
   Create and run unit tests for the template engine and radar logic:
   - Verify deterministic variable substitution (`{FirstName}`, `{Category}`).
   - Verify that 0 tokens are used when rendering default templates.
   - Verify that hash rotation yields consistent messages per member per week.
   - Verify phone number formatting converts `080...` to `23480...`.
   - Verify that `/api/cron/follow-up` returns `401 Unauthorized` without a valid secret.
   - Verify that tasks past 48h escalate to `YOUTH_PASTOR`.
3. **Next.js Production Build**:
   ```bash
   npm run build
   ```
