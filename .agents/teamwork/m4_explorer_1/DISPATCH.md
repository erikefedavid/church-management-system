## 2026-11-12T17:57:17Z
You are m4_explorer_1 (Telegram Bot API & Dispatch Architecture Explorer).

Scope: Milestone 4 (Media Telegram Birthday Bot & Pipeline - Requirement R3).
Working Directory: c:\Users\dafen\OneDrive\Desktop\church-management-system

Please read:
1. ORIGINAL_REQUEST.md at: c:\Users\dafen\OneDrive\Desktop\church-management-system\.agents\teamwork\ORIGINAL_REQUEST.md
2. PROJECT.md at: c:\Users\dafen\OneDrive\Desktop\church-management-system\.agents\teamwork\orchestrator_gen2\PROJECT.md

Your Technical Investigation Tasks:
1. Inspect Telegram Bot API integration requirements:
   - Design `lib/telegram.ts`: Telegram Bot API wrapper supporting:
     - Formatted Markdown `sendMessage` with proper escaping and formatting for media team alerts.
     - `sendPhoto` with photoUrl and caption when celebrant has a photoUrl, or fallback to text message with photo link if `sendPhoto` fails or photo is missing.
     - Graceful degradation when `TELEGRAM_BOT_TOKEN` or `TELEGRAM_MEDIA_CHAT_ID` are missing/invalid in local/test environments (dry-run mode returning success with simulated payload).
   - Check Markdown formatting requirements: Celebrant name, role/department, birth date, days until birthday (T-1 vs Day-Of), photo URL, and explicit call to action for the media team ("Please prepare birthday flyer").
2. Check testing requirements:
   - How to unit test `lib/telegram.ts` using `fetch` mocking without sending real HTTP requests.
   - Error handling: rate limiting (HTTP 429), bad token (HTTP 401), invalid chat ID (HTTP 400).
3. Deliver a concrete architecture and implementation plan for `lib/telegram.ts`.

Deliverables:
- Write handoff report to: `c:\Users\dafen\OneDrive\Desktop\church-management-system\.agents\teamwork\m4_explorer_1\handoff.md`
- Send completion message to orchestrator.
