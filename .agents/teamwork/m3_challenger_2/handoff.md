# Handoff Report: Milestone 3 — Task Escalation & Cron Security Adversarial Review

**Author**: `m3_challenger_2` (Task Escalation & Cron Security Challenger)  
**Recipient**: `9ffc4707-a26f-4abc-94bd-08bbb49a081e` (Orchestrator)  
**Date**: 2026-11-12T18:19:00Z  
**Verdict**: **REQUEST_CHANGES**  

---

## 1. Observation

An empirical adversarial test harness was authored in `tests/adversarial/followup-escalation-adversarial.test.ts` comprising 24 stress tests targeting:
1. `lib/follow-up-engine.ts` (`syncFollowUpTasks`, `executeAutoEscalationScan`, `completeFollowUpTask`, `getWeekNumber`)
2. `app/api/cron/follow-up/route.ts` (`GET`, `POST` route handlers)

Executing `npm test` produced **2 empirical test failures** in `tests/adversarial/followup-escalation-adversarial.test.ts` (alongside 1 preexisting timeout benchmark failure in `absence-radar-adversarial.test.ts`):

### Defect 1 (CRITICAL): TOCTOU Concurrency Race Condition in `syncFollowUpTasks`
- **Location**: `lib/follow-up-engine.ts:74-198`
- **Test**: `tests/adversarial/followup-escalation-adversarial.test.ts:114-221` (Test 1.2: *Concurrency Stress Test — 10 simultaneous syncFollowUpTasks calls must NOT create duplicate open tasks*)
- **Verbatim Error**:
  ```
  FAIL  tests/adversarial/followup-escalation-adversarial.test.ts > Adversarial Follow-Up Escalation & Cron Security Stress Harness (Milestone 3) > 1. Task Synchronization Idempotency & Concurrency Stress > 1.2: Concurrency Stress Test — 10 simultaneous syncFollowUpTasks calls must NOT create duplicate open tasks
  AssertionError: expected 10 to be 1 // Object.is equality

  - Expected
  + Received

  - 1
  + 10

   ❯ tests/adversarial/followup-escalation-adversarial.test.ts:218:39
      216|       // CRITICAL INVARIANT: Never allow duplicate open tasks for the same member
      217|
      218|       expect(openTasksInStore.length).toBe(1);
         |                                       ^
      219|       expect(totalCreated).toBe(1);
  ```

### Defect 2 (MEDIUM): Lenient Authorization Header Splitting Accepts Trailing Garbage
- **Location**: `app/api/cron/follow-up/route.ts:34-42`
- **Test**: `tests/adversarial/followup-escalation-adversarial.test.ts:641-651` (Test 3.4: *Rejects Bearer header with trailing garbage or extra arguments*)
- **Verbatim Error**:
  ```
  FAIL  tests/adversarial/followup-escalation-adversarial.test.ts > Adversarial Follow-Up Escalation & Cron Security Stress Harness (Milestone 3) > 3. Authorized Cron Route (/api/cron/follow-up) Security & Fuzzing > 3.4: Rejects Bearer header with trailing garbage or extra arguments
  AssertionError: expected 200 to be 401 // Object.is equality

  - Expected
  + Received

  - 401
  + 200

   ❯ tests/adversarial/followup-escalation-adversarial.test.ts:649:26
      647|       // If endpoint splits by ' ' and only takes index 1, it allows trailing garbage.
      648|       // A strictly secure implementation must reject headers with extra tokens.
      649|       expect(res.status).toBe(401);
         |                          ^
      650|     });
  ```

### Verified Robust Areas (22 Tests Passing)
- **Sequential Idempotency (Test 1.1)**: Sequential calls to `syncFollowUpTasks` correctly create the task once and skip duplicate creation (`skippedDuplicate = 1`).
- **Reason Upgrade (Tests 1.3 & 1.4)**: Upgrading from `MISSED_1_WEEK` to `MISSED_2_WEEKS` updates the reason and regenerates `aiDraftNote` without duplicating the task, and preserves existing `ESCALATED` status.
- **144-Hour Cooldown (Tests 1.5 & 1.6)**: Members contacted within 6 days (144h) are skipped from nagging re-creations (`skippedCooldown = 1`). The boundary transitions cleanly at 144h.
- **72-Hour First-Timer Due Date (Test 1.7)**: Assigns exact 72h due date.
- **48-Hour Auto-Escalation Scanner (Tests 2.1 – 2.4)**:
  - Exact boundary precision: at `47h 59m` tasks remain `PENDING`; at `48h 01m` tasks escalate to `YOUTH_PASTOR`.
  - Negative time intervals / clock drift: backward clock shifts do not trigger premature escalation.
  - Audit trail completeness: every escalated task generates an immutable `FollowUpResult` record in `$transaction` with `outcome: 'ESCALATED_TO_PASTOR'` and `weekNumber`.
  - Scanner idempotency: re-running scan on already escalated tasks does not create duplicate audit rows.
