import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockPrisma } from '../helpers/prisma-mock';

vi.mock('@/lib/prisma', () => ({
  prisma: mockPrisma,
}));

import {
  getTargetSundayDates,
  mapReasonToTemplateCategory,
  detectAbsenteeMembers,
} from '@/lib/absence-radar';

describe('Absence Detection Radar Unit Tests (Milestone 3 / Requirement R2)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('1. Timezone-Aware Target Sunday Calculations (Africa/Lagos WAT UTC+1)', () => {
    it('calculates S1 as today when today is Sunday AFTER 13:00 WAT', () => {
      // 2026-11-08 is a Sunday. 14:30 WAT = 13:30 UTC
      const sundayAfternoon = new Date('2026-11-08T13:30:00Z');
      const target = getTargetSundayDates(sundayAfternoon);

      expect(target.isTodaySunday).toBe(true);
      expect(target.nigerianHour).toBe(14);
      // S1 should be 2026-11-08 UTC midnight
      expect(target.s1Date.toISOString()).toBe('2026-11-08T00:00:00.000Z');
      // S2 should be 2026-11-01 UTC midnight
      expect(target.s2Date.toISOString()).toBe('2026-11-01T00:00:00.000Z');
      // S3 should be 2026-10-25 UTC midnight
      expect(target.s3Date.toISOString()).toBe('2026-10-25T00:00:00.000Z');
    });

    it('calculates S1 as last Sunday when today is Sunday BEFORE 13:00 WAT', () => {
      // 2026-11-08 is a Sunday. 09:30 WAT = 08:30 UTC
      const sundayMorning = new Date('2026-11-08T08:30:00Z');
      const target = getTargetSundayDates(sundayMorning);

      expect(target.isTodaySunday).toBe(true);
      expect(target.nigerianHour).toBe(9);
      // Since service hasn't finished yet, S1 should be the previous completed Sunday (2026-11-01)
      expect(target.s1Date.toISOString()).toBe('2026-11-01T00:00:00.000Z');
      expect(target.s2Date.toISOString()).toBe('2026-10-25T00:00:00.000Z');
      expect(target.s3Date.toISOString()).toBe('2026-10-18T00:00:00.000Z');
    });

    it('calculates S1 as the most recent Sunday when called on Monday', () => {
      // 2026-11-09 is Monday. 10:00 WAT
      const monday = new Date('2026-11-09T09:00:00Z');
      const target = getTargetSundayDates(monday);

      expect(target.isTodaySunday).toBe(false);
      expect(target.s1Date.toISOString()).toBe('2026-11-08T00:00:00.000Z');
      expect(target.s2Date.toISOString()).toBe('2026-11-01T00:00:00.000Z');
      expect(target.s3Date.toISOString()).toBe('2026-10-25T00:00:00.000Z');
    });

    it('calculates S1 correctly across month boundaries (e.g. Wednesday Nov 4)', () => {
      // 2026-11-04 is Wednesday. S1 was 2026-11-01 (Sunday), S2 was 2026-10-25
      const wednesday = new Date('2026-11-04T12:00:00Z');
      const target = getTargetSundayDates(wednesday);

      expect(target.s1Date.toISOString()).toBe('2026-11-01T00:00:00.000Z');
      expect(target.s2Date.toISOString()).toBe('2026-10-25T00:00:00.000Z');
      expect(target.s3Date.toISOString()).toBe('2026-10-18T00:00:00.000Z');
    });

    it('formats formatted dates cleanly in UTC without day shifts', () => {
      const date = new Date('2026-11-10T14:00:00Z'); // Tuesday
      const target = getTargetSundayDates(date);

      expect(target.s1Formatted).toBe('8 Nov 2026');
      expect(target.s2Formatted).toBe('1 Nov 2026');
      expect(target.s3Formatted).toBe('25 Oct 2026');
    });
  });

  describe('2. Reason to Template Category Mapping', () => {
    it('maps all AbsenceReasons to matching deterministic template categories', () => {
      expect(mapReasonToTemplateCategory('FIRST_TIMER')).toBe('FIRST_TIMER_72H');
      expect(mapReasonToTemplateCategory('MISSED_1_WEEK')).toBe('MISSED_1_WEEK');
      expect(mapReasonToTemplateCategory('MISSED_2_WEEKS')).toBe('MISSED_2_WEEKS');
      expect(mapReasonToTemplateCategory('DORMANT_CRITICAL')).toBe('DORMANT_CRITICAL');
    });
  });

  describe('3. Batch Absence Detection Algorithm & Zero N+1 Queries', () => {
    const fixedNow = new Date('2026-11-10T12:00:00Z'); // Tuesday Nov 10, 2026
    const s1 = new Date('2026-11-08T00:00:00.000Z');
    const s2 = new Date('2026-11-01T00:00:00.000Z');
    const s3 = new Date('2026-10-25T00:00:00.000Z');

    it('classifies missed 1 week: attended S2, missed S1', async () => {
      mockPrisma.church.findFirst.mockResolvedValue({ id: 'church-1', name: 'RCCG Test Zone' });

      // Member 1: Attended S2, missed S1
      const person1 = {
        id: 'p-1',
        firstName: 'Tolu',
        lastName: 'Ade',
        phone: '08031234567',
        phoneLast4: '4567',
        category: 'YOUTH',
        subCategory: 'Choir',
        status: 'MEMBER',
        createdAt: new Date('2026-01-01'),
      };

      mockPrisma.person.findMany.mockResolvedValue([person1]);
      // S1, S2, S3 records: Only attended S2
      mockPrisma.attendanceRecord.findMany
        .mockResolvedValueOnce([
          { personId: 'p-1', date: s2 },
        ])
        // 60-day seek:
        .mockResolvedValueOnce([
          { personId: 'p-1', date: s2 },
        ]);
      mockPrisma.followUpTask.findMany.mockResolvedValue([]);

      const result = await detectAbsenteeMembers({ churchId: 'church-1', refDate: fixedNow });

      expect(result.missed1Week).toHaveLength(1);
      expect(result.missed1Week[0].personId).toBe('p-1');
      expect(result.missed1Week[0].reason).toBe('MISSED_1_WEEK');
      expect(result.missed1Week[0].daysAbsent).toBe(7);
      expect(result.missed1Week[0].aiDraftNote).toContain('Tolu');
      expect(result.missed1Week[0].waMeUrl).toContain('https://wa.me/2348031234567');
      expect(result.missed2Weeks).toHaveLength(0);
      expect(result.firstTimers72h).toHaveLength(0);
    });

    it('classifies missed 2 consecutive weeks: attended S3, missed S1 and S2', async () => {
      mockPrisma.church.findFirst.mockResolvedValue({ id: 'church-1', name: 'RCCG Test Zone' });

      const person2 = {
        id: 'p-2',
        firstName: 'Emeka',
        lastName: 'Okafor',
        phone: '08123456789',
        phoneLast4: '6789',
        category: 'YOUTH',
        subCategory: 'Media',
        status: 'MEMBER',
        createdAt: new Date('2026-01-01'),
      };

      mockPrisma.person.findMany.mockResolvedValue([person2]);
      // Attendance query 1 (target sundays): attended S3
      mockPrisma.attendanceRecord.findMany
        .mockResolvedValueOnce([
          { personId: 'p-2', date: s3 },
        ])
        // Attendance query 2 (60 days):
        .mockResolvedValueOnce([
          { personId: 'p-2', date: s3 },
        ]);
      mockPrisma.followUpTask.findMany.mockResolvedValue([]);

      const result = await detectAbsenteeMembers({ churchId: 'church-1', refDate: fixedNow });

      expect(result.missed2Weeks).toHaveLength(1);
      expect(result.missed2Weeks[0].personId).toBe('p-2');
      expect(result.missed2Weeks[0].reason).toBe('MISSED_2_WEEKS');
      expect(result.missed2Weeks[0].daysAbsent).toBe(14);
      expect(result.missed1Week).toHaveLength(0);
    });

    it('classifies first-timers within 72-hour high-touch care window', async () => {
      mockPrisma.church.findFirst.mockResolvedValue({ id: 'church-1', name: 'RCCG Test Zone' });

      // Created 24 hours ago
      const createdAt = new Date(fixedNow.getTime() - 24 * 3600 * 1000);
      const firstTimer = {
        id: 'ft-1',
        firstName: 'Blessing',
        lastName: 'Joshua',
        phone: '09012345678',
        phoneLast4: '5678',
        category: 'YOUTH',
        subCategory: null,
        status: 'FIRST_TIMER',
        createdAt,
      };

      mockPrisma.person.findMany.mockResolvedValue([firstTimer]);
      mockPrisma.attendanceRecord.findMany
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);
      mockPrisma.followUpTask.findMany.mockResolvedValue([]);

      const result = await detectAbsenteeMembers({ churchId: 'church-1', refDate: fixedNow });

      expect(result.firstTimers72h).toHaveLength(1);
      expect(result.firstTimers72h[0].personId).toBe('ft-1');
      expect(result.firstTimers72h[0].reason).toBe('FIRST_TIMER');
      expect(result.firstTimers72h[0].aiDraftNote).toBeDefined();
    });

    it('excludes unonboarded members with 0 attendance history from false absence alerts', async () => {
      mockPrisma.church.findFirst.mockResolvedValue({ id: 'church-1', name: 'RCCG Test Zone' });

      // Registered months ago, never attended once
      const unonboarded = {
        id: 'p-unonboarded',
        firstName: 'Ghost',
        lastName: 'Member',
        phone: '08099999999',
        phoneLast4: '9999',
        category: 'ADULT',
        subCategory: null,
        status: 'MEMBER',
        createdAt: new Date('2025-01-01'),
      };

      mockPrisma.person.findMany.mockResolvedValue([unonboarded]);
      // Zero attendance records returned
      mockPrisma.attendanceRecord.findMany
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);
      mockPrisma.followUpTask.findMany.mockResolvedValue([]);

      const result = await detectAbsenteeMembers({ churchId: 'church-1', refDate: fixedNow });

      expect(result.missed1Week).toHaveLength(0);
      expect(result.missed2Weeks).toHaveLength(0);
      expect(result.firstTimers72h).toHaveLength(0);
      expect(result.dormantCritical).toHaveLength(0);
      expect(result.stats.totalAbsentees).toBe(0);
    });

    it('guarantees exactly 4 database queries regardless of member count (Zero N+1)', async () => {
      mockPrisma.church.findFirst.mockResolvedValue({ id: 'church-1', name: 'RCCG Test Zone' });

      // Mock 50 members
      const manyMembers = Array.from({ length: 50 }, (_, i) => ({
        id: `p-${i}`,
        firstName: `User${i}`,
        lastName: `Last${i}`,
        phone: `080300000${String(i).padStart(2, '0')}`,
        phoneLast4: String(i).padStart(4, '0'),
        category: 'YOUTH',
        subCategory: null,
        status: 'MEMBER',
        createdAt: new Date('2026-01-01'),
      }));

      mockPrisma.person.findMany.mockResolvedValue(manyMembers);
      mockPrisma.attendanceRecord.findMany
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);
      mockPrisma.followUpTask.findMany.mockResolvedValue([]);

      await detectAbsenteeMembers({ churchId: 'church-1', refDate: fixedNow });

      // Check query counts: exactly 1 person.findMany, 2 attendanceRecord.findMany, 1 followUpTask.findMany
      expect(mockPrisma.person.findMany).toHaveBeenCalledTimes(1);
      expect(mockPrisma.attendanceRecord.findMany).toHaveBeenCalledTimes(2);
      expect(mockPrisma.followUpTask.findMany).toHaveBeenCalledTimes(1);
    });
  });
});
