# M1 Explorer 3 Handoff: Multi-Provider Direct Dispatch Gateway Architecture

**State Directory:** `c:\Users\dafen\OneDrive\Desktop\church-management-system\.agents\teamwork\m1_explorer_3`  
**Target Module:** `lib/direct-dispatch.ts`  
**Target Test Suite:** `tests/unit/direct-dispatch.test.ts`  
**Author:** M1 Explorer 3 (Direct Dispatch Gateway Architecture)  
**Date:** 2026-11-12T14:50:00Z  

---

## 1. Observation

### 1.1 Existing Database Phone Storage & Seed Data
In `prisma/schema.prisma` lines 128–132:
```prisma
firstName       String
lastName        String
phone           String         // Full phone e.g. "08012345678"
phoneLast4      String         // "5678" (for instant 4-digit search)
```
In `prisma/seed.ts` lines 148–188, phone numbers are seeded as 11-digit Nigerian local strings:
```typescript
{ firstName: 'Emmanuel', lastName: 'Okonkwo', phone: '08031234567', phoneLast4: '4567', ... }
{ firstName: 'Chidinma', lastName: 'Adeyemi',  phone: '08129876543', phoneLast4: '6543', ... }
{ firstName: 'Tunde',    lastName: 'Bakare',   phone: '09051112233', phoneLast4: '2233', ... }
{ firstName: 'Grace',    lastName: 'Nwosu',    phone: '07034445566', phoneLast4: '5566', ... }
{ firstName: 'Samuel',   lastName: 'Oladipo',  phone: '08087774567', phoneLast4: '4567', ... }
```
Observation: Every seeded member phone starts with a local Nigerian mobile prefix (`080`, `081`, `090`, `070`), with no country code prepended in storage.

### 1.2 Current Naive Phone Formatter in Codebase
In `app/actions/followup.ts` lines 440–451:
```typescript
/**
 * 4. Helper: Format Nigerian phone number into international WhatsApp format (e.g. 080... -> 23480...)
 */
function formatToWhatsAppPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.startsWith('0')) {
    return `234${digits.slice(1)}`;
  }
  if (digits.startsWith('234')) {
    return digits;
  }
  return `234${digits}`;
}
```
Direct Observations on Deficiencies:
1. **International numbers corrupted:** If a member has a UK (`+44 7911 123456`) or US (`+1 415 555 2671`) phone, `replace(/\D/g, '')` yields `447911123456` or `14155552671`. Because neither starts with `'0'` or `'234'`, line 450 prepends `'234'`, corrupting the number into `234447911123456`.
2. **Accidental leading zero after country code:** If a user types `+23408031234567` (a frequent Nigerian user input error), `digits` becomes `23408031234567`. Line 447 matches `digits.startsWith('234')` and returns `23408031234567` verbatim, resulting in a dead WhatsApp/SMS destination.
3. **Missing E.164 (`+` prefix):** Twilio requires E.164 format with leading `+` (`+2348031234567`), whereas WhatsApp URL and Termii require digits-only (`2348031234567`). The current helper cannot output E.164.
4. **No validation or error reporting:** An empty string, `"N/A"`, or invalid short string produces `234` or nonsense without reporting an error.

