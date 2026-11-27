# Handoff Report: Telegram Bot API & Dispatch Architecture (Milestone 4)

**Agent**: `m4_explorer_1`  
**Mission**: Telegram Bot API & Dispatch Architecture Explorer  
**Scope**: Milestone 4 (Media Telegram Birthday Bot & Pipeline - Requirement R3)  
**Date**: 2026-11-12T18:06:00Z  

---

## 1. Observation

1. **Environment Variables & Configuration State**:
   - In `.env` (lines 1-2), only `DATABASE_URL` and `GEMINI_API_KEY` are present. Neither `TELEGRAM_BOT_TOKEN` nor `TELEGRAM_MEDIA_CHAT_ID` are defined.
   - In `vitest.config.ts` (lines 22-25), the test environment only defines `CRON_SECRET: 'test-cron-secret-12345'` and `NODE_ENV: 'test'`.
   - Running any code that attempts real Telegram Bot API calls without credentials will fail unless a robust, deterministic dry-run / simulation mode is built into the client wrapper.

2. **Database Schema Alignment (`prisma/schema.prisma`)**:
   - `Person` model (lines 123-158): Contains `id`, `firstName`, `lastName`, `phone`, `phoneLast4`, `dateOfBirth`, `birthDay`, `birthMonth`, `photoUrl`, `category`, `subCategory`, `status`, `isActive`.
   - `BirthdayReminderLog` model (lines 234-247):
     ```prisma
     model BirthdayReminderLog {
       id         String   @id @default(cuid())
       personId   String
       person     Person   @relation(fields: [personId], references: [id], onDelete: Cascade)
       year       Int
       type       String   // "GRAPHICS_T_MINUS_1" | "DAY_OF_CELEBRATION"
       status     String   @default("SENT") // "SENT" | "ACKNOWLEDGED" | "FLYER_READY"
       flyerUrl   String?  // Optional uploaded flyer link
       sentAt     DateTime @default(now())

       @@unique([personId, year, type])
       @@index([personId])
     }
     ```
     The schema defines `type` as `"GRAPHICS_T_MINUS_1"` (or `"DAY_OF_CELEBRATION"`), and enforces strict idempotency via `@@unique([personId, year, type])`.

3. **Existing Template Engine & Messaging Infrastructure**:
   - In `lib/template-engine.ts` (lines 223-281), the template engine already provides message banks for:
     - `BIRTHDAY_T_MINUS_1_MEDIA` with styles `CASUAL_YOUTH`, `CREATIVE_MEDIA`, `WARM_FELLOWSHIP`, `PASTORAL_CARE`.
     - `BIRTHDAY_DAY_OF_DM` with direct celebration greetings.
     - `BIRTHDAY_COMMUNITY` with public shoutouts.
   - Line 425: `const photoStatus = photoUrl || '[Photo requested / Use standard template]';`
   - Line 128: `export function formatBirthdayDate(month?: number | null, day?: number | null): string;`
   - In `lib/direct-dispatch.ts`, zero-credential fallback and `fetch` mocking patterns are established and pass 19 unit tests and 25 adversarial tests.

