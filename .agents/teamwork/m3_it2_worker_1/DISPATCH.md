## 2026-11-12T17:35:21Z

You are m3_it2_worker_1, an expert full-stack TypeScript/Next.js engineer.

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Context:
You are implementing Iteration 2 fixes for Milestone 3 (Requirement R2: Zero-Forgotten-Member Follow-Up Engine) in:
c:\Users\dafen\OneDrive\Desktop\church-management-system

Please read the following documents first:
1. ORIGINAL_REQUEST.md at: c:\Users\dafen\OneDrive\Desktop\church-management-system\.agents\teamwork\ORIGINAL_REQUEST.md
2. Challenger 1 Handoff at: c:\Users\dafen\OneDrive\Desktop\church-management-system\.agents\teamwork\m3_challenger_1\handoff.md
3. Challenger 2 Handoff at: c:\Users\dafen\OneDrive\Desktop\church-management-system\.agents\teamwork\m3_challenger_2\handoff.md
4. Reviewer 1 Handoff at: c:\Users\dafen\OneDrive\Desktop\church-management-system\.agents\teamwork\m3_reviewer_1\handoff.md

Your Assigned Tasks:
1. Fix In-Memory Performance Benchmark & Map Lookup in `lib/absence-radar.ts`:
   - Create a module-scoped cached `Intl.DateTimeFormat`:
     ```ts
     const ukDateFormatter = new Intl.DateTimeFormat('en-GB', {
       day: 'numeric',
       month: 'short',
       year: 'numeric',
       timeZone: 'UTC',
     });
     ```
   - Replace inline `toLocaleDateString` calls with `ukDateFormatter.format(date)`.
   - Build `const activePeopleMap = new Map(activePeople.map((p) => [p.id, p]));` and use `activePeopleMap.get(task.personId)` instead of `activePeople.find` in open task scanning.
2. Fix Logic Shadowing in `lib/absence-radar.ts`:
   - Rule 4 (`DORMANT_CRITICAL`) is currently shadowed because Rule 3 (`MISSED_2_WEEKS`) matches `!attendedS1 && !attendedS2 && (attendedS3 || hasHistory)`.
   - Fix Rule 3 and Rule 4 so `DORMANT_CRITICAL` correctly triggers when a member missed S1, S2, and S3, but has history in the last 60 days:
     - Rule 3: `!attendedS1 && !attendedS2 && attendedS3` -> `MISSED_2_WEEKS` (daysAbsent = 14)
     - Rule 4: `!attendedS1 && !attendedS2 && !attendedS3 && hasHistory` -> `DORMANT_CRITICAL` (daysAbsent = 21)
3. Fix Concurrency TOCTOU in `lib/follow-up-engine.ts`:
   - In concurrent scenarios, 10 simultaneous calls to `syncFollowUpTasks` create duplicate open tasks.
   - Implement an in-flight execution lock / deduplication promise around `syncFollowUpTasks` so that concurrent invocations share the in-flight execution promise and never create duplicate open tasks.
4. Fix Strict Authorization Header Parsing in `app/api/cron/follow-up/route.ts`:
   - When parsing `Authorization: Bearer <token>`, strictly verify that `authHeader.trim().split(/\s+/)` contains exactly 2 tokens (`parts.length === 2 && parts[0].toLowerCase() === 'bearer' && parts[1] === validSecret`), returning 401 if trailing garbage or extra arguments are present.
5. Touch Target & Motion Polish (from Reviewer 1 findings):
   - In `app/components/followup/RadarOverview.tsx`, ensure "All Absentees" button has `min-h-[44px]` and minimum 44px touch target.
   - In `app/components/followup/MessagePreviewBubble.tsx`, ensure tone buttons have `min-h-[44px]`.
   - In `app/components/followup/MemberFollowUpCard.tsx`, ensure history accordion transition uses composite properties or clean layout animation without direct layout thrashing, and metadata text uses `text-slate-700` for AAA contrast.

Verification Requirements:
1. Run `npx vitest run tests/adversarial/absence-radar-adversarial.test.ts`
2. Run `npx vitest run tests/adversarial/followup-escalation-adversarial.test.ts`
3. Run `npx vitest run` (ensure all tests pass, 0 failures)
4. Run `npm run build` (ensure clean compilation, exit code 0)
5. Run `npx eslint lib/absence-radar.ts lib/follow-up-engine.ts app/api/cron/follow-up/route.ts app/actions/followup.ts app/followup/page.tsx app/components/followup`

Deliverables:
- Write your complete handoff report to: `c:\Users\dafen\OneDrive\Desktop\church-management-system\.agents\teamwork\m3_it2_worker_1\handoff.md`
- Send a completion message back with summary of changes, test outputs, and verification status.
