import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  normalizePhoneNumber,
  generateWaMeLink,
  dispatchDirectMessage,
  dispatchDirectBatch,
} from '@/lib/direct-dispatch';

describe('M1 Challenger 2: Adversarial Gateway & Phone Testing', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  // =========================================================================
  // SECTION 1: Phone Normalizer Adversarial Inputs & Boundary Conditions
  // =========================================================================
  describe('Section 1: Phone Normalizer Adversarial Inputs', () => {
    it('C1.1: Correctly handles exotic foreign country codes without corrupting with +234', () => {
      const foreignCases = [
        { raw: '+1 (415) 555-2671', expectedE164: '+14155552671', expectedDigits: '14155552671' },
        { raw: '+1 212 555 0199', expectedE164: '+12125550199', expectedDigits: '12125550199' },
        { raw: '+44 7911 123456', expectedE164: '+447911123456', expectedDigits: '447911123456' },
        { raw: '+44 20 7946 0991', expectedE164: '+442079460991', expectedDigits: '442079460991' },
        { raw: '+49 151 23456789', expectedE164: '+4915123456789', expectedDigits: '4915123456789' },
        { raw: '+49 30 123456', expectedE164: '+4930123456', expectedDigits: '4930123456' },
        { raw: '+81 90 1234 5678', expectedE164: '+819012345678', expectedDigits: '819012345678' },
        { raw: '+81 3 1234 5678', expectedE164: '+81312345678', expectedDigits: '81312345678' },
        { raw: '+233 24 123 4567', expectedE164: '+233241234567', expectedDigits: '233241234567' },
        { raw: '+27 82 123 4567', expectedE164: '+27821234567', expectedDigits: '27821234567' },
        { raw: '+33 6 12 34 56 78', expectedE164: '+33612345678', expectedDigits: '33612345678' },
        { raw: '+91 98765 43210', expectedE164: '+919876543210', expectedDigits: '919876543210' },
      ];

      for (const testCase of foreignCases) {
        const result = normalizePhoneNumber(testCase.raw);
        expect(result.isValid).toBe(true);
        expect(result.isNigerian).toBe(false);
        expect(result.e164).toBe(testCase.expectedE164);
        expect(result.digitsOnly).toBe(testCase.expectedDigits);
        expect(result.e164.startsWith('+234')).toBe(false);
      }
    });

    it('C1.2: Normalizes Nigerian phone formats across all major telco prefixes', () => {
      // MTN, Airtel, Glo, 9mobile prefixes
      const prefixes = [
        '0803', '0806', '0703', '0706', '0813', '0816', '0810', '0814', '0903', '0906', '0913', '0916', // MTN
        '0802', '0808', '0708', '0812', '0701', '0902', '0901', '0904', '0907', '0912',                   // Airtel
        '0805', '0807', '0705', '0815', '0811', '0905', '0915',                                           // Glo
        '0809', '0817', '0818', '0909', '0908',                                                           // 9mobile
      ];

      for (const pfx of prefixes) {
        const raw = `${pfx}1234567`;
        const result = normalizePhoneNumber(raw);
        expect(result.isValid).toBe(true);
        expect(result.isNigerian).toBe(true);
        expect(result.countryCode).toBe('234');
        expect(result.e164).toBe(`+234${pfx.slice(1)}1234567`);
        expect(result.digitsOnly).toBe(`234${pfx.slice(1)}1234567`);
        expect(result.nationalFormat).toBe(raw);
        expect(result.phoneLast4).toBe('4567');
      }
    });

    it('C1.3: Robustly strips accidental leading zeros after country code (+2340...)', () => {
      const inputs = [
        '+23408031234567',
        '23408031234567',
        '+23407031234567',
        '23407031234567',
        '+23409031234567',
        '23409031234567',
        '+234 (0) 803 123 4567',
      ];

      for (const input of inputs) {
        const result = normalizePhoneNumber(input);
        expect(result.isValid).toBe(true);
        expect(result.isNigerian).toBe(true);
        expect(result.e164).not.toContain('+2340');
        expect(result.e164.startsWith('+234')).toBe(true);
        expect(result.digitsOnly.startsWith('234')).toBe(true);
        expect(result.digitsOnly).not.toContain('2340');
        expect(result.phoneLast4).toBe('4567');
      }
    });

    it('C1.4: Handles edge boundary numbers (7-digit minimum, 15-digit maximum E.164)', () => {
      // 7 digits (minimum valid E.164 international)
      const minValid = normalizePhoneNumber('+1234567');
      expect(minValid.isValid).toBe(true);
      expect(minValid.e164).toBe('+1234567');
      expect(minValid.digitsOnly).toBe('1234567');

      // 6 digits (below minimum valid E.164)
      const subMin = normalizePhoneNumber('+123456');
      expect(subMin.isValid).toBe(false);
      expect(subMin.error).toContain('too short');

      // 15 digits (maximum valid E.164 international)
      const maxValid = normalizePhoneNumber('+123456789012345');
      expect(maxValid.isValid).toBe(true);
      expect(maxValid.digitsOnly).toBe('123456789012345');

      // 16 digits (exceeds E.164 maximum)
      const exceedMax = normalizePhoneNumber('+1234567890123456');
      expect(exceedMax.isValid).toBe(false);
      expect(exceedMax.error).toContain('maximum E.164 length of 15 digits');
    });

    it('C1.5: Rejects malformed national codes and non-Nigerian invalid local numbers', () => {
      // In Nigeria, mobile prefixes start with 7, 8, or 9 after leading 0.
      // 060, 050, 040, 030, 020 are not valid Nigerian mobile prefixes.
      const invalidLocal = ['06031234567', '05012345678', '04012345678', '03012345678', '02012345678'];

      for (const input of invalidLocal) {
        const result = normalizePhoneNumber(input);
        expect(result.isValid).toBe(false);
        expect(result.error).toBeDefined();
      }
    });

    it('C1.6: Defends against adversarial alphanumeric, SQL injection, and XSS inputs', () => {
      const adversarialInputs = [
        // Empty / Whitespace
        '',
        '   ',
        '\t\n\r',
        // Pure text
        'not-a-number',
        'undefined',
        'null',
        'NaN',
        'CALL-RCCG-NOW',
        // SQL Injection attempts
        "' OR '1'='1' --",
        'admin\' --',
        '; DROP TABLE "Person"; --',
        'UNION SELECT * FROM "User"',
        // XSS script injection attempts
        '<script>alert("xss")</script>',
        '<img src="x" onerror="alert(1)">',
        'javascript:void(0)',
      ];

      for (const input of adversarialInputs) {
        const result = normalizePhoneNumber(input);
        expect(result.isValid).toBe(false);
        expect(result.error).toBeDefined();
      }
    });

    it('C1.7: Strips punctuation, zero-width spaces, and whitespace gracefully without throwing', () => {
      const inputs = [
        '+234 803 123 4567',
        '+234-803-123-4567',
        '+234 (803) 123-4567',
        '+234.803.123.4567',
        '+234\u200B803\u200B1234567', // Zero-width spaces
        ' 0803 123 4567 ',
        '(0803) 123 4567',
      ];

      for (const input of inputs) {
        const result = normalizePhoneNumber(input);
        expect(result.isValid).toBe(true);
        expect(result.e164).toBe('+2348031234567');
        expect(result.digitsOnly).toBe('2348031234567');
        expect(result.phoneLast4).toBe('4567');
      }
    });

    it('C1.8: Handles foreign numbers without leading plus when 10+ digits without leading zero', () => {
      const usNoPlus = normalizePhoneNumber('14155552671');
      expect(usNoPlus.isValid).toBe(true);
      expect(usNoPlus.isNigerian).toBe(false);
      expect(usNoPlus.e164).toBe('+14155552671');

      const ukNoPlus = normalizePhoneNumber('447911123456');
      expect(ukNoPlus.isValid).toBe(true);
      expect(ukNoPlus.isNigerian).toBe(false);
      expect(ukNoPlus.e164).toBe('+447911123456');
    });

    it('C1.9: Rejects extreme 1,000-character input gracefully without hanging', () => {
      const extremeInput = '9'.repeat(1000);
      const result = normalizePhoneNumber(extremeInput);
      expect(result.isValid).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  // =========================================================================
  // SECTION 2: 1-Click wa.me URL Generation Stress Tests
  // =========================================================================
  describe('Section 2: 1-Click wa.me URL Generation Stress Tests', () => {
    it('C2.1: Strictly guarantees NO + sign in the phone domain across all country codes', () => {
      const phoneSamples = [
        '+2348031234567',
        '2348031234567',
        '+14155552671',
        '+447911123456',
        '+4915123456789',
        '+819012345678',
        '+233241234567',
      ];

      for (const phone of phoneSamples) {
        const link = generateWaMeLink(phone, 'Hello');
        // Extract everything before the query param
        const phoneDomainPart = link.split('?')[0];
        expect(phoneDomainPart).not.toContain('+');
        expect(phoneDomainPart).toMatch(/^https:\/\/wa\.me\/\d+$/);
      }
    });

    it('C2.2: Properly encodes complex multiline messages and Nigerian youth expressions', () => {
      const complexMsg = `Praise God Sister Chioma! 🙏✨
Happy Birthday to you from RCCG Jesus Covenant Zone! 🎂🎉
We thank God for your life and fellowship in the Choir department.

"The LORD bless thee, and keep thee: The LORD make his face shine upon thee..." (Num 6:24-25)

Have a glorious day! ❤️`;

      const link = generateWaMeLink('2348031234567', complexMsg);

      expect(link.startsWith('https://wa.me/2348031234567?text=')).toBe(true);
      // Verify newlines are encoded as %0A
      expect(link).toContain('%0A');
      // Verify emojis are safely percent-encoded
      expect(link).toContain('%F0%9F%99%8F'); // 🙏
      expect(link).toContain('%E2%9C%A8');     // ✨
      expect(link).toContain('%F0%9F%8E%82'); // 🎂
      expect(link).toContain('%F0%9F%8E%89'); // 🎉
      expect(link).toContain('%E2%9D%A4');     // ❤️
      // Verify quotes are encoded
      expect(link).toContain('%22');
    });

    it('C2.3: Safely encodes URL query delimiters (&, ?, #, =, /, %) without breaking URL structure', () => {
      const rawText = 'Meeting at 5pm? Bring 100% attendance & refreshments #JCPrayer / youth=fun';
      const link = generateWaMeLink('2348031234567', rawText);

      // Verify that after '?text=', there are NO unencoded query delimiters: ?, #, &
      const queryPart = link.substring(link.indexOf('?text=') + 6);
      expect(queryPart).not.toContain('&');
      expect(queryPart).not.toContain('#');
      expect(queryPart).toContain('%3F'); // ?
      expect(queryPart).toContain('%26'); // &
      expect(queryPart).toContain('%23'); // #
      expect(queryPart).toContain('%25'); // %
      expect(queryPart).toContain('%3D'); // =
      expect(queryPart).toContain('%2F'); // /
    });

    it('C2.4: Handles massive text bodies (5,000+ characters) without throwing or truncation', () => {
      const hugeText = 'RCCG JCZ Praise Report '.repeat(250); // ~5,750 chars
      const link = generateWaMeLink('2348031234567', hugeText);

      expect(link.startsWith('https://wa.me/2348031234567?text=')).toBe(true);
      expect(link.length).toBeGreaterThan(5000);
    });

    it('C2.5: Handles empty or nullish text without throwing', () => {
      expect(generateWaMeLink('2348031234567', '')).toBe('https://wa.me/2348031234567?text=');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect(generateWaMeLink('2348031234567', null as any)).toBe('https://wa.me/2348031234567?text=');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect(generateWaMeLink(null as any, null as any)).toBe('https://wa.me/?text=');
    });
  });

  // =========================================================================
  // SECTION 3: Adversarial Provider Dispatch & Error Recovery
  // =========================================================================
  describe('Section 3: Adversarial Provider Dispatch & Error Recovery', () => {
    it('C3.1: Survives simulated catastrophic network drops (ECONNREFUSED, timeout, abort)', async () => {
      const networkErrors = [
        new TypeError('Failed to fetch'),
        new Error('connect ECONNREFUSED 127.0.0.1:443'),
        new Error('socket hang up'),
        new Error('AbortError: The operation was aborted due to timeout'),
      ];

      for (const err of networkErrors) {
        process.env.TERMII_API_KEY = 'mock_key';
        process.env.DIRECT_DISPATCH_PROVIDER = 'TERMII';

        global.fetch = vi.fn().mockRejectedValue(err);

        const result = await dispatchDirectMessage({
          to: '08031234567',
          body: 'Testing network resilience',
        });

        // Gateway guarantee: MUST NOT throw, MUST recover to wa.me fallback
        expect(result.success).toBe(true);
        expect(result.status).toBe('FALLBACK_GENERATED');
        expect(result.provider).toBe('WA_ME');
        expect(result.waMeUrl).toContain('https://wa.me/2348031234567?text=Testing%20network%20resilience');
        expect(result.error).toContain(err.message);
      }
    });

    it('C3.2: Handles HTML error responses (502 Bad Gateway / Cloudflare error pages) when JSON parsing fails', async () => {
      process.env.TERMII_API_KEY = 'mock_key';
      process.env.DIRECT_DISPATCH_PROVIDER = 'TERMII';

      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 502,
        // When upstream proxy returns HTML, res.json() rejects with SyntaxError
        json: async () => {
          throw new SyntaxError('Unexpected token < in JSON at position 0');
        },
      });

      const result = await dispatchDirectMessage({
        to: '08031234567',
        body: 'HTML 502 Bad Gateway test',
      });

      expect(result.success).toBe(true);
      expect(result.status).toBe('FALLBACK_GENERATED');
      expect(result.provider).toBe('WA_ME');
      expect(result.error).toContain('502');
      expect(result.waMeUrl).toBeDefined();
    });

    it('C3.3: Recovers from HTTP 401 Unauthorized across Termii, Twilio, and Meta WhatsApp Cloud', async () => {
      const testCases = [
        {
          provider: 'TERMII' as const,
          envSetup: () => { process.env.TERMII_API_KEY = 'bad_termii_key'; },
          mockResponse: { ok: false, status: 401, json: async () => ({ message: 'Unauthorized. Invalid API Key.' }) },
          expectedErrPart: 'Unauthorized',
        },
        {
          provider: 'TWILIO' as const,
          envSetup: () => {
            process.env.TWILIO_ACCOUNT_SID = 'AC_bad';
            process.env.TWILIO_AUTH_TOKEN = 'token_bad';
            process.env.TWILIO_PHONE_NUMBER = '+14155550100';
          },
          mockResponse: { ok: false, status: 401, json: async () => ({ message: 'Authenticate' }) },
          expectedErrPart: 'Authenticate',
        },
        {
          provider: 'WHATSAPP_CLOUD' as const,
          envSetup: () => {
            process.env.WHATSAPP_CLOUD_API_TOKEN = 'bad_token';
            process.env.WHATSAPP_PHONE_NUMBER_ID = 'phone_id';
          },
          mockResponse: { ok: false, status: 401, json: async () => ({ error: { message: 'Invalid OAuth access token' } }) },
          expectedErrPart: 'Invalid OAuth access token',
        },
      ];

      for (const tc of testCases) {
        process.env = { ...originalEnv };
        tc.envSetup();
        process.env.DIRECT_DISPATCH_PROVIDER = tc.provider;

        global.fetch = vi.fn().mockResolvedValue(tc.mockResponse);

        const result = await dispatchDirectMessage({
          to: '08031234567',
          body: `Testing 401 on ${tc.provider}`,
        });

        expect(result.success).toBe(true);
        expect(result.status).toBe('FALLBACK_GENERATED');
        expect(result.provider).toBe('WA_ME');
        expect(result.error).toContain(tc.expectedErrPart);
        expect(result.waMeUrl).toContain('https://wa.me/2348031234567');
      }
    });

    it('C3.4: Recovers from HTTP 403 Forbidden and 429 Too Many Requests', async () => {
      process.env.TWILIO_ACCOUNT_SID = 'AC123456';
      process.env.TWILIO_AUTH_TOKEN = 'auth_secret';
      process.env.TWILIO_PHONE_NUMBER = '+14155550100';
      process.env.DIRECT_DISPATCH_PROVIDER = 'TWILIO';

      // 403 Forbidden
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
        json: async () => ({ message: 'Account is suspended or deactivated' }),
      });

      const res403 = await dispatchDirectMessage({
        to: '08031234567',
        body: 'Testing 403 Forbidden',
      });

      expect(res403.success).toBe(true);
      expect(res403.status).toBe('FALLBACK_GENERATED');
      expect(res403.provider).toBe('WA_ME');
      expect(res403.error).toContain('Account is suspended');

      // 429 Too Many Requests (Rate limit)
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 429,
        json: async () => ({ message: 'Too Many Requests: Rate limit exceeded' }),
      });

      const res429 = await dispatchDirectMessage({
        to: '08031234567',
        body: 'Testing 429 Rate Limit',
      });

      expect(res429.success).toBe(true);
      expect(res429.status).toBe('FALLBACK_GENERATED');
      expect(res429.provider).toBe('WA_ME');
      expect(res429.error).toContain('Too Many Requests');
    });

    it('C3.5: Intercepts Meta WhatsApp 24h Window error (code 131047) and formats descriptive error message', async () => {
      process.env.WHATSAPP_CLOUD_API_TOKEN = 'meta_valid_token';
      process.env.WHATSAPP_PHONE_NUMBER_ID = '10987654321';
      process.env.DIRECT_DISPATCH_PROVIDER = 'WHATSAPP_CLOUD';

      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        json: async () => ({
          error: {
            message: 'Message failed to send because more than 24 hours have passed since the recipient last replied to this number.',
            type: 'OAuthException',
            code: 131047,
            error_data: {
              messaging_product: 'whatsapp',
              details: 'More than 24 hours have passed',
            },
          },
        }),
      });

      const result = await dispatchDirectMessage({
        to: '08031234567',
        body: 'Hello, checking in on you!',
        channel: 'WHATSAPP',
      });

      expect(result.success).toBe(true);
      expect(result.status).toBe('FALLBACK_GENERATED');
      expect(result.provider).toBe('WA_ME');
      expect(result.error).toContain('Meta 24h Customer Care Window Closed');
      expect(result.waMeUrl).toContain('https://wa.me/2348031234567');
      expect(result.providerResponse).toBeDefined();
    });

    it('C3.6: Recovers cleanly when Termii returns HTTP 200 with error JSON (insufficient balance)', async () => {
      process.env.TERMII_API_KEY = 'valid_key_empty_wallet';
      process.env.DIRECT_DISPATCH_PROVIDER = 'TERMII';

      // Termii sometimes returns HTTP 200 but code "400" in JSON
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          code: '400',
          message: 'Insufficient balance. Please fund your wallet.',
        }),
      });

      const result = await dispatchDirectMessage({
        to: '08031234567',
        body: 'Midweek reminder',
      });

      expect(result.success).toBe(true);
      expect(result.status).toBe('FALLBACK_GENERATED');
      expect(result.provider).toBe('WA_ME');
      expect(result.error).toContain('Insufficient balance');
    });

    it('C3.7: Cascades across providers in AUTO mode when first provider fails', async () => {
      // Configure Termii AND Twilio
      process.env.TERMII_API_KEY = 'test_termii';
      process.env.TWILIO_ACCOUNT_SID = 'AC12345';
      process.env.TWILIO_AUTH_TOKEN = 'secret';
      process.env.TWILIO_PHONE_NUMBER = '+14155550100';
      delete process.env.DIRECT_DISPATCH_PROVIDER; // AUTO mode

      // First fetch (Termii) fails with insufficient balance
      // Second fetch (Twilio) succeeds
      global.fetch = vi.fn()
        .mockResolvedValueOnce({
          ok: false,
          status: 400,
          json: async () => ({ message: 'Insufficient balance' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 201,
          json: async () => ({ sid: 'SM_twilio_cascade_ok' }),
        });

      const result = await dispatchDirectMessage({
        to: '08031234567',
        body: 'Cascade test message',
      });

      // Assert it gracefully fell through to Twilio and queued successfully!
      expect(result.success).toBe(true);
      expect(result.status).toBe('QUEUED');
      expect(result.provider).toBe('TWILIO');
      expect(result.messageId).toBe('SM_twilio_cascade_ok');
    });

    it('C3.8: Handles empty body and unrecognized provider cleanly', async () => {
      delete process.env.TERMII_API_KEY;
      delete process.env.TWILIO_ACCOUNT_SID;
      delete process.env.WHATSAPP_CLOUD_API_TOKEN;

      const result = await dispatchDirectMessage({
        to: '08031234567',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        body: undefined as any,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        preferredProvider: 'UNKNOWN_PROVIDER' as any,
      });

      expect(result.success).toBe(true);
      expect(result.status).toBe('FALLBACK_GENERATED');
      expect(result.provider).toBe('WA_ME');
      expect(result.waMeUrl).toBe('https://wa.me/2348031234567?text=');
    });

    it('C3.9: Handles 50 concurrent dispatches without interference', async () => {
      delete process.env.TERMII_API_KEY;
      delete process.env.TWILIO_ACCOUNT_SID;
      delete process.env.WHATSAPP_CLOUD_API_TOKEN;

      const promises = Array.from({ length: 50 }, (_, i) =>
        dispatchDirectMessage({
          to: `080312345${i < 10 ? '0' + i : i}`,
          body: `Concurrent msg ${i}`,
        })
      );

      const results = await Promise.all(promises);
      expect(results).toHaveLength(50);
      for (let i = 0; i < 50; i++) {
        expect(results[i].success).toBe(true);
        expect(results[i].status).toBe('FALLBACK_GENERATED');
        expect(results[i].waMeUrl).toContain(`Concurrent%20msg%20${i}`);
      }
    });
  });

  // =========================================================================
  // SECTION 4: High-Load Adversarial Batch Dispatch Stress Test
  // =========================================================================
  describe('Section 4: Adversarial Batch Dispatch Stress Test', () => {
    it('C4.1: Executes 100-recipient mixed workload without unhandled exceptions', async () => {
      process.env.TERMII_API_KEY = 'mock_key';
      process.env.DIRECT_DISPATCH_PROVIDER = 'TERMII';

      // Mock fetch with oscillating behavior:
      // Calls 0..24: 200 OK (Delivered)
      // Calls 25..49: 400 Insufficient balance (Fallback)
      // Calls 50..74: Network rejection (Fallback)
      let callCount = 0;
      global.fetch = vi.fn().mockImplementation(async () => {
        const current = callCount++;
        if (current < 25) {
          return {
            ok: true,
            status: 200,
            json: async () => ({ message_id: `msg_${current}`, message: 'Successfully Sent' }),
          };
        } else if (current < 50) {
          return {
            ok: false,
            status: 400,
            json: async () => ({ message: 'Termii wallet exhausted' }),
          };
        } else {
          throw new Error('Simulated socket hang up during peak burst');
        }
      });

      // Construct 100 payloads:
      // 75 valid phone numbers (0..74)
      // 25 invalid phone numbers (75..99)
      const payloads = [];
      for (let i = 0; i < 75; i++) {
        payloads.push({
          to: `0803${String(1000000 + i).slice(0, 7)}`,
          body: `Bulk batch item ${i}`,
        });
      }
      for (let i = 75; i < 100; i++) {
        payloads.push({
          to: `invalid-phone-${i}`,
          body: `Bad item ${i}`,
        });
      }

      const batchResult = await dispatchDirectBatch(payloads);

      // Verify aggregate invariants
      expect(batchResult.total).toBe(100);
      expect(batchResult.delivered).toBe(25);
      expect(batchResult.fallbackGenerated).toBe(50);
      expect(batchResult.failed).toBe(25);
      expect(batchResult.queued).toBe(0);
      expect(batchResult.results).toHaveLength(100);

      // Invariant: total === delivered + queued + fallbackGenerated + failed
      expect(
        batchResult.delivered + batchResult.queued + batchResult.fallbackGenerated + batchResult.failed
      ).toBe(batchResult.total);

      // Verify individual result properties
      // First 25: DELIVERED
      for (let i = 0; i < 25; i++) {
        expect(batchResult.results[i].status).toBe('DELIVERED');
        expect(batchResult.results[i].provider).toBe('TERMII');
        expect(batchResult.results[i].messageId).toBe(`msg_${i}`);
      }

      // Next 50: FALLBACK_GENERATED with waMeUrl
      for (let i = 25; i < 75; i++) {
        expect(batchResult.results[i].status).toBe('FALLBACK_GENERATED');
        expect(batchResult.results[i].provider).toBe('WA_ME');
        expect(batchResult.results[i].waMeUrl).toContain('https://wa.me/234803');
      }

      // Last 25: FAILED
      for (let i = 75; i < 100; i++) {
        expect(batchResult.results[i].status).toBe('FAILED');
        expect(batchResult.results[i].error).toBeDefined();
      }
    });

    it('C4.2: Handles empty payload array safely', async () => {
      const batchResult = await dispatchDirectBatch([]);
      expect(batchResult.total).toBe(0);
      expect(batchResult.delivered).toBe(0);
      expect(batchResult.queued).toBe(0);
      expect(batchResult.fallbackGenerated).toBe(0);
      expect(batchResult.failed).toBe(0);
      expect(batchResult.results).toEqual([]);
    });
  });
});
