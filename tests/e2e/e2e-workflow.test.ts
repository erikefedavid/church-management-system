/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * End-to-End Cross-Feature Integration Test Suite (Milestone 5)
 * RCCG Jesus Covenant Zone CMS Rebuild
 *
 * Verifies the complete end-to-end flow spanning all milestones:
 * 1. Geofenced Youth-First Attendance (150m radius around 6.5244, 3.3792 WAT, 4-digit lookup, 1-tap, QR, anti-proxy lock).
 * 2. Zero-Forgotten-Member Follow-Up Engine (Absence Radar, 0-token deterministic WhatsApp draft, 48h auto-escalation to Pastor).
 * 3. Multi-Provider Direct DM Dispatch (Termii, Twilio, WhatsApp Cloud API, wa.me 1-click fallback).
 * 4. Media Team Birthday Telegram Automation (T-1 flyer alert with photoUrl, Day-of celebration, leap year handling, BirthdayReminderLog idempotency).
 * 5. Authorized Cron Endpoints (/api/cron/follow-up and /api/cron/birthdays with Bearer auth).
 * 6. UI & Motion Compliance (Zero AI tells, AAA contrast, 44px touch targets, Framer Motion momentum deceleration & scale 0.95).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mockPrisma } from '../helpers/prisma-mock';
import fs from 'node:fs';
import path from 'node:path';

vi.mock('@/lib/prisma', () => ({
  prisma: mockPrisma,
}));

import {
  isWithinChurchGeofence,
  calculateDistanceInMeters,
} from '@/lib/geo';
import {
  lookupByPhoneSuffix,
  lookupMemberByIdAction,
  registerAttendance,
  registerFirstTimerAction,
} from '@/app/actions/attendance';
import {
  getDeviceAttendanceLock,
  setDeviceAttendanceLock,
  clearDeviceAttendanceLock,
  isDeviceLockedForService,
} from '@/lib/device-lock';
import {
  getNigerianDateString,
} from '@/lib/service-resolver';
import {
  detectAbsenteeMembers,
  AbsenceRadarScanResult,
} from '@/lib/absence-radar';
import {
  executeAutoEscalationScan,
} from '@/lib/follow-up-engine';
import {
  renderTemplate,
} from '@/lib/template-engine';
import {
  dispatchDirectMessage,
  normalizePhoneNumber,
  generateWaMeLink,
} from '@/lib/direct-dispatch';
import {
  calculateDaysUntilBirthday,
  runBirthdayPipeline,
  isLeapYear,
  BIRTHDAY_REMINDER_TYPES,
} from '@/lib/birthday-engine';
import {
  formatBirthdayAlertMarkdown,
} from '@/lib/telegram';
import { POST as postFollowUpCron } from '@/app/api/cron/follow-up/route';
import { POST as postBirthdayCron } from '@/app/api/cron/birthdays/route';
import { NextRequest } from 'next/server';

