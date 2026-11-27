# Architectural Report: Zero-Token Deterministic Template Engine & Youth Message Banks

**Document**: Handoff Report — M1 Explorer 2  
**Target Path**: `lib/template-engine.ts` & Refactored `lib/ai-assistant.ts`  
**Date**: 2026-11-12  
**Status**: Ready for Implementation (M1)  

---

## 1. Observation

Direct examination of the current codebase revealed key structural gaps, legacy assumptions, and token consumption inefficiencies:

1. **Unbounded LLM Token Consumption in `lib/ai-assistant.ts`**:
   - `lib/ai-assistant.ts` lines 48–86 invoke Google Gemini API (`gemini-1.5-flash:generateContent`) unconditionally on every call to `generateFollowUpDraft` if `GEMINI_API_KEY` is set in the environment:
     ```typescript
     const geminiKey = process.env.GEMINI_API_KEY;
     if (geminiKey) {
       // Sends HTTP POST prompt on every single member check-in
       const response = await fetch(`https://generativelanguage.googleapis.com/...`);
     }
     ```
   - There is no caching mechanism; sending follow-ups to 100 absent youths consumes ~12,000–15,000 output tokens plus input overhead.
   - The user follow-up requirement explicitly mandates **Near-Zero Token Usage**: routine operations must consume 0 tokens deterministically, reserving LLM generation strictly as an opt-in/on-demand action (e.g., clicking "Polish with AI").

2. **Repetitive, Static, and Archaic Heuristics in `app/actions/followup.ts`**:
   - Lines 503–521 in `app/actions/followup.ts` contain rigid, single-string switch statements:
     ```typescript
     case 'FIRST_TIMER_WELCOME':
       messageText = `Good day ${person.firstName}! 🎉 It was an honour having you worship with us at RCCG Jesus Covenant Zone! We pray God's immense peace and blessings remain upon you and your family this week...`;
       break;
     case 'ABSENT_CARE':
       messageText = `Hello ${person.firstName}, warm Christian greetings from RCCG Jesus Covenant Zone! We missed your presence in church last Sunday and wanted to check in on your welfare...`;
       break;
     case 'MIDWEEK_REMINDER':
       messageText = `Calvary greetings ${person.firstName}! Join us this evening for our Faith Clinic / Midweek Service at 6:00 PM...`;
       break;
     ```
   - These templates use antiquated religious corporate clichés ("Calvary greetings", "warm Christian greetings", "Good day", "It was an honour") that contradict the required youth-first, relatable Nigerian church culture.
   - Every recipient receives the exact same sentence every time. No rotation, no variety, and no contextual depth.

3. **Naive Placeholder Replacement Without Defensive Fallbacks**:
   - In `app/actions/followup.ts` lines 517–520:
     ```typescript
     case 'CUSTOM':
       messageText = (customBody || 'God bless you!')
         .replace(/{FirstName}/g, person.firstName)
         .replace(/{FullName}/g, `${person.firstName} ${person.lastName}`);
     ```
   - This regex does not handle `null`, `undefined`, or whitespace in `person.firstName`. If `firstName` is blank, it can output `"Good day  !"` or `"Good day undefined!"`.
   - It fails to support `{Department}`, `{Category}`, `{DaysAbsent}`, `{LastServiceDate}`, `{NextSundayDate}`, `{ChurchName}`, `{PhotoUrl}`, or `{PastorName}`.

4. **Database Schema Alignment (`prisma/schema.prisma`)**:
   - `Person` (lines 123–158): provides `firstName`, `lastName`, `phone`, `phoneLast4`, `category` (Enum: `ADULT | YOUTH | WORKER | CHILD`), `subCategory` (e.g., `YOUTH_WORKER`, `ADULT_WORKER`), `photoUrl`, `birthDay`, `birthMonth`.
   - `FollowUpTask` (lines 252–269): `reason` values include `FIRST_TIMER`, `MISSED_1_WEEK`, `MISSED_2_WEEKS`, `DORMANT_CRITICAL`.
   - `BirthdayReminderLog` (lines 234–247): `type` values include `GRAPHICS_T_MINUS_1`, `DAY_OF_CELEBRATION`.

5. **Timezone Uniformity (`lib/service-resolver.ts`)**:
   - Lines 33–73 export `getNigerianTimeInfo` and lines 79–92 export `getNigerianDateMidnight`, ensuring WAT (Africa/Lagos, UTC+1) accuracy for all date formatting and relative calculations.

---

## 2. Logic Chain

From these observations, we derive the structural and algorithmic design of the zero-token deterministic template engine:

1. **Elimination of Mandatory LLM Invocations**:
   - Because follow-up jobs and birthday reminders run routinely via automated crons (`/api/cron/follow-up` and `/api/cron/birthdays`) or bulk dashboard dispatches, relying on external LLM APIs introduces API costs, token quota exhaustion, latency spikes, and external points of failure.
   - Therefore, routine generation must be 100% deterministic (0 tokens) via a self-contained interpolation engine (`lib/template-engine.ts`).

2. **Ensuring Message Freshness Without Randomness**:
   - `Math.random()` creates non-deterministic side effects: re-rendering the UI or generating a test causes unexpected variations, making unit testing brittle and logs non-reproducible.
   - Solution: Use **deterministic hashing** based on invariant identifiers (`personId` or `phone` + `category` + `weekNumber` / `date`) mapped via integer modulo over the template bank length (`Math.abs(hash) % bank.length`).
   - Benefit: A member receives consistent output during a single service cycle, but gets a fresh, non-repetitive variant the following cycle. Admins can also override the variant index manually.

3. **Cultural Calibration for Nigerian Youth Church (RCCG Jesus Covenant Zone)**:
   - Youth church communication requires warmth, energetic affirmation, respect, and zero guilt-tripping.
   - Words like "Calvary greetings" or "Kindly be informed" sound bureaucratic.
   - Natural phrasing: "Hey Tolu!", "The youth family missed your energy on Sunday!", "Big shoutout to you today!", "Praying for supernatural grace in your studies and work this week!".
   - When a member is absent, the message assumes care ("checking in on you", "hope all is well") rather than policing ("you missed service").

4. **Multi-Tone Architecture**:
   - Provide three discrete tone presets:
     1. `CASUAL_YOUTH` (Default for peers, fellow youth members, and youth leaders).
     2. `WARM_FELLOWSHIP` (Slightly warmer, family-oriented fellowship tone).
     3. `PASTORAL_CARE` (Deeper pastoral warmth, suitable for 2-week misses or dormant escalations).
     4. `CREATIVE_MEDIA` (Tailored for Telegram/WhatsApp media alerts for flyer designers).

5. **Defensive Parameter Sanitization & Fallback Pipeline**:
   - Any missing token (e.g., `{Department}` when `subCategory` is `null`) must cleanly resolve to a natural linguistic equivalent (e.g., "church family") rather than emitting empty spaces or leaving `{Department}` in the output.
   - Names must be trimmed and capitalized (`tOLU` → `Tolu`).
   - Unresolved tags must be tracked in telemetry and cleanly scrubbed in production.

6. **Opt-In LLM Architecture with Deduplication Caching**:
   - LLM generation in `lib/ai-assistant.ts` becomes strictly secondary: only called when an admin explicitly requests "Polish with AI".
   - A SHA-256 hash of `(personId + baseText + prompt)` serves as a cache key in an in-memory/KV cache. If the same draft was polished previously, it returns the cached text with 0 additional token consumption.

---

## 3. Detailed Architectural Specification for `lib/template-engine.ts`

### 3.1 Supported Template Categories

| Category Enum | Intended Recipient | Trigger / Context | Youth Tone Highlight |
|---|---|---|---|
| `FIRST_TIMER_72H` | First-time youth visitor | Within 72 hours of first Sunday attendance | High warmth, zero pressure, vibrant welcome to the family |
| `MISSED_1_WEEK` | Active youth member | Missed 1 Sunday service | Friendly check-in, missed their vibe/energy, general well-being check |
| `MISSED_2_WEEKS` | Active youth member | Missed 2 consecutive Sundays | Deeper empathy, prayer cover, checking on life/work/school stress |
| `DORMANT_CRITICAL` | Disengaged youth member | Missed 3+ weeks or flagged | Unconditional love, open arms, no condemnation, pastoral warmth |
| `BIRTHDAY_T_MINUS_1_MEDIA` | Media / Graphics Team | 24 hours before celebrant's birthday | Structured Markdown briefing with photo URL and flyer deadline |
| `BIRTHDAY_DAY_OF_DM` | Celebrant (Direct Message) | Morning of birthday (07:00 WAT) | Joyous, prophetic blessings, celebrating them as a champion |
| `BIRTHDAY_COMMUNITY` | Church / Youth Group Chat | Morning of birthday | Community rallying call, scripture blessing, high celebration |
| `MIDWEEK_REMINDER` | All youth members | Wednesday/Thursday before midweek fellowship | Short, punchy, energetic recharge reminder |

---

### 3.2 TypeScript Type Definitions & Interfaces

```typescript
export type TemplateCategory =
  | 'FIRST_TIMER_72H'
  | 'MISSED_1_WEEK'
  | 'MISSED_2_WEEKS'
  | 'DORMANT_CRITICAL'
  | 'BIRTHDAY_T_MINUS_1_MEDIA'
  | 'BIRTHDAY_DAY_OF_DM'
  | 'BIRTHDAY_COMMUNITY'
  | 'MIDWEEK_REMINDER';

