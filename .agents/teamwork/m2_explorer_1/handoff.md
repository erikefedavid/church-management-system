# Milestone 2 Architectural Handoff Report: Youth-First Attendance & UI Compliance

**Target Milestone**: Milestone 2 — Youth-First Attendance & UI Compliance  
**Author**: Explorer Subagent (`m2_explorer_1`)  
**Recipient**: Milestone 2 Worker & Orchestrator  
**Status**: Ready for Implementation  

---

## 1. Observation

### 1.1 Existing Codebase & Dependencies
- **Package Manifest (`package.json:15-21`)**:
  ```json
  "dependencies": {
    "@prisma/client": "^6.4.1",
    "lucide-react": "^1.51.0",
    "next": "16.3.7",
    "react": "19.2.8",
    "react-dom": "19.2.8"
  }
  ```
  `framer-motion`, `clsx`, `tailwind-merge`, and QR decoding libraries are currently absent.
- **Dependency Compatibility Testing**:
  Executed dry-run installations against React 19 (`19.2.8`) and Next.js 16 (`16.3.7`):
  - `npm install --dry-run framer-motion clsx tailwind-merge`:
    Successfully resolved `framer-motion@14.13.0`, `clsx@2.1.1`, and `tailwind-merge@3.7.0` with **zero peer dependency errors** (exit code 0).
  - `npm install --dry-run html5-qrcode`:
    Successfully resolved `html5-qrcode@2.3.8` with **zero peer dependency conflicts** (exit code 0).
- **TypeScript Configuration (`tsconfig.json:21-23`)**:
  ```json
  "paths": {
    "@/*": ["./*"]
  }
  ```
  Path aliases map `@/*` directly to the repository root.

### 1.2 Frontend Violations of User Rules (AI Tells & Touch Targets)
- **Ambient Decorative Grid & Neon Orbs (`app/components/AmbientBackground.tsx:8-25`)**:
  ```tsx
  {/* Top Right Subtle Blue Orb */}
  <div className="absolute -top-32 -right-32 w-96 h-96 bg-blue-400/15 rounded-full blur-3xl animate-float-slow" />
  {/* Center Left Sky Blue Orb */}
  <div className="absolute top-1/3 -left-32 w-80 h-80 bg-sky-300/15 rounded-full blur-3xl animate-float-reverse" />
  {/* Bottom Center Indigo Glow */}
  <div className="absolute -bottom-32 left-1/4 w-96 h-96 bg-indigo-400/10 rounded-full blur-3xl animate-pulse-glow" />
  {/* Subtle Dot Grid Overlay */}
  <div className="absolute inset-0 opacity-[0.03]" style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, #1e3a8a 1px, transparent 0)', backgroundSize: '24px 24px' }} />
  ```
  Directly violates User Rule 1: *"NO decorative grid lines"* and *"NO arbitrary neon glows / purple gradients: Never apply floating blur bubbles, radial glow spots behind headers"*.
- **AI Keyframe Animations (`app/globals.css:29-72`)**:
  Defines `@keyframes floatSlow`, `@keyframes floatReverse`, `@keyframes pulseGlow`, and `.animate-float-*`. Violates Emil Kowalski physics standards and anti-AI-tell rules.
- **Inadequate Touch Target Sizes (`app/page.tsx`)**:
  - `app/page.tsx:696, 707`: Sunday School class buttons (`py-1 text-xs`, total height ~26px < 44px).
  - `app/page.tsx:741`: Location refresh button (`text-[11px]`, height ~18px < 44px).
  - `app/page.tsx:1090`: Reset button (`py-2 text-xs`, height ~28px < 44px).
  - `app/page.tsx:1184`: Cancel button (`py-2 text-xs`, height ~28px < 44px).
  Violates User Rule 1: *"Interactive touch targets must be at least 44x44px."*
- **Monolithic State Structure (`app/page.tsx:1-1206`)**:
  A single 1206-line component mixes service polling, geolocation, keypad input, first-timer registration, and slip rendering, with no QR code scanning component.

### 1.3 Core Backend & Geofencing Integrity
- **Geofence Parameters (`lib/geo.ts:77-120`)**:
  - Base radius: `150m` around coordinates `(6.5244, 3.3792)` (`prisma/seed.ts:12-14`).
  - Hysteresis buffer: `35m` (effective radius `185m` for previously inside sessions).
  - Indoor sanctuary roof cushion: `min(accuracy * 0.5, 20m)`.
- **WAT Nigerian Service Scheduling (`lib/service-resolver.ts:34-73`)**:
  - Correctly evaluates WAT (`Africa/Lagos`, UTC+1).
  - Resolves Sunday Thanksgiving (days 1-7), Regular Celebration Services (2nd-5th Sundays), 3rd Saturday Hour of Mercy, Friday Youth Prayer, and 20-minute overtime buffers.