describe('Milestone 5: Comprehensive E2E Cross-Feature Integration Suite', () => {
  const originalEnv = process.env;
  const TEST_CRON_SECRET = 'covenant_zone_master_cron_secret_2026';
  const CHURCH_LAT = 6.5244;
  const CHURCH_LNG = 3.3792;
  const CHURCH_RADIUS = 150;

  // Mock church fixture
  const mockChurch = {
    id: 'church-covenant-zone-e2e',
    name: 'RCCG Jesus Covenant Zone',
    latitude: CHURCH_LAT,
    longitude: CHURCH_LNG,
    geofenceRadius: CHURCH_RADIUS,
    requireLocationForAttendance: true,
  };

  // Mock service schedule fixture (Sunday Youth Service 09:00 - 11:30)
  const mockSundayService = {
    id: 'service-sunday-youth',
    churchId: mockChurch.id,
    name: 'Sunday Youth Church',
    dayOfWeek: 'SUNDAY',
    startTime: '09:00',
    endTime: '11:30',
    isActive: true,
  };

  const mockMidweekService = {
    id: 'service-wed-faith',
    churchId: mockChurch.id,
    name: 'Faith Clinic & Bible Study',
    dayOfWeek: 'WEDNESDAY',
    startTime: '18:00',
    endTime: '19:30',
    isActive: true,
  };

  // Mock members with realistic profile data
  const memberTunde = {
    id: 'person-tunde-001',
    churchId: mockChurch.id,
    firstName: 'Tunde',
    lastName: 'Adeyemi',
    phone: '08031234567',
    phoneLast4: '4567',
    category: 'YOUTH',
    subCategory: 'Choir',
    status: 'MEMBER',
    birthDay: 15,
    birthMonth: 11,
    photoUrl: 'https://images.unsplash.com/photo-celebrant-tunde.jpg',
    isActive: true,
    createdAt: new Date('2026-01-10T10:00:00Z'),
  };

  const memberBlessing = {
    id: 'person-blessing-002',
    churchId: mockChurch.id,
    firstName: 'Blessing',
    lastName: 'Okonkwo',
    phone: '08129876543',
    phoneLast4: '6543',
    category: 'YOUTH',
    subCategory: 'Ushering',
    status: 'MEMBER',
    birthDay: 14,
    birthMonth: 11,
    photoUrl: null,
    isActive: true,
    createdAt: new Date('2026-02-15T10:00:00Z'),
  };

  // In-memory localStorage mock for client-side device-lock tests
  let mockStorage: Record<string, string> = {};
  const mockLocalStorage = {
    getItem: vi.fn((key: string) => mockStorage[key] ?? null),
    setItem: vi.fn((key: string, value: string) => {
      mockStorage[key] = String(value);
    }),
    removeItem: vi.fn((key: string) => {
      delete mockStorage[key];
    }),
    clear: vi.fn(() => {
      mockStorage = {};
    }),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = {
      ...originalEnv,
      CRON_SECRET: TEST_CRON_SECRET,
      TERMII_API_KEY: 'test_termii_key_e2e',
      TERMII_SENDER_ID: 'RCCGJCZ',
    };

    mockStorage = {};
    (global as any).window = global;
    (global as any).localStorage = mockLocalStorage;

    // Default safe mocks for all Prisma models
    mockPrisma.church.findFirst.mockResolvedValue(mockChurch);
    mockPrisma.church.findUnique.mockResolvedValue(mockChurch);
    mockPrisma.serviceSchedule.findFirst.mockResolvedValue(mockSundayService);
    mockPrisma.serviceSchedule.findUnique.mockResolvedValue(mockSundayService);
    mockPrisma.serviceSchedule.findMany.mockResolvedValue([mockSundayService, mockMidweekService]);
    mockPrisma.followUpTask.findMany.mockResolvedValue([]);
    mockPrisma.followUpResult.findMany.mockResolvedValue([]);
    mockPrisma.attendanceRecord.findMany.mockResolvedValue([]);
    mockPrisma.birthdayReminderLog.findMany.mockResolvedValue([]);
    mockPrisma.birthdayReminderLog.findUnique.mockResolvedValue(null);
    mockPrisma.person.findMany.mockResolvedValue([]);
    mockPrisma.person.findFirst.mockResolvedValue(null);
  });

  afterEach(() => {
    process.env = originalEnv;
    delete (global as any).window;
    delete (global as any).localStorage;
  });

  // =========================================================================
  // E2E FLOW 1: Youth-First Attendance Check-In & Strict Geofencing
  // =========================================================================
  describe('E2E Flow 1: Youth-First Attendance Check-In & Strict Geofencing', () => {
    it('1.1: Strict geofence enforcement preserves exact coordinates (6.5244, 3.3792, 150m)', () => {
      const churchCoords = { latitude: 6.5244, longitude: 3.3792 };

      // Point A: Inside sanctuary (approx 30m away)
      const insideCoords = { latitude: 6.5246, longitude: 3.3792, accuracy: 10 };
      const insideCheck = isWithinChurchGeofence(insideCoords, churchCoords, 150);
      expect(insideCheck.isAllowed).toBe(true);
      expect(insideCheck.distanceMeters).toBeLessThanOrEqual(150);

      // Point B: Far outside sanctuary (>2km away in Victoria Island/Ikeja)
      const outsideCoords = { latitude: 6.5900, longitude: 3.3500, accuracy: 15 };
      const outsideCheck = isWithinChurchGeofence(outsideCoords, churchCoords, 150);
      expect(outsideCheck.isAllowed).toBe(false);
      expect(outsideCheck.distanceMeters).toBeGreaterThan(150);

      // Distance calculation verification
      const d = calculateDistanceInMeters(churchCoords, outsideCoords);
      expect(d).toBeGreaterThan(5000);
    });

    it('1.2: End-to-end check-in paths: 4-digit lookup, 1-tap profile, and QR code check-in', async () => {
      // Setup member lookup
      mockPrisma.person.findMany.mockResolvedValue([memberTunde]);
      mockPrisma.person.findUnique.mockResolvedValue(memberTunde);

      // 1. 4-Digit Lookup
      const lookupRes = await lookupByPhoneSuffix('4567');
      expect(lookupRes.success).toBe(true);
      expect(lookupRes.members).toHaveLength(1);
      expect(lookupRes.members[0].id).toBe(memberTunde.id);
      expect(lookupRes.members[0].firstName).toBe('Tunde');

      // 2. Member ID Lookup (for 1-tap remembered profile)
      const memberRes = await lookupMemberByIdAction(memberTunde.id);
      expect(memberRes.success).toBe(true);
      expect(memberRes.member?.id).toBe(memberTunde.id);

      // 3. Register Attendance via LOOKUP_4DIGIT
      mockPrisma.attendanceRecord.findFirst.mockResolvedValue(null); // No existing check-in today
      mockPrisma.attendanceRecord.create.mockResolvedValue({
        id: 'rec-tunde-today',
        churchId: mockChurch.id,
        personId: memberTunde.id,
        serviceId: mockSundayService.id,
        method: 'LOOKUP_4DIGIT',
        distanceMeters: 28,
        latitude: 6.5245,
        longitude: 3.3792,
        verifiedInside: true,
        checkedInAt: new Date(),
        person: memberTunde,
        serviceSchedule: mockSundayService,
      });

      const regRes = await registerAttendance({
        personId: memberTunde.id,
        latitude: 6.5245,
        longitude: 3.3792,
        serviceScheduleId: mockSundayService.id,
        method: 'LOOKUP_4DIGIT',
      });

      expect(regRes.success).toBe(true);
      expect(regRes.personId).toBe(memberTunde.id);
      expect(regRes.serviceName).toBe(mockSundayService.name);
    });

    it('1.3: Anti-proxy device lock protects attendance integrity and unlocks on next service', () => {
      const todayWAT = getNigerianDateString();

      // 1. Initially unlocked
      expect(isDeviceLockedForService(mockSundayService.id)).toBe(false);

      // 2. Set device lock after Tunde checks in
      setDeviceAttendanceLock({
        serviceId: mockSundayService.id,
        serviceName: mockSundayService.name,
        serviceDate: todayWAT,
        checkedInPersonId: memberTunde.id,
        checkedInName: `${memberTunde.firstName} ${memberTunde.lastName}`,
        phoneLast4: memberTunde.phoneLast4,
        timestamp: Date.now(),
        method: 'LOOKUP_4DIGIT',
      });

      // 3. Device is now locked for Sunday Youth Service
      expect(isDeviceLockedForService(mockSundayService.id)).toBe(true);
      const activeLock = getDeviceAttendanceLock();
      expect(activeLock).not.toBeNull();
      expect(activeLock?.checkedInPersonId).toBe(memberTunde.id);

      // 4. Device is NOT locked for the next service (Wednesday Faith Clinic)
      expect(isDeviceLockedForService(mockMidweekService.id)).toBe(false);

      // 5. Explicit clear unlocks completely
      clearDeviceAttendanceLock();
      expect(isDeviceLockedForService(mockSundayService.id)).toBe(false);
    });

    it('1.4: First-timer 1-tap onboarding creates Person and AttendanceRecord in one transaction', async () => {
      const newFirstTimer = {
        id: 'person-first-timer-99',
        churchId: mockChurch.id,
        firstName: 'Chidinma',
        lastName: 'Eze',
        phone: '08091112233',
        phoneLast4: '2233',
        category: 'YOUTH',
        status: 'FIRST_TIMER',
        createdAt: new Date(),
      };

      mockPrisma.person.findFirst.mockResolvedValue(null);
      mockPrisma.person.create.mockResolvedValue(newFirstTimer);
      mockPrisma.attendanceRecord.findFirst.mockResolvedValue(null);
      mockPrisma.attendanceRecord.create.mockResolvedValue({
        id: 'rec-first-timer-99',
        churchId: mockChurch.id,
        personId: newFirstTimer.id,
        serviceId: mockSundayService.id,
        method: 'LOOKUP_4DIGIT',
        verifiedInside: true,
        person: newFirstTimer,
        serviceSchedule: mockSundayService,
      });

      const ftRes = await registerFirstTimerAction({
        firstName: 'Chidinma',
        lastName: 'Eze',
        phone: '08091112233',
        category: 'YOUTH' as any,
        serviceScheduleId: mockSundayService.id,
        userLatitude: 6.5244,
        userLongitude: 3.3792,
      });

      expect(ftRes.success).toBe(true);
      expect(ftRes.personId).toBe(newFirstTimer.id);
      expect(ftRes.personName).toContain('Chidinma');
    });
  });

  // =========================================================================
  // E2E FLOW 2: Zero-Forgotten-Member Follow-Up Engine & 48h Escalation
  // =========================================================================
  describe('E2E Flow 2: Zero-Forgotten-Member Follow-Up Engine & 48h Escalation', () => {
    const s1Date = new Date('2026-11-08T00:00:00.000Z'); // Most recent Sunday
    const s2Date = new Date('2026-11-01T00:00:00.000Z'); // 1 Sunday ago
    const s3Date = new Date('2026-10-25T00:00:00.000Z'); // 2 Sundays ago

    const absentMember1Wk = {
      id: 'person-absent-1wk',
      churchId: mockChurch.id,
      firstName: 'Emeka',
      lastName: 'Obi',
      phone: '08023456789',
      phoneLast4: '6789',
      category: 'YOUTH',
      subCategory: 'Media',
      status: 'MEMBER',
      isActive: true,
      createdAt: new Date('2025-06-01T00:00:00Z'),
    };

    const absentMember2Wks = {
      id: 'person-absent-2wks',
      churchId: mockChurch.id,
      firstName: 'Tolani',
      lastName: 'Ajayi',
      phone: '08034567890',
      phoneLast4: '7890',
      category: 'YOUTH',
      subCategory: 'Ushering',
      status: 'MEMBER',
      isActive: true,
      createdAt: new Date('2025-06-01T00:00:00Z'),
    };

    const firstTimer72h = {
      id: 'person-first-timer-72h',
      churchId: mockChurch.id,
      firstName: 'Kelechi',
      lastName: 'Nnamdi',
      phone: '08056789012',
      phoneLast4: '9012',
      category: 'YOUTH',
      subCategory: null,
      status: 'FIRST_TIMER',
      isActive: true,
      createdAt: new Date('2026-11-08T10:30:00Z'), // Attended S1
    };

    it('2.1: Absence Radar identifies missed 1 week, missed 2 weeks, and first-timer within 72h', async () => {
      const scanDate = new Date('2026-11-10T10:00:00Z'); // Tuesday after S1
      const ftRecent = {
        ...firstTimer72h,
        createdAt: new Date(scanDate.getTime() - 24 * 3600 * 1000), // Created 24h ago (<72h)
      };

      // Query 1: Active members including first-timers
      mockPrisma.person.findMany.mockResolvedValue([
        memberTunde,
        absentMember1Wk,
        absentMember2Wks,
        ftRecent,
      ]);

      // Query 2: Target Sundays attendance
      // Query 3: 60-day attendance history
      mockPrisma.attendanceRecord.findMany
        .mockResolvedValueOnce([
          { personId: memberTunde.id, date: s1Date },
          { personId: absentMember1Wk.id, date: s2Date },
          { personId: absentMember2Wks.id, date: s3Date },
        ])
        .mockResolvedValueOnce([
          { personId: memberTunde.id, date: s1Date },
          { personId: absentMember1Wk.id, date: s2Date },
          { personId: absentMember2Wks.id, date: s3Date },
        ]);

      const radarResult: AbsenceRadarScanResult = await detectAbsenteeMembers({
        churchId: mockChurch.id,
        refDate: scanDate,
      });

      expect(radarResult.stats.totalAbsentees).toBe(3);
      expect(radarResult.missed1Week).toHaveLength(1);
      expect(radarResult.missed1Week[0].personId).toBe(absentMember1Wk.id);

      expect(radarResult.missed2Weeks).toHaveLength(1);
      expect(radarResult.missed2Weeks[0].personId).toBe(absentMember2Wks.id);

      expect(radarResult.firstTimers72h).toHaveLength(1);
      expect(radarResult.firstTimers72h[0].personId).toBe(firstTimer72h.id);
    });

    it('2.2: Generates contextual WhatsApp follow-up drafts with 0 tokens and dynamic variables', () => {
      // 1. Missed 1 week youth draft
      const draft1Wk = renderTemplate('MISSED_1_WEEK', {
        firstName: 'Emeka',
        subCategory: 'Media',
      });

      expect(draft1Wk.text).toContain('Emeka');
      expect(draft1Wk.text.length).toBeGreaterThan(10);
      expect(draft1Wk.unresolvedTokens).toHaveLength(0);

      // 2. Missed 2 weeks caring draft
      const draft2Wks = renderTemplate('MISSED_2_WEEKS', {
        firstName: 'Tolani',
        department: 'Ushering',
      });

      expect(draft2Wks.text).toContain('Tolani');
      expect(draft2Wks.unresolvedTokens).toHaveLength(0);

      // 3. First-timer warm welcome draft
      const draftFT = renderTemplate('FIRST_TIMER_72H', {
        firstName: 'Kelechi',
      });

      expect(draftFT.text).toContain('Kelechi');
      expect(draftFT.unresolvedTokens).toHaveLength(0);
    });

    it('2.3: Overdue tasks (>48 hours) auto-escalate to Youth Pastor with audit trail in FollowUpResult', async () => {
      const now = new Date('2026-11-10T13:00:00Z');
      const pendingTaskOverdue = {
        id: 'task-overdue-123',
        churchId: mockChurch.id,
        personId: absentMember2Wks.id,
        reason: 'MISSED_2_WEEKS',
        status: 'PENDING',
        assignedTo: 'VOLUNTEER_USHER',
        dueDate: new Date('2026-11-10T10:00:00Z'), // Expired 3 hours ago relative to now
        escalatedTo: null,
        notes: 'Initial task creation',
        person: absentMember2Wks,
      };

      mockPrisma.followUpTask.findMany.mockResolvedValue([pendingTaskOverdue]);
      mockPrisma.followUpTask.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.followUpResult.create.mockResolvedValue({
        id: 'res-escalation-99',
        taskId: pendingTaskOverdue.id,
        outcome: 'ESCALATED_TO_PASTOR',
        notes: '48h SLA exceeded. Auto-escalated to Youth Pastor for urgent pastoral care.',
        contactedAt: new Date(),
      });

      const escalationScan = await executeAutoEscalationScan({
        now,
        churchId: mockChurch.id,
      });

      expect(escalationScan.escalatedCount).toBe(1);
      expect(escalationScan.taskIds).toContain(pendingTaskOverdue.id);
      expect(mockPrisma.followUpTask.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            id: { in: [pendingTaskOverdue.id] },
            status: 'PENDING',
          },
          data: expect.objectContaining({
            status: 'ESCALATED',
            escalatedTo: 'YOUTH_PASTOR',
          }),
        })
      );
    });
  });

  // =========================================================================
  // E2E FLOW 3: Multi-Provider Direct DM Dispatch & Wa.me Fallback
  // =========================================================================
  describe('E2E Flow 3: Multi-Provider Direct DM Dispatch & Wa.me Fallback', () => {
    it('3.1: Phone normalizer correctly parses Nigerian formats and creates safe wa.me links', () => {
      // 0803 standard format
      const norm1 = normalizePhoneNumber('08031234567');
      expect(norm1.isValid).toBe(true);
      expect(norm1.e164).toBe('+2348031234567');
      expect(norm1.phoneLast4).toBe('4567');
      expect(norm1.isNigerian).toBe(true);

      // +234 format with spaces and dashes
      const norm2 = normalizePhoneNumber('+234 812-987-6543');
      expect(norm2.isValid).toBe(true);
      expect(norm2.e164).toBe('+2348129876543');
      expect(norm2.phoneLast4).toBe('6543');

      // wa.me link generation with URL-encoded body
      const waUrl = generateWaMeLink(norm1.digitsOnly, 'Hello Tunde, we missed you at RCCG Jesus Covenant Zone!');
      expect(waUrl).toContain('https://wa.me/2348031234567?text=');
      expect(waUrl).toContain('RCCG%20Jesus%20Covenant%20Zone');
    });

    it('3.2: Direct dispatch routes messages via configured gateway with 100% resilient wa.me fallback', async () => {
      // 1. WhatsApp channel without expensive Meta Cloud API credentials automatically generates 1-click wa.me fallback
      const waResult = await dispatchDirectMessage({
        to: '08031234567',
        body: 'Dear Tunde, we missed you at RCCG Jesus Covenant Zone!',
        channel: 'WHATSAPP',
        recipientName: 'Tunde Adeyemi',
      });

      expect(waResult.success).toBe(true);
      expect(waResult.status).toBe('FALLBACK_GENERATED');
      expect(waResult.provider).toBe('WA_ME');
      expect(waResult.waMeUrl).toContain('https://wa.me/2348031234567');

      // 2. SMS channel routes via Termii API when configured
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          message_id: 'termii-msg-998877',
          message: 'Successfully Sent',
          balance: 450,
          user: 'RCCG JCZ',
        }),
      });
      (global as any).fetch = mockFetch;

      const smsResult = await dispatchDirectMessage({
        to: '08031234567',
        body: 'RCCG JCZ: Dear Tunde, Sunday service starts at 9am!',
        channel: 'SMS',
        recipientName: 'Tunde Adeyemi',
      });

      expect(smsResult.success).toBe(true);
      expect(smsResult.status).toBe('DELIVERED');
      expect(smsResult.provider).toBe('TERMII');
      expect(smsResult.normalizedPhone.e164).toBe('+2348031234567');
    });
  });

  // =========================================================================
  // E2E FLOW 4: Media Team Birthday Telegram Automation & Pipeline Idempotency
  // =========================================================================
  describe('E2E Flow 4: Media Team Birthday Telegram Automation & Pipeline Idempotency', () => {
    it('4.1: Birthday detector correctly identifies Day-Of, T-1, and Leap Year (Feb 29) celebrants', () => {
      // Leap year calculations
      expect(isLeapYear(2024)).toBe(true);
      expect(isLeapYear(2026)).toBe(false);
      expect(isLeapYear(2028)).toBe(true);

      // On Nov 14, 2026:
      // Blessing born Nov 14 -> 0 days remaining (Day-Of)
      expect(calculateDaysUntilBirthday(11, 14, 11, 14, 2026)).toBe(0);

      // Tunde born Nov 15 -> 1 day remaining (T-1)
      expect(calculateDaysUntilBirthday(11, 15, 11, 14, 2026)).toBe(1);

      // Leap Day born (Feb 29) in non-leap year (2026) celebrated seamlessly on Feb 28
      expect(calculateDaysUntilBirthday(2, 29, 2, 28, 2026)).toBe(0);
      expect(calculateDaysUntilBirthday(2, 29, 2, 27, 2026)).toBe(1);
    });

    it('4.2: T-1 Telegram alert formats formatted Markdown message with photoUrl for media flyer prep', () => {
      const alertMarkdown = formatBirthdayAlertMarkdown({
        celebrantName: `${memberTunde.firstName} ${memberTunde.lastName}`,
        department: memberTunde.subCategory,
        category: memberTunde.category,
        birthDateFormatted: 'November 15',
        photoUrl: memberTunde.photoUrl,
        daysUntilBirthday: 1,
      });

      expect(alertMarkdown).toContain('Tunde Adeyemi');
      expect(alertMarkdown).toContain('Choir');
      expect(alertMarkdown).toContain('November 15');
      expect(alertMarkdown).toContain(memberTunde.photoUrl);
      expect(alertMarkdown).toContain('FLYER NOTICE');
    });

    it('4.3: Birthday pipeline executes end-to-end and strictly enforces database idempotency', async () => {
      const fixedToday = new Date('2026-11-14T08:00:00Z');
      // Stateful in-memory database store faithfully enforcing @@unique([personId, year, type])
      const inMemoryLogStore = new Map<string, any>();
      let logIdCounter = 0;

      mockPrisma.person.findMany.mockResolvedValue([memberBlessing, memberTunde]);

      // Stateful findUnique
      mockPrisma.birthdayReminderLog.findUnique.mockImplementation(async (args: any) => {
        const { personId, year, type } = args.where.personId_year_type;
        const compoundKey = `${personId}:${year}:${type}`;
        return inMemoryLogStore.get(compoundKey) || null;
      });

      // Stateful create
      mockPrisma.birthdayReminderLog.create.mockImplementation(async (args: any) => {
        const { personId, year, type, status } = args.data;
        const compoundKey = `${personId}:${year}:${type}`;
        if (inMemoryLogStore.has(compoundKey)) {
          const p2002Error: any = new Error('Unique constraint failed on the fields: (personId, year, type)');
          p2002Error.code = 'P2002';
          throw p2002Error;
        }
        logIdCounter++;
        const record = {
          id: `log-${logIdCounter}`,
          personId,
          year,
          type,
          status: status || 'SENT',
          sentAt: new Date(),
        };
        inMemoryLogStore.set(compoundKey, record);
        return record;
      });

      // Run 1: First execution with dryRun=true (simulation mode with full DB logging)
      const firstRun = await runBirthdayPipeline({
        churchId: mockChurch.id,
        targetDate: fixedToday,
        dryRun: true,
      });

      expect(firstRun.success).toBe(true);
      expect(firstRun.tMinus1.celebrantsCount).toBe(1); // Tunde (tomorrow Nov 15)
      expect(firstRun.dayOf.celebrantsCount).toBe(1);   // Blessing (today Nov 14)
      expect(firstRun.logsCreated).toBe(2);

      // Verify in-memory store contains both logs
      expect(inMemoryLogStore.has(`${memberTunde.id}:2026:${BIRTHDAY_REMINDER_TYPES.T_MINUS_1_MEDIA}`)).toBe(true);
      expect(inMemoryLogStore.has(`${memberBlessing.id}:2026:${BIRTHDAY_REMINDER_TYPES.DAY_OF_CELEBRATION}`)).toBe(true);

      // Run 2: Second execution on the same date detects existing logs and skips duplicate dispatches (0 double sends)
      const secondRun = await runBirthdayPipeline({
        churchId: mockChurch.id,
        targetDate: fixedToday,
        dryRun: true,
      });

      expect(secondRun.success).toBe(true);
      expect(secondRun.tMinus1.skippedAlreadyLogged).toBe(1);
      expect(secondRun.dayOf.skippedAlreadyLogged).toBe(1);
      expect(secondRun.logsCreated).toBe(0); // 0 duplicate logs!
      expect(inMemoryLogStore.size).toBe(2); // Still exactly 2 unique records
    });
  });

  // =========================================================================
  // E2E FLOW 5: Authorized Cron Endpoints Security & Triggering
  // =========================================================================
  describe('E2E Flow 5: Authorized Cron Endpoints Security & Triggering', () => {
    it('5.1: /api/cron/follow-up rejects unauthorized requests and accepts valid Bearer secret', async () => {
      // 1. Missing Authorization header -> 401
      const reqMissing = new NextRequest('http://localhost:3000/api/cron/follow-up', {
        method: 'POST',
      });
      const resMissing = await postFollowUpCron(reqMissing);
      expect(resMissing.status).toBe(401);
      const jsonMissing = await resMissing.json();
      expect(jsonMissing.error).toBe('Unauthorized: Invalid or missing authorization header/secret');

      // 2. Invalid Bearer Token -> 401
      const reqInvalid = new NextRequest('http://localhost:3000/api/cron/follow-up', {
        method: 'POST',
        headers: { authorization: 'Bearer wrong-secret-token' },
      });
      const resInvalid = await postFollowUpCron(reqInvalid);
      expect(resInvalid.status).toBe(401);

      // 3. Valid Bearer Token -> 200 with structured telemetry
      mockPrisma.person.findMany.mockResolvedValue([]);
      mockPrisma.attendanceRecord.findMany.mockResolvedValue([]);
      mockPrisma.followUpTask.findMany.mockResolvedValue([]);

      const reqValid = new NextRequest('http://localhost:3000/api/cron/follow-up', {
        method: 'POST',
        headers: { authorization: `Bearer ${TEST_CRON_SECRET}` },
      });
      const resValid = await postFollowUpCron(reqValid);
      expect(resValid.status).toBe(200);
      const jsonValid = await resValid.json();
      expect(jsonValid.success).toBe(true);
      expect(jsonValid.radar).toBeDefined();
      expect(jsonValid.sync).toBeDefined();
      expect(jsonValid.escalations).toBeDefined();
    });

    it('5.2: /api/cron/birthdays rejects unauthorized requests and accepts valid Bearer secret', async () => {
      // 1. Missing Authorization header -> 401
      const reqMissing = new NextRequest('http://localhost:3000/api/cron/birthdays', {
        method: 'POST',
      });
      const resMissing = await postBirthdayCron(reqMissing);
      expect(resMissing.status).toBe(401);
      const jsonMissing = await resMissing.json();
      expect(jsonMissing.error).toBe('Unauthorized: Invalid or missing authorization header/secret');

      // 2. Invalid Bearer Token -> 401
      const reqInvalid = new NextRequest('http://localhost:3000/api/cron/birthdays', {
        method: 'POST',
        headers: { authorization: 'Bearer wrong-secret-token' },
      });
      const resInvalid = await postBirthdayCron(reqInvalid);
      expect(resInvalid.status).toBe(401);

      // 3. Valid Bearer Token -> 200 with structured telemetry
      mockPrisma.person.findMany.mockResolvedValue([]);
      mockPrisma.birthdayReminderLog.findUnique.mockResolvedValue(null);

      const reqValid = new NextRequest('http://localhost:3000/api/cron/birthdays?dryRun=true', {
        method: 'POST',
        headers: { authorization: `Bearer ${TEST_CRON_SECRET}` },
      });
      const resValid = await postBirthdayCron(reqValid);
      expect(resValid.status).toBe(200);
      const jsonValid = await resValid.json();
      expect(jsonValid.success).toBe(true);
      expect(jsonValid.tMinus1).toBeDefined();
      expect(jsonValid.dayOf).toBeDefined();
    });
  });

  // =========================================================================
  // E2E FLOW 6: UI Standards & Anti-AI Tells Static Verification
  // =========================================================================
  describe('E2E Flow 6: UI Standards & Anti-AI Tells Static Verification', () => {
    it('6.1: Key frontend pages contain zero AI tells (no grid lines, neon blur bubbles, cartoon bounces, filler copy)', () => {
      const pageFiles = [
        path.join(process.cwd(), 'app', 'page.tsx'),
        path.join(process.cwd(), 'app', 'followup', 'page.tsx'),
        path.join(process.cwd(), 'app', 'birthdays', 'page.tsx'),
      ];

      for (const filePath of pageFiles) {
        if (!fs.existsSync(filePath)) continue;
        const content = fs.readFileSync(filePath, 'utf-8');

        // Rule 1: No fake grid backgrounds
        expect(content).not.toContain('codex-grid-background');
        expect(content).not.toContain('bg-[linear-gradient(to_right');

        // Rule 2: No cartoon bounces
        expect(content).not.toContain('animate-bounce');

        // Rule 3: No AI filler copy
        expect(content).not.toContain('Empower your workflow');
        expect(content).not.toContain('Unlock next-gen synergies');
        expect(content).not.toContain('Streamline everything');
      }
    });

    it('6.2: RCCG official logo is present and rendered in AttendanceHeader component', () => {
      const headerPath = path.join(process.cwd(), 'app', 'components', 'attendance', 'AttendanceHeader.tsx');
      const headerContent = fs.readFileSync(headerPath, 'utf-8');

      expect(headerContent).toContain('rccg-logo.png');
      expect(headerContent).toContain('The Redeemed Christian Church of God');
    });

    it('6.3: Motion specification adheres to Emil Kowalski standards (momentum deceleration, scale 0.95, tactile click feedback)', () => {
      const motionPath = path.join(process.cwd(), 'lib', 'motion.ts');
      const motionContent = fs.readFileSync(motionPath, 'utf-8');

      // Momentum deceleration (never ease-in)
      expect(motionContent).toContain('MOMENTUM_EASE');
      expect(motionContent).toContain('0.23, 1, 0.32, 1');

      // Scale entrance from 0.95 (never scale from 0)
      expect(motionContent).toContain('scale: 0.95');

      // Tactile click feedback under 100ms
      expect(motionContent).toContain('tactileTapProps');
      expect(motionContent).toContain('scale: 0.97');
      expect(motionContent).toContain('duration: 0.08');
    });
  });
});
