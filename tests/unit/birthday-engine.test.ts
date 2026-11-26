import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockPrisma } from '../helpers/prisma-mock';

vi.mock('@/lib/prisma', () => ({
  prisma: mockPrisma,
}));

import {
  isLeapYear,
  calculateDaysUntilBirthday,
  extractBirthDayMonth,
  getUpcomingBirthdays,
  runBirthdayPipeline,
  BIRTHDAY_REMINDER_TYPES,
} from '@/lib/birthday-engine';

describe('Birthday Engine & Pipeline (lib/birthday-engine.ts)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('1. Leap Year Math & Days Until Birthday Calculations', () => {
    it('correctly identifies leap years and non-leap years', () => {
      expect(isLeapYear(2024)).toBe(true);
      expect(isLeapYear(2026)).toBe(false);
      expect(isLeapYear(2028)).toBe(true);
      expect(isLeapYear(1900)).toBe(false); // Century non-leap
      expect(isLeapYear(2000)).toBe(true);  // 400-year leap
    });

    it('calculates days remaining for upcoming birthdays in the same calendar year', () => {
      // Current date: 10th May 2026
      // Birthday: 15th May
      const days = calculateDaysUntilBirthday(5, 15, 5, 10, 2026);
      expect(days).toBe(5);

      // Birthday: Today (10th May)
      expect(calculateDaysUntilBirthday(5, 10, 5, 10, 2026)).toBe(0);

      // Birthday: Tomorrow (11th May)
      expect(calculateDaysUntilBirthday(5, 11, 5, 10, 2026)).toBe(1);
    });

    it('wraps around to the next calendar year when birthday has already passed', () => {
      // Current date: 15th December 2026
      // Birthday: 5th January
      const days = calculateDaysUntilBirthday(1, 5, 12, 15, 2026);
      // Dec 15 to Dec 31 is 16 days + 5 days in Jan = 21 days
      expect(days).toBe(21);
    });

    it('maps February 29 birthdays to February 28 in non-leap years (2026)', () => {
      // Current date: 27th February 2026 (non-leap year)
      // Celebrant born on Feb 29
      const daysToFeb29 = calculateDaysUntilBirthday(2, 29, 2, 27, 2026);
      expect(daysToFeb29).toBe(1); // Celebrated tomorrow on Feb 28!

      // Current date: 28th February 2026 (non-leap year)
      const daysOnFeb28 = calculateDaysUntilBirthday(2, 29, 2, 28, 2026);
      expect(daysOnFeb28).toBe(0); // Celebrated today!
    });

    it('preserves February 29 on actual leap years (2028)', () => {
      // Current date: 28th February 2028 (leap year)
      const days = calculateDaysUntilBirthday(2, 29, 2, 28, 2028);
      expect(days).toBe(1); // Celebrated tomorrow on Feb 29

      // Current date: 29th February 2028
      const daysDayOf = calculateDaysUntilBirthday(2, 29, 2, 29, 2028);
      expect(daysDayOf).toBe(0); // Celebrated today
    });
  });

  describe('2. Normalizing Birth Day and Month', () => {
    it('prefers explicit birthDay and birthMonth integers', () => {
      const res = extractBirthDayMonth({
        birthDay: 14,
        birthMonth: 11,
        dateOfBirth: new Date('1998-05-20T00:00:00Z'),
      });
      expect(res.birthDay).toBe(14);
      expect(res.birthMonth).toBe(11);
    });

    it('derives birthDay and birthMonth from dateOfBirth if scalars are null', () => {
      const res = extractBirthDayMonth({
        birthDay: null,
        birthMonth: null,
        dateOfBirth: new Date('1995-07-22T00:00:00Z'),
      });
      expect(res.birthDay).toBe(22);
      expect(res.birthMonth).toBe(7);
    });
  });

  describe('3. Timezone (Africa/Lagos WAT UTC+1) Upcoming Birthday Detection', () => {
    it('correctly shifts UTC night to Nigerian morning (23:30 UTC = 00:30 WAT next day)', async () => {
      // 2026-11-13T23:30:00Z is 2026-11-14T00:30:00 in Africa/Lagos
      const refDate = new Date('2026-11-13T23:30:00Z');

      mockPrisma.church.findFirst.mockResolvedValue({ id: 'church-1', name: 'RCCG Test' });
      mockPrisma.person.findMany.mockResolvedValue([
        {
          id: 'p-today',
          firstName: 'Chidi',
          lastName: 'Okafor',
          phone: '08011112222',
          photoUrl: 'https://img.com/chidi.jpg',
          subCategory: 'MEDIA_TEAM',
          category: 'YOUTH',
          birthDay: 14,
          birthMonth: 11,
          dateOfBirth: null,
        },
        {
          id: 'p-tomorrow',
          firstName: 'Amina',
          lastName: 'Bello',
          phone: '08033334444',
          photoUrl: null,
          subCategory: 'USHERING',
          category: 'YOUTH',
          birthDay: 15,
          birthMonth: 11,
          dateOfBirth: null,
        },
        {
          id: 'p-later',
          firstName: 'Emeka',
          lastName: 'Nnamdi',
          phone: '08055556666',
          photoUrl: null,
          subCategory: 'CHOIR',
          category: 'YOUTH',
          birthDay: 20,
          birthMonth: 11,
          dateOfBirth: null,
        },
      ]);

      const result = await getUpcomingBirthdays({ refDate });

      expect(result.nigerianDate.year).toBe(2026);
      expect(result.nigerianDate.month).toBe(11);
      expect(result.nigerianDate.dayOfMonth).toBe(14); // November 14 in WAT!

      expect(result.todayCelebrants.length).toBe(1);
      expect(result.todayCelebrants[0]?.personId).toBe('p-today');
      expect(result.todayCelebrants[0]?.isToday).toBe(true);

      expect(result.tomorrowCelebrants.length).toBe(1);
      expect(result.tomorrowCelebrants[0]?.personId).toBe('p-tomorrow');
      expect(result.tomorrowCelebrants[0]?.isTomorrow).toBe(true);
    });

    it('celebrates Feb 29 celebrants on Feb 28 in non-leap year (2026)', async () => {
      // 2026-02-28 10:00:00 WAT
      const refDate = new Date('2026-02-28T10:00:00Z');

      mockPrisma.church.findFirst.mockResolvedValue({ id: 'church-1', name: 'RCCG Test' });
      mockPrisma.person.findMany.mockResolvedValue([
        {
          id: 'p-feb28',
          firstName: 'Tola',
          lastName: 'Ade',
          phone: '08011111111',
          photoUrl: null,
          subCategory: 'WORKER',
          category: 'YOUTH',
          birthDay: 28,
          birthMonth: 2,
          dateOfBirth: null,
        },
        {
          id: 'p-feb29',
          firstName: 'Leap',
          lastName: 'Baby',
          phone: '08022222222',
          photoUrl: null,
          subCategory: 'WORKER',
          category: 'YOUTH',
          birthDay: 29,
          birthMonth: 2,
          dateOfBirth: null,
        },
      ]);

      const result = await getUpcomingBirthdays({ refDate });

      // Both should be included in todayCelebrants!
      expect(result.todayCelebrants.length).toBe(2);
      const ids = result.todayCelebrants.map((c) => c.personId);
      expect(ids).toContain('p-feb28');
      expect(ids).toContain('p-feb29');
    });

    it('detects T-1 alert on Feb 27 for Feb 29 celebrant in non-leap year (2026)', async () => {
      // 2026-02-27 10:00:00 WAT
      const refDate = new Date('2026-02-27T10:00:00Z');

      mockPrisma.church.findFirst.mockResolvedValue({ id: 'church-1', name: 'RCCG Test' });
      mockPrisma.person.findMany.mockResolvedValue([
        {
          id: 'p-feb29',
          firstName: 'Leap',
          lastName: 'Baby',
          phone: '08022222222',
          photoUrl: null,
          subCategory: 'WORKER',
          category: 'YOUTH',
          birthDay: 29,
          birthMonth: 2,
          dateOfBirth: null,
        },
      ]);

      const result = await getUpcomingBirthdays({ refDate });

      // Tomorrow is Feb 28 in non-leap year, so Feb 29 celebrant should get T-1 alert!
      expect(result.tomorrowCelebrants.length).toBe(1);
      expect(result.tomorrowCelebrants[0]?.personId).toBe('p-feb29');
      expect(result.tomorrowCelebrants[0]?.isTomorrow).toBe(true);
    });
  });

  describe('4. Full Pipeline Execution & Database Idempotency', () => {
    it('dispatches T-1 alerts and Day-Of greetings and logs to BirthdayReminderLog', async () => {
      const refDate = new Date('2026-05-10T08:00:00Z');

      mockPrisma.church.findFirst.mockResolvedValue({ id: 'church-1', name: 'RCCG Test Zone' });
      mockPrisma.person.findMany.mockResolvedValue([
        {
          id: 'p-today',
          firstName: 'Joy',
          lastName: 'Eze',
          phone: '08012345678',
          photoUrl: 'https://img.com/joy.jpg',
          subCategory: 'MEDIA_TEAM',
          category: 'YOUTH',
          birthDay: 10,
          birthMonth: 5,
          dateOfBirth: null,
        },
        {
          id: 'p-tomorrow',
          firstName: 'Paul',
          lastName: 'Ade',
          phone: '08087654321',
          photoUrl: null,
          subCategory: 'PRAYER_TEAM',
          category: 'YOUTH',
          birthDay: 11,
          birthMonth: 5,
          dateOfBirth: null,
        },
      ]);

      // No previous logs exist
      mockPrisma.birthdayReminderLog.findUnique.mockResolvedValue(null);
      mockPrisma.birthdayReminderLog.create.mockResolvedValue({ id: 'log-1' });

      const pipelineResult = await runBirthdayPipeline({
        targetDate: refDate,
        dryRun: true,
      });

      expect(pipelineResult.success).toBe(true);
      expect(pipelineResult.tMinus1.celebrantsCount).toBe(1);
      expect(pipelineResult.tMinus1.mediaAlertsSent).toBe(1);
      expect(pipelineResult.dayOf.celebrantsCount).toBe(1);
      expect(pipelineResult.dayOf.mediaAlertsSent).toBe(1);
      expect(pipelineResult.dayOf.memberDmsSent).toBe(1);

      // Verify DB creation calls
      expect(mockPrisma.birthdayReminderLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            personId: 'p-tomorrow',
            year: 2026,
            type: BIRTHDAY_REMINDER_TYPES.T_MINUS_1_MEDIA,
          }),
        })
      );

      expect(mockPrisma.birthdayReminderLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            personId: 'p-today',
            year: 2026,
            type: BIRTHDAY_REMINDER_TYPES.DAY_OF_CELEBRATION,
          }),
        })
      );
    });

    it('idempotently skips already logged dispatches on subsequent runs', async () => {
      const refDate = new Date('2026-05-10T08:00:00Z');

      mockPrisma.church.findFirst.mockResolvedValue({ id: 'church-1', name: 'RCCG Test Zone' });
      mockPrisma.person.findMany.mockResolvedValue([
        {
          id: 'p-today',
          firstName: 'Joy',
          lastName: 'Eze',
          phone: '08012345678',
          photoUrl: null,
          subCategory: null,
          category: 'YOUTH',
          birthDay: 10,
          birthMonth: 5,
          dateOfBirth: null,
        },
      ]);

      // Simulate existing log in DB
      mockPrisma.birthdayReminderLog.findUnique.mockResolvedValue({
        id: 'existing-log',
        personId: 'p-today',
        year: 2026,
        type: BIRTHDAY_REMINDER_TYPES.DAY_OF_CELEBRATION,
        status: 'SENT',
      });

      const pipelineResult = await runBirthdayPipeline({
        targetDate: refDate,
        dryRun: true,
      });

      expect(pipelineResult.dayOf.skippedAlreadyLogged).toBe(1);
      expect(pipelineResult.dayOf.mediaAlertsSent).toBe(0);
      expect(pipelineResult.dayOf.memberDmsSent).toBe(0);
      expect(mockPrisma.birthdayReminderLog.create).not.toHaveBeenCalled();
    });

    it('gracefully catches Prisma P2002 unique constraint violations without throwing', async () => {
      const refDate = new Date('2026-05-10T08:00:00Z');

      mockPrisma.church.findFirst.mockResolvedValue({ id: 'church-1', name: 'RCCG Test Zone' });
      mockPrisma.person.findMany.mockResolvedValue([
        {
          id: 'p-tomorrow',
          firstName: 'Paul',
          lastName: 'Ade',
          phone: '08087654321',
          photoUrl: null,
          subCategory: null,
          category: 'YOUTH',
          birthDay: 11,
          birthMonth: 5,
          dateOfBirth: null,
        },
      ]);

      mockPrisma.birthdayReminderLog.findUnique.mockResolvedValue(null);
      // Simulate P2002 error thrown by concurrent create
      mockPrisma.birthdayReminderLog.create.mockRejectedValue({
        code: 'P2002',
        message: 'Unique constraint failed on the fields: (`personId`,`year`,`type`)',
      });

      const pipelineResult = await runBirthdayPipeline({
        targetDate: refDate,
        dryRun: true,
      });

      // Pipeline should not crash and should succeed
      expect(pipelineResult.success).toBe(true);
      expect(pipelineResult.tMinus1.mediaAlertsSent).toBe(1);
    });
  });
});
