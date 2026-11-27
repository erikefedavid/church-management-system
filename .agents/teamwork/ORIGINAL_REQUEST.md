# Original User Request

## Initial Request — 2026-11-12T14:27:03Z

Rebuild and enhance the RCCG Jesus Covenant Zone Church Management System with a Youth-First UI, geofenced attendance system, Zero-Forgotten-Member automated follow-up workflow, and Telegram-based birthday notification bot for the media team.

Working directory: c:\Users\dafen\OneDrive\Desktop\church-management-system
Integrity mode: development

## Requirements

### R1. Youth-First Attendance System
Implement the Youth-First Attendance UI using shadcn components and Framer Motion, supporting QR code scanning, 4-digit phone lookup, 1-tap remembered profile, anti-proxy lock, and strict geofencing enforcement (coordinates 6.5244, 3.3792, 150m radius, WAT Africa/Lagos UTC+1). The RCCG logo must remain prominently displayed.

### R2. Zero-Forgotten-Member Follow-Up System
Implement the automated absence detection radar (missed 1 week, missed 2 weeks, first-timer 72-hour window), contextual WhatsApp draft generation, and 48-hour escalation tracking to the Youth Pastor, integrated with the existing FollowUpTask schema.

### R3. Media Team Birthday Telegram Automation
Implement automated Telegram bot notifications dispatching formatted Markdown messages to the media team (celebrant name, role/department, photo URL, birth date) at T-1 day for graphic flyer preparation, along with day-of celebration alerts, logging dispatches in BirthdayReminderLog. Provide authorized API cron endpoints (e.g. `/api/cron/birthdays` and `/api/cron/follow-up`) to trigger these routines.

### R4. Frontend Design & Engineering Compliance
Ensure all frontend screens adhere to the specified UI standards: shadcn components, Framer Motion animations with momentum deceleration and scale entrance from 0.95, tactile click feedback, zero AI design tells, AAA contrast, and 44px minimum touch targets.

## Acceptance Criteria

### Attendance & Geofencing
- [ ] Attendance registration enforces strict 150m radius check around 6.5244, 3.3792 in Africa/Lagos timezone without modifying or breaking existing geo coordinates.
- [ ] QR scan, 4-digit lookup, and 1-tap profile check-in paths function end-to-end.
- [ ] RCCG logo is prominently displayed on the interface.

### Follow-Up Workflow
- [ ] Absence detection correctly identifies members missing 1 week, 2 weeks, and first-timers within 72 hours via an authorized `/api/cron/follow-up` endpoint.
- [ ] Contextual WhatsApp follow-up messages are generated and 48-hour pastor escalation logic is operational.

### Telegram Birthday Bot
- [ ] Telegram bot formats and dispatches Markdown notifications for upcoming birthdays (T-1 day) with celebrant details, role, and photoUrl for the media team via an authorized `/api/cron/birthdays` endpoint.
- [ ] Broadcast executions are recorded in the BirthdayReminderLog table.

### UI & Motion Standards
- [ ] Frontend uses shadcn components and Framer Motion animations complying with design criteria (momentum deceleration, scale from 0.95, zero fake grid backgrounds, zero arbitrary neon purple glows, tactile press feedback).

### Verification
- [ ] Programmatic automated test suites (unit, API, and component tests) are authored and pass, verifying geofencing validation, attendance check-in paths, absence detection, birthday notification formatting, and cron endpoint authorization.


## Follow-up — 2026-11-12T14:27:57Z

Additional requirement from the user:
1. Automated direct WhatsApp/SMS to member DMs:
   - Provide an automated direct dispatch module (compatible with SMS/WhatsApp gateway APIs such as Termii/Twilio/WhatsApp Cloud API via environment variables, with 1-click wa.me fallback).
   - This delivers follow-up check-ins and day-of birthday greetings directly into the member's DMs.
2. Token Optimization (Near-Zero Token Usage):
   - Implement a deterministic template interpolation engine (0 tokens) with high-variety youth-friendly message banks that dynamically inject {FirstName}, {Category}, {DaysAbsent}, etc.
   - LLM generation should be strictly opt-in / on-demand (e.g. when an admin clicks "Polish with AI") to keep AI token usage near-zero. Caching must prevent redundant token spending.


## Follow-up — 2026-11-12T20:32:00Z

The server restarted and the user is asking: "continue o, or is the team done?" Please report on the current status of Milestone 4 reviews and Milestone 5 (E2E Verification & Hardening), and continue execution.
