/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Empirical Adversarial Stress Testing Suite:
 * Birthday Cron Route Security & Fuzzing, Database Idempotency & High Concurrency, and Direct Member DM Fallbacks
 *
 * RCCG Jesus Covenant Zone CMS — Milestone 4 Challenger 2
 *
 * Target modules under test:
 * - app/api/cron/birthdays/route.ts (GET, POST route handlers)
 * - lib/birthday-engine.ts (runBirthdayPipeline, getUpcomingBirthdays, calculateDaysUntilBirthday, isLeapYear, BIRTHDAY_REMINDER_TYPES)
 * - lib/direct-dispatch.ts (dispatchDirectMessage, generateWaMeLink, normalizePhoneNumber)
 * - lib/telegram.ts (sendMediaBirthdayAlert, escapeMarkdown)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mockPrisma } from '../helpers/prisma-mock';

vi.mock('@/lib/prisma', () => ({
  prisma: mockPrisma,
}));

import { NextRequest } from 'next/server';
import { GET, POST } from '@/app/api/cron/birthdays/route';
import {
  runBirthdayPipeline,
  getUpcomingBirthdays,
} from '@/lib/birthday-engine';
import {
  dispatchDirectMessage,
  generateWaMeLink,
  normalizePhoneNumber,
} from '@/lib/direct-dispatch';

