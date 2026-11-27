# Handoff Report — Youth Follow-Up Dashboard UI & Engineering Compliance Specification

**Agent**: `m3_explorer_3` (Youth Follow-Up Dashboard UI & Compliance Explorer)  
**Parent / Caller**: `9ffc4707-a26f-4abc-94bd-08bbb49a081e`  
**Milestone**: Milestone 3 (Requirement R2: Zero-Forgotten-Member Follow-Up Engine)  
**Date**: 2026-11-12T17:45:00Z  
**Type**: Hard Handoff (Investigation & Architecture Design Complete)

---

## 1. Observation

### 1.1 Existing Follow-Up Implementation (`app/followup/page.tsx`)
A complete audit of `app/followup/page.tsx` (1,093 lines) reveals the current state:
1. **Monolithic Architecture**: The page contains inline authentication PIN gate (lines 275–328 with hardcoded PINs `1234`, `7777`, `4444`), header, KPI scorecards (lines 418–517), 3 tabs (Volunteer Call Desk, Automated Messaging, Pastoral Care Red Alerts), member cards with inline outcome loggers (lines 662–840), template selectors, and broadcast launchers.
2. **Absence Radar Disconnect**:
   - The 4 KPI cards currently display: "First-Timers", "Absent Members", "Calling Groups", and "Care Alerts".
   - This does **NOT** fulfill Requirement R2, which mandates an **Absence Detection Radar Overview** categorizing members into:
     - **Missed 1 Week** (attended 2 weeks ago, missed most recent Sunday service in WAT UTC+1)
     - **Missed 2 Weeks** (missed 2 consecutive Sunday services)
     - **First-Timers (72h)** (new worshippers registered within the 72-hour care window)
     - **Escalated to Pastor** (pending >48h or flagged for pastoral intervention)
   - Clicking KPI pills does not trigger active radar filtering across these 4 mandated states.
3. **Template Engine & Token Optimization Gap**:
   - Line 667 hardcodes a single static message:
     ```ts
     const waGreeting = encodeURIComponent(
       `Hello ${person.firstName}, warm Christian greetings from RCCG Jesus Covenant Zone! How are you doing today?`
     );
     ```
   - It does **NOT** use `lib/template-engine.ts` (`renderTemplate` or youth-friendly message banks).
   - It lacks live dynamic parameter interpolation (`{DaysAbsent}`, `{Department}`, `{ChurchName}`, `{YouthPastorName}`).
   - It lacks tone selection (`CASUAL_YOUTH`, `WARM_FELLOWSHIP`, `PASTORAL_CARE`).
4. **Missing Direct Dispatch & On-Demand AI Polish**:
   - The UI does not provide a direct dispatch gateway trigger calling `lib/direct-dispatch.ts` via server action.
   - It does not provide the "Polish with AI" on-demand button calling `lib/ai-assistant.ts` with 7-day deduplication caching and diff preview.
5. **Outcome Logging Inconsistency**:
   - Lines 787–794 define call outcomes: `DOING_WELL`, `NEEDS_PRAYER`, `SICK`, `WANTS_VISIT`, `TRAVELLED`, `UNREACHABLE`.
   - In contrast, Requirement R2 mandates the standardized follow-up outcomes:
     - `"Contacted (WhatsApp)"`
     - `"Contacted (Call)"`
     - `"Prayed With"`
     - `"Visit Scheduled"`
     - `"No Response"`
   - Submitting an outcome inserts into `prisma.followUpResult` but fails to update or complete the member's `FollowUpTask` (`status: 'CONTACTED'`, `contactedAt: new Date()`).
6. **Frontend Standard Violations**:
   - **Motion**: Does not use Framer Motion physics or `@/lib/motion`. Uses raw Tailwind classes with no momentum deceleration curves (`cubic-bezier(0.23, 1, 0.32, 1)`) and no entrance scale from 0.95.
   - **Touch Targets**: Multiple buttons (e.g. outcome chips `py-1.5 px-2`, text-[11px]) measure ~28px to 32px tall, violating the mandatory 44px minimum touch target requirement.
   - **Typography & Contrast**: Uses low-contrast `text-slate-400` on light slate backgrounds, failing WCAG AAA text contrast standards.

