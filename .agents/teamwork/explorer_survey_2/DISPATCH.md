# DISPATCH — Explorer Survey 2: Follow-Up & Dispatch Engine

## Mission
Survey the follow-up system, absence detection, FollowUpTask schema, cron endpoints, direct messaging (SMS/WhatsApp) gateway architecture, and token-optimized deterministic template engine to inventory features, constraints, and required changes for R2 and User Follow-Up requirements.

## Relevant Paths
- ORIGINAL_REQUEST.md: c:\Users\dafen\OneDrive\Desktop\church-management-system\.agents\teamwork\ORIGINAL_REQUEST.md
- Rebuild Plan: C:\Users\dafen\.gemini\antigravity\brain\47492a5b-8cba-497b-9a42-877eb16858f4\rebuild_plan.md
- Existing Code:
  - `app/followup/` or `app/actions/followup.ts` (if exists)
  - `app/api/cron/` (if exists)
  - `prisma/schema.prisma` (`FollowUpTask`, `FollowUpResult`, `Person`, `AttendanceRecord`)
  - `lib/` (any existing notification, AI, or message generators)

## Scope & Boundaries
- Strictly read-only exploration. DO NOT modify any code.
- Investigate:
  1. Absence detection logic (1 week missed, 2 weeks missed, first-timers within 72h).
  2. FollowUpTask schema requirements and 48-hour pastor escalation logic.
  3. Contextual WhatsApp message generation.
  4. Token optimization: zero-token deterministic template interpolation engine with youth-friendly banks ({FirstName}, {Category}, {DaysAbsent}) + opt-in on-demand LLM polish with caching.
  5. Direct dispatch module (SMS/WhatsApp gateway: Termii / Twilio / WhatsApp Cloud API via env vars, with 1-click wa.me fallback).
  6. `/api/cron/follow-up` endpoint requirements (authorization, error handling, batching).
- Output your report to: `c:\Users\dafen\OneDrive\Desktop\church-management-system\.agents\teamwork\explorer_survey_2\handoff.md`

## 2026-11-12T14:30:11Z
You are Explorer 2 (Follow-Up & Dispatch Engine Explorer).
Read your task dispatch file at:
c:\Users\dafen\OneDrive\Desktop\church-management-system\.agents\teamwork\explorer_survey_2\DISPATCH.md
Read the original request at:
c:\Users\dafen\OneDrive\Desktop\church-management-system\.agents\teamwork\ORIGINAL_REQUEST.md

Your task is to thoroughly survey the follow-up system, absence detection radar, FollowUpTask schema, cron endpoints, direct messaging gateway, and token-optimized template engine:
1. Examine prisma/schema.prisma (Person, AttendanceRecord, FollowUpTask, FollowUpResult), app/followup/, app/actions/, app/api/cron/, and lib/.
2. Check existing support and gaps for: absence detection radar (missed 1 week, missed 2 weeks, first-timer 72h window), /api/cron/follow-up authorized endpoint, 48-hour pastor escalation logic.
3. Check requirements for:
   - Direct dispatch module (SMS/WhatsApp gateway: Termii / Twilio / WhatsApp Cloud API via env vars, with 1-click wa.me fallback).
   - Deterministic template interpolation engine (0 tokens) with high-variety youth-friendly message banks ({FirstName}, {Category}, {DaysAbsent}), with opt-in LLM polish and caching.
4. Output your complete findings report to:
c:\Users\dafen\OneDrive\Desktop\church-management-system\.agents\teamwork\explorer_survey_2\handoff.md
When done, send a message to the orchestrator summarizing your findings and report path.
