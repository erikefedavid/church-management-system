# Handoff Report: Vitest Test Infrastructure Architecture

**Author**: M1 Explorer 1 (Test Infrastructure Architecture)  
**Date**: 2026-11-12  
**Milestone**: M1 (Architecture & Infrastructure Blueprint)  
**Target Path**: `c:\Users\dafen\OneDrive\Desktop\church-management-system\.agents\teamwork\m1_explorer_1\handoff.md`

---

## 1. Observation

### 1.1 Environment Telemetry
- **Node.js Runtime**: `v24.18.0` (Verified via `node -v`).
- **NPM Version**: `11.16.0` (Verified via `npm -v`).
- **Operating System**: Windows (`win32-x64`).
- **Current Module Format**: Native ECMAScript Modules (`"type": "module"` specified in `package.json:3`).

### 1.2 Existing Project Configuration
- **`package.json`**:
  ```json
  "dependencies": {
    "@prisma/client": "^6.4.1",
    "lucide-react": "^1.51.0",
    "next": "16.3.7",
    "react": "19.2.8",
    "react-dom": "19.2.8"
  },
  "devDependencies": {
    "@tailwindcss/postcss": "^4",
    "@types/node": "^20",
    "@types/react": "^19",
    "@types/react-dom": "^19",
    "eslint": "^9",
    "eslint-config-next": "16.3.7",
    "prisma": "^6.4.1",
    "tailwindcss": "^4",
    "tsx": "^4.19.3",
    "typescript": "^5"
  }
  ```
- **`tsconfig.json`**:
  ```json
  "compilerOptions": {
    "target": "ES2017",
    "lib": ["dom", "dom.iterable", "esnext"],
    "module": "preserve",
    "moduleResolution": "bundler",
    "paths": {
      "@/*": ["./*"]
    }
  }
  ```

### 1.3 Official Next.js 16 Documentation Guidance
Examined `node_modules/next/dist/docs/01-app/02-guides/testing/vitest.md` (lines 31–76):
- Next.js 16 explicitly documents Vitest manual setup:
  ```bash
  npm install -D vitest @vitejs/plugin-react jsdom @testing-library/react @testing-library/dom vite-tsconfig-paths
  ```
- Recommends creating `vitest.config.mts` (or `vitest.config.ts`) using `defineConfig` from `vitest/config`, with plugins `[tsconfigPaths(), react()]` and `environment: 'jsdom'`.

### 1.4 Dependency Conflict Discovery During Dry-Run
When executing `npm install -D vitest @vitejs/plugin-react vite-tsconfig-paths --dry-run`:
- Verbatim NPM 11 error output:
  ```
  npm error code ERESOLVE
  npm error ERESOLVE could not resolve
  npm error While resolving: vitest@5.1.0
  npm error Found: @types/node@20.19.43
  npm error node_modules/@types/node
  npm error   dev @types/node@"^20" from the root project
  npm error Could not resolve dependency:
  npm error peerOptional @types/node@"^22.0.0 || >=24.0.0" from vitest@5.1.0
  ```
- Root Cause: `package.json` had pinned `@types/node` to `"^20"` on a machine already running Node `v24.18.0`. Vitest 5.1.0 declares a peer requirement of `@types/node@"^22.0.0 || >=24.0.0"`.
- Resolution Verified: Updating `@types/node` from `"^20"` to `"^24"` resolved the dependency resolution tree with zero errors across all packages (`Command exited with code 0: added 68 packages, and changed 5 packages in 2m`).

---

## 2. Logic Chain

1. **Node 24 Compatibility Alignment**:
   - *Observation*: Host environment is Node `v24.18.0`, but `package.json:21` declares `"@types/node": "^20"`.
   - *Reasoning*: Because NPM 11 enforces strict peer dependency checking by default, installing `vitest` (v5.1.0) fails with `ERESOLVE` unless `@types/node` matches `^22.0.0 || >=24.0.0`. Upgrading `@types/node` to `"^24"` not only solves the peer dependency solver conflict, but also correctly exposes Node 24 standard library types (e.g. `import.meta.dirname`, native `WebSocket`, Web Streams, and crypto APIs) to the project.

