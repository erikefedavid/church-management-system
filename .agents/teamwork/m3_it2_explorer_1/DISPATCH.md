# Task Assignment: Milestone 3 Iteration 2 Explorer 1 (Absence Radar Perf & Logic Fix)

## Working Directory
`c:\Users\dafen\OneDrive\Desktop\church-management-system`

## State Folder
`c:\Users\dafen\OneDrive\Desktop\church-management-system\.agents\teamwork\m3_it2_explorer_1`

## References (Read Before Starting)
- `c:\Users\dafen\OneDrive\Desktop\church-management-system\.agents\teamwork\ORIGINAL_REQUEST.md` (MUST read first)
- `c:\Users\dafen\OneDrive\Desktop\church-management-system\.agents\teamwork\orchestrator\PROJECT.md`
- `c:\Users\dafen\OneDrive\Desktop\church-management-system\.agents\teamwork\m3_challenger_1\handoff.md` (Challenger 1 findings & failure report)
- `tests/adversarial/absence-radar-adversarial.test.ts`
- `lib/absence-radar.ts`

## Background & Objective
Milestone 3 Iteration 1 Gate failed due to Challenger findings. Challenger 1 identified:
1. **Performance Threshold Defect**: In `lib/absence-radar.ts:396` and `476`, unmemoized `toLocaleDateString` called inside the member iteration loop takes ~170ms for 667 absentees. 1,000 members with 5,000 records takes 205ms-259ms, violating the <100ms mandate. Also `activePeople.find` in `lib/absence-radar.ts:449` is an O(N) scan inside the open tasks loop.
2. **Logic Shadowing**: Rule 4 (`DORMANT_CRITICAL`) is dead code shadowed by Rule 3 (`MISSED_2_WEEKS`) due to `(attendedS3 || hasHistory)`.

Your task is to:
1. Thoroughly investigate `lib/absence-radar.ts` and `tests/adversarial/absence-radar-adversarial.test.ts`.
2. Formulate the exact, comprehensive fix strategy for `lib/absence-radar.ts` to:
   - Memoize `Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })` at module scope.
   - Use a pre-indexed Map for `activePeople.get(task.personId)`.
   - Correctly unshadow Rule 4 (`DORMANT_CRITICAL`) while preserving all existing passing test cases (WAT cutoff, Sunday math, 0-attendance exclusion, 72h first timers, 4-query batch strategy).
3. Verify that the recommended strategy will allow `tests/adversarial/absence-radar-adversarial.test.ts` to pass 39/39 tests in <100ms without regressions.
4. Write your findings and recommended implementation strategy to `c:\Users\dafen\OneDrive\Desktop\church-management-system\.agents\teamwork\m3_it2_explorer_1\handoff.md`. Do NOT modify code yourself.


## 2026-11-12T17:22:23Z
You are m3_it2_explorer_1 (M3 Iteration 2 Explorer 1: Absence Radar Perf & Logic Fix).
Working directory: c:\Users\dafen\OneDrive\Desktop\church-management-system
State folder: c:\Users\dafen\OneDrive\Desktop\church-management-system\.agents\teamwork\m3_it2_explorer_1

Your task assignment is in `c:\Users\dafen\OneDrive\Desktop\church-management-system\.agents\teamwork\m3_it2_explorer_1\DISPATCH.md`.
Read `c:\Users\dafen\OneDrive\Desktop\church-management-system\.agents\teamwork\ORIGINAL_REQUEST.md` first.
Read `c:\Users\dafen\OneDrive\Desktop\church-management-system\.agents\teamwork\m3_challenger_1\handoff.md`, `tests/adversarial/absence-radar-adversarial.test.ts`, and `lib/absence-radar.ts`.

Investigate the performance defect (205ms > 100ms in-memory for 1,000 members) and Rule 4 DORMANT_CRITICAL logic shadowing bug.
Formulate the exact fix strategy and write your handoff report to `c:\Users\dafen\OneDrive\Desktop\church-management-system\.agents\teamwork\m3_it2_explorer_1\handoff.md`.
Do NOT write or modify code yourself.
Send a completion message back when done.