- **Cron Route Fuzzing & Protections (Tests 3.1, 3.2, 3.3, 3.5 – 3.10)**:
  - Empty, missing, non-Bearer schemes, invalid secrets, and SQL injection strings return HTTP 401.
  - Case sensitivity enforced on `?secret=` query parameter (e.g. `?SECRET=` returns 401).
  - Production environment protection: unset `CRON_SECRET` in production rejects `'test-cron-secret'` fallback.
  - Database failures (P1001 connection pool exhaustion / non-Error rejections) return HTTP 500 cleanly without crashing the Next.js process.
- **Task Completion (Tests 4.1 – 4.3)**:
  - Transitions task to `CONTACTED`, writes `contactedAt`, creates `FollowUpResult`, and defaults empty caller names to `'Volunteer Caller'`.

---

## 2. Logic Chain

1. **Root Cause of Defect 1 (Concurrency Race Condition)**:
   - In `lib/follow-up-engine.ts`, `syncFollowUpTasks` implements application-layer deduplication by running:
     ```ts
     const [existingOpenTasks, recentCompletedTasks] = await Promise.all([
       prisma.followUpTask.findMany({ where: { status: { in: ['PENDING', 'ESCALATED'] } } }),
       ...
     ]);
     ```
   - Because `prisma/schema.prisma` does not have a unique constraint on `FollowUpTask(personId, status)` (as noted in worker handoff section 2.3), deduplication relies entirely on application code.
   - When 10 concurrent requests arrive simultaneously (e.g. rapid admin clicks or concurrent cron triggers via `Promise.all`), all 10 requests execute `detectAbsenteeMembers` and `prisma.followUpTask.findMany` concurrently before any of them creates a task.
   - All 10 requests observe `existingOpenTasks = []`.
   - All 10 requests proceed to `prisma.followUpTask.create`.
   - Result: 10 duplicate open tasks are inserted for the same member, directly violating the core requirement: *"Run 10 rapid concurrent sync operations (Promise.all). Verify that no duplicate open tasks (PENDING or ESCALATED) are created for the same member."*

2. **Root Cause of Defect 2 (Lenient Bearer Header Parsing)**:
   - In `app/api/cron/follow-up/route.ts:35-41`:
     ```ts
     const authHeader = request.headers.get('authorization');
     if (authHeader) {
       const [scheme, token] = authHeader.split(' ');
       if (scheme?.toLowerCase() === 'bearer' && token === validSecret) {
         return true;
       }
     }
     ```
   - Using `const [scheme, token] = authHeader.split(' ')` extracts only elements 0 and 1. If an incoming header has trailing arguments (e.g. `Bearer <valid_secret> extra_payload`), the trailing arguments are ignored, and the header is evaluated as valid (HTTP 200) instead of rejecting invalid token syntax with HTTP 401.

---

## 3. Caveats

1. Sequential execution of `syncFollowUpTasks` is 100% idempotent; the duplicate creation only manifests under concurrent/interleaved invocations.
2. In production, single-instance cron runners scheduled minutes apart will not trigger concurrency issues; however, multiple workers, serverless functions, or rapid user clicks on the "Sync Radar" button in the dashboard will trigger duplicate task creation until an in-flight lock/mutex is applied.

---

## 4. Conclusion

**Verdict: REQUEST_CHANGES**

The FollowUpTask lifecycle, 48-hour auto-escalation scanner, and cron route handler are substantially functional and well-architected, but have 2 empirical defects that must be resolved:

### Recommended Fixes for Worker:
1. **Fix Concurrency TOCTOU in `lib/follow-up-engine.ts`**:
   Add an in-flight execution lock / deduplication promise:
   ```ts
   let inFlightSyncPromise: Promise<TaskSyncResult> | null = null;

   export async function syncFollowUpTasks(options: TaskSyncOptions = {}): Promise<TaskSyncResult> {
     if (inFlightSyncPromise) {
       return inFlightSyncPromise;
     }

     inFlightSyncPromise = (async () => {
       try {
         return await internalSyncFollowUpTasks(options);
       } finally {
         inFlightSyncPromise = null;
       }
     })();

     return inFlightSyncPromise;
   }
   ```
   *Alternative*: Wrap the member task creation in an atomic database upsert or application-level queue.

2. **Fix Authorization Header Parsing in `app/api/cron/follow-up/route.ts`**:
   Validate that the header contains exactly 2 tokens:
   ```ts
   const authHeader = request.headers.get('authorization');
   if (authHeader) {
     const parts = authHeader.trim().split(/\s+/);
     if (parts.length === 2 && parts[0]?.toLowerCase() === 'bearer' && parts[1] === validSecret) {
       return true;
     }
   }
   ```

---

## 5. Verification Method

### Test Execution Command
To verify the adversarial findings and reproduction:
```powershell
npx vitest run tests/adversarial/followup-escalation-adversarial.test.ts
```

### Invalidation Conditions
- Test 1.2 passes (`openTasksInStore.length === 1` and `totalCreated === 1` when 10 simultaneous calls run via `Promise.all`).
- Test 3.4 passes (HTTP 401 returned when `Authorization: Bearer <secret> extra_payload` is supplied).
