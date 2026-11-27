## 2026-11-12T16:17:53Z
You are the Forensic Integrity Auditor for Milestone 2: Youth-First Attendance & UI Compliance in the RCCG Jesus Covenant Zone CMS.

MANDATORY FIRST STEP:
Read the verbatim user request at:
c:\Users\dafen\OneDrive\Desktop\church-management-system\.agents\teamwork\ORIGINAL_REQUEST.md
Also read the project architecture at:
c:\Users\dafen\OneDrive\Desktop\church-management-system\.agents\teamwork\orchestrator\PROJECT.md
Read the Worker handoff report at:
c:\Users\dafen\OneDrive\Desktop\church-management-system\.agents\teamwork\m2_worker_1\handoff.md

YOUR STATE FOLDER:
c:\Users\dafen\OneDrive\Desktop\church-management-system\.agents\teamwork\m2_auditor_1/

YOUR OBJECTIVE:
Perform a comprehensive forensic integrity audit across all Milestone 2 deliverables:
1. Examine all touched and newly created files:
   - `lib/geo.ts` (verify coordinates 6.5244, 3.3792 and 150m base radius are preserved and mathematically active)
   - `lib/motion.ts` (verify momentum deceleration physics and tap feedback)
   - `lib/device-lock.ts` (verify anti-proxy device lock logic)
   - `app/actions/attendance.ts` (verify genuine database queries, server-side geofencing, Workers' meeting routing, and duplicate prevention)
   - `app/components/AmbientBackground.tsx` and `app/globals.css` (verify complete elimination of AI tells: zero floating blur orbs, zero radial dot grids, zero animate-bounce)
   - `app/page.tsx` and `app/components/attendance/` (verify authentic implementation, prominent RCCG logo `/rccg-logo.png`, 44px min touch targets, AAA contrast)
   - `tests/unit/attendance.test.ts` (verify genuine assertions, no tautological or trivial tests)
2. Forensic checks:
   - Hardcoded Output Detection: check for embedded expected strings, fixed return values, or shortcuts.
   - Facade Detection: verify functions execute real logic, database calls, and arithmetic.
   - Pre-Populated Artifact Detection: verify no dummy test outputs exist.
   - Self-Certifying / Tautological Tests: verify tests execute against real functions and assert meaningful conditions.
3. Author and execute an independent empirical verification script in your state folder (e.g. `.agents/teamwork/m2_auditor_1/empirical-audit.ts`) testing geofence boundaries, phone lookup, device lock, and server action outputs.
4. Run `npm test` and `npm run build` independently.
5. Provide your explicit binary verdict: CLEAN or INTEGRITY VIOLATION.
6. Write your full report to `c:\Users\dafen\OneDrive\Desktop\church-management-system\.agents\teamwork\m2_auditor_1\handoff.md` and send a summary message.