### 1.3 Hardcoded wa.me Link Generation
In `app/actions/followup.ts` lines 523–532:
```typescript
const waPhone = formatToWhatsAppPhone(person.phone);
const whatsAppLink = `https://wa.me/${waPhone}?text=${encodeURIComponent(messageText)}`;
```
And in `app/followup/page.tsx` line 753:
```tsx
href={`https://wa.me/${intlPhone}?text=${waGreeting}`}
```
Observation: The UI currently uses manual `wa.me` links exclusively. There is no automated gateway integration for unattended cron runs (`/api/cron/follow-up`, `/api/cron/birthdays`) or direct SMS delivery for members without smartphones.

### 1.4 Environment Configuration State
In `.env` line 1:
```env
DATABASE_URL=postgresql://neondb_owner:npg_JidONA8H9GTf@ep-shy-frost-ax738n5q-pooler.c-4.us-east-2.aws.neon.tech/neondb?sslmode=require
```
Observation: No messaging credentials (`TERMII_API_KEY`, `TWILIO_ACCOUNT_SID`, or `WHATSAPP_CLOUD_API_TOKEN`) exist in `.env`. The gateway design must function 100% reliably out of the box in zero-credential mode, falling back cleanly to `wa.me` links without crashing.

### 1.5 System Architecture Directives
From `orchestrator/PROJECT.md`:
- Feature 10: Multi-provider SMS/WhatsApp gateway (Termii/Twilio/WhatsApp API/wa.me) in `lib/direct-dispatch.ts`.
- Milestones: M1 Core Messaging Engines.
- Code Layout: `lib/direct-dispatch.ts` must export gateway functions and types.

---

## 2. Logic Chain

### 2.1 The Need for an Unified Dispatch Gateway
The church system serves two distinct operational modalities:
1. **Automated Background Dispatch (Cron / Server Actions):**
   - Absentees detected by `/api/cron/follow-up` require direct DM check-in delivery.
   - Celebrants on their birthday morning require day-of birthday greetings dispatched directly to their phone via `/api/cron/birthdays`.
   - When API gateway keys are provided, messages should send automatically without human intervention.
2. **Volunteer / Zero-Budget Interactive Dispatch (UI / 1-Click wa.me):**
   - Churches frequently operate with zero SMS budget or during gateway downtime.
   - When API credentials are empty or when an API call fails (e.g., recipient blocked, Meta 24h window closed, insufficient Termii balance), the system MUST return a 1-click `wa.me` URL. The youth worker taps the button in the UI, which opens WhatsApp with the recipient and prefilled message ready to send.
   - The system must NEVER throw an unhandled exception or fail silently.

### 2.2 Nigerian Phone Normalization Strategy
A single phone number input must be parsed into multiple deterministic representations required by different protocols:

| Field | Example Output | Target Consumer |
|---|---|---|
| `e164` | `"+2348031234567"` | Twilio SMS API, Twilio WhatsApp (`whatsapp:+234...`) |
| `digitsOnly` | `"2348031234567"` | Termii API, Meta WhatsApp Cloud API, `wa.me` link |
| `nationalFormat` | `"08031234567"` | Local Nigerian carrier dialing & DB storage |
| `formattedNational` | `"0803 123 4567"` | UI visual display for ushers & callers |
| `phoneLast4` | `"4567"` | `Person.phoneLast4` lookup index & anti-collision |
| `isNigerian` | `true` | Gateway routing heuristic |
| `isValid` | `true` | Validation gate |

#### Normalization Algorithm:
1. Strip leading and trailing whitespace.
2. Detect if an explicit international plus (`+`) was provided.
3. Remove all non-digit characters (`\D`).
4. **Nigerian prefix evaluation:**
   - If starts with `+234` or `234`:
     - If followed by `0` (e.g. `2340803...`), remove that extraneous `0`.
     - Subscriber portion must have exactly 10 digits (`803...`, `812...`, `703...`, `905...`, `915...`).
     - Total Nigerian normalized length = 13 digits (`234` + 10 digits).
   - If starts with local `0` (e.g. `08031234567`, 11 digits total):
     - Strip the leading `0`, prepend `234` for international forms.
   - If 10 digits starting with `7`, `8`, or `9` (e.g. `8031234567`):
     - Treat as Nigerian local without leading zero; prepend `234` and `0`.
5. **Non-Nigerian international evaluation:**
   - If starts with `+` and another country code (e.g. `+1`, `+44`):
     - Validate E.164 length (between 7 and 15 digits).
     - Set `isNigerian = false`, `e164 = "+${digits}"`, `digitsOnly = digits`.
6. **Invalid evaluation:**
   - If input is empty, less than 7 digits, or contains non-numeric strings that cannot resolve to a phone:
     - Return `isValid = false` with explanatory error message, setting fallback string fields so callers do not crash.

---

### 2.3 Provider Abstraction & Data Contracts

The module `lib/direct-dispatch.ts` will define clean TypeScript contracts:

```typescript
export type MessageChannel = 'WHATSAPP' | 'SMS' | 'AUTO';

