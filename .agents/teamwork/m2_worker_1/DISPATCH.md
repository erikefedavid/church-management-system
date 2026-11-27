## 2026-11-12T15:51:58Z
You are the Implementation Worker for Milestone 2: Youth-First Attendance & UI Compliance in the RCCG Jesus Covenant Zone CMS.

MANDATORY FIRST STEP:
Read the verbatim user request at:
c:\Users\dafen\OneDrive\Desktop\church-management-system\.agents\teamwork\ORIGINAL_REQUEST.md
Also read the project architecture at:
c:\Users\dafen\OneDrive\Desktop\church-management-system\.agents\teamwork\orchestrator\PROJECT.md
Read the 3 detailed Explorer handoff reports:
- c:\Users\dafen\OneDrive\Desktop\church-management-system\.agents\teamwork\m2_explorer_1\handoff.md (Component architecture & package evaluation)
- c:\Users\dafen\OneDrive\Desktop\church-management-system\.agents\teamwork\m2_explorer_2\handoff.md (Geofence preservation, server actions & tests)
- c:\Users\dafen\OneDrive\Desktop\church-management-system\.agents\teamwork\m2_explorer_3\handoff.md (Anti-AI-tells purge, Emil Kowalski motion & accessibility)

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

YOUR STATE FOLDER:
c:\Users\dafen\OneDrive\Desktop\church-management-system\.agents\teamwork\m2_worker_1/

EXCLUSIVE FILE WRITE BOUNDARIES:
- `package.json` (install dependencies: `npm install framer-motion clsx tailwind-merge html5-qrcode`)
- `app/components/AmbientBackground.tsx` (purge all AI tells: remove floating blur bubbles, gradient orbs, and radial dot grid; replace with clean, distraction-free neutral background)
- `app/globals.css` (delete floating orb keyframes, add momentum bezier tokens, maintain clean Tailwind v4 setup)
- `app/components/LocationPromptModal.tsx` (remove `animate-bounce`, replace with clean momentum transition, enforce 44px min touch targets)
- `lib/geo.ts` (HARD CONSTRAINT: preserve coordinates 6.5244, 3.3792 and 150m base radius; export alias `isWithinGeofence = isWithinChurchGeofence`)
- `lib/motion.ts` (create motion specification module: momentum ease [0.23, 1, 0.32, 1], scale entrance from 0.95 over 240ms, tactile tap feedback under 100ms)
- `lib/device-lock.ts` (create `rccg_attendance_device_lock` manager with auto-release on service transition or new calendar day)
- `app/actions/attendance.ts` (implement `lookupByPhoneSuffix` with collision handling and `registerAttendance` with server-side geofencing, Workers' Meeting routing, duplicate check-in prevention, and backward-compatible aliases)
- `app/page.tsx` and any subcomponents in `app/components/attendance/` (clean, tabbed Youth-First Attendance portal: prominent `/rccg-logo.png`, 1-tap remembered profile, QR camera scanner with manual fallback, 4-digit phone lookup with touch keypad, collision choice list, check-in confirmation celebration, Anti-Proxy lock card, 44px touch targets, WCAG AAA contrast, zero AI tells)
- `tests/unit/attendance.test.ts` (comprehensive Vitest test suite covering geofence calculations, phone suffix lookup, and registration actions)

DELIVERABLES & EXECUTION STEPS:
1. Install dependencies: `npm install framer-motion clsx tailwind-merge html5-qrcode` (or verify clean package.json addition).
2. Purge AI tells in `app/components/AmbientBackground.tsx` and `app/globals.css`. Remove `animate-bounce` in `app/components/LocationPromptModal.tsx`.
3. Create `lib/motion.ts` per Emil Kowalski physics specifications.
4. Update `lib/geo.ts` with `isWithinGeofence` alias without altering coordinates `6.5244, 3.3792` or radius `150m`.
5. Create `lib/device-lock.ts` to manage the Anti-Proxy device lock.
6. Implement `lookupByPhoneSuffix` and `registerAttendance` in `app/actions/attendance.ts` per `m2_explorer_2` handoff.
7. Rebuild `app/page.tsx` as an authentic Youth-First Attendance Portal:
   - Header with prominent official RCCG logo (`/rccg-logo.png`).
   - 1-Tap Remembered Profile (`localStorage('rccg_saved_member')`).
   - Tabbed Interface: QR Code Scanner (camera stream with SSR safety + manual fallback) and 4-Digit Phone Lookup with rapid numeric touch keypad.
   - Collision disambiguation picker when multiple members share the last 4 digits.
   - Celebration check-in confirmation view.
   - Anti-Proxy device lock card.
   - 44px minimum touch targets and AAA contrast.
8. Create `tests/unit/attendance.test.ts` using Vitest and `tests/helpers/prisma-mock.ts`.
9. Run verification commands:
   - `npm test`: must pass 100% of all test suites (both existing 107 tests and new attendance tests).
   - `npm run build`: Next.js 16 production build must succeed with zero TypeScript or bundling errors.
   - Lint check on touched files.
10. Write your handoff report to `c:\Users\dafen\OneDrive\Desktop\church-management-system\.agents\teamwork\m2_worker_1\handoff.md` and message the orchestrator when complete.