export type TemplateTone = 'CASUAL_YOUTH' | 'WARM_FELLOWSHIP' | 'PASTORAL_CARE' | 'CREATIVE_MEDIA';

export interface TemplateContext {
  // Member Identity
  firstName: string;
  lastName?: string;
  fullName?: string;
  phone?: string;

  // Church & Demographics
  churchName?: string; // Default: 'RCCG Jesus Covenant Zone'
  category?: 'YOUTH' | 'WORKER' | 'ADULT' | 'CHILD' | string;
  department?: string | null; // e.g. "Media", "Choir", "Ushering", "Technical"
  subCategory?: string | null;

  // Attendance & Absence Context
  daysAbsent?: number | string;
  consecutiveWeeksMissed?: number;
  lastServiceDate?: string;
  nextServiceDate?: string;

  // Birthday Context
  birthDay?: number;
  birthMonth?: number;
  birthDateFormatted?: string; // e.g. "November 14"
  photoUrl?: string | null;

  // Attribution
  senderName?: string; // e.g. "Bro. Daniel", "Youth Leadership"
  pastorName?: string; // e.g. "Youth Pastor"

  // Custom Key-Value overrides
  customFields?: Record<string, string | number>;
}

export interface RenderOptions {
  tone?: TemplateTone;
  variantIndex?: number; // Explicit override
  seed?: string | number; // Stable identifier for deterministic rotation
  stripUnresolved?: boolean; // Default true: cleans `{...}` from final text
  fallbackValues?: Record<string, string>;
}

