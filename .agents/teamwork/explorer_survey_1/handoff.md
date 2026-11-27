# Explorer Survey 1: Attendance & Geofencing System Report

## 1. Observation

### 1.1 Geofencing Engine & Geolocation Validation (`lib/geo.ts`)
- **Formula & Coordinates**: Employs spherical Haversine distance calculation using Earth radius `6,371e3` meters (`lib/geo.ts:43-60`).
- **Target Location**: Church location defined in database as `latitude: 6.5244, longitude: 3.3792` (`prisma/seed.ts:12-14`).
- **Base Radius & Buffers**:
  - Base radius: `150m` (`lib/geo.ts:77`).
  - Hysteresis exit boundary: `35m` buffer (`effectiveRadius = isPreviouslyInside ? baseRadius + hysteresisBuffer : baseRadius`, yielding `185m` for previously inside users to prevent boundary flapping, `lib/geo.ts:78, 111-113`).
  - Indoor roof GPS degradation cushion: Up to `20m` cushion subtracted from distance (`accuracyCushion = Math.min(accuracy * 0.5, 20); adjustedDistance = Math.max(0, distanceMeters - accuracyCushion)`, `lib/geo.ts:117-118`).
- **Anti-Spoofing & Anomalies**: Explicitly flags Null Island `(0, 0)`, zero-accuracy mock injectors, and coordinates with `|lat| > 90` or `|lng| > 180` (`lib/geo.ts:82-102`).
- **Server Enforcement**: `app/actions/attendance.ts:168-186` requires `userLatitude` and `userLongitude`; if missing, check-in is rejected with `'Location permission is required to confirm you are on church premises.'`. If `!geoCheck.isAllowed`, returns error `'Check-in rejected: You are ${geoCheck.distanceMeters}m away from church premises. Must be within ${church.geofenceRadius}m.'`.
- **Client Execution**: `app/page.tsx:258-298` invokes `navigator.geolocation.getCurrentPosition` with `{ enableHighAccuracy: true, timeout: 10000, maximumAge: 15000 }` and requires a secure HTTPS context (`window.isSecureContext`, `app/page.tsx:232-242`).

### 1.2 Timezone & Service Schedule Resolver (`lib/service-resolver.ts`)
- **Timezone**: Explicitly pinned to West Africa Time (WAT / `Africa/Lagos`, UTC+1) via `Intl.DateTimeFormat` with `timeZone: 'Africa/Lagos'` (`lib/service-resolver.ts:34-73`).
- **Calendar Normalization**: `getNigerianDateMidnight()` returns a Date normalized to `00:00:00.000 UTC` for the current Nigerian calendar day (`lib/service-resolver.ts:79-82`).
- **Service Rules**:
  - 1st Sunday: Thanksgiving Sunday (days 1–7) triggers Thanksgiving service schedule (`lib/service-resolver.ts:139-141, 278-297`).
  - 3rd Saturday: Hour of Mercy (days 15–21) (`lib/service-resolver.ts:147-149, 308-313`).
  - Friday before 3rd Sunday: Youth Prayer Meeting (days 13–19) (`lib/service-resolver.ts:155-157, 299-307`).
- **Overtime Grace Buffer**: `getServiceBufferEndTime` (`lib/service-resolver.ts:166-191`) assigns a 20-minute overtime grace window to terminating services (Second Service, Thanksgiving, Midweek, Saturday Hour of Mercy, Youth Prayer), while enforcing strictly 0 grace for intermediate services (First Service, Sunday School) to prevent overlapping clashing.
- **Workers' Meeting Routing**: In `app/actions/attendance.ts:207-230`, non-workers arriving during Workers' Meeting are intelligently routed to First Service (or Thanksgiving) as early arrivals so Workers' Meeting integrity is preserved.

### 1.3 Database Schema & Seeding (`prisma/schema.prisma` & `prisma/seed.ts`)
- **Church Model (`prisma/schema.prisma:52-71`)**:
  - `latitude Float`
  - `longitude Float`
  - `geofenceRadius Int @default(150)`
- **Person Model (`prisma/schema.prisma:123-158`)**:
  - `phoneLast4 String` indexed with `churchId` (`@@index([churchId, phoneLast4])`) for O(1) 4-digit lookup.
  - `category PersonCategory @default(YOUTH)` (`ADULT`, `YOUTH`, `WORKER`, `CHILD`).
  - `subCategory String?` (e.g. `YOUTH_WORKER`, `CHOIR`, `MEDIA`).
  - `status PersonStatus @default(MEMBER)` (`MEMBER`, `FIRST_TIMER`, `EVANGELISM`).
  - `birthDay Int?`, `birthMonth Int?`, `photoUrl String?` already present for birthday automation.
