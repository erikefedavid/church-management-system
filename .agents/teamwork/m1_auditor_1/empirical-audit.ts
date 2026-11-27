/**
 * Independent Forensic Verification Script
 * Executed by M1 Forensic Auditor
 * Tests all Milestone 1 deliverables directly and empirically.
 */

import {
  renderTemplate,
  interpolateString,
  hashSeed,
  selectDeterministicVariant,
  getTemplateBank,
  calculateSmsSegments,
  formatBirthdayDate,
  TEMPLATE_BANKS,
} from '@/lib/template-engine';

import {
  normalizePhoneNumber,
  normalizeNigerianPhone,
  generateWaMeLink,
  dispatchDirectMessage,
  dispatchDirectBatch,
} from '@/lib/direct-dispatch';

import {
  generateFollowUpDraft,
  generateGraphicsDesignerAlert,
  generateDayOfBirthdayWish,
  polishDraftWithAi,
  clearAiCache,
  getAiCacheSize,
} from '@/lib/ai-assistant';

const auditResults: { name: string; pass: boolean; details: string }[] = [];

function assert(condition: boolean, name: string, details: string) {
  auditResults.push({ name, pass: condition, details });
  if (!condition) {
    console.error(`[AUDIT FAIL] ${name}: ${details}`);
  } else {
    console.log(`[AUDIT PASS] ${name}`);
  }
}