export interface RenderedTemplate {
  text: string;
  category: TemplateCategory;
  tone: TemplateTone;
  variantIndex: number;
  totalVariantsAvailable: number;
  tokensConsumed: 0; // Pure deterministic 0-token guarantee
  unresolvedTokens: string[];
  metadata: {
    characterCount: number;
    estimatedSmsSegments: number; // 1 segment <= 160 chars (GSM-7)
    isWithinWhatsAppOptimalLength: boolean; // < 400 chars
    hasPhotoUrl: boolean;
  };
}
```

---

### 3.3 Deterministic Seed Hashing Algorithm

```typescript
/**
 * 32-bit FNV-1a non-cryptographic hash for uniform, deterministic distribution
 * without external libraries or Math.random().
 */
export function hashSeed(seed: string): number {
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0); // Convert to unsigned 32-bit integer
}

export function selectDeterministicVariant<T>(bank: T[], seed: string | number): { item: T; index: number } {
  if (bank.length === 0) {
    throw new Error('Template bank cannot be empty');
  }
  const numericSeed = typeof seed === 'number' ? seed : hashSeed(String(seed));
  const index = Math.abs(numericSeed) % bank.length;
  return { item: bank[index], index };
}
```

---

### 3.4 High-Variety Youth-Friendly Message Banks (Full Specification)

Each category contains 4–6 hand-crafted variants written in natural, relatable Nigerian youth fellowship cadence:

#### 1. `FIRST_TIMER_72H` (Welcome & Connect)
- **Variant 0 (Energetic Family Welcome)**:  
  `Hey {FirstName}! 🎉 It was so awesome having you fellowship with us at {ChurchName} on Sunday! The entire youth family is super excited you came. Hope you felt right at home! How is your week going so far? We'd love to see your face again this Sunday! ✨`