### 1.2 Available Core Messaging & Motion Infrastructure
1. **Motion Tokens (`lib/motion.ts`)**:
   - `MOMENTUM_EASE = [0.23, 1, 0.32, 1]` (momentum deceleration, zero ease-in).
   - `DRAWER_EASE = [0.32, 0.72, 0, 1]` (sheet & drawer transitions).
   - `SNAPPY_EASE = [0.16, 1, 0.3, 1]` (rapid exit transitions).
   - `surfaceEntranceVariants`: `opacity: 0, scale: 0.95` -> `opacity: 1, scale: 1` in 240ms with `MOMENTUM_EASE`.
   - `tactileTapProps`: `whileTap: { scale: 0.97 }`, transition `duration: 0.08` (<100ms click feedback).
2. **Deterministic 0-Token Template Engine (`lib/template-engine.ts`)**:
   - High-variety message banks across `FIRST_TIMER_72H`, `MISSED_1_WEEK`, `MISSED_2_WEEKS`, `DORMANT_CRITICAL`.
   - Tones: `CASUAL_YOUTH` (authentic Nigerian youth voice), `WARM_FELLOWSHIP`, `PASTORAL_CARE`.
   - `renderTemplate(category, context, options)` returns `text`, `metadata`, and guarantees `tokensConsumed: 0`.
3. **Multi-Provider Direct Dispatch Gateway (`lib/direct-dispatch.ts`)**:
   - `dispatchDirectMessage(payload)`: Connects to Termii (Nigeria SMS), Meta WhatsApp Cloud API, Twilio, or generates safe 1-click fallback `waMeUrl`.
   - `normalizePhoneNumber(raw)`: Standardizes Nigerian phone formats (`080...` -> `+23480...`, `digitsOnly: 23480...`).
   - `generateWaMeLink(digitsOnly, text)`: Encodes clean `https://wa.me/...` URL.
4. **On-Demand AI Assistant (`lib/ai-assistant.ts`)**:
   - `polishDraftWithAi(baseDraft, member, tone)`: In-memory 7-day TTL cache `aiCache` (0 tokens on cache hit; fallback to base draft if API is unavailable).
5. **Timezone Normalization (`lib/service-resolver.ts`)**:
   - `getNigerianTimeInfo()` & `getNigerianDateMidnight()` guarantee Africa/Lagos WAT (UTC+1) accuracy without server drift.
6. **Peer Explorer Findings**:
   - `m3_explorer_1` authored the 4-query batch absence detection radar (`lib/absence-radar.ts`) and data contracts (`RadarClassifiedMember`, `AbsenceRadarScanResult`).
   - `m3_explorer_2` authored the `FollowUpTask` lifecycle, 48-hour auto-escalation engine, and authorized `/api/cron/follow-up` endpoint.

---

## 2. Logic Chain

### 2.1 UI Architecture & Decomposition Strategy
To guarantee maintainability, testability, and responsiveness, the monolithic `app/followup/page.tsx` must be refactored into modular components co-located in `app/components/followup/`:

```
app/
├── followup/
│   └── page.tsx                         # Main Dashboard Page (Layout, Filter State, Query Dispatch)
└── components/
    └── followup/
        ├── FollowUpHeader.tsx           # Church identity, WAT week badge, caller name, search bar
        ├── RadarOverview.tsx            # 4 interactive metric cards with active filter states
        ├── MemberFollowUpCard.tsx       # Follow-up card: details, preview, triggers, outcome logger
        ├── MessagePreviewBubble.tsx     # WhatsApp chat bubble preview with tone selector & 0-token badge
        ├── AiPolishButton.tsx           # On-demand AI polish trigger with cache indicator & diff toggle
        ├── DirectDispatchButton.tsx     # Multi-provider gateway SMS/WhatsApp dispatch trigger
        ├── TaskOutcomeSelector.tsx      # Tactile 5-tier outcome chips with caller note input
        └── EscalationBanner.tsx         # Pastoral red alert banner for >48h overdue tasks
```

