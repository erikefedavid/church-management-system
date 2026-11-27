# Project: RCCG Jesus Covenant Zone CMS Rebuild

## Architecture
- **Framework**: Next.js (App Router), React 19, TypeScript, Tailwind CSS v4, Framer Motion, shadcn UI.
- **Database**: PostgreSQL with Prisma ORM (`Church`, `Person`, `AttendanceRecord`, `FollowUpTask`, `FollowUpResult`, `BirthdayReminderLog`).
- **Core Algorithms**:
  - Geofencing: Haversine distance, 150m base radius, 35m hysteresis, 20m indoor roof cushion (`lib/geo.ts`).
  - Scheduling: Africa/Lagos (WAT UTC+1) resolver, Sunday Thanksgiving, 3rd Saturday Hour of Mercy, Friday Youth Prayer, 20-min grace buffer (`lib/service-resolver.ts`).
  - Direct Dispatch: Multi-provider messaging adapter (Termii, Twilio, WhatsApp Cloud API, wa.me fallback) in `lib/direct-dispatch.ts`.
  - Template Engine: Deterministic 0-token interpolation engine with youth-friendly banks (`lib/template-engine.ts`) + opt-in LLM polish (`lib/ai-assistant.ts`).
  - Telegram Bot: Markdown messaging and photo dispatch for media team alerts (`lib/telegram.ts`).
  - Cron Endpoints: Authorized Route Handlers (`/api/cron/follow-up`, `/api/cron/birthdays`) validating `CRON_SECRET`.

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | Geofence Preservation | Strict 150m check around 6.5244, 3.3792 in Africa/Lagos | M2, M5 | Survey |
| 2 | Service Resolver | WAT Africa/Lagos UTC+1 service scheduling & grace buffers | M2, M5 | Survey |
| 3 | 4-Digit Lookup | Phone last-4 index lookup with collision disambiguation | M2, M5 | Survey |
| 4 | 1-Tap Profile | Stored profile for 1-tap rapid check-in | M2, M5 | Survey |
| 5 | Anti-Proxy Lock | Device lock dynamically released on next service start | M2, M5 | Survey |
| 6 | QR Code Scanning | Camera-based QR scanning UI with 4-digit fallback | M2, M5 | Survey |
| 7 | RCCG Logo | Prominent official RCCG logo display | M2, M5 | Survey |
| 8 | UI Standards | shadcn, Framer Motion, momentum deceleration, scale 0.95, zero AI tells | M2, M5 | Survey |
| 9 | Template Engine | 0-token deterministic message interpolation with youth banks | M1, M3 | Follow-up |
| 10 | Direct Dispatch | Multi-provider SMS/WhatsApp gateway (Termii/Twilio/WhatsApp API/wa.me) | M1, M3, M4 | Follow-up |
| 11 | Absence Radar | Detect 1-week miss, 2-week miss, and 72h first-timer window | M3, M5 | Survey |
| 12 | FollowUpTask & Escalation | Task integration and 48-hour auto-escalation to Youth Pastor | M3, M5 | Survey |
| 13 | Follow-Up Cron | Authorized `/api/cron/follow-up` endpoint with Bearer auth | M3, M5 | Survey |
| 14 | Media Telegram Bot | T-1 day formatted Markdown notifications + photoUrl for flyer prep | M4, M5 | Survey |
| 15 | Day-Of Birthday Alert | Day-of morning celebration alert + direct member DM dispatch | M4, M5 | Survey |
| 16 | Birthday Log Idempotency | `BirthdayReminderLog` idempotency via unique constraints | M4, M5 | Survey |
| 17 | Birthday Cron | Authorized `/api/cron/birthdays` endpoint with Bearer auth | M4, M5 | Survey |
| 18 | Automated Test Suite | Vitest unit, API, and component tests for all features | M1, M5 | Survey |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | Test Infra & Core Messaging Engines | Setup Vitest, build `lib/template-engine.ts` and `lib/direct-dispatch.ts` | none | DONE |
| M2 | Youth-First Attendance & UI Compliance | Purge AI tells, add Framer Motion & shadcn, build QR & attendance UI | M1 | DONE |
| M3 | Zero-Forgotten-Member Follow-Up Engine | Absence radar, FollowUpTask, 48h escalation, `/api/cron/follow-up` | M1 | IN_PROGRESS |
| M4 | Media Telegram Birthday Bot & Pipeline | Telegram bot, T-1 flyer alerts, Day-of alerts, `/api/cron/birthdays` | M1, M3 | PLANNED |
| M5 | E2E Verification & Adversarial Hardening | Comprehensive automated test execution and coverage verification | M1, M2, M3, M4 | PLANNED |

## Code Layout
- `lib/geo.ts`: Geofencing calculations (DO NOT MODIFY coordinates or base radius)
- `lib/service-resolver.ts`: Nigerian WAT time and service scheduling
- `lib/template-engine.ts`: Deterministic 0-token template interpolation engine
- `lib/direct-dispatch.ts`: SMS/WhatsApp multi-provider gateway adapter
- `lib/telegram.ts`: Media team Telegram bot wrapper
- `app/page.tsx`: Youth-First Attendance portal
- `app/components/`: Clean UI components adhering strictly to User Rules
- `app/followup/`: Youth Follow-Up dashboard and actions
- `app/birthdays/`: Birthday automation dashboard and actions
- `app/api/cron/follow-up/route.ts`: Authorized follow-up cron endpoint
- `app/api/cron/birthdays/route.ts`: Authorized birthday cron endpoint
- `tests/`: Automated unit and API test suites