export type ProviderType = 'TERMII' | 'TWILIO' | 'WHATSAPP_CLOUD' | 'WA_ME';

export type DispatchStatus =
  | 'DELIVERED'           // API confirmed delivery
  | 'QUEUED'              // API queued message (e.g. Twilio queued)
  | 'FALLBACK_GENERATED'  // Fallback 1-click wa.me link generated
  | 'FAILED';             // Critical failure (e.g. invalid phone number)

export interface NormalizedPhone {
  raw: string;
  isValid: boolean;
  e164: string;
  digitsOnly: string;
  nationalFormat: string;
  formattedNational: string;
  phoneLast4: string;
  countryCode: string;
  isNigerian: boolean;
  error?: string;
}

export interface MessagePayload {
  to: string;
  body: string;
  channel?: MessageChannel;
  recipientName?: string;
  preferredProvider?: ProviderType;
  metadata?: Record<string, unknown>;
}

export interface DispatchResult {
  success: boolean;
  status: DispatchStatus;
  provider: ProviderType;
  messageId?: string;
  normalizedPhone: NormalizedPhone;
  waMeUrl: string;                     // Always populated!
  providerResponse?: unknown;
  error?: string;
  timestamp: string;                   // ISO 8601
}

export interface BatchDispatchResult {
  total: number;
  delivered: number;
  queued: number;
  fallbackGenerated: number;
  failed: number;
  results: DispatchResult[];
}
```

---

### 2.4 Multi-Provider Architecture Details

#### Provider 1: Termii (`TERMII`)
- **Focus:** Primary SMS and WhatsApp gateway for Nigeria.
- **Config Env Vars:**
  - `TERMII_API_KEY`: API authentication key.
  - `TERMII_SENDER_ID`: Alphanumeric sender ID (e.g. `"RCCG JCZ"`, default fallback `"RCCG JCZ"`).
  - `TERMII_CHANNEL`: `"generic"` (default) or `"dnd"`.
  - `TERMII_BASE_URL`: `https://api.ng.termii.com` (configurable for testing/mocking).
- **SMS Endpoint:** `POST /api/sms/send`
  - Request Headers: `Content-Type: application/json`
  - Request Body:
    ```json
    {
      "to": "2348031234567",
      "from": "RCCG JCZ",
      "sms": "Message body here...",
      "type": "plain",
      "channel": "generic",
      "api_key": "YOUR_KEY"
    }
    ```
  - Response Handling:
    - HTTP 200 with `{ "message_id": "...", "message": "Successfully Sent" }` -> returns `status: 'DELIVERED'`, `provider: 'TERMII'`.
    - HTTP 400/401/422 or error message (e.g. `"Insufficient balance"`, `"Invalid recipient"`) -> triggers fallback to `wa.me` with `status: 'FALLBACK_GENERATED'`.

#### Provider 2: Twilio (`TWILIO`)
- **Focus:** Global SMS and official WhatsApp Sandbox/Sender.
- **Config Env Vars:**
  - `TWILIO_ACCOUNT_SID`: Twilio Account SID (`AC...`).
  - `TWILIO_AUTH_TOKEN`: Twilio Auth Token.
  - `TWILIO_PHONE_NUMBER`: Twilio SMS sender number (E.164).
  - `TWILIO_WHATSAPP_FROM`: Twilio WhatsApp sender (e.g. `"whatsapp:+14155238886"`).
