# Dispatch Instructions

## 2026-11-12T17:33:02Z
Rebuild and enhance the RCCG Jesus Covenant Zone Church Management System with a Youth-First UI, geofenced attendance system, Zero-Forgotten-Member automated follow-up workflow, and Telegram-based birthday notification bot for the media team.

Working directory: c:\Users\dafen\OneDrive\Desktop\church-management-system
Integrity mode: development

Requirements:
- R1. Youth-First Attendance System: shadcn components, Framer Motion, QR scan, 4-digit phone lookup, 1-tap remembered profile, anti-proxy lock, strict geofencing enforcement (6.5244, 3.3792, 150m, Africa/Lagos WAT), RCCG logo prominently displayed.
- R2. Zero-Forgotten-Member Follow-Up System: absence detection radar (1 wk, 2 wk, first-timer 72h), contextual WhatsApp draft generation, 48h escalation tracking to Youth Pastor, integrated with FollowUpTask schema. Direct dispatch module (SMS/WhatsApp gateway + wa.me fallback). Deterministic template interpolation engine (0 tokens) with high-variety youth-friendly message banks ({FirstName}, {Category}, {DaysAbsent}), opt-in AI polish with caching.
- R3. Media Team Birthday Telegram Automation: Telegram bot formatted Markdown notifications (celebrant, role, photoUrl, birthDate) at T-1 day, day-of alerts, BirthdayReminderLog, authorized cron endpoints (/api/cron/birthdays, /api/cron/follow-up). Direct DM greetings.
- R4. Frontend Design & Engineering Compliance: shadcn, Framer Motion momentum deceleration (ease-out), scale from 0.95, tactile click feedback, zero AI design tells, AAA contrast, 44px min touch targets.

Status: Generation 2 Project Orchestrator continuing the run. Milestone 1 & 2 PASSED (179 tests passing). Milestone 3 implementation complete (206 tests passing); resolve final gate items for Milestone 3, then proceed to Milestone 4 and Milestone 5.

## 2026-11-12T20:33:38Z
The server has restarted. Resume execution immediately:
1. Current State in Milestone 4:
   - Worker m4_worker_1 completed all implementation (314/314 tests passed, Next.js build clean).
   - Reviewer 2 delivered APPROVE (.agents/teamwork/m4_reviewer_2/handoff.md).
   - Forensic Auditor delivered CLEAN (.agents/teamwork/m4_auditor_1/handoff.md).
   - Challenger 1 authored tests in tests/adversarial/birthday-telegram-adversarial.test.ts.
2. Finalize Milestone 4 gate evaluation, and proceed directly to Milestone 5: E2E Verification & Adversarial Hardening (Requirements R1-R4, final regression verification, TEST_READY.md).
3. Keep execution moving to completion.