describe('Adversarial Birthday Cron Security, Concurrency & Fallback Stress Harness (Milestone 4)', () => {
  const originalEnv = process.env;
  const TEST_CRON_SECRET = 'covenant_birthday_ultra_secure_secret_8877!';

  // Standard fixed dates for deterministic testing
  // 14th November 2026, 08:00 WAT (non-leap year)
  const fixedNow = new Date('2026-11-14T07:00:00Z'); // 08:00 WAT

  const mockChurch = {
    id: 'church-covenant-zone',
    name: 'RCCG Jesus Covenant Zone',
    latitude: 6.5244,
    longitude: 3.3792,
    geofenceRadius: 150,
  };

  // 3 Celebrants Today (Nov 14)
  const celebrantToday1 = {
    id: 'person-today-1',
    churchId: mockChurch.id,
    firstName: 'Chioma',
    lastName: 'Adeyemi',
    phone: '08031112233',
    phoneLast4: '2233',
    category: 'YOUTH',
    subCategory: 'Choir',
    status: 'MEMBER',
    photoUrl: 'https://cdn.example.org/photos/chioma.jpg',
    birthDay: 14,
    birthMonth: 11,
    dateOfBirth: new Date('1999-11-14T00:00:00Z'),
    isActive: true,
  };

  const celebrantToday2 = {
    id: 'person-today-2',
    churchId: mockChurch.id,
    firstName: 'Babatunde',
    lastName: 'Fashola',
    phone: '+234 809 444 5566',
    phoneLast4: '5566',
    category: 'YOUTH',
    subCategory: 'Media',
    status: 'MEMBER',
    photoUrl: null,
    birthDay: 14,
    birthMonth: 11,
    dateOfBirth: null,
    isActive: true,
  };

  const celebrantToday3 = {
    id: 'person-today-3',
    churchId: mockChurch.id,
    firstName: 'Ngozi',
    lastName: 'Eze',
    phone: '08123456789',
    phoneLast4: '6789',
    category: 'YOUTH',
    subCategory: 'Ushering',
    status: 'MEMBER',
    photoUrl: 'https://cdn.example.org/photos/ngozi.png',
    birthDay: 14,
    birthMonth: 11,
    dateOfBirth: null,
    isActive: true,
  };

  // 2 Celebrants Tomorrow (Nov 15)
  const celebrantTomorrow1 = {
    id: 'person-tmrw-1',
    churchId: mockChurch.id,
    firstName: 'Emeka',
    lastName: 'Okafor',
    phone: '07055556677',
    phoneLast4: '6677',
    category: 'YOUTH',
    subCategory: 'Drama',
    status: 'MEMBER',
    photoUrl: 'https://cdn.example.org/photos/emeka.jpg',
    birthDay: 15,
    birthMonth: 11,
    dateOfBirth: null,
    isActive: true,
  };

  const celebrantTomorrow2 = {
    id: 'person-tmrw-2',
    churchId: mockChurch.id,
    firstName: 'Grace',
    lastName: 'Danladi',
    phone: '08023334455',
    phoneLast4: '4455',
    category: 'YOUTH',
    subCategory: 'Sanctuary',
    status: 'MEMBER',
    photoUrl: null,
    birthDay: 15,
    birthMonth: 11,
    dateOfBirth: null,
    isActive: true,
  };

  const allMockPersons = [
    celebrantToday1,
    celebrantToday2,
    celebrantToday3,
    celebrantTomorrow1,
    celebrantTomorrow2,
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = {
      ...originalEnv,
      CRON_SECRET: TEST_CRON_SECRET,
      NODE_ENV: 'test',
    };
    mockPrisma.church.findFirst.mockResolvedValue(mockChurch as any);
    mockPrisma.person.findMany.mockResolvedValue(allMockPersons as any);

    // Mock global fetch to return successful Telegram and webhook API responses
    const mockFetch = vi.fn().mockImplementation(async () => {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          ok: true,
          result: {
            message_id: Math.floor(Math.random() * 100000) + 1,
            chat: { id: -1001234567890 },
          },
        }),
      };
    });
    vi.stubGlobal('fetch', mockFetch);
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.unstubAllGlobals();
  });

  // =========================================================================
  // SECTION 1: Birthday Cron Route Security & Fuzzing (/api/cron/birthdays)
  // =========================================================================
  describe('1. Birthday Cron Route Security & Adversarial Request Fuzzing', () => {
    it('1.1: Rejects request with missing authorization header and secret (returns HTTP 401)', async () => {
      const req = new NextRequest('http://localhost:3000/api/cron/birthdays', {
        method: 'POST',
      });
      const res = await POST(req);
      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.success).toBe(false);
      expect(body.code).toBe('UNAUTHORIZED');
    });

    it('1.2: Rejects empty or whitespace-only authorization headers (returns HTTP 401)', async () => {
      const emptyReq = new NextRequest('http://localhost:3000/api/cron/birthdays', {
        method: 'GET',
        headers: { authorization: '' },
      });
      const resEmpty = await GET(emptyReq);
      expect(resEmpty.status).toBe(401);

      const wsReq = new NextRequest('http://localhost:3000/api/cron/birthdays', {
        method: 'GET',
        headers: { authorization: '   \t    ' },
      });
      const resWs = await GET(wsReq);
      expect(resWs.status).toBe(401);
    });

    it('1.3: Rejects Bearer scheme without a token (returns HTTP 401)', async () => {
      const noTokenReq = new NextRequest('http://localhost:3000/api/cron/birthdays', {
        method: 'POST',
        headers: { authorization: 'Bearer' },
      });
      const res = await POST(noTokenReq);
      expect(res.status).toBe(401);

      const spaceOnlyReq = new NextRequest('http://localhost:3000/api/cron/birthdays', {
        method: 'POST',
        headers: { authorization: 'Bearer   ' },
      });
      const resSpace = await POST(spaceOnlyReq);
      expect(resSpace.status).toBe(401);
    });

    it('1.4: Rejects non-Bearer authorization schemes (returns HTTP 401)', async () => {
      const schemes = [
        `Basic ${Buffer.from(`user:${TEST_CRON_SECRET}`).toString('base64')}`,
        `Token ${TEST_CRON_SECRET}`,
        `Digest username="media", secret="${TEST_CRON_SECRET}"`,
        `ApiKey ${TEST_CRON_SECRET}`,
        `BearerFakeScheme ${TEST_CRON_SECRET}`,
        `Bearer-Token ${TEST_CRON_SECRET}`,
      ];

      for (const authHeader of schemes) {
        const req = new NextRequest('http://localhost:3000/api/cron/birthdays', {
          method: 'POST',
          headers: { authorization: authHeader },
        });
        const res = await POST(req);
        expect(res.status).toBe(401);
        const json = await res.json();
        expect(json.code).toBe('UNAUTHORIZED');
      }
    });

    it('1.5: Rejects Bearer token with trailing garbage or extra payloads (returns HTTP 401)', async () => {
      const adversarialHeaders = [
        `Bearer ${TEST_CRON_SECRET} extra_payload`,
        `Bearer ${TEST_CRON_SECRET}   trailing_garbage`,
        `Bearer ${TEST_CRON_SECRET}\textra_tab_payload`,
        `Bearer ${TEST_CRON_SECRET} ${TEST_CRON_SECRET}`,
        `Bearer ${TEST_CRON_SECRET} " OR "1"="1`,
        `Bearer ${TEST_CRON_SECRET}; DROP TABLE BirthdayReminderLog;`,
      ];

      for (const authHeader of adversarialHeaders) {
        const req = new NextRequest('http://localhost:3000/api/cron/birthdays', {
          method: 'POST',
          headers: { authorization: authHeader },
        });
        const res = await POST(req);
        expect(res.status).toBe(401);
      }
    });

    it('1.6: Rejects wrong, tampered, or mismatched Bearer token (returns HTTP 401)', async () => {
      const tamperedTokens = [
        'wrong_secret',
        `${TEST_CRON_SECRET}_tampered`,
        `prefix_${TEST_CRON_SECRET}`,
        TEST_CRON_SECRET.slice(0, -1), // Off-by-one truncation
        `${TEST_CRON_SECRET}X`,
      ];

      for (const token of tamperedTokens) {
        const req = new NextRequest('http://localhost:3000/api/cron/birthdays', {
          method: 'POST',
          headers: { authorization: `Bearer ${token}` },
        });
        const res = await POST(req);
        expect(res.status).toBe(401);
      }
    });

    it('1.7: Accepts valid Bearer token with multiple internal spaces or surrounding whitespace', async () => {
      mockPrisma.birthdayReminderLog.findUnique.mockResolvedValue(null);
      mockPrisma.birthdayReminderLog.create.mockResolvedValue({ id: 'log-1' });

      // Valid variations allowed by \s+ split and .trim()
      const validHeaders = [
        `Bearer ${TEST_CRON_SECRET}`,
        `Bearer    ${TEST_CRON_SECRET}`,
        `  Bearer ${TEST_CRON_SECRET}  `,
        `\tBearer\t${TEST_CRON_SECRET}\t`,
      ];

      for (const authHeader of validHeaders) {
        const req = new NextRequest('http://localhost:3000/api/cron/birthdays?dryRun=true', {
          method: 'POST',
          headers: { authorization: authHeader },
        });
        const res = await POST(req);
        expect(res.status).toBe(200);
        const json = await res.json();
        expect(json.success).toBe(true);
      }
    });

    it('1.8: Case sensitivity on query parameter key (?secret= vs ?Secret=, ?SECRET=)', async () => {
      const casingVariations = [
        `http://localhost:3000/api/cron/birthdays?Secret=${TEST_CRON_SECRET}`,
        `http://localhost:3000/api/cron/birthdays?SECRET=${TEST_CRON_SECRET}`,
        `http://localhost:3000/api/cron/birthdays?sEcReT=${TEST_CRON_SECRET}`,
        `http://localhost:3000/api/cron/birthdays?token=${TEST_CRON_SECRET}`,
        `http://localhost:3000/api/cron/birthdays?cron_secret=${TEST_CRON_SECRET}`,
      ];

      for (const url of casingVariations) {
        const req = new NextRequest(url, { method: 'GET' });
        const res = await GET(req);
        expect(res.status).toBe(401);
      }
    });

    it('1.9: Case sensitivity on secret value itself (?secret=lowercase vs UPPERCASE)', async () => {
      const LOWER_SECRET = 'covenant_lowercase_secret_123';
      process.env = { ...originalEnv, CRON_SECRET: LOWER_SECRET, NODE_ENV: 'test' };

      // Exact match should pass
      const exactReq = new NextRequest(
        `http://localhost:3000/api/cron/birthdays?secret=${LOWER_SECRET}&dryRun=true`,
        { method: 'GET' }
      );
      const exactRes = await GET(exactReq);
      expect(exactRes.status).toBe(200);

      // Cased mismatch must return 401
      const upperReq = new NextRequest(
        `http://localhost:3000/api/cron/birthdays?secret=${LOWER_SECRET.toUpperCase()}`,
        { method: 'GET' }
      );
      const upperRes = await GET(upperReq);
      expect(upperRes.status).toBe(401);
    });

    it('1.10: Fuzzing attack vectors against query secret parameter (SQLi, path traversal, null bytes)', async () => {
      const fuzzedUrls = [
        `http://localhost:3000/api/cron/birthdays?secret=' OR '1'='1`,
        `http://localhost:3000/api/cron/birthdays?secret=../../etc/passwd`,
        `http://localhost:3000/api/cron/birthdays?secret=${encodeURIComponent(TEST_CRON_SECRET)}%00`,
        `http://localhost:3000/api/cron/birthdays?secret[]=${TEST_CRON_SECRET}`,
        `http://localhost:3000/api/cron/birthdays?secret=${TEST_CRON_SECRET};DROP TABLE BirthdayReminderLog;`,
      ];

      for (const url of fuzzedUrls) {
        const req = new NextRequest(url, { method: 'GET' });
        const res = await GET(req);
        expect(res.status).toBe(401);
      }
    });

    it('1.11: Production environment protection — rejects fallback secret when CRON_SECRET is unset in production', async () => {
      // In production mode with CRON_SECRET unset:
      process.env = { ...originalEnv, NODE_ENV: 'production', CRON_SECRET: '' };

      const prodReq = new NextRequest('http://localhost:3000/api/cron/birthdays', {
        method: 'POST',
        headers: { authorization: 'Bearer test-cron-secret' },
      });
      const prodRes = await POST(prodReq);
      expect(prodRes.status).toBe(401);

      // Even query fallback to test-cron-secret is blocked
      const queryReq = new NextRequest(
        'http://localhost:3000/api/cron/birthdays?secret=test-cron-secret',
        { method: 'GET' }
      );
      const queryRes = await GET(queryReq);
      expect(queryRes.status).toBe(401);

      // Valid secret configured in production works cleanly
      process.env.CRON_SECRET = 'ultra_prod_cron_key_9999';
      const validProdReq = new NextRequest('http://localhost:3000/api/cron/birthdays?dryRun=true', {
        method: 'POST',
        headers: { authorization: 'Bearer ultra_prod_cron_key_9999' },
      });
      const validProdRes = await POST(validProdReq);
      expect(validProdRes.status).toBe(200);
    });

    it('1.12: Database exception resilience — returns HTTP 500 without crashing process or throwing unhandled rejection', async () => {
      // Simulate fatal database connection loss
      mockPrisma.church.findFirst.mockRejectedValueOnce(
        new Error('P1001: Can not reach database server at postgresql://db:5432')
      );

      const postReq = new NextRequest('http://localhost:3000/api/cron/birthdays', {
        method: 'POST',
        headers: { authorization: `Bearer ${TEST_CRON_SECRET}` },
      });

      const postRes = await POST(postReq);
      expect(postRes.status).toBe(500);
      const postJson = await postRes.json();
      expect(postJson.success).toBe(false);
      expect(postJson.error).toContain('P1001');

      // Test GET handler exception handling as well
      mockPrisma.church.findFirst.mockRejectedValueOnce(
        new Error('PrismaClientInitializationError: Connection pool exhausted')
      );

      const getReq = new NextRequest(
        `http://localhost:3000/api/cron/birthdays?secret=${TEST_CRON_SECRET}`,
        { method: 'GET' }
      );

      const getRes = await GET(getReq);
      expect(getRes.status).toBe(500);
      const getJson = await getRes.json();
      expect(getJson.success).toBe(false);
      expect(getJson.error).toContain('Connection pool exhausted');

      // Test non-Error thrown primitive (e.g. string throw)
      mockPrisma.church.findFirst.mockImplementationOnce(() => {
        throw 'Fatal non-Error string panic';
      });

      const nonErrorReq = new NextRequest('http://localhost:3000/api/cron/birthdays', {
        method: 'POST',
        headers: { authorization: `Bearer ${TEST_CRON_SECRET}` },
      });

      const nonErrorRes = await POST(nonErrorReq);
      expect(nonErrorRes.status).toBe(500);
      const nonErrorJson = await nonErrorRes.json();
      expect(nonErrorJson.success).toBe(false);
      // Fallback message ensures raw internal objects are not leaked
      expect(nonErrorJson.error).toBe('Internal birthday cron failure');
    });
  });

  // =========================================================================
  // SECTION 2: Idempotency & High Concurrency Stress on BirthdayReminderLog
  // =========================================================================
  describe('2. Idempotency & High Concurrency Stress on BirthdayReminderLog', () => {
    it('2.1: Concurrency stress — 10 simultaneous runBirthdayPipeline calls never create duplicate log rows or throw uncaught exceptions', async () => {
      // Stateful in-memory database store faithfully enforcing @@unique([personId, year, type])
      const inMemoryLogStore = new Map<string, any>();
      let logIdCounter = 0;
      let p2002CollisionCount = 0;

      // Realistic stateful findUnique
      mockPrisma.birthdayReminderLog.findUnique.mockImplementation(async (args: any) => {
        const { personId, year, type } = args.where.personId_year_type;
        const compoundKey = `${personId}:${year}:${type}`;
        return inMemoryLogStore.get(compoundKey) || null;
      });

      // Realistic stateful create throwing P2002 upon unique constraint collision
      mockPrisma.birthdayReminderLog.create.mockImplementation(async (args: any) => {
        const { personId, year, type, status } = args.data;
        const compoundKey = `${personId}:${year}:${type}`;

        if (inMemoryLogStore.has(compoundKey)) {
          p2002CollisionCount++;
          const p2002Error: any = new Error(
            `Unique constraint failed on the fields: (\`personId\`,\`year\`,\`type\`)`
          );
          p2002Error.code = 'P2002';
          throw p2002Error;
        }

        logIdCounter++;
        const record = {
          id: `log-cuid-${logIdCounter}`,
          personId,
          year,
          type,
          status: status || 'SENT',
          sentAt: new Date(),
        };
        inMemoryLogStore.set(compoundKey, record);
        return record;
      });

      // Launch 10 simultaneous pipeline executions via Promise.all
      const CONCURRENCY_LEVEL = 10;
      const pipelinePromises = Array.from({ length: CONCURRENCY_LEVEL }, () =>
        runBirthdayPipeline({
          churchId: mockChurch.id,
          targetDate: fixedNow,
          dryRun: false,
        })
      );

      const results = await Promise.all(pipelinePromises);

      // Verify that all 10 completed cleanly
      expect(results).toHaveLength(CONCURRENCY_LEVEL);
      for (const res of results) {
        expect(res.success).toBe(true);
      }

      // Check celebrant counts in test fixture:
      // 3 celebrants today (Nov 14) -> each receives DAY_OF_CELEBRATION log
      // 2 celebrants tomorrow (Nov 15) -> each receives GRAPHICS_T_MINUS_1 log
      // Total distinct operations = 5 unique keys.
      const EXPECTED_UNIQUE_LOGS = 5;

      expect(inMemoryLogStore.size).toBe(EXPECTED_UNIQUE_LOGS);

      // Verify exact keys present in store
      expect(inMemoryLogStore.has('person-today-1:2026:DAY_OF_CELEBRATION')).toBe(true);
      expect(inMemoryLogStore.has('person-today-2:2026:DAY_OF_CELEBRATION')).toBe(true);
      expect(inMemoryLogStore.has('person-today-3:2026:DAY_OF_CELEBRATION')).toBe(true);
      expect(inMemoryLogStore.has('person-tmrw-1:2026:GRAPHICS_T_MINUS_1')).toBe(true);
      expect(inMemoryLogStore.has('person-tmrw-2:2026:GRAPHICS_T_MINUS_1')).toBe(true);

      // Verify that the total number of successful database log creations across all 10 pipelines
      // is exactly equal to EXPECTED_UNIQUE_LOGS (no duplicate rows inserted)
      const totalCreatedLogs = results.reduce((sum, r) => sum + r.logsCreated, 0);
      expect(totalCreatedLogs).toBe(EXPECTED_UNIQUE_LOGS);

      // Verify that all subsequent callers safely detected the existing logs via findUnique
      // and marked skippedAlreadyLogged without attempting duplicate dispatches
      const totalSkippedTMinus1 = results.reduce(
        (sum, r) => sum + r.tMinus1.skippedAlreadyLogged,
        0
      );
      const totalSkippedDayOf = results.reduce(
        (sum, r) => sum + r.dayOf.skippedAlreadyLogged,
        0
      );

      // Across 10 runs: 1 winning run creates, 9 subsequent runs skip
      expect(totalSkippedTMinus1).toBe(2 * (CONCURRENCY_LEVEL - 1));
      expect(totalSkippedDayOf).toBe(3 * (CONCURRENCY_LEVEL - 1));
    });

    it('2.1b: Race-condition P2002 collision handling — when create encounters P2002, error is caught gracefully without failing pipeline', async () => {
      mockPrisma.birthdayReminderLog.findUnique.mockResolvedValue(null);
      mockPrisma.birthdayReminderLog.create.mockRejectedValueOnce({
        code: 'P2002',
        message: 'Unique constraint failed on the fields: (`personId`,`year`,`type`)',
      });

      mockPrisma.person.findMany.mockResolvedValueOnce([celebrantToday1 as any]);

      const result = await runBirthdayPipeline({
        churchId: mockChurch.id,
        targetDate: fixedNow,
        dryRun: true,
      });

      expect(result.success).toBe(true);
      expect(result.dayOf.mediaAlertsSent).toBe(1);
      expect(result.logsCreated).toBe(0); // Collision prevented duplicate increment
    });

    it('2.2: Re-run idempotency — sequential runs create logs once and mark skippedAlreadyLogged on second run', async () => {
      const inMemoryLogStore = new Map<string, any>();
      let logIdCounter = 0;

      mockPrisma.birthdayReminderLog.findUnique.mockImplementation(async (args: any) => {
        const { personId, year, type } = args.where.personId_year_type;
        return inMemoryLogStore.get(`${personId}:${year}:${type}`) || null;
      });

      mockPrisma.birthdayReminderLog.create.mockImplementation(async (args: any) => {
        const { personId, year, type, status } = args.data;
        const key = `${personId}:${year}:${type}`;
        if (inMemoryLogStore.has(key)) {
          const err: any = new Error('P2002 collision');
          err.code = 'P2002';
          throw err;
        }
        logIdCounter++;
        const record = { id: `log-${logIdCounter}`, personId, year, type, status };
        inMemoryLogStore.set(key, record);
        return record;
      });

      // --- First Sequential Execution ---
      const run1 = await runBirthdayPipeline({
        churchId: mockChurch.id,
        targetDate: fixedNow,
        dryRun: false,
      });

      expect(run1.success).toBe(true);
      expect(run1.logsCreated).toBe(5);
      expect(run1.tMinus1.celebrantsCount).toBe(2);
      expect(run1.tMinus1.mediaAlertsSent).toBe(2);
      expect(run1.tMinus1.skippedAlreadyLogged).toBe(0);
      expect(run1.dayOf.celebrantsCount).toBe(3);
      expect(run1.dayOf.mediaAlertsSent).toBe(3);
      expect(run1.dayOf.skippedAlreadyLogged).toBe(0);

      // Store now holds 5 logs
      expect(inMemoryLogStore.size).toBe(5);

      // --- Second Sequential Execution (Same Day) ---
      const run2 = await runBirthdayPipeline({
        churchId: mockChurch.id,
        targetDate: fixedNow,
        dryRun: false,
      });

      expect(run2.success).toBe(true);
      expect(run2.logsCreated).toBe(0); // 0 new logs created!
      expect(run2.tMinus1.celebrantsCount).toBe(2);
      expect(run2.tMinus1.mediaAlertsSent).toBe(0); // 0 new media alerts sent!
      expect(run2.tMinus1.skippedAlreadyLogged).toBe(2); // Both skipped!
      expect(run2.dayOf.celebrantsCount).toBe(3);
      expect(run2.dayOf.mediaAlertsSent).toBe(0); // 0 new celebration alerts!
      expect(run2.dayOf.skippedAlreadyLogged).toBe(3); // All 3 skipped!
      expect(run2.dayOf.memberDmsSent).toBe(0); // 0 duplicate member DMs!

      // Store size remains strictly 5
      expect(inMemoryLogStore.size).toBe(5);
    });

    it('2.3: Force override — options.force bypasses existing logs and forces re-dispatch', async () => {
      // Simulate existing log in DB for all celebrants
      mockPrisma.birthdayReminderLog.findUnique.mockResolvedValue({
        id: 'existing-log',
        status: 'SENT',
      });
      mockPrisma.birthdayReminderLog.create.mockResolvedValue({ id: 'new-log' });

      // Run with force: true
      const forceRun = await runBirthdayPipeline({
        churchId: mockChurch.id,
        targetDate: fixedNow,
        dryRun: true,
        force: true,
      });

      expect(forceRun.success).toBe(true);
      expect(forceRun.tMinus1.skippedAlreadyLogged).toBe(0);
      expect(forceRun.tMinus1.mediaAlertsSent).toBe(2);
      expect(forceRun.dayOf.skippedAlreadyLogged).toBe(0);
      expect(forceRun.dayOf.mediaAlertsSent).toBe(3);
    });

    it('2.4: Year boundary rollover — log for 2026 does not block celebration in 2027', async () => {
      const inMemoryLogStore = new Map<string, any>();
      // Seed store with 2026 logs
      inMemoryLogStore.set('person-today-1:2026:DAY_OF_CELEBRATION', { id: 'old-2026-log' });

      mockPrisma.birthdayReminderLog.findUnique.mockImplementation(async (args: any) => {
        const { personId, year, type } = args.where.personId_year_type;
        return inMemoryLogStore.get(`${personId}:${year}:${type}`) || null;
      });

      mockPrisma.birthdayReminderLog.create.mockImplementation(async (args: any) => {
        const { personId, year, type, status } = args.data;
        const key = `${personId}:${year}:${type}`;
        const record = { id: `log-${Date.now()}`, personId, year, type, status };
        inMemoryLogStore.set(key, record);
        return record;
      });

      // Target date in year 2027 (14th Nov 2027)
      const date2027 = new Date('2027-11-14T08:00:00Z');
      const result2027 = await runBirthdayPipeline({
        churchId: mockChurch.id,
        targetDate: date2027,
        dryRun: true,
      });

      expect(result2027.success).toBe(true);
      expect(result2027.year).toBe(2027);
      // In 2027, celebrants are celebrated anew without being blocked by 2026 log
      expect(result2027.dayOf.mediaAlertsSent).toBe(3);
      expect(inMemoryLogStore.has('person-today-1:2027:DAY_OF_CELEBRATION')).toBe(true);
    });

    it('2.5: Leap-year February 29 idempotency in non-leap year (2026) vs leap year (2028)', async () => {
      const leapDayBorn = {
        id: 'person-leap-1',
        churchId: mockChurch.id,
        firstName: 'Tariq',
        lastName: 'Bello',
        phone: '08091234567',
        phoneLast4: '4567',
        category: 'YOUTH',
        subCategory: 'Choir',
        status: 'MEMBER',
        photoUrl: null,
        birthDay: 29,
        birthMonth: 2,
        dateOfBirth: new Date('2000-02-29T00:00:00Z'),
        isActive: true,
      };

      mockPrisma.person.findMany.mockResolvedValue([leapDayBorn as any]);

      // Non-leap year 2026: Feb 28 is the celebration day
      const nonLeapFeb28 = new Date('2026-02-28T09:00:00Z');
      const upcomingNonLeap = await getUpcomingBirthdays({ targetDate: nonLeapFeb28 });
      expect(upcomingNonLeap.todayCelebrants).toHaveLength(1);
      expect(upcomingNonLeap.todayCelebrants[0]?.personId).toBe('person-leap-1');

      // Leap year 2028: Feb 28 is T-1, Feb 29 is Day-Of
      const leapFeb28 = new Date('2028-02-28T09:00:00Z');
      const upcomingLeapTMinus1 = await getUpcomingBirthdays({ targetDate: leapFeb28 });
      expect(upcomingLeapTMinus1.tomorrowCelebrants).toHaveLength(1);
      expect(upcomingLeapTMinus1.tomorrowCelebrants[0]?.personId).toBe('person-leap-1');

      const leapFeb29 = new Date('2028-02-29T09:00:00Z');
      const upcomingLeapDayOf = await getUpcomingBirthdays({ targetDate: leapFeb29 });
      expect(upcomingLeapDayOf.todayCelebrants).toHaveLength(1);
      expect(upcomingLeapDayOf.todayCelebrants[0]?.personId).toBe('person-leap-1');
    });
  });

  // =========================================================================
  // SECTION 3: Direct Member DM Fallback & Phone Normalization Resilience
  // =========================================================================
  describe('3. Direct Member DM Fallback & Phone Normalization Resilience', () => {
    it('3.1: Zero-credentials fallback execution — non-throwing fallback generating valid wa.me links', async () => {
      // Clear all messaging provider credentials from environment
      delete process.env.TERMII_API_KEY;
      delete process.env.TWILIO_ACCOUNT_SID;
      delete process.env.TWILIO_AUTH_TOKEN;
      delete process.env.WHATSAPP_CLOUD_API_TOKEN;
      delete process.env.WHATSAPP_PHONE_NUMBER_ID;

      mockPrisma.birthdayReminderLog.findUnique.mockResolvedValue(null);
      mockPrisma.birthdayReminderLog.create.mockResolvedValue({ id: 'log-direct-1' });

      // Run pipeline in live (non-dryRun) mode with empty credentials
      const result = await runBirthdayPipeline({
        churchId: mockChurch.id,
        targetDate: fixedNow,
        dryRun: false,
      });

      // Pipeline MUST NOT throw!
      expect(result.success).toBe(true);

      // Verify fallback wa.me was generated for day-of celebrants
      expect(result.dayOf.memberDmsFallbackWaMe).toBe(3);
      expect(result.dayOf.memberDmsSent).toBe(0);

      // Verify detailed direct DM results
      expect(result.details.directDms).toHaveLength(3);
      for (const dm of result.details.directDms) {
        expect(dm.status).toBe('FALLBACK_GENERATED');
        expect(dm.waMeUrl).toBeDefined();
        expect(dm.waMeUrl).toContain('https://wa.me/');
        expect(dm.waMeUrl).toContain('?text=');
      }
    });

    it('3.2: Universal wa.me link formatting and URL-encoded greeting validation', () => {
      const phoneDigits = '2348031112233';
      const greetingText =
        'Happy Birthday, Chioma! RCCG Jesus Covenant Zone celebrates you today!';

      const link = generateWaMeLink(phoneDigits, greetingText);

      // Must start with exact https://wa.me/<digits>?text=
      expect(link.startsWith('https://wa.me/2348031112233?text=')).toBe(true);

      // Must not contain unencoded spaces or raw characters
      expect(link).not.toContain(' ');
      expect(link).not.toContain('+');

      // Decoded text must exactly match original greeting
      const url = new URL(link);
      const textParam = url.searchParams.get('text');
      expect(textParam).toBe(greetingText);
    });

    it('3.3: Phone normalization fuzzing across diverse Nigerian & international formats', () => {
      const testCases = [
        {
          input: '08031234567',
          expectedDigits: '2348031234567',
          expectedE164: '+2348031234567',
          isNigerian: true,
        },
        {
          input: '+234 803 123 4567',
          expectedDigits: '2348031234567',
          expectedE164: '+2348031234567',
          isNigerian: true,
        },
        {
          input: '2348031234567',
          expectedDigits: '2348031234567',
          expectedE164: '+2348031234567',
          isNigerian: true,
        },
        {
          input: '(0803) 123-4567',
          expectedDigits: '2348031234567',
          expectedE164: '+2348031234567',
          isNigerian: true,
        },
        {
          input: '8031234567', // 10-digit without leading 0
          expectedDigits: '2348031234567',
          expectedE164: '+2348031234567',
          isNigerian: true,
        },
        {
          input: '+1 (415) 555-2671', // US International
          expectedDigits: '14155552671',
          expectedE164: '+14155552671',
          isNigerian: false,
        },
        {
          input: '+44 7911 123456', // UK International
          expectedDigits: '447911123456',
          expectedE164: '+447911123456',
          isNigerian: false,
        },
      ];

      for (const tc of testCases) {
        const norm = normalizePhoneNumber(tc.input);
        expect(norm.isValid).toBe(true);
        expect(norm.digitsOnly).toBe(tc.expectedDigits);
        expect(norm.e164).toBe(tc.expectedE164);
        expect(norm.isNigerian).toBe(tc.isNigerian);

        // Verify wa.me link generated from this normalized phone
        const waLink = generateWaMeLink(norm.digitsOnly, 'Happy Birthday!');
        expect(waLink).toBe(`https://wa.me/${tc.expectedDigits}?text=Happy%20Birthday!`);
      }
    });

    it('3.4: Hostile / Invalid phone inputs do NOT crash dispatch or pipeline', async () => {
      const hostileInputs = [
        'INVALID_ALPHA_PHONE',
        '123', // Too short
        '', // Empty
        '   ',
        '000-000-000',
      ];

      for (const invalidPhone of hostileInputs) {
        // dispatchDirectMessage MUST NOT throw
        const res = await dispatchDirectMessage({
          to: invalidPhone,
          body: 'Test birthday message',
          channel: 'AUTO',
        });

        expect(res.success).toBe(false);
        expect(res.status).toBe('FAILED');
        expect(res.error).toBeDefined();
        // waMeUrl is safely populated without blowing up
        expect(typeof res.waMeUrl).toBe('string');
      }
    });
  });
});