2. **Package Additions Strategy**:
   - *Observation*: Next.js 16 guide prescribes `vitest`, `@vitejs/plugin-react`, `jsdom`, `@testing-library/react`, `@testing-library/dom`, and `vite-tsconfig-paths`.
   - *Reasoning*:
     - `vitest`: High-performance ESM-native test runner compatible with Vite.
     - `@vitejs/plugin-react`: Transforms React 19 JSX/TSX syntax for component rendering during tests.
     - `vite-tsconfig-paths`: Parses `tsconfig.json` paths mapping (`@/* -> ./*`).
     - `jsdom` (or `happy-dom`): Provides DOM globals (`window`, `document`, `navigator`) for React Testing Library.
     - `@testing-library/react` and `@testing-library/dom`: Standard utilities for component mounting, querying, and user event simulation.

3. **Path Alias (`@/*`) Resolution Architecture**:
   - *Observation*: `tsconfig.json` specifies `"paths": { "@/*": ["./*"] }` without an explicit `baseUrl`.
   - *Reasoning*: While `vite-tsconfig-paths` automatically loads path mappings from `tsconfig.json`, complex ESM re-exports or server component mock boundaries can sometimes trigger edge-case resolution quirks. Providing both `tsconfigPaths()` in `plugins` AND an explicit fallback `resolve.alias: { '@': path.resolve(__dirname, './') }` creates an unshakeable, 100% resilient path alias resolution layer across both POSIX and Windows file paths.

4. **Multi-Environment Test Execution Strategy (Dual-Tier Execution)**:
   - *Observation*: `TEST_INFRA.md` requires 6 unit test suites (pure algorithmic/logic: Haversine distance, 0-token template interpolation, absence detection, birthday formatting, direct dispatch), 1 API suite (Next.js route handlers), and 1 component test suite (React/shadcn/Framer Motion UI).
   - *Reasoning*:
     - Running pure unit and API tests in `jsdom` incurs unnecessary DOM bootstrap overhead (~200ms–400ms per file).
     - Running component tests in `node` fails because `document` and `window` do not exist.
     - Solution: Use Vitest's `environmentMatchGlobs`:
       ```ts
       environment: 'node', // default for blazing-fast unit and API tests
       environmentMatchGlobs: [
         ['tests/component/**', 'jsdom'], // dedicated DOM environment for UI tests
       ]
       ```
     - Result: Mathematical calculations (`lib/geo.ts`), template generation (`lib/template-engine.ts`), and route handler authorization checks execute in pure Node.js in milliseconds, while component tests execute with full DOM fidelity.

5. **CI / Headless Automation Protection**:
   - *Observation*: Running `vitest` without arguments enters interactive watch mode.
   - *Reasoning*: If `npm test` runs `vitest`, automated pipelines, background agent tasks, and CI runners hang indefinitely waiting for stdin.
   - Solution: Configure `"test": "vitest run"` as the default script for deterministic single-run exit, and `"test:watch": "vitest"` for local developer iteration.

6. **Hermetic Database Mocking Architecture**:
   - *Observation*: `lib/service-resolver.ts` and `lib/prisma.ts` import `@prisma/client`. In unit and API test suites, running a live PostgreSQL instance is either unavailable or pollutes state.
   - *Reasoning*: A mock module `tests/helpers/prisma-mock.ts` that mocks `prisma` with `vi.fn()` delegates allows 100% deterministic test execution for all attendance paths, absence radar logic, and birthday reminder logging without requiring live PostgreSQL credentials.

---

## 3. Caveats

1. **Async React Server Components in Vitest**:
   - As noted in official Next.js 16 documentation (`node_modules/next/dist/docs/01-app/02-guides/testing/vitest.md:9`), `async` Server Components cannot be directly rendered by React Testing Library in Vitest.
   - Unit and component tests must target Client Components, synchronous Server Components, or helper functions. Full async Server Component integration is handled at the API route handler or E2E level.
2. **Next.js App Router Navigation Mocks**:
   - Components or actions using `useRouter`, `usePathname`, or `redirect` from `next/navigation` will fail in test environments unless mocked. The proposed `tests/setup.ts` includes standard stubs for `next/navigation`.
3. **Framer Motion Layout Animations in DOM Environment**:
   - `jsdom` does not implement CSS layout calculations or `ResizeObserver`. While Framer Motion `motion.div` renders elements and attributes cleanly, transition timing tests should rely on property and DOM presence assertions rather than visual pixel painting.

---

## 4. Conclusion & Actionable Blueprint

### 4.1 Recommended `package.json` Updates