- **Attendance Actions (`app/actions/attendance.ts`)**:
  - `getActiveServiceAction`: fetches church and active service schedule.
  - `lookupMemberByLast4Action(phoneLast4: string)`: queries `Person` records.
  - `selfCheckInAction({ personId, serviceScheduleId, userLatitude, userLongitude, subClass })`: strictly checks geofence, enforces single check-in per service per day.
  - `registerFirstTimerAction`: creates `Person` with `PersonStatus.FIRST_TIMER` and records attendance.
- **Collision Test Data (`prisma/seed.ts:149-188`)**:
  Contains sample collision members ending in `4567`:
  - Emmanuel Okonkwo (`phoneLast4: '4567'`, `category: ADULT`)
  - Samuel Oladipo (`phoneLast4: '4567'`, `category: YOUTH`)
- **Assets (`public/rccg-logo.png`)**:
  Verified present on disk at `public/rccg-logo.png`.

---

## 2. Logic Chain

1. **Observation 1.1 → Reasoning**:
   React 19 (`19.2.8`) and Next.js 16 (`16.3.7`) require verified package versions. The dry-run test confirms that `framer-motion@14.13.0`, `clsx@2.1.1`, `tailwind-merge@3.7.0`, and `html5-qrcode@2.3.8` install cleanly without conflicts. They must be installed as runtime dependencies in `package.json`.

2. **Observation 1.2 → Reasoning**:
   User Rules strictly prohibit decorative dot grids, floating blur orbs, and generic bounce animations. `app/components/AmbientBackground.tsx` and keyframes in `app/globals.css` must be completely purged. All interactive elements must be refactored to standard `min-h-[44px]` touch targets.

3. **Observation 1.2 & User Rule 3 → Reasoning**:
   Emil Kowalski's core principles mandate:
   - Momentum ease-out: `cubic-bezier(0.23, 1, 0.32, 1)`.
   - Never scale from zero: entrance transitions scale strictly from `scale(0.95)` to `scale(1)` with `opacity: 0` to `opacity: 1`.
   - Tactile feedback: `active:scale-[0.97]` with sub-100ms response time.
   - Layout-friendly animations: animate ONLY `transform` and `opacity`.

4. **Observation 1.2 & User Request R1 → Reasoning**:
   The existing `app/page.tsx` lacks a QR code scanner. A tabbed interface must provide two equal, snappy paths for youth check-in:
   - **Tab 1: QR Code Scanner** (`QrScanner.tsx`): Runs a camera scanner powered by `html5-qrcode` inside a dynamic, client-safe container with video viewfinder, camera permission error boundary, and fallback manual code entry.
   - **Tab 2: 4-Digit Phone Lookup** (`KeypadLookup.tsx`): Features high-tactile numeric keypad (1-9, C, 0, ⌫), physical keyboard input support (`inputMode="numeric"`), auto-lookup on the 4th digit, and collision disambiguation (`CollisionChoiceList.tsx`).

5. **Observation 1.3 → Reasoning**:
   The backend actions (`app/actions/attendance.ts`) and geofencing math (`lib/geo.ts`) are 100% complete and verified. The frontend components must consume them directly. For QR scanning, a helper action `lookupMemberByIdAction(personId: string)` should be added to resolve member data before finalizing check-in.

---

## 3. UI Component Architecture Blueprint

The monolithic `app/page.tsx` will be replaced with clean, decoupled components located under `app/components/attendance/` and standard shadcn UI primitives in `app/components/ui/`:

```
app/
├── actions/
│   └── attendance.ts                  # Enhanced with lookupMemberByIdAction
├── components/
│   ├── ui/
│   │   ├── button.tsx                 # Tactile active:scale-[0.97], min-h-[44px]
│   │   ├── card.tsx                   # Clean border-slate-200, no neon glows
│   │   ├── input.tsx                  # High contrast, accessible focus ring
│   │   ├── tabs.tsx                   # Accessible tab switcher
│   │   └── badge.tsx                  # Status badges (Live, Verified, Category)
│   ├── attendance/
│   │   ├── AttendanceHeader.tsx       # RCCG logo, church title, geofence status
│   │   ├── ServiceStatusCard.tsx      # Active service, WAT time, concurrent switcher
│   │   ├── RememberedProfileCard.tsx  # 1-Tap rapid check-in for returning worshippers
│   │   ├── AttendanceTabs.tsx         # Framer motion tab container
│   │   ├── QrScanner.tsx              # Camera scanner with html5-qrcode & SSR boundary
│   │   ├── KeypadLookup.tsx           # 4-digit slots + numeric tactile touch keypad
│   │   ├── CollisionChoiceList.tsx    # Disambiguation list for shared last-4 digits
│   │   ├── FirstTimerForm.tsx         # First-timer on-the-spot registration
│   │   ├── CheckInConfirmation.tsx    # Verified celebration modal (scale 0.95 -> 1)
│   │   ├── AntiProxyLockCard.tsx      # Single-device lock for current service
│   │   └── GeofenceGatewayAlert.tsx   # Informative out-of-bounds & GPS help card
│   └── Toast.tsx                      # Clean toast for alerts
├── globals.css                        # Purged AI keyframes; clean styling
├── page.tsx                           # Clean, orchestrating youth check-in portal
└── welcome/page.tsx                   # Sunday Worship Hub / Verified Attendance Pass
lib/
└── utils.ts                           # clsx + twMerge utility (cn)
```

