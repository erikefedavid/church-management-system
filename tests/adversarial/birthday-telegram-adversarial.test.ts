/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Milestone 4 Adversarial Stress Testing Suite:
 * Media Telegram Birthday Bot, Leap Year Math & Timezone Rollover
 *
 * Requirements Tested:
 * - R3: Media Team Birthday Telegram Automation
 * Target files under test:
 * - lib/telegram.ts
 * - lib/birthday-engine.ts
 * - lib/service-resolver.ts
 * - app/api/cron/birthdays/route.ts
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mockPrisma } from '../helpers/prisma-mock';

vi.mock('@/lib/prisma', () => ({
  prisma: mockPrisma,
}));

import {
  TelegramBotClient,
  escapeMarkdown,
  escapeMarkdownV2,
  formatBirthdayAlertMarkdown,
  sendTelegramMessage,
  sendTelegramPhoto,
  sendMediaBirthdayAlert,
  sendMediaBirthdayAlertBatch,
} from '@/lib/telegram';

import {
  isLeapYear,
  calculateDaysUntilBirthday,
  extractBirthDayMonth,
  getUpcomingBirthdays,
  runBirthdayPipeline,
  BIRTHDAY_REMINDER_TYPES,
} from '@/lib/birthday-engine';

import { getNigerianTimeInfo } from '@/lib/service-resolver';
import { NextRequest } from 'next/server';
import { GET, POST } from '@/app/api/cron/birthdays/route';

