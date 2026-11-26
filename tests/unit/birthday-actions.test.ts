import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockPrisma } from '../helpers/prisma-mock';

vi.mock('@/lib/prisma', () => ({
  prisma: mockPrisma,
}));

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

vi.mock('@/lib/telegram', () => ({
  sendMediaBirthdayAlert: vi.fn().mockResolvedValue({
    success: true,
    messageId: 'mock-msg-123',
    status: 'DELIVERED',
  }),
  sendTelegramMessage: vi.fn().mockResolvedValue({
    success: true,
    messageId: 'mock-msg-123',
  }),
}));

import {
  getBirthdayDashboardAction,
  triggerBirthdayCronAction,
  dispatchManualBirthdayAlertAction,
  updateFlyerStatusAction,
} from '@/app/actions/birthdays';

describe('Birthday Server Actions (app/actions/birthdays.ts)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('1. getBirthdayDashboardAction', () => {
    it('returns structured metrics, celebrants, and recent audit logs', async () => {
      mockPrisma.church.findFirst.mockResolvedValue({ id: 'church-1', name: 'RCCG Test Zone' });
      mockPrisma.person.findMany.mockResolvedValue([
        {
          id: 'p-1',
          firstName: 'Bukola',
          lastName: 'Saraki',
          phone: '08023456789',
          phoneLast4: '6789',
          category: 'YOUTH',
          subCategory: 'MEDIA_UNIT',
          photoUrl: 'https://photo.com/bukola.jpg',
          birthDay: 14,
          birthMonth: 11,
          dateOfBirth: null,
          birthdayLogs: [],
        },
      ]);
      mockPrisma.birthdayReminderLog.findMany.mockResolvedValue([
        {
          id: 'log-1',
          personId: 'p-1',
          year: 2026,
          type: 'GRAPHICS_T_MINUS_1',
          status: 'SENT',
          flyerUrl: null,
          sentAt: new Date('2026-11-13T07:00:00Z'),
          person: { firstName: 'Bukola', lastName: 'Saraki', subCategory: 'MEDIA_UNIT' },
        },
      ]);
      mockPrisma.birthdayReminderLog.count.mockResolvedValue(1);

      const result = await getBirthdayDashboardAction();

      expect(result.success).toBe(true);
      expect(result.metrics).toBeDefined();
      expect(result.celebrants.length).toBe(1);
      expect(result.celebrants[0]?.fullName).toBe('Bukola Saraki');
      expect(result.celebrants[0]?.deterministicGreeting).toBeDefined();
      expect(result.celebrants[0]?.waMeGreetingUrl).toContain('wa.me');
      expect(result.recentLogs.length).toBe(1);
      expect(result.recentLogs[0]?.type).toBe('GRAPHICS_T_MINUS_1');
    });

    it('filters celebrants by search query', async () => {
      mockPrisma.church.findFirst.mockResolvedValue({ id: 'church-1', name: 'RCCG Test Zone' });
      mockPrisma.person.findMany.mockResolvedValue([
        {
          id: 'p-1',
          firstName: 'Bukola',
          lastName: 'Saraki',
          phone: '08023456789',
          phoneLast4: '6789',
          category: 'YOUTH',
          subCategory: 'MEDIA_UNIT',
          photoUrl: null,
          birthDay: 14,
          birthMonth: 11,
          dateOfBirth: null,
          birthdayLogs: [],
        },
        {
          id: 'p-2',
          firstName: 'Emeka',
          lastName: 'Okonkwo',
          phone: '08099998888',
          phoneLast4: '8888',
          category: 'YOUTH',
          subCategory: 'CHOIR',
          photoUrl: null,
          birthDay: 18,
          birthMonth: 11,
          dateOfBirth: null,
          birthdayLogs: [],
        },
      ]);
      mockPrisma.birthdayReminderLog.findMany.mockResolvedValue([]);
      mockPrisma.birthdayReminderLog.count.mockResolvedValue(0);

      const result = await getBirthdayDashboardAction({ searchQuery: 'Okonkwo' });

      expect(result.success).toBe(true);
      expect(result.celebrants.length).toBe(1);
      expect(result.celebrants[0]?.fullName).toBe('Emeka Okonkwo');
    });
  });

  describe('2. triggerBirthdayCronAction', () => {
    it('manually executes birthday pipeline and revalidates paths', async () => {
      mockPrisma.church.findFirst.mockResolvedValue({ id: 'church-1', name: 'RCCG Test Zone' });
      mockPrisma.person.findMany.mockResolvedValue([]);

      const result = await triggerBirthdayCronAction();

      expect(result.success).toBe(true);
      expect(result.message).toContain('Birthday pipeline executed');
    });
  });

  describe('3. dispatchManualBirthdayAlertAction', () => {
    it('dispatches manual T-1 Media Alert to Telegram and upserts BirthdayReminderLog', async () => {
      mockPrisma.person.findUnique.mockResolvedValue({
        id: 'p-1',
        firstName: 'Daniel',
        lastName: 'Ajayi',
        phone: '08012345678',
        subCategory: 'USHERING',
        birthMonth: 8,
        birthDay: 22,
        photoUrl: 'https://example.com/photo.jpg',
      });
      mockPrisma.birthdayReminderLog.upsert.mockResolvedValue({ id: 'log-upserted' });

      const res = await dispatchManualBirthdayAlertAction({
        personId: 'p-1',
        type: 'T_MINUS_1_MEDIA',
      });

      expect(res.success).toBe(true);
      expect(mockPrisma.birthdayReminderLog.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            personId_year_type: expect.objectContaining({
              personId: 'p-1',
              type: 'GRAPHICS_T_MINUS_1',
            }),
          }),
        })
      );
    });

    it('dispatches manual direct member DM and generates waMe link', async () => {
      mockPrisma.person.findUnique.mockResolvedValue({
        id: 'p-1',
        firstName: 'Daniel',
        lastName: 'Ajayi',
        phone: '08012345678',
        subCategory: 'USHERING',
        birthMonth: 8,
        birthDay: 22,
        photoUrl: null,
      });
      mockPrisma.church.findFirst.mockResolvedValue({ name: 'RCCG Test' });
      mockPrisma.birthdayReminderLog.upsert.mockResolvedValue({ id: 'log-upserted' });

      const res = await dispatchManualBirthdayAlertAction({
        personId: 'p-1',
        type: 'DIRECT_MEMBER_DM',
      });

      expect(res.success).toBe(true);
      expect(res.waMeUrl).toBeDefined();
    });
  });

  describe('4. updateFlyerStatusAction', () => {
    it('updates flyer status and link in BirthdayReminderLog', async () => {
      mockPrisma.birthdayReminderLog.upsert.mockResolvedValue({ id: 'log-updated' });

      const res = await updateFlyerStatusAction({
        personId: 'p-1',
        status: 'FLYER_READY',
        flyerUrl: 'https://drive.google.com/flyer-ready.png',
      });

      expect(res.success).toBe(true);
      expect(res.message).toContain('FLYER_READY');
      expect(mockPrisma.birthdayReminderLog.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          update: expect.objectContaining({
            status: 'FLYER_READY',
            flyerUrl: 'https://drive.google.com/flyer-ready.png',
          }),
        })
      );
    });
  });
});
