/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Empirical Adversarial Stress Testing Suite:
 * FollowUpTask Synchronization Idempotency, 48-Hour Auto-Escalation Boundaries & Cron Route Security
 *
 * RCCG Jesus Covenant Zone CMS — Milestone 3 Challenger 2
 *
 * Target modules under test:
 * - lib/follow-up-engine.ts (syncFollowUpTasks, executeAutoEscalationScan, completeFollowUpTask, getWeekNumber)
 * - app/api/cron/follow-up/route.ts (GET, POST route handlers)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mockPrisma } from '../helpers/prisma-mock';

vi.mock('@/lib/prisma', () => ({
  prisma: mockPrisma,
}));

import {
  syncFollowUpTasks,
  executeAutoEscalationScan,
  completeFollowUpTask,
  getWeekNumber,
} from '@/lib/follow-up-engine';
import { GET, POST } from '@/app/api/cron/follow-up/route';
import { NextRequest } from 'next/server';

describe('Adversarial Follow-Up Escalation & Cron Security Stress Harness (Milestone 3)', () => {
  const originalEnv = process.env;
  const TEST_CRON_SECRET = 'covenant_zone_ultra_secure_cron_secret_9988!';

  // Standard fixed dates for deterministic testing
  // Tuesday, 10 Nov 2026, 12:00 WAT
  const fixedNow = new Date('2026-11-10T12:00:00Z');
  const s1Sunday = new Date('2026-11-08T00:00:00.000Z'); // Most recent Sunday
  const s2Sunday = new Date('2026-11-01T00:00:00.000Z'); // 1 Sunday ago
  const s3Sunday = new Date('2026-10-25T00:00:00.000Z'); // 2 Sundays ago

  const mockChurch = {
    id: 'church-covenant-zone',
    name: 'RCCG Jesus Covenant Zone',
    latitude: 6.5244,
    longitude: 3.3792,
    geofenceRadius: 150,
  };

  const memberA = {
    id: 'person-a-1',
    churchId: mockChurch.id,
    firstName: 'Tunde',
    lastName: 'Bakare',
    phone: '08031234567',
    phoneLast4: '4567',
    category: 'YOUTH',
    subCategory: 'Choir',
    status: 'MEMBER',
    isActive: true,
    createdAt: new Date('2026-01-01T00:00:00Z'),
  };

  const memberB = {
    id: 'person-b-2',
    churchId: mockChurch.id,
    firstName: 'Folake',
    lastName: 'Adeleke',
    phone: '08099887766',
    phoneLast4: '7766',
    category: 'YOUTH',
    subCategory: 'Ushering',
    status: 'MEMBER',
    isActive: true,
    createdAt: new Date('2026-01-01T00:00:00Z'),
  };

  const firstTimerC = {
    id: 'person-c-3',
    churchId: mockChurch.id,
    firstName: 'Emeka',
    lastName: 'Okafor',
    phone: '08123456789',
    phoneLast4: '6789',
    category: 'YOUTH',
    subCategory: null,
    status: 'FIRST_TIMER',
    isActive: true,
    createdAt: new Date('2026-11-09T08:00:00Z'), // ~28 hours old
  };

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv, CRON_SECRET: TEST_CRON_SECRET };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  // =========================================================================
  // SECTION 1: Task Synchronization Idempotency & Concurrency Stress Testing
  // =========================================================================
  describe('1. Task Synchronization Idempotency & Concurrency Stress', () => {
    it('1.1: Sequential Idempotency — repeated syncs create task on 1st run and skip on subsequent runs', async () => {
      mockPrisma.church.findFirst.mockResolvedValue(mockChurch as any);
      mockPrisma.person.findMany.mockResolvedValue([memberA as any]);
      // Member A attended S2, missed S1 -> MISSED_1_WEEK
      mockPrisma.attendanceRecord.findMany
        .mockResolvedValueOnce([{ personId: memberA.id, date: s2Sunday }]) // Sunday records
        .mockResolvedValueOnce([{ personId: memberA.id, date: s2Sunday }]); // 60-day records

      // First run: no open tasks
      mockPrisma.followUpTask.findMany
        .mockResolvedValueOnce([]) // radar openTasks
        .mockResolvedValueOnce([]) // sync existingOpenTasks
        .mockResolvedValueOnce([]); // sync recentCompletedTasks

      let createdId = '';
      mockPrisma.followUpTask.create.mockImplementation(async (args) => {
        createdId = 'task-seq-1';
        return { id: createdId, ...args.data };
      });

      const firstRun = await syncFollowUpTasks({ churchId: mockChurch.id, refDate: fixedNow });
      expect(firstRun.createdCount).toBe(1);
      expect(firstRun.skippedDuplicate).toBe(0);
      expect(mockPrisma.followUpTask.create).toHaveBeenCalledTimes(1);

      // Second run: existing open task present in DB
      const existingTask = {
        id: 'task-seq-1',
        personId: memberA.id,
        reason: 'MISSED_1_WEEK',
        status: 'PENDING',
        assignedTo: 'Choir Volunteer',
        dueDate: new Date(fixedNow.getTime() + 48 * 3600 * 1000),
      };

      mockPrisma.attendanceRecord.findMany
        .mockResolvedValueOnce([{ personId: memberA.id, date: s2Sunday }])
        .mockResolvedValueOnce([{ personId: memberA.id, date: s2Sunday }]);

      mockPrisma.followUpTask.findMany
        .mockResolvedValueOnce([existingTask]) // radar openTasks
        .mockResolvedValueOnce([existingTask]) // sync existingOpenTasks
        .mockResolvedValueOnce([]); // sync recentCompletedTasks

      const secondRun = await syncFollowUpTasks({ churchId: mockChurch.id, refDate: fixedNow });
      expect(secondRun.createdCount).toBe(0);
      expect(secondRun.skippedDuplicate).toBe(1);
      // create should NOT have been called on second run
      expect(mockPrisma.followUpTask.create).toHaveBeenCalledTimes(1);
    });

    it('1.2: Concurrency Stress Test — 10 simultaneous syncFollowUpTasks calls must NOT create duplicate open tasks', async () => {
      // Setup stateful mock store to simulate real-world database table behavior
      const taskStore: any[] = [];
      let taskCounter = 0;

      mockPrisma.church.findFirst.mockResolvedValue(mockChurch as any);
      mockPrisma.person.findMany.mockResolvedValue([memberA as any]);

      mockPrisma.attendanceRecord.findMany.mockImplementation(async () => {
        return [{ personId: memberA.id, date: s2Sunday }];
      });

      // Stateful findMany reflecting current tasks in taskStore
      mockPrisma.followUpTask.findMany.mockImplementation(async (args: any) => {
        let results = [...taskStore];
        if (args?.where?.status?.in) {
          results = results.filter((t) => args.where.status.in.includes(t.status));
        } else if (typeof args?.where?.status === 'string') {
          results = results.filter((t) => t.status === args.where.status);
        }
        if (args?.where?.personId?.in) {
          results = results.filter((t) => args.where.personId.in.includes(t.personId));
        } else if (typeof args?.where?.personId === 'string') {
          results = results.filter((t) => t.personId === args.where.personId);
        }
        return results;
      });

      mockPrisma.followUpTask.create.mockImplementation(async (args: any) => {
        taskCounter++;
        const record = {
          id: `task-concurrent-${taskCounter}`,
          createdAt: new Date(),
          updatedAt: new Date(),
          ...args.data,
        };
        taskStore.push(record);
        return record;
      });

      mockPrisma.followUpTask.update.mockImplementation(async (args: any) => {
        const idx = taskStore.findIndex((t) => t.id === args.where.id);
        if (idx !== -1) {
          taskStore[idx] = { ...taskStore[idx], ...args.data, updatedAt: new Date() };
          return taskStore[idx];
        }
        return { id: args.where.id, ...args.data };
      });

      // Fire 10 simultaneous sync operations via Promise.all
      const CONCURRENCY_RUNS = 10;
      const syncPromises = Array.from({ length: CONCURRENCY_RUNS }, () =>
        syncFollowUpTasks({ churchId: mockChurch.id, refDate: fixedNow })
      );

      const syncResults = await Promise.all(syncPromises);

      // Verify that across all 10 concurrent executions:
      const totalCreated = syncResults.reduce((sum, r) => sum + r.createdCount, 0);
      const openTasksInStore = taskStore.filter(
        (t) => t.personId === memberA.id && ['PENDING', 'ESCALATED'].includes(t.status)
      );

      // CRITICAL INVARIANT: Never allow duplicate open tasks for the same member
      expect(openTasksInStore.length).toBe(1);
      expect(totalCreated).toBe(1);
    });

    it('1.3: Upgrades task reason from MISSED_1_WEEK to MISSED_2_WEEKS without duplicating task', async () => {
      mockPrisma.church.findFirst.mockResolvedValue(mockChurch as any);
      mockPrisma.person.findMany.mockResolvedValue([memberB as any]);

      // Attended S3, missed S1 and S2 -> detected as MISSED_2_WEEKS
      mockPrisma.attendanceRecord.findMany
        .mockResolvedValueOnce([{ personId: memberB.id, date: s3Sunday }])
        .mockResolvedValueOnce([{ personId: memberB.id, date: s3Sunday }]);

      const originalDueDate = new Date(fixedNow.getTime() + 24 * 3600 * 1000);
      const existingOpenTask = {
        id: 'task-upgrade-1',
        personId: memberB.id,
        reason: 'MISSED_1_WEEK',
        status: 'PENDING',
        assignedTo: 'Ushering Volunteer',
        dueDate: originalDueDate,
        aiDraftNote: 'Old 1-week draft',
      };

      mockPrisma.followUpTask.findMany
        .mockResolvedValueOnce([existingOpenTask]) // radar query
        .mockResolvedValueOnce([existingOpenTask]) // sync query
        .mockResolvedValueOnce([]); // completed query

      mockPrisma.followUpTask.update.mockResolvedValue({
        ...existingOpenTask,
        reason: 'MISSED_2_WEEKS',
      });

      const res = await syncFollowUpTasks({ churchId: mockChurch.id, refDate: fixedNow });

      expect(res.createdCount).toBe(0);
      expect(res.updatedCount).toBe(1);
      expect(res.skippedDuplicate).toBe(0);

      expect(mockPrisma.followUpTask.create).not.toHaveBeenCalled();
      expect(mockPrisma.followUpTask.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'task-upgrade-1' },
          data: expect.objectContaining({
            reason: 'MISSED_2_WEEKS',
            aiDraftNote: expect.any(String),
          }),
        })
      );
    });

    it('1.4: Preserves ESCALATED status when reason upgrades from MISSED_1_WEEK to MISSED_2_WEEKS', async () => {
      mockPrisma.church.findFirst.mockResolvedValue(mockChurch as any);
      mockPrisma.person.findMany.mockResolvedValue([memberB as any]);

      mockPrisma.attendanceRecord.findMany
        .mockResolvedValueOnce([{ personId: memberB.id, date: s3Sunday }])
        .mockResolvedValueOnce([{ personId: memberB.id, date: s3Sunday }]);

      const escalatedTask = {
        id: 'task-escalated-upgrade',
        personId: memberB.id,
        reason: 'MISSED_1_WEEK',
        status: 'ESCALATED',
        assignedTo: 'Youth Pastor (Escalated)',
        escalatedTo: 'YOUTH_PASTOR',
        dueDate: new Date(fixedNow.getTime() - 10 * 3600 * 1000), // was overdue
      };

      mockPrisma.followUpTask.findMany
        .mockResolvedValueOnce([escalatedTask])
        .mockResolvedValueOnce([escalatedTask])
        .mockResolvedValueOnce([]);

      mockPrisma.followUpTask.update.mockResolvedValue({
        ...escalatedTask,
        reason: 'MISSED_2_WEEKS',
      });

      const res = await syncFollowUpTasks({ churchId: mockChurch.id, refDate: fixedNow });

      expect(res.createdCount).toBe(0);
      expect(res.updatedCount).toBe(1);
      // Ensure update does NOT revert status back to PENDING
      expect(mockPrisma.followUpTask.update).toHaveBeenCalledWith({
        where: { id: 'task-escalated-upgrade' },
        data: expect.objectContaining({
          reason: 'MISSED_2_WEEKS',
        }),
      });
      const updateData = mockPrisma.followUpTask.update.mock.calls[0][0].data;
      expect(updateData.status).toBeUndefined(); // status must not be overwritten
    });

    it('1.5: Enforces 144-Hour (6-day) cooldown window for recently contacted members', async () => {
      mockPrisma.church.findFirst.mockResolvedValue(mockChurch as any);
      mockPrisma.person.findMany.mockResolvedValue([memberA as any]);

      mockPrisma.attendanceRecord.findMany
        .mockResolvedValueOnce([{ personId: memberA.id, date: s2Sunday }])
        .mockResolvedValueOnce([{ personId: memberA.id, date: s2Sunday }]);

      // Contacted 48 hours ago (well within 144h cooldown)
      const contactedAt = new Date(fixedNow.getTime() - 48 * 3600 * 1000);

      mockPrisma.followUpTask.findMany
        .mockResolvedValueOnce([]) // radar
        .mockResolvedValueOnce([]) // open tasks
        .mockResolvedValueOnce([
          {
            id: 'completed-task-1',
            personId: memberA.id,
            status: 'CONTACTED',
            contactedAt,
          },
        ]); // completed tasks in cooldown

      const res = await syncFollowUpTasks({ churchId: mockChurch.id, refDate: fixedNow });

      expect(res.createdCount).toBe(0);
      expect(res.skippedCooldown).toBe(1);
      expect(mockPrisma.followUpTask.create).not.toHaveBeenCalled();
    });

    it('1.6: Boundary test on cooldown — skips at 143h 59m, creates new task at 144h 01m', async () => {
      mockPrisma.church.findFirst.mockResolvedValue(mockChurch as any);
      mockPrisma.person.findMany.mockResolvedValue([memberA as any]);

      // Subcase A: 143h 59m ago -> still in cooldown threshold
      mockPrisma.attendanceRecord.findMany
        .mockResolvedValueOnce([{ personId: memberA.id, date: s2Sunday }])
        .mockResolvedValueOnce([{ personId: memberA.id, date: s2Sunday }]);

      mockPrisma.followUpTask.findMany
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([
          {
            id: 'task-cd-active',
            personId: memberA.id,
            status: 'CONTACTED',
            contactedAt: new Date(fixedNow.getTime() - (144 * 3600 * 1000 - 60 * 1000)),
          },
        ]);

      const resA = await syncFollowUpTasks({ churchId: mockChurch.id, refDate: fixedNow });
      expect(resA.skippedCooldown).toBe(1);
      expect(resA.createdCount).toBe(0);

      // Subcase B: 144h 01m ago -> cooldown has lapsed (findMany with gte returns empty)
      mockPrisma.attendanceRecord.findMany
        .mockResolvedValueOnce([{ personId: memberA.id, date: s2Sunday }])
        .mockResolvedValueOnce([{ personId: memberA.id, date: s2Sunday }]);

      mockPrisma.followUpTask.findMany
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]); // no records >= cooldownThreshold

      mockPrisma.followUpTask.create.mockResolvedValue({ id: 'task-cd-expired' });

      const resB = await syncFollowUpTasks({ churchId: mockChurch.id, refDate: fixedNow });
      expect(resB.skippedCooldown).toBe(0);
      expect(resB.createdCount).toBe(1);
    });

    it('1.7: First-Timer assigns 72-hour dueDate and maps to FIRST_TIMER_72H category', async () => {
      mockPrisma.church.findFirst.mockResolvedValue(mockChurch as any);
      mockPrisma.person.findMany.mockResolvedValue([firstTimerC as any]);

      mockPrisma.attendanceRecord.findMany
        .mockResolvedValueOnce([]) // target Sundays
        .mockResolvedValueOnce([]); // 60-day

      mockPrisma.followUpTask.findMany
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      mockPrisma.followUpTask.create.mockImplementation(async (args) => {
        return { id: 'task-ft-1', ...args.data };
      });

      const res = await syncFollowUpTasks({ churchId: mockChurch.id, refDate: fixedNow });
      expect(res.createdCount).toBe(1);

      expect(mockPrisma.followUpTask.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            personId: firstTimerC.id,
            reason: 'FIRST_TIMER',
            status: 'PENDING',
            assignedTo: 'Youth Volunteer',
            dueDate: new Date(fixedNow.getTime() + 72 * 3600 * 1000), // Exactly 72h
          }),
        })
      );
    });
  });

  // =========================================================================
  // SECTION 2: 48-Hour Auto-Escalation Scanner Stress Testing
  // =========================================================================
  describe('2. 48-Hour Auto-Escalation Scanner Stress Testing', () => {
    it('2.1: Precise 48-Hour Boundary — remains PENDING at 47h 59m, escalates at 48h 01m', async () => {
      const taskCreationTime = new Date('2026-11-08T12:00:00Z');
      const dueDate = new Date(taskCreationTime.getTime() + 48 * 3600 * 1000); // 2026-11-10T12:00:00Z

      const pendingTask = {
        id: 'task-boundary-test',
        personId: memberA.id,
        reason: 'MISSED_1_WEEK',
        status: 'PENDING',
        dueDate,
        escalatedTo: null,
        person: {
          id: memberA.id,
          firstName: memberA.firstName,
          lastName: memberA.lastName,
        },
      };

      // Subcase A: Scan at 47h 59m (1 minute before due) -> dueDate <= now is FALSE
      const nowBeforeBoundary = new Date(dueDate.getTime() - 60 * 1000);
      mockPrisma.followUpTask.findMany.mockResolvedValueOnce([]);

      const resultBefore = await executeAutoEscalationScan({ now: nowBeforeBoundary });
      expect(resultBefore.escalatedCount).toBe(0);
      expect(resultBefore.taskIds).toEqual([]);
      expect(mockPrisma.followUpTask.updateMany).not.toHaveBeenCalled();

      // Subcase B: Scan at 48h 01m (1 minute after due) -> overdue!
      const nowAfterBoundary = new Date(dueDate.getTime() + 60 * 1000);
      mockPrisma.followUpTask.findMany.mockResolvedValueOnce([pendingTask]);
      mockPrisma.followUpTask.updateMany.mockResolvedValueOnce({ count: 1 });
      mockPrisma.followUpResult.create.mockResolvedValueOnce({ id: 'res-boundary' });
      mockPrisma.$transaction.mockResolvedValueOnce([{ id: 'res-boundary' }]);

      const resultAfter = await executeAutoEscalationScan({ now: nowAfterBoundary });
      expect(resultAfter.escalatedCount).toBe(1);
      expect(resultAfter.taskIds).toEqual(['task-boundary-test']);

      expect(mockPrisma.followUpTask.updateMany).toHaveBeenCalledWith({
        where: {
          id: { in: ['task-boundary-test'] },
          status: 'PENDING',
        },
        data: {
          status: 'ESCALATED',
          escalatedTo: 'YOUTH_PASTOR',
          assignedTo: 'Youth Pastor (Escalated)',
        },
      });
    });

    it('2.2: Clock Drift & Negative Time Intervals — robust against backward clock shift', async () => {
      // Server clock shifted backward by 2 hours into the past
      const driftedNow = new Date('2026-11-07T12:00:00Z');

      // Due date is in future relative to driftedNow -> no tasks returned by query
      mockPrisma.followUpTask.findMany.mockResolvedValueOnce([]);

      const res = await executeAutoEscalationScan({ now: driftedNow });
      expect(res.escalatedCount).toBe(0);
      expect(res.taskIds).toEqual([]);
      expect(mockPrisma.followUpTask.updateMany).not.toHaveBeenCalled();
    });

    it('2.3: Audit Trail Verification — generates immutable FollowUpResult with ESCALATED_TO_PASTOR', async () => {
      const overdueDate = new Date('2026-11-10T10:00:00Z');
      const overdueTasks = [
        {
          id: 'task-audit-1',
          personId: memberA.id,
          reason: 'MISSED_1_WEEK',
          status: 'PENDING',
          dueDate: overdueDate,
          escalatedTo: null,
          person: { id: memberA.id, firstName: memberA.firstName, lastName: memberA.lastName },
        },
        {
          id: 'task-audit-2',
          personId: memberB.id,
          reason: 'MISSED_2_WEEKS',
          status: 'PENDING',
          dueDate: overdueDate,
          escalatedTo: null,
          person: { id: memberB.id, firstName: memberB.firstName, lastName: memberB.lastName },
        },
      ];

      mockPrisma.followUpTask.findMany.mockResolvedValueOnce(overdueTasks);
      mockPrisma.followUpTask.updateMany.mockResolvedValueOnce({ count: 2 });
      mockPrisma.$transaction.mockResolvedValueOnce([{ id: 'r1' }, { id: 'r2' }]);

      const scanResult = await executeAutoEscalationScan({ now: fixedNow });

      expect(scanResult.escalatedCount).toBe(2);
      expect(scanResult.taskIds).toEqual(['task-audit-1', 'task-audit-2']);

      // Check transaction call
      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);

      // Verify the generated audit objects passed to $transaction
      const transactionPayload = mockPrisma.$transaction.mock.calls[0][0];
      expect(transactionPayload).toHaveLength(2);

      // Verify FollowUpResult.create calls
      expect(mockPrisma.followUpResult.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            personId: memberA.id,
            callerName: 'SYSTEM_ESCALATION_BOT',
            outcome: 'ESCALATED_TO_PASTOR',
            weekNumber: getWeekNumber(fixedNow),
            note: expect.stringContaining('[48H AUTO-ESCALATION]'),
          }),
        })
      );

      expect(mockPrisma.followUpResult.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            personId: memberB.id,
            callerName: 'SYSTEM_ESCALATION_BOT',
            outcome: 'ESCALATED_TO_PASTOR',
            weekNumber: getWeekNumber(fixedNow),
            note: expect.stringContaining('[48H AUTO-ESCALATION]'),
          }),
        })
      );
    });

    it('2.4: Escalation Idempotency — subsequent scans ignore already escalated tasks', async () => {
      // Second scan immediately after first: query filters by status: 'PENDING' and escalatedTo: null
      mockPrisma.followUpTask.findMany.mockResolvedValueOnce([]);

      const secondScan = await executeAutoEscalationScan({ now: fixedNow });
      expect(secondScan.escalatedCount).toBe(0);
      expect(secondScan.taskIds).toEqual([]);
      expect(mockPrisma.followUpTask.updateMany).not.toHaveBeenCalled();
      expect(mockPrisma.followUpResult.create).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // SECTION 3: Authorized Cron Route (/api/cron/follow-up) Security & Fuzzing
  // =========================================================================
  describe('3. Authorized Cron Route (/api/cron/follow-up) Security & Fuzzing', () => {
    it('3.1: Rejects requests with missing or empty authorization header', async () => {
      const headersToTest: Record<string, string>[] = [
        {},
        { authorization: '' },
        { authorization: '   ' },
      ];

      for (const headers of headersToTest) {
        const req = new NextRequest('http://localhost:3000/api/cron/follow-up', {
          method: 'POST',
          headers,
        });

        const res = await POST(req);
        expect(res.status).toBe(401);
        const json = await res.json();
        expect(json.success).toBe(false);
        expect(json.code).toBe('UNAUTHORIZED');
      }
    });

    it('3.2: Rejects requests with non-Bearer authentication schemes (Basic, Token, Digest)', async () => {
      const invalidSchemeHeaders = [
        'Basic ' + Buffer.from('admin:password').toString('base64'),
        'Token ' + TEST_CRON_SECRET,
        'Digest username="admin"',
        'CustomAuth ' + TEST_CRON_SECRET,
      ];

      for (const authHeader of invalidSchemeHeaders) {
        const req = new NextRequest('http://localhost:3000/api/cron/follow-up', {
          method: 'POST',
          headers: { authorization: authHeader },
        });

        const res = await POST(req);
        expect(res.status).toBe(401);
        const json = await res.json();
        expect(json.success).toBe(false);
        expect(json.code).toBe('UNAUTHORIZED');
      }
    });

    it('3.3: Rejects malformed Bearer headers (missing token, wrong secret, SQL injection, XSS)', async () => {
      const malformedHeaders = [
        'Bearer',
        'Bearer ',
        'Bearer   ',
        'Bearer wrong_secret',
        "Bearer ' OR '1'='1",
        'Bearer \'; DROP TABLE "FollowUpTask"; --',
        'Bearer <script>alert("xss")</script>',
        'Bearer ' + 'A'.repeat(5000),
      ];

      for (const authHeader of malformedHeaders) {
        const req = new NextRequest('http://localhost:3000/api/cron/follow-up', {
          method: 'POST',
          headers: { authorization: authHeader },
        });

        const res = await POST(req);
        expect(res.status).toBe(401);
        const json = await res.json();
        expect(json.success).toBe(false);
        expect(json.code).toBe('UNAUTHORIZED');
      }
    });

    it('3.4: Rejects Bearer header with trailing garbage or extra arguments', async () => {
      // RFC 6750 specifies single b64token. Trailing extra tokens should not be silently parsed.
      const trailingGarbageHeader = `Bearer ${TEST_CRON_SECRET} extra_garbage_payload`;

      const req = new NextRequest('http://localhost:3000/api/cron/follow-up', {
        method: 'POST',
        headers: { authorization: trailingGarbageHeader },
      });

      const res = await POST(req);
      // If endpoint splits by ' ' and only takes index 1, it allows trailing garbage.
      // A strictly secure implementation must reject headers with extra tokens.
      expect(res.status).toBe(401);
    });

    it('3.5: Fuzzes query parameter ?secret= with invalid, empty, and injection strings', async () => {
      const maliciousQueryParams = [
        '', // ?secret=
        'invalid_secret',
        "' OR '1'='1",
        '; DROP TABLE "Person"; --',
        '<script>',
        encodeURIComponent('{"$gt": ""}'),
      ];

      for (const queryParam of maliciousQueryParams) {
        const req = new NextRequest(
          `http://localhost:3000/api/cron/follow-up?secret=${queryParam}`,
          { method: 'GET' }
        );

        const res = await GET(req);
        expect(res.status).toBe(401);
        const json = await res.json();
        expect(json.success).toBe(false);
        expect(json.code).toBe('UNAUTHORIZED');
      }
    });

    it('3.6: Case sensitivity of query parameter — ?SECRET= or ?Secret= is rejected', async () => {
      const reqUpper = new NextRequest(
        `http://localhost:3000/api/cron/follow-up?SECRET=${TEST_CRON_SECRET}`,
        { method: 'GET' }
      );
      const resUpper = await GET(reqUpper);
      expect(resUpper.status).toBe(401);

      const reqMixed = new NextRequest(
        `http://localhost:3000/api/cron/follow-up?Secret=${TEST_CRON_SECRET}`,
        { method: 'GET' }
      );
      const resMixed = await GET(reqMixed);
      expect(resMixed.status).toBe(401);
    });

    it('3.7: Production environment protection — rejects fallback secret if CRON_SECRET is unset in production', async () => {
      // Simulate production environment with missing CRON_SECRET
      process.env = { ...originalEnv, NODE_ENV: 'production', CRON_SECRET: '' };

      const req = new NextRequest('http://localhost:3000/api/cron/follow-up', {
        method: 'POST',
        headers: {
          authorization: 'Bearer test-cron-secret', // Fallback should NOT work in production
        },
      });

      const res = await POST(req);
      expect(res.status).toBe(401);
    });

    it('3.8: Authorized execution via Bearer token returns HTTP 200 with complete JSON telemetry', async () => {
      mockPrisma.church.findFirst.mockResolvedValue(mockChurch as any);
      mockPrisma.person.findMany.mockResolvedValue([]);
      mockPrisma.attendanceRecord.findMany.mockResolvedValue([]);
      mockPrisma.followUpTask.findMany.mockResolvedValue([]);

      const req = new NextRequest('http://localhost:3000/api/cron/follow-up', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${TEST_CRON_SECRET}`,
        },
      });

      const res = await POST(req);
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.success).toBe(true);
      expect(typeof json.timestamp).toBe('string');
      expect(typeof json.durationMs).toBe('number');
      expect(json.durationMs).toBeGreaterThanOrEqual(0);

      // Radar metrics telemetry
      expect(json.radar).toMatchObject({
        scanned: expect.any(Number),
        missed1Week: expect.any(Number),
        missed2Weeks: expect.any(Number),
        firstTimers72h: expect.any(Number),
        escalatedCount: expect.any(Number),
        totalAbsentees: expect.any(Number),
      });

      // Sync metrics telemetry
      expect(json.sync).toMatchObject({
        tasksCreated: expect.any(Number),
        tasksUpdated: expect.any(Number),
        skippedDuplicate: expect.any(Number),
        skippedCooldown: expect.any(Number),
      });

      // Escalation metrics telemetry
      expect(json.escalations).toMatchObject({
        tasksEscalated: expect.any(Number),
        taskIds: expect.any(Array),
      });
    });

    it('3.9: Exception Handling — database disconnect / pool exhaustion cleanly returns HTTP 500 without crashing', async () => {
      // Simulate fatal database connection pool exhaustion
      const poolError = new Error('Can not reach database server at localhost:5432. Pool timed out.');
      (poolError as any).code = 'P1001';
      mockPrisma.church.findFirst.mockRejectedValue(poolError);

      const req = new NextRequest('http://localhost:3000/api/cron/follow-up', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${TEST_CRON_SECRET}`,
        },
      });

      const res = await POST(req);
      expect(res.status).toBe(500);

      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.error).toContain('Pool timed out');
      expect(typeof json.durationMs).toBe('number');
    });

    it('3.10: Exception Handling — non-Error thrown objects return 500 with default error message', async () => {
      // Simulate rejection with a primitive string instead of an Error instance
      mockPrisma.church.findFirst.mockRejectedValue('Fatal string error without stack trace');

      const req = new NextRequest('http://localhost:3000/api/cron/follow-up', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${TEST_CRON_SECRET}`,
        },
      });

      const res = await POST(req);
      expect(res.status).toBe(500);

      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.error).toBe('Internal follow-up cron failure');
    });
  });

  // =========================================================================
  // SECTION 4: Task Completion & Outcome Integrity
  // =========================================================================
  describe('4. Task Completion & Outcome Integrity', () => {
    it('4.1: Successfully completes task, sets CONTACTED status, and creates FollowUpResult', async () => {
      const task = {
        id: 'task-complete-1',
        personId: memberA.id,
        status: 'PENDING',
      };

      mockPrisma.followUpTask.findUnique.mockResolvedValue(task as any);
      mockPrisma.followUpTask.update.mockResolvedValue({
        id: task.id,
        status: 'CONTACTED',
      });
      mockPrisma.followUpResult.create.mockResolvedValue({ id: 'res-complete-1' });

      const res = await completeFollowUpTask({
        taskId: task.id,
        callerName: 'Bro. David',
        outcome: 'Prayed With',
        note: 'Prayed for peace and quick recovery.',
        contactedAt: fixedNow,
      });

      expect(res.success).toBe(true);
      expect(res.taskId).toBe(task.id);
      expect(res.resultId).toBe('res-complete-1');

      expect(mockPrisma.followUpTask.update).toHaveBeenCalledWith({
        where: { id: task.id },
        data: {
          status: 'CONTACTED',
          contactedAt: fixedNow,
        },
      });

      expect(mockPrisma.followUpResult.create).toHaveBeenCalledWith({
        data: {
          personId: memberA.id,
          callerName: 'Bro. David',
          weekNumber: getWeekNumber(fixedNow),
          outcome: 'Prayed With',
          note: 'Prayed for peace and quick recovery.',
          createdAt: fixedNow,
        },
      });
    });

    it('4.2: Handles whitespace caller name by defaulting to "Volunteer Caller"', async () => {
      mockPrisma.followUpTask.findUnique.mockResolvedValue({
        id: 'task-complete-2',
        personId: memberB.id,
        status: 'PENDING',
      } as any);
      mockPrisma.followUpTask.update.mockResolvedValue({ id: 'task-complete-2' });
      mockPrisma.followUpResult.create.mockResolvedValue({ id: 'res-complete-2' });

      await completeFollowUpTask({
        taskId: 'task-complete-2',
        callerName: '   ', // only whitespace
        outcome: 'Contacted (WhatsApp)',
      });

      expect(mockPrisma.followUpResult.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            callerName: 'Volunteer Caller',
          }),
        })
      );
    });

    it('4.3: Throws descriptive error when completing non-existent task', async () => {
      mockPrisma.followUpTask.findUnique.mockResolvedValue(null);

      await expect(
        completeFollowUpTask({
          taskId: 'missing-task-id',
          callerName: 'Caller',
          outcome: 'No Response',
        })
      ).rejects.toThrow('FollowUpTask with ID missing-task-id not found.');
    });
  });
});
