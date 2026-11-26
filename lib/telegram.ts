/**
 * Telegram Bot Client & Media Alert Dispatcher
 * RCCG Jesus Covenant Zone (Milestone 4 / Requirement R3)
 *
 * Guarantees:
 * - 100% resilient: Never throws unhandled rejections to callers or cron endpoints.
 * - Automatic Dry-Run: Automatically operates in simulation mode if `TELEGRAM_BOT_TOKEN`
 *   or `TELEGRAM_MEDIA_CHAT_ID` are missing or unset, returning simulated success payloads.
 * - Photo-to-Text Fallback: If `sendPhoto` fails (e.g. invalid photo URL or fetch error),
 *   automatically falls back to `sendMessage` with the photo URL link embedded in the text.
 * - Markdown Escaping: Robust escaping preventing Telegram entity parsing errors (HTTP 400).
 * - Rate Limiting & Error Handling: Handles HTTP 400, 401, 429 (extracts `retry_after`),
 *   and network rejections cleanly.
 */

export interface TelegramConfig {
  botToken?: string;
  mediaChatId?: string | number;
  apiBaseUrl?: string;
  dryRun?: boolean;
  timeoutMs?: number;
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
  celebrantId?: string;
  celebrantName: string;
  roleOrDepartment?: string | null;
  department?: string | null;
  category?: string | null;
  birthDateFormatted: string; // e.g. "14th November"
  daysUntilBirthday?: number; // 1 for T-1, 0 for Day-Of
  isTomorrow?: boolean;
  isToday?: boolean;
  photoUrl?: string | null;
  phone?: string | null;
  customMessage?: string;
}