- **Variant 1 (Warm & Relaxed)**:  
  `Hi {FirstName}! Just wanted to personally thank you for worshipping with us on Sunday at {ChurchName}. Your presence truly added colour to our service! Praying your week is loaded with favour and open doors. You're always welcome in our corner! 🙌`
- **Variant 2 (Empathetic & Welcoming)**:  
  `Hello {FirstName}! We're still smiling thinking about having you with us on Sunday! Starting something new can be a lot, but we hope you found a genuine family in {ChurchName}. If you ever need prayer, study buddies, or just someone to gist with, we're here for you! ❤️`
- **Variant 3 (Sunday Anticipation)**:  
  `Hey {FirstName}! Big shoutout for joining our youth service on Sunday! The worship and word were powerful, and having you there made it even better. Hope exams/work is treating you well this week. Can't wait to worship together again this coming Sunday! 🔥`
- **Variant 4 (Thoughtful & Uplifting)**:  
  `Blessed day {FirstName}! Truly blessed to have connected with you at {ChurchName} this past Sunday. May God's peace speak for you in all you do this week. Feel free to reach out anytime—you are family now! 🙏✨`

#### 2. `MISSED_1_WEEK` (1-Week Friendly Absence Check-In)
- **Variant 0 (Missed Your Energy)**:  
  `Hey {FirstName}! We definitely noticed you weren't in service yesterday at {ChurchName} and the family missed your presence and energy! Hope everything is good on your end? Just wanted to check in and wish you a fruitful week ahead! 🌟`
- **Variant 1 (Holding Down The Fort)**:  
  `Hi {FirstName}! Just checking in on you. Service yesterday was great, but it wasn't the same without you holding down the fort with us{DepartmentClause}. Hope school/work isn't stressing you too much? Rooting for you this week! 💪`
- **Variant 2 (Gentle Welfare Check)**:  
  `Hello {FirstName}! Thinking of you today! We missed your bright smile in fellowship yesterday. Hope you're staying strong and well rested. Sending you warmth and God's peace for the week ahead! ❤️`
- **Variant 3 (Encouragement & Sunday Reminder)**:  
  `Hey {FirstName}! Hope your Monday is starting on a high note! We missed seeing you on Sunday at {ChurchName}. Whatever you have on your plate this week, know that God has got you covered. Looking forward to catching up this Sunday! 🕊️`
- **Variant 4 (Affirming & Warm)**:  
  `Hi {FirstName}! Wanted to drop a quick note to say we missed you in church yesterday. Praying that supernatural ease attends everything your hands touch this week. Catch you soon! 🙌`

#### 3. `MISSED_2_WEEKS` (2-Week Caring Pastoral Outreach)
- **Variant 0 (Genuine Care & Support)**:  
  `Hello {FirstName}! You've really been on our hearts and in our prayers. We noticed it's been two Sundays since we caught up at {ChurchName}, and we just wanted to be sure you are doing okay. If there's anything you're navigating or need prayer support with, please know we are always here for you! 🤗`
