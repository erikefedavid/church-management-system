import { describe, it, expect, vi, beforeEach } from 'vitest';
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

describe('Follow-Up Engine & 48-Hour Escalation Unit Tests (Milestone 3 / Requirement R2)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('1. ISO Week Number Calculation', () => {
    it('calculates calendar week number accurately', () => {
      const date = new Date('2026-11-10T12:00:00Z');
      const week = getWeekNumber(date);
      expect(week).toBeGreaterThanOrEqual(1);
      expect(week).toBeLessThanOrEqual(53);
    });
  });

  describe('2. Idempotent Task Synchronization', () => {
    const fixedNow = new Date('2026-11-10T12:00:00Z');
    const s2Date = new Date('2026-11-01T00:00:00.000Z');

    it('creates new FollowUpTask for detected absentee when no open task exists', async () => {
      mockPrisma.church.findFirst.mockResolvedValue({ id: 'church-1', name: 'RCCG Test Zone' });

      // Member attended S2, missed S1 -> MISSED_1_WEEK
      mockPrisma.person.findMany.mockResolvedValue([
        {
          id: 'p-1',
          firstName: 'Chidinma',
          lastName: 'Okoro',
          phone: '08031112222',
          phoneLast4: '2222',
          category: 'YOUTH',
          subCategory: 'Ushering',
          status: 'MEMBER',
          createdAt: new Date('2026-01-01'),
        },
      ]);

      mockPrisma.attendanceRecord.findMany
        .mockResolvedValueOnce([{ personId: 'p-1', date: s2Date }])
        .mockResolvedValueOnce([{ personId: 'p-1', date: s2Date }]);

      // In radar scan:
      mockPrisma.followUpTask.findMany
        .mockResolvedValueOnce([]) // radar openTasks query
        .mockResolvedValueOnce([]) // sync existingOpenTasks query
        .mockResolvedValueOnce([]); // sync recentCompletedTasks query

      mockPrisma.followUpTask.create.mockResolvedValue({
        id: 'task-1',
        personId: 'p-1',
        reason: 'MISSED_1_WEEK',
        status: 'PENDING',
      });

      const res = await syncFollowUpTasks({ churchId: 'church-1', refDate: fixedNow });

      expect(res.createdCount).toBe(1);
      expect(res.skippedDuplicate).toBe(0);
      expect(mockPrisma.followUpTask.create).toHaveBeenCalledTimes(1);
      expect(mockPrisma.followUpTask.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            personId: 'p-1',
            reason: 'MISSED_1_WEEK',
            status: 'PENDING',
            assignedTo: 'Ushering Volunteer',
          }),
        })
      );
    });

    it('skips duplicate task creation when an open task with same reason already exists', async () => {
      mockPrisma.church.findFirst.mockResolvedValue({ id: 'church-1', name: 'RCCG Test Zone' });

      mockPrisma.person.findMany.mockResolvedValue([
        {
          id: 'p-1',
          firstName: 'Chidinma',
          lastName: 'Okoro',
          phone: '08031112222',
          phoneLast4: '2222',
          category: 'YOUTH',
          subCategory: 'Ushering',
          status: 'MEMBER',
          createdAt: new Date('2026-01-01'),
        },
      ]);

      mockPrisma.attendanceRecord.findMany
        .mockResolvedValueOnce([{ personId: 'p-1', date: s2Date }])
        .mockResolvedValueOnce([{ personId: 'p-1', date: s2Date }]);

      const existingTask = {
        id: 'task-1',
        personId: 'p-1',
        reason: 'MISSED_1_WEEK',
        status: 'PENDING',
        assignedTo: 'Ushering Volunteer',
        escalatedTo: null,
        dueDate: new Date(fixedNow.getTime() + 48 * 3600 * 1000),
      };

      mockPrisma.followUpTask.findMany
        .mockResolvedValueOnce([existingTask]) // radar openTasks query
        .mockResolvedValueOnce([existingTask]) // sync existingOpenTasks query
        .mockResolvedValueOnce([]); // sync recentCompletedTasks query

      const res = await syncFollowUpTasks({ churchId: 'church-1', refDate: fixedNow });

      expect(res.createdCount).toBe(0);
      expect(res.skippedDuplicate).toBe(1);
      expect(mockPrisma.followUpTask.create).not.toHaveBeenCalled();
    });

    it('upgrades task reason when member progresses from MISSED_1_WEEK to MISSED_2_WEEKS', async () => {
      mockPrisma.church.findFirst.mockResolvedValue({ id: 'church-1', name: 'RCCG Test Zone' });

      const s3Date = new Date('2026-10-25T00:00:00.000Z');
      mockPrisma.person.findMany.mockResolvedValue([
        {
          id: 'p-1',
          firstName: 'Chidinma',
          lastName: 'Okoro',
          phone: '08031112222',
          phoneLast4: '2222',
          category: 'YOUTH',
          subCategory: 'Ushering',
          status: 'MEMBER',
          createdAt: new Date('2026-01-01'),
        },
      ]);

      // Attended S3, missed S1 and S2 -> detected as MISSED_2_WEEKS
      mockPrisma.attendanceRecord.findMany
        .mockResolvedValueOnce([{ personId: 'p-1', date: s3Date }])
        .mockResolvedValueOnce([{ personId: 'p-1', date: s3Date }]);

      // But existing task was for MISSED_1_WEEK
      const existingTask = {
        id: 'task-1',
        personId: 'p-1',
        reason: 'MISSED_1_WEEK',
        status: 'PENDING',
        assignedTo: 'Ushering Volunteer',
        escalatedTo: null,
        dueDate: new Date(fixedNow.getTime() + 24 * 3600 * 1000),
      };

      mockPrisma.followUpTask.findMany
        .mockResolvedValueOnce([existingTask]) // radar openTasks query
        .mockResolvedValueOnce([existingTask]) // sync existingOpenTasks query
        .mockResolvedValueOnce([]); // sync recentCompletedTasks query

      mockPrisma.followUpTask.update.mockResolvedValue({
        ...existingTask,
        reason: 'MISSED_2_WEEKS',
      });

      const res = await syncFollowUpTasks({ churchId: 'church-1', refDate: fixedNow });

      expect(res.updatedCount).toBe(1);
      expect(mockPrisma.followUpTask.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'task-1' },
          data: expect.objectContaining({
            reason: 'MISSED_2_WEEKS',
          }),
        })
      );
    });

    it('respects 144-hour cooldown window for recently contacted members', async () => {
      mockPrisma.church.findFirst.mockResolvedValue({ id: 'church-1', name: 'RCCG Test Zone' });

      mockPrisma.person.findMany.mockResolvedValue([
        {
          id: 'p-1',
          firstName: 'Chidinma',
          lastName: 'Okoro',
          phone: '08031112222',
          phoneLast4: '2222',
          category: 'YOUTH',
          subCategory: null,
          status: 'MEMBER',
          createdAt: new Date('2026-01-01'),
        },
      ]);

      mockPrisma.attendanceRecord.findMany
        .mockResolvedValueOnce([{ personId: 'p-1', date: s2Date }])
        .mockResolvedValueOnce([{ personId: 'p-1', date: s2Date }]);

      // No open tasks, but was contacted 48 hours ago
      mockPrisma.followUpTask.findMany
        .mockResolvedValueOnce([]) // radar
        .mockResolvedValueOnce([]) // existing open
        .mockResolvedValueOnce([
          {
            id: 'old-task',
            personId: 'p-1',
            status: 'CONTACTED',
            contactedAt: new Date(fixedNow.getTime() - 48 * 3600 * 1000),
          },
        ]); // recent completed

      const res = await syncFollowUpTasks({ churchId: 'church-1', refDate: fixedNow });

      expect(res.createdCount).toBe(0);
      expect(res.skippedCooldown).toBe(1);
      expect(mockPrisma.followUpTask.create).not.toHaveBeenCalled();
    });
  });

  describe('3. 48-Hour Auto-Escalation Scanner', () => {
    it('escalates overdue pending tasks to YOUTH_PASTOR and creates audit logs', async () => {
      const now = new Date('2026-11-10T12:00:00Z');
      const overdueDueDate = new Date('2026-11-10T10:00:00Z'); // 2 hours overdue

      const overdueTask = {
        id: 'task-overdue-1',
        personId: 'p-1',
        reason: 'MISSED_2_WEEKS',
        status: 'PENDING',
        dueDate: overdueDueDate,
        escalatedTo: null,
        person: {
          id: 'p-1',
          firstName: 'Segun',
          lastName: 'Banjo',
        },
      };

      mockPrisma.followUpTask.findMany.mockResolvedValue([overdueTask]);
      mockPrisma.followUpTask.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.followUpResult.create.mockResolvedValue({ id: 'res-audit-1' });
      mockPrisma.$transaction.mockResolvedValue([{ id: 'res-audit-1' }]);

      const res = await executeAutoEscalationScan({ now });

      expect(res.escalatedCount).toBe(1);
      expect(res.taskIds).toEqual(['task-overdue-1']);

      // Check updateMany payload
      expect(mockPrisma.followUpTask.updateMany).toHaveBeenCalledWith({
        where: {
          id: { in: ['task-overdue-1'] },
          status: 'PENDING',
        },
        data: {
          status: 'ESCALATED',
          escalatedTo: 'YOUTH_PASTOR',
          assignedTo: 'Youth Pastor (Escalated)',
        },
      });

      // Check transaction creation of audit log
      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
    });

    it('returns 0 escalations when no tasks are overdue', async () => {
      const now = new Date('2026-11-10T12:00:00Z');
      mockPrisma.followUpTask.findMany.mockResolvedValue([]);

      const res = await executeAutoEscalationScan({ now });

      expect(res.escalatedCount).toBe(0);
      expect(res.taskIds).toEqual([]);
      expect(mockPrisma.followUpTask.updateMany).not.toHaveBeenCalled();
    });
  });

  describe('4. Follow-Up Task Completion', () => {
    it('marks FollowUpTask as CONTACTED and logs outcome into FollowUpResult', async () => {
      mockPrisma.followUpTask.findUnique.mockResolvedValue({
        id: 'task-100',
        personId: 'person-55',
        status: 'PENDING',
      });
      mockPrisma.followUpTask.update.mockResolvedValue({
        id: 'task-100',
        status: 'CONTACTED',
      });
      mockPrisma.followUpResult.create.mockResolvedValue({
        id: 'result-999',
      });

      const res = await completeFollowUpTask({
        taskId: 'task-100',
        personId: 'person-55',
        callerName: 'Sis. Funke',
        outcome: 'Prayed With',
        note: 'Prayed for exam victory and health.',
      });

      expect(res.success).toBe(true);
      expect(res.taskId).toBe('task-100');
      expect(res.resultId).toBe('result-999');

      expect(mockPrisma.followUpTask.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'task-100' },
          data: expect.objectContaining({
            status: 'CONTACTED',
          }),
        })
      );

      expect(mockPrisma.followUpResult.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            personId: 'person-55',
            callerName: 'Sis. Funke',
            outcome: 'Prayed With',
            note: 'Prayed for exam victory and health.',
          }),
        })
      );
    });

    it('throws error when task ID is not found', async () => {
      mockPrisma.followUpTask.findUnique.mockResolvedValue(null);

      await expect(
        completeFollowUpTask({
          taskId: 'non-existent',
          callerName: 'Volunteer',
          outcome: 'No Response',
        })
      ).rejects.toThrow('FollowUpTask with ID non-existent not found.');
    });
  });
});