### 2.2 Radar Overview & Active Filter State Machine
1. **Radar Metric Cards**:
   - The top section of the dashboard features 4 interactive metric cards:
     - **Card 1: Missed 1 Week** (Blue `#1d4ed8` accent) — Active members who missed the latest Sunday service.
     - **Card 2: Missed 2 Weeks** (Amber `#b45309` accent) — Critical retention window (missed 2 consecutive Sundays).
     - **Card 3: First-Timers (72h)** (Emerald `#047857` accent) — High-touch welcome window for recent worshippers.
     - **Card 4: Escalated to Pastor** (Rose `#be123c` accent) — Tasks pending >48 hours or requiring pastoral prayer/visit.
2. **Active Filter Interaction**:
   - Clicking a metric card switches `activeFilter` (`'MISSED_1_WEEK' | 'MISSED_2_WEEKS' | 'FIRST_TIMER_72H' | 'ESCALATED' | 'ALL'`).
   - Visual feedback: The active card receives `ring-2 ring-blue-600 bg-white shadow-sm`, while non-active cards display subtle neutral borders (`border-slate-200 bg-white/70`).
   - Filtering is instantaneous and reactive, narrowing the Member Queue below without reloading the entire page.

### 2.3 Member Follow-Up Card Workflow
For each member in the active queue:
1. **Member Identity & Telemetry**:
   - Displays full name in high-contrast `text-slate-950` font.
   - Category badge (`YOUTH`, `WORKER`, `MEDIA`, `CHOIR`).
   - Absence metric: e.g. "7 days absent", "14 days absent", or "First-Timer (registered 36h ago)".
   - Formatted phone number with national display (`0803 123 4567`) and international WhatsApp format (`2348031234567`).
   - Escalation status: If `task.status === 'ESCALATED'`, displays an accessible high-contrast warning badge: `Escalated to Youth Pastor (>48h Overdue)`.
2. **Deterministic 0-Token WhatsApp Message Preview (`MessagePreviewBubble.tsx`)**:
   - Pre-rendered from `lib/template-engine.ts` using `renderTemplate(category, context, { tone })`.
   - Displayed in a realistic WhatsApp message preview bubble (`bg-emerald-50/50 border border-emerald-200/80 rounded-2xl p-4`).
   - Tone selector pills:
     - `CASUAL_YOUTH` ("Casual Youth ⚡" — default for youth church)
     - `WARM_FELLOWSHIP` ("Warm Fellowship ❤️")
     - `PASTORAL_CARE` ("Pastoral Care 🕊️")
   - Displays token badge: `0 Tokens (Deterministic Engine)`.
3. **1-Click WhatsApp Button**:
   - Anchor button targeting `https://wa.me/{phoneDigits}?text={encodedText}`.
   - Opens WhatsApp Web or mobile app in a new tab (`target="_blank" rel="noopener noreferrer"`).
   - Meets 44px minimum touch target height (`min-h-[44px]`).
   - Tactile click feedback via `whileTap={{ scale: 0.97 }}` (<100ms).
4. **Direct Dispatch Trigger (`DirectDispatchButton.tsx`)**:
   - Direct SMS/WhatsApp dispatch via Server Action `directDispatchTaskAction`.
   - Calls `dispatchDirectMessage` (Termii, Meta Cloud API, Twilio).
   - Displays real-time status: "Delivered (Termii)", "Queued (Twilio)", or "1-Click Fallback Generated".
   - Shows smooth spinner while in-flight.
5. **"Polish with AI" On-Demand Button (`AiPolishButton.tsx`)**:
   - Subtly styled button with sparkle icon: `Polish with AI`.
   - Strictly on-demand execution (0 tokens spent unless explicitly triggered).
   - Calls Server Action `polishFollowUpDraftAction`.
   - Deduplication caching guarantees 0 tokens on subsequent requests within 7 days.
   - When polished, presents a subtle "Diff Toggle" (`View Original Template` vs `View AI Polished`) and updates token badge to `AI Polished (Near-Zero Tokens)`.
