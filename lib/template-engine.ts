/**
 * Deterministic Zero-Token Template Interpolation Engine & Youth Message Banks
 * RCCG Jesus Covenant Zone
 * 
 * Fulfills Near-Zero Token Usage mandate:
 * - 0 LLM tokens consumed for all standard routine follow-ups, birthday alerts, and reminders.
 * - Deterministic variant rotation via FNV-1a non-cryptographic hashing.
 * - Culturally resonant, warm Nigerian youth church voice (zero corporate clichés or guilt-trips).
 * - Defensive parameter sanitization with natural fallback clauses.
 */

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
  firstName?: string | null;
  lastName?: string | null;
  fullName?: string | null;
  phone?: string | null;

  // Church & Demographics
  churchName?: string | null; // Default: 'RCCG Jesus Covenant Zone'
  category?: 'YOUTH' | 'WORKER' | 'ADULT' | 'CHILD' | string | null;
  department?: string | null; // e.g. "Media", "Choir", "Ushering", "Technical"
  subCategory?: string | null;

  // Attendance & Absence Context
  daysAbsent?: number | string | null;
  consecutiveWeeksMissed?: number | null;
  lastServiceDate?: string | null;
  nextServiceDate?: string | null;

  // Birthday Context
  birthDay?: number | null;
  birthMonth?: number | null;
  birthDateFormatted?: string | null; // e.g. "November 14"
  celebrantName?: string | null;
  photoUrl?: string | null;

  // Attribution
  senderName?: string | null; // e.g. "Bro. Daniel", "Youth Leadership"
  pastorName?: string | null; // e.g. "Youth President"
  youthPastorName?: string | null;

  // Custom Key-Value overrides
  customFields?: Record<string, string | number | null | undefined>;
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
    estimatedSmsSegments: number; // 1 segment <= 160 chars GSM-7, <= 70 chars UCS-2
    isWithinWhatsAppOptimalLength: boolean; // < 400 chars
    hasPhotoUrl: boolean;
  };
}

// -------------------------------------------------------------
// FNV-1a Deterministic Hash Algorithm (No Math.random())
// -------------------------------------------------------------
export function hashSeed(seed: string): number {
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0; // Convert to unsigned 32-bit integer
}

export function selectDeterministicVariant<T>(bank: T[], seed: string | number): { item: T; index: number } {
  if (!bank || bank.length === 0) {
    throw new Error('Template bank cannot be empty');
  }
  const numericSeed = typeof seed === 'number' ? seed : hashSeed(String(seed));
  const index = Math.abs(numericSeed) % bank.length;
  return { item: bank[index], index };
}

// -------------------------------------------------------------
// Capitalization & Formatting Helpers
// -------------------------------------------------------------
function toTitleCase(str: string): string {
  if (!str) return '';
  return str
    .trim()
    .toLowerCase()
    .replace(/(?:^|\s|-)\S/g, (char) => char.toUpperCase());
}

function formatDepartment(dept?: string | null, subCat?: string | null): string {
  const raw = dept || subCat;
  if (!raw) return 'Youth Member';
  const clean = raw.replace(/_/g, ' ').trim();
  return toTitleCase(clean);
}

// Month names for date formatting
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

export function formatBirthdayDate(month?: number | null, day?: number | null): string {
  if (!month || !day || month < 1 || month > 12 || day < 1 || day > 31) {
    return 'Upcoming';
  }
  return `${MONTH_NAMES[month - 1]} ${day}`;
}

