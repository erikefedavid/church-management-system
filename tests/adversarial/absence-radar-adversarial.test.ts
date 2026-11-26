/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockPrisma } from '../helpers/prisma-mock';

vi.mock('@/lib/prisma', () => ({
  prisma: mockPrisma,
}));

import {
  getTargetSundayDates,
  mapReasonToTemplateCategory,
  detectAbsenteeMembers,
  AbsenceReason,
} from '@/lib/absence-radar';

describe('Milestone 3 Adversarial Stress Suite: Absence Detection Radar & Date Arithmetic', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // =========================================================================
  // 1. Timezone-Aware Target Sunday Calculations (Africa/Lagos WAT UTC+1)
  // =========================================================================
  describe('1. Timezone & Sunday Target Date Arithmetic Stress Testing', () => {
    describe('1.1 Millisecond Cutoff Stress at 13:00 WAT on Sunday', () => {
      // In UTC+1 (Africa/Lagos):
      // 12:59:59.000 WAT = 11:59:59.000 UTC
      // 12:59:59.999 WAT = 11:59:59.999 UTC
      // 13:00:00.000 WAT = 12:00:00.000 UTC
      // 13:00:00.001 WAT = 12:00:00.001 UTC

      it('Sunday 12:59:59.000 WAT: Service not finished -> S1 is last week Sunday', () => {
        const sundayPreCutoff = new Date('2026-11-08T11:59:59.000Z');
        const target = getTargetSundayDates(sundayPreCutoff);

        expect(target.isTodaySunday).toBe(true);
        expect(target.nigerianHour).toBe(12);
        // S1 must be the previous Sunday (2026-11-01)
        expect(target.s1Date.toISOString()).toBe('2026-11-01T00:00:00.000Z');
        expect(target.s2Date.toISOString()).toBe('2026-10-25T00:00:00.000Z');
        expect(target.s3Date.toISOString()).toBe('2026-10-18T00:00:00.000Z');
      });

      it('Sunday 12:59:59.999 WAT: Exact millisecond before 13:00 -> S1 is last week Sunday', () => {
        const sundayBoundaryPre = new Date('2026-11-08T11:59:59.999Z');
        const target = getTargetSundayDates(sundayBoundaryPre);

        expect(target.isTodaySunday).toBe(true);
        expect(target.nigerianHour).toBe(12);
        expect(target.s1Date.toISOString()).toBe('2026-11-01T00:00:00.000Z');
      });

      it('Sunday 13:00:00.000 WAT: Exactly at cutoff -> S1 is today', () => {
        const sundayExactCutoff = new Date('2026-11-08T12:00:00.000Z');
        const target = getTargetSundayDates(sundayExactCutoff);

        expect(target.isTodaySunday).toBe(true);
        expect(target.nigerianHour).toBe(13);
        // S1 is today (2026-11-08)
        expect(target.s1Date.toISOString()).toBe('2026-11-08T00:00:00.000Z');
        expect(target.s2Date.toISOString()).toBe('2026-11-01T00:00:00.000Z');
        expect(target.s3Date.toISOString()).toBe('2026-10-25T00:00:00.000Z');
      });

      it('Sunday 13:00:00.001 WAT: 1ms past cutoff -> S1 is today', () => {
        const sundayPostCutoff = new Date('2026-11-08T12:00:00.001Z');
        const target = getTargetSundayDates(sundayPostCutoff);

        expect(target.isTodaySunday).toBe(true);
        expect(target.nigerianHour).toBe(13);
        expect(target.s1Date.toISOString()).toBe('2026-11-08T00:00:00.000Z');
      });

      it('Sunday 00:00:00 WAT (Midnight start of Sunday): S1 is last week Sunday', () => {
        // 00:00:00 WAT on 2026-11-08 is 2026-11-07T23:00:00.000Z
        const sundayMidnight = new Date('2026-11-07T23:00:00.000Z');
        const target = getTargetSundayDates(sundayMidnight);

        expect(target.isTodaySunday).toBe(true);
        expect(target.nigerianHour).toBe(0);
        expect(target.s1Date.toISOString()).toBe('2026-11-01T00:00:00.000Z');
      });

      it('Sunday 23:59:59 WAT (End of Sunday): S1 is today', () => {
        // 23:59:59 WAT on 2026-11-08 is 2026-11-08T22:59:59.000Z
        const sundayLateNight = new Date('2026-11-08T22:59:59.000Z');
        const target = getTargetSundayDates(sundayLateNight);

        expect(target.isTodaySunday).toBe(true);
        expect(target.nigerianHour).toBe(23);
        expect(target.s1Date.toISOString()).toBe('2026-11-08T00:00:00.000Z');
      });
    });

    describe('1.2 Weekday Drift Invariance across Months', () => {
      // 2026-11-08 was Sunday. Testing all 6 days of the subsequent week:
      const weekTests = [
        { name: 'Monday', utcStr: '2026-11-09T08:00:00Z', expectedS1: '2026-11-08' },
        { name: 'Tuesday', utcStr: '2026-11-10T14:30:00Z', expectedS1: '2026-11-08' },
        { name: 'Wednesday', utcStr: '2026-11-11T18:00:00Z', expectedS1: '2026-11-08' },
        { name: 'Thursday', utcStr: '2026-11-12T07:15:00Z', expectedS1: '2026-11-08' },
        { name: 'Friday', utcStr: '2026-11-13T21:00:00Z', expectedS1: '2026-11-08' },
        { name: 'Saturday', utcStr: '2026-11-14T20:00:00Z', expectedS1: '2026-11-08' }, // 21:00 WAT on Saturday
      ];

      for (const t of weekTests) {
        it(`correctly anchors S1 to ${t.expectedS1} when invoked on ${t.name}`, () => {
          const target = getTargetSundayDates(new Date(t.utcStr));
          expect(target.isTodaySunday).toBe(false);
          expect(target.s1Date.toISOString()).toBe(`${t.expectedS1}T00:00:00.000Z`);
        });
      }

      it('Saturday 23:59 UTC has already rolled over into Sunday (00:59 WAT UTC+1): isTodaySunday is true, S1 is still 2026-11-08', () => {
        // In UTC+1, 23:59 on Saturday UTC is 00:59 on Sunday in Lagos!
        const satLateUtc = new Date('2026-11-14T23:59:00Z');
        const target = getTargetSundayDates(satLateUtc);
        expect(target.isTodaySunday).toBe(true);
        expect(target.nigerianHour).toBe(0);
        // Before 13:00 WAT -> S1 is last week Sunday (2026-11-08)
        expect(target.s1Date.toISOString()).toBe('2026-11-08T00:00:00.000Z');
      });

      it('anchors S1 correctly across mid-year months (April, July, October)', () => {
        // Wednesday April 15, 2026 -> S1 is Sunday April 12, 2026
        const aprWed = new Date('2026-04-15T10:00:00Z');
        expect(getTargetSundayDates(aprWed).s1Date.toISOString()).toBe('2026-04-12T00:00:00.000Z');

        // Friday July 24, 2026 -> S1 is Sunday July 19, 2026
        const julFri = new Date('2026-07-24T16:00:00Z');
        expect(getTargetSundayDates(julFri).s1Date.toISOString()).toBe('2026-07-19T00:00:00.000Z');

        // Saturday October 31, 2026 -> S1 is Sunday October 25, 2026
        const octSat = new Date('2026-10-31T20:00:00Z');
        expect(getTargetSundayDates(octSat).s1Date.toISOString()).toBe('2026-10-25T00:00:00.000Z');
      });
    });

    describe('1.3 Leap Year Boundaries (Feb 28, Feb 29, March 1)', () => {
      it('handles Leap Day Feb 29, 2024 (Thursday): S1 is Feb 25, 2024', () => {
        // 2024-02-29 was a Thursday. Previous Sunday was Feb 25, 2024.
        const leapThursday = new Date('2024-02-29T12:00:00Z');
        const target = getTargetSundayDates(leapThursday);

        expect(target.s1Date.toISOString()).toBe('2024-02-25T00:00:00.000Z');
        expect(target.s2Date.toISOString()).toBe('2024-02-18T00:00:00.000Z');
        expect(target.s3Date.toISOString()).toBe('2024-02-11T00:00:00.000Z');
      });

      it('handles Friday March 1, 2024 (immediately after Leap Day): rolls back through Feb 29', () => {
        // 2024-03-01 is Friday. Days back to Sunday is 5 days.
        // March 1 - 5 days = Feb 25, 2024 (since Feb 2024 had 29 days!)
        const postLeapFriday = new Date('2024-03-01T10:00:00Z');
        const target = getTargetSundayDates(postLeapFriday);

        expect(target.s1Date.toISOString()).toBe('2024-02-25T00:00:00.000Z');
        expect(target.s2Date.toISOString()).toBe('2024-02-18T00:00:00.000Z');
      });

      it('handles Non-Leap Year: Wednesday March 1, 2023 rolls back through Feb 28', () => {
        // 2023-03-01 was Wednesday. Days back to Sunday is 3 days.
        // March 1 - 3 days = Feb 26, 2023 (since Feb 2023 had 28 days!)
        const nonLeapWed = new Date('2023-03-01T10:00:00Z');
        const target = getTargetSundayDates(nonLeapWed);

        expect(target.s1Date.toISOString()).toBe('2023-02-26T00:00:00.000Z');
        expect(target.s2Date.toISOString()).toBe('2023-02-19T00:00:00.000Z');
        expect(target.s3Date.toISOString()).toBe('2023-02-12T00:00:00.000Z');
      });

      it('handles Leap Day Feb 29, 2028 (Tuesday): S1 is Feb 27, 2028', () => {
        // 2028-02-29 was Tuesday. S1 is Sunday Feb 27, 2028.
        const leap2028 = new Date('2028-02-29T14:00:00Z');
        const target = getTargetSundayDates(leap2028);

        expect(target.s1Date.toISOString()).toBe('2028-02-27T00:00:00.000Z');
        expect(target.s2Date.toISOString()).toBe('2028-02-20T00:00:00.000Z');
      });
    });

    describe('1.4 Year Roll-Over Boundaries (Dec 31 -> Jan 1)', () => {
      it('Wednesday Dec 31, 2025 at 23:59:59 WAT: S1 is Sunday Dec 28, 2025', () => {
        // Dec 31, 2025 is Wednesday.
        const newYearsEve = new Date('2025-12-31T22:59:59.000Z'); // 23:59:59 WAT
        const target = getTargetSundayDates(newYearsEve);

        expect(target.s1Date.toISOString()).toBe('2025-12-28T00:00:00.000Z');
        expect(target.s2Date.toISOString()).toBe('2025-12-21T00:00:00.000Z');
        expect(target.s3Date.toISOString()).toBe('2025-12-14T00:00:00.000Z');
      });

      it('Thursday Jan 1, 2026 at 00:00:01 WAT: S1 still rolls back into previous year (Dec 28, 2025)', () => {
        // Jan 1, 2026 is Thursday. Days back = 4.
        // Jan 1 minus 4 days = Dec 28, 2025!
        const newYearsDay = new Date('2025-12-31T23:00:01.000Z'); // 00:00:01 WAT on Jan 1
        const target = getTargetSundayDates(newYearsDay);

        expect(target.s1Date.toISOString()).toBe('2025-12-28T00:00:00.000Z');
        expect(target.s2Date.toISOString()).toBe('2025-12-21T00:00:00.000Z');
        expect(target.s3Date.toISOString()).toBe('2025-12-14T00:00:00.000Z');
      });

      it('Sunday Jan 4, 2026 before 13:00 WAT vs after 13:00 WAT', () => {
        // 2026-01-04 is the first Sunday of 2026.
        // Morning (09:00 WAT): S1 is Dec 28, 2025
        const morning = new Date('2026-01-04T08:00:00Z');
        const targetMorning = getTargetSundayDates(morning);
        expect(targetMorning.s1Date.toISOString()).toBe('2025-12-28T00:00:00.000Z');

        // Afternoon (14:00 WAT): S1 is Jan 4, 2026; S2 is Dec 28, 2025
        const afternoon = new Date('2026-01-04T13:00:00Z');
        const targetAfternoon = getTargetSundayDates(afternoon);
        expect(targetAfternoon.s1Date.toISOString()).toBe('2026-01-04T00:00:00.000Z');
        expect(targetAfternoon.s2Date.toISOString()).toBe('2025-12-28T00:00:00.000Z');
        expect(targetAfternoon.s3Date.toISOString()).toBe('2025-12-21T00:00:00.000Z');
      });
    });

    describe('1.5 Strict UTC Midnight & 7-Day Invariance', () => {
      it('guarantees S1, S2, and S3 are spaced by exactly 604,800,000 milliseconds (7 days)', () => {
        const arbitraryDates = [
          new Date('2026-01-01T00:00:00Z'),
          new Date('2026-02-28T23:59:59Z'),
          new Date('2026-06-15T12:00:00Z'),
          new Date('2026-11-08T13:00:00Z'),
          new Date('2026-12-31T23:59:59Z'),
        ];

        const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

        for (const date of arbitraryDates) {
          const target = getTargetSundayDates(date);
          const diff1to2 = target.s1Date.getTime() - target.s2Date.getTime();
          const diff2to3 = target.s2Date.getTime() - target.s3Date.getTime();

          expect(diff1to2).toBe(SEVEN_DAYS_MS);
          expect(diff2to3).toBe(SEVEN_DAYS_MS);

          // All dates must have UTC 00:00:00.000
          expect(target.s1Date.getUTCHours()).toBe(0);
          expect(target.s1Date.getUTCMinutes()).toBe(0);
          expect(target.s1Date.getUTCSeconds()).toBe(0);
          expect(target.s1Date.getUTCMilliseconds()).toBe(0);

          expect(target.s2Date.getUTCHours()).toBe(0);
          expect(target.s3Date.getUTCHours()).toBe(0);
        }
      });
    });
  });

  // =========================================================================
  // 2. Member Classification Logic Stress Testing
  // =========================================================================
  describe('2. Member Classification Edge Cases & Isolation Stress Testing', () => {
    const fixedNow = new Date('2026-11-10T12:00:00Z'); // Tuesday Nov 10, 2026
    const s1 = new Date('2026-11-08T00:00:00.000Z');
    const s2 = new Date('2026-11-01T00:00:00.000Z');
    const s3 = new Date('2026-10-25T00:00:00.000Z');

    describe('2.1 Zero Lifetime Attendance Members', () => {
      it('excludes unonboarded member registered months ago with 0 attendance from absence spam', async () => {
        mockPrisma.church.findFirst.mockResolvedValue({ id: 'church-1', name: 'RCCG Test' });

        const ghostMember = {
          id: 'ghost-1',
          firstName: 'Ghost',
          lastName: 'User',
          phone: '08011112222',
          phoneLast4: '2222',
          category: 'ADULT',
          subCategory: null,
          status: 'MEMBER',
          createdAt: new Date('2025-06-01T00:00:00Z'),
        };

        mockPrisma.person.findMany.mockResolvedValue([ghostMember]);
        mockPrisma.attendanceRecord.findMany
          .mockResolvedValueOnce([]) // No S1, S2, S3
          .mockResolvedValueOnce([]); // No 60-day attendance
        mockPrisma.followUpTask.findMany.mockResolvedValue([]);

        const result = await detectAbsenteeMembers({ churchId: 'church-1', refDate: fixedNow });

        expect(result.missed1Week).toHaveLength(0);
        expect(result.missed2Weeks).toHaveLength(0);
        expect(result.dormantCritical).toHaveLength(0);
        expect(result.firstTimers72h).toHaveLength(0);
        expect(result.stats.totalAbsentees).toBe(0);
      });

      it('classifies first-timer created 48h ago with 0 attendance into firstTimers72h', async () => {
        mockPrisma.church.findFirst.mockResolvedValue({ id: 'church-1', name: 'RCCG Test' });

        const ftMember = {
          id: 'ft-new',
          firstName: 'Amaka',
          lastName: 'Chukwu',
          phone: '08098765432',
          phoneLast4: '5432',
          category: 'YOUTH',
          subCategory: null,
          status: 'FIRST_TIMER',
          createdAt: new Date(fixedNow.getTime() - 48 * 3600 * 1000), // 48h ago
        };

        mockPrisma.person.findMany.mockResolvedValue([ftMember]);
        mockPrisma.attendanceRecord.findMany
          .mockResolvedValueOnce([])
          .mockResolvedValueOnce([]);
        mockPrisma.followUpTask.findMany.mockResolvedValue([]);

        const result = await detectAbsenteeMembers({ churchId: 'church-1', refDate: fixedNow });

        expect(result.firstTimers72h).toHaveLength(1);
        expect(result.firstTimers72h[0].personId).toBe('ft-new');
        expect(result.firstTimers72h[0].reason).toBe('FIRST_TIMER');
        expect(result.firstTimers72h[0].daysAbsent).toBe(2);
      });

      it('excludes first-timer registered 73 hours ago with 0 attendance (care window elapsed)', async () => {
        mockPrisma.church.findFirst.mockResolvedValue({ id: 'church-1', name: 'RCCG Test' });

        const ftExpired = {
          id: 'ft-expired',
          firstName: 'Old',
          lastName: 'FirstTimer',
          phone: '08098765433',
          phoneLast4: '5433',
          category: 'YOUTH',
          subCategory: null,
          status: 'FIRST_TIMER',
          createdAt: new Date(fixedNow.getTime() - 73 * 3600 * 1000), // 73h ago
        };

        mockPrisma.person.findMany.mockResolvedValue([ftExpired]);
        mockPrisma.attendanceRecord.findMany
          .mockResolvedValueOnce([])
          .mockResolvedValueOnce([]);
        mockPrisma.followUpTask.findMany.mockResolvedValue([]);

        const result = await detectAbsenteeMembers({ churchId: 'church-1', refDate: fixedNow });

        expect(result.firstTimers72h).toHaveLength(0);
        expect(result.stats.totalAbsentees).toBe(0);
      });

      it('classifies newly registered MEMBER created between S2 and S1 who missed S1 as MISSED_1_WEEK', async () => {
        mockPrisma.church.findFirst.mockResolvedValue({ id: 'church-1', name: 'RCCG Test' });

        // Created Nov 4 (between S2=Nov 1 and S1=Nov 8)
        const newMember = {
          id: 'p-new-joiner',
          firstName: 'David',
          lastName: 'Ojo',
          phone: '08055554444',
          phoneLast4: '4444',
          category: 'YOUTH',
          subCategory: null,
          status: 'MEMBER',
          createdAt: new Date('2026-11-04T10:00:00Z'),
        };

        mockPrisma.person.findMany.mockResolvedValue([newMember]);
        mockPrisma.attendanceRecord.findMany
          .mockResolvedValueOnce([]) // Missed S1
          .mockResolvedValueOnce([]);
        mockPrisma.followUpTask.findMany.mockResolvedValue([]);

        const result = await detectAbsenteeMembers({ churchId: 'church-1', refDate: fixedNow });

        expect(result.missed1Week).toHaveLength(1);
        expect(result.missed1Week[0].personId).toBe('p-new-joiner');
        expect(result.missed1Week[0].reason).toBe('MISSED_1_WEEK');
        expect(result.missed1Week[0].daysAbsent).toBe(7);
      });
    });

    describe('2.2 Archived / Inactive Members (isActive: false) Exclusion', () => {
      it('never queries or classifies inactive members into absence queues', async () => {
        mockPrisma.church.findFirst.mockResolvedValue({ id: 'church-1', name: 'RCCG Test' });

        mockPrisma.person.findMany.mockResolvedValue([]); // prisma filters isActive: true
        mockPrisma.attendanceRecord.findMany
          .mockResolvedValueOnce([])
          .mockResolvedValueOnce([]);
        mockPrisma.followUpTask.findMany.mockResolvedValue([]);

        await detectAbsenteeMembers({ churchId: 'church-1', refDate: fixedNow });

        // Verify prisma query explicitly mandated isActive: true
        expect(mockPrisma.person.findMany).toHaveBeenCalledWith(
          expect.objectContaining({
            where: expect.objectContaining({
              churchId: 'church-1',
              isActive: true,
            }),
          })
        );
      });

      it('does not leak inactive person into escalatedToPastor even if an overdue ESCALATED task exists', async () => {
        mockPrisma.church.findFirst.mockResolvedValue({ id: 'church-1', name: 'RCCG Test' });

        // Active members list does NOT contain 'inactive-p'
        mockPrisma.person.findMany.mockResolvedValue([]);
        mockPrisma.attendanceRecord.findMany
          .mockResolvedValueOnce([])
          .mockResolvedValueOnce([]);

        // An orphaned/historical task exists for an inactive person
        mockPrisma.followUpTask.findMany.mockResolvedValue([
          {
            id: 'task-inactive',
            personId: 'inactive-p',
            reason: 'MISSED_2_WEEKS',
            status: 'ESCALATED',
            assignedTo: 'Youth Pastor',
            escalatedTo: 'YOUTH_PASTOR',
            dueDate: new Date('2026-11-01'),
          },
        ]);

        const result = await detectAbsenteeMembers({ churchId: 'church-1', refDate: fixedNow });

        // Because 'inactive-p' is not in activePeople, they must NOT be leaked into escalatedToPastor
        expect(result.escalatedToPastor).toHaveLength(0);
      });
    });

    describe('2.3 Category & SubCategory Filtering and Template Context', () => {
      it('correctly processes and propagates Adults, Youths, Children, and Workers', async () => {
        mockPrisma.church.findFirst.mockResolvedValue({ id: 'church-1', name: 'RCCG Test' });

        const categories = [
          { id: 'cat-adult', firstName: 'Bisi', lastName: 'Akande', category: 'ADULT', subCategory: 'Choir' },
          { id: 'cat-youth', firstName: 'Kemi', lastName: 'Bello', category: 'YOUTH', subCategory: 'Media' },
          { id: 'cat-child', firstName: 'Junior', lastName: 'Eze', category: 'CHILDREN', subCategory: null },
          { id: 'cat-worker', firstName: 'Pastor', lastName: 'Ade', category: 'WORKER', subCategory: 'Protocol' },
        ];

        const members = categories.map((c) => ({
          ...c,
          phone: '08012345678',
          phoneLast4: '5678',
          status: 'MEMBER',
          createdAt: new Date('2026-01-01'),
        }));

        mockPrisma.person.findMany.mockResolvedValue(members);
        // All of them attended S2, missed S1
        mockPrisma.attendanceRecord.findMany
          .mockResolvedValueOnce(categories.map((c) => ({ personId: c.id, date: s2 })))
          .mockResolvedValueOnce(categories.map((c) => ({ personId: c.id, date: s2 })));
        mockPrisma.followUpTask.findMany.mockResolvedValue([]);

        const result = await detectAbsenteeMembers({ churchId: 'church-1', refDate: fixedNow });

        expect(result.missed1Week).toHaveLength(4);

        const adultItem = result.missed1Week.find((m) => m.personId === 'cat-adult');
        expect(adultItem?.category).toBe('ADULT');
        expect(adultItem?.subCategory).toBe('Choir');
        expect(adultItem?.aiDraftNote).toBeDefined();

        const youthItem = result.missed1Week.find((m) => m.personId === 'cat-youth');
        expect(youthItem?.category).toBe('YOUTH');
        expect(youthItem?.subCategory).toBe('Media');

        const childItem = result.missed1Week.find((m) => m.personId === 'cat-child');
        expect(childItem?.category).toBe('CHILDREN');
        expect(childItem?.subCategory).toBeNull();
      });
    });

    describe('2.4 Rapid Attendance History Patterns', () => {
      it('member attended 10 consecutive weeks and attended S1: NOT absent', async () => {
        mockPrisma.church.findFirst.mockResolvedValue({ id: 'church-1', name: 'RCCG Test' });

        const faithfulMember = {
          id: 'p-faithful',
          firstName: 'Faithful',
          lastName: 'Servant',
          phone: '08022223333',
          phoneLast4: '3333',
          category: 'YOUTH',
          subCategory: 'Choir',
          status: 'MEMBER',
          createdAt: new Date('2025-01-01'),
        };

        mockPrisma.person.findMany.mockResolvedValue([faithfulMember]);
        // Attended S1, S2, S3
        mockPrisma.attendanceRecord.findMany
          .mockResolvedValueOnce([
            { personId: 'p-faithful', date: s1 },
            { personId: 'p-faithful', date: s2 },
            { personId: 'p-faithful', date: s3 },
          ])
          .mockResolvedValueOnce([
            { personId: 'p-faithful', date: s1 },
          ]);
        mockPrisma.followUpTask.findMany.mockResolvedValue([]);

        const result = await detectAbsenteeMembers({ churchId: 'church-1', refDate: fixedNow });

        expect(result.stats.totalAbsentees).toBe(0);
        expect(result.missed1Week).toHaveLength(0);
        expect(result.missed2Weeks).toHaveLength(0);
      });

      it('member attended S1 but missed S2: NOT absent (present on latest Sunday)', async () => {
        mockPrisma.church.findFirst.mockResolvedValue({ id: 'church-1', name: 'RCCG Test' });

        const memberPresentLatest = {
          id: 'p-present',
          firstName: 'Late',
          lastName: 'Returner',
          phone: '08044445555',
          phoneLast4: '5555',
          category: 'YOUTH',
          subCategory: null,
          status: 'MEMBER',
          createdAt: new Date('2025-01-01'),
        };

        mockPrisma.person.findMany.mockResolvedValue([memberPresentLatest]);
        // Attended S1, did not attend S2
        mockPrisma.attendanceRecord.findMany
          .mockResolvedValueOnce([{ personId: 'p-present', date: s1 }])
          .mockResolvedValueOnce([{ personId: 'p-present', date: s1 }]);
        mockPrisma.followUpTask.findMany.mockResolvedValue([]);

        const result = await detectAbsenteeMembers({ churchId: 'church-1', refDate: fixedNow });

        expect(result.stats.totalAbsentees).toBe(0);
      });

      it('member attended only S3 (1 total attendance ever), missed S1 and S2: classified as MISSED_2_WEEKS', async () => {
        mockPrisma.church.findFirst.mockResolvedValue({ id: 'church-1', name: 'RCCG Test' });

        const memberS3Only = {
          id: 'p-s3',
          firstName: 'S3',
          lastName: 'Only',
          phone: '08066667777',
          phoneLast4: '7777',
          category: 'YOUTH',
          subCategory: null,
          status: 'MEMBER',
          createdAt: new Date('2025-01-01'),
        };

        mockPrisma.person.findMany.mockResolvedValue([memberS3Only]);
        mockPrisma.attendanceRecord.findMany
          .mockResolvedValueOnce([{ personId: 'p-s3', date: s3 }])
          .mockResolvedValueOnce([{ personId: 'p-s3', date: s3 }]);
        mockPrisma.followUpTask.findMany.mockResolvedValue([]);

        const result = await detectAbsenteeMembers({ churchId: 'church-1', refDate: fixedNow });

        expect(result.missed2Weeks).toHaveLength(1);
        expect(result.missed2Weeks[0].personId).toBe('p-s3');
        expect(result.missed2Weeks[0].reason).toBe('MISSED_2_WEEKS');
        expect(result.missed2Weeks[0].daysAbsent).toBe(14);
      });
    });

    describe('2.5 Multi-Church Multi-Tenant Isolation', () => {
      it('strictly enforces churchId in all 4 batch queries to prevent tenant leakage', async () => {
        mockPrisma.person.findMany.mockResolvedValue([]);
        mockPrisma.attendanceRecord.findMany
          .mockResolvedValueOnce([])
          .mockResolvedValueOnce([]);
        mockPrisma.followUpTask.findMany.mockResolvedValue([]);

        await detectAbsenteeMembers({ churchId: 'church-alpha', refDate: fixedNow });

        // Query 1: person
        expect(mockPrisma.person.findMany).toHaveBeenCalledWith(
          expect.objectContaining({
            where: {
              churchId: 'church-alpha',
              isActive: true,
            },
          })
        );

        // Query 2: attendance S1-S3
        expect(mockPrisma.attendanceRecord.findMany).toHaveBeenNthCalledWith(
          1,
          expect.objectContaining({
            where: expect.objectContaining({
              churchId: 'church-alpha',
            }),
          })
        );

        // Query 3: attendance 60-day
        expect(mockPrisma.attendanceRecord.findMany).toHaveBeenNthCalledWith(
          2,
          expect.objectContaining({
            where: expect.objectContaining({
              churchId: 'church-alpha',
            }),
          })
        );

        // Query 4: followUpTask isolated by person.churchId
        expect(mockPrisma.followUpTask.findMany).toHaveBeenCalledWith(
          expect.objectContaining({
            where: expect.objectContaining({
              person: { churchId: 'church-alpha' },
            }),
          })
        );
      });

      it('gracefully returns safe empty results if default church is not found', async () => {
        mockPrisma.church.findFirst.mockResolvedValue(null);

        const result = await detectAbsenteeMembers({ refDate: fixedNow });

        expect(result.totalActiveMembers).toBe(0);
        expect(result.stats.scannedCount).toBe(0);
        expect(result.stats.totalAbsentees).toBe(0);
        expect(mockPrisma.person.findMany).not.toHaveBeenCalled();
      });
    });
  });

  // =========================================================================
  // 3. Performance Benchmark & Zero N+1 Batch Architecture Verification
  // =========================================================================
  describe('3. Performance Benchmark: 1,000 Members & 5,000 Attendance Records', () => {
    const fixedNow = new Date('2026-11-10T12:00:00Z');
    const s1 = new Date('2026-11-08T00:00:00.000Z');
    const s2 = new Date('2026-11-01T00:00:00.000Z');
    const s3 = new Date('2026-10-25T00:00:00.000Z');

    it('processes 1,000 members and 5,000 attendance records in <100ms in-memory', async () => {
      mockPrisma.church.findFirst.mockResolvedValue({ id: 'church-perf', name: 'RCCG Mega Zone' });

      // Generate 1,000 active members
      const memberCount = 1000;
      const members = Array.from({ length: memberCount }, (_, i) => {
        const isFT = i % 10 === 0; // 10% first-timers
        return {
          id: `p-${i}`,
          firstName: `FirstName${i}`,
          lastName: `LastName${i}`,
          phone: `0803${String(i).padStart(7, '0')}`,
          phoneLast4: String(i).slice(-4).padStart(4, '0'),
          category: (['YOUTH', 'ADULT', 'CHILDREN', 'WORKER'] as const)[i % 4],
          subCategory: i % 2 === 0 ? 'Media' : 'Choir',
          status: isFT ? ('FIRST_TIMER' as const) : ('MEMBER' as const),
          createdAt: isFT
            ? new Date(fixedNow.getTime() - (i % 72) * 3600 * 1000) // Within 72h
            : new Date('2025-01-01T00:00:00Z'),
        };
      });

      // Generate 5,000 attendance records
      const targetSundayRecords: { personId: string; date: Date }[] = [];
      const sixtyDayRecords: { personId: string; date: Date }[] = [];

      for (let i = 0; i < memberCount; i++) {
        const pId = `p-${i}`;
        if (i % 3 === 0) {
          // Attended S1 (Present)
          targetSundayRecords.push({ personId: pId, date: s1 });
        } else if (i % 3 === 1) {
          // Attended S2 (Missed 1 Week)
          targetSundayRecords.push({ personId: pId, date: s2 });
        } else {
          // Attended S3 (Missed 2 Weeks)
          targetSundayRecords.push({ personId: pId, date: s3 });
        }

        // Add 4 additional historical attendances per member = 5,000 total records
        for (let w = 4; w <= 7; w++) {
          const pastDate = new Date(s1.getTime() - w * 7 * 24 * 3600 * 1000);
          sixtyDayRecords.push({ personId: pId, date: pastDate });
        }
      }

      // Generate 100 existing tasks
      const openTasks = Array.from({ length: 100 }, (_, i) => ({
        id: `task-${i}`,
        personId: `p-${i * 10}`,
        reason: 'MISSED_1_WEEK',
        status: i % 5 === 0 ? ('ESCALATED' as const) : ('PENDING' as const),
        assignedTo: 'Youth Pastor',
        escalatedTo: i % 5 === 0 ? 'YOUTH_PASTOR' : null,
        dueDate: new Date(fixedNow.getTime() - 24 * 3600 * 1000),
      }));

      mockPrisma.person.findMany.mockResolvedValue(members);
      mockPrisma.attendanceRecord.findMany.mockImplementation((args: any) => {
        if (args?.where?.date?.in) {
          return Promise.resolve(targetSundayRecords);
        }
        return Promise.resolve(sixtyDayRecords);
      });
      mockPrisma.followUpTask.findMany.mockResolvedValue(openTasks);

      // Warm up V8 JIT compiler
      await detectAbsenteeMembers({ churchId: 'church-perf', refDate: fixedNow });

      // Reset mock invocation counts to isolate benchmark query counting
      mockPrisma.person.findMany.mockClear();
      mockPrisma.attendanceRecord.findMany.mockClear();
      mockPrisma.followUpTask.findMany.mockClear();

      // Measure execution time of warm execution
      const startTime = performance.now();
      const result = await detectAbsenteeMembers({ churchId: 'church-perf', refDate: fixedNow });
      const durationMs = performance.now() - startTime;
      console.log(`[Benchmark] detectAbsenteeMembers for 1,000 members took: ${durationMs.toFixed(2)}ms`);

      // 1. Performance verification (< 100ms)
      expect(durationMs).toBeLessThan(100);

      // 2. Query count verification (Exactly 4 batch queries; zero N+1 queries)
      expect(mockPrisma.person.findMany).toHaveBeenCalledTimes(1);
      expect(mockPrisma.attendanceRecord.findMany).toHaveBeenCalledTimes(2);
      expect(mockPrisma.followUpTask.findMany).toHaveBeenCalledTimes(1);

      // 3. Integrity of results
      expect(result.totalActiveMembers).toBe(1000);
      expect(result.stats.scannedCount).toBe(1000);
      expect(result.stats.totalAbsentees).toBeGreaterThan(0);
      expect(result.missed1Week.length).toBeGreaterThan(0);
      expect(result.missed2Weeks.length).toBeGreaterThan(0);
      expect(result.firstTimers72h.length).toBeGreaterThan(0);
      expect(result.escalatedToPastor.length).toBeGreaterThan(0);
    });
  });

  // =========================================================================
  // 4. Data Sanitization, WhatsApp Links & Malformed Input Robustness
  // =========================================================================
  describe('4. Data Sanitization & WhatsApp Direct Links Robustness', () => {
    const fixedNow = new Date('2026-11-10T12:00:00Z');
    const s2 = new Date('2026-11-01T00:00:00.000Z');

    it('generates valid 1-click wa.me URLs for Nigerian phone numbers formatted with 080', async () => {
      mockPrisma.church.findFirst.mockResolvedValue({ id: 'c-1', name: 'RCCG Test' });

      const member = {
        id: 'p-wa-1',
        firstName: 'Segun',
        lastName: 'Bakare',
        phone: '08023456789',
        phoneLast4: '6789',
        category: 'YOUTH',
        subCategory: 'Choir',
        status: 'MEMBER',
        createdAt: new Date('2026-01-01'),
      };

      mockPrisma.person.findMany.mockResolvedValue([member]);
      mockPrisma.attendanceRecord.findMany
        .mockResolvedValueOnce([{ personId: 'p-wa-1', date: s2 }])
        .mockResolvedValueOnce([{ personId: 'p-wa-1', date: s2 }]);
      mockPrisma.followUpTask.findMany.mockResolvedValue([]);

      const result = await detectAbsenteeMembers({ churchId: 'c-1', refDate: fixedNow });

      expect(result.missed1Week).toHaveLength(1);
      const classified = result.missed1Week[0];

      // waMeUrl must be formatted with international prefix 234 and URL-encoded text
      expect(classified.waMeUrl).toContain('https://wa.me/2348023456789?text=');
      expect(classified.waMeUrl).toContain(encodeURIComponent('Segun'));
      expect(classified.formattedPhone).toBe('0802 345 6789');
    });

    it('safely handles non-standard phone numbers, symbols, spaces, and empty strings without throwing', async () => {
      mockPrisma.church.findFirst.mockResolvedValue({ id: 'c-1', name: 'RCCG Test' });

      const dirtyNumbers = [
        { id: 'dirty-1', phone: '+234 803 123 4567' },
        { id: 'dirty-2', phone: '080-333-4444' },
        { id: 'dirty-3', phone: 'N/A' },
        { id: 'dirty-4', phone: '' },
      ];

      const members = dirtyNumbers.map((d) => ({
        id: d.id,
        firstName: 'Test',
        lastName: 'User',
        phone: d.phone,
        phoneLast4: '4444',
        category: 'YOUTH',
        subCategory: null,
        status: 'MEMBER',
        createdAt: new Date('2026-01-01'),
      }));

      mockPrisma.person.findMany.mockResolvedValue(members);
      mockPrisma.attendanceRecord.findMany
        .mockResolvedValueOnce(members.map((m) => ({ personId: m.id, date: s2 })))
        .mockResolvedValueOnce(members.map((m) => ({ personId: m.id, date: s2 })));
      mockPrisma.followUpTask.findMany.mockResolvedValue([]);

      const result = await detectAbsenteeMembers({ churchId: 'c-1', refDate: fixedNow });

      expect(result.missed1Week).toHaveLength(4);
      for (const m of result.missed1Week) {
        expect(m.waMeUrl).toBeDefined();
        expect(typeof m.waMeUrl).toBe('string');
      }
    });

    it('safely escapes special characters, quotes, and HTML tags in member names', async () => {
      mockPrisma.church.findFirst.mockResolvedValue({ id: 'c-1', name: 'RCCG Test' });

      const xssMember = {
        id: 'p-xss',
        firstName: "<script>alert('xss')</script>",
        lastName: "O'Connor",
        phone: '08031234567',
        phoneLast4: '4567',
        category: 'YOUTH',
        subCategory: '<b>Media</b>',
        status: 'MEMBER',
        createdAt: new Date('2026-01-01'),
      };

      mockPrisma.person.findMany.mockResolvedValue([xssMember]);
      mockPrisma.attendanceRecord.findMany
        .mockResolvedValueOnce([{ personId: 'p-xss', date: s2 }])
        .mockResolvedValueOnce([{ personId: 'p-xss', date: s2 }]);
      mockPrisma.followUpTask.findMany.mockResolvedValue([]);

      const result = await detectAbsenteeMembers({ churchId: 'c-1', refDate: fixedNow });

      expect(result.missed1Week).toHaveLength(1);
      const classified = result.missed1Week[0];
      expect(classified.aiDraftNote).toBeDefined();
      expect(classified.waMeUrl).toBeDefined();
      // Verify valid URL encoding: no raw angle brackets in URL query
      expect(classified.waMeUrl).not.toContain('<script>');
    });
  });

  // =========================================================================
  // 5. Empirical Fragility & Logic Observations
  // =========================================================================
  describe('5. Empirical Logic Observations', () => {
    const fixedNow = new Date('2026-11-10T12:00:00Z');

    it('Rule 4 (DORMANT_CRITICAL) correctly triggers when member missed S1, S2, and S3, but has history in last 60 days', async () => {
      mockPrisma.church.findFirst.mockResolvedValue({ id: 'c-1', name: 'RCCG Test' });

      // Member attended 35 days ago (in sixtyDayRecords), but missed S1, S2, and S3
      const dormantMember = {
        id: 'p-dormant',
        firstName: 'Dormant',
        lastName: 'Person',
        phone: '08099998888',
        phoneLast4: '8888',
        category: 'YOUTH',
        subCategory: null,
        status: 'MEMBER',
        createdAt: new Date('2025-01-01'),
      };

      const pastDate = new Date(fixedNow.getTime() - 35 * 24 * 3600 * 1000);

      mockPrisma.person.findMany.mockResolvedValue([dormantMember]);
      mockPrisma.attendanceRecord.findMany
        .mockResolvedValueOnce([]) // No attendance on S1, S2, or S3
        .mockResolvedValueOnce([{ personId: 'p-dormant', date: pastDate }]); // Has attendance 35 days ago
      mockPrisma.followUpTask.findMany.mockResolvedValue([]);

      const result = await detectAbsenteeMembers({ churchId: 'c-1', refDate: fixedNow });

      // Unshadowed: member missed S1, S2, S3 with prior history, correctly classified as DORMANT_CRITICAL
      expect(result.dormantCritical).toHaveLength(1);
      expect(result.dormantCritical[0].reason).toBe('DORMANT_CRITICAL');
      expect(result.dormantCritical[0].daysAbsent).toBe(21);
      expect(result.missed2Weeks).toHaveLength(0);
    });
  });
});