- **Variant 1 (Family Misses You)**:  
  `Hey {FirstName}, peace and grace to you! The fellowship hasn't felt complete without you these past two weeks. Life can get overwhelmingly busy sometimes, but please remember your youth family loves and values you deeply. How are things going with you? ❤️`
- **Variant 2 (Safe Space & Prayer)**:  
  `Hi {FirstName}! Just reaching out with genuine love from {ChurchName}. We miss seeing your face in service! We pray that God surrounds you with strength, peace, and clarity in whatever season you're in. We'd love to hear from you whenever you have a moment! 🙏`
- **Variant 3 (Pastoral Warmth)**:  
  `Hello {FirstName}, we've missed you dearly these past couple of weeks{DepartmentClause}! Please know that you are treasured in this house. No pressure at all—just wanted to remind you that you have brothers and sisters standing in faith with you. God bless you! ✨`

#### 4. `DORMANT_CRITICAL` (Extended Absence — Zero Guilt / Pure Grace)
- **Variant 0 (Unconditional Welcome)**:  
  `Dear {FirstName}, warm love from the entire leadership and family at {ChurchName}. You have been in our constant thoughts and prayers. Whatever life has brought your way recently, our arms and doors are always wide open for you. We would love to catch up over a call whenever you're free! ❤️🙏`
- **Variant 1 (Reassurance & Value)**:  
  `Hi {FirstName}, sending you God's immense peace today. You are a valued part of this family, and no matter how long it's been, that never changes. Praying God's shield of grace covers you and your family. We are always in your corner! 🕊️`
- **Variant 2 (Deep Fellowship Love)**:  
  `Hello {FirstName}! We pray God's strength is uplifting you today. You've been deeply missed at {ChurchName}. Just dropping this note to let you know you are loved, remembered, and prayed for. God's grace upon your path always! 🌟`
- **Variant 3 (Open Heart & Listening Ear)**:  
  `Dear {FirstName}, checking in with you with all our hearts. Life comes in seasons, but God's love and this family remain constant for you. If you ever need a listening ear, a quiet prayer, or just to chat, we are here. Have a blessed week! ✨`

#### 5. `BIRTHDAY_T_MINUS_1_MEDIA` (Telegram & Media Alert for Flyer Designers)
- **Variant 0 (Standard Markdown Briefing)**:  
  `🎨 *RCCG YOUTH MEDIA ALERT — T-1 DAY FLYER NOTICE*\n\n` +
  `🎂 *Celebrant:* {FullName}\n` +
  `📅 *Date:* Tomorrow ({BirthDateFormatted})\n` +
  `🏢 *Role / Department:* {Department}\n` +
  `📞 *Phone:* {Phone}\n` +
  `📸 *Photo:* {PhotoStatus}\n\n` +
  `⚡ *Action Required:* Please finalize the celebration flyer today so it is ready for 07:00 AM distribution tomorrow! 🚀`
- **Variant 1 (Priority Design Reminder)**:  
  `⏰ *DESIGN TEAM NOTICE: BIRTHDAY TOMORROW*\n\n` +
  `Let's celebrate our own! {FullName} turns a year older tomorrow ({BirthDateFormatted}).\n` +
  `• *Department:* {Department}\n` +
  `• *Photo Asset:* {PhotoStatus}\n` +
  `• *Contact:* {Phone}\n\n` +
  `👉 *Designer on duty:* Please export high-res PNG and upload before midnight. Thank you for your service! 🎨✨`
- **Variant 2 (Celebration Heads-Up)**:  
  `📢 *MEDIA DESK BRIEFING (T-1 ALERT)*\n\n` +
  `Upcoming Youth Birthday: *{FullName}*\n` +
  `• *Date:* Tomorrow, {BirthDateFormatted}\n` +
  `• *Wing:* {Department}\n` +
  `• *Photo Reference:* {PhotoStatus}\n\n` +
  `Please verify flyer layout, name spelling, and scripture quote. Target broadcast ready by 07:00 AM! 🙌`

