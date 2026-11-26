/**
 * AI Assistant for Church Management System
 * RCCG Jesus Covenant Zone
 * 
 * Fulfills Near-Zero Token Usage mandate:
 * 1. Default mode: Uses the deterministic template engine (`lib/template-engine.ts`) with 0 tokens.
 * 2. Opt-in mode: Strictly on-demand LLM polish ("Polish with AI") with deduplication caching.
 * 3. Formats T-1 Day graphics design alerts and day-of celebration blessings.
 * 4. Resilient: If external AI API fails or is unconfigured, seamlessly returns deterministic drafts without throwing.
 */

import {
  renderTemplate,
  formatBirthdayDate,
  TemplateCategory,
  TemplateTone,
} from './template-engine';

export type AbsenceSeverity = 'FIRST_TIMER' | 'MISSED_1_WEEK' | 'MISSED_2_WEEKS' | 'DORMANT_CRITICAL';

export interface MemberContext {
  firstName: string;
  lastName: string;
  phone: string;
  category?: string;
  subCategory?: string | null;
  lastServiceAttended?: string | null;
  lastAttendanceDate?: string | null;
  consecutiveMisses?: number;
  notes?: string | null;
}

export interface BirthdayContext {
  firstName: string;
  lastName: string;
  phone: string;
  category?: string;
  subCategory?: string | null;
  birthDay: number;
  birthMonth: number;
  photoUrl?: string | null;
}

export interface FollowUpDraftOptions {
  polishWithAi?: boolean; // Strictly opt-in flag
  seed?: string | number;
}

// -------------------------------------------------------------
// In-Memory Deduplication Cache for Opt-In LLM Polish
// -------------------------------------------------------------
const aiCache = new Map<string, { polished: string; timestamp: number }>();
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export function clearAiCache(): void {
  aiCache.clear();
}

export function getAiCacheSize(): number {
  return aiCache.size;
}

function computeCacheKey(keyParts: string[]): string {
  // Simple non-cryptographic key combining parts
  return keyParts.map((p) => p.trim()).join(':::');
}

// -------------------------------------------------------------
// Severity & Tone Mappers
// -------------------------------------------------------------
function mapSeverityToCategory(severity: AbsenceSeverity): TemplateCategory {
  switch (severity) {
    case 'FIRST_TIMER':
      return 'FIRST_TIMER_72H';
    case 'MISSED_1_WEEK':
      return 'MISSED_1_WEEK';
    case 'MISSED_2_WEEKS':
      return 'MISSED_2_WEEKS';
    case 'DORMANT_CRITICAL':
    default:
      return 'DORMANT_CRITICAL';
  }
}

function mapTone(tone: 'WARM' | 'CASUAL_YOUTH' | 'PASTORAL' | string): TemplateTone {
  switch (tone) {
    case 'WARM':
      return 'WARM_FELLOWSHIP';
    case 'PASTORAL':
      return 'PASTORAL_CARE';
    case 'CASUAL_YOUTH':
    default:
      return 'CASUAL_YOUTH';
  }
}

// -------------------------------------------------------------
// Opt-In LLM Polish Function (On-Demand only)
// -------------------------------------------------------------
export async function polishDraftWithAi(
  baseDraft: string,
  member: MemberContext,
  tone: string = 'CASUAL_YOUTH'
): Promise<{ text: string; cached: boolean; tokensConsumed: number }> {
  const cacheKey = computeCacheKey([member.phone || member.firstName, baseDraft, tone]);
  const cached = aiCache.get(cacheKey);

  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return {
      text: cached.polished,
      cached: true,
      tokensConsumed: 0, // 0 tokens on cache hit!
    };
  }

  const geminiKey = process.env.GEMINI_API_KEY;
  if (!geminiKey) {
    // If no API key configured, return base draft gracefully
    return {
      text: baseDraft,
      cached: false,
      tokensConsumed: 0,
    };
  }

  try {
    const prompt = `Context: Absent church youth member check-in.
Member: ${member.firstName} ${member.lastName}.
Department: Youth.
Base Draft: "${baseDraft}"
Instructions:
- Keep under 280 characters.
- Maintain authentic, warm Nigerian youth church culture.
- Sound like a caring youth leader or friend, never robotic or corporate.
- Encourage without guilt-tripping.
- Return ONLY the final message text.`;

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-lite-latest:generateContent?key=${geminiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { maxOutputTokens: 120, temperature: 0.7 },
        }),
      }
    );

    if (response.ok) {
      const json = await response.json();
      const polishedText = json?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
      if (polishedText) {
        aiCache.set(cacheKey, { polished: polishedText, timestamp: Date.now() });
        return {
          text: polishedText,
          cached: false,
          tokensConsumed: 120,
        };
      }
    }
  } catch (err) {
    console.warn('Gemini API call failed, falling back to deterministic base draft:', err);
  }

  // Graceful fallback to deterministic base draft
  return {
    text: baseDraft,
    cached: false,
    tokensConsumed: 0,
  };
}