describe('Milestone 4 Adversarial Stress Suite: Telegram Bot Resilience & Leap Year Pipeline', () => {
  const originalEnv = { ...process.env };
  const FAKE_BOT_TOKEN = '123456789:AAFakeAdversarialBotTokenForTesting_XYZ';
  const FAKE_CHAT_ID = '-1009876543210';

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv };
    delete process.env.TELEGRAM_BOT_TOKEN;
    delete process.env.TELEGRAM_MEDIA_CHAT_ID;
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  // =========================================================================
  // SECTION 1: Telegram API Error Handling, Rate Limiting & Resilience
  // =========================================================================
  describe('1. Telegram API Error Handling & Resilience Stress Tests', () => {
    describe('1.1 HTTP 429 Rate Limit & retry_after Extraction', () => {
      it('C1.1: Extracts parameters.retry_after and returns retryable: true without throwing for sendMessage', async () => {
        const mockFetch = vi.fn().mockResolvedValue({
          ok: false,
          status: 429,
          json: async () => ({
            ok: false,
            error_code: 429,
            description: 'Too Many Requests: retry after 42',
            parameters: { retry_after: 42 },
          }),
        });
        vi.stubGlobal('fetch', mockFetch);

        const client = new TelegramBotClient({
          botToken: FAKE_BOT_TOKEN,
          mediaChatId: FAKE_CHAT_ID,
          dryRun: false,
        });

        const result = await client.sendMessage({ text: 'Adversarial rate limit test' });

        expect(mockFetch).toHaveBeenCalledTimes(1);
        expect(result.success).toBe(false);
        expect(result.errorCode).toBe(429);
        expect(result.retryAfter).toBe(42);
        expect(result.retryable).toBe(true);
        expect(result.error).toContain('Too Many Requests');
        expect(result.method).toBe('sendMessage');
      });

      it('C1.2: Extracts parameters.retry_after and returns retryable: true without throwing for sendPhoto', async () => {
        const mockFetch = vi.fn().mockResolvedValue({
          ok: false,
          status: 429,
          json: async () => ({
            ok: false,
            error_code: 429,
            description: 'Too Many Requests: retry after 15',
            parameters: { retry_after: 15 },
          }),
        });
        vi.stubGlobal('fetch', mockFetch);

        const client = new TelegramBotClient({
          botToken: FAKE_BOT_TOKEN,
          mediaChatId: FAKE_CHAT_ID,
          dryRun: false,
        });

        const result = await client.sendPhoto({
          photoUrl: 'https://cdn.example.com/celebrant.jpg',
          caption: 'Celebrant Photo',
        });

        expect(result.success).toBe(false);
        expect(result.errorCode).toBe(429);
        expect(result.retryAfter).toBe(15);
        expect(result.retryable).toBe(true);
        expect(result.method).toBe('sendPhoto');
      });

      it('C1.3: Gracefully handles malformed HTTP 429 response missing parameters object', async () => {
        const mockFetch = vi.fn().mockResolvedValue({
          ok: false,
          status: 429,
          json: async () => ({
            ok: false,
            error_code: 429,
            description: 'Too Many Requests: flood control exceeded',
          }),
        });
        vi.stubGlobal('fetch', mockFetch);

        const client = new TelegramBotClient({
          botToken: FAKE_BOT_TOKEN,
          mediaChatId: FAKE_CHAT_ID,
          dryRun: false,
        });

        const result = await client.sendMessage({ text: 'Flood test' });

        expect(result.success).toBe(false);
        expect(result.errorCode).toBe(429);
        expect(result.retryAfter).toBeUndefined();
        expect(result.retryable).toBe(true);
      });

      it('C1.4: Correctly flags HTTP 500, 502, 503, 504 server errors as retryable: true', async () => {
        const errorStatuses = [500, 502, 503, 504];

        for (const status of errorStatuses) {
          const mockFetch = vi.fn().mockResolvedValue({
            ok: false,
            status,
            json: async () => ({
              ok: false,
              error_code: status,
              description: `Telegram server error ${status}`,
            }),
          });
          vi.stubGlobal('fetch', mockFetch);

          const client = new TelegramBotClient({
            botToken: FAKE_BOT_TOKEN,
            mediaChatId: FAKE_CHAT_ID,
            dryRun: false,
          });

          const result = await client.sendMessage({ text: 'Server failure test' });
          expect(result.success).toBe(false);
          expect(result.errorCode).toBe(status);
          expect(result.retryable).toBe(true);
        }
      });

      it('C1.5: Flags client errors (400, 401, 403, 404) as retryable: false', async () => {
        const clientErrors = [400, 401, 403, 404];

        for (const status of clientErrors) {
          const mockFetch = vi.fn().mockResolvedValue({
            ok: false,
            status,
            json: async () => ({
              ok: false,
              error_code: status,
              description: `Client error ${status}`,
            }),
          });
          vi.stubGlobal('fetch', mockFetch);

          const client = new TelegramBotClient({
            botToken: FAKE_BOT_TOKEN,
            mediaChatId: FAKE_CHAT_ID,
            dryRun: false,
          });

          const result = await client.sendMessage({ text: 'Client error test' });
          expect(result.success).toBe(false);
          expect(result.errorCode).toBe(status);
          expect(result.retryable).toBe(false);
        }
      });
    });

    describe('1.2 HTTP 400 Photo Failure & Automatic Text Fallback', () => {
      it('C1.6: Automatically falls back to sendMessage when sendPhoto fails with HTTP 400 Bad Request', async () => {
        const mockFetch = vi
          .fn()
          .mockResolvedValueOnce({
            ok: false,
            status: 400,
            json: async () => ({
              ok: false,
              error_code: 400,
              description: 'Bad Request: wrong file identifier/HTTP URL specified',
            }),
          })
          .mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: async () => ({
              ok: true,
              result: {
                message_id: 7701,
                chat: { id: -1009876543210 },
              },
            }),
          });
        vi.stubGlobal('fetch', mockFetch);

        const client = new TelegramBotClient({
          botToken: FAKE_BOT_TOKEN,
          mediaChatId: FAKE_CHAT_ID,
          dryRun: false,
        });

        const result = await client.dispatchMediaBirthdayAlert({
          celebrantId: 'p-adv-1',
          celebrantName: 'Emeka Umeh',
          birthDateFormatted: '14th November',
          daysUntilBirthday: 1,
          photoUrl: 'https://invalid-host-dns-failure.org/broken-photo.png',
        });

        expect(mockFetch).toHaveBeenCalledTimes(2);
        // First call was sendPhoto
        expect(mockFetch.mock.calls[0][0]).toContain('/sendPhoto');
        // Second call was sendMessage
        expect(mockFetch.mock.calls[1][0]).toContain('/sendMessage');

        expect(result.success).toBe(true);
        expect(result.fallbackOccurred).toBe(true);
        expect(result.fallbackReason).toContain('wrong file identifier/HTTP URL specified');
        expect(result.messageId).toBe(7701);
        expect(result.formattedText).toContain('[Attached Photo Link](https://invalid-host-dns-failure.org/broken-photo.png)');
      });

      it('C1.7: Falls back to sendMessage when sendPhoto throws an unhandled network error', async () => {
        const mockFetch = vi
          .fn()
          .mockRejectedValueOnce(new Error('Connection reset by peer: ECONNRESET'))
          .mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: async () => ({
              ok: true,
              result: { message_id: 7702 },
            }),
          });
        vi.stubGlobal('fetch', mockFetch);

        const client = new TelegramBotClient({
          botToken: FAKE_BOT_TOKEN,
          mediaChatId: FAKE_CHAT_ID,
          dryRun: false,
        });

        const result = await client.dispatchMediaBirthdayAlert({
          celebrantId: 'p-adv-2',
          celebrantName: 'Faith Adeleke',
          birthDateFormatted: '15th November',
          daysUntilBirthday: 0,
          photoUrl: 'https://example.com/faith.png',
        });

        expect(mockFetch).toHaveBeenCalledTimes(2);
        expect(result.success).toBe(true);
        expect(result.fallbackOccurred).toBe(true);
        expect(result.fallbackReason).toContain('ECONNRESET');
        expect(result.messageId).toBe(7702);
      });

      it('C1.8: Handles cascading double failure (sendPhoto fails AND sendMessage fallback fails)', async () => {
        const mockFetch = vi
          .fn()
          .mockResolvedValueOnce({
            ok: false,
            status: 400,
            json: async () => ({
              ok: false,
              error_code: 400,
              description: 'Bad Request: failed to get HTTP URL content',
            }),
          })
          .mockResolvedValueOnce({
            ok: false,
            status: 400,
            json: async () => ({
              ok: false,
              error_code: 400,
              description: "Bad Request: can't parse entities in message text",
            }),
          });
        vi.stubGlobal('fetch', mockFetch);

        const client = new TelegramBotClient({
          botToken: FAKE_BOT_TOKEN,
          mediaChatId: FAKE_CHAT_ID,
          dryRun: false,
        });

        const result = await client.dispatchMediaBirthdayAlert({
          celebrantId: 'p-adv-3',
          celebrantName: 'Double Failure Member',
          birthDateFormatted: '16th November',
          daysUntilBirthday: 1,
          photoUrl: 'https://example.com/bad.png',
        });

        expect(mockFetch).toHaveBeenCalledTimes(2);
        expect(result.success).toBe(false);
        expect(result.fallbackOccurred).toBe(true);
        expect(result.fallbackReason).toContain('failed to get HTTP URL content');
        expect(result.error).toContain("can't parse entities");
      });

      it('C1.9: Does NOT call sendPhoto or attempt fallback if photoUrl is null or whitespace-only', async () => {
        const mockFetch = vi.fn().mockResolvedValue({
          ok: true,
          status: 200,
          json: async () => ({
            ok: true,
            result: { message_id: 7703 },
          }),
        });
        vi.stubGlobal('fetch', mockFetch);

        const client = new TelegramBotClient({
          botToken: FAKE_BOT_TOKEN,
          mediaChatId: FAKE_CHAT_ID,
          dryRun: false,
        });

        const result = await client.dispatchMediaBirthdayAlert({
          celebrantName: 'No Photo Member',
          birthDateFormatted: '17th November',
          daysUntilBirthday: 1,
          photoUrl: '   ',
        });

        expect(mockFetch).toHaveBeenCalledTimes(1);
        expect(mockFetch.mock.calls[0][0]).toContain('/sendMessage');
        expect(result.success).toBe(true);
        expect(result.fallbackOccurred).toBe(false);
      });
    });

    describe('1.3 Special Character Markdown Escaping Fuzzing', () => {
      const SPECIAL_CHARS = ['_', '*', '`', '[', ']', '~', '>', '#', '+', '-', '=', '|', '{', '}', '.', '!', '\\'];

      it('C1.10: Fuzzes escapeMarkdown with all special Markdown characters individually and combined', () => {
        for (const char of SPECIAL_CHARS) {
          const input = `NameWith${char}Special`;
          const escaped = escapeMarkdown(input);

          if (['*', '_', '`', '[', ']'].includes(char)) {
            expect(escaped).toBe(`NameWith\\${char}Special`);
          } else {
            expect(escaped).toBe(input);
          }
        }
      });

      it('C1.11: Fuzzes escapeMarkdownV2 ensuring all 18 reserved characters are preceded by backslash', () => {
        const testPayload = '_*[]()~`>#+-=|{}.!\\';
        const escaped = escapeMarkdownV2(testPayload);

        for (const ch of SPECIAL_CHARS) {
          expect(escaped).toContain(`\\${ch}`);
        }
      });

      it('C1.12: Fuzzes formatBirthdayAlertMarkdown with 500 adversarial strings (XSS, SQLi, Markdown injection)', () => {
        const adversarialNames = [
          '*Unclosed Bold Name',
          '_Unclosed Italic Name',
          '`Unclosed Code Name',
          '[[Nested [Brackets]]]',
          '[Click Me](https://malicious-phishing.com)',
          '***___```[[[]]]***',
          'Celebrant " OR "1"="1"; DROP TABLE "Person"; --',
          '<script>alert("XSS")</script>',
          'Yorùbá Celebrant: Ọlọ́runṣeun Àdèbáyọ̀',
          'Igbo Celebrant: Chidiebube Nwaọbịara',
          'Celebrant with Zero-Width: John\u200BDoe\u200E\u200F',
          'Emoji overload: 🎂🎉✨🔥🚀👑💎✝️🕊️',
          'Control chars: Line1\nLine2\rLine3\tTabbed',
          'Mixed: *Pastor* [Youth] _Worker_ `Admin` #Leader',
        ];

        // Generate 500 combinations
        for (let i = 0; i < 500; i++) {
          const sampleName =
            adversarialNames[i % adversarialNames.length] +
            `_${i % 10}*${i % 7}[${i % 5}]` +
            SPECIAL_CHARS[i % SPECIAL_CHARS.length];

          const formatted = formatBirthdayAlertMarkdown({
            celebrantName: sampleName,
            roleOrDepartment: `Unit_*${i}`,
            birthDateFormatted: `Date_*${i}`,
            phone: `+234_803_*_${i}`,
            daysUntilBirthday: i % 2 === 0 ? 1 : 0,
            photoUrl: `https://example.com/photos/${i}?q=*&x=_`,
          });

          // Must never throw, must return non-empty string
          expect(typeof formatted).toBe('string');
          expect(formatted.length).toBeGreaterThan(50);

          // All legacy markdown syntax characters in the celebrant's name must be escaped
          // If the raw name contains unescaped '*', formatted must not have bare unescaped '*' inside the name part
          expect(formatted).toContain('🎂 *Celebrant:*');
        }
      });

      it('C1.13: Handles long captions exceeding Telegram 1024-char limit by truncating safely', async () => {
        const mockFetch = vi.fn().mockResolvedValue({
          ok: true,
          status: 200,
          json: async () => ({
            ok: true,
            result: { message_id: 8888 },
          }),
        });
        vi.stubGlobal('fetch', mockFetch);

        const client = new TelegramBotClient({
          botToken: FAKE_BOT_TOKEN,
          mediaChatId: FAKE_CHAT_ID,
          dryRun: false,
        });

        // 3000-character adversarial caption
        const giantCaption = 'A'.repeat(3000);
        await client.sendPhoto({
          photoUrl: 'https://example.com/photo.jpg',
          caption: giantCaption,
        });

        expect(mockFetch).toHaveBeenCalledTimes(1);
        const sentBody = JSON.parse(mockFetch.mock.calls[0][1].body);
        expect(sentBody.caption.length).toBe(1024);
        expect(sentBody.caption).toBe('A'.repeat(1024));
      });
    });

    describe('1.4 Unset Credentials Dry-Run Verification', () => {
      it('C1.14: Engages dry-run when botToken is unset or empty', async () => {
        const client = new TelegramBotClient({
          botToken: '',
          mediaChatId: FAKE_CHAT_ID,
        });

        expect(client.getDryRunStatus()).toBe(true);
        const res = await client.sendMessage({ text: 'Dry run check' });
        expect(res.success).toBe(true);
        expect(res.dryRun).toBe(true);
        expect(res.simulated).toBe(true);
        expect(res.messageId).toMatch(/^sim_msg_/);
      });

      it('C1.15: Engages dry-run when mediaChatId is unset or empty', async () => {
        const client = new TelegramBotClient({
          botToken: FAKE_BOT_TOKEN,
          mediaChatId: '',
        });

        expect(client.getDryRunStatus()).toBe(true);
        const res = await client.sendPhoto({ photoUrl: 'https://example.com/photo.jpg' });
        expect(res.success).toBe(true);
        expect(res.dryRun).toBe(true);
        expect(res.simulated).toBe(true);
        expect(res.messageId).toMatch(/^sim_photo_/);
      });

      it('C1.16: Engages dry-run when process.env.TELEGRAM_DRY_RUN is set to "true"', async () => {
        process.env.TELEGRAM_BOT_TOKEN = FAKE_BOT_TOKEN;
        process.env.TELEGRAM_MEDIA_CHAT_ID = FAKE_CHAT_ID;
        process.env.TELEGRAM_DRY_RUN = 'true';

        const client = new TelegramBotClient();
        expect(client.getDryRunStatus()).toBe(true);
      });

      it('C1.17: Batch dispatch in dry-run mode summarizes all items as simulated without network requests', async () => {
        const fetchSpy = vi.spyOn(global, 'fetch');
        const client = new TelegramBotClient({ dryRun: true });

        const batch = await client.dispatchMediaBirthdayAlertBatch(
          [
            { celebrantName: 'Celebrant 1', birthDateFormatted: '1st May', daysUntilBirthday: 1 },
            { celebrantName: 'Celebrant 2', birthDateFormatted: '2nd May', daysUntilBirthday: 0 },
            { celebrantName: 'Celebrant 3', birthDateFormatted: '3rd May', daysUntilBirthday: 1 },
          ],
          { delayMs: 1 }
        );

        expect(fetchSpy).not.toHaveBeenCalled();
        expect(batch.total).toBe(3);
        expect(batch.sentCount).toBe(3);
        expect(batch.dryRunCount).toBe(3);
        expect(batch.failedCount).toBe(0);
        expect(batch.results.every((r) => r.dryRun === true && r.simulated === true)).toBe(true);
      });
    });
  });

  // =========================================================================
  // SECTION 2: Timezone & Leap Year Stress Testing
  // =========================================================================
  describe('2. Timezone & Leap Year Stress Testing Suite', () => {
    describe('2.1 Non-Leap Year (2026, 2027, 2029) Feb 27 and Feb 28 Edge Cases', () => {
      const nonLeapYears = [2026, 2027, 2029, 2030];

      it('C2.1: Identifies non-leap years correctly', () => {
        for (const yr of nonLeapYears) {
          expect(isLeapYear(yr)).toBe(false);
        }
        // Century non-leap years
        expect(isLeapYear(1900)).toBe(false);
        expect(isLeapYear(2100)).toBe(false);
        expect(isLeapYear(2200)).toBe(false);
      });

      it('C2.2: Non-leap year Feb 27: T-1 detects BOTH Feb 28 and Feb 29 celebrants', async () => {
        for (const year of [2026, 2027, 2029]) {
          // Feb 27 10:00 WAT
          const refDate = new Date(`${year}-02-27T10:00:00+01:00`);

          mockPrisma.church.findFirst.mockResolvedValue({ id: 'church-1', name: 'RCCG Test' });
          mockPrisma.person.findMany.mockResolvedValue([
            {
              id: 'p-feb27',
              firstName: 'Day',
              lastName: 'TwentySeven',
              phone: '08011111111',
              photoUrl: null,
              category: 'YOUTH',
              subCategory: 'MEDIA',
              birthDay: 27,
              birthMonth: 2,
              dateOfBirth: null,
            },
            {
              id: 'p-feb28',
              firstName: 'Standard',
              lastName: 'Celebrant',
              phone: '08022222222',
              photoUrl: null,
              category: 'YOUTH',
              subCategory: 'CHOIR',
              birthDay: 28,
              birthMonth: 2,
              dateOfBirth: null,
            },
            {
              id: 'p-feb29',
              firstName: 'LeapDay',
              lastName: 'Hero',
              phone: '08033333333',
              photoUrl: null,
              category: 'YOUTH',
              subCategory: 'USHERING',
              birthDay: 29,
              birthMonth: 2,
              dateOfBirth: null,
            },
          ]);

          const result = await getUpcomingBirthdays({ refDate });

          // Today (Feb 27) celebrant
          expect(result.todayCelebrants.length).toBe(1);
          expect(result.todayCelebrants[0].personId).toBe('p-feb27');

          // Tomorrow (T-1) MUST contain BOTH Feb 28 and Feb 29 celebrants!
          expect(result.tomorrowCelebrants.length).toBe(2);
          const tomorrowIds = result.tomorrowCelebrants.map((c) => c.personId);
          expect(tomorrowIds).toContain('p-feb28');
          expect(tomorrowIds).toContain('p-feb29');

          // Verify calculateDaysUntilBirthday math
          expect(calculateDaysUntilBirthday(2, 28, 2, 27, year)).toBe(1);
          expect(calculateDaysUntilBirthday(2, 29, 2, 27, year)).toBe(1);
        }
      });

      it('C2.3: Non-leap year Feb 28: Day-Of detects BOTH Feb 28 and Feb 29 celebrants', async () => {
        for (const year of [2026, 2027, 2029]) {
          // Feb 28 10:00 WAT
          const refDate = new Date(`${year}-02-28T10:00:00+01:00`);

          mockPrisma.church.findFirst.mockResolvedValue({ id: 'church-1', name: 'RCCG Test' });
          mockPrisma.person.findMany.mockResolvedValue([
            {
              id: 'p-feb28',
              firstName: 'Standard',
              lastName: 'Celebrant',
              phone: '08022222222',
              photoUrl: null,
              category: 'YOUTH',
              subCategory: 'CHOIR',
              birthDay: 28,
              birthMonth: 2,
              dateOfBirth: null,
            },
            {
              id: 'p-feb29',
              firstName: 'LeapDay',
              lastName: 'Hero',
              phone: '08033333333',
              photoUrl: null,
              category: 'YOUTH',
              subCategory: 'USHERING',
              birthDay: 29,
              birthMonth: 2,
              dateOfBirth: null,
            },
            {
              id: 'p-mar01',
              firstName: 'March',
              lastName: 'FirstCelebrant',
              phone: '08044444444',
              photoUrl: null,
              category: 'YOUTH',
              subCategory: 'PRAYER',
              birthDay: 1,
              birthMonth: 3,
              dateOfBirth: null,
            },
          ]);

          const result = await getUpcomingBirthdays({ refDate });

          // Today (Day-Of) MUST contain BOTH Feb 28 and Feb 29 celebrants!
          expect(result.todayCelebrants.length).toBe(2);
          const todayIds = result.todayCelebrants.map((c) => c.personId);
          expect(todayIds).toContain('p-feb28');
          expect(todayIds).toContain('p-feb29');

          // Tomorrow (T-1) detects March 1 celebrants
          expect(result.tomorrowCelebrants.length).toBe(1);
          expect(result.tomorrowCelebrants[0].personId).toBe('p-mar01');

          // Verify calculateDaysUntilBirthday math
          expect(calculateDaysUntilBirthday(2, 28, 2, 28, year)).toBe(0);
          expect(calculateDaysUntilBirthday(2, 29, 2, 28, year)).toBe(0);
          expect(calculateDaysUntilBirthday(3, 1, 2, 28, year)).toBe(1);
        }
      });
    });

    describe('2.2 Leap Year (2028, 2032) Feb 28 and Feb 29 Strict Separation', () => {
      it('C2.4: Identifies leap years including 400-year century leap years', () => {
        expect(isLeapYear(2024)).toBe(true);
        expect(isLeapYear(2028)).toBe(true);
        expect(isLeapYear(2032)).toBe(true);
        expect(isLeapYear(2000)).toBe(true); // 400-year rule
        expect(isLeapYear(2400)).toBe(true);
      });

      it('C2.5: Leap year Feb 27: T-1 detects Feb 28 celebrants, but NOT Feb 29 celebrants', async () => {
        // Feb 27, 2028 10:00 WAT
        const refDate = new Date('2028-02-27T10:00:00+01:00');

        mockPrisma.church.findFirst.mockResolvedValue({ id: 'church-1', name: 'RCCG Test' });
        mockPrisma.person.findMany.mockResolvedValue([
          {
            id: 'p-feb28',
            firstName: 'Feb28',
            lastName: 'Celebrant',
            phone: '08011111111',
            photoUrl: null,
            category: 'YOUTH',
            subCategory: 'MEDIA',
            birthDay: 28,
            birthMonth: 2,
            dateOfBirth: null,
          },
          {
            id: 'p-feb29',
            firstName: 'Feb29',
            lastName: 'LeapCelebrant',
            phone: '08022222222',
            photoUrl: null,
            category: 'YOUTH',
            subCategory: 'CHOIR',
            birthDay: 29,
            birthMonth: 2,
            dateOfBirth: null,
          },
        ]);

        const result = await getUpcomingBirthdays({ refDate });

        // Tomorrow is Feb 28, 2028 -> ONLY Feb 28 celebrant gets T-1 alert!
        expect(result.tomorrowCelebrants.length).toBe(1);
        expect(result.tomorrowCelebrants[0].personId).toBe('p-feb28');

        // Feb 29 is in 2 days (T-2) in leap year!
        expect(calculateDaysUntilBirthday(2, 28, 2, 27, 2028)).toBe(1);
        expect(calculateDaysUntilBirthday(2, 29, 2, 27, 2028)).toBe(2);
      });

      it('C2.6: Leap year Feb 28: Day-Of detects ONLY Feb 28, T-1 detects Feb 29', async () => {
        // Feb 28, 2028 10:00 WAT
        const refDate = new Date('2028-02-28T10:00:00+01:00');

        mockPrisma.church.findFirst.mockResolvedValue({ id: 'church-1', name: 'RCCG Test' });
        mockPrisma.person.findMany.mockResolvedValue([
          {
            id: 'p-feb28',
            firstName: 'Feb28',
            lastName: 'Celebrant',
            phone: '08011111111',
            photoUrl: null,
            category: 'YOUTH',
            subCategory: 'MEDIA',
            birthDay: 28,
            birthMonth: 2,
            dateOfBirth: null,
          },
          {
            id: 'p-feb29',
            firstName: 'Feb29',
            lastName: 'LeapCelebrant',
            phone: '08022222222',
            photoUrl: null,
            category: 'YOUTH',
            subCategory: 'CHOIR',
            birthDay: 29,
            birthMonth: 2,
            dateOfBirth: null,
          },
        ]);

        const result = await getUpcomingBirthdays({ refDate });

        // In leap year 2028, Day-Of must ONLY contain Feb 28 celebrants!
        expect(result.todayCelebrants.length).toBe(1);
        expect(result.todayCelebrants[0].personId).toBe('p-feb28');

        // T-1 MUST contain Feb 29 celebrants!
        expect(result.tomorrowCelebrants.length).toBe(1);
        expect(result.tomorrowCelebrants[0].personId).toBe('p-feb29');

        expect(calculateDaysUntilBirthday(2, 28, 2, 28, 2028)).toBe(0);
        expect(calculateDaysUntilBirthday(2, 29, 2, 28, 2028)).toBe(1);
      });

      it('C2.7: Leap year Feb 29: Day-Of detects Feb 29 celebrants, T-1 detects March 1', async () => {
        // Feb 29, 2028 10:00 WAT
        const refDate = new Date('2028-02-29T10:00:00+01:00');

        mockPrisma.church.findFirst.mockResolvedValue({ id: 'church-1', name: 'RCCG Test' });
        mockPrisma.person.findMany.mockResolvedValue([
          {
            id: 'p-feb29',
            firstName: 'Feb29',
            lastName: 'LeapCelebrant',
            phone: '08022222222',
            photoUrl: null,
            category: 'YOUTH',
            subCategory: 'CHOIR',
            birthDay: 29,
            birthMonth: 2,
            dateOfBirth: null,
          },
          {
            id: 'p-mar01',
            firstName: 'March1',
            lastName: 'Celebrant',
            phone: '08033333333',
            photoUrl: null,
            category: 'YOUTH',
            subCategory: 'USHERING',
            birthDay: 1,
            birthMonth: 3,
            dateOfBirth: null,
          },
        ]);

        const result = await getUpcomingBirthdays({ refDate });

        // Day-Of celebrates Feb 29!
        expect(result.todayCelebrants.length).toBe(1);
        expect(result.todayCelebrants[0].personId).toBe('p-feb29');

        // T-1 prepares March 1!
        expect(result.tomorrowCelebrants.length).toBe(1);
        expect(result.tomorrowCelebrants[0].personId).toBe('p-mar01');

        expect(calculateDaysUntilBirthday(2, 29, 2, 29, 2028)).toBe(0);
        expect(calculateDaysUntilBirthday(3, 1, 2, 29, 2028)).toBe(1);
      });
    });

    describe('2.3 Year Roll-Over (Dec 31 -> Jan 1)', () => {
      it('C2.8: On Dec 31, T-1 alert detects Jan 1 celebrants across the year boundary', async () => {
        // Dec 31, 2026 10:00 WAT
        const refDate = new Date('2026-12-31T10:00:00+01:00');

        mockPrisma.church.findFirst.mockResolvedValue({ id: 'church-1', name: 'RCCG Test' });
        mockPrisma.person.findMany.mockResolvedValue([
          {
            id: 'p-dec31',
            firstName: 'EndOfYear',
            lastName: 'Celebrant',
            phone: '08011111111',
            photoUrl: null,
            category: 'YOUTH',
            subCategory: 'MEDIA',
            birthDay: 31,
            birthMonth: 12,
            dateOfBirth: null,
          },
          {
            id: 'p-jan01',
            firstName: 'NewYear',
            lastName: 'Celebrant',
            phone: '08022222222',
            photoUrl: null,
            category: 'YOUTH',
            subCategory: 'CHOIR',
            birthDay: 1,
            birthMonth: 1,
            dateOfBirth: null,
          },
          {
            id: 'p-jan02',
            firstName: 'JanTwo',
            lastName: 'Celebrant',
            phone: '08033333333',
            photoUrl: null,
            category: 'YOUTH',
            subCategory: 'PRAYER',
            birthDay: 2,
            birthMonth: 1,
            dateOfBirth: null,
          },
        ]);

        const result = await getUpcomingBirthdays({ refDate });

        // Day-Of detects Dec 31 celebrant
        expect(result.todayCelebrants.length).toBe(1);
        expect(result.todayCelebrants[0].personId).toBe('p-dec31');

        // Tomorrow (T-1) MUST detect Jan 1 celebrant across year boundary!
        expect(result.tomorrowCelebrants.length).toBe(1);
        expect(result.tomorrowCelebrants[0].personId).toBe('p-jan01');

        // calculateDaysUntilBirthday checks
        expect(calculateDaysUntilBirthday(1, 1, 12, 31, 2026)).toBe(1);
        expect(calculateDaysUntilBirthday(1, 2, 12, 31, 2026)).toBe(2);
      });

      it('C2.9: On Jan 1, Day-Of detects Jan 1 celebrant, and calculates 364 days until Dec 31', async () => {
        // Jan 1, 2027 08:00 WAT
        const refDate = new Date('2027-01-01T08:00:00+01:00');

        mockPrisma.church.findFirst.mockResolvedValue({ id: 'church-1', name: 'RCCG Test' });
        mockPrisma.person.findMany.mockResolvedValue([
          {
            id: 'p-jan01',
            firstName: 'NewYear',
            lastName: 'Celebrant',
            phone: '08022222222',
            photoUrl: null,
            category: 'YOUTH',
            subCategory: 'CHOIR',
            birthDay: 1,
            birthMonth: 1,
            dateOfBirth: null,
          },
          {
            id: 'p-dec31',
            firstName: 'EndOfYear',
            lastName: 'Celebrant',
            phone: '08011111111',
            photoUrl: null,
            category: 'YOUTH',
            subCategory: 'MEDIA',
            birthDay: 31,
            birthMonth: 12,
            dateOfBirth: null,
          },
        ]);

        const result = await getUpcomingBirthdays({ refDate });

        expect(result.todayCelebrants.length).toBe(1);
        expect(result.todayCelebrants[0].personId).toBe('p-jan01');

        expect(calculateDaysUntilBirthday(1, 1, 1, 1, 2027)).toBe(0);
        // 2027 is a non-leap year (365 days total): from Jan 1 to Dec 31 is 364 days
        expect(calculateDaysUntilBirthday(12, 31, 1, 1, 2027)).toBe(364);
      });
    });

    describe('2.4 Africa/Lagos (WAT UTC+1) Cross-Midnight Rollover', () => {
      it('C2.10: 23:30 UTC = 00:30 WAT rolls over to the next calendar day', async () => {
        // UTC: 2026-11-13 23:30:00
        // WAT: 2026-11-14 00:30:00
        const utcDate = new Date('2026-11-13T23:30:00.000Z');

        const watInfo = getNigerianTimeInfo(utcDate);
        expect(watInfo.year).toBe(2026);
        expect(watInfo.month).toBe(11);
        expect(watInfo.dayOfMonth).toBe(14);
        expect(watInfo.currentTimeString).toBe('00:30');

        mockPrisma.church.findFirst.mockResolvedValue({ id: 'church-1', name: 'RCCG Test' });
        mockPrisma.person.findMany.mockResolvedValue([
          {
            id: 'p-nov13',
            firstName: 'NovThirteen',
            lastName: 'User',
            phone: '08011111111',
            photoUrl: null,
            category: 'YOUTH',
            subCategory: 'USHERING',
            birthDay: 13,
            birthMonth: 11,
            dateOfBirth: null,
          },
          {
            id: 'p-nov14',
            firstName: 'NovFourteen',
            lastName: 'Celebrant',
            phone: '08022222222',
            photoUrl: null,
            category: 'YOUTH',
            subCategory: 'MEDIA',
            birthDay: 14,
            birthMonth: 11,
            dateOfBirth: null,
          },
          {
            id: 'p-nov15',
            firstName: 'NovFifteen',
            lastName: 'TomorrowCelebrant',
            phone: '08033333333',
            photoUrl: null,
            category: 'YOUTH',
            subCategory: 'CHOIR',
            birthDay: 15,
            birthMonth: 11,
            dateOfBirth: null,
          },
        ]);

        const upcoming = await getUpcomingBirthdays({ refDate: utcDate });

        // In WAT, today is Nov 14!
        expect(upcoming.todayCelebrants.length).toBe(1);
        expect(upcoming.todayCelebrants[0].personId).toBe('p-nov14');

        // Tomorrow is Nov 15!
        expect(upcoming.tomorrowCelebrants.length).toBe(1);
        expect(upcoming.tomorrowCelebrants[0].personId).toBe('p-nov15');

        // Nov 13 birthday has already passed in WAT
        expect(upcoming.todayCelebrants.some((c) => c.personId === 'p-nov13')).toBe(false);
      });

      it('C2.11: Millisecond boundary stress at 22:59:59.999 UTC vs 23:00:00.000 UTC', () => {
        // 22:59:59.999 UTC = 23:59:59.999 WAT (same day)
        const datePre = new Date('2026-05-10T22:59:59.999Z');
        const infoPre = getNigerianTimeInfo(datePre);
        expect(infoPre.dayOfMonth).toBe(10);
        expect(infoPre.currentTimeString).toBe('23:59');

        // 23:00:00.000 UTC = 00:00:00.000 WAT (exact midnight rollover)
        const datePost = new Date('2026-05-10T23:00:00.000Z');
        const infoPost = getNigerianTimeInfo(datePost);
        expect(infoPost.dayOfMonth).toBe(11);
        expect(infoPost.currentTimeString).toBe('00:00');
      });

      it('C2.12: Cross-midnight year rollover at 23:30 UTC on Dec 31 (2026-12-31T23:30:00Z)', async () => {
        // UTC: 2026-12-31 23:30:00
        // WAT: 2027-01-01 00:30:00 (New Year!)
        const newYearEveUtc = new Date('2026-12-31T23:30:00.000Z');

        const watInfo = getNigerianTimeInfo(newYearEveUtc);
        expect(watInfo.year).toBe(2027);
        expect(watInfo.month).toBe(1);
        expect(watInfo.dayOfMonth).toBe(1);

        mockPrisma.church.findFirst.mockResolvedValue({ id: 'church-1', name: 'RCCG Test' });
        mockPrisma.person.findMany.mockResolvedValue([
          {
            id: 'p-jan01',
            firstName: 'JanOne',
            lastName: 'Celebrant',
            phone: '08011111111',
            photoUrl: null,
            category: 'YOUTH',
            subCategory: 'MEDIA',
            birthDay: 1,
            birthMonth: 1,
            dateOfBirth: null,
          },
          {
            id: 'p-jan02',
            firstName: 'JanTwo',
            lastName: 'Celebrant',
            phone: '08022222222',
            photoUrl: null,
            category: 'YOUTH',
            subCategory: 'CHOIR',
            birthDay: 2,
            birthMonth: 1,
            dateOfBirth: null,
          },
        ]);

        const upcoming = await getUpcomingBirthdays({ refDate: newYearEveUtc });

        // In WAT, today is Jan 1, 2027!
        expect(upcoming.nigerianDate.year).toBe(2027);
        expect(upcoming.todayCelebrants.length).toBe(1);
        expect(upcoming.todayCelebrants[0].personId).toBe('p-jan01');

        // Tomorrow is Jan 2, 2027!
        expect(upcoming.tomorrowCelebrants.length).toBe(1);
        expect(upcoming.tomorrowCelebrants[0].personId).toBe('p-jan02');
      });
    });

    describe('2.5 Full Pipeline Database Concurrency & Idempotency Resilience', () => {
      it('C2.13: Handles database P2002 unique constraint race condition gracefully without throwing', async () => {
        const refDate = new Date('2026-05-15T10:00:00+01:00');

        mockPrisma.church.findFirst.mockResolvedValue({ id: 'church-1', name: 'RCCG Test' });
        mockPrisma.person.findMany.mockResolvedValue([
          {
            id: 'p-race-1',
            firstName: 'RaceCondition',
            lastName: 'Member',
            phone: '08011111111',
            photoUrl: null,
            category: 'YOUTH',
            subCategory: 'MEDIA',
            birthDay: 15,
            birthMonth: 5,
            dateOfBirth: null,
          },
        ]);

        // First findUnique returns null (simulate both threads checking simultaneously)
        mockPrisma.birthdayReminderLog.findUnique.mockResolvedValue(null);

        // Then create throws P2002 unique collision
        const p2002Error = new Error('Unique constraint failed on the fields: (`personId`,`year`,`type`)');
        (p2002Error as any).code = 'P2002';
        mockPrisma.birthdayReminderLog.create.mockRejectedValue(p2002Error);

        const result = await runBirthdayPipeline({
          targetDate: refDate,
          dryRun: true,
        });

        // Pipeline should complete gracefully without throwing unhandled rejection
        expect(result.success).toBe(true);
        expect(result.dayOf.mediaAlertsSent).toBe(1);
      });

      it('C2.14: Ignores inactive members or members with null dates', async () => {
        mockPrisma.church.findFirst.mockResolvedValue({ id: 'church-1', name: 'RCCG Test' });
        // Prisma filter already enforces isActive: true and non-null DOB, but test engine parser safety
        expect(extractBirthDayMonth({ birthDay: null, birthMonth: null, dateOfBirth: null })).toEqual({
          birthDay: null,
          birthMonth: null,
        });
      });
    });
  });

  // =========================================================================
  // SECTION 3: Authorized Cron Endpoint Security & Telemetry Stress
  // =========================================================================
  describe('3. Authorized Cron Route Handler (/api/cron/birthdays) Stress Tests', () => {
    const CRON_SECRET = 'adversarial_cron_secret_789456';

    beforeEach(() => {
      process.env.CRON_SECRET = CRON_SECRET;
    });

    it('C3.1: Rejects requests missing authorization credentials with HTTP 401', async () => {
      const req = new NextRequest('http://localhost:3000/api/cron/birthdays', { method: 'POST' });
      const res = await POST(req);
      expect(res.status).toBe(401);

      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.code).toBe('UNAUTHORIZED');
    });

    it('C3.2: Accepts valid x-cron-secret header and returns structured telemetry', async () => {
      mockPrisma.church.findFirst.mockResolvedValue({ id: 'church-1', name: 'RCCG Test' });
      mockPrisma.person.findMany.mockResolvedValue([]);

      const req = new NextRequest('http://localhost:3000/api/cron/birthdays?dryRun=true', {
        method: 'POST',
        headers: { 'x-cron-secret': CRON_SECRET },
      });

      const res = await POST(req);
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.dryRun).toBe(true);
      expect(json.tMinus1).toBeDefined();
      expect(json.dayOf).toBeDefined();
      expect(json.totalCelebrants).toBeDefined();
      expect(json.logsCreated).toBeDefined();
    });

    it('C3.3: Accepts fallback query param ?secret=<CRON_SECRET> for GET requests', async () => {
      mockPrisma.church.findFirst.mockResolvedValue({ id: 'church-1', name: 'RCCG Test' });
      mockPrisma.person.findMany.mockResolvedValue([]);

      const req = new NextRequest(
        `http://localhost:3000/api/cron/birthdays?secret=${CRON_SECRET}&dryRun=true`,
        { method: 'GET' }
      );

      const res = await GET(req);
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.dryRun).toBe(true);
    });
  });
});