async function runAudit() {
  console.log('--- STARTING FORENSIC INTEGRITY AUDIT ---');

  // 1. Template Engine: FNV-1a Determinism
  const hash1 = hashSeed('08031234567');
  const hash2 = hashSeed('08031234567');
  assert(hash1 === hash2 && typeof hash1 === 'number' && hash1 > 0,
    'FNV-1a Hash Determinism', `hash1=${hash1}, hash2=${hash2}`);

  // 2. Template Engine: 0-Token Guarantee
  const renderRes = renderTemplate('MISSED_1_WEEK', {
    firstName: 'Chinedu',
    lastName: 'Eze',
    phone: '08031234567',
    subCategory: 'MEDIA',
  }, { seed: '08031234567' });

  assert(renderRes.tokensConsumed === 0, '0-Token Invariant',
    `tokensConsumed=${renderRes.tokensConsumed}`);
  assert(renderRes.text.includes('Chinedu'), 'First Name Interpolation',
    `text=${renderRes.text}`);
  assert(!renderRes.text.includes('{FirstName}'), 'No Unresolved Tokens in Render',
    `text=${renderRes.text}`);

  // 3. Template Engine: Bank Completeness across all 8 categories
  const categories = Object.keys(TEMPLATE_BANKS);
  assert(categories.length === 8, '8 Template Categories Present', `count=${categories.length}`);

  let totalTemplates = 0;
  for (const cat of categories) {
    const bank = getTemplateBank(cat as any, 'CASUAL_YOUTH');
    totalTemplates += bank.length;
    assert(bank.length >= 3, `Category ${cat} Bank Depth`, `length=${bank.length}`);
  }
  assert(totalTemplates >= 30, 'Total Template Bank Depth', `total=${totalTemplates}`);

  // 4. SMS Segment Calculation
  const asciiShort = 'Hello youth!';
  const asciiSms = calculateSmsSegments(asciiShort);
  assert(asciiSms.segments === 1 && asciiSms.encoding === 'GSM-7', 'GSM-7 Short Segment',
    `segments=${asciiSms.segments}, encoding=${asciiSms.encoding}`);

  const emojiText = 'Happy Birthday! 🎂🎉🥳';
  const emojiSms = calculateSmsSegments(emojiText);
  assert(emojiSms.encoding === 'UCS-2' && emojiSms.segments === 1, 'UCS-2 Emoji Segment',
    `segments=${emojiSms.segments}, encoding=${emojiSms.encoding}`);

  // 5. Phone Normalization: 11-digit local Nigerian
  const ng1 = normalizePhoneNumber('08031234567');
  assert(ng1.isValid === true && ng1.isNigerian === true && ng1.e164 === '+2348031234567' && ng1.phoneLast4 === '4567',
    'Nigerian 11-digit Local Normalization', JSON.stringify(ng1));

  // 6. Phone Normalization: Leading 0 after 234
  const ng2 = normalizePhoneNumber('+23408031234567');
  assert(ng2.isValid === true && ng2.e164 === '+2348031234567' && ng2.digitsOnly === '2348031234567',
    'Accidental Zero After Country Code Normalization', JSON.stringify(ng2));

  // 7. Phone Normalization: 10-digit without leading 0
  const ng3 = normalizePhoneNumber('8031234567');
  assert(ng3.isValid === true && ng3.e164 === '+2348031234567' && ng3.nationalFormat === '08031234567',
    '10-digit Local Nigerian Normalization', JSON.stringify(ng3));

  // 8. Phone Normalization: Foreign International Protection
  const usPhone = normalizePhoneNumber('+14155552671');
  assert(usPhone.isValid === true && usPhone.isNigerian === false && usPhone.e164 === '+14155552671',
    'Foreign US Phone Preservation', JSON.stringify(usPhone));

  const ukPhone = normalizePhoneNumber('+447911123456');
  assert(ukPhone.isValid === true && ukPhone.isNigerian === false && ukPhone.e164 === '+447911123456',
    'Foreign UK Phone Preservation', JSON.stringify(ukPhone));

  // 9. Phone Normalization: Invalid input handling without throwing
  const invalidPhone = normalizePhoneNumber('invalid-number-123');
  assert(invalidPhone.isValid === false && invalidPhone.error !== undefined,
    'Invalid Phone Rejection Without Exception', JSON.stringify(invalidPhone));

  // 10. Universal wa.me Link Generation
  const waLink = generateWaMeLink('2348031234567', 'Happy Birthday! 🎂');
  assert(waLink.startsWith('https://wa.me/2348031234567?text='), 'wa.me Base URL Format', waLink);
  assert(!waLink.includes('+'), 'wa.me Destination Phone Has No Plus', waLink);
  assert(waLink.includes('%F0%9F%8E%82'), 'wa.me Encodes Emojis Correctly', waLink);

  // 11. Direct Dispatch: Zero-Credential Fallback
  delete process.env.TERMII_API_KEY;
  delete process.env.TWILIO_ACCOUNT_SID;
  delete process.env.WHATSAPP_CLOUD_API_TOKEN;

  const dispatchRes = await dispatchDirectMessage({
    to: '08031234567',
    body: 'Test church outreach message',
  });
  assert(dispatchRes.success === true, 'Zero-Credential Dispatch Success', JSON.stringify(dispatchRes));
  assert(dispatchRes.status === 'FALLBACK_GENERATED', 'Status is FALLBACK_GENERATED', dispatchRes.status);
  assert(dispatchRes.provider === 'WA_ME', 'Provider is WA_ME', dispatchRes.provider);
  assert(dispatchRes.waMeUrl.includes('https://wa.me/2348031234567'), 'Valid waMeUrl Returned', dispatchRes.waMeUrl);

  // 12. Batch Dispatch Functionality
  const batchRes = await dispatchDirectBatch([
    { to: '08031234567', body: 'Msg 1' },
    { to: '08129876543', body: 'Msg 2' },
    { to: 'invalid-num', body: 'Msg 3' },
  ]);
  assert(batchRes.total === 3, 'Batch Total Count', `total=${batchRes.total}`);
  assert(batchRes.fallbackGenerated === 2, 'Batch Fallbacks', `fallback=${batchRes.fallbackGenerated}`);
  assert(batchRes.failed === 1, 'Batch Failures', `failed=${batchRes.failed}`);

  // 13. AI Assistant: Zero-Token Default Follow-Up
  const followUpDraft = await generateFollowUpDraft('MISSED_1_WEEK', {
    firstName: 'Bisi',
    lastName: 'Akande',
    phone: '08031234567',
  });
  assert(typeof followUpDraft.primary === 'string' && followUpDraft.primary.includes('Bisi'),
    'AI Assistant Follow-Up Draft Contains Name', followUpDraft.primary);

  // 14. AI Assistant: Media Designer Alert
  const designerAlert = generateGraphicsDesignerAlert({
    firstName: 'David',
    lastName: 'Oyelowo',
    phone: '08031234567',
    birthMonth: 11,
    birthDay: 15,
    subCategory: 'MEDIA',
    photoUrl: 'https://example.com/david.jpg',
  });
  assert(designerAlert.headline.includes('David Oyelowo'), 'Designer Alert Headline', designerAlert.headline);
  assert(designerAlert.whatsappMessage.includes('https://example.com/david.jpg'),
    'Designer Alert Photo Link', designerAlert.whatsappMessage);

  // 15. AI Assistant: Day-of Birthday Wishes
  const birthdayWish = generateDayOfBirthdayWish({
    firstName: 'Deborah',
    lastName: 'Ade',
    phone: '08031234567',
    birthMonth: 5,
    birthDay: 10,
  });
  assert(birthdayWish.whatsappGreeting.includes('Deborah'), 'Birthday Greeting Direct DM', birthdayWish.whatsappGreeting);
  assert(birthdayWish.communityAnnouncement.includes('Deborah Ade'), 'Birthday Announcement Community', birthdayWish.communityAnnouncement);

  console.log('\n--- AUDIT SUMMARY ---');
  const passed = auditResults.filter(r => r.pass).length;
  const failed = auditResults.filter(r => !r.pass).length;
  console.log(`Total Checks: ${auditResults.length} | Passed: ${passed} | Failed: ${failed}`);

  if (failed > 0) {
    process.exit(1);
  }
}

runAudit().catch(err => {
  console.error('Audit execution crashed:', err);
  process.exit(1);
});