// -------------------------------------------------------------
// 1. Generates Contextual Follow-Up Message Drafts for Absent Youths
// -------------------------------------------------------------
export async function generateFollowUpDraft(
  severity: AbsenceSeverity,
  member: MemberContext,
  tone: 'WARM' | 'CASUAL_YOUTH' | 'PASTORAL' = 'CASUAL_YOUTH',
  options?: FollowUpDraftOptions
): Promise<{ primary: string; alternative: string }> {
  const category = mapSeverityToCategory(severity);
  const primaryTone = mapTone(tone);
  const seed = options?.seed ?? (member.phone || member.firstName);

  // 1. Generate primary deterministic draft (0 tokens)
  const primaryRender = renderTemplate(
    category,
    {
      firstName: member.firstName,
      lastName: member.lastName,
      phone: member.phone,
      category: member.category,
      department: member.subCategory,
      subCategory: member.subCategory,
      consecutiveWeeksMissed: member.consecutiveMisses ?? (severity === 'MISSED_2_WEEKS' ? 2 : 1),
    },
    {
      tone: primaryTone,
      seed,
    }
  );

  // 2. Generate alternative deterministic draft with WARM tone (0 tokens)
  const alternativeRender = renderTemplate(
    category,
    {
      firstName: member.firstName,
      lastName: member.lastName,
      phone: member.phone,
      category: member.category,
      department: member.subCategory,
      subCategory: member.subCategory,
      consecutiveWeeksMissed: member.consecutiveMisses ?? (severity === 'MISSED_2_WEEKS' ? 2 : 1),
    },
    {
      tone: 'WARM_FELLOWSHIP',
      seed: `${seed}_alt`,
    }
  );

  let primaryText = primaryRender.text;

  // 3. Opt-in LLM polish only when explicitly requested
  if (options?.polishWithAi) {
    const polishResult = await polishDraftWithAi(primaryText, member, tone);
    primaryText = polishResult.text;
  }

  return {
    primary: primaryText,
    alternative: alternativeRender.text,
  };
}

// -------------------------------------------------------------
// 2. Generates T-1 Graphics Designer Alert Briefing
// -------------------------------------------------------------
export function generateGraphicsDesignerAlert(member: BirthdayContext): {
  headline: string;
  whatsappMessage: string;
  targetDateFormatted: string;
} {
  const dateFormatted = formatBirthdayDate(member.birthMonth, member.birthDay);

  const rendered = renderTemplate(
    'BIRTHDAY_T_MINUS_1_MEDIA',
    {
      firstName: member.firstName,
      lastName: member.lastName,
      phone: member.phone,
      category: member.category,
      department: member.subCategory,
      subCategory: member.subCategory,
      birthMonth: member.birthMonth,
      birthDay: member.birthDay,
      photoUrl: member.photoUrl,
    },
    {
      tone: 'CASUAL_YOUTH',
      variantIndex: 0,
    }
  );

  return {
    headline: `Birthday Tomorrow: ${member.firstName} ${member.lastName}`,
    whatsappMessage: rendered.text,
    targetDateFormatted: dateFormatted,
  };
}

// -------------------------------------------------------------
// 3. Generates Day-of Birthday Celebration Message
// -------------------------------------------------------------
export function generateDayOfBirthdayWish(member: BirthdayContext): {
  whatsappGreeting: string;
  communityAnnouncement: string;
} {
  const directRender = renderTemplate(
    'BIRTHDAY_DAY_OF_DM',
    {
      firstName: member.firstName,
      lastName: member.lastName,
      phone: member.phone,
      category: member.category,
      department: member.subCategory,
      subCategory: member.subCategory,
      birthMonth: member.birthMonth,
      birthDay: member.birthDay,
    },
    {
      tone: 'CASUAL_YOUTH',
      variantIndex: 0,
    }
  );

  const communityRender = renderTemplate(
    'BIRTHDAY_COMMUNITY',
    {
      firstName: member.firstName,
      lastName: member.lastName,
      phone: member.phone,
      category: member.category,
      department: member.subCategory,
      subCategory: member.subCategory,
      birthMonth: member.birthMonth,
      birthDay: member.birthDay,
    },
    {
      tone: 'CASUAL_YOUTH',
      variantIndex: 0,
    }
  );

  return {
    whatsappGreeting: directRender.text,
    communityAnnouncement: communityRender.text,
  };
}