export interface MediaAlertDispatchResult extends TelegramSendResult {
  celebrantId?: string;
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

/**
 * Escapes special characters for Telegram legacy Markdown (*, _, `, [, ])
 */
export function escapeMarkdown(text?: string | null): string {
  if (!text) return '';
  return text.replace(/([*_`\[\]])/g, '\\$1');
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
  // Determine if Day-Of, T-1 (Tomorrow), or generic upcoming
  const isDayOf = payload.daysUntilBirthday === 0 || payload.isToday === true;
  const isTMinus1 =
    !isDayOf &&
    (payload.daysUntilBirthday === 1 ||
      payload.isTomorrow === true ||
      payload.daysUntilBirthday === undefined);

  const name = escapeMarkdown(payload.celebrantName);
  const dept = escapeMarkdown(
    payload.roleOrDepartment || payload.department || payload.category || 'Youth Member'
  );
  const dateStr = escapeMarkdown(payload.birthDateFormatted);
  const phone = payload.phone ? escapeMarkdown(payload.phone) : null;

  if (isTMinus1) {
    let msg = `🎨 *RCCG YOUTH MEDIA ALERT — T-1 DAY FLYER NOTICE*\n`;
    msg += `🎂 *Reminder:* ${name}'s birthday is tomorrow!\n\n`;
    msg += `🎂 *Celebrant:* ${name}\n`;
    msg += `🏢 *Role / Unit:* ${dept}\n`;
    msg += `📅 *Birth Date:* Tomorrow (${dateStr})\n`;
    msg += `⏰ *Timeline:* 1 Day to Birthday (T-1)\n`;
    if (phone) {
      msg += `📞 *Contact:* ${phone}\n`;
    }
    if (payload.photoUrl && payload.photoUrl.trim() !== '') {
      msg += `📸 *Photo Asset:* [High-Res Link](${payload.photoUrl.trim()})\n`;
    } else {
      msg += `📸 *Photo Asset:* None provided (Use generic church template)\n`;
    }
    msg += `\n⚡ *Action Required:* Please prepare birthday flyer today for distribution at 07:00 AM tomorrow! 🚀`;
    return msg;
  }

  if (isDayOf) {
    let msg = `🎉 *RCCG MEDIA CELEBRATION ALERT — TODAY'S CELEBRANT*\n\n`;
    msg += `🎂 *Celebrant:* ${name}\n`;
    msg += `🏢 *Role / Unit:* ${dept}\n`;
    msg += `📅 *Date:* Today (${dateStr})\n`;
    msg += `⏰ *Timeline:* Today (Day-Of Celebration)!\n`;
    if (phone) {
      msg += `📞 *Contact:* ${phone}\n`;
    }
    if (payload.photoUrl && payload.photoUrl.trim() !== '') {
      msg += `📸 *Flyer Asset:* [View Photo Asset](${payload.photoUrl.trim()})\n`;
    }
    msg += `\n📢 *Action Required:* Please publish birthday flyer across church social media & broadcast channels! 🕊️✨`;
    return msg;
  }

  // Generic upcoming days
  const days = payload.daysUntilBirthday ?? 2;
  let msg = `📅 *RCCG MEDIA ALERT — UPCOMING BIRTHDAY (T-${days})*\n\n`;
  msg += `🎂 *Celebrant:* ${name}\n`;
  msg += `🏢 *Role / Unit:* ${dept}\n`;
  msg += `📅 *Birth Date:* ${dateStr}\n`;
  msg += `⏰ *Timeline:* In ${days} days\n\n`;
  msg += `📋 *Action Required:* Queue flyer preparation with media design team.`;
  return msg;
}

/**
 * Core Telegram Bot API Client
 */
export class TelegramBotClient {
  private botToken: string;
  private mediaChatId: string | number;
  private apiBaseUrl: string;
  private isDryRun: boolean;
  private timeoutMs: number;

  constructor(config?: TelegramConfig) {
    this.botToken = config?.botToken || process.env.TELEGRAM_BOT_TOKEN || '';
    this.mediaChatId =
      config?.mediaChatId || process.env.TELEGRAM_MEDIA_CHAT_ID || '';
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

  /**
   * Dispatches text message to Telegram chat
   */
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

  /**
   * Dispatches photo with caption to Telegram chat
   */
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
    const daysUntil =
      payload.daysUntilBirthday !== undefined
        ? payload.daysUntilBirthday
        : payload.isToday
          ? 0
          : 1;
    const alertType = daysUntil === 1 ? 'GRAPHICS_T_MINUS_1' : 'DAY_OF_CELEBRATION';

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
          daysUntilBirthday: daysUntil,
          alertType,
          fallbackOccurred: false,
          formattedText,
        };
      }

      // Scenario B: sendPhoto failed -> Fallback to sendMessage with embedded photo link
      const fallbackText = `${formattedText}\n\n[Attached Photo Link](${payload.photoUrl.trim()})`;
      const fallbackResult = await this.sendMessage({
        chatId: options?.chatId,
        text: fallbackText,
        dryRun: options?.dryRun,
      });

      return {
        ...fallbackResult,
        celebrantId: payload.celebrantId,
        celebrantName: payload.celebrantName,
        daysUntilBirthday: daysUntil,
        alertType,
        fallbackOccurred: true,
        fallbackReason: photoResult.error || 'sendPhoto failed',
        formattedText: fallbackText,
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
      daysUntilBirthday: daysUntil,
      alertType,
      fallbackOccurred: false,
      formattedText,
    };
  }

  /**
   * Batch dispatch with sequential spacing to prevent Telegram rate limit spikes
   */
  public async dispatchMediaBirthdayAlertBatch(
    payloads: BirthdayAlertPayload[],
    options?: { dryRun?: boolean; chatId?: string | number; delayMs?: number }
  ): Promise<BatchDispatchResult> {
    const delayMs = options?.delayMs ?? 50;
    const results: MediaAlertDispatchResult[] = [];
    let sentCount = 0;
    let failedCount = 0;
    let dryRunCount = 0;

    for (const payload of payloads) {
      const res = await this.dispatchMediaBirthdayAlert(payload, options);
      results.push(res);
      if (res.success) {
        sentCount++;
        if (res.dryRun) dryRunCount++;
      } else {
        failedCount++;
      }

      if (delayMs > 0 && payloads.indexOf(payload) < payloads.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }

    return {
      total: payloads.length,
      sentCount,
      failedCount,
      dryRunCount,
      results,
    };
  }
}

// Global default client instance
let defaultTelegramClient: TelegramBotClient | null = null;

export function getTelegramClient(config?: TelegramConfig): TelegramBotClient {
  if (config) {
    return new TelegramBotClient(config);
  }
  if (!defaultTelegramClient) {
    defaultTelegramClient = new TelegramBotClient();
  }
  return defaultTelegramClient;
}

// Helper exports
export async function sendTelegramMessage(
  text: string,
  options?: SendMessageOptions & { config?: TelegramConfig }
): Promise<TelegramSendResult> {
  const client = getTelegramClient(options?.config);
  return client.sendMessage({
    text,
    ...options,
  });
}

export async function sendTelegramPhoto(
  photoUrl: string,
  caption?: string,
  options?: SendPhotoOptions & { config?: TelegramConfig }
): Promise<TelegramSendResult> {
  const client = getTelegramClient(options?.config);
  return client.sendPhoto({
    photoUrl,
    caption,
    ...options,
  });
}

export async function sendMediaBirthdayAlert(
  payload: BirthdayAlertPayload,
  options?: { dryRun?: boolean; chatId?: string | number; config?: TelegramConfig }
): Promise<MediaAlertDispatchResult> {
  const client = getTelegramClient(options?.config);
  return client.dispatchMediaBirthdayAlert(payload, options);
}

export async function sendMediaBirthdayAlertBatch(
  payloads: BirthdayAlertPayload[],
  options?: { dryRun?: boolean; chatId?: string | number; delayMs?: number; config?: TelegramConfig }
): Promise<BatchDispatchResult> {
  const client = getTelegramClient(options?.config);
  return client.dispatchMediaBirthdayAlertBatch(payloads, options);
}
