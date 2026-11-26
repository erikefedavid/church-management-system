import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
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

describe('Telegram Bot Client & Media Alert Dispatcher (lib/telegram.ts)', () => {
  const originalEnv = process.env;

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

  describe('1. Markdown Escaping & Template Formatting', () => {
    it('escapes special characters for legacy Telegram Markdown', () => {
      const raw = 'Hello *bold* _italic_ `code` and [link]';
      const escaped = escapeMarkdown(raw);
      expect(escaped).toBe('Hello \\*bold\\* \\_italic\\_ \\`code\\` and \\[link\\]');
    });

    it('escapes 18 special characters for Telegram MarkdownV2', () => {
      const raw = 'Test_1*2[3]4(5)~6`7>8#9+0-1=2|3{4}.5!6\\';
      const escaped = escapeMarkdownV2(raw);
      expect(escaped).toContain('\\.');
      expect(escaped).toContain('\\!');
      expect(escaped).toContain('\\(');
      expect(escaped).toContain('\\)');
      expect(escaped).toContain('\\[3\\]');
      expect(escaped).toContain('\\\\');
    });

    it('handles empty, null, or undefined strings safely in escape functions', () => {
      expect(escapeMarkdown(null)).toBe('');
      expect(escapeMarkdown(undefined)).toBe('');
      expect(escapeMarkdown('')).toBe('');
      expect(escapeMarkdownV2(null)).toBe('');
    });

    it('formats T-1 Media Alert Markdown with celebrant details, role, and action CTA', () => {
      const markdown = formatBirthdayAlertMarkdown({
        celebrantName: 'Sister Mary Jane',
        roleOrDepartment: 'Choir & Worship',
        birthDateFormatted: '14th November',
        daysUntilBirthday: 1,
        phone: '08012345678',
        photoUrl: 'https://example.com/photos/mary.jpg',
      });

      expect(markdown).toContain('RCCG YOUTH MEDIA ALERT — T-1 DAY FLYER NOTICE');
      expect(markdown).toContain('Sister Mary Jane');
      expect(markdown).toContain('Choir & Worship');
      expect(markdown).toContain('14th November');
      expect(markdown).toContain('08012345678');
      expect(markdown).toContain('[High-Res Link](https://example.com/photos/mary.jpg)');
      expect(markdown).toContain('Please prepare birthday flyer today for distribution at 07:00 AM tomorrow');
    });

    it('formats Day-Of Celebration Alert Markdown with publish action CTA', () => {
      const markdown = formatBirthdayAlertMarkdown({
        celebrantName: 'Brother David Adeleke',
        roleOrDepartment: 'Technical & Media',
        birthDateFormatted: '15th November',
        daysUntilBirthday: 0,
        phone: '08098765432',
        photoUrl: 'https://example.com/photos/david.jpg',
      });

      expect(markdown).toContain("RCCG MEDIA CELEBRATION ALERT — TODAY'S CELEBRANT");
      expect(markdown).toContain('Brother David Adeleke');
      expect(markdown).toContain('Technical & Media');
      expect(markdown).toContain('Today (15th November)');
      expect(markdown).toContain('Please publish birthday flyer across church social media');
    });

    it('handles missing photo gracefully in T-1 alert markdown', () => {
      const markdown = formatBirthdayAlertMarkdown({
        celebrantName: 'Samuel Okon',
        birthDateFormatted: '20th November',
        daysUntilBirthday: 1,
        photoUrl: null,
      });

      expect(markdown).toContain('None provided (Use generic church template)');
    });
  });

  describe('2. Automatic Dry-Run Simulation (Zero-Credential Mode)', () => {
    it('engages dry-run mode when environment variables are unset', async () => {
      const client = new TelegramBotClient();
      expect(client.getDryRunStatus()).toBe(true);

      const result = await client.sendMessage({ text: 'Hello dry-run' });
      expect(result.success).toBe(true);
      expect(result.dryRun).toBe(true);
      expect(result.simulated).toBe(true);
      expect(result.messageId).toMatch(/^sim_msg_/);
    });

    it('simulates sendPhoto in dry-run mode without external network requests', async () => {
      const fetchSpy = vi.spyOn(global, 'fetch');
      const client = new TelegramBotClient();

      const result = await client.sendPhoto({
        photoUrl: 'https://example.com/photo.jpg',
        caption: 'Photo test',
      });

      expect(fetchSpy).not.toHaveBeenCalled();
      expect(result.success).toBe(true);
      expect(result.dryRun).toBe(true);
      expect(result.simulated).toBe(true);
      expect(result.method).toBe('sendPhoto');
    });

    it('simulates media alert dispatch in dry-run mode', async () => {
      const res = await sendMediaBirthdayAlert({
        celebrantName: 'Grace Emmanuel',
        birthDateFormatted: '18th November',
        daysUntilBirthday: 1,
        photoUrl: 'https://example.com/grace.jpg',
      });

      expect(res.success).toBe(true);
      expect(res.dryRun).toBe(true);
      expect(res.alertType).toBe('GRAPHICS_T_MINUS_1');
      expect(res.formattedText).toContain('Grace Emmanuel');
    });
  });

  describe('3. Live HTTP API Requests & Mocked Fetch', () => {
    const TEST_TOKEN = '123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11';
    const TEST_CHAT_ID = '-1001234567890';

    it('executes successful sendMessage when configured and API returns 200 OK', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          ok: true,
          result: {
            message_id: 8844,
            chat: { id: -1001234567890, title: 'RCCG Media Team' },
            text: 'Test message',
          },
        }),
      });
      vi.stubGlobal('fetch', mockFetch);

      const client = new TelegramBotClient({
        botToken: TEST_TOKEN,
        mediaChatId: TEST_CHAT_ID,
        dryRun: false,
      });

      expect(client.getDryRunStatus()).toBe(false);

      const result = await client.sendMessage({ text: 'Test alert message' });

      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(mockFetch).toHaveBeenCalledWith(
        `https://api.telegram.org/bot${TEST_TOKEN}/sendMessage`,
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: TEST_CHAT_ID,
            text: 'Test alert message',
            parse_mode: 'Markdown',
            disable_web_page_preview: false,
          }),
        })
      );
      expect(result.success).toBe(true);
      expect(result.messageId).toBe(8844);
    });

    it('executes successful sendPhoto when configured and API returns 200 OK', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          ok: true,
          result: {
            message_id: 8845,
            chat: { id: -1001234567890 },
            caption: 'Celebrant Photo',
          },
        }),
      });
      vi.stubGlobal('fetch', mockFetch);

      const client = new TelegramBotClient({
        botToken: TEST_TOKEN,
        mediaChatId: TEST_CHAT_ID,
        dryRun: false,
      });

      const result = await client.sendPhoto({
        photoUrl: 'https://example.com/celebrant.jpg',
        caption: 'Celebrant Photo',
      });

      expect(mockFetch).toHaveBeenCalledWith(
        `https://api.telegram.org/bot${TEST_TOKEN}/sendPhoto`,
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            chat_id: TEST_CHAT_ID,
            photo: 'https://example.com/celebrant.jpg',
            caption: 'Celebrant Photo',
            parse_mode: 'Markdown',
          }),
        })
      );
      expect(result.success).toBe(true);
      expect(result.messageId).toBe(8845);
    });
  });

  describe('4. Photo-to-Text Fallback Mechanism', () => {
    const TEST_TOKEN = '123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11';
    const TEST_CHAT_ID = '-1001234567890';

    it('automatically falls back to sendMessage when sendPhoto fails (HTTP 400 Bad Request)', async () => {
      // First call (sendPhoto) fails with 400; second call (sendMessage) succeeds with 200
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
          ok: true,
          status: 200,
          json: async () => ({
            ok: true,
            result: { message_id: 9901 },
          }),
        });

      vi.stubGlobal('fetch', mockFetch);

      const client = new TelegramBotClient({
        botToken: TEST_TOKEN,
        mediaChatId: TEST_CHAT_ID,
        dryRun: false,
      });

      const res = await client.dispatchMediaBirthdayAlert({
        celebrantId: 'p-1',
        celebrantName: 'Joshua Daniels',
        birthDateFormatted: '12th November',
        daysUntilBirthday: 1,
        photoUrl: 'https://broken-url.com/photo.jpg',
      });

      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(res.success).toBe(true);
      expect(res.fallbackOccurred).toBe(true);
      expect(res.fallbackReason).toContain('failed to get HTTP URL content');
      expect(res.formattedText).toContain('[Attached Photo Link](https://broken-url.com/photo.jpg)');
      expect(res.messageId).toBe(9901);
    });

    it('sends text message directly without photo attempt if celebrant has no photoUrl', async () => {
      const mockFetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          ok: true,
          result: { message_id: 9902 },
        }),
      });

      vi.stubGlobal('fetch', mockFetch);

      const client = new TelegramBotClient({
        botToken: TEST_TOKEN,
        mediaChatId: TEST_CHAT_ID,
        dryRun: false,
      });

      const res = await client.dispatchMediaBirthdayAlert({
        celebrantId: 'p-2',
        celebrantName: 'Kemi Adebayo',
        birthDateFormatted: '13th November',
        daysUntilBirthday: 1,
        photoUrl: null,
      });

      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(mockFetch).toHaveBeenCalledWith(
        `https://api.telegram.org/bot${TEST_TOKEN}/sendMessage`,
        expect.any(Object)
      );
      expect(res.success).toBe(true);
      expect(res.fallbackOccurred).toBe(false);
    });
  });

  describe('5. Error Codes & Rate Limit (HTTP 429) Handling', () => {
    const TEST_TOKEN = '123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11';
    const TEST_CHAT_ID = '-1001234567890';

    it('handles HTTP 401 Unauthorized without throwing', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        json: async () => ({
          ok: false,
          error_code: 401,
          description: 'Unauthorized: invalid bot token',
        }),
      });
      vi.stubGlobal('fetch', mockFetch);

      const client = new TelegramBotClient({
        botToken: 'invalid_token',
        mediaChatId: TEST_CHAT_ID,
        dryRun: false,
      });

      const res = await client.sendMessage({ text: 'Hello' });

      expect(res.success).toBe(false);
      expect(res.errorCode).toBe(401);
      expect(res.error).toContain('Unauthorized');
      expect(res.retryable).toBe(false);
    });

    it('extracts retry_after when Telegram returns HTTP 429 Too Many Requests', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 429,
        json: async () => ({
          ok: false,
          error_code: 429,
          description: 'Too Many Requests: retry after 8',
          parameters: { retry_after: 8 },
        }),
      });
      vi.stubGlobal('fetch', mockFetch);

      const client = new TelegramBotClient({
        botToken: TEST_TOKEN,
        mediaChatId: TEST_CHAT_ID,
        dryRun: false,
      });

      const res = await client.sendMessage({ text: 'Spammy alert' });

      expect(res.success).toBe(false);
      expect(res.errorCode).toBe(429);
      expect(res.retryAfter).toBe(8);
      expect(res.retryable).toBe(true);
    });

    it('catches network fetch rejection cleanly without crashing', async () => {
      const mockFetch = vi.fn().mockRejectedValue(new Error('DNS resolution failed: EAI_AGAIN'));
      vi.stubGlobal('fetch', mockFetch);

      const client = new TelegramBotClient({
        botToken: TEST_TOKEN,
        mediaChatId: TEST_CHAT_ID,
        dryRun: false,
      });

      const res = await client.sendMessage({ text: 'Hello' });

      expect(res.success).toBe(false);
      expect(res.retryable).toBe(true);
      expect(res.error).toContain('DNS resolution failed');
    });
  });

  describe('6. Batch Dispatching', () => {
    it('dispatches a batch of alerts and summarizes counts', async () => {
      const client = new TelegramBotClient(); // dry run
      const result = await client.dispatchMediaBirthdayAlertBatch(
        [
          {
            celebrantName: 'Member One',
            birthDateFormatted: '1st May',
            daysUntilBirthday: 1,
          },
          {
            celebrantName: 'Member Two',
            birthDateFormatted: '2nd May',
            daysUntilBirthday: 0,
          },
        ],
        { delayMs: 5 }
      );

      expect(result.total).toBe(2);
      expect(result.sentCount).toBe(2);
      expect(result.failedCount).toBe(0);
      expect(result.dryRunCount).toBe(2);
      expect(result.results.length).toBe(2);
    });
  });
});