#### 6. `BIRTHDAY_DAY_OF_DM` (Direct WhatsApp / SMS to Celebrant)
- **Variant 0 (Joyous & Prophetic)**:  
  `Happy Birthday, {FirstName}! 🎂🎉\n\nOn behalf of everyone at {ChurchName}, we celebrate God's immense goodness in your life today! May this new year launch you into supernatural speed, wisdom, uncommon favour, and divine breakthroughs in your career, academics, and walk with God! Keep shining brilliantly for Christ! Enjoy your day to the fullest! 🥳✨`
- **Variant 1 (Grace & Acceleration)**:  
  `Big Happy Birthday, {FirstName}! 🎈🥳\n\nToday we celebrate the awesome person and blessing you are to our youth church{DepartmentClause}! The Lord make His face shine upon you and be gracious to you. May this new chapter be your best yet—filled with answered prayers and joyful testimonies! Have a fantastic celebration! 🔥🙌`
- **Variant 2 (Victorious New Chapter)**:  
  `It's your special day, {FirstName}! 🎊🎂\n\nShouting the warmest birthday blessings to you! Thank you for the joy and light you bring to our family. As you clock this new age, may the Lord open doors no man can shut and satisfy you with long life and prosperity (Psalm 91:16). Cheers to greater heights! 🥂❤️`
- **Variant 3 (Prophetic Increase)**:  
  `Happy Birthday, champion {FirstName}! 🎂🌟\n\nMay God increase your greatness and comfort you on every side in this new season! You are stepping into a year of peace, divine health, and undeniable results. Celebrate big today—God's got amazing things in store for you! 🥳🙏`

#### 7. `BIRTHDAY_COMMUNITY` (Youth Group Chat Announcement)
- **Variant 0 (Community Rally Call)**:  
  `🎉 *CELEBRATING A CHAMPION TODAY!* 🎂\n\nJoin us in wishing a fantastic Happy Birthday to our beloved *{FullName}*{DepartmentClause}! We thank God for your life, your smile, and your service in His house. May this new year be overflow after overflow! Drop your prayers and love for {FirstName} below! ❤️🥳✨`
- **Variant 1 (Scriptural Celebration)**:  
  `🎂 *FAMILY CELEBRATION TIME!* 🎈\n\n"The Lord bless you and keep you; The Lord make His face shine upon you..." (Numbers 6:24-25)\n\nA hearty Happy Birthday to *{FullName}* today! RCCG {ChurchName} celebrates the grace of God on your life. Family, let's flood the chat with love and blessings! 🥳🎉`
- **Variant 2 (Energetic Youth Shoutout)**:  
  `🌟 *IT'S {FirstName}'s DAY!* 🎂\n\nBig shoutout to *{FullName}* celebrating another glorious year today! Thank you for being a light in our generation. Wishing you divine acceleration, wisdom, and boundless joy in your new age! Show some love, church! 🔥🙌❤️`

#### 8. `MIDWEEK_REMINDER` (Fellowship & Prayer Boost)
- **Variant 0 (Midweek Recharge)**:  
  `Hey {FirstName}! Midweek is here, and it's time to recharge spiritually! ⚡ Join the youth fellowship this evening at 6:00 PM for our Word & Prayer clinic at {ChurchName}. Come expectant for a fresh touch! See you soon! 🔥`
- **Variant 1 (Midweek Encouragement)**:  
  `Hi {FirstName}! Whatever the week has thrown at you so far, take a breath—God is in control! Take some time out this evening to fellowship with the family at {ChurchName} by 6:00 PM. Looking forward to seeing your face! 🙌🕊️`