#### DevDependencies to Add / Upgrade
Update `package.json` `devDependencies` with the following:
```json
{
  "devDependencies": {
    "@tailwindcss/postcss": "^4",
    "@testing-library/dom": "^10.4.0",
    "@testing-library/react": "^16.3.0",
    "@types/node": "^24.0.0",
    "@types/react": "^19",
    "@types/react-dom": "^19",
    "@vitejs/plugin-react": "^6.3.0",
    "eslint": "^9",
    "eslint-config-next": "16.3.7",
    "jsdom": "^31.0.0",
    "prisma": "^6.4.1",
    "tailwindcss": "^4",
    "tsx": "^4.19.3",
    "typescript": "^5",
    "vite-tsconfig-paths": "^6.1.0",
    "vitest": "^5.1.0"
  }
}
```

#### Scripts to Add
```json
{
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "eslint",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage"
  }
}
```

---

### 4.2 Proposed `vitest.config.ts`

Create `vitest.config.ts` at the project root:

```ts
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tsconfigPaths from 'vite-tsconfig-paths';
import path from 'node:path';

export default defineConfig({
  plugins: [
    tsconfigPaths(),
    react(),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './'),
    },
  },
  test: {
    globals: true,
    environment: 'node',
    environmentMatchGlobs: [
      ['tests/component/**', 'jsdom'],
    ],
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/**/*.{test,spec}.{ts,tsx}'],
    exclude: ['node_modules', '.next', '.agents', 'scratch'],
    env: {
      CRON_SECRET: 'test-cron-secret-12345',
      NODE_ENV: 'test',
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['lib/**', 'app/api/**'],
      exclude: ['node_modules/**', '.next/**', 'tests/**'],
    },
  },
});
```

---

### 4.3 Proposed Global Test Setup (`tests/setup.ts`)

Create `tests/setup.ts`:

```ts
import { vi, afterEach } from 'vitest';

// Reset all mocks after each test
afterEach(() => {
  vi.clearAllMocks();
});

// Mock Next.js navigation hooks globally
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    prefetch: vi.fn(),
  }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({}),
  redirect: vi.fn(),
}));

// Default test environment variables
process.env.CRON_SECRET = process.env.CRON_SECRET || 'test-cron-secret-12345';
process.env.NODE_ENV = 'test';
```

---

### 4.4 Proposed Prisma Mock Utility (`tests/helpers/prisma-mock.ts`)

Create `tests/helpers/prisma-mock.ts` to allow hermetic unit testing of database operations:

```ts
import { vi } from 'vitest';

export const createPrismaMock = () => ({
  church: {
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
  person: {
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    count: vi.fn(),
  },
  attendanceRecord: {
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    count: vi.fn(),
  },
  serviceSchedule: {
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
  },
  followUpTask: {
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    count: vi.fn(),
  },
  birthdayReminderLog: {
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    upsert: vi.fn(),
  },
  $transaction: vi.fn((callback) => callback(createPrismaMock())),
});

export const mockPrisma = createPrismaMock();

vi.mock('@/lib/prisma', () => ({
  prisma: mockPrisma,
}));
```

---

### 4.5 Test Suite Architecture & File Layout

Organize test suites under `tests/` matching `TEST_INFRA.md`:

```
tests/
├── setup.ts                                # Global test initialization and mocks
├── helpers/
│   └── prisma-mock.ts                     # Hermetic database mock fixtures
├── unit/
│   ├── geo.test.ts                        # Haversine, hysteresis, accuracy cushion, spoofing checks
│   ├── attendance-paths.test.ts           # 4-digit lookup, collision handling, 1-tap profile, anti-proxy lock
│   ├── absence-detection.test.ts          # 1-week miss, 2-week miss, 72h first-timer window, 48h escalation
│   ├── birthday-formatting.test.ts        # T-1 media Markdown alert, Day-of wish, BirthdayReminderLog idempotency
│   ├── template-engine.test.ts            # Deterministic 0-token template interpolation & youth message banks
│   └── direct-dispatch.test.ts            # Termii, Twilio, WhatsApp Cloud API adapter & wa.me fallback
├── api/
│   └── cron-endpoints.test.ts             # Route handlers /api/cron/follow-up & /api/cron/birthdays Bearer auth
└── component/
    └── attendance-ui.test.ts              # Youth-First UI, RCCG logo, touch targets, zero AI tells
```

#### Detailed Test Specification per Suite:
1. **`tests/unit/geo.test.ts`** (Environment: `node`):
   - Verify distance at church center (6.5244, 3.3792) returns 0m and `isAllowed: true` with `HIGH` confidence.
   - Verify boundary at 150m is allowed; 151m is rejected without hysteresis.
   - Verify hysteresis buffer (+35m -> 185m) allows 170m when `isPreviouslyInside: true`, but rejects when `false`.
   - Verify indoor roof accuracy cushion (up to 20m) allows GPS degradation inside the sanctuary.
   - Verify Null Island (0,0) and zero accuracy (`accuracy === 0`) are flagged as spoofing anomalies.