// -------------------------------------------------------------
// High-Variety Youth-Friendly Message Banks
// -------------------------------------------------------------
export const TEMPLATE_BANKS: Record<TemplateCategory, Record<TemplateTone, string[]>> = {
  FIRST_TIMER_72H: {
    CASUAL_YOUTH: [
      'Hey {FirstName}! 🎉 It was so awesome having you fellowship with us at {ChurchName} on Sunday! The entire youth family is super excited you came. Hope you felt right at home! How is your week going so far? We would love to see your face again this Sunday! ✨',
      'Hi {FirstName}! Just wanted to personally thank you for worshipping with us on Sunday at {ChurchName}. Your presence truly added colour to our service! Praying your week is loaded with favour and open doors. You are always welcome in our corner! 🙌',
      'Hello {FirstName}! We are still smiling thinking about having you with us on Sunday! Starting something new can be a lot, but we hope you found a genuine family in {ChurchName}. If you ever need prayer, study buddies, or just someone to gist with, we are here for you! ❤️',
      'Hey {FirstName}! Big shoutout for joining our youth service on Sunday! The worship and word were powerful, and having you there made it even better. Hope exams/work is treating you well this week. Cannot wait to worship together again this coming Sunday! 🔥',
      'Blessed day {FirstName}! Truly blessed to have connected with you at {ChurchName} this past Sunday. May God\'s peace speak for you in all you do this week. Feel free to reach out anytime—you are family now! 🙏✨',
    ],
    WARM_FELLOWSHIP: [
      'Dear {FirstName}, what a joy it was to welcome you to {ChurchName} this past Sunday! We pray that the word you heard brings forth fruitful testimonies in your life. Our doors and hearts are always open to you! Have a grace-filled week! 🕊️',
      'Hello {FirstName}! On behalf of our pastorate and youth fellowship at {ChurchName}, we warmly thank you for joining us on Sunday. May the presence of God dwell richly with you throughout this week. See you on Sunday! 🌟',
      'Hi {FirstName}, sending you warm Christian love from all of us at {ChurchName}. It was truly a privilege having you in our midst. May God order your steps into pleasant places this week! 🙏❤️',
    ],
    PASTORAL_CARE: [
      'Dear {FirstName}, grace and peace be multiplied unto you. It was an honour having you worship with us at {ChurchName}. We pray that God\'s hand of protection and favour rests mightily on you and your household. Welcome to the covenant family! 🕊️',
      'Beloved {FirstName}, thank you for worshipping with us at {ChurchName}. As our Youth President always shares, you are not here by accident but by divine appointment. May God\'s blessings overtake you this week! 🙏',
    ],
    CREATIVE_MEDIA: [
      'Hey {FirstName}! Welcome to {ChurchName}! So great having you on Sunday. Stay connected with our youth community online and see you this coming Sunday! 🎉📲',
    ],
  },

  MISSED_1_WEEK: {
    CASUAL_YOUTH: [
      'Hey {FirstName}! We definitely noticed you weren\'t in service yesterday at {ChurchName} and the family missed your presence and energy! Hope everything is good on your end? Just wanted to check in and wish you a fruitful week ahead! 🌟',
      'Hi {FirstName}! Just checking in on you. Service yesterday was great, but it wasn\'t the same without you holding down the fort with us{DepartmentClause}. Hope school/work isn\'t stressing you too much? Rooting for you this week! 💪',
      'Hello {FirstName}! Thinking of you today! We missed your bright smile in fellowship yesterday. Hope you\'re staying strong and well rested. Sending you warmth and God\'s peace for the week ahead! ❤️',
      'Hey {FirstName}! Hope your Monday is starting on a high note! We missed seeing you on Sunday at {ChurchName}. Whatever you have on your plate this week, know that God has got you covered. Looking forward to catching up this Sunday! 🕊️',
      'Hi {FirstName}! Wanted to drop a quick note to say we missed you in church yesterday. Praying that supernatural ease attends everything your hands touch this week. Catch you soon! 🙌',
    ],
    WARM_FELLOWSHIP: [
      'Dear {FirstName}, warm greetings from {ChurchName}! We truly missed seeing you in fellowship on Sunday. Praying that all is well with you and your loved ones. May God grant you strength and fruitful results in all your endeavours this week! 🙏✨',
      'Hello {FirstName}, just reaching out with love from your church family. We noticed your absence on Sunday and wanted to reassure you that you are in our thoughts and prayers. Have a blessed and victorious week! 🕊️',
      'Hi {FirstName}, sending warm blessings your way! Service was uplifting on Sunday, but our fellowship is brightest when we are all together{DepartmentClause}. Hope you have a wonderful and restful week! ❤️',
    ],
    PASTORAL_CARE: [
      'Dear {FirstName}, grace and peace to you from {YouthPastorName} and the leadership team at {ChurchName}. We noticed you were unable to join us on Sunday and wanted to ensure your welfare is well catered for. Please let us know if you need prayer covering in any area. God bless you! 🙏',
      'Beloved {FirstName}, thinking of you in prayer today. We missed your presence in God\'s house yesterday. May the Lord strengthen you and supply all your needs according to His riches in glory. Looking forward to worshipping together again soon! 🌟',
    ],
    CREATIVE_MEDIA: [
      'Hey {FirstName}! Missed you at {ChurchName} on Sunday! The sermon audio and highlights are up on our media channels. Catch up on the word and see you next Sunday! 🎧🔥',
    ],
  },

  MISSED_2_WEEKS: {
    CASUAL_YOUTH: [
      'Hello {FirstName}! You\'ve really been on our hearts and in our prayers. We noticed it\'s been two Sundays since we caught up at {ChurchName}, and we just wanted to be sure you are doing okay. If there\'s anything you\'re navigating or need prayer support with, please know we are always here for you! 🤗',
      'Hey {FirstName}, peace and grace to you! The fellowship hasn\'t felt complete without you these past two weeks. Life can get overwhelmingly busy sometimes, but please remember your youth family loves and values you deeply. How are things going with you? ❤️',
      'Hi {FirstName}! Just reaching out with genuine love from {ChurchName}. We miss seeing your face in service! We pray that God surrounds you with strength, peace, and clarity in whatever season you\'re in. We\'d love to hear from you whenever you have a moment! 🙏',
      'Hello {FirstName}, we\'ve missed you dearly these past couple of weeks{DepartmentClause}! Please know that you are treasured in this house. No pressure at all—just wanted to remind you that you have brothers and sisters standing in faith with you. God bless you! ✨',
    ],
    WARM_FELLOWSHIP: [
      'Dear {FirstName}, you have been in our constant thoughts. It has been two weeks since we last fellowshiped together at {ChurchName}. We hope everything is well with you. Please know our arms are wide open and we are always here to support and pray with you. Much love! ❤️🕊️',
      'Hi {FirstName}, sending heartfelt love from your church family. We miss your presence and fellowship deeply. May the Lord be your refuge, shield, and strength this week. Please let us know how we can stand in faith with you! 🙏',
    ],
    PASTORAL_CARE: [
      'Dear {FirstName}, {YouthPastorName} and the leadership at {ChurchName} are reaching out with genuine love. It has been two weeks since we worshipped together. In times of busyness or difficulty, know that God\'s house is your safe anchor. We would be honoured to pray with you whenever you are free. God bless you richly! 🙏✨',
      'Beloved {FirstName}, grace be unto you. We have noticed your absence over the past two weeks and want you to know you are deeply missed and valued. May the Lord restore strength, peace, and divine direction to you today. We are praying for you! 🕊️',
    ],
    CREATIVE_MEDIA: [
      'Hey {FirstName}, thinking of you! We\'ve missed your vibe at youth church these past two weeks. Check out this week\'s recap and we can\'t wait to welcome you back this Sunday! 📲❤️',
    ],
  },

  DORMANT_CRITICAL: {
    CASUAL_YOUTH: [
      'Dear {FirstName}, warm love from the entire leadership and family at {ChurchName}. You have been in our constant thoughts and prayers. Whatever life has brought your way recently, our arms and doors are always wide open for you. We would love to catch up over a call whenever you\'re free! ❤️🙏',
      'Hi {FirstName}, sending you God\'s immense peace today. You are a valued part of this family, and no matter how long it\'s been, that never changes. Praying God\'s shield of grace covers you and your family. We are always in your corner! 🕊️',
      'Hello {FirstName}! We pray God\'s strength is uplifting you today. You\'ve been deeply missed at {ChurchName}. Just dropping this note to let you know you are loved, remembered, and prayed for. God\'s grace upon your path always! 🌟',
      'Dear {FirstName}, checking in with you with all our hearts. Life comes in seasons, but God\'s love and this family remain constant for you. If you ever need a listening ear, a quiet prayer, or just to chat, we are here. Have a blessed week! ✨',
    ],
    WARM_FELLOWSHIP: [
      'Dear {FirstName}, heartfelt Christian greetings from {ChurchName}. Though some time has passed, your place in our hearts remains irreplaceable. We pray for God\'s peace, preservation, and joy to overflow in your home. You are always family here! 🙏❤️',
      'Beloved {FirstName}, we send you prayers of grace and upliftment. No matter the distance or time, God\'s covenant over your life is unbroken. We would be overjoyed to hear from you or welcome you home anytime! 🕊️',
    ],
    PASTORAL_CARE: [
      'Dear {FirstName}, warm blessings from {YouthPastorName} at {ChurchName}. The Lord has placed you strongly upon our hearts. We want you to know there is zero judgment or pressure—only unconditional love and prayers for your flourishing. May the Lord shepherd you in green pastures. We are here for you whenever you are ready! 🙏🕊️',
      'Beloved {FirstName}, grace, mercy, and peace from God our Father. You remain a treasured member of {ChurchName}. We pray that every burden is lifted from your shoulders today. Feel free to reach out to the leadership desk whenever you need a listening ear. God bless you! ✨',
    ],
    CREATIVE_MEDIA: [
      'Hey {FirstName}! Sending you love from all of us at {ChurchName}. You are always family here—wishing you peace, joy, and blessings this week! ❤️✨',
    ],
  },

  BIRTHDAY_T_MINUS_1_MEDIA: {
    CASUAL_YOUTH: [
      '🎨 *RCCG YOUTH MEDIA ALERT — T-1 DAY FLYER NOTICE*\n\n' +
        '🎂 *Celebrant:* {FullName}\n' +
        '📅 *Date:* Tomorrow ({BirthDateFormatted})\n' +
        '🏢 *Role / Department:* {Department}\n' +
        '📞 *Phone:* {Phone}\n' +
        '📸 *Photo:* {PhotoStatus}\n\n' +
        '⚡ *Action Required:* Please finalize the celebration flyer today so it is ready for 07:00 AM distribution tomorrow! 🚀',
      '⏰ *DESIGN TEAM NOTICE: BIRTHDAY TOMORROW*\n\n' +
        'Let\'s celebrate our own! {FullName} turns a year older tomorrow ({BirthDateFormatted}).\n' +
        '• *Department:* {Department}\n' +
        '• *Photo Asset:* {PhotoStatus}\n' +
        '• *Contact:* {Phone}\n\n' +
        '👉 *Designer on duty:* Please export high-res PNG and upload before midnight. Thank you for your service! 🎨✨',
      '📢 *MEDIA DESK BRIEFING (T-1 ALERT)*\n\n' +
        'Upcoming Youth Birthday: *{FullName}*\n' +
        '• *Date:* Tomorrow, {BirthDateFormatted}\n' +
        '• *Wing:* {Department}\n' +
        '• *Photo Reference:* {PhotoStatus}\n\n' +
        'Please verify flyer layout, name spelling, and scripture quote. Target broadcast ready by 07:00 AM! 🙌',
      '⚡ *BIRTHDAY GRAPHICS SPRINT NOTICE*\n\n' +
        'Celebrant Alert: *{FullName}* ({Department})\n' +
        'Birthday: Tomorrow ({BirthDateFormatted})\n' +
        'Photo Link: {PhotoStatus}\n' +
        'Designers, let\'s produce another masterpiece to honour our champion! Ready by 07:00 AM tomorrow! 🎨🎂',
    ],
    CREATIVE_MEDIA: [
      '🎨 *RCCG YOUTH MEDIA ALERT — T-1 DAY FLYER NOTICE*\n\n' +
        '🎂 *Celebrant:* {FullName}\n' +
        '📅 *Date:* Tomorrow ({BirthDateFormatted})\n' +
        '🏢 *Role / Department:* {Department}\n' +
        '📞 *Phone:* {Phone}\n' +
        '📸 *Photo:* {PhotoStatus}\n\n' +
        '⚡ *Action Required:* Please finalize the celebration flyer today so it is ready for 07:00 AM distribution tomorrow! 🚀',
      '⏰ *DESIGN TEAM NOTICE: BIRTHDAY TOMORROW*\n\n' +
        'Let\'s celebrate our own! {FullName} turns a year older tomorrow ({BirthDateFormatted}).\n' +
        '• *Department:* {Department}\n' +
        '• *Photo Asset:* {PhotoStatus}\n' +
        '• *Contact:* {Phone}\n\n' +
        '👉 *Designer on duty:* Please export high-res PNG and upload before midnight. Thank you for your service! 🎨✨',
    ],
    WARM_FELLOWSHIP: [
      '📢 *MEDIA & GRAPHICS ALERT: BIRTHDAY TOMORROW*\n\n' +
        'Celebrant: {FullName}\n' +
        'Date: Tomorrow ({BirthDateFormatted})\n' +
        'Department: {Department}\n' +
        'Photo Asset: {PhotoStatus}\n' +
        'Action: Please prepare official celebration graphic for early morning broadcast. God bless your labour of love! 🙏🎨',
    ],
    PASTORAL_CARE: [
      '📋 *YOUTH LEADERSHIP & MEDIA BRIEFING (T-1 BIRTHDAY)*\n\n' +
        'Celebrant: {FullName}\n' +
        'Date: Tomorrow ({BirthDateFormatted})\n' +
        'Department: {Department}\n' +
        'Photo: {PhotoStatus}\n' +
        'Please ensure celebration design and birthday prayers are prepared for 07:00 AM release tomorrow. 🕊️',
    ],
  },

  BIRTHDAY_DAY_OF_DM: {
    CASUAL_YOUTH: [
      'Happy Birthday, {FirstName}! 🎂🎉\n\n' +
        'On behalf of everyone at {ChurchName}, we celebrate God\'s immense goodness in your life today! May this new year launch you into supernatural speed, wisdom, uncommon favour, and divine breakthroughs in your career, academics, and walk with God! Keep shining brilliantly for Christ! Enjoy your day to the fullest! 🥳✨',
      'Big Happy Birthday, {FirstName}! 🎈🥳\n\n' +
        'Today we celebrate the awesome person and blessing you are to our youth church{DepartmentClause}! The Lord make His face shine upon you and be gracious to you. May this new chapter be your best yet—filled with answered prayers and joyful testimonies! Have a fantastic celebration! 🔥🙌',
      'It\'s your special day, {FirstName}! 🎊🎂\n\n' +
        'Shouting the warmest birthday blessings to you! Thank you for the joy and light you bring to our family. As you clock this new age, may the Lord open doors no man can shut and satisfy you with long life and prosperity (Psalm 91:16). Cheers to greater heights! 🥂❤️',
      'Happy Birthday, champion {FirstName}! 🎂🌟\n\n' +
        'May God increase your greatness and comfort you on every side in this new season! You are stepping into a year of peace, divine health, and undeniable results. Celebrate big today—God\'s got amazing things in store for you! 🥳🙏',
    ],
    WARM_FELLOWSHIP: [
      'Happy Birthday, dear {FirstName}! 🎂🕊️\n\n' +
        'RCCG {ChurchName} rejoices with you on this glorious milestone! May the Lord crown your new year with His lovingkindness and tender mercies. We declare supernatural multiplication and joy in everything you do. Have a blessed and memorable celebration! ❤️✨',
      'Warmest Happy Birthday, {FirstName}! 🎉🙏\n\n' +
        '"The Lord bless you and keep you; The Lord make His face shine upon you and be gracious unto you." (Numbers 6:24-25). Thank you for being a wonderful vessel in our family{DepartmentClause}. Enjoy God\'s overwhelming favour today! 🥳',
    ],
    PASTORAL_CARE: [
      'Happy Birthday, beloved {FirstName}! 🎂🙏\n\n' +
        'Warm blessings from {YouthPastorName} and the leadership at {ChurchName}. As you step into this new year, we declare that your strength is renewed like the eagle\'s. May you walk in divine health, spiritual depth, and financial abundance. You will finish strong and victorious! Have a magnificent celebration! 🕊️✨',
      'Grace and peace to you, {FirstName}, on your birthday! 🎂🌟\n\n' +
        'We thank God for the gift of your life and dedication in His house{DepartmentClause}. The hand of the Almighty shall continually uphold you. Great grace and unceasing fruitfulness are your portion this year! Happy Birthday! 🙏',
    ],
    CREATIVE_MEDIA: [
      'Happy Birthday, {FirstName}! 🎂🎉\n\n' +
        'The media team and entire youth church celebrate you today! Check out your official birthday flyer on our church channels. Keep blazing trails for the Kingdom! 🔥🚀',
    ],
  },

  BIRTHDAY_COMMUNITY: {
    CASUAL_YOUTH: [
      '🎉 *CELEBRATING A CHAMPION TODAY!* 🎂\n\n' +
        'Join us in wishing a fantastic Happy Birthday to our beloved *{FullName}*{DepartmentClause}! We thank God for your life, your smile, and your service in His house. May this new year be overflow after overflow! Drop your prayers and love for {FirstName} below! ❤️🥳✨',
      '🎂 *FAMILY CELEBRATION TIME!* 🎈\n\n' +
        '"The Lord bless you and keep you; The Lord make His face shine upon you..." (Numbers 6:24-25)\n\n' +
        'A hearty Happy Birthday to *{FullName}* today! RCCG {ChurchName} celebrates the grace of God on your life. Family, let\'s flood the chat with love and blessings! 🥳🎉',
      '🌟 *IT\'S {FirstName}\'s DAY!* 🎂\n\n' +
        'Big shoutout to *{FullName}* celebrating another glorious year today! Thank you for being a light in our generation. Wishing you divine acceleration, wisdom, and boundless joy in your new age! Show some love, church! 🔥🙌❤️',
      '🔥 *COMMUNITY BIRTHDAY SHOUTOUT!* 🎂\n\n' +
        'Today we celebrate an exceptional soul, *{FullName}*! Thank you for all you do in {ChurchName}{DepartmentClause}. May God\'s favour surround you like a shield! Send in your birthday wishes, youth family! 🥳✨',
    ],
    WARM_FELLOWSHIP: [
      '🎉 *REJOICING WITH OUR CELEBRANT!* 🎂\n\n' +
        'The family at {ChurchName} is overjoyed to celebrate our dear brother/sister *{FullName}* on their birthday! May God increase your greatness and comfort you on every side (Psalm 71:21). Join us in declaring blessings over their new year! ❤️🙏',
    ],
    PASTORAL_CARE: [
      '🕊️ *LEADERSHIP CELEBRATION ALERT* 🎂\n\n' +
        'The church family joins together to bless *{FullName}* on this blessed birthday! May God\'s mighty hand rest upon you and distinguish you for greatness. The youth church honours and prays for you today! Amen! 🙏✨',
    ],
    CREATIVE_MEDIA: [
      '📸 *BIRTHDAY SPOTLIGHT!* 🎨\n\n' +
        'Happy Birthday to *{FullName}*{DepartmentClause}! Check out today\'s celebration banner and drop your favourite memories and blessings for {FirstName}! 🎂🥳🔥',
    ],
  },

  MIDWEEK_REMINDER: {
    CASUAL_YOUTH: [
      'Hey {FirstName}! Midweek is here, and it\'s time to recharge spiritually! ⚡ Join the youth fellowship this evening at 6:00 PM for our Word & Prayer clinic at {ChurchName}. Come expectant for a fresh touch! See you soon! 🔥',
      'Hi {FirstName}! Whatever the week has thrown at you so far, take a breath—God is in control! Take some time out this evening to fellowship with the family at {ChurchName} by 6:00 PM. Looking forward to seeing your face! 🙌🕊️',
      'Hey {FirstName}! Ready for a midweek spiritual lift? We\'re gathering this evening at {ChurchName} to pray, worship, and receive fresh grace. Don\'t come alone—bring a friend! See you at 6:00 PM! 🌟',
      'Blessed Wednesday, {FirstName}! Fuel up your spirit today at our midweek communion and prayer service at {ChurchName} by 6:00 PM. We have saved a seat right next to us for you! See you there! ✨',
    ],
    WARM_FELLOWSHIP: [
      'Dear {FirstName}, you are warmly invited to our midweek Faith Clinic this evening at 6:00 PM at {ChurchName}. Let us gather in unity to draw fresh strength from God\'s Word. May you be richly refreshed! 🙏',
      'Hello {FirstName}, take a pause from the hustle of the week to drink from the fountain of life. Join us for midweek prayer fellowship at {ChurchName} at 6:00 PM today. Looking forward to fellowshipping with you! 🕊️',
    ],
    PASTORAL_CARE: [
      'Beloved {FirstName}, midweek blessings in Christ Jesus. "Come unto Me, all ye that labour and are heavy laden, and I will give you rest." (Matt 11:28). Join {YouthPastorName} and the brethren at {ChurchName} tonight by 6:00 PM for an evening of divine empowerment. God bless you! 🙏✨',
    ],
    CREATIVE_MEDIA: [
      'Hey {FirstName}! Don\'t miss tonight\'s youth midweek service at {ChurchName} (6:00 PM)! Live stream and in-person sanctuary doors open at 5:45 PM. See you soon! 📲⚡',
    ],
  },
};

