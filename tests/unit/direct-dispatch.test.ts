import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  normalizePhoneNumber,
  normalizeNigerianPhone,
  generateWaMeLink,
  dispatchDirectMessage,
  dispatchDirectBatch,
} from '@/lib/direct-dispatch';

describe('Multi-Provider Direct Dispatch Gateway', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('Group 1: Nigerian Phone Normalization', () => {
    it('T1.1: Normalizes standard 11-digit local Nigerian numbers', () => {
      const normalized = normalizePhoneNumber('08031234567');

      expect(normalized.isValid).toBe(true);
      expect(normalized.isNigerian).toBe(true);
      expect(normalized.e164).toBe('+2348031234567');
      expect(normalized.digitsOnly).toBe('2348031234567');
      expect(normalized.nationalFormat).toBe('08031234567');
      expect(normalized.formattedNational).toBe('0803 123 4567');
      expect(normalized.phoneLast4).toBe('4567');
      expect(normalized.countryCode).toBe('234');
    });

    it('T1.2: Strips formatting punctuation, spaces, and brackets', () => {
      const inputs = ['0803 123 4567', '0803-123-4567', '(0803) 123 4567', '+234 (803) 123-4567'];

      for (const input of inputs) {
        const normalized = normalizePhoneNumber(input);
        expect(normalized.isValid).toBe(true);
        expect(normalized.e164).toBe('+2348031234567');
        expect(normalized.digitsOnly).toBe('2348031234567');
        expect(normalized.phoneLast4).toBe('4567');
      }
    });

    it('T1.3: Handles numbers that are already E.164 without double-prepending', () => {
      const normalized = normalizePhoneNumber('+2348031234567');

      expect(normalized.isValid).toBe(true);
      expect(normalized.e164).toBe('+2348031234567');
      expect(normalized.digitsOnly).toBe('2348031234567');
      expect(normalized.nationalFormat).toBe('08031234567');
    });

    it('T1.4: Strips accidental leading zero after 234 country code', () => {
      const inputs = ['+23408031234567', '23408031234567'];

      for (const input of inputs) {
        const normalized = normalizePhoneNumber(input);
        expect(normalized.isValid).toBe(true);
        expect(normalized.e164).toBe('+2348031234567');
        expect(normalized.digitsOnly).toBe('2348031234567');
        expect(normalized.nationalFormat).toBe('08031234567');
      }
    });

    it('T1.5: Infers Nigerian mobile for 10-digit numbers missing leading zero', () => {
      const normalized = normalizePhoneNumber('8031234567');

      expect(normalized.isValid).toBe(true);
      expect(normalized.isNigerian).toBe(true);
      expect(normalized.e164).toBe('+2348031234567');
      expect(normalized.nationalFormat).toBe('08031234567');
    });

    it('T1.6: Preserves foreign international numbers without corrupting with 234', () => {
      const usPhone = normalizePhoneNumber('+14155552671');
      expect(usPhone.isValid).toBe(true);
      expect(usPhone.isNigerian).toBe(false);
      expect(usPhone.e164).toBe('+14155552671');
      expect(usPhone.digitsOnly).toBe('14155552671');

      const ukPhone = normalizePhoneNumber('+447911123456');
      expect(ukPhone.isValid).toBe(true);
      expect(ukPhone.isNigerian).toBe(false);
      expect(ukPhone.e164).toBe('+447911123456');
      expect(ukPhone.digitsOnly).toBe('447911123456');
    });

    it('T1.7: Rejects invalid inputs gracefully without throwing', () => {
      const invalidInputs = ['', '   ', '12345', 'abcdef', 'N/A', 'phone'];

      for (const input of invalidInputs) {
        const result = normalizePhoneNumber(input);
        expect(result.isValid).toBe(false);
        expect(result.error).toBeDefined();
      }
    });

    it('provides normalizeNigerianPhone alias matching normalizePhoneNumber', () => {
      expect(normalizeNigerianPhone('08031234567')).toEqual(normalizePhoneNumber('08031234567'));
    });
  });

  describe('Group 2: 1-Click wa.me Link Generation', () => {
    it('T2.1: Generates clean wa.me links with URL-encoded text', () => {
      const link = generateWaMeLink('2348031234567', 'Hello Emmanuel');
      expect(link).toBe('https://wa.me/2348031234567?text=Hello%20Emmanuel');
    });

    it('T2.2: Accurately encodes emojis, newlines, and special characters', () => {
      const msg = 'Happy Birthday! 🎂🎉\nGod bless you!';
      const link = generateWaMeLink('2348031234567', msg);

      expect(link).toContain('https://wa.me/2348031234567?text=');
      expect(link).toContain('%F0%9F%8E%82'); // 🎂
      expect(link).toContain('%0A'); // newline
    });

    it('T2.3: Guarantees no plus sign or spaces in the destination phone portion', () => {
      const link = generateWaMeLink('+234 803 123 4567', 'Test');
      expect(link.startsWith('https://wa.me/2348031234567?text=')).toBe(true);
      expect(link).not.toContain('https://wa.me/+');
    });
  });

  describe('Group 3: Zero-Credential Fallback Guarantee', () => {
    it('T3.1: Returns FALLBACK_GENERATED and valid waMeUrl when no credentials configured', async () => {
      delete process.env.TERMII_API_KEY;
      delete process.env.TWILIO_ACCOUNT_SID;
      delete process.env.WHATSAPP_CLOUD_API_TOKEN;

      const result = await dispatchDirectMessage({
        to: '08031234567',
        body: 'Hello youth member!',
      });

      expect(result.success).toBe(true);
      expect(result.status).toBe('FALLBACK_GENERATED');
      expect(result.provider).toBe('WA_ME');
      expect(result.waMeUrl).toContain('https://wa.me/2348031234567?text=');
      expect(result.normalizedPhone.isValid).toBe(true);
    });

    it('returns FAILED status non-throwingly if phone number is invalid', async () => {
      const result = await dispatchDirectMessage({
        to: 'invalid-phone',
        body: 'Test',
      });

      expect(result.success).toBe(false);
      expect(result.status).toBe('FAILED');
      expect(result.error).toBeDefined();
    });
  });

  describe('Group 4: Provider Adapter Mocks & Error Recovery', () => {
    it('T4.1: Dispatches successfully via Termii SMS', async () => {
      process.env.TERMII_API_KEY = 'test_termii_key';
      process.env.DIRECT_DISPATCH_PROVIDER = 'TERMII';

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          message_id: 'termii_msg_9988',
          message: 'Successfully Sent',
          balance: 450,
        }),
      });

      const result = await dispatchDirectMessage({
        to: '08031234567',
        body: 'Welcome to RCCG JCZ!',
      });

      expect(result.success).toBe(true);
      expect(result.status).toBe('DELIVERED');
      expect(result.provider).toBe('TERMII');
      expect(result.messageId).toBe('termii_msg_9988');
    });

    it('T4.2: Recovers to wa.me fallback when Termii returns insufficient balance', async () => {
      process.env.TERMII_API_KEY = 'test_termii_key';
      process.env.DIRECT_DISPATCH_PROVIDER = 'TERMII';

      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        json: async () => ({
          message: 'Insufficient balance',
        }),
      });

      const result = await dispatchDirectMessage({
        to: '08031234567',
        body: 'Check-in message',
      });

      expect(result.success).toBe(true);
      expect(result.status).toBe('FALLBACK_GENERATED');
      expect(result.provider).toBe('WA_ME');
      expect(result.error).toContain('Insufficient balance');
      expect(result.waMeUrl).toContain('https://wa.me/2348031234567');
    });

    it('T4.3: Dispatches successfully via Twilio (queued)', async () => {
      process.env.TWILIO_ACCOUNT_SID = 'AC1234567890';
      process.env.TWILIO_AUTH_TOKEN = 'auth_secret';
      process.env.TWILIO_PHONE_NUMBER = '+14155550100';
      process.env.DIRECT_DISPATCH_PROVIDER = 'TWILIO';

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 201,
        json: async () => ({
          sid: 'SM987654321',
          status: 'queued',
        }),
      });

      const result = await dispatchDirectMessage({
        to: '08031234567',
        body: 'Twilio test message',
        channel: 'SMS',
      });

      expect(result.success).toBe(true);
      expect(result.status).toBe('QUEUED');
      expect(result.provider).toBe('TWILIO');
      expect(result.messageId).toBe('SM987654321');
    });

    it('T4.4: Intercepts Meta WhatsApp Cloud 24h Customer Care Window error (131047) and falls back cleanly', async () => {
      process.env.WHATSAPP_CLOUD_API_TOKEN = 'meta_access_token';
      process.env.WHATSAPP_PHONE_NUMBER_ID = '10987654321';
      process.env.DIRECT_DISPATCH_PROVIDER = 'WHATSAPP_CLOUD';

      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        json: async () => ({
          error: {
            message: 'More than 24 hours have passed since the recipient last replied',
            type: 'OAuthException',
            code: 131047,
          },
        }),
      });

      const result = await dispatchDirectMessage({
        to: '08031234567',
        body: 'Hey Tolu, checking in!',
        channel: 'WHATSAPP',
      });

      expect(result.success).toBe(true);
      expect(result.status).toBe('FALLBACK_GENERATED');
      expect(result.provider).toBe('WA_ME');
      expect(result.error).toContain('Meta 24h Customer Care Window Closed');
      expect(result.waMeUrl).toContain('https://wa.me/2348031234567');
    });

    it('T4.5: Recovers gracefully when network fetch rejects', async () => {
      process.env.TERMII_API_KEY = 'test_termii_key';
      process.env.DIRECT_DISPATCH_PROVIDER = 'TERMII';

      global.fetch = vi.fn().mockRejectedValue(new Error('Network offline or socket hang up'));

      const result = await dispatchDirectMessage({
        to: '08031234567',
        body: 'Resilient delivery test',
      });

      expect(result.success).toBe(true);
      expect(result.status).toBe('FALLBACK_GENERATED');
      expect(result.provider).toBe('WA_ME');
      expect(result.error).toContain('Network offline');
      expect(result.waMeUrl).toBeDefined();
    });
  });

  describe('Group 5: Batch Dispatch', () => {
    it('T5.1: Processes multiple recipients and aggregates statistics correctly', async () => {
      delete process.env.TERMII_API_KEY;
      delete process.env.TWILIO_ACCOUNT_SID;
      delete process.env.WHATSAPP_CLOUD_API_TOKEN;

      const payloads = [
        { to: '08031234567', body: 'Msg 1' },
        { to: '08129876543', body: 'Msg 2' },
        { to: 'invalid-number', body: 'Msg 3' },
      ];

      const batchResult = await dispatchDirectBatch(payloads);

      expect(batchResult.total).toBe(3);
      expect(batchResult.fallbackGenerated).toBe(2);
      expect(batchResult.failed).toBe(1);
      expect(batchResult.delivered).toBe(0);
      expect(batchResult.results).toHaveLength(3);
      expect(batchResult.results[0].waMeUrl).toContain('2348031234567');
      expect(batchResult.results[1].waMeUrl).toContain('2348129876543');
      expect(batchResult.results[2].status).toBe('FAILED');
    });
  });
});
