# E2E Test Infra: RCCG CMS Rebuild

## Test Philosophy
- Opaque-box, requirement-driven. No dependency on implementation internals.
- Methodology: Category-Partition + BVA + Pairwise + Workload Testing.

## Feature Inventory
| # | Feature | Source | Tier 1 | Tier 2 | Tier 3 |
|---|---------|--------|:------:|:------:|:------:|
| 1 | Geofencing (150m at 6.5244, 3.3792) | ORIGINAL_REQUEST §R1 | 5 | 5 | ✓ |
| 2 | Service Resolver & WAT UTC+1 | ORIGINAL_REQUEST §R1 | 5 | 5 | ✓ |
| 3 | 4-Digit Lookup & Collision Handling | ORIGINAL_REQUEST §R1 | 5 | 5 | ✓ |
| 4 | 1-Tap Remembered Profile & Anti-Proxy | ORIGINAL_REQUEST §R1 | 5 | 5 | ✓ |
| 5 | QR Code Scanning Check-in Path | ORIGINAL_REQUEST §R1 | 5 | 5 | ✓ |
| 6 | RCCG Logo Display & Branding | ORIGINAL_REQUEST §R1 | 5 | 5 | ✓ |
| 7 | Absence Detection Radar (1w, 2w, 72h) | ORIGINAL_REQUEST §R2 | 5 | 5 | ✓ |
| 8 | 48-Hour Youth Pastor Escalation | ORIGINAL_REQUEST §R2 | 5 | 5 | ✓ |
| 9 | Authorized /api/cron/follow-up | ORIGINAL_REQUEST §R2 | 5 | 5 | ✓ |
| 10 | Deterministic 0-Token Template Engine | ORIGINAL_REQUEST Follow-up | 5 | 5 | ✓ |
| 11 | Direct Messaging Gateway (Termii/Twilio/WA) | ORIGINAL_REQUEST Follow-up | 5 | 5 | ✓ |
| 12 | Telegram Media Flyer Alert (T-1) | ORIGINAL_REQUEST §R3 | 5 | 5 | ✓ |
| 13 | Day-Of Birthday Celebration & Direct DM | ORIGINAL_REQUEST §R3 | 5 | 5 | ✓ |
| 14 | BirthdayReminderLog Idempotency | ORIGINAL_REQUEST §R3 | 5 | 5 | ✓ |
| 15 | Authorized /api/cron/birthdays | ORIGINAL_REQUEST §R3 | 5 | 5 | ✓ |
| 16 | Frontend Motion & Accessibility Standards | ORIGINAL_REQUEST §R4 | 5 | 5 | ✓ |

## Test Architecture
- Test runner: Vitest (`npm run test`)
- Test files:
  - `tests/unit/geo.test.ts`
  - `tests/unit/attendance-paths.test.ts`
  - `tests/unit/absence-detection.test.ts`
  - `tests/unit/birthday-formatting.test.ts`
  - `tests/unit/template-engine.test.ts`
  - `tests/unit/direct-dispatch.test.ts`
  - `tests/api/cron-endpoints.test.ts`
  - `tests/component/attendance-ui.test.ts`

## Real-World Application Scenarios (Tier 4)
| # | Scenario | Features Exercised | Complexity |
|---|----------|--------------------|------------|
| 1 | Youth member arrives at church, inside 150m fence, uses 4-digit lookup with collision, completes check-in | F1, F2, F3, F4, F6, F16 | High |
| 2 | Member checks in via QR scan, attempts proxy check-in on same device, anti-proxy rejects | F1, F5, F6, F16 | High |
| 3 | Sunday attendance completes; next week /api/cron/follow-up runs, flags 1-week and 2-week absentees, creates FollowUpTask with 0-token draft | F7, F9, F10, F11 | High |
| 4 | FollowUpTask unaddressed for 49 hours; cron runs and escalates task to Youth Pastor | F8, F9 | Medium |
| 5 | Celebrant has birthday tomorrow; /api/cron/birthdays runs, dispatches Markdown alert with photoUrl to media team Telegram, logs to BirthdayReminderLog | F12, F14, F15 | High |
| 6 | Celebrant has birthday today; /api/cron/birthdays dispatches day-of alert and triggers direct member DM greeting | F11, F13, F14, F15 | High |
| 7 | User outside geofence (250m away) attempts check-in; rejected with exact distance telemetry | F1, F2, F16 | Medium |
| 8 | Cron endpoints called without Bearer secret; rejected with 401 Unauthorized | F9, F15 | Low |

## Coverage Thresholds
- Tier 1: ≥5 per feature
- Tier 2: ≥5 per feature (where boundaries exist)
- Tier 3: pairwise coverage of major feature interactions
- Tier 4: ≥8 realistic application scenarios
