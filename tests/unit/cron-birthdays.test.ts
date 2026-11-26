import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mockPrisma } from '../helpers/prisma-mock';

vi.mock('@/lib/prisma', () => ({
  prisma: mockPrisma,
}));

import { NextRequest } from 'next/server';
import { GET, POST } from '@/app/api/cron/birthdays/route';

describe('Authorized Birthday Cron Route Handler (/api/cron/birthdays)', () => {
  const originalEnv = process.env;
  const TEST_SECRET = 'rccg_media_birthday_cron_secret_2026';

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv, CRON_SECRET: TEST_SECRET };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('1. Security & Authentication Gate', () => {
    it('returns HTTP 401 Unauthorized when no credentials or secret provided', async () => {
      const request = new NextRequest('http://localhost:3000/api/cron/birthdays', {
        method: 'POST',
      });

      const response = await POST(request);
      expect(response.status).toBe(401);

      const json = await response.json();
      expect(json.success).toBe(false);
      expect(json.code).toBe('UNAUTHORIZED');
    });

    it('returns HTTP 401 Unauthorized when invalid Bearer token is provided', async () => {
      const request = new NextRequest('http://localhost:3000/api/cron/birthdays', {
        method: 'POST',
        headers: {
          authorization: 'Bearer wrong_birthday_secret',
        },
      });

      const response = await POST(request);
      expect(response.status).toBe(401);

      const json = await response.json();
      expect(json.success).toBe(false);
      expect(json.code).toBe('UNAUTHORIZED');
    });

    it('returns HTTP 401 Unauthorized when Bearer token has trailing garbage', async () => {
      const request = new NextRequest('http://localhost:3000/api/cron/birthdays', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${TEST_SECRET} trailing_garbage`,
        },
      });

      const response = await POST(request);
      expect(response.status).toBe(401);

      const json = await response.json();
      expect(json.success).toBe(false);
      expect(json.code).toBe('UNAUTHORIZED');
    });

    it('returns HTTP 401 Unauthorized when query secret is incorrect', async () => {
      const request = new NextRequest(
        'http://localhost:3000/api/cron/birthdays?secret=invalid_secret',
        { method: 'GET' }
      );

      const response = await GET(request);
      expect(response.status).toBe(401);

      const json = await response.json();
      expect(json.success).toBe(false);
      expect(json.code).toBe('UNAUTHORIZED');
    });

    it('returns HTTP 401 in production when CRON_SECRET is not configured', async () => {
      process.env = { ...originalEnv, NODE_ENV: 'production', CRON_SECRET: '' };

      const request = new NextRequest('http://localhost:3000/api/cron/birthdays', {
        method: 'POST',
        headers: {
          authorization: 'Bearer test-cron-secret',
        },
      });

      const response = await POST(request);
      expect(response.status).toBe(401);

      const json = await response.json();
      expect(json.success).toBe(false);
    });
  });

  describe('2. Authorized Execution & Telemetry Output', () => {
    it('executes full birthday pipeline with valid Bearer token and returns HTTP 200 with structured JSON', async () => {
      mockPrisma.church.findFirst.mockResolvedValue({ id: 'church-1', name: 'RCCG Test Zone' });
      mockPrisma.person.findMany.mockResolvedValue([]);
      mockPrisma.birthdayReminderLog.findUnique.mockResolvedValue(null);

      const request = new NextRequest('http://localhost:3000/api/cron/birthdays', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${TEST_SECRET}`,
        },
      });

      const response = await POST(request);
      expect(response.status).toBe(200);

      const json = await response.json();
      expect(json.success).toBe(true);
      expect(json.timestamp).toBeDefined();
      expect(json.watDate).toBeDefined();
      expect(json.durationMs).toBeGreaterThanOrEqual(0);
      expect(json.tMinus1).toBeDefined();
      expect(json.dayOf).toBeDefined();
      expect(json.logsCreated).toBe(0);
      expect(json.totalCelebrants).toBe(0);
    });

    it('authorizes GET request using query parameter ?secret=...', async () => {
      mockPrisma.church.findFirst.mockResolvedValue({ id: 'church-1', name: 'RCCG Test Zone' });
      mockPrisma.person.findMany.mockResolvedValue([]);

      const request = new NextRequest(
        `http://localhost:3000/api/cron/birthdays?secret=${TEST_SECRET}`,
        { method: 'GET' }
      );

      const response = await GET(request);
      expect(response.status).toBe(200);

      const json = await response.json();
      expect(json.success).toBe(true);
    });

    it('authorizes request using custom header x-cron-secret', async () => {
      mockPrisma.church.findFirst.mockResolvedValue({ id: 'church-1', name: 'RCCG Test Zone' });
      mockPrisma.person.findMany.mockResolvedValue([]);

      const request = new NextRequest('http://localhost:3000/api/cron/birthdays', {
        method: 'POST',
        headers: {
          'x-cron-secret': TEST_SECRET,
        },
      });

      const response = await POST(request);
      expect(response.status).toBe(200);

      const json = await response.json();
      expect(json.success).toBe(true);
    });

    it('returns HTTP 500 gracefully when an internal exception occurs during pipeline execution', async () => {
      mockPrisma.church.findFirst.mockRejectedValue(new Error('Database connection timeout'));

      const request = new NextRequest('http://localhost:3000/api/cron/birthdays', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${TEST_SECRET}`,
        },
      });

      const response = await POST(request);
      expect(response.status).toBe(500);

      const json = await response.json();
      expect(json.success).toBe(false);
      expect(json.error).toContain('Database connection timeout');
    });
  });
});
