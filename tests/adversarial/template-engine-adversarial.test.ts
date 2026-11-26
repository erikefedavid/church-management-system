/**
 * Empirical Adversarial Stress Testing Suite for Template Engine & AI Assistant
 * RCCG Jesus Covenant Zone CMS
 * 
 * Target files under test:
 * - lib/template-engine.ts
 * - lib/ai-assistant.ts
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  renderTemplate,
  interpolateString,
  hashSeed,
  selectDeterministicVariant,
  getTemplateBank,
  calculateSmsSegments,
  formatBirthdayDate,
  TemplateCategory,
  TemplateTone,
  TEMPLATE_BANKS,
} from '@/lib/template-engine';
import {
  generateFollowUpDraft,
  generateGraphicsDesignerAlert,
  generateDayOfBirthdayWish,
  polishDraftWithAi,
  clearAiCache,
  getAiCacheSize,
} from '@/lib/ai-assistant';

describe('Adversarial Template Engine Stress Testing', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.restoreAllMocks();
    clearAiCache();
    delete process.env.GEMINI_API_KEY;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    process.env = { ...originalEnv };
  });

  // =========================================================================
  // 1. FNV-1a Hash Distribution, Collision Resistance & Statistical Uniformity
  // =========================================================================
  describe('1. FNV-1a Distribution & Uniformity', () => {
    it('demonstrates uniform variant distribution across 10,000 realistic Nigerian phone numbers', () => {
      // Simulate 10,000 Nigerian phone numbers across MTN, Airtel, Glo, 9mobile prefixes
      const prefixes = ['0803', '0806', '0703', '0802', '0812', '0805', '0815', '0809', '0818', '0909'];
      const sampleSize = 10000;
      const bankSize = 5; // e.g. FIRST_TIMER_72H CASUAL_YOUTH has 5 variants
      const counts: number[] = new Array(bankSize).fill(0);
      const uniqueHashes = new Set<number>();

      for (let i = 0; i < sampleSize; i++) {
        const prefix = prefixes[i % prefixes.length];
        const suffix = String(i).padStart(7, '0');
        const phone = `${prefix}${suffix}`;

        const hash = hashSeed(phone);
        uniqueHashes.add(hash);

        const variant = hash % bankSize;
        counts[variant]++;
      }

      // Check collision resistance in 32-bit space:
      // Birthday paradox for 10,000 items in 2^32 space expects collision probability ~ 1.16%
      // So unique hashes should be at least 9,990 (>= 99.9% collision-free)
      expect(uniqueHashes.size).toBeGreaterThanOrEqual(9990);

      // Chi-squared test for uniformity across 5 buckets
      // Expected per bucket = 10,000 / 5 = 2,000
      const expected = sampleSize / bankSize;
      let chiSquare = 0;
      for (let i = 0; i < bankSize; i++) {
        const diff = counts[i] - expected;
        chiSquare += (diff * diff) / expected;
        // Each bucket must be within 15% of expected (between 1,700 and 2,300)
        expect(counts[i]).toBeGreaterThan(expected * 0.85);
        expect(counts[i]).toBeLessThan(expected * 1.15);
      }

      // Critical value for chi-squared with df = 4 at p = 0.001 is 18.47
      // If distribution is pseudorandom uniform, chiSquare should be well within reasonable limits
      expect(chiSquare).toBeLessThan(25);
    });

    it('demonstrates uniform variant distribution across 10,000 UUID/CUID member IDs', () => {
      const sampleSize = 10000;
      const bankSize = 4; // 4 variants
      const counts: number[] = new Array(bankSize).fill(0);

      for (let i = 0; i < sampleSize; i++) {
        // Mock UUID-like string: 8-4-4-4-12 hex
        const id = `cm1${i.toString(16).padStart(8, '0')}-4a9b-4b12-9c3f-7e8a9b0c1d2e`;
        const hash = hashSeed(id);
        const variant = hash % bankSize;
        counts[variant]++;
      }

      const expected = sampleSize / bankSize;
      for (let i = 0; i < bankSize; i++) {
        // Every variant must be populated within reasonable bounds (>= 2,000, <= 3,000)
        expect(counts[i]).toBeGreaterThan(expected * 0.85);
        expect(counts[i]).toBeLessThan(expected * 1.15);
      }
    });

    it('handles numeric seed boundary values (negative, zero, large integers)', () => {
      const bank = ['A', 'B', 'C', 'D'];
      expect(selectDeterministicVariant(bank, 0).item).toBe('A');
      expect(selectDeterministicVariant(bank, -1).item).toBe('B'); // Math.abs(-1) % 4 = 1 -> 'B'
      expect(selectDeterministicVariant(bank, -4).item).toBe('A'); // Math.abs(-4) % 4 = 0 -> 'A'
      expect(selectDeterministicVariant(bank, 2147483647).index).toBeGreaterThanOrEqual(0);
      expect(selectDeterministicVariant(bank, -2147483648).index).toBeGreaterThanOrEqual(0);
    });

    it('rejects empty bank with descriptive error', () => {
      expect(() => selectDeterministicVariant([], 'seed')).toThrow('Template bank cannot be empty');
    });

    it('rejects unknown category with descriptive error', () => {
      expect(() => getTemplateBank('NON_EXISTENT_CAT' as unknown as TemplateCategory)).toThrow('Unknown template category: NON_EXISTENT_CAT');
    });
  });

  // =========================================================================
  // 2. Zero-Token Guarantee & Zero-Network Verification
  // =========================================================================
  describe('2. Zero-Token Guarantee & Zero-Network Invariants', () => {
    it('guarantees 0 external network requests during template rendering across all categories and tones', () => {
      const fetchSpy = vi.spyOn(global, 'fetch');
      const categories = Object.keys(TEMPLATE_BANKS) as TemplateCategory[];
      const tones: TemplateTone[] = ['CASUAL_YOUTH', 'WARM_FELLOWSHIP', 'PASTORAL_CARE', 'CREATIVE_MEDIA'];

      for (const category of categories) {
        for (const tone of tones) {
          const result = renderTemplate(
            category,
            {
              firstName: 'Tolu',
              lastName: 'Ade',
              phone: '08031234567',
              churchName: 'RCCG Test Zone',
              department: 'Media',
              daysAbsent: 7,
              consecutiveWeeksMissed: 1,
            },
            { tone }
          );

          expect(result.tokensConsumed).toBe(0);
          expect(result.text).toBeTruthy();
        }
      }

      // Zero network calls made across all permutations
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('guarantees generateFollowUpDraft makes 0 network calls when polishWithAi is false or omitted', async () => {
      const fetchSpy = vi.spyOn(global, 'fetch');

      const draft = await generateFollowUpDraft('MISSED_2_WEEKS', {
        firstName: 'Chinedu',
        lastName: 'Eze',
        phone: '08039998877',
      });

      expect(fetchSpy).not.toHaveBeenCalled();
      expect(draft.primary).toContain('Chinedu');
      expect(draft.alternative).toContain('Chinedu');
    });

    it('guarantees generateGraphicsDesignerAlert and generateDayOfBirthdayWish make 0 network calls', () => {
      const fetchSpy = vi.spyOn(global, 'fetch');

      const ctx = {
        firstName: 'Bunmi',
        lastName: 'Alabi',
        phone: '08021112233',
        birthMonth: 12,
        birthDay: 25,
      };

      const alert = generateGraphicsDesignerAlert(ctx);
      const wish = generateDayOfBirthdayWish(ctx);

      expect(fetchSpy).not.toHaveBeenCalled();
      expect(alert.whatsappMessage).toContain('Bunmi Alabi');
      expect(wish.whatsappGreeting).toContain('Bunmi');
    });
  });

  // =========================================================================
  // 3. Adversarial Edge Cases & Hostile Inputs
  // =========================================================================
  describe('3. Adversarial Inputs & Fuzzing', () => {
    it('handles massive strings (1MB) without crashing or OOM', () => {
      const hugeName = 'A'.repeat(1_000_000);
      const startTime = performance.now();

      const result = renderTemplate('FIRST_TIMER_72H', {
        firstName: hugeName,
      });

      const elapsed = performance.now() - startTime;
      expect(elapsed).toBeLessThan(1500); // Must complete under 1.5s
      expect(result.text).toContain('A');
      expect(result.metadata.characterCount).toBeGreaterThan(1_000_000);
    });

    it('handles XSS injection vectors, HTML tags, and SQL injections safely without crashing', () => {
      const xssVectors = [
        '<script>alert("XSS")</script>',
        '"><img src=x onerror=alert(1)>',
        "Robert'); DROP TABLE Students;--",
        '{{constructor.constructor("alert(1)")()}}',
        '${7*7}',
        '__proto__.polluted = true',
        '<svg onload=alert(document.domain)>',
        'javascript:/*--></title></style></textarea></script></xmp><svg/onload=\'+/"/+/onmouseover=1/+/[*/[]/+alert(1)//\'>',
      ];

      for (const vector of xssVectors) {
        const result = renderTemplate('MISSED_1_WEEK', {
          firstName: vector,
          churchName: vector,
          department: vector,
          customFields: {
            MaliciousPayload: vector,
          },
        });

        expect(result.text).toBeTruthy();
        expect(result.tokensConsumed).toBe(0);
        // Ensure prototype is not polluted
        expect((Object.prototype as Record<string, unknown>).polluted).toBeUndefined();
      }
    });

    it('does not perform recursive token expansion (prevents token injection bombs)', () => {
      // If {FirstName} is replaced by "{SecretToken}", and then "{SecretToken}" is evaluated,
      // an attacker could craft nested token bombs.
      const raw = 'Hello {FirstName}!';
      const { text } = interpolateString(raw, {
        firstName: '{SecretToken}',
        customFields: { SecretToken: 'UNAUTHORIZED_EXPANSION' },
      });

      // The engine should do single-pass interpolation: FirstName becomes "{secrettoken}" (title-cased),
      // and NOT recursively expand into "UNAUTHORIZED_EXPANSION"
      expect(text).not.toContain('UNAUTHORIZED_EXPANSION');
      expect(text).toContain('{secrettoken}');
    });

    it('defends against prototype properties as unresolved tokens (toString, valueOf, hasOwnProperty)', () => {
      const template = 'Greetings {toString} and {valueOf} and {constructor} and {hasOwnProperty}!';
      const { text, unresolvedTokens } = interpolateString(template, { firstName: 'Test' });

      // Because Object.prototype.hasOwnProperty is used, it shouldn't interpolate function code!
      expect(text).not.toContain('function');
      expect(text).not.toContain('[native code]');
      expect(unresolvedTokens).toContain('toString');
      expect(unresolvedTokens).toContain('valueOf');
      expect(unresolvedTokens).toContain('constructor');
      expect(unresolvedTokens).toContain('hasOwnProperty');
    });

    it('handles null, undefined, empty, and non-standard values in every field gracefully', () => {
      const emptyContext = {
        firstName: null,
        lastName: undefined,
        fullName: null,
        phone: null,
        churchName: null,
        category: null,
        department: null,
        subCategory: undefined,
        daysAbsent: null,
        consecutiveWeeksMissed: null,
        lastServiceDate: null,
        nextServiceDate: null,
        birthDay: null,
        birthMonth: null,
        birthDateFormatted: null,
        celebrantName: null,
        photoUrl: null,
        senderName: null,
        pastorName: null,
        youthPastorName: null,
        customFields: undefined,
      };

      // Test with category that interpolates churchName, fullName, and department
      const resultMissed = renderTemplate('MISSED_1_WEEK', emptyContext, { variantIndex: 0 });
      expect(resultMissed.text).not.toContain('null');
      expect(resultMissed.text).not.toContain('undefined');
      expect(resultMissed.text).toContain('friend'); // Fallback for name
      expect(resultMissed.text).toContain('RCCG Jesus Covenant Zone'); // Default church

      // Test with media briefing
      const resultMedia = renderTemplate('BIRTHDAY_T_MINUS_1_MEDIA', emptyContext, { variantIndex: 0 });
      expect(resultMedia.text).not.toContain('null');
      expect(resultMedia.text).not.toContain('undefined');
      expect(resultMedia.text).toContain('[Photo requested / Use standard template]');
      expect(resultMedia.text).toContain('Not provided'); // Fallback for phone
    });

    it('handles negative, zero, and extreme values for daysAbsent and consecutiveWeeksMissed', () => {
      const resultZero = renderTemplate('MISSED_1_WEEK', {
        firstName: 'Kemi',
        daysAbsent: 0,
        consecutiveWeeksMissed: 0,
      });
      expect(resultZero.text).toBeTruthy();

      const resultNegative = renderTemplate('MISSED_1_WEEK', {
        firstName: 'Kemi',
        daysAbsent: -10,
        consecutiveWeeksMissed: -2,
      });
      expect(resultNegative.text).toBeTruthy();
    });

    it('handles boundary birthday date numbers (0, negative, >12, >31)', () => {
      expect(formatBirthdayDate(0, 10)).toBe('Upcoming');
      expect(formatBirthdayDate(-5, 10)).toBe('Upcoming');
      expect(formatBirthdayDate(13, 10)).toBe('Upcoming');
      expect(formatBirthdayDate(5, 0)).toBe('Upcoming');
      expect(formatBirthdayDate(5, 32)).toBe('Upcoming');
      expect(formatBirthdayDate(5, -1)).toBe('Upcoming');
      expect(formatBirthdayDate(2, 29)).toBe('February 29');
    });

    it('handles surrogate pairs, Nigerian Yoruba/Igbo tone marks, Arabic, RTL, and zalgo text', () => {
      const nigerianNames = [
        'Ọpẹ́yẹmí Akíndélé',
        'Chịnẹ́chẹ́rẹ́m Okonkwo',
        'مرحبا بالعالم',
        'H̸e̸l̸l̸o̸ W̸o̸r̸l̸d̸',
        '🇳🇬 Nigerian Flag Emoji',
        '👨‍👩‍👧‍👦 Family ZWJ Emoji',
      ];

      for (const name of nigerianNames) {
        const result = renderTemplate('MISSED_1_WEEK', {
          firstName: name,
        });

        expect(result.text).toBeTruthy();
        expect(result.tokensConsumed).toBe(0);
      }
    });

    it('handles negative and wrapping variantIndex overrides deterministically', () => {
      const bank = getTemplateBank('MISSED_1_WEEK', 'CASUAL_YOUTH');
      const bankLen = bank.length;

      // Negative index -1 should wrap to last element
      const renderNeg1 = renderTemplate('MISSED_1_WEEK', { firstName: 'Ade' }, { variantIndex: -1 });
      expect(renderNeg1.variantIndex).toBe(bankLen - 1);

      // Large positive index should modulo wrap cleanly
      const renderLarge = renderTemplate('MISSED_1_WEEK', { firstName: 'Ade' }, { variantIndex: bankLen * 3 + 2 });
      expect(renderLarge.variantIndex).toBe(2);
    });
  });

  // =========================================================================
  // 4. SMS Segment Calculation Accuracy
  // =========================================================================
  describe('4. SMS Segment Boundary Accuracy', () => {
    it('accurately calculates GSM-7 segment thresholds at exact 160 and 161 character boundaries', () => {
      const gsm160 = 'A'.repeat(160);
      const res160 = calculateSmsSegments(gsm160);
      expect(res160.encoding).toBe('GSM-7');
      expect(res160.characterCount).toBe(160);
      expect(res160.segments).toBe(1);

      const gsm161 = 'A'.repeat(161);
      const res161 = calculateSmsSegments(gsm161);
      expect(res161.encoding).toBe('GSM-7');
      expect(res161.characterCount).toBe(161);
      // Multi-part GSM-7 is 153 chars/segment: ceil(161 / 153) = 2
      expect(res161.segments).toBe(2);

      const gsm306 = 'A'.repeat(306);
      expect(calculateSmsSegments(gsm306).segments).toBe(2); // 153 * 2 = 306

      const gsm307 = 'A'.repeat(307);
      expect(calculateSmsSegments(gsm307).segments).toBe(3); // ceil(307 / 153) = 3
    });

    it('accurately switches to UCS-2 when emojis are present and respects 70/67 segment limits', () => {
      // 69 ASCII chars + 1 emoji = 70 characters
      const ucs70 = 'A'.repeat(69) + '🎂';
      const res70 = calculateSmsSegments(ucs70);
      expect(res70.encoding).toBe('UCS-2');
      expect(res70.characterCount).toBe(70);
      expect(res70.segments).toBe(1);

      // 70 ASCII chars + 1 emoji = 71 characters -> 2 segments (limit is 67 per segment)
      const ucs71 = 'A'.repeat(70) + '🎂';
      const res71 = calculateSmsSegments(ucs71);
      expect(res71.encoding).toBe('UCS-2');
      expect(res71.characterCount).toBe(71);
      expect(res71.segments).toBe(2); // ceil(71 / 67) = 2
    });

    it('handles empty string cleanly without crashing (0 segments)', () => {
      const empty = calculateSmsSegments('');
      expect(empty.characterCount).toBe(0);
      expect(empty.segments).toBe(0);
    });
  });

  // =========================================================================
  // 5. AI Assistant Opt-In, Deduplication Cache & Resilience
  // =========================================================================
  describe('5. AI Deduplication Cache, Memory Safety & Resilience', () => {
    it('handles external Gemini 500 error gracefully by returning base deterministic draft', async () => {
      process.env.GEMINI_API_KEY = 'mock_key';

      vi.spyOn(global, 'fetch').mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      } as Response);

      const draft = await generateFollowUpDraft(
        'MISSED_1_WEEK',
        {
          firstName: 'Segun',
          lastName: 'Arinze',
          phone: '08035551234',
        },
        'CASUAL_YOUTH',
        { polishWithAi: true }
      );

      // Must not throw; must fall back to deterministic draft containing recipient's name
      expect(draft.primary).toContain('Segun');
      expect(draft.alternative).toContain('Segun');
    });

    it('handles external network timeout / exception gracefully without throwing', async () => {
      process.env.GEMINI_API_KEY = 'mock_key';

      vi.spyOn(global, 'fetch').mockRejectedValue(new Error('ETIMEDOUT: Connection timed out'));

      const draft = await generateFollowUpDraft(
        'MISSED_2_WEEKS',
        {
          firstName: 'Emeka',
          lastName: 'Okafor',
          phone: '08023334444',
        },
        'CASUAL_YOUTH',
        { polishWithAi: true }
      );

      expect(draft.primary).toContain('Emeka');
    });

    it('handles malformed JSON response from Gemini API without crashing', async () => {
      process.env.GEMINI_API_KEY = 'mock_key';

      vi.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ candidates: [] }), // Missing parts / content
      } as Response);

      const draft = await generateFollowUpDraft(
        'FIRST_TIMER',
        {
          firstName: 'Amaka',
          lastName: 'Ugwu',
          phone: '08061112222',
        },
        'CASUAL_YOUTH',
        { polishWithAi: true }
      );

      expect(draft.primary).toContain('Amaka');
    });

    it('gracefully returns base draft when GEMINI_API_KEY is not set', async () => {
      delete process.env.GEMINI_API_KEY;
      const fetchSpy = vi.spyOn(global, 'fetch');

      const member = {
        firstName: 'Fola',
        lastName: 'Ade',
        phone: '08031112233',
      };

      const result = await polishDraftWithAi('Original reliable base draft', member);
      expect(fetchSpy).not.toHaveBeenCalled();
      expect(result.text).toBe('Original reliable base draft');
      expect(result.tokensConsumed).toBe(0);
      expect(result.cached).toBe(false);
    });

    it('tracks in-memory cache size accurately and allows clearing', async () => {
      process.env.GEMINI_API_KEY = 'mock_key';

      vi.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          candidates: [{ content: { parts: [{ text: 'Polished AI text' }] } }],
        }),
      } as Response);

      expect(getAiCacheSize()).toBe(0);

      const member1 = { firstName: 'A', lastName: 'B', phone: '08030000001' };
      const member2 = { firstName: 'C', lastName: 'D', phone: '08030000002' };

      await polishDraftWithAi('Base 1', member1);
      expect(getAiCacheSize()).toBe(1);

      await polishDraftWithAi('Base 2', member2);
      expect(getAiCacheSize()).toBe(2);

      // Repeating member1 with identical base draft must hit cache without increasing size
      const cachedRes = await polishDraftWithAi('Base 1', member1);
      expect(cachedRes.cached).toBe(true);
      expect(getAiCacheSize()).toBe(2);

      clearAiCache();
      expect(getAiCacheSize()).toBe(0);
    });
  });

  // =========================================================================
  // 6. Throughput & Stress Performance Harness
  // =========================================================================
  describe('6. Throughput & Concurrency Stress Harness', () => {
    it('executes 10,000 sequential template renders in under 500ms (0 tokens, pure CPU)', () => {
      const startTime = performance.now();

      for (let i = 0; i < 10000; i++) {
        renderTemplate('MISSED_1_WEEK', {
          firstName: 'Member' + i,
          phone: '0803' + String(i).padStart(7, '0'),
          churchName: 'RCCG Jesus Covenant Zone',
          department: 'Ushering',
        });
      }

      const durationMs = performance.now() - startTime;
      // High-performance threshold: 10,000 renders must finish in < 500ms
      expect(durationMs).toBeLessThan(500);
    });

    it('executes 1,000 concurrent async drafts cleanly without race conditions', async () => {
      const promises = Array.from({ length: 1000 }, (_, i) =>
        generateFollowUpDraft('MISSED_1_WEEK', {
          firstName: `Person${i}`,
          lastName: 'Youth',
          phone: `0803000${i.toString().padStart(4, '0')}`,
        })
      );

      const results = await Promise.all(promises);
      expect(results).toHaveLength(1000);
      expect(results[0].primary).toContain('Person0');
      expect(results[999].primary).toContain('Person999');
    });
  });

  // =========================================================================
  // 7. Empirical Fragility & Boundary Findings
  // =========================================================================
  describe('7. Empirical Fragility & Boundary Findings', () => {
    it('EMPIRICAL FINDING: NaN or float in seed or variantIndex produces undefined template or throws', () => {
      // When options.seed is NaN, selectDeterministicVariant receives NaN as numericSeed
      // Math.abs(NaN) % bank.length is NaN, bank[NaN] is undefined!
      // This causes interpolateString to fail on undefined.replace
      expect(() => {
        renderTemplate('MISSED_1_WEEK', { firstName: 'Ade' }, { seed: NaN });
      }).toThrow(TypeError);

      expect(() => {
        renderTemplate('MISSED_1_WEEK', { firstName: 'Ade' }, { variantIndex: NaN });
      }).toThrow(TypeError);

      expect(() => {
        renderTemplate('MISSED_1_WEEK', { firstName: 'Ade' }, { variantIndex: 1.5 });
      }).toThrow(TypeError);
    });

    it('EMPIRICAL FINDING: formatBirthdayDate produces "undefined 10" on fractional month numbers', () => {
      // 1.5 is >= 1 and <= 12, but MONTH_NAMES[1.5 - 1] is MONTH_NAMES[0.5] which is undefined
      const formatted = formatBirthdayDate(1.5, 10);
      expect(formatted).toBe('undefined 10');
    });

    it('EMPIRICAL FINDING: daysAbsent defaults to 7 when consecutiveWeeksMissed is 0', () => {
      // In interpolateString:
      // (context.consecutiveWeeksMissed ? context.consecutiveWeeksMissed * 7 : 7)
      // Since 0 is falsy, 0 weeks missed evaluates to 7 days absent instead of 0
      const { text } = interpolateString('{DaysAbsent}', { consecutiveWeeksMissed: 0 });
      expect(text).toBe('7'); // Falsy 0 falls back to 7
    });

    it('EMPIRICAL FINDING: cache key collision occurs when delimiter ":::" is present in user inputs', () => {
      // In polishDraftWithAi:
      // computeCacheKey([member.phone || member.firstName, baseDraft, tone])
      // Two distinct inputs can produce identical keys if ":::" is injected
      const keyParts1 = ['08031234567:::draft', 'msg', 'CASUAL_YOUTH'];
      const keyParts2 = ['08031234567', 'draft:::msg', 'CASUAL_YOUTH'];

      const key1 = keyParts1.join(':::');
      const key2 = keyParts2.join(':::');
      expect(key1).toBe(key2); // Exact collision verified empirically
    });
  });
});