- **Variant 2 (Power-Packed Gathering)**:  
  `Hey {FirstName}! Ready for a midweek spiritual lift? We're gathering this evening at {ChurchName} to pray, worship, and receive fresh grace. Don't come alone—bring a friend! See you at 6:00 PM! 🌟`

---

### 3.5 Parameter Interpolation & Sanitization Rules

The template interpolation pipeline executes in four disciplined phases:

```
[Raw Context] 
      │
      ▼
1. Sanitize & Normalize (Trim names, title-case, handle nulls)
      │
      ▼
2. Build Contextual Clauses (e.g. {DepartmentClause} -> " in the Ushering department")
      │
      ▼
3. Deterministic Variant Selection (via hashSeed(seed) % bank.length)
      │
      ▼
4. Interpolate Placeholders ({FirstName}, {ChurchName}, etc.)
      │
      ▼
5. Post-process & Validate (Track unresolved, compute SMS segments, return RenderedTemplate)
```

#### Detailed Clause Logic:
1. `{FirstName}`:
   - Cleaned: trimmed of leading/trailing whitespace.
   - Title-cased: `"tolu"` → `"Tolu"`, `"DANIEL"` → `"Daniel"`.
   - Fallback: If empty, null, or undefined, defaults to `"friend"` (or `"there"` depending on tone).
2. `{FullName}`:
   - Evaluated as `"${firstName} ${lastName}".trim()`.
   - Fallback: If `lastName` is missing, returns `firstName`.
3. `{Department}`:
   - Evaluated from `context.department` or `context.subCategory`.
   - Underscores replaced: `"YOUTH_WORKER"` → `"Youth Worker"`, `"MEDIA_TEAM"` → `"Media"`.
   - Fallback: Defaults to `"Youth Member"`.
4. `{DepartmentClause}`:
   - Dynamic linguistic clause: If department is known, outputs `" with the ${department} team"`.
   - If department is empty/null, outputs `""` (empty string) so the sentence reads naturally without grammatical awkwardness.
5. `{ChurchName}`:
   - Defaults to `"RCCG Jesus Covenant Zone"`.
6. `{DaysAbsent}`:
   - Formatted as `context.daysAbsent || (context.consecutiveWeeksMissed ? context.consecutiveWeeksMissed * 7 : 7)`.
7. `{PhotoStatus}`:
   - If `context.photoUrl` is valid string: outputs `{PhotoUrl}`.
   - If null/empty: outputs `"[Photo requested / Use standard template]"`.

---

## 4. Opt-In LLM Architecture with Deduplication Caching (`lib/ai-assistant.ts`)

To fulfill the near-zero token usage mandate:
1. **Default Mode**: Always call `renderTemplate(category, context, options)`. Token consumption = **0**.
2. **Opt-In Mode**: When an administrator or caller explicitly clicks "Polish with AI" in the UI:
   - Construct prompt:
     ```
     Context: Absent youth church member check-in.
     Base Draft: "${baseDraft}"
     Instructions: Keep under 280 characters. Maintain warm Nigerian youth church culture. 
     Encourage without guilt. Return ONLY the polished message text.
     ```
   - **Cache Check**: Calculate SHA-256 of `(memberId + baseDraft + tone)`.
   - If exists in LRU memory cache or database cache: return cached string immediately (0 tokens consumed).
   - If not found in cache:
     - Invoke Gemini 1.5 Flash (`maxOutputTokens: 120`, `temperature: 0.6`).
     - Store output in cache (TTL: 7 days).
     - Return polished text.
   - **Fault Tolerance**: If Gemini API returns 429, 500, or `GEMINI_API_KEY` is undefined, silently return the deterministic base draft without breaking or throwing UI errors.

---

## 5. Caveats

1. **SMS Length Constraints**:
   - Single GSM-7 SMS messages are capped at 160 characters (or 153 characters per part in multi-part concatenation). Emojis (`🎉`, `❤️`, `🔥`) convert the message to UCS-2 encoding, reducing single SMS limit to 70 characters.
   - While WhatsApp has no 70-character limit and easily accommodates rich emojis, for direct SMS dispatch via Termii or Twilio, the engine metadata calculates `estimatedSmsSegments`. Downstream SMS senders can optionally strip non-GSM-7 emojis if SMS cost is constrained.