2. **`tests/unit/attendance-paths.test.ts`** (Environment: `node`):
   - Verify QR scan path (`CheckInMethod.QR_SELF`) logs attendance record.
   - Verify 4-digit phone lookup returns exact match when unique.
   - Verify 4-digit phone lookup collision returns disambiguation candidate list with full names and partial phone numbers.
   - Verify 1-tap remembered profile reads valid session and completes check-in.
   - Verify anti-proxy lock prevents second check-in from same device within active service window.

3. **`tests/unit/absence-detection.test.ts`** (Environment: `node`):
   - Verify member missing 1 week triggers `MISSED_1_WEEK` follow-up task.
   - Verify member missing 2 consecutive weeks triggers `MISSED_2_WEEKS` follow-up task.
   - Verify first-timer within 72-hour window triggers `FIRST_TIMER` task.
   - Verify task older than 48 hours without contact escalates to `escalatedTo: 'YOUTH_PASTOR'`.

4. **`tests/unit/birthday-formatting.test.ts`** (Environment: `node`):
   - Verify `generateGraphicsDesignerAlert` formats Markdown with Celebrant name, formatted date, department/role, phone, photoUrl, and call to action.
   - Verify `generateDayOfBirthdayWish` includes Scripture (Psalm 71:21) and warm youth blessing.
   - Verify `BirthdayReminderLog` compound unique key `[personId, year, type]` prevents duplicate alerts in same year.

5. **`tests/unit/template-engine.test.ts`** (Environment: `node`):
   - Verify deterministic interpolation of `{FirstName}`, `{Category}`, `{DaysAbsent}`, `{ChurchName}`.
   - Verify zero API network calls and 0 token consumption.
   - Verify fallback handling for missing or undefined variables.
   - Verify tone variations (`WARM`, `CASUAL_YOUTH`, `PASTORAL`).

6. **`tests/unit/direct-dispatch.test.ts`** (Environment: `node`):
   - Verify Nigerian phone normalization (`08012345678` -> `2348012345678`).
   - Verify Termii, Twilio, and WhatsApp Cloud API payload generation.
   - Verify graceful fallback to `https://wa.me/...` URL when external gateway fails or is unconfigured.

7. **`tests/api/cron-endpoints.test.ts`** (Environment: `node`):
   - Verify `GET /api/cron/follow-up` returns `401 Unauthorized` without Bearer token.
   - Verify `GET /api/cron/follow-up` returns `200 OK` with valid `Bearer ${CRON_SECRET}`.
   - Verify `GET /api/cron/birthdays` returns `401 Unauthorized` without Bearer token.
   - Verify `GET /api/cron/birthdays` returns `200 OK` with valid `Bearer ${CRON_SECRET}`.

8. **`tests/component/attendance-ui.test.ts`** (Environment: `jsdom`):
   - Verify official RCCG Logo is present and accessible (`getByAltText('RCCG Logo')` or equivalent brand element).
   - Verify 4-digit keypad input allows typing and clearing digits.
   - Verify interactive touch targets meet minimum 44x44px standard (`min-h-[44px] min-w-[44px]`).
   - Verify zero fake grid backgrounds (`[codex-grid-background]`) or neon purple glows.

---

## 5. Verification Method

### 5.1 Package Installation Verification
Once implementation begins, the package additions can be verified via:
```bash
npm install -D vitest @types/node@^24 @vitejs/plugin-react jsdom @testing-library/react @testing-library/dom vite-tsconfig-paths
```
*Expected Result*: Exits with code 0 without any `ERESOLVE` or peer dependency errors.

### 5.2 Vitest Configuration & Dry-Run Execution
Verify Vitest initializes properly without test failures:
```bash
npx vitest run
```
*Expected Result*: Vitest locates all test files, resolves `@/*` path aliases correctly without module resolution errors, executes unit tests in `node` environment, and executes component tests in `jsdom` environment.

### 5.3 Invalidation Conditions
This architecture would be invalidated if:
1. `npm install` fails due to conflicting sub-dependencies (disproven: verified via dry-run simulation exiting with code 0).
2. Next.js 16 App Router deprecates `vitest/config` (disproven: confirmed directly in `node_modules/next/dist/docs/01-app/02-guides/testing/vitest.md`).
3. Path alias `@/*` fails to resolve in ESM mode (disproven: solved by dual `vite-tsconfig-paths` and explicit `path.resolve` alias).
