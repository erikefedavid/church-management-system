## 2026-11-12T16:37:24Z
From: 9ffc4707-a26f-4abc-94bd-08bbb49a081e
Priority: MESSAGE_PRIORITY_HIGH

You are m3_explorer_3 (Youth Follow-Up Dashboard UI & Compliance Explorer).
Your State Folder is: c:\Users\dafen\OneDrive\Desktop\church-management-system\.agents\teamwork\m3_explorer_3
Your Working Directory is: c:\Users\dafen\OneDrive\Desktop\church-management-system
Original Request Path: c:\Users\dafen\OneDrive\Desktop\church-management-system\.agents\teamwork\ORIGINAL_REQUEST.md
Project Document Path: c:\Users\dafen\OneDrive\Desktop\church-management-system\.agents\teamwork\orchestrator\PROJECT.md

MANDATORY RULES:
- You are read-only! NEVER modify source code or tests.
- Read ORIGINAL_REQUEST.md and PROJECT.md first.
- Initialize your BRIEFING.md and progress.md in your state folder.
- When done, write handoff.md in your state folder and call send_message to report back.

MISSION:
Investigate and design the Youth Follow-Up Dashboard UI (`app/followup/page.tsx` or components) adhering strictly to the Holy Trinity of Frontend Excellence (Leon Lin `design-taste-frontend`, Impeccable Style, and Emil Kowalski motion physics):
1. Review existing `app/followup/page.tsx` and related components in `app/`. Identify what needs enhancement or restructuring to meet the youth-first follow-up mandate.
2. Structure the Follow-Up Dashboard:
   - Radar Overview: Metric cards (e.g. "Missed 1 Week", "Missed 2 Weeks", "First-Timers (72h)", "Escalated to Pastor") with active filtering.
   - Member Follow-Up Cards:
     - Prominent member details (name, category/role, days absent, last attendance date).
     - Deterministic 0-token WhatsApp message preview generated via `lib/template-engine.ts` (`formatFollowUpMessage` with appropriate category and tone).
     - 1-Click WhatsApp Button (opens formatted `https://wa.me/...` link).
     - Direct Dispatch Trigger (calls `lib/direct-dispatch.ts` via server action).
     - "Polish with AI" On-Demand Button: Calls `lib/ai-assistant.ts` with deduplication caching. Near-zero token spending. Displays subtle loading and diff/polished message.
     - Task Completion / Outcome Selector: "Contacted (WhatsApp)", "Contacted (Call)", "Prayed With", "Visit Scheduled", "No Response".
3. Verify Compliance with User Rules:
   - Emil Kowalski motion: `cubic-bezier(0.23, 1, 0.32, 1)`, scale from 0.95 on entrance, `active:scale-[0.97]` tap feedback (<100ms).
   - Zero AI tells: Zero fake hairline grids, zero arbitrary purple glows / floating blur bubbles, zero cartoon bounces.
   - Accessibility: 44px minimum touch targets, WCAG AAA contrast, responsive mobile/tablet/desktop layouts.
4. Specify server actions, state hooks, and component decomposition for `m3_worker_1`.
