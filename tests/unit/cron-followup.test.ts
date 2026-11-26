import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mockPrisma } from '../helpers/prisma-mock';

vi.mock('@/lib/prisma', () => ({
  prisma: mockPrisma,
}));

import { NextRequest } from 'next/server';
import { GET, POST } from '@/app/api/cron/follow-up/route';

describe('Authorized Follow-Up Cron Route Handler (/api/cron/follow-up)', () => {
  const originalEnv = process.env;
  const TEST_SECRET = 'rccg_super_secure_cron_secret_2026';

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv, CRON_SECRET: TEST_SECRET };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('1. Security & Authentication Gate', () => {
    it('returns HTTP 401 Unauthorized when no credentials or secret provided', async () => {
      const request = new NextRequest('http://localhost:3000/api/cron/follow-up', {
        method: 'POST',
      });

      const response = await POST(request);
      expect(response.status).toBe(401);

      const json = await response.json();
      expect(json.success).toBe(false);
      expect(json.code).toBe('UNAUTHORIZED');
    });

    it('returns HTTP 401 Unauthorized when invalid Bearer token is provided', async () => {
      const request = new NextRequest('http://localhost:3000/api/cron/follow-up', {
        method: 'POST',
        headers: {
          authorization: 'Bearer incorrect_cron_secret',
        },
      });

      const response = await POST(request);
      expect(response.status).toBe(401);

      const json = await response.json();
      expect(json.success).toBe(false);
      expect(json.code).toBe('UNAUTHORIZED');
    });

    it('returns HTTP 401 Unauthorized when invalid query secret is provided', async () => {
      const request = new NextRequest('http://localhost:3000/api/cron/follow-up?secret=invalid_secret', {
        method: 'GET',
      });

      const response = await GET(request);
      expect(response.status).toBe(401);

      const json = await response.json();
      expect(json.success).toBe(false);
      expect(json.code).toBe('UNAUTHORIZED');
    });
  });

  describe('2. Authorized Execution & Telemetry Output', () => {
    it('executes full pipeline with valid Bearer token and returns HTTP 200 with structured JSON', async () => {
      mockPrisma.church.findFirst.mockResolvedValue({ id: 'church-1', name: 'RCCG Test Zone' });
      mockPrisma.person.findMany.mockResolvedValue([]);
      mockPrisma.attendanceRecord.findMany.mockResolvedValue([]);
      mockPrisma.followUpTask.findMany.mockResolvedValue([]);

      const request = new NextRequest('http://localhost:3000/api/cron/follow-up', {
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
      expect(json.durationMs).toBeGreaterThanOrEqual(0);
      expect(json.radar).toBeDefined();
      expect(json.sync).toBeDefined();
      expect(json.escalations).toBeDefined();
      expect(json.radar.scanned).toBe(0);
      expect(json.sync.tasksCreated).toBe(0);
      expect(json.escalations.tasksEscalated).toBe(0);
    });

    it('authorizes GET request using query parameter ?secret=...', async () => {
      mockPrisma.church.findFirst.mockResolvedValue({ id: 'church-1', name: 'RCCG Test Zone' });
      mockPrisma.person.findMany.mockResolvedValue([]);
      mockPrisma.attendanceRecord.findMany.mockResolvedValue([]);
      mockPrisma.followUpTask.findMany.mockResolvedValue([]);

      const request = new NextRequest(`http://localhost:3000/api/cron/follow-up?secret=${TEST_SECRET}`, {
        method: 'GET',
      });

      const response = await GET(request);
      expect(response.status).toBe(200);

      const json = await response.json();
      expect(json.success).toBe(true);
      expect(json.sync).toBeDefined();
    });

    it('authorizes request using custom x-cron-secret header', async () => {
      mockPrisma.church.findFirst.mockResolvedValue({ id: 'church-1', name: 'RCCG Test Zone' });
      mockPrisma.person.findMany.mockResolvedValue([]);
      mockPrisma.attendanceRecord.findMany.mockResolvedValue([]);
      mockPrisma.followUpTask.findMany.mockResolvedValue([]);

      const request = new NextRequest('http://localhost:3000/api/cron/follow-up', {
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

    it('returns HTTP 500 gracefully when an internal exception occurs during sync', async () => {
      mockPrisma.church.findFirst.mockRejectedValue(new Error('Database connection timeout'));

      const request = new NextRequest('http://localhost:3000/api/cron/follow-up', {
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