- **Messages Endpoint:** `POST https://api.twilio.com/2010-04-01/Accounts/{TWILIO_ACCOUNT_SID}/Messages.json`
  - Request Headers:
    - `Authorization: Basic ${Buffer.from(TWILIO_ACCOUNT_SID + ':' + TWILIO_AUTH_TOKEN).toString('base64')}`
    - `Content-Type: application/x-www-form-urlencoded`
  - Body for SMS:
    `To=+2348031234567&From={TWILIO_PHONE_NUMBER}&Body={encodeURIComponent(body)}`
  - Body for WhatsApp:
    `To=whatsapp:+2348031234567&From={TWILIO_WHATSAPP_FROM}&Body={encodeURIComponent(body)}`
  - Response Handling:
    - HTTP 201 with `{ "sid": "SM...", "status": "queued" }` -> returns `status: 'QUEUED'`, `provider: 'TWILIO'`.
    - HTTP 4xx/5xx -> triggers fallback to `wa.me` with `status: 'FALLBACK_GENERATED'`.

#### Provider 3: Meta WhatsApp Cloud API (`WHATSAPP_CLOUD`)
- **Focus:** Direct official WhatsApp Business Platform without third-party aggregator markups.
- **Config Env Vars:**
  - `WHATSAPP_CLOUD_API_TOKEN`: Meta System User access token.
  - `WHATSAPP_PHONE_NUMBER_ID`: Meta phone number ID.
  - `WHATSAPP_GRAPH_VERSION`: Default `"v21.0"`.
- **Messages Endpoint:** `POST https://graph.facebook.com/{WHATSAPP_GRAPH_VERSION}/{WHATSAPP_PHONE_NUMBER_ID}/messages`
  - Request Headers:
    - `Authorization: Bearer ${WHATSAPP_CLOUD_API_TOKEN}`
    - `Content-Type: application/json`
  - Body for Free-form Text:
    ```json
    {
      "messaging_product": "whatsapp",
      "recipient_type": "individual",
      "to": "2348031234567",
      "type": "text",
      "text": {
        "preview_url": false,
        "body": "Message body here..."
      }
    }
    ```
  - Response Handling:
    - HTTP 200 with `{ "messages": [{ "id": "wamid..." }] }` -> returns `status: 'DELIVERED'`, `provider: 'WHATSAPP_CLOUD'`.
    - Outside 24h Customer Care Window (`error.code: 131047`): Meta rejects unapproved templates outside 24h. The gateway intercepts this specific error and falls back seamlessly to `wa.me`, allowing the user to initiate the conversation with one click!