6. **Task Completion / Outcome Selector (`TaskOutcomeSelector.tsx`)**:
   - Presents the 5 mandated outcome choices:
     1. `Contacted (WhatsApp)` (Emerald)
     2. `Contacted (Call)` (Blue)
     3. `Prayed With` (Indigo)
     4. `Visit Scheduled` (Amber)
     5. `No Response` (Slate)
   - Includes optional caller notes field (e.g. "Navigating exam pressure, prayed for wisdom").
   - Volunteer caller identity is automatically attached from localStorage or user session.
   - On submit: Calls `completeFollowUpTaskAction`, updates `FollowUpTask` (`status: 'CONTACTED'`, `contactedAt: new Date()`), writes `FollowUpResult`, and displays success toast.
   - Card transitions out smoothly using Framer Motion exit animation (`opacity: 0, scale: 0.97` in 160ms with `SNAPPY_EASE`).

### 2.4 User Rule & Design Standard Verification
1. **Emil Kowalski Motion Physics**:
   - Momentum deceleration: All entrance transitions use `transition={{ duration: 0.24, ease: [0.23, 1, 0.32, 1] }}`.
   - Never scale from zero: All animated surfaces scale from `scale: 0.95` to `scale: 1`.
   - Tactile tap feedback: Buttons use `whileTap={{ scale: 0.97 }}` with `duration: 0.08` (<100ms).
   - Composite-only animations: Only `transform` and `opacity` are animated.
