# DISPATCH — M1 Worker: Test Infra & Core Messaging Engines

## Mission
Implement Milestone 1: Install and configure Vitest test infrastructure, implement the zero-token deterministic template interpolation engine (`lib/template-engine.ts`), implement the multi-provider direct dispatch gateway (`lib/direct-dispatch.ts`), refactor `lib/ai-assistant.ts` to use deterministic templates with opt-in LLM caching, author unit test suites (`tests/unit/template-engine.test.ts`, `tests/unit/direct-dispatch.test.ts`), and run `npm test` and `npm run build` to verify clean passing results.

## Mandatory Integrity Warning
> DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

## Context & Inputs
- ORIGINAL_REQUEST.md: c:\Users\dafen\OneDrive\Desktop\church-management-system\.agents\teamwork\ORIGINAL_REQUEST.md
- PROJECT.md: c:\Users\dafen\OneDrive\Desktop\church-management-system\.agents\teamwork\orchestrator\PROJECT.md
- TEST_INFRA.md: c:\Users\dafen\OneDrive\Desktop\church-management-system\.agents\teamwork\orchestrator\TEST_INFRA.md
- M1 Explorer 1 Report: c:\Users\dafen\OneDrive\Desktop\church-management-system\.agents\teamwork\m1_explorer_1\handoff.md
- M1 Explorer 2 Report: c:\Users\dafen\OneDrive\Desktop\church-management-system\.agents\teamwork\m1_explorer_2\handoff.md
- M1 Explorer 3 Report: c:\Users\dafen\OneDrive\Desktop\church-management-system\.agents\teamwork\m1_explorer_3\handoff.md

## Exclusive Write Ownership
You exclusively own and may edit or create:
- `package.json`
- `vitest.config.ts`
- `tests/setup.ts`
- `tests/helpers/prisma-mock.ts`
- `lib/template-engine.ts`
- `lib/direct-dispatch.ts`
- `lib/ai-assistant.ts`
- `tests/unit/template-engine.test.ts`
- `tests/unit/direct-dispatch.test.ts`

## Specific Instructions
1. **Dependencies & Test Scripts**:
   - Install devDependencies: `vitest @types/node@^24 @vitejs/plugin-react jsdom @testing-library/react @testing-library/dom vite-tsconfig-paths` using `npm install -D`.
   - Add `"test": "vitest run"` and `"test:watch": "vitest"` to `package.json`.
2. **Vitest Configuration**:
   - Create `vitest.config.ts` per M1 Explorer 1 handoff with dual-environment support (`node` default, `jsdom` for `tests/component/**`), `@/*` alias resolution, and test setup.
   - Create `tests/setup.ts` and `tests/helpers/prisma-mock.ts`.
3. **Template Engine (`lib/template-engine.ts`)**:
   - Implement deterministic 0-token interpolation supporting `{FirstName}`, `{LastName}`, `{Category}`, `{Department}`, `{DaysAbsent}`, `{YouthPastorName}`, `{BirthDate}`, `{CelebrantName}`.
   - Include high-variety youth-friendly message banks across all categories per M1 Explorer 2 handoff report.
   - Refactor `lib/ai-assistant.ts` to leverage the deterministic template engine by default with opt-in LLM polish and caching.
4. **Direct Dispatch Gateway (`lib/direct-dispatch.ts`)**:
   - Implement Nigerian phone normalization (`lib/direct-dispatch.ts:normalizeNigerianPhone`).
   - Implement provider abstraction supporting Termii, Twilio, WhatsApp Cloud API via environment variables.
   - Implement resilient non-throwing fallback to prefilled 1-click `https://wa.me/{phone}?text={encoded}` links per M1 Explorer 3 handoff report.
5. **Unit Tests**:
   - Write comprehensive tests in `tests/unit/template-engine.test.ts` and `tests/unit/direct-dispatch.test.ts`.
   - Run `npm test` and `npm run build` to verify that all tests pass cleanly and compilation succeeds.
6. **Reporting**:
   - Output your handoff report to `c:\Users\dafen\OneDrive\Desktop\church-management-system\.agents\teamwork\m1_worker_1\handoff.md`.
   - Include verification commands and full passing output in your handoff report.


## 2026-11-12T15:00:01Z
You are the M1 Worker (Core Messaging & Test Infra Builder).
Read your task dispatch instructions at:
c:\Users\dafen\OneDrive\Desktop\church-management-system\.agents\teamwork\m1_worker_1\DISPATCH.md
Read the original request at:
c:\Users\dafen\OneDrive\Desktop\church-management-system\.agents\teamwork\ORIGINAL_REQUEST.md
Read the project architecture and test infra blueprint at:
c:\Users\dafen\OneDrive\Desktop\church-management-system\.agents\teamwork\orchestrator\PROJECT.md
c:\Users\dafen\OneDrive\Desktop\church-management-system\.agents\teamwork\orchestrator\TEST_INFRA.md

Read the 3 M1 Explorer handoff reports for detailed architectural specs:
- Test Infra: c:\Users\dafen\OneDrive\Desktop\church-management-system\.agents\teamwork\m1_explorer_1\handoff.md
- Template Engine: c:\Users\dafen\OneDrive\Desktop\church-management-system\.agents\teamwork\m1_explorer_2\handoff.md
- Direct Dispatch: c:\Users\dafen\OneDrive\Desktop\church-management-system\.agents\teamwork\m1_explorer_3\handoff.md

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Exclusive Write Ownership:
- package.json
- vitest.config.ts
- tests/setup.ts
- tests/helpers/prisma-mock.ts
- lib/template-engine.ts
- lib/direct-dispatch.ts
- lib/ai-assistant.ts
- tests/unit/template-engine.test.ts
- tests/unit/direct-dispatch.test.ts

Execute all implementation steps, run `npm test` and `npm run build` to verify, document commands and results, and write your handoff report to:
c:\Users\dafen\OneDrive\Desktop\church-management-system\.agents\teamwork\m1_worker_1\handoff.md
Send a completion message to the orchestrator when finished.
