import { describe, it, expect, vi } from 'vitest';
import {
  renderTemplate,
  interpolateString,
  hashSeed,
  getTemplateBank,
  calculateSmsSegments,
  formatBirthdayDate,
  TemplateCategory,
} from '@/lib/template-engine';

describe('Deterministic 0-Token Template Engine', () => {
  describe('T1: Basic Interpolation', () => {
    it('interpolates firstName and churchName with 0 tokens consumed', () => {
      const result = renderTemplate('MISSED_1_WEEK', {
        firstName: 'Tolu',
        churchName: 'RCCG Jesus Covenant Zone',
      }, { variantIndex: 0 });

      expect(result.tokensConsumed).toBe(0);
      expect(result.text).toContain('Tolu');
      expect(result.text).toContain('RCCG Jesus Covenant Zone');
      expect(result.text).not.toMatch(/{[A-Za-z0-9_]+}/);
      expect(result.unresolvedTokens).toHaveLength(0);
    });
  });

  describe('T2: Null / Empty Name Fallback', () => {
    it('falls back to "friend" when firstName is empty or null, never outputting "null" or "undefined"', () => {
      const resultNull = renderTemplate('MISSED_1_WEEK', {
        firstName: null,
      });

      expect(resultNull.text).not.toContain('null');
      expect(resultNull.text).not.toContain('undefined');
      expect(resultNull.text.toLowerCase()).toMatch(/friend|there/);

      const resultEmpty = renderTemplate('MISSED_1_WEEK', {
        firstName: '   ',
      });
      expect(resultEmpty.text).not.toContain('undefined');
      expect(resultEmpty.text.toLowerCase()).toMatch(/friend|there/);
    });
  });

  describe('T3: Name Capitalization & Sanitization', () => {
    it('converts mixed-case names with leading/trailing spaces into proper title case', () => {
      const result = renderTemplate('FIRST_TIMER_72H', {
        firstName: '  dAnIeL  ',
        lastName: '  oKoNkWo ',
      });

      expect(result.text).toContain('Daniel');
      expect(result.text).not.toContain('dAnIeL');
    });
  });

  describe('T4: Dynamic Department Clause', () => {
    it('appends " with the Ushering team" when department is specified', () => {
      const resultWithDept = renderTemplate(
        'MISSED_1_WEEK',
        {
          firstName: 'Chidinma',
          subCategory: 'USHERING',
        },
        { variantIndex: 1 } // variant 1 uses {DepartmentClause}
      );

      expect(resultWithDept.text).toContain('with the Ushering team');
    });

    it('cleanly omits department clause when department is null or empty', () => {
      const resultNoDept = renderTemplate(
        'MISSED_1_WEEK',
        {
          firstName: 'Chidinma',
          department: null,
          subCategory: null,
        },
        { variantIndex: 1 }
      );

      expect(resultNoDept.text).not.toContain('with the  team');
      expect(resultNoDept.text).not.toContain('{DepartmentClause}');
    });
  });

  describe('T5: Bank Completeness Across All Categories', () => {
    const categories: TemplateCategory[] = [
      'FIRST_TIMER_72H',
      'MISSED_1_WEEK',
      'MISSED_2_WEEKS',
      'DORMANT_CRITICAL',
      'BIRTHDAY_T_MINUS_1_MEDIA',
      'BIRTHDAY_DAY_OF_DM',
      'BIRTHDAY_COMMUNITY',
      'MIDWEEK_REMINDER',
    ];

    it.each(categories)('has at least 3 unique, non-empty templates in %s', (category) => {
      const bank = getTemplateBank(category, 'CASUAL_YOUTH');
      expect(bank.length).toBeGreaterThanOrEqual(3);

      const uniqueTemplates = new Set(bank);
      expect(uniqueTemplates.size).toBe(bank.length);

      for (const t of bank) {
        expect(t.trim().length).toBeGreaterThan(20);
      }
    });
  });

  describe('T6 & T7: Deterministic Seed Hashing & Variety', () => {
    it('produces identical variant index and text given identical seed (idempotency)', () => {
      const run1 = renderTemplate('MISSED_1_WEEK', { firstName: 'Samuel' }, { seed: 'member_abc_123' });
      const run2 = renderTemplate('MISSED_1_WEEK', { firstName: 'Samuel' }, { seed: 'member_abc_123' });

      expect(run1.variantIndex).toBe(run2.variantIndex);
      expect(run1.text).toBe(run2.text);
    });

    it('distributes variants across different seeds (variety)', () => {
      const seeds = ['phone_08031111111', 'phone_08032222222', 'phone_08033333333', 'phone_08034444444', 'phone_08035555555'];
      const indices = seeds.map((s) => renderTemplate('MISSED_1_WEEK', { firstName: 'Tunde' }, { seed: s }).variantIndex);
      const uniqueIndices = new Set(indices);

      expect(uniqueIndices.size).toBeGreaterThan(1);
    });

    it('hashSeed produces 32-bit unsigned integer deterministically', () => {
      const hash1 = hashSeed('rccg_youth_test');
      const hash2 = hashSeed('rccg_youth_test');

      expect(hash1).toBe(hash2);
      expect(hash1).toBeGreaterThanOrEqual(0);
      expect(Number.isInteger(hash1)).toBe(true);
    });
  });

  describe('T8: Emojis and WhatsApp Formatting', () => {
    it('preserves WhatsApp markdown bolding and unicode emojis without byte corruption', () => {
      const result = renderTemplate('BIRTHDAY_DAY_OF_DM', {
        firstName: 'Emmanuel',
      }, { variantIndex: 0 });

      expect(result.text).toContain('Happy Birthday, Emmanuel!');
      expect(result.text).toContain('🎂🎉');
      expect(result.text).toContain('🥳✨');
      expect(result.metadata.isWithinWhatsAppOptimalLength).toBe(true);
    });
  });

  describe('T9: Media Team Markdown Briefing (T-1)', () => {
    it('formats briefing with full name, formatted date, phone, photo status, and 07:00 AM action', () => {
      const result = renderTemplate('BIRTHDAY_T_MINUS_1_MEDIA', {
        firstName: 'Grace',
        lastName: 'Nwosu',
        phone: '08034445566',
        birthMonth: 11,
        birthDay: 14,
        department: 'Media',
        photoUrl: 'https://example.com/photos/grace.jpg',
      }, { variantIndex: 0 });

      expect(result.text).toContain('*Celebrant:* Grace Nwosu');
      expect(result.text).toContain('Tomorrow (November 14)');
      expect(result.text).toContain('*Role / Department:* Media');
      expect(result.text).toContain('*Phone:* 08034445566');
      expect(result.text).toContain('https://example.com/photos/grace.jpg');
      expect(result.text).toContain('07:00 AM');
      expect(result.metadata.hasPhotoUrl).toBe(true);
    });

    it('uses placeholder when photoUrl is missing', () => {
      const result = renderTemplate('BIRTHDAY_T_MINUS_1_MEDIA', {
        firstName: 'Grace',
        lastName: 'Nwosu',
        photoUrl: null,
      }, { variantIndex: 0 });

      expect(result.text).toContain('[Photo requested / Use standard template]');
      expect(result.metadata.hasPhotoUrl).toBe(false);
    });
  });

  describe('T10: Unknown Placeholders & Custom Variables', () => {
    it('reports unresolved tokens and strips them by default', () => {
      const raw = 'Hello {FirstName}, welcome to {CustomMysteryToken}!';
      const { text, unresolvedTokens } = interpolateString(raw, { firstName: 'David' });

      expect(unresolvedTokens).toEqual(['CustomMysteryToken']);
      expect(text).toBe('Hello David, welcome to !');
    });

    it('retains unresolved tokens when stripUnresolved is false', () => {
      const raw = 'Hello {FirstName}, your code is {SecretToken}!';
      const { text, unresolvedTokens } = interpolateString(
        raw,
        { firstName: 'David' },
        { stripUnresolved: false }
      );

      expect(unresolvedTokens).toEqual(['SecretToken']);
      expect(text).toBe('Hello David, your code is {SecretToken}!');
    });

    it('interpolates customFields successfully', () => {
      const raw = 'Hi {FirstName}, your group is {GroupName} led by {LeaderName}!';
      const { text, unresolvedTokens } = interpolateString(raw, {
        firstName: 'Ruth',
        customFields: {
          GroupName: 'Praise Warriors',
          LeaderName: 'Sis Bunmi',
        },
      });

      expect(unresolvedTokens).toHaveLength(0);
      expect(text).toBe('Hi Ruth, your group is Praise Warriors led by Sis Bunmi!');
    });
  });

  describe('T11: SMS Segment Estimation', () => {
    it('calculates GSM-7 segments for plain ASCII under 160 characters', () => {
      const plain = 'Hello from RCCG Jesus Covenant Zone! Hope you are having a wonderful week.';
      const analysis = calculateSmsSegments(plain);

      expect(analysis.encoding).toBe('GSM-7');
      expect(analysis.segments).toBe(1);
    });

    it('calculates GSM-7 segments for long messages (>160 characters)', () => {
      const longPlain = 'A'.repeat(200);
      const analysis = calculateSmsSegments(longPlain);

      expect(analysis.encoding).toBe('GSM-7');
      expect(analysis.segments).toBe(2); // ceil(200 / 153) = 2
    });

    it('identifies UCS-2 encoding and multi-segment limits when emojis are present', () => {
      const emojiText = 'Happy Birthday! 🎉 Stay blessed!';
      const analysis = calculateSmsSegments(emojiText);

      expect(analysis.encoding).toBe('UCS-2');
      expect(analysis.segments).toBe(1); // < 70 chars

      const longEmojiText = '🎉'.repeat(80);
      const longAnalysis = calculateSmsSegments(longEmojiText);
      expect(longAnalysis.encoding).toBe('UCS-2');
      expect(longAnalysis.segments).toBe(2); // ceil(80 / 67) = 2
    });
  });

  describe('T12: Contextual Fields & Tone Variations', () => {
    it('supports DaysAbsent, YouthPastorName, and CelebrantName', () => {
      const template = 'Hello {CelebrantName}, from {YouthPastorName}. You missed {DaysAbsent} days.';
      const { text } = interpolateString(template, {
        celebrantName: 'John Doe',
        youthPastorName: 'Pastor Femi',
        daysAbsent: 14,
      });

      expect(text).toBe('Hello John Doe, from Pastor Femi. You missed 14 days.');
    });

    it('allows rendering with PASTORAL_CARE tone', () => {
      const result = renderTemplate('MISSED_2_WEEKS', {
        firstName: 'Seyi',
        youthPastorName: 'Pastor Femi',
      }, { tone: 'PASTORAL_CARE' });

      expect(result.tone).toBe('PASTORAL_CARE');
      expect(result.text).toContain('Seyi');
      expect(result.tokensConsumed).toBe(0);
    });

    it('formatBirthdayDate formats correctly', () => {
      expect(formatBirthdayDate(1, 5)).toBe('January 5');
      expect(formatBirthdayDate(12, 25)).toBe('December 25');
      expect(formatBirthdayDate(null, null)).toBe('Upcoming');
    });
  });

  describe('T13: AI Assistant Opt-In & Deduplication Caching', () => {
    it('generateFollowUpDraft produces deterministic drafts with 0 external network calls by default', async () => {
      const { generateFollowUpDraft } = await import('@/lib/ai-assistant');
      const fetchSpy = vi.spyOn(global, 'fetch');

      const draft = await generateFollowUpDraft('MISSED_1_WEEK', {
        firstName: 'Tolu',
        lastName: 'Ade',
        phone: '08031234567',
        subCategory: 'MEDIA_TEAM',
      });

      expect(fetchSpy).not.toHaveBeenCalled();
      expect(draft.primary).toContain('Tolu');
      expect(draft.alternative).toBeDefined();
    });

    it('polishDraftWithAi caches responses and returns cached text with 0 tokens on repeat call', async () => {
      const { polishDraftWithAi, clearAiCache, getAiCacheSize } = await import('@/lib/ai-assistant');
      clearAiCache();

      process.env.GEMINI_API_KEY = 'mock_gemini_key';

      const fetchMock = vi.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          candidates: [
            {
              content: {
                parts: [{ text: 'Polished youth check-in message from AI!' }],
              },
            },
          ],
        }),
      } as Response);

      const member = {
        firstName: 'Daniel',
        lastName: 'Okonkwo',
        phone: '08031234567',
      };

      // Call 1: Misses cache, calls Gemini API
      const res1 = await polishDraftWithAi('Base draft', member);
      expect(res1.cached).toBe(false);
      expect(res1.text).toBe('Polished youth check-in message from AI!');
      expect(getAiCacheSize()).toBe(1);
      expect(fetchMock).toHaveBeenCalledTimes(1);

      // Call 2: Hits cache, 0 network calls, 0 tokens
      const res2 = await polishDraftWithAi('Base draft', member);
      expect(res2.cached).toBe(true);
      expect(res2.tokensConsumed).toBe(0);
      expect(res2.text).toBe('Polished youth check-in message from AI!');
      expect(fetchMock).toHaveBeenCalledTimes(1); // Still 1!
    });

    it('falls back seamlessly to base draft if Gemini fails or is unconfigured', async () => {
      const { polishDraftWithAi, clearAiCache } = await import('@/lib/ai-assistant');
      clearAiCache();

      delete process.env.GEMINI_API_KEY;

      const member = { firstName: 'Samuel', lastName: 'Oladipo', phone: '08087774567' };
      const fallback = await polishDraftWithAi('Original reliable base draft', member);

      expect(fallback.text).toBe('Original reliable base draft');
      expect(fallback.tokensConsumed).toBe(0);
    });

    it('generateGraphicsDesignerAlert and generateDayOfBirthdayWish return expected structured outputs', async () => {
      const { generateGraphicsDesignerAlert, generateDayOfBirthdayWish } = await import('@/lib/ai-assistant');

      const birthdayContext = {
        firstName: 'Grace',
        lastName: 'Nwosu',
        phone: '08034445566',
        birthMonth: 11,
        birthDay: 14,
        subCategory: 'USHERING',
        photoUrl: 'https://example.com/grace.png',
      };

      const alert = generateGraphicsDesignerAlert(birthdayContext);
      expect(alert.headline).toBe('Birthday Tomorrow: Grace Nwosu');
      expect(alert.whatsappMessage).toContain('*Celebrant:* Grace Nwosu');
      expect(alert.whatsappMessage).toContain('Ushering');

      const wish = generateDayOfBirthdayWish(birthdayContext);
      expect(wish.whatsappGreeting).toContain('Grace');
      expect(wish.communityAnnouncement).toContain('Grace Nwosu');
    });
  });
});