// -------------------------------------------------------------
// Bank Getter with Graceful Tone Fallback
// -------------------------------------------------------------
export function getTemplateBank(category: TemplateCategory, tone: TemplateTone = 'CASUAL_YOUTH'): string[] {
  const categoryBank = TEMPLATE_BANKS[category];
  if (!categoryBank) {
    throw new Error(`Unknown template category: ${category}`);
  }
  const toneBank = categoryBank[tone];
  if (toneBank && toneBank.length > 0) {
    return toneBank;
  }
  // Fall back to CASUAL_YOUTH if specific tone is empty
  return categoryBank.CASUAL_YOUTH || Object.values(categoryBank)[0] || [];
}

// -------------------------------------------------------------
// Core Interpolation Routine
// -------------------------------------------------------------
export function interpolateString(
  template: string,
  context: TemplateContext,
  options?: RenderOptions
): { text: string; unresolvedTokens: string[] } {
  const fallbackValues = options?.fallbackValues || {};
  const stripUnresolved = options?.stripUnresolved !== false; // default true

  // 1. Sanitize & Normalize identity parameters
  const rawFirst = context.firstName?.trim() || '';
  const firstName = rawFirst ? toTitleCase(rawFirst) : (fallbackValues.FirstName || 'friend');

  const rawLast = context.lastName?.trim() || '';
  const lastName = rawLast ? toTitleCase(rawLast) : '';

  const rawFull = context.fullName?.trim() || '';
  let fullName = rawFull ? toTitleCase(rawFull) : '';
  if (!fullName) {
    fullName = lastName ? `${firstName} ${lastName}` : firstName;
  }
  const celebrantName = context.celebrantName ? toTitleCase(context.celebrantName.trim()) : fullName;

  const churchName = context.churchName?.trim() || fallbackValues.ChurchName || 'RCCG Jesus Covenant Zone';
  const department = formatDepartment(context.department, context.subCategory);

  // Dynamic contextual clause
  const hasSpecificDept = Boolean(
    (context.department && context.department.trim()) ||
    (context.subCategory && context.subCategory.trim())
  );
  const departmentClause = hasSpecificDept ? ` with the ${department} team` : '';

  const phone = context.phone?.trim() || fallbackValues.Phone || 'Not provided';
  const categoryStr = context.category ? toTitleCase(String(context.category)) : 'Youth';

  const daysAbsent = String(
    context.daysAbsent ??
    (context.consecutiveWeeksMissed ? context.consecutiveWeeksMissed * 7 : 7)
  );

  const pastorName = context.pastorName?.trim() || fallbackValues.PastorName || 'Youth President';
  const youthPastorName = context.youthPastorName?.trim() || fallbackValues.YouthPastorName || pastorName;

  const birthDateFormatted =
    context.birthDateFormatted?.trim() ||
    formatBirthdayDate(context.birthMonth, context.birthDay);

  const photoUrl = context.photoUrl?.trim() || null;
  const photoStatus = photoUrl || '[Photo requested / Use standard template]';

  // Build replacement dictionary
  const replacements: Record<string, string> = {
    FirstName: firstName,
    LastName: lastName,
    FullName: fullName,
    CelebrantName: celebrantName,
    ChurchName: churchName,
    Department: department,
    DepartmentClause: departmentClause,
    Category: categoryStr,
    DaysAbsent: daysAbsent,
    ConsecutiveWeeksMissed: String(context.consecutiveWeeksMissed ?? 1),
    PastorName: pastorName,
    YouthPastorName: youthPastorName,
    Phone: phone,
    BirthDate: birthDateFormatted,
    BirthDateFormatted: birthDateFormatted,
    PhotoUrl: photoUrl || '',
    PhotoStatus: photoStatus,
    NextServiceDate: context.nextServiceDate || 'this Sunday',
    LastServiceDate: context.lastServiceDate || 'Sunday',
    SenderName: context.senderName || 'Youth Leadership',
  };

  // Merge custom fields
  if (context.customFields) {
    for (const [key, value] of Object.entries(context.customFields)) {
      if (value !== null && value !== undefined) {
        replacements[key] = String(value);
      }
    }
  }

  // Merge options fallback overrides
  for (const [key, value] of Object.entries(fallbackValues)) {
    if (!replacements[key]) {
      replacements[key] = value;
    }
  }

  // Find all placeholders
  const tokenRegex = /{([a-zA-Z0-9_]+)}/g;
  const unresolvedSet = new Set<string>();

  const interpolated = template.replace(tokenRegex, (match, token) => {
    if (Object.prototype.hasOwnProperty.call(replacements, token)) {
      return replacements[token];
    }
    unresolvedSet.add(token);
    return stripUnresolved ? '' : match;
  });

  return {
    text: interpolated,
    unresolvedTokens: Array.from(unresolvedSet),
  };
}