2. **Zero AI Tells (Impeccable Style)**:
   - Zero decorative hairline grid lines (`[codex-grid-background]`).
   - Zero arbitrary purple gradients or neon floating blur bubbles.
   - Zero cartoon bounces (`animate-bounce` is strictly forbidden).
   - Zero AI placeholder copy ("Empower synergies" replaced with authentic RCCG Jesus Covenant Zone data).
   - Strict Accessibility: All interactive elements maintain `min-h-[44px]` and `min-w-[44px]`. Text uses high-contrast `text-slate-950` (#020617) on white/slate surfaces for WCAG AAA compliance (>7:1 contrast).
3. **Leon Lin `design-taste-frontend`**:
   - One section per screen / clean responsive layout.
   - Equal margins: `max-w-6xl mx-auto px-4 sm:px-6` across all viewports.
   - Zero caption essays: UI speaks for itself with clean telemetry badges.

---

## 3. Caveats

1. **Authentication Mode**:
   - `app/followup/page.tsx` currently has a PIN gate with hardcoded values (`1234`, `7777`, `4444`). While this protects the page in volunteer environments, it should continue to support session storage caching (`sessionStorage.setItem('rccg_admin_auth', 'true')`) while remaining compatible with future NextAuth / database user authentication.
2. **Hydration & Dynamic Rendering**:
   - Because the dashboard renders live Africa/Lagos (WAT UTC+1) times and retrieves `localStorage` caller identities, client-side hydration must be handled cleanly via an `isMounted` state or Next.js App Router dynamic rendering (`export const dynamic = 'force-dynamic'`).
3. **WhatsApp Deep Linking on Desktop vs Mobile**:
   - `https://wa.me/{phone}?text={encoded}` opens WhatsApp Desktop/Web on PC and WhatsApp app on iOS/Android. This is universal and requires zero API credentials or third-party SDKs.

---

## 4. Conclusion & Component Decomposition Specification for `m3_worker_1`

### 4.1 Component Architecture Specification

#### 1. `app/components/followup/FollowUpHeader.tsx`
- **Props**:
  - `churchName: string`
  - `watTimeFormatted: string`
  - `currentWeekLabel: string`
  - `callerName: string`
  - `onCallerNameChange: (name: string) => void`
  - `onRefresh: () => void`
  - `isRefreshing: boolean`
  - `searchQuery: string`
  - `onSearchChange: (query: string) => void`
- **Features**:
  - Official RCCG Logo (`/rccg-logo.png`, 36x36px).
  - High-contrast church title and WAT Africa/Lagos badge.
  - Interactive volunteer caller name input synchronized with `localStorage`.
  - Refresh button with smooth spinner.
  - Instant search input with clear button.

#### 2. `app/components/followup/RadarOverview.tsx`
- **Props**:
  - `metrics: RadarMetrics`
  - `activeFilter: RadarFilterType`
  - `onFilterChange: (filter: RadarFilterType) => void`
- **Features**:
  - 4 responsive KPI cards: Missed 1 Week, Missed 2 Weeks, First-Timers (72h), Escalated to Pastor.
  - Clear counts, descriptions, and active state indicators.
  - Tactile tap feedback on card selection (`whileTap={{ scale: 0.98 }}`).

#### 3. `app/components/followup/MemberFollowUpCard.tsx`
- **Props**:
  - `member: RadarClassifiedMember`
  - `callerName: string`
  - `onTaskCompleted: (taskId: string) => void`
  - `onDirectDispatch: (member: RadarClassifiedMember) => Promise<void>`
  - `onPolishWithAi: (member: RadarClassifiedMember, tone: string) => Promise<string>`
- **Features**:
  - Member initials avatar, name, phone, category badge, and days absent indicator.
  - Last attendance date and escalation timer.
  - Integrated `MessagePreviewBubble`, `1-Click WhatsApp`, `DirectDispatchButton`, and `TaskOutcomeSelector`.
  - Smooth Framer Motion entrance (`surfaceEntranceVariants`) and exit.

#### 4. `app/components/followup/MessagePreviewBubble.tsx`
- **Props**:
  - `baseText: string`
  - `polishedText: string | null`
  - `isPolished: boolean`
  - `selectedTone: TemplateTone`
  - `onToneChange: (tone: TemplateTone) => void`
  - `onTogglePolished: (usePolished: boolean) => void`
- **Features**:
  - WhatsApp chat bubble aesthetic (`bg-emerald-50/60 border border-emerald-200/90 rounded-2xl p-4`).
  - Interactive tone chips (`Casual Youth ⚡`, `Warm Fellowship ❤️`, `Pastoral Care 🕊️`).
  - Token badge: `0 Tokens (Deterministic)` or `AI Polished (Near-Zero Tokens)`.
  - Diff view toggle when AI-polished text is available.

#### 5. `app/components/followup/TaskOutcomeSelector.tsx`
- **Props**:
  - `taskId: string`
  - `personId: string`
  - `callerName: string`
  - `onComplete: (outcome: MandatedOutcome, note?: string) => Promise<boolean>`
  - `isSubmitting: boolean`
- **Features**:
  - 5 tactile outcome buttons:
    - `🟢 Contacted (WhatsApp)`
    - `🔵 Contacted (Call)`
    - `🟣 Prayed With`
    - `🟡 Visit Scheduled`
    - `⚪ No Response`
  - Note input with 44px minimum target height.
  - Submit button with smooth spinner.

#### 6. `app/components/followup/EscalationBanner.tsx`
- **Props**:
  - `escalatedCount: number`
  - `onViewEscalated: () => void`
- **Features**:
  - High-visibility pastoral care alert banner for tasks pending >48h.
  - "View Overdue Escalations" button linking directly to the filtered queue.

---

### 4.2 Server Action Signatures (`app/actions/followup.ts`)

```typescript
import { TemplateTone, TemplateCategory } from '@/lib/template-engine';

export type RadarFilterType = 'MISSED_1_WEEK' | 'MISSED_2_WEEKS' | 'FIRST_TIMER_72H' | 'ESCALATED' | 'ALL';

export type MandatedOutcome =
  | 'Contacted (WhatsApp)'
  | 'Contacted (Call)'
  | 'Prayed With'
  | 'Visit Scheduled'
  | 'No Response';

export interface RadarMetrics {
  missed1WeekCount: number;
  missed2WeeksCount: number;
  firstTimers72hCount: number;
  escalatedCount: number;
  totalActiveMembers: number;
  lastUpdatedWat: string;
}

export interface FollowUpMemberQueueItem {
  taskId: string;
  personId: string;
  firstName: string;
  lastName: string;
  fullName: string;
  phone: string;
  formattedPhone: string;
  phoneLast4: string;
  category: string;
  subCategory: string | null;
  status: 'MEMBER' | 'FIRST_TIMER' | 'EVANGELISM';
  reason: 'FIRST_TIMER' | 'MISSED_1_WEEK' | 'MISSED_2_WEEKS' | 'DORMANT_CRITICAL';
  taskStatus: 'PENDING' | 'CONTACTED' | 'ESCALATED';
  assignedTo: string | null;
  escalatedTo: string | null;
  dueDate: string;
  isOverdue: boolean;
  daysAbsent: number;
  lastAttendanceFormatted: string;
  lastAttendanceDate: string | null;
  deterministicDraft: string;
  waMeUrl: string;
  recentNotes: {
    callerName: string;
    outcome: string;
    note: string | null;
    date: string;
  }[];
}

// 1. Fetch Radar Dashboard Metrics & Queue
export async function getFollowUpRadarDashboardAction(filters?: {
  filter?: RadarFilterType;
  searchQuery?: string;
}): Promise<{
  success: boolean;
  metrics: RadarMetrics;
  members: FollowUpMemberQueueItem[];
  error?: string;
}>;

// 2. Direct Gateway Dispatch via SMS / WhatsApp API
export async function dispatchDirectMessageAction(params: {
  taskId: string;
  personId: string;
  messageText: string;
  channel?: 'WHATSAPP' | 'SMS' | 'AUTO';
}): Promise<{
  success: boolean;
  status: 'DELIVERED' | 'QUEUED' | 'FALLBACK_GENERATED' | 'FAILED';
  provider: string;
  waMeUrl: string;
  error?: string;
}>;

// 3. On-Demand AI Polish with 7-Day Deduplication Cache
export async function polishFollowUpDraftAction(params: {
  personId: string;
  baseDraft: string;
  tone?: string;
}): Promise<{
  success: boolean;
  text: string;
  cached: boolean;
  tokensConsumed: number;
  error?: string;
}>;

// 4. Complete Follow-Up Task & Log Outcome
export async function completeFollowUpTaskAction(params: {
  taskId: string;
  personId: string;
  callerName: string;
  outcome: MandatedOutcome;
  note?: string;
}): Promise<{
  success: boolean;
  message: string;
  error?: string;
}>;

// 5. Trigger Immediate Radar Sync (On-Demand scan)
export async function triggerRadarSyncAction(): Promise<{
  success: boolean;
  tasksCreated: number;
  tasksEscalated: number;
  metrics: RadarMetrics;
  error?: string;
}>;
```

---

## 5. Verification Method

### 5.1 Automated Test Execution Command
To verify the implementation without regressions, `m3_worker_1` must execute:
```powershell
npx vitest run
```

### 5.2 Verification Checklist for `m3_worker_1`
1. **Radar Metric Cards**:
   - Verify that all 4 cards render live counts (`Missed 1 Week`, `Missed 2 Weeks`, `First-Timers (72h)`, `Escalated to Pastor`).
   - Verify that clicking any card updates the active filter state and immediately filters the member list.
2. **0-Token Message Previews**:
   - Verify that member cards display contextual drafts generated from `lib/template-engine.ts`.
   - Verify that changing tone updates the preview text with zero LLM API calls.
3. **1-Click WhatsApp Button**:
   - Verify that the button generates a valid `https://wa.me/{phoneDigits}?text={encoded}` URL.
   - Verify `target="_blank"`, `rel="noopener noreferrer"`, and `min-h-[44px]` touch target height.
4. **Direct Gateway Dispatch**:
   - Verify that clicking direct dispatch invokes `dispatchDirectMessage` and returns status.
5. **AI Polish Button**:
   - Verify that clicking "Polish with AI" triggers `polishFollowUpDraftAction`.
   - Verify that repeated clicks on the same draft hit the 7-day cache with 0 tokens consumed.
6. **Task Outcome Selector**:
   - Verify that all 5 mandated outcomes (`Contacted (WhatsApp)`, `Contacted (Call)`, `Prayed With`, `Visit Scheduled`, `No Response`) are available and recordable.
   - Verify that submitting marks `FollowUpTask.status = 'CONTACTED'` and adds a row to `FollowUpResult`.
7. **Frontend Design Rules**:
   - Verify zero fake grid backgrounds and zero neon purple glows.
   - Verify Framer Motion entrances (`surfaceEntranceVariants` with momentum deceleration `[0.23, 1, 0.32, 1]`, scale from 0.95).
   - Verify tactile tap feedback (`whileTap={{ scale: 0.97 }}`).
   - Verify all buttons have minimum 44px touch targets.
   - Verify WCAG AAA contrast (`text-slate-950` / `text-slate-900` on light surfaces).