### Detailed Component Specifications

#### A. `AttendanceHeader.tsx`
- **Branding**: Official RCCG logo from `/rccg-logo.png` rendered via `next/image` (`w-12 h-12` rounded-2xl border border-slate-200/80 bg-white p-1).
- **Text**: Church Title `RCCG Jesus Covenant Zone` (`text-base font-bold text-slate-900`) and dynamic subtitle.
- **Geofence Indicator**:
  - Verifying: `text-blue-700 bg-blue-50 border-blue-200 animate-pulse`
  - Sanctuary Verified: `text-emerald-700 bg-emerald-50 border-emerald-200`
  - Outside Sanctuary: `text-amber-800 bg-amber-50 border-amber-200`
  - GPS Refresh Button: `min-h-[44px] min-w-[44px]` with `active:scale-[0.97]`.
- **Live Badge**: Live pulsing dot (`bg-emerald-500`) during active service.

#### B. `RememberedProfileCard.tsx` (1-Tap Profile Check-In)
- **Local Storage Latch**: Reads `rccg_saved_member` (`{ id, name, phoneLast4 }`).
- **Layout**: Personalized greeting with member initials badge.
- **Primary CTA**: Large `min-h-[56px]` button:
  - Label: `1-Tap Check-In as {FirstName}`
  - Motion: `whileTap={{ scale: 0.97 }}`, transition `< 100ms`.
  - Action: Immediately calls `selfCheckInAction` with cached GPS coordinates.
- **Secondary CTA**: `"Not you? Switch account"` button (`min-h-[44px]`), toggles to tabbed interface.

#### C. `AttendanceTabs.tsx` & `QrScanner.tsx`
- **Tabs**: "Scan QR Code" vs "4-Digit Phone".
- **Dynamic Camera Wrapper (`QrScanner.tsx`)**:
  - SSR Guard: Rendered only on client (`mounted === true`) or via `dynamic(() => import('./QrScanner'), { ssr: false })`.
  - Camera Mount: Initializes `Html5Qrcode` scanner on `<div id="qr-reader" />` with `qrbox: { width: 240, height: 240 }` and `facingMode: "environment"`.
  - Payload Handler:
    - Scanned CUID/UUID or JSON payload (`{ personId }`): calls `lookupMemberByIdAction` and `selfCheckInAction`.
    - Scanned 4-digit or phone: transitions to 4-digit lookup.
  - Camera Error / Permission Denied State: Clean alert offering 1-click jump to 4-digit tab.
  - Fallback Input: Manual code input field (`min-h-[44px]`) below viewfinder.

#### D. `KeypadLookup.tsx` & `CollisionChoiceList.tsx`
- **Digit Display**: 4 large, high-contrast character boxes displaying entered numbers with `tracking-[0.5em]` or individual segmented blocks.
- **Tactile Keypad**: Grid of numeric buttons (1-9, Clear, 0, Backspace):
  - Target size: `min-h-[48px]`, `active:scale-[0.97]` click feedback.
  - Supports both on-screen tapping and physical typing via hidden or active `<input inputMode="numeric" maxLength={4} />`.
- **Instant Search**: Automatically triggers `lookupMemberByLast4Action(digits)` when 4th digit is entered.
- **Collision Disambiguation (`CollisionChoiceList.tsx`)**:
  - Triggered when `count > 1` (e.g. `4567` returns Emmanuel Okonkwo and Samuel Oladipo).
  - List of member cards: Full Name, Category Badge (Youth / Adult / Worker), Masked Phone (`••• ••• 4567`).
  - Target size: `min-h-[56px]` per card, `active:scale-[0.98]`.
  - Tapping immediately confirms check-in for the chosen member.