// -------------------------------------------------------------
// SMS Segment & Character Analysis
// -------------------------------------------------------------
/**
 * Basic GSM 7-bit default alphabet check.
 * If text contains any character outside GSM-7 (e.g. emojis or special unicode),
 * encoding must use UCS-2 (16-bit).
 */
const GSM_7_REGEX = /^[\u0000-\u007F\u00A0-\u00FF\u20AC]*$/;

export function calculateSmsSegments(text: string): {
  characterCount: number;
  segments: number;
  encoding: 'GSM-7' | 'UCS-2';
} {
  const characterCount = Array.from(text).length; // handles unicode surrogate pairs
  // Check if text has emojis or non-GSM characters
  // A clean heuristic: check if code point > 255 or contains surrogate pairs
  const isGsm = GSM_7_REGEX.test(text) && !/[\uD800-\uDFFF]/.test(text);

  if (isGsm) {
    const len = text.length;
    if (len <= 160) return { characterCount, segments: len === 0 ? 0 : 1, encoding: 'GSM-7' };
    return { characterCount, segments: Math.ceil(len / 153), encoding: 'GSM-7' };
  } else {
    // UCS-2: 70 chars for single SMS, 67 per segment for multi-part
    const len = characterCount;
    if (len <= 70) return { characterCount, segments: len === 0 ? 0 : 1, encoding: 'UCS-2' };
    return { characterCount, segments: Math.ceil(len / 67), encoding: 'UCS-2' };
  }
}