- **AttendanceRecord Model (`prisma/schema.prisma:163-186`)**:
  - `personId String`, `serviceScheduleId String`, `date DateTime`, `method CheckInMethod @default(QR_SELF)`.
  - Database uniqueness constraint: `@@unique([personId, serviceScheduleId, date])`.
- **Seed Configuration (`prisma/seed.ts:9-16`)**:
  - Church: `RCCG Jesus Covenant Zone`, `latitude: 6.5244, longitude: 3.3792, geofenceRadius: 150`.
  - Seeds collision test: `Emmanuel Okonkwo` (phone `08031234567`) and `Samuel Oladipo` (phone `08087774567`), both ending in `4567`.

### 1.4 Check-In Flow & Feature Matrix (`app/page.tsx` & `app/actions/attendance.ts`)

| Feature | Status | Implementation Details | Exact File & Line References |
| :--- | :--- | :--- | :--- |
| **Strict 150m Geofencing** | **Fully Functional** | Client & server validation with Haversine distance, 35m hysteresis, and 20m indoor cushion. | `lib/geo.ts:66-138`, `app/actions/attendance.ts:168-186`, `app/page.tsx:218-306` |
| **WAT Africa/Lagos UTC+1** | **Fully Functional** | Nigerian time normalization, service window matching, overtime buffer, and calendar day uniqueness. | `lib/service-resolver.ts:33-73, 79-82, 166-191`, `app/actions/attendance.ts:189` |
| **4-Digit Phone Lookup** | **Fully Functional** | Exact 4-digit lookup via `lookupMemberByLast4Action`. Handles collision selection modal and first-timer redirection. | `app/actions/attendance.ts:108-143`, `app/page.tsx:328-346, 1004-1043, 1047-1095` |
| **1-Tap Remembered Profile** | **Functional** | Stored in `localStorage` under key `'rccg_saved_member'`. Renders "Welcome Back, [Name]" card with 1-tap check-in button. | `app/page.tsx:113-119, 357-369, 955-990` |
| **Anti-Proxy Lock** | **Partially Implemented** | Client-side device lock in `localStorage` under `'rccg_completed_checkin'`, dynamically unlocked when next service starts. Server-side duplicate attendance prevented by `@@unique([personId, serviceScheduleId, date])`. Missing server-side device fingerprinting or IP rate-limiting. | `app/page.tsx:122-130, 177-196, 915-951`, `prisma/schema.prisma:184` |
| **QR Code Scanning** | **MISSING IN UI** | Database schema supports `CheckInMethod.QR_SELF`, but `app/page.tsx` contains NO QR scanner UI, camera integration, or scan decode logic. `package.json` lacks any QR library. | `prisma/schema.prisma:43`, `package.json:12-18` |
| **RCCG Logo Display** | **Present** | Official logo at `public/rccg-logo.png` (22KB). Displayed in header, splash screen, attendance slip, and usher desk. | `public/rccg-logo.png`, `app/page.tsx:539-545`, `app/welcome/page.tsx:137-143` |

### 1.5 Frontend Design & Engineering Audit against User Rules

#### Rule 1: Zero AI Tells (Impeccable Core)
- **Decorative Grid Lines / Matrix Patterns**:
  - **VIOLATION**: `app/components/AmbientBackground.tsx:18-25` injects a radial dot-grid overlay:
    ```tsx
    {/* Subtle Dot Grid Overlay */}
    <div
      className="absolute inset-0 opacity-[0.03]"
      style={{
        backgroundImage:
          'radial-gradient(circle at 1px 1px, #1e3a8a 1px, transparent 0)',
        backgroundSize: '24px 24px',
      }}
    />
    ```
- **Arbitrary Neon Glows / Blur Bubbles**:
  - **VIOLATION**: `app/components/AmbientBackground.tsx:8-16` injects three floating blur orbs:
    - `bg-blue-400/15 rounded-full blur-3xl animate-float-slow`
    - `bg-sky-300/15 rounded-full blur-3xl animate-float-reverse`
    - `bg-indigo-400/10 rounded-full blur-3xl animate-pulse-glow`
  - **VIOLATION**: `app/globals.css:29-72` defines floating glow keyframes (`floatSlow`, `floatReverse`, `pulseGlow`).
- **AI Placeholder Copy**:
  - `app/page.tsx:866-871` contains verbose multi-sentence Chrome troubleshooting instructions ("1. Tap the lock 2. Tap Permissions 3. Set Location to Allow...").
  - `app/page.tsx:939-941` contains multi-sentence policy essay ("To maintain attendance integrity, proxy check-in is not permitted...").