- **First Timer State (`FirstTimerForm.tsx`)**:
  - Triggered when `count === 0`.
  - Prompts for First Name, Last Name, Phone, and Demographic (Youth / Adult).

#### E. `CheckInConfirmation.tsx` & `AntiProxyLockCard.tsx`
- **Celebration Modal (`CheckInConfirmation.tsx`)**:
  - Framer Motion entrance: `initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}` with `ease: [0.23, 1, 0.32, 1]`.
  - Large verified emblem (`CheckCircle2` in `bg-emerald-50 text-emerald-600 border border-emerald-200`).
  - Displays: Member Name, Service Name, WAT Timestamp, and Geofence Confirmation.
  - Navigation CTA: `"Proceed to Sunday Worship Hub"` (`min-h-[48px]`).
- **Anti-Proxy Device Lock (`AntiProxyLockCard.tsx`)**:
  - Reads `rccg_completed_checkin` from `localStorage`.
  - If service ID and date match current active service: displays locked card explaining single-device policy.
  - Automatically unlocked when service schedule transitions to the next service.

---

## 4. Caveats

1. **Camera Permissions on Mobile**: Browsers require user permission for `getUserMedia`. On iOS Safari or mobile Chrome, if permission is denied, the scanner must cleanly display a fallback card without throwing unhandled exceptions.
2. **Next.js 16 SSR Isolation**: `html5-qrcode` accesses `window` and DOM elements. It must be dynamically imported with `{ ssr: false }` or encapsulated inside a `useEffect` on client mount to avoid Next.js server-side hydration mismatches.
3. **Geofence Coordinates Immutability**: The church coordinates (`6.5244, 3.3792`) and base radius (`150m`) in `lib/geo.ts` and `prisma/seed.ts` must remain strictly untouched.
4. **Offline / Off-Hours Service Support**: Outside church hours, `getActiveServiceAction` returns simulated fallback data so that testing, development, and administrative checks function properly without blocking developers.

---

## 5. Conclusion

Milestone 2 requires two clear implementation tracks:
1. **Dependency & Styling Hygiene**: Install `framer-motion`, `clsx`, `tailwind-merge`, and `html5-qrcode`. Create `lib/utils.ts` and shadcn primitives. Purge `AmbientBackground.tsx` and all neon/AI-tell keyframes from `app/globals.css`.
2. **Youth-First Attendance Component Suite**: Refactor `app/page.tsx` into modular components under `app/components/attendance/` adhering strictly to Emil Kowalski motion rules (`scale(0.95) -> 1`, `cubic-bezier(0.23, 1, 0.32, 1)`, `active:scale-[0.97]`), 44px touch targets, tabbed QR + 4-digit lookup, collision disambiguation, and 1-tap remembered profile.

---

## 6. Verification Method

### 6.1 Package & Build Verification
1. Run: `npm install framer-motion clsx tailwind-merge html5-qrcode`
2. Run: `npm run build` or `npx tsc --noEmit` to confirm zero compilation or TypeScript errors.

### 6.2 Frontend Standard Verification
1. Inspect `app/globals.css` to verify that `floatSlow`, `floatReverse`, `pulseGlow`, and `.animate-float-*` have been completely removed.
2. Verify that `app/components/AmbientBackground.tsx` is deleted and not imported anywhere.
3. Inspect all interactive buttons in `app/components/attendance/` to verify `min-h-[44px]` (or `min-h-[48px]`/`min-h-[56px]`) and `active:scale-[0.97]`.
4. Inspect `app/page.tsx` and `app/components/attendance/AttendanceTabs.tsx` to verify Framer Motion entrance `initial={{ opacity: 0, scale: 0.95 }}` with `cubic-bezier(0.23, 1, 0.32, 1)`.

### 6.3 Functional & Test Suite Verification
1. Author automated Vitest unit/component tests in `tests/unit/attendance-ui.test.ts` or `tests/unit/attendance-actions.test.ts` verifying:
   - 4-digit lookup returning single member, collision members (`4567`), and first-timer (`count === 0`).
   - Geofence rejection when distance > 150m vs acceptance when distance <= 150m.
   - QR payload parser handling personId, JSON, and phone formats.
2. Run the complete test suite:
   ```powershell
   npm test
   ```
   All tests must pass cleanly.

### 6.4 Invalidation Conditions
- Any interactive button having a touch target height less than 44px.
- Any entrance animation scaling from zero (`scale(0)`).
- Presence of floating neon blur orbs or radial dot grid backgrounds.
- Modifications to `lib/geo.ts` coordinates (`6.5244, 3.3792`) or base radius (`150m`).
- Build or TypeScript errors during `npm run build`.