// -------------------------------------------------------------
// Main Public Function: renderTemplate
// -------------------------------------------------------------
export function renderTemplate(
  category: TemplateCategory,
  context: TemplateContext,
  options?: RenderOptions
): RenderedTemplate {
  const tone = options?.tone || 'CASUAL_YOUTH';
  const bank = getTemplateBank(category, tone);

  let variantIndex: number;
  let rawTemplate: string;

  if (typeof options?.variantIndex === 'number') {
    // Explicit variant override
    variantIndex = ((options.variantIndex % bank.length) + bank.length) % bank.length;
    rawTemplate = bank[variantIndex];
  } else {
    // Deterministic seed rotation
    const seed = options?.seed ?? (context.phone || context.fullName || context.firstName || category);
    const selection = selectDeterministicVariant(bank, seed);
    variantIndex = selection.index;
    rawTemplate = selection.item;
  }

  const { text, unresolvedTokens } = interpolateString(rawTemplate, context, options);

  const smsAnalysis = calculateSmsSegments(text);

  return {
    text,
    category,
    tone,
    variantIndex,
    totalVariantsAvailable: bank.length,
    tokensConsumed: 0,
    unresolvedTokens,
    metadata: {
      characterCount: smsAnalysis.characterCount,
      estimatedSmsSegments: smsAnalysis.segments,
      isWithinWhatsAppOptimalLength: smsAnalysis.characterCount < 400,
      hasPhotoUrl: Boolean(context.photoUrl),
    },
  };
}