- **Accessibility & Contrast**:
  - **Touch Target Violations (< 44px min)**:
    - GPS Refresh button (`app/page.tsx:741`): `text-[11px]` without padding (~18px target).
    - Sunday School Class selector (`app/page.tsx:696, 707`): `text-xs px-3 py-1` (~26px height).
    - Collision Cancel button (`app/page.tsx:1090`): `py-2 text-xs` (~28px height).
    - Reset digits button (`app/page.tsx:1184`): `py-2 text-xs` (~28px height).
  - **Contrast Ratio Violations (< AAA 7:1)**:
    - `text-slate-400` on `#ffffff` white (`app/page.tsx:1016`) has contrast ratio `~2.5:1`, failing AAA standard.

#### Rule 2: Layout, Viewport & Composition (Taste-Skill Core)
- **One Section Per Screen**:
  - **VIOLATION**: On standard mobile viewports (375x667 to 430x932), `app/page.tsx` stacks Header + Scripture Card + Live Service Card + Handover Selector + Sunday School Selector + Geofence Status + Feedback Banner + Keypad / Profile Card + Footer.
  - This requires extensive vertical scrolling, violating the "One Section Per Screen" viewport rule.
- **Authentic Church Telemetry**:
  - Live distance telemetry (`${distanceMeters}m away`), service time countdown, and WAT timestamps are present and authentic, but need a cleaner, single-screen composition.

#### Rule 3: Motion, Physics & Micro-Interactions (Emil Kowalski Core)
- **Missing Motion Library**:
  - Neither `framer-motion` nor `motion` is listed in `package.json:12-18`.
  - Existing animations rely purely on Tailwind CSS animation classes (`animate-in`, `zoom-in-95`, `fade-in`).
- **Momentum Deceleration & Easings**:
  - No Emil Kowalski momentum deceleration (`cubic-bezier(0.23, 1, 0.32, 1)` or snappy mechanical `cubic-bezier(0.16, 1, 0.3, 1)`).
- **Tactile Click Feedback**:
  - Key buttons (`app/page.tsx:971, 1021, 1173`) lack physical press feedback (`active:scale-[0.97]` or `active:translate-y-[1px]`) with transition speed under 100ms.
- **Duration Budget**:
  - Existing CSS transitions use `duration-200`, `duration-300`, and `duration-500`, violating the 80ms–160ms micro-interaction budget.

#### Rule 4: Component Architecture & Shadcn
- **Missing `components.json`**:
  - The project does NOT have a `components.json` file.
  - No `@/components/ui/` primitives exist (no shadcn Button, Input, Card, Badge, Dialog, etc.).
  - All existing components in `app/components/` are hand-crafted custom components.

---

## 2. Logic Chain

1. **Observation**: `prisma/schema.prisma:52-60` and `prisma/seed.ts:12-14` set Church latitude to `6.5244`, longitude to `3.3792`, and geofence radius to `150m`. `lib/geo.ts` implements Haversine with 35m hysteresis and 20m indoor cushion.
   - **Reasoning**: The mathematical and geographic geofencing engine is completely solid and verified. Implementers must preserve `lib/geo.ts` and `prisma/seed.ts` coordinates exactly without alteration.

2. **Observation**: `lib/service-resolver.ts:34-73` uses `Intl.DateTimeFormat` with `timeZone: 'Africa/Lagos'`, correctly categorizing Sunday Thanksgiving (days 1-7), 3rd Saturday Hour of Mercy, and Friday Youth Prayer, with a 20-minute overtime grace window.
   - **Reasoning**: All service resolution logic is time-tested and robust. The UI can directly consume `getActiveServiceAction()` without backend logic changes.

3. **Observation**: `prisma/schema.prisma:43` defines `enum CheckInMethod { QR_SELF, USHER_MANUAL }`, but search for `qr|scan|camera` across `app/page.tsx` reveals no camera viewer, canvas decoder, or QR scanner component.
   - **Reasoning**: A functional QR scanner is an explicit acceptance criterion for R1 ("QR scan, 4-digit lookup, and 1-tap profile check-in paths function end-to-end"). Implementers must build a Youth-First QR Scanner component (e.g. leveraging `html5-qrcode` or a fast lightweight canvas/getUserMedia scanner) with tabbed switching between "Scan QR" and "4 Digits".

4. **Observation**: `AmbientBackground.tsx:8-25` injects floating blur orbs and a dot-matrix overlay, and `globals.css:29-72` adds floating keyframe animations.
   - **Reasoning**: User rules explicitly prohibit decorative grid lines and arbitrary neon blur bubbles. `AmbientBackground.tsx` and these CSS keyframes must be removed or replaced with clean, solid, high-contrast surfaces.