#### Provider 4: Zero-Credential Resilient Fallback (`WA_ME`)
- **Focus:** Guaranteed 100% operational reliability under all conditions.
- **Implementation:**
  ```typescript
  export function generateWaMeLink(phoneDigitsOnly: string, text: string): string {
    return `https://wa.me/${phoneDigitsOnly}?text=${encodeURIComponent(text)}`;
  }
  ```
- **Guarantees:**
  - NO plus sign (`+`) in the phone portion.
  - NO spaces, hyphens, or brackets.
  - Full URI encoding of text (preserving emojis, line breaks, Nigerian Pidgin/English characters).
  - Executable synchronously with zero network calls and zero cost.

---

### 2.5 Provider Fallback Hierarchy & Resolution Matrix

When `dispatchDirectMessage(payload)` is invoked:
1. **Validate & Normalize Phone Number:**
   - If invalid: immediately return `{ success: false, status: 'FAILED', provider: 'WA_ME', error: normalized.error }`.
2. **Compute Universal `waMeUrl`:**
   - Always pre-generate `waMeUrl = generateWaMeLink(normalized.digitsOnly, payload.body)`.
3. **Determine Channel & Resolve Provider:**
   - If `payload.preferredProvider` is specified and configured: use it.
   - Else, inspect `process.env.DIRECT_DISPATCH_PROVIDER`:
     - If `'TERMII'` and configured: route via Termii.
     - If `'TWILIO'` and configured: route via Twilio.
     - If `'WHATSAPP_CLOUD'` and configured: route via WhatsApp Cloud.
     - If `'AUTO'` or unset:
       - If channel is `'WHATSAPP'`: check WhatsApp Cloud -> Twilio WhatsApp -> Termii -> `WA_ME`.
       - If channel is `'SMS'`: check Termii -> Twilio SMS -> `WA_ME`.
       - If channel is `'AUTO'`: check Termii -> WhatsApp Cloud -> Twilio -> `WA_ME`.
4. **Execute with Try/Catch Fallback Guard:**
   - If provider is `'WA_ME'` or no provider credentials exist:
     - Return `{ success: true, status: 'FALLBACK_GENERATED', provider: 'WA_ME', waMeUrl, ... }`.
   - If API provider execution throws or returns an error response:
     - Catch error, log warning.
     - Return `{ success: true, status: 'FALLBACK_GENERATED', provider: 'WA_ME', waMeUrl, error: err.message, ... }`.

---

## 3. Caveats

1. **Meta 24-Hour Messaging Window:** Meta WhatsApp Cloud API does not permit sending non-template text messages to users who have not messaged the business within the last 24 hours. When this occurs, Meta returns error code `131047`. Our architecture explicitly anticipates this and converts it to a 1-click `wa.me` fallback link rather than crashing.
2. **Inbound Delivery Receipts (DLR Webhooks):** Outbound dispatch records `DELIVERED` or `QUEUED` based on synchronous HTTP status responses from Termii/Twilio/Meta. Asynchronous delivery webhook endpoints (DLR) are outside the scope of M1 and should be addressed if delivery receipt tracking is required in subsequent milestones.
3. **Nigerian DND (Do Not Disturb):** For SMS, Nigerian telecom operators enforce NCC DND filters on promotional routes. Termii's `generic` route handles transactional traffic; however, if a member's line is DND-locked and SMS fails, the returned `wa.me` fallback guarantees the church volunteer can still reach them.
4. **Zero-Token Purity:** The direct dispatch gateway consumes **0 LLM tokens**. It transports messages generated deterministically by the template engine (`lib/template-engine.ts`) or user-composed text directly to external telecommunication endpoints.

---

## 4. Conclusion & Recommended Architecture

The architecture for `lib/direct-dispatch.ts` is fully specified, self-contained, and production-ready for implementation. It fulfills all requirements from the user request and project blueprint:
1. Complete Nigerian phone normalizer supporting all national formats (`080...`, `081...`, `070...`, `090...`, `091...`), international variants (`+234...`, `234...`, `+2340...`), 10-digit variants, and foreign numbers.
2. Modular provider adapters for Termii, Twilio, Meta WhatsApp Cloud API, and `wa.me`.
3. Non-throwing, self-healing fallback hierarchy guaranteeing that regardless of API credential state or network errors, a valid 1-click `wa.me` launcher is returned.
4. Clean integration contracts compatible with follow-up cron (`/api/cron/follow-up`), birthday cron (`/api/cron/birthdays`), and interactive UI components.

---

## 5. Verification Method & Test Suite Specification

### 5.1 Test Harness File
The implementation of `lib/direct-dispatch.ts` must be validated by creating `tests/unit/direct-dispatch.test.ts`.

### 5.2 Verification Commands
```bash
# Run the direct dispatch unit test suite in Vitest
npx vitest run tests/unit/direct-dispatch.test.ts