2. **First-Timer Contact Window**:
   - The `FIRST_TIMER_72H` template is optimized for Tuesday/Wednesday dispatch following a Sunday service. If triggered on Saturday, the phrase "hope you felt right at home on Sunday" remains valid, but "see you tomorrow" might be preferred. We provide a `nextServiceDate` variable to ensure contextual timing.
3. **No Direct Source Code Writing in M1**:
   - Under this investigation role, no production files have been altered. The design is completely specified here and in the proposed architecture for M1 implementation.

---

## 6. Conclusion

1. **Zero-Token Guarantee**: All regular follow-up workflows, absence detections, and birthday alerts can operate completely without external LLM API dependencies, achieving **0 token consumption** and **<1ms execution time**.
2. **Culturally Resonant Nigerian Youth Tone**: The message banks eliminate archaic, stilted language ("Calvary greetings", "warm Christian greetings") in favor of authentic, loving, and encouraging Nigerian youth expressions.
3. **Deterministic Idempotency**: Using seed hashing ensures repeatable, testable variant selection while rotating fresh messages across consecutive absence weeks.
4. **Resilient Parameter Handling**: Null, missing, or irregular fields resolve gracefully with contextual clause helpers and strict sanitization.

---

## 7. Verification Method

To independently verify the template engine architecture once implemented:

### 7.1 Automated Unit Test Execution (`tests/unit/template-engine.test.ts`)
Run the test command:
```bash
npx vitest run tests/unit/template-engine.test.ts
```

### 7.2 Detailed Unit Test Matrix
The test suite must verify the following 12 test specifications:

| Test Case | Scenario Description | Expected Outcome |
|---|---|---|
| **T1: Basic Interpolation** | Render `MISSED_1_WEEK` with `{ firstName: 'Tolu' }` | Output contains `"Tolu"`, zero `{...}` tags remain, `tokensConsumed === 0` |
| **T2: Null First Name Fallback** | Render with `{ firstName: '' }` or `null` | Output smoothly uses `"friend"` or `"there"`, never `"null"` or `"undefined"` |
| **T3: Name Capitalization** | Render with `{ firstName: '  dAnIeL  ' }` | Output formats name as `"Daniel"` |
| **T4: Dynamic Department Clause** | Render with `{ subCategory: 'USHERING' }` vs `null` | With subCategory: outputs `"with the Ushering team"`; with null: clause is cleanly omitted |
| **T5: Bank Completeness** | Check all 8 categories in `TemplateCategory` | Each category contains $\ge 4$ unique, non-empty template variants |
| **T6: Deterministic Seed Stability** | Render with `seed: 'member_123'` twice | Both executions return identical `variantIndex` and identical text |
| **T7: Seed Rotation Variety** | Render with `seed: 'member_123'` vs `seed: 'member_456'` | Selects different variant indices across the bank |
| **T8: Emoji & WhatsApp Formatting** | Render `BIRTHDAY_DAY_OF_DM` | Text contains `*bold*` formatting and unicode emojis intact without byte distortion |
| **T9: Media Markdown Briefing** | Render `BIRTHDAY_T_MINUS_1_MEDIA` | Formats Markdown bolding, includes phone, date, photo status, and 07:00 AM action |
| **T10: Unknown Placeholders** | Input custom template with `{UnknownVar}` | With `stripUnresolved: false`: reports in `unresolvedTokens`; with `stripUnresolved: true`: cleanly strips |
| **T11: SMS Segment Estimation** | Render short text vs long text with emojis | Accurately calculates GSM-7 vs UCS-2 segment counts |
| **T12: Opt-In LLM Fallback** | Call `ai-assistant.ts` with no API key | Returns deterministic template gracefully without throwing an unhandled exception |