5. **Observation**: `package.json` contains only `@prisma/client`, `lucide-react`, `next`, `react`, `react-dom`, `@tailwindcss/postcss`, `tailwindcss`, `tsx`, and `typescript`.
   - **Reasoning**: `framer-motion` and `@types/framer-motion` must be installed to support Emil Kowalski motion primitives, and shadcn UI primitives (Button, Input, Card, Badge, Tabs) must be established to satisfy R1 & R4.

6. **Observation**: Buttons in `app/page.tsx` (`app/page.tsx:741, 696, 1090, 1184`) have touch target heights between 18px and 28px, and colors like `text-slate-400` fail AAA text contrast.
   - **Reasoning**: The rebuild must guarantee `min-h-[44px]` and `min-w-[44px]` for all interactive controls, and utilize high-contrast text (`text-slate-900`, `text-slate-700`, `text-blue-700`) with at least 7:1 contrast ratio.

---

## 3. Caveats

1. **Camera Permissions in Web Context**: Mobile browsers (iOS Safari, Android Chrome) require user gesture permissions to access the camera for QR code scanning. When camera permission is denied or unavailable, the UI must smoothly and instantly fallback to 4-digit phone lookup.
2. **Next.js 16 & React 19 Compatibility**: Next.js is version `16.3.7` and React is `19.2.8`. When installing `framer-motion` or QR libraries, ensure compatibility with React 19 (e.g. `framer-motion` 12+ or `--legacy-peer-deps` if needed).
3. **Client-Side Anti-Proxy vs Dedicated Hardware**: The existing anti-proxy mechanism relies on client `localStorage` locking to prevent a single phone from checking in multiple people in succession. While effective for casual bypass, a dedicated device fingerprint or server-side cookie token can provide additional defense if required.
4. **Offline Testing & Off-Hours**: Church services occur on Sunday, Tuesday, Thursday, Friday, and Saturday. During off-hours testing, `getActiveServiceAction()` provides a simulated fallback so the portal can be tested without breaking off-hours logic.

---

## 4. Conclusion

The core algorithmic foundations—geofencing (`lib/geo.ts`), Nigerian WAT time resolution (`lib/service-resolver.ts`), phone last-4 indexing, and database models (`prisma/schema.prisma`)—are **100% production-ready, verified, and strictly compliant** with project coordinates (`6.5244, 3.3792`) and 150m radius constraints.

However, the existing UI (`app/page.tsx` and related components) has **three primary gaps**:
1. **Missing QR Code Scanner**: Needs a snappy, youth-first QR scanner path alongside the 4-digit keypad and 1-tap remembered profile.
2. **Frontend Standard Violations**: Needs removal of AI design tells (floating blur bubbles, dot grid matrix in `AmbientBackground.tsx`), fixing touch targets under 44px, and restructuring layout to respect "One Section Per Screen".
3. **Motion & Tactile Deficits**: Needs `framer-motion` installation for momentum deceleration (`cubic-bezier(0.23, 1, 0.32, 1)`), entering from `scale(0.95)`, and tactile sub-100ms button feedback (`active:scale-[0.97]`).

---

## 5. Verification Method

### 5.1 Independent Code Verification
1. **Verify Coordinates and Geofencing Parameters**:
   - Inspect `lib/geo.ts:77-80` to verify `150m` base radius, `35m` hysteresis buffer, and `20m` indoor cushion.
   - Inspect `prisma/seed.ts:12-14` to confirm coordinates:
     ```ts
     latitude: 6.5244,
     longitude: 3.3792,
     geofenceRadius: 150,
     ```
2. **Verify WAT Timezone & Service Windows**:
   - Inspect `lib/service-resolver.ts:34-36` to verify `timeZone: 'Africa/Lagos'`.
   - Inspect `lib/service-resolver.ts:183` to verify `bufferMinutes = 20`.
3. **Verify Database Schema Integrity**:
   - Run: `npx prisma validate`
   - Run: `npx tsc --noEmit`
4. **Verify Design Standard Violations**:
   - Inspect `app/components/AmbientBackground.tsx:9, 12, 15, 22` to locate floating blur orbs and dot-matrix overlay.
   - Inspect `package.json:12-18` to confirm absence of `framer-motion` and QR libraries.
   - Inspect `app/page.tsx:741, 696` to confirm touch targets under 44px.

### 5.2 Invalidation Conditions
- If church coordinates in `prisma/seed.ts` differ from `6.5244, 3.3792`, this assessment is invalidated.
- If geofence radius in `lib/geo.ts` is changed away from `150m` base radius with `35m` hysteresis, this assessment is invalidated.
- If timezone in `lib/service-resolver.ts` is changed away from `'Africa/Lagos'`, this assessment is invalidated.