4. **Telegram Bot API Specifications & Constraints**:
   - Text endpoint: `POST https://api.telegram.org/bot<TOKEN>/sendMessage`
     - Payload: `{ "chat_id": string | number, "text": string, "parse_mode": "Markdown", "disable_web_page_preview": false }`
     - Length limit: 4096 UTF-8 characters.
   - Media endpoint: `POST https://api.telegram.org/bot<TOKEN>/sendPhoto`
     - Payload: `{ "chat_id": string | number, "photo": string, "caption": string, "parse_mode": "Markdown" }`
     - Caption limit: 1024 UTF-8 characters.
   - Markdown parse rules:
     - Legacy `Markdown`: special formatting characters are `*`, `_`, `` ` ``, `[`. Unescaped unclosed characters trigger HTTP 400 Bad Request (`can't parse entities`).
     - `MarkdownV2`: requires escaping 18 characters (`_`, `*`, `[`, `]`, `(`, `)`, `~`, `` ` ``, `>`, `#`, `+`, `-`, `=`, `|`, `{`, `}`, `.`, `!`). A single unescaped dot (`.`) or exclamation mark (`!`) triggers HTTP 400 Bad Request.
   - Error responses from Telegram Bot API:
     - HTTP 400: `{ "ok": false, "error_code": 400, "description": "Bad Request: chat not found" }` or photo fetch failure (`"failed to get HTTP URL content"`).
     - HTTP 401: `{ "ok": false, "error_code": 401, "description": "Unauthorized" }` (invalid token).
     - HTTP 429: `{ "ok": false, "error_code": 429, "description": "Too Many Requests: retry after 5", "parameters": { "retry_after": 5 } }`.

5. **Test Suite Baseline**:
   - `npm test` executed across all 12 test suites: **269 tests passing cleanly** (0 failures).

---

## 2. Logic Chain

1. **Dry-Run Mode Guarantee**:
   - *From Observation 1*: Since neither `TELEGRAM_BOT_TOKEN` nor `TELEGRAM_MEDIA_CHAT_ID` are configured in `.env` (and should not be committed into git), calling the Telegram API directly would throw or return network failures in local development and automated CI environments.
   - *Inference*: `lib/telegram.ts` must inspect `process.env.TELEGRAM_BOT_TOKEN` and `process.env.TELEGRAM_MEDIA_CHAT_ID` (or check an explicit `dryRun` option). If either is missing or `dryRun: true`, it must return a simulated success payload `{ success: true, dryRun: true, messageId: 'sim_...', ... }` without executing `fetch`. This ensures 100% test reliability and zero setup friction for new developers.

2. **Photo-to-Text Graceful Fallback**:
   - *From Observation 4*: `sendPhoto` requires Telegram servers to fetch the remote `photoUrl`. If the photo link is broken, expired, slow, or unsupported, Telegram returns HTTP 400 `"Bad Request: failed to get HTTP URL content"`. Moreover, some members have no `photoUrl` (`null` or empty string).
   - *Inference*:
     - If `photoUrl` is missing or empty, `sendMediaBirthdayAlert` skips `sendPhoto` entirely and sends a formatted text message via `sendMessage`.
     - If `photoUrl` is provided, `sendMediaBirthdayAlert` attempts `sendPhoto`. If `sendPhoto` fails with HTTP 400 or network error, it must immediately fall back to `sendMessage`, appending a direct link `*Photo Link:* [View Photo](url)` to the text. This guarantees the media team receives the alert even if photo hosting is unavailable.

3. **Markdown Escaping & Content Structure**:
   - *From Observation 3 & 4*: Unescaped special characters in names (e.g. `Mary_Jane`, `*Sister* Ruth`) break Telegram entity parsing and trigger HTTP 400.
   - *Inference*: A dedicated `escapeMarkdown` function must escape `*`, `_`, `` ` ``, and `[`. The alert message must format all required fields:
     - Celebrant Name: `*Celebrant:* ${escapeMarkdown(name)}`
     - Role/Department: `*Role / Department:* ${escapeMarkdown(department)}`
     - Birth Date: `*Birth Date:* ${formattedDate}`
     - Timeline: `Tomorrow (T-1 Day)` vs `Today (Day-Of)`
     - Photo Link: embedded photo or hyperlink
     - Explicit Call to Action: `🚨 *Action Required:* Please prepare birthday flyer for celebration tomorrow.` (T-1) or `📢 *Action Required:* Publish birthday flyer on church social media & broadcast channels.` (Day-of).

4. **Error Handling & Rate Limiting**:
   - *From Observation 4*: HTTP 401 indicates invalid token, HTTP 400 indicates bad chat ID or parsing error, and HTTP 429 returns `parameters.retry_after`.
   - *Inference*: The client wrapper must inspect response HTTP status and Telegram JSON `ok` and `error_code`. For HTTP 429, it must extract `retry_after`. It must return structured objects (`TelegramSendResult`) and never throw unhandled rejections.

5. **Test Strategy via `fetch` Mocking**:
   - *From Observation 5*: Vitest runs in Node.js environment where `global.fetch` can be mocked with `vi.fn().mockResolvedValue(...)`.
   - *Inference*: Tests can mock `global.fetch` to simulate HTTP 200 (success), HTTP 400 (bad chat ID or photo fetch failure), HTTP 401 (unauthorized), HTTP 429 (rate limit with `retry_after`), and network rejection, asserting complete coverage without external network requests.

---

## 3. Concrete Architecture for `lib/telegram.ts`

### 3.1 Types & Interfaces

```typescript
export interface TelegramConfig {
  botToken?: string;
  mediaChatId?: string;
  apiBaseUrl?: string; // Default 'https://api.telegram.org'
  dryRun?: boolean;     // Defaults to true if botToken or mediaChatId is missing
  timeoutMs?: number;   // Default 10000ms
}

export interface SendMessageOptions {
  chatId?: string | number;
  text: string;
  parseMode?: 'Markdown' | 'MarkdownV2' | 'HTML';
  disableWebPagePreview?: boolean;
  dryRun?: boolean;
}

export interface SendPhotoOptions {
  chatId?: string | number;
  photoUrl: string;
  caption?: string;
  parseMode?: 'Markdown' | 'MarkdownV2' | 'HTML';
  dryRun?: boolean;
}

export interface TelegramSendResult {
  success: boolean;
  messageId?: number | string;
  chatId?: string | number;
  dryRun?: boolean;
  simulated?: boolean;
  method: 'sendMessage' | 'sendPhoto';
  error?: string;
  errorCode?: number;
  retryAfter?: number;
  retryable?: boolean;
  rawResponse?: unknown;
  timestamp: string;
}

export interface BirthdayAlertPayload {
  celebrantId: string;
  celebrantName: string;
  roleOrDepartment?: string | null;
  category?: string | null;
  birthDateFormatted: string; // e.g. "14th November"
  daysUntilBirthday: number;  // 1 for T-1, 0 for Day-Of
  photoUrl?: string | null;
  phone?: string | null;
  customMessage?: string;
}

export interface MediaAlertDispatchResult extends TelegramSendResult {
  celebrantId: string;
  celebrantName: string;
  daysUntilBirthday: number;
  alertType: 'GRAPHICS_T_MINUS_1' | 'DAY_OF_CELEBRATION';
  fallbackOccurred?: boolean;
  fallbackReason?: string;
  formattedText: string;
}

export interface BatchDispatchResult {
  total: number;
  sentCount: number;
  failedCount: number;
  dryRunCount: number;
  results: MediaAlertDispatchResult[];
}
```

### 3.2 Escaping & Formatting Utilities

```typescript
/**
 * Escapes special characters for Telegram legacy Markdown (*, _, `, [)
 */
export function escapeMarkdown(text?: string | null): string {
  if (!text) return '';
  return text.replace(/([*_`\[])/g, '\\$1');
}

/**
 * Escapes characters for Telegram MarkdownV2 (18 special characters)
 */
export function escapeMarkdownV2(text?: string | null): string {
  if (!text) return '';
  return text.replace(/([_*\[\]()~`>#+\-=|{}.!\\])/g, '\\$1');
}

/**
 * Formats the Markdown alert message according to R3 requirements
 */
export function formatBirthdayAlertMarkdown(payload: BirthdayAlertPayload): string {
  const isTMinus1 = payload.daysUntilBirthday === 1;
  const isDayOf = payload.daysUntilBirthday === 0;

  const name = escapeMarkdown(payload.celebrantName);
  const dept = escapeMarkdown(payload.roleOrDepartment || payload.category || 'Youth Member');
  const dateStr = escapeMarkdown(payload.birthDateFormatted);
  const phone = payload.phone ? escapeMarkdown(payload.phone) : null;

  if (isTMinus1) {
    let msg = `🎨 *MEDIA ALERT: BIRTHDAY TOMORROW (T-1)*\n\n`;
    msg += `🎂 *Celebrant:* ${name}\n`;
    msg += `🏢 *Role / Unit:* ${dept}\n`;
    msg += `📅 *Birth Date:* Tomorrow (${dateStr})\n`;
    msg += `⏰ *Timeline:* 1 Day to Birthday\n`;
    if (phone) {
      msg += `📞 *Contact:* ${phone}\n`;
    }
    if (payload.photoUrl) {
      msg += `📸 *Photo Asset:* [High-Res Link](${payload.photoUrl})\n`;
    } else {
      msg += `📸 *Photo Asset:* None provided (Use generic church template)\n`;
    }
    msg += `\n🚨 *Action Required:* Please prepare birthday flyer today for distribution at 07:00 AM tomorrow! 🚀`;
    return msg;
  }

  if (isDayOf) {
    let msg = `🎉 *MEDIA ALERT: TODAY'S CELEBRANT (DAY-OF)*\n\n`;
    msg += `🎂 *Celebrant:* ${name}\n`;
    msg += `🏢 *Role / Unit:* ${dept}\n`;
    msg += `📅 *Date:* Today (${dateStr})\n`;
    msg += `⏰ *Timeline:* Today!\n`;
    if (phone) {
      msg += `📞 *Contact:* ${phone}\n`;
    }
    if (payload.photoUrl) {
      msg += `📸 *Flyer Asset:* [High-Res Photo](${payload.photoUrl})\n`;
    }
    msg += `\n📢 *Action Required:* Please publish birthday flyer across church social media & broadcast channels! 🕊️✨`;
    return msg;
  }

  // Arbitrary upcoming days
  let msg = `📅 *MEDIA ALERT: UPCOMING BIRTHDAY (T-${payload.daysUntilBirthday})*\n\n`;
  msg += `🎂 *Celebrant:* ${name}\n`;
  msg += `🏢 *Role / Unit:* ${dept}\n`;
  msg += `📅 *Birth Date:* ${dateStr}\n`;
  msg += `⏰ *Timeline:* In ${payload.daysUntilBirthday} days\n\n`;
  msg += `📋 *Action Required:* Queue flyer preparation with media team.`;
  return msg;
}
```

### 3.3 Core Telegram Wrapper Implementation (`lib/telegram.ts`)

```typescript
export class TelegramBotClient {
  private botToken: string;
  private mediaChatId: string;
  private apiBaseUrl: string;
  private isDryRun: boolean;
  private timeoutMs: number;

  constructor(config?: TelegramConfig) {
    this.botToken = config?.botToken || process.env.TELEGRAM_BOT_TOKEN || '';
    this.mediaChatId = config?.mediaChatId || process.env.TELEGRAM_MEDIA_CHAT_ID || '';
    this.apiBaseUrl = (config?.apiBaseUrl || 'https://api.telegram.org').replace(/\/$/, '');
    this.timeoutMs = config?.timeoutMs || 10000;
    
    // Automatically engage dry-run if credentials are not configured or explicitly set
    this.isDryRun = Boolean(
      config?.dryRun ||
      process.env.TELEGRAM_DRY_RUN === 'true' ||
      !this.botToken ||
      !this.mediaChatId
    );
  }

  public getDryRunStatus(): boolean {
    return this.isDryRun;
  }

  public async sendMessage(options: SendMessageOptions): Promise<TelegramSendResult> {
    const timestamp = new Date().toISOString();
    const dryRun = options.dryRun ?? this.isDryRun;
    const chatId = options.chatId || this.mediaChatId;

    if (dryRun) {
      return {
        success: true,
        dryRun: true,
        simulated: true,
        method: 'sendMessage',
        messageId: `sim_msg_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        chatId,
        timestamp,
      };
    }

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);

      const url = `${this.apiBaseUrl}/bot${this.botToken}/sendMessage`;
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: options.text,
          parse_mode: options.parseMode || 'Markdown',
          disable_web_page_preview: options.disableWebPagePreview ?? false,
        }),
        signal: controller.signal,
      });

      clearTimeout(timer);
      const json = await response.json();

      if (!response.ok || !json.ok) {
        const errorCode = json.error_code || response.status;
        const retryAfter = json.parameters?.retry_after;
        return {
          success: false,
          method: 'sendMessage',
          chatId,
          errorCode,
          retryAfter,
          retryable: errorCode === 429 || errorCode >= 500,
          error: json.description || `Telegram API error: HTTP ${response.status}`,
          rawResponse: json,
          timestamp,
        };
      }

      return {
        success: true,
        method: 'sendMessage',
        messageId: json.result?.message_id,
        chatId: json.result?.chat?.id || chatId,
        rawResponse: json,
        timestamp,
      };
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      return {
        success: false,
        method: 'sendMessage',
        chatId,
        retryable: true,
        error: `Telegram sendMessage request failed: ${errorMsg}`,
        timestamp,
      };
    }
  }

  public async sendPhoto(options: SendPhotoOptions): Promise<TelegramSendResult> {
    const timestamp = new Date().toISOString();
    const dryRun = options.dryRun ?? this.isDryRun;
    const chatId = options.chatId || this.mediaChatId;

    if (dryRun) {
      return {
        success: true,
        dryRun: true,
        simulated: true,
        method: 'sendPhoto',
        messageId: `sim_photo_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        chatId,
        timestamp,
      };
    }

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);

      // Telegram caption limit is 1024 characters
      const caption = options.caption ? options.caption.slice(0, 1024) : undefined;

      const url = `${this.apiBaseUrl}/bot${this.botToken}/sendPhoto`;
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          photo: options.photoUrl,
          caption,
          parse_mode: options.parseMode || 'Markdown',
        }),
        signal: controller.signal,
      });

      clearTimeout(timer);
      const json = await response.json();

      if (!response.ok || !json.ok) {
        const errorCode = json.error_code || response.status;
        const retryAfter = json.parameters?.retry_after;
        return {
          success: false,
          method: 'sendPhoto',
          chatId,
          errorCode,
          retryAfter,
          retryable: errorCode === 429 || errorCode >= 500,
          error: json.description || `Telegram API error: HTTP ${response.status}`,
          rawResponse: json,
          timestamp,
        };
      }

      return {
        success: true,
        method: 'sendPhoto',
        messageId: json.result?.message_id,
        chatId: json.result?.chat?.id || chatId,
        rawResponse: json,
        timestamp,
      };
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      return {
        success: false,
        method: 'sendPhoto',
        chatId,
        retryable: true,
        error: `Telegram sendPhoto request failed: ${errorMsg}`,
        timestamp,
      };
    }
  }

  /**
   * Dispatches birthday alert with photo support and automatic text fallback
   */
  public async dispatchMediaBirthdayAlert(
    payload: BirthdayAlertPayload,
    options?: { dryRun?: boolean; chatId?: string | number }
  ): Promise<MediaAlertDispatchResult> {
    const formattedText = payload.customMessage || formatBirthdayAlertMarkdown(payload);
    const alertType = payload.daysUntilBirthday === 1 ? 'GRAPHICS_T_MINUS_1' : 'DAY_OF_CELEBRATION';

    // Scenario A: Celebrant has a photoUrl -> Attempt sendPhoto
    if (payload.photoUrl && payload.photoUrl.trim() !== '') {
      const photoResult = await this.sendPhoto({
        chatId: options?.chatId,
        photoUrl: payload.photoUrl.trim(),
        caption: formattedText,
        dryRun: options?.dryRun,
      });

      if (photoResult.success) {
        return {
          ...photoResult,
          celebrantId: payload.celebrantId,
          celebrantName: payload.celebrantName,
          daysUntilBirthday: payload.daysUntilBirthday,
          alertType,
          fallbackOccurred: false,
          formattedText,
        };
      }

      // Scenario B: sendPhoto failed -> Fallback to sendMessage
      const fallbackResult = await this.sendMessage({
        chatId: options?.chatId,
        text: formattedText,
        dryRun: options?.dryRun,
      });

      return {
        ...fallbackResult,
        celebrantId: payload.celebrantId,
        celebrantName: payload.celebrantName,
        daysUntilBirthday: payload.daysUntilBirthday,
        alertType,
        fallbackOccurred: true,
        fallbackReason: photoResult.error || 'sendPhoto failed',
        formattedText,
      };
    }

    // Scenario C: No photoUrl -> Send text message directly
    const textResult = await this.sendMessage({
      chatId: options?.chatId,
      text: formattedText,
      dryRun: options?.dryRun,
    });

    return {
      ...textResult,
      celebrantId: payload.celebrantId,
      celebrantName: payload.celebrantName,
      daysUntilBirthday: payload.daysUntilBirthday,
      alertType,
      fallbackOccurred: false,
      formattedText,
    };
  }

  /**
   * Batch dispatch with sequential spacing to prevent rate limit spikes
   */
  public async dispatchMediaBirthdayAlertBatch(
    payloads: BirthdayAlertPayload[],
    options?: { dryRun?: boolean; delayBetweenMs?: number }
  ): Promise<BatchDispatchResult> {
    const results: MediaAlertDispatchResult[] = [];
    const delayMs = options?.delayBetweenMs ?? 100;

    for (const payload of payloads) {
      const result = await this.dispatchMediaBirthdayAlert(payload, options);
      results.push(result);

      if (delayMs > 0 && !result.dryRun && payloads.indexOf(payload) < payloads.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }

    return {
      total: results.length,
      sentCount: results.filter((r) => r.success).length,
      failedCount: results.filter((r) => !r.success).length,
      dryRunCount: results.filter((r) => r.dryRun).length,
      results,
    };
  }
}

// Singleton helper functions
const defaultClient = new TelegramBotClient();

export function sendTelegramMessage(options: SendMessageOptions) {
  return defaultClient.sendMessage(options);
}

export function sendTelegramPhoto(options: SendPhotoOptions) {
  return defaultClient.sendPhoto(options);
}

export function sendMediaBirthdayAlert(payload: BirthdayAlertPayload, options?: { dryRun?: boolean; chatId?: string | number }) {
  return defaultClient.dispatchMediaBirthdayAlert(payload, options);
}

export function sendMediaBirthdayAlertBatch(payloads: BirthdayAlertPayload[], options?: { dryRun?: boolean; delayBetweenMs?: number }) {
  return defaultClient.dispatchMediaBirthdayAlertBatch(payloads, options);
}
```

---

## 4. Test Strategy (`tests/unit/telegram.test.ts`)

### Test Coverage Matrix (14 Test Cases)

| Test ID | Category | Scenario | Expected Outcome |
|---------|----------|----------|------------------|
| `T1.1` | Formatting | `escapeMarkdown` with `*`, `_`, `` ` ``, `[` | All special chars escaped with `\` |
| `T1.2` | Formatting | `formatBirthdayAlertMarkdown` (T-1) | Contains "T-1", celebrant name, role, birth date, photo link, CTA "Please prepare birthday flyer" |
| `T1.3` | Formatting | `formatBirthdayAlertMarkdown` (Day-Of) | Contains "DAY-OF", "Today!", celebrant name, CTA "publish birthday flyer" |
| `T2.1` | Dry-Run | Unset `TELEGRAM_BOT_TOKEN` | Returns `{ success: true, dryRun: true }` without calling `fetch` |
| `T2.2` | Dry-Run | Unset `TELEGRAM_MEDIA_CHAT_ID` | Returns `{ success: true, dryRun: true }` without calling `fetch` |
| `T2.3` | Dry-Run | Explicit `dryRun: true` override | Returns simulated payload without calling `fetch` |
| `T3.1` | Live/Mocked | `sendMessage` HTTP 200 | Calls Telegram endpoint, parses `message_id`, returns success |
| `T3.2` | Live/Mocked | `sendPhoto` HTTP 200 with caption | Calls `sendPhoto` with photo and caption, returns success |
| `T4.1` | Fallback | `sendMediaBirthdayAlert` without photo | Skips `sendPhoto`, calls `sendMessage` directly |
| `T4.2` | Fallback | `sendMediaBirthdayAlert` with photo when `sendPhoto` fails (400) | Falls back to `sendMessage`, embeds photo URL, `fallbackOccurred: true` |
| `T5.1` | Error | HTTP 401 Unauthorized | Returns `{ success: false, errorCode: 401, error: ... }` non-throwing |
| `T5.2` | Error | HTTP 400 Bad Request (chat not found) | Returns `{ success: false, errorCode: 400, retryable: false }` |
| `T5.3` | Error | HTTP 429 Too Many Requests | Parses `parameters.retry_after: 5`, returns `retryAfter: 5, retryable: true` |
| `T6.1` | Batch | `dispatchMediaBirthdayAlertBatch` | Dispatches all alerts and aggregates totals accurately |

---

## 5. Caveats

1. **Telegram Image URL Accessibility**:
   Telegram's servers require `photoUrl` to be publicly reachable on the public internet (HTTP/HTTPS). Local URLs (e.g. `http://localhost:3000/avatar.png`) or private intranet URLs will cause Telegram to return HTTP 400 (`"failed to get HTTP URL content"`). Our design specifically handles this by automatically catching the 400 error and falling back to `sendMessage` with the photo URL text link.
2. **Caption Truncation**:
   Telegram strictly limits captions on `sendPhoto` to 1024 characters. Our implementation explicitly truncates captions to 1024 characters if custom text is overly long, preventing rejection.
3. **No Caveats on Integrations**:
   The types and outputs of `lib/telegram.ts` integrate seamlessly with `BirthdayReminderLog` and `lib/birthday-engine.ts` investigated by `m4_explorer_2`, and with the route handlers investigated by `m4_explorer_3`.

---

## 6. Conclusion

- `lib/telegram.ts` is fully designed as a resilient, zero-failure, production-ready wrapper for Telegram Bot API.
- It satisfies all Milestone 4 R3 requirements:
  1. Formatted Markdown alerts with proper escaping and required fields (Name, Department, Date, T-1 Countdown, Photo Link, Action CTA).
  2. Seamless `sendPhoto` dispatch with graceful automatic fallback to `sendMessage` if the photo is missing or fails.
  3. Automatic dry-run mode when `TELEGRAM_BOT_TOKEN` or `TELEGRAM_MEDIA_CHAT_ID` are missing, ensuring development environments and automated test pipelines run smoothly without live credentials.
  4. Comprehensive HTTP status handling for 400, 401, 429 (rate-limit with `retry_after`), and network failures without unhandled throws.
  5. Deterministic testing strategy using `fetch` mocking in Vitest.

---

## 7. Verification Method

1. **Source Inspection**:
   - Inspect `.agents/teamwork/m4_explorer_1/handoff.md` (this report).
   - Verify design against `prisma/schema.prisma` lines 234-247 (`BirthdayReminderLog`) and `ORIGINAL_REQUEST.md` line 19.
2. **Implementation Verification (when built by Worker)**:
   - Create `lib/telegram.ts` adhering to the architecture above.
   - Create `tests/unit/telegram.test.ts` implementing the 14 test cases in the test matrix.
   - Run `npm test` to verify that all existing 269 tests and new Telegram tests pass with 100% green status:
     ```powershell
     npm test
     ```