# Run with full coverage
npx vitest run tests/unit/direct-dispatch.test.ts --coverage
```

### 5.3 Test Suite Matrix Specification

#### Group 1: Nigerian Phone Normalization (`normalizePhoneNumber`)
- **T1.1 (Standard 11-digit local):** Input `'08031234567'` -> verifies `e164 === '+2348031234567'`, `digitsOnly === '2348031234567'`, `nationalFormat === '08031234567'`, `phoneLast4 === '4567'`, `isNigerian === true`, `isValid === true`.
- **T1.2 (Punctuation and spacing):** Inputs `'0803 123 4567'`, `'0803-123-4567'`, `'(0803) 123 4567'` -> all normalize identically to standard.
- **T1.3 (Already E.164):** Input `'+2348031234567'` -> handles cleanly without double-prepending `+234`.
- **T1.4 (Leading zero after 234):** Inputs `'+23408031234567'` and `'23408031234567'` -> strips extraneous zero, returning `+2348031234567` and `2348031234567`.
- **T1.5 (10-digit without leading zero):** Input `'8031234567'` -> infers Nigerian local, outputs `+2348031234567` and `08031234567`.
- **T1.6 (Non-Nigerian international):** Input `'+14155552671'` -> sets `isNigerian === false`, `e164 === '+14155552671'`, `digitsOnly === '14155552671'`, `isValid === true`.
- **T1.7 (Invalid inputs):** Inputs `''`, `'12345'`, `'abcdef'`, `'N/A'` -> verify `isValid === false`, `error` contains descriptive failure reason, function does NOT throw.

#### Group 2: 1-Click `wa.me` Link Generation (`generateWaMeLink`)
- **T2.1 (Clean link generation):** Phone `'2348031234567'`, text `'Hello Emmanuel'` -> verifies `https://wa.me/2348031234567?text=Hello%20Emmanuel`.
- **T2.2 (Emoji and newline encoding):** Text with emojis (`🎂 🎉 ❤️`) and newlines (`\n`) -> verifies URI components are properly encoded without corrupting characters.
- **T2.3 (No plus sign in URL phone segment):** Verifies URL begins with `https://wa.me/234...` and does NOT contain `+` or spaces.

#### Group 3: Zero-Credential Fallback
- **T3.1 (No env vars configured):** With empty environment, call `dispatchDirectMessage({ to: '08031234567', body: 'Test' })` -> verifies `success === true`, `status === 'FALLBACK_GENERATED'`, `provider === 'WA_ME'`, `waMeUrl` is a valid link.

#### Group 4: Provider Adapter Mocks & Error Recovery
- **T4.1 (Termii SMS Success):** Mock `fetch` returning 200 with `{ "message_id": "termii_99", "message": "Successfully Sent" }` -> verifies `success === true`, `status === 'DELIVERED'`, `provider === 'TERMII'`, `messageId === 'termii_99'`.
- **T4.2 (Termii Error -> wa.me Fallback):** Mock `fetch` returning 400 with `{ "message": "Insufficient balance" }` -> verifies call does not throw, returns `status === 'FALLBACK_GENERATED'`, `waMeUrl` populated, error documented.
- **T4.3 (Twilio SMS/WhatsApp Success):** Mock `fetch` returning 201 with `{ "sid": "SM12345", "status": "queued" }` -> verifies `status === 'QUEUED'`, `provider === 'TWILIO'`.
- **T4.4 (Meta WhatsApp Cloud API 24h Window Error):** Mock `fetch` returning 400 with `{ "error": { "code": 131047, "message": "More than 24 hours have passed" } }` -> verifies automatic fallback to `status === 'FALLBACK_GENERATED'`.
- **T4.5 (Network Timeout/Fetch Rejection):** Mock `fetch` rejecting with `new Error('Network offline')` -> verifies graceful recovery to `wa.me` fallback link.

#### Group 5: Batch Dispatch (`dispatchDirectBatch`)
- **T5.1 (Multi-recipient processing):** Process array of 3 recipients (1 valid number, 1 invalid number, 1 fallback) -> verifies aggregate summary `{ total: 3, fallbackGenerated: 2, failed: 1 }` matching results.

### 5.4 Invalidation Conditions
The gateway architecture is considered broken or invalid if:
1. `formatToWhatsAppPhone` or `normalizePhoneNumber` prepends `234` to valid foreign numbers (`+1...`, `+44...`).
2. An API call error throws an unhandled rejection that bubbles up and crashes server actions or cron route handlers.
3. `waMeUrl` contains a `+` symbol in the phone domain (`https://wa.me/+234...`), which causes WhatsApp to reject the URL on mobile web clients.
4. Calling `dispatchDirectMessage` without configured API keys throws an error instead of generating the `wa.me` fallback link.
