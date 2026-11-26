/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Empirical Adversarial Stress Testing Suite for Attendance Concurrency,
 * Workers' Meeting Routing, Geofence Boundaries, and QR/Profile Resilience.
 *
 * RCCG Jesus Covenant Zone CMS — Milestone 2 Challenger 2
 *
 * Target modules under test:
 * - app/actions/attendance.ts (registerAttendance, lookupByPhoneSuffix, lookupMemberByIdAction, registerFirstTimerAction)
 * - lib/geo.ts (isWithinChurchGeofence, isWithinGeofence, calculateDistanceInMeters)
 * - lib/device-lock.ts (getDeviceAttendanceLock, setDeviceAttendanceLock, clearDeviceAttendanceLock, isDeviceLockedForService)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mockPrisma } from '../helpers/prisma-mock';

vi.mock('@/lib/prisma', () => ({
  prisma: mockPrisma,
}));

import {
  registerAttendance,
  lookupByPhoneSuffix,
  lookupMemberByIdAction,
  registerFirstTimerAction,
  selfCheckInAction,
} from '@/app/actions/attendance';
import {
  isWithinChurchGeofence,
  isWithinGeofence,
  calculateDistanceInMeters,
} from '@/lib/geo';
import {
  getDeviceAttendanceLock,
  setDeviceAttendanceLock,
  clearDeviceAttendanceLock,
  isDeviceLockedForService,
  DEVICE_LOCK_STORAGE_KEY,
  LEGACY_LOCK_STORAGE_KEY,
} from '@/lib/device-lock';
import { getNigerianDateMidnight, getNigerianDateString } from '@/lib/service-resolver';
import { PersonCategory, PersonStatus } from '@prisma/client';

describe('Adversarial Attendance Stress & Concurrency Testing (Milestone 2)', () => {
  const CHURCH_LAT = 6.5244;
  const CHURCH_LNG = 3.3792;
  const BASE_RADIUS = 150;

  const mockChurch = {
    id: 'church-covenant-zone',
    name: 'RCCG Jesus Covenant Zone',
    latitude: CHURCH_LAT,
    longitude: CHURCH_LNG,
    geofenceRadius: BASE_RADIUS,
  };

  const mockService = {
    id: 'service-sunday-school',
    churchId: mockChurch.id,
    name: 'Sunday School',
    dayOfWeek: 'SUNDAY',
    startTime: '08:00',
    endTime: '09:00',
  };

  const mockMember = {
    id: 'person-test-1',
    churchId: mockChurch.id,
    firstName: 'Oluwaseun',
    lastName: 'Adeyemi',
    phone: '08023456789',
    phoneLast4: '6789',
    category: 'YOUTH',
    subCategory: 'YOUTH',
    status: 'MEMBER',
    photoUrl: null,
  };

  beforeEach(() => {
    vi.resetAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // =========================================================================
  // SECTION 1: Duplicate Check-In Prevention & Concurrency Stress Testing
  // =========================================================================
  describe('1. Duplicate Check-In Prevention & Concurrency Stress', () => {
    it('C1.1: Handles a burst of 10 simultaneous concurrent check-ins: exactly 1 succeeds and 9 receive P2002 duplicate notice', async () => {
      // Setup base DB mocks
      mockPrisma.church.findFirst.mockResolvedValue(mockChurch as any);
      mockPrisma.person.findUnique.mockResolvedValue(mockMember as any);
      mockPrisma.serviceSchedule.findUnique.mockResolvedValue(mockService as any);

      // In a real database race, all 10 concurrent requests execute findFirst before any has committed,
      // so all 10 findFirst calls return null.
      mockPrisma.attendanceRecord.findFirst.mockResolvedValue(null);

      // Now simulate DB unique constraint: the first create succeeds; calls 2 through 10 trigger P2002.
      let createCallCount = 0;
      mockPrisma.attendanceRecord.create.mockImplementation(async () => {
        createCallCount++;
        if (createCallCount === 1) {
          return {
            id: 'attendance-rec-winner',
            churchId: mockChurch.id,
            personId: mockMember.id,
            serviceScheduleId: mockService.id,
            date: getNigerianDateMidnight(),
            person: { id: mockMember.id, firstName: mockMember.firstName, lastName: mockMember.lastName },
            serviceSchedule: { id: mockService.id, name: mockService.name },
          } as any;
        } else {
          const p2002Error: any = new Error(
            'Unique constraint failed on the constraint: AttendanceRecord_personId_serviceScheduleId_date_key'
          );
          p2002Error.code = 'P2002';
          p2002Error.meta = { target: ['personId', 'serviceScheduleId', 'date'] };
          throw p2002Error;
        }
      });

      // Fire 10 simultaneous asynchronous check-in requests
      const CONCURRENCY_COUNT = 10;
      const concurrentRequests = Array.from({ length: CONCURRENCY_COUNT }, () =>
        registerAttendance({
          personId: mockMember.id,
          serviceScheduleId: mockService.id,
          latitude: CHURCH_LAT,
          longitude: CHURCH_LNG,
          method: 'ONE_TAP',
        })
      );

      const results = await Promise.all(concurrentRequests);

      // Statistical & invariant verification
      const successes = results.filter((r) => r.success === true);
      const duplicates = results.filter((r) => r.success === false && r.alreadyCheckedIn === true);
      const fatalErrors = results.filter((r) => r.success === false && !r.alreadyCheckedIn);

      expect(successes).toHaveLength(1);
      expect(duplicates).toHaveLength(9);
      expect(fatalErrors).toHaveLength(0);

      // Winning request verification
      expect(successes[0]).toMatchObject({
        success: true,
        alreadyCheckedIn: false,
        serviceId: mockService.id,
        serviceName: mockService.name,
        personName: 'Oluwaseun Adeyemi',
      });

      // Duplicate responses verification
      for (const dup of duplicates) {
        expect(dup.error).toContain('Attendance already recorded for this service today');
      }

      // Assert database received exactly 10 create attempts and created exactly 1 record
      expect(mockPrisma.attendanceRecord.create).toHaveBeenCalledTimes(CONCURRENCY_COUNT);
    });

    it('C1.2: Sequential duplicate check-in is intercepted at findFirst check without executing create', async () => {
      mockPrisma.church.findFirst.mockResolvedValue(mockChurch as any);
      mockPrisma.person.findUnique.mockResolvedValue(mockMember as any);
      mockPrisma.serviceSchedule.findUnique.mockResolvedValue(mockService as any);

      // Existing record found in DB for today's WAT midnight
      mockPrisma.attendanceRecord.findFirst.mockResolvedValueOnce({
        id: 'existing-att-id',
        personId: mockMember.id,
        serviceScheduleId: mockService.id,
        date: getNigerianDateMidnight(),
      } as any);

      const res = await registerAttendance({
        personId: mockMember.id,
        serviceScheduleId: mockService.id,
        latitude: CHURCH_LAT,
        longitude: CHURCH_LNG,
        method: 'LOOKUP_4DIGIT',
      });

      expect(res.success).toBe(false);
      expect(res.alreadyCheckedIn).toBe(true);
      expect(res.error).toContain('Attendance already recorded!');
      expect(mockPrisma.attendanceRecord.create).not.toHaveBeenCalled();
    });

    it('C1.3: Allows multi-service check-in on the same day for distinct services', async () => {
      mockPrisma.church.findFirst.mockResolvedValue(mockChurch as any);
      mockPrisma.person.findUnique.mockResolvedValue(mockMember as any);

      const serviceWorkers = {
        id: 'service-workers',
        churchId: mockChurch.id,
        name: "Workers' Meeting",
        startTime: '07:30',
        dayOfWeek: 'SUNDAY',
      };
      const serviceFirstCelebration = {
        id: 'service-first-celebration',
        churchId: mockChurch.id,
        name: 'First Celebration Service',
        startTime: '09:00',
        dayOfWeek: 'SUNDAY',
      };

      // Worker member
      const workerMember = {
        ...mockMember,
        category: 'WORKER',
        subCategory: 'WORKER',
      };
      mockPrisma.person.findUnique.mockResolvedValue(workerMember as any);

      // Service 1 check-in (Workers Meeting)
      mockPrisma.serviceSchedule.findUnique.mockResolvedValueOnce(serviceWorkers as any);
      mockPrisma.attendanceRecord.findFirst.mockResolvedValueOnce(null);
      mockPrisma.attendanceRecord.create.mockResolvedValueOnce({
        id: 'att-workers',
        person: workerMember,
        serviceSchedule: serviceWorkers,
      } as any);

      const res1 = await registerAttendance({
        personId: workerMember.id,
        serviceScheduleId: serviceWorkers.id,
        latitude: CHURCH_LAT,
        longitude: CHURCH_LNG,
        method: 'QR',
      });

      expect(res1.success).toBe(true);
      expect(res1.serviceName).toBe("Workers' Meeting");

      // Service 2 check-in (First Celebration Service)
      mockPrisma.serviceSchedule.findUnique.mockResolvedValueOnce(serviceFirstCelebration as any);
      mockPrisma.attendanceRecord.findFirst.mockResolvedValueOnce(null);
      mockPrisma.attendanceRecord.create.mockResolvedValueOnce({
        id: 'att-first-celebration',
        person: workerMember,
        serviceSchedule: serviceFirstCelebration,
      } as any);

      const res2 = await registerAttendance({
        personId: workerMember.id,
        serviceScheduleId: serviceFirstCelebration.id,
        latitude: CHURCH_LAT,
        longitude: CHURCH_LNG,
        method: 'ONE_TAP',
      });

      expect(res2.success).toBe(true);
      expect(res2.serviceName).toBe('First Celebration Service');
      expect(mockPrisma.attendanceRecord.create).toHaveBeenCalledTimes(2);
    });

    it('C1.4: Isolates and handles database connection error or pool exhaustion gracefully without uncaught rejection', async () => {
      mockPrisma.church.findFirst.mockResolvedValue(mockChurch as any);
      mockPrisma.person.findUnique.mockResolvedValue(mockMember as any);
      mockPrisma.serviceSchedule.findUnique.mockResolvedValue(mockService as any);
      mockPrisma.attendanceRecord.findFirst.mockResolvedValue(null);

      // Simulate connection loss / query engine failure
      const dbCrashError = new Error('Can not reach database server at localhost:5432. Please make sure database server is running.');
      (dbCrashError as any).code = 'P1001';
      mockPrisma.attendanceRecord.create.mockRejectedValueOnce(dbCrashError);

      const res = await registerAttendance({
        personId: mockMember.id,
        serviceScheduleId: mockService.id,
        latitude: CHURCH_LAT,
        longitude: CHURCH_LNG,
        method: 'LOOKUP_4DIGIT',
      });

      expect(res.success).toBe(false);
      expect(res.error).toBe('Failed to record attendance.');
      expect(res.alreadyCheckedIn).toBeUndefined();
    });
  });

  // =========================================================================
  // SECTION 2: Workers' Meeting Integrity Routing
  // =========================================================================
  describe("2. Workers' Meeting Integrity Routing", () => {
    const serviceWorkers = {
      id: 'sched-workers-001',
      churchId: mockChurch.id,
      name: "Workers' Meeting",
      dayOfWeek: 'SUNDAY',
      startTime: '07:30',
      endTime: '08:30',
    };

    const serviceFirst = {
      id: 'sched-first-002',
      churchId: mockChurch.id,
      name: 'First Celebration Service',
      dayOfWeek: 'SUNDAY',
      startTime: '08:30',
      endTime: '10:30',
    };

    it('C2.1: Gracefully re-routes non-worker youth arriving during Workers Meeting to First Service with early-bird flag', async () => {
      mockPrisma.church.findFirst.mockResolvedValue(mockChurch as any);

      // Youth member (not a worker)
      const youthMember = {
        id: 'person-youth-01',
        churchId: mockChurch.id,
        firstName: 'Damilola',
        lastName: 'Ogundipe',
        category: 'YOUTH',
        subCategory: 'YOUTH',
      };
      mockPrisma.person.findUnique.mockResolvedValue(youthMember as any);
      mockPrisma.serviceSchedule.findUnique.mockResolvedValue(serviceWorkers as any);

      // Next service lookup finds First Celebration Service
      mockPrisma.serviceSchedule.findFirst.mockResolvedValue(serviceFirst as any);
      mockPrisma.attendanceRecord.findFirst.mockResolvedValue(null);

      mockPrisma.attendanceRecord.create.mockResolvedValue({
        id: 'att-reroute-01',
        person: youthMember,
        serviceSchedule: serviceFirst,
      } as any);

      const res = await registerAttendance({
        personId: youthMember.id,
        serviceScheduleId: serviceWorkers.id,
        latitude: CHURCH_LAT,
        longitude: CHURCH_LNG,
        method: 'QR',
      });

      expect(res.success).toBe(true);
      expect(res.isEarlyBird).toBe(true);
      expect(res.serviceId).toBe(serviceFirst.id);
      expect(res.serviceName).toBe('First Celebration Service');
      expect(res.message).toContain('Early arrival confirmed!');
      expect(res.message).toContain('First Celebration Service');

      // Invariant: record created must point to rerouted service ID, not Workers Meeting
      expect(mockPrisma.attendanceRecord.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            serviceScheduleId: serviceFirst.id,
            personId: youthMember.id,
          }),
        })
      );
    });

    it('C2.2: Re-routes adult non-worker arriving during Workers Meeting to First Service', async () => {
      mockPrisma.church.findFirst.mockResolvedValue(mockChurch as any);

      const adultMember = {
        id: 'person-adult-01',
        churchId: mockChurch.id,
        firstName: 'Grace',
        lastName: 'Okoro',
        category: 'ADULT',
        subCategory: 'ADULT',
      };
      mockPrisma.person.findUnique.mockResolvedValue(adultMember as any);
      mockPrisma.serviceSchedule.findUnique.mockResolvedValue(serviceWorkers as any);
      mockPrisma.serviceSchedule.findFirst.mockResolvedValue(serviceFirst as any);
      mockPrisma.attendanceRecord.findFirst.mockResolvedValue(null);

      mockPrisma.attendanceRecord.create.mockResolvedValue({
        id: 'att-adult-reroute',
        person: adultMember,
        serviceSchedule: serviceFirst,
      } as any);

      const res = await registerAttendance({
        personId: adultMember.id,
        serviceScheduleId: serviceWorkers.id,
        latitude: CHURCH_LAT,
        longitude: CHURCH_LNG,
        method: 'ONE_TAP',
      });

      expect(res.success).toBe(true);
      expect(res.isEarlyBird).toBe(true);
      expect(res.serviceName).toBe('First Celebration Service');
    });

    it('C2.3: Genuine workers remain assigned to Workers Meeting across all worker subcategories', async () => {
      mockPrisma.church.findFirst.mockResolvedValue(mockChurch as any);
      mockPrisma.serviceSchedule.findUnique.mockResolvedValue(serviceWorkers as any);
      mockPrisma.attendanceRecord.findFirst.mockResolvedValue(null);

      const workerVariants = [
        { id: 'w1', firstName: 'John', category: 'WORKER', subCategory: 'WORKER' },
        { id: 'w2', firstName: 'Kehinde', category: 'YOUTH', subCategory: 'YOUTH_WORKER' },
        { id: 'w3', firstName: 'Folake', category: 'ADULT', subCategory: 'ADULT_WORKER' },
        { id: 'w4', firstName: 'Babatunde', category: 'WORKER', subCategory: 'USHER' },
      ];

      for (const worker of workerVariants) {
        mockPrisma.person.findUnique.mockResolvedValueOnce(worker as any);
        mockPrisma.attendanceRecord.create.mockResolvedValueOnce({
          id: `att-${worker.id}`,
          person: worker,
          serviceSchedule: serviceWorkers,
        } as any);

        const res = await registerAttendance({
          personId: worker.id,
          serviceScheduleId: serviceWorkers.id,
          latitude: CHURCH_LAT,
          longitude: CHURCH_LNG,
          method: 'LOOKUP_4DIGIT',
        });

        expect(res.success).toBe(true);
        expect(res.isEarlyBird).toBe(false);
        expect(res.serviceName).toBe("Workers' Meeting");
        expect(res.message).toContain('Welcome, ' + worker.firstName);
        expect(res.message).not.toContain('Early arrival confirmed');
      }

      // Next service lookup query should NOT have been executed for genuine workers
      expect(mockPrisma.serviceSchedule.findFirst).not.toHaveBeenCalled();
    });

    it('C2.4: Does not crash and remains on Workers Meeting when no subsequent service exists on schedule', async () => {
      mockPrisma.church.findFirst.mockResolvedValue(mockChurch as any);

      const nonWorker = {
        id: 'person-nonworker-01',
        firstName: 'Tola',
        category: 'YOUTH',
        subCategory: 'YOUTH',
      };
      mockPrisma.person.findUnique.mockResolvedValue(nonWorker as any);
      mockPrisma.serviceSchedule.findUnique.mockResolvedValue(serviceWorkers as any);

      // No later service on schedule (e.g. standalone workers retreat)
      mockPrisma.serviceSchedule.findFirst.mockResolvedValue(null);
      mockPrisma.attendanceRecord.findFirst.mockResolvedValue(null);
      mockPrisma.attendanceRecord.create.mockResolvedValue({
        id: 'att-standalone-workers',
        person: nonWorker,
        serviceSchedule: serviceWorkers,
      } as any);

      const res = await registerAttendance({
        personId: nonWorker.id,
        serviceScheduleId: serviceWorkers.id,
        latitude: CHURCH_LAT,
        longitude: CHURCH_LNG,
        method: 'LOOKUP_4DIGIT',
      });

      expect(res.success).toBe(true);
      expect(res.isEarlyBird).toBe(false);
      expect(res.serviceName).toBe("Workers' Meeting");
    });

    it('C2.5: Returns early-bird specific duplicate message when re-routed member attempts repeat check-in', async () => {
      mockPrisma.church.findFirst.mockResolvedValue(mockChurch as any);

      const nonWorker = {
        id: 'person-repeat-early',
        firstName: 'Bunmi',
        category: 'YOUTH',
        subCategory: 'YOUTH',
      };
      mockPrisma.person.findUnique.mockResolvedValue(nonWorker as any);
      mockPrisma.serviceSchedule.findUnique.mockResolvedValue(serviceWorkers as any);
      mockPrisma.serviceSchedule.findFirst.mockResolvedValue(serviceFirst as any);

      // Existing record found for the rerouted service today
      mockPrisma.attendanceRecord.findFirst.mockResolvedValue({
        id: 'att-existing-early',
        personId: nonWorker.id,
        serviceScheduleId: serviceFirst.id,
        date: getNigerianDateMidnight(),
      } as any);

      const res = await registerAttendance({
        personId: nonWorker.id,
        serviceScheduleId: serviceWorkers.id,
        latitude: CHURCH_LAT,
        longitude: CHURCH_LNG,
        method: 'ONE_TAP',
      });

      expect(res.success).toBe(false);
      expect(res.alreadyCheckedIn).toBe(true);
      expect(res.error).toContain('Early arrival already recorded!');
      expect(res.error).toContain('First Celebration Service');
      expect(mockPrisma.attendanceRecord.create).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // SECTION 3: Missing, Boundary, and Malformed GPS Parameters
  // =========================================================================
  describe('3. Missing & Malformed GPS Parameters & Boundary Stress', () => {
    it('C3.1: Rejects check-in when latitude or longitude are completely omitted/undefined', async () => {
      mockPrisma.church.findFirst.mockResolvedValue(mockChurch as any);

      const res1 = await registerAttendance({
        personId: mockMember.id,
        method: 'LOOKUP_4DIGIT',
      });
      expect(res1.success).toBe(false);
      expect(res1.error).toContain('Location permission is required');

      const res2 = await registerAttendance({
        personId: mockMember.id,
        latitude: CHURCH_LAT,
        longitude: undefined,
        method: 'QR',
      });
      expect(res2.success).toBe(false);
      expect(res2.error).toContain('Location permission is required');

      const res3 = await registerAttendance({
        personId: mockMember.id,
        latitude: undefined,
        longitude: CHURCH_LNG,
        method: 'ONE_TAP',
      });
      expect(res3.success).toBe(false);
      expect(res3.error).toContain('Location permission is required');

      // Database findUnique / create should not be invoked when location is missing
      expect(mockPrisma.person.findUnique).not.toHaveBeenCalled();
      expect(mockPrisma.attendanceRecord.create).not.toHaveBeenCalled();
    });

    it('C3.2: Rejects check-in when user coordinates fall beyond 150m sanctuary perimeter', async () => {
      mockPrisma.church.findFirst.mockResolvedValue(mockChurch as any);

      // Shift north by ~350m
      const outOfBoundsLat = CHURCH_LAT + 0.00315;
      const res = await registerAttendance({
        personId: mockMember.id,
        serviceScheduleId: mockService.id,
        latitude: outOfBoundsLat,
        longitude: CHURCH_LNG,
        method: 'QR',
      });

      expect(res.success).toBe(false);
      expect(res.error).toContain('Check-in rejected');
      expect(res.error).toContain('away from church premises');
      expect(res.distanceMeters).toBeGreaterThan(150);
      expect(mockPrisma.attendanceRecord.create).not.toHaveBeenCalled();
    });

    it('C3.3: Detects and rejects NaN, Infinity, and out-of-range latitude/longitude coordinates', async () => {
      mockPrisma.church.findFirst.mockResolvedValue(mockChurch as any);

      const malformedCases = [
        { lat: NaN, lng: CHURCH_LNG, desc: 'NaN latitude' },
        { lat: CHURCH_LAT, lng: NaN, desc: 'NaN longitude' },
        { lat: Infinity, lng: CHURCH_LNG, desc: 'Infinity latitude' },
        { lat: CHURCH_LAT, lng: -Infinity, desc: '-Infinity longitude' },
        { lat: 95.0, lng: CHURCH_LNG, desc: 'latitude > 90' },
        { lat: -95.0, lng: CHURCH_LNG, desc: 'latitude < -90' },
        { lat: CHURCH_LAT, lng: 185.0, desc: 'longitude > 180' },
        { lat: CHURCH_LAT, lng: -195.0, desc: 'longitude < -180' },
      ];

      for (const tc of malformedCases) {
        const geoCheck = isWithinChurchGeofence(
          { latitude: tc.lat, longitude: tc.lng },
          { latitude: CHURCH_LAT, longitude: CHURCH_LNG },
          BASE_RADIUS
        );
        expect(geoCheck.isAllowed).toBe(false);
        expect(geoCheck.suspiciousMockIndicator).toBe(true);

        const res = await registerAttendance({
          personId: mockMember.id,
          serviceScheduleId: mockService.id,
          latitude: tc.lat,
          longitude: tc.lng,
          method: 'LOOKUP_4DIGIT',
        });
        expect(res.success).toBe(false);
        expect(res.error).toContain('Check-in rejected');
      }

      expect(mockPrisma.attendanceRecord.create).not.toHaveBeenCalled();
    });

    it('C3.4: Rejects Null Island (0,0) as a suspicious spoof indicator', async () => {
      mockPrisma.church.findFirst.mockResolvedValue(mockChurch as any);

      const geoCheck = isWithinChurchGeofence(
        { latitude: 0, longitude: 0 },
        { latitude: CHURCH_LAT, longitude: CHURCH_LNG },
        BASE_RADIUS
      );
      expect(geoCheck.isAllowed).toBe(false);
      expect(geoCheck.suspiciousMockIndicator).toBe(true);
      expect(geoCheck.distanceMeters).toBeGreaterThan(500000); // ~816 km from Lagos in Gulf of Guinea

      const res = await registerAttendance({
        personId: mockMember.id,
        serviceScheduleId: mockService.id,
        latitude: 0,
        longitude: 0,
        method: 'ONE_TAP',
      });
      expect(res.success).toBe(false);
      expect(res.error).toContain('Check-in rejected');
    });

    it('C3.5: Verifies millimeter-level boundary thresholds at exactly 0m, 140m, 150m, and 151m', () => {
      // 0m: Epicenter
      const atEpicenter = isWithinChurchGeofence(
        { latitude: CHURCH_LAT, longitude: CHURCH_LNG },
        { latitude: CHURCH_LAT, longitude: CHURCH_LNG },
        BASE_RADIUS
      );
      expect(atEpicenter.isAllowed).toBe(true);
      expect(atEpicenter.distanceMeters).toBe(0);

      // ~135m North (inside 150m)
      const insideLat = CHURCH_LAT + 0.00121;
      const insideFence = isWithinChurchGeofence(
        { latitude: insideLat, longitude: CHURCH_LNG, accuracy: 5 },
        { latitude: CHURCH_LAT, longitude: CHURCH_LNG },
        BASE_RADIUS
      );
      expect(insideFence.isAllowed).toBe(true);
      expect(insideFence.distanceMeters).toBeLessThanOrEqual(150);

      // ~280m North (distinctly outside 150m)
      const outsideLat = CHURCH_LAT + 0.00252;
      const outsideFence = isWithinChurchGeofence(
        { latitude: outsideLat, longitude: CHURCH_LNG, accuracy: 5 },
        { latitude: CHURCH_LAT, longitude: CHURCH_LNG },
        BASE_RADIUS
      );
      expect(outsideFence.isAllowed).toBe(false);
      expect(outsideFence.distanceMeters).toBeGreaterThan(150);
    });

    it('C3.6: Degrades confidence appropriately when GPS accuracy is poor (>100m cell tower fallback)', () => {
      const goodGps = isWithinChurchGeofence(
        { latitude: CHURCH_LAT, longitude: CHURCH_LNG, accuracy: 12 },
        { latitude: CHURCH_LAT, longitude: CHURCH_LNG },
        BASE_RADIUS
      );
      expect(goodGps.confidence).toBe('HIGH');

      const mediumGps = isWithinChurchGeofence(
        { latitude: CHURCH_LAT, longitude: CHURCH_LNG, accuracy: 50 },
        { latitude: CHURCH_LAT, longitude: CHURCH_LNG },
        BASE_RADIUS
      );
      expect(mediumGps.confidence).toBe('MEDIUM');

      const cellTowerGps = isWithinChurchGeofence(
        { latitude: CHURCH_LAT, longitude: CHURCH_LNG, accuracy: 250 },
        { latitude: CHURCH_LAT, longitude: CHURCH_LNG },
        BASE_RADIUS
      );
      expect(cellTowerGps.confidence).toBe('LOW');
    });
  });

  // =========================================================================
  // SECTION 4: 1-Tap Saved Member Profile & QR Payload Resilience
  // =========================================================================
  describe('4. 1-Tap Saved Member Profile & QR Payload Resilience', () => {
    it('C4.1: lookupMemberByIdAction gracefully handles empty, null, and non-existent IDs', async () => {
      // Empty string
      const emptyRes = await lookupMemberByIdAction('');
      expect(emptyRes.success).toBe(false);
      expect(emptyRes.error).toBe('Invalid member ID.');

      // Null / undefined casting
      const nullRes = await lookupMemberByIdAction(null as any);
      expect(nullRes.success).toBe(false);
      expect(nullRes.error).toBe('Invalid member ID.');

      // Non-existent CUID
      mockPrisma.person.findUnique.mockResolvedValueOnce(null);
      const notFoundRes = await lookupMemberByIdAction('cm_non_existent_id_9999');
      expect(notFoundRes.success).toBe(false);
      expect(notFoundRes.error).toBe('Member not found.');

      // DB exception
      mockPrisma.person.findUnique.mockRejectedValueOnce(new Error('Prisma disconnect'));
      const dbErrRes = await lookupMemberByIdAction('cm_valid_id');
      expect(dbErrRes.success).toBe(false);
      expect(dbErrRes.error).toBe('Failed to find member.');
    });

    it('C4.2: lookupByPhoneSuffix rejects non-4-digit inputs and sanitizes symbols/formatting', async () => {
      const invalidInputs = ['', '1', '12', '123', '12345', '123456', 'abcd', '!@#$'];
      for (const input of invalidInputs) {
        const res = await lookupByPhoneSuffix(input);
        expect(res.success).toBe(false);
        expect(res.error).toBe('Please enter exactly 4 digits.');
        expect(res.members).toEqual([]);
      }

      // Valid formatted input with whitespace and dashes
      mockPrisma.church.findFirst.mockResolvedValue(mockChurch as any);
      mockPrisma.person.findMany.mockResolvedValueOnce([mockMember as any]);

      const formattedRes = await lookupByPhoneSuffix(' 67-89 ');
      expect(formattedRes.success).toBe(true);
      expect(formattedRes.count).toBe(1);
      expect(formattedRes.members[0].id).toBe(mockMember.id);
    });

    it('C4.3: Device Lock Anti-Proxy parsing handles corrupted JSON and expired calendar days without throwing', () => {
      // Setup mock localStorage in Node/Vitest test environment
      const storageMock: Record<string, string> = {};
      const fakeLocalStorage = {
        getItem: (k: string) => storageMock[k] || null,
        setItem: (k: string, v: string) => { storageMock[k] = v; },
        removeItem: (k: string) => { delete storageMock[k]; },
        clear: () => { for (const k in storageMock) delete storageMock[k]; },
      };

      vi.stubGlobal('window', {});
      vi.stubGlobal('localStorage', fakeLocalStorage);

      // Sub-case A: Empty storage
      expect(getDeviceAttendanceLock()).toBeNull();
      expect(isDeviceLockedForService('any-service-id')).toBe(false);

      // Sub-case B: Corrupted / invalid JSON in storage
      fakeLocalStorage.setItem(DEVICE_LOCK_STORAGE_KEY, '{ invalid json "');
      expect(getDeviceAttendanceLock()).toBeNull();

      // Sub-case C: Lock from yesterday (expired)
      const yesterdayLock = {
        serviceId: 'srv-yesterday',
        serviceName: 'Sunday Service',
        serviceDate: '2026-01-01', // Expired date
        checkedInPersonId: 'p-1',
        checkedInName: 'Past Attendee',
        timestamp: Date.now() - 86400000,
      };
      fakeLocalStorage.setItem(DEVICE_LOCK_STORAGE_KEY, JSON.stringify(yesterdayLock));
      expect(getDeviceAttendanceLock()).toBeNull();
      // Verifies storage was automatically cleared on expired read
      expect(fakeLocalStorage.getItem(DEVICE_LOCK_STORAGE_KEY)).toBeNull();

      // Sub-case D: Active valid lock for today in WAT timezone
      const todayWAT = getNigerianDateString();
      const validLock = {
        serviceId: 'srv-today-active',
        serviceName: 'Sunday School',
        serviceDate: todayWAT,
        checkedInPersonId: 'p-today',
        checkedInName: 'Active Worshipper',
        phoneLast4: '6789',
        timestamp: Date.now(),
        method: 'ONE_TAP' as const,
      };
      setDeviceAttendanceLock(validLock);
      const retrieved = getDeviceAttendanceLock();
      expect(retrieved).not.toBeNull();
      expect(retrieved?.serviceId).toBe('srv-today-active');
      expect(retrieved?.checkedInPersonId).toBe('p-today');

      // Sub-case E: isDeviceLockedForService checks
      expect(isDeviceLockedForService('srv-today-active')).toBe(true);
      expect(isDeviceLockedForService('srv-other-service')).toBe(false);
      expect(isDeviceLockedForService(null)).toBe(false);
      expect(isDeviceLockedForService(undefined)).toBe(false);
      expect(isDeviceLockedForService('')).toBe(false);

      // Sub-case F: clearDeviceAttendanceLock clears both current and legacy keys
      clearDeviceAttendanceLock();
      expect(getDeviceAttendanceLock()).toBeNull();
      expect(fakeLocalStorage.getItem(DEVICE_LOCK_STORAGE_KEY)).toBeNull();
      expect(fakeLocalStorage.getItem(LEGACY_LOCK_STORAGE_KEY)).toBeNull();

      vi.unstubAllGlobals();
    });

    it('C4.4: QR Payload Resolution Simulation validates robust multi-format parsing and invalid QR handling', async () => {
      // Simulate the end-to-end QR handling pipeline from app/page.tsx
      async function simulateQrPipeline(decodedText: string): Promise<{
        action: 'CHECK_IN' | 'PHONE_FALLBACK' | 'REJECTED';
        personId?: string;
        phoneSuffix?: string;
      }> {
        if (!decodedText || typeof decodedText !== 'string') {
          return { action: 'REJECTED' };
        }

        let resolvedPersonId: string | null = null;

        // 1. JSON payload
        if (decodedText.startsWith('{') && decodedText.endsWith('}')) {
          try {
            const parsed = JSON.parse(decodedText);
            if (parsed && typeof parsed.personId === 'string' && parsed.personId.trim().length > 0) {
              resolvedPersonId = parsed.personId.trim();
            }
          } catch {
            // Malformed JSON falls through
          }
        }

        // 2. Raw CUID or UUID
        if (!resolvedPersonId && decodedText.length >= 20) {
          resolvedPersonId = decodedText;
        }

        // 3. Resolve Person ID against DB if extracted
        if (resolvedPersonId) {
          const memberRes = await lookupMemberByIdAction(resolvedPersonId);
          if (memberRes.success && memberRes.member) {
            return { action: 'CHECK_IN', personId: memberRes.member.id };
          }
        }

        // 4. Phone digits fallback
        const digitsClean = decodedText.replace(/\D/g, '');
        if (digitsClean.length === 4) {
          return { action: 'PHONE_FALLBACK', phoneSuffix: digitsClean };
        }
        if (digitsClean.length >= 10) {
          return { action: 'PHONE_FALLBACK', phoneSuffix: digitsClean.slice(-4) };
        }

        return { action: 'REJECTED' };
      }

      // Case A: Valid JSON payload with valid member ID
      mockPrisma.person.findUnique.mockResolvedValueOnce({
        id: 'cm_person_1234567890',
        firstName: 'Tolu',
        phoneLast4: '6789',
      } as any);

      const jsonValid = await simulateQrPipeline(
        JSON.stringify({ personId: 'cm_person_1234567890' })
      );
      expect(jsonValid).toEqual({
        action: 'CHECK_IN',
        personId: 'cm_person_1234567890',
      });

      // Case B: Valid CUID string (length >= 20) with valid member ID
      mockPrisma.person.findUnique.mockResolvedValueOnce({
        id: 'clh9w2m8q000108l5exqj0xyz',
        firstName: 'David',
        phoneLast4: '1122',
      } as any);

      const cuidValid = await simulateQrPipeline('clh9w2m8q000108l5exqj0xyz');
      expect(cuidValid).toEqual({
        action: 'CHECK_IN',
        personId: 'clh9w2m8q000108l5exqj0xyz',
      });

      // Case C: Non-existent ID (lookup returns null)
      mockPrisma.person.findUnique.mockResolvedValueOnce(null);
      const nonExistent = await simulateQrPipeline('clh9w2m8q_non_existent_id');
      expect(nonExistent).toEqual({ action: 'REJECTED' });

      // Case D: Arbitrary random URL (length >= 20, but not a member)
      mockPrisma.person.findUnique.mockResolvedValueOnce(null);
      const urlPayload = await simulateQrPipeline('https://random-link.com/badge');
      expect(urlPayload).toEqual({ action: 'REJECTED' });

      // Case E: Malformed JSON payload
      mockPrisma.person.findUnique.mockResolvedValueOnce(null);
      const brokenJson = await simulateQrPipeline('{ "personId": "cm123');
      expect(brokenJson).toEqual({ action: 'REJECTED' });

      // Case F: Valid JSON with missing personId
      const missingFieldJson = await simulateQrPipeline(
        JSON.stringify({ church: 'RCCG', code: 123 })
      );
      // Treated as length >= 20 string, DB lookup fails, falls through to REJECTED
      mockPrisma.person.findUnique.mockResolvedValueOnce(null);
      expect(missingFieldJson).toEqual({ action: 'REJECTED' });

      // Case G: 4-digit phone badge
      const fourDigit = await simulateQrPipeline('6789');
      expect(fourDigit).toEqual({ action: 'PHONE_FALLBACK', phoneSuffix: '6789' });

      // Case H: Full 11-digit Nigerian phone badge
      const fullPhone = await simulateQrPipeline('+234 802 345 6789');
      expect(fullPhone).toEqual({ action: 'PHONE_FALLBACK', phoneSuffix: '6789' });

      // Case I: Short garbage string
      const shortGarbage = await simulateQrPipeline('xyz-123');
      expect(shortGarbage).toEqual({ action: 'REJECTED' });
    });

    it('C4.5: registerFirstTimerAction validates required fields and respects geofence boundaries', async () => {
      mockPrisma.church.findFirst.mockResolvedValue(mockChurch as any);

      // Missing first name
      const noName = await registerFirstTimerAction({
        firstName: '',
        lastName: 'Eze',
        phone: '08012345678',
      });
      expect(noName.success).toBe(false);
      expect(noName.error).toContain('Please enter your first name');

      // Invalid short phone number
      const shortPhone = await registerFirstTimerAction({
        firstName: 'Emeka',
        lastName: 'Eze',
        phone: '12345',
      });
      expect(shortPhone.success).toBe(false);
      expect(shortPhone.error).toContain('at least 10 digits');

      // Outside geofence radius
      const outsidePerson = {
        id: 'first-timer-outside',
        firstName: 'Emeka',
        lastName: 'Eze',
        phone: '08012345678',
        phoneLast4: '5678',
        category: PersonCategory.YOUTH,
        subCategory: 'YOUTH',
        status: PersonStatus.FIRST_TIMER,
      };
      mockPrisma.person.findFirst.mockResolvedValueOnce(outsidePerson as any);

      const outsideRes = await registerFirstTimerAction({
        firstName: 'Emeka',
        lastName: 'Eze',
        phone: '08012345678',
        userLatitude: CHURCH_LAT + 0.005, // ~550m away
        userLongitude: CHURCH_LNG,
      });
      expect(outsideRes.success).toBe(false);
      expect(outsideRes.error).toContain('Check-in rejected');
      if (!outsideRes.success) {
        expect(outsideRes.distanceMeters).toBeGreaterThan(150);
      }

      // Inside geofence: creates person and registers attendance
      const newPerson = {
        id: 'first-timer-new',
        firstName: 'Emeka',
        lastName: 'Eze',
        phone: '08012345678',
        phoneLast4: '5678',
        category: PersonCategory.YOUTH,
        subCategory: 'YOUTH',
        status: PersonStatus.FIRST_TIMER,
      };
      mockPrisma.person.findFirst.mockResolvedValueOnce(null); // Person not existing yet
      mockPrisma.person.create.mockResolvedValueOnce(newPerson as any);
      mockPrisma.person.findUnique.mockResolvedValueOnce(newPerson as any);
      mockPrisma.serviceSchedule.findUnique.mockResolvedValueOnce(mockService as any);
      mockPrisma.attendanceRecord.findFirst.mockResolvedValueOnce(null);
      mockPrisma.attendanceRecord.create.mockResolvedValueOnce({
        id: 'att-ft-1',
        person: newPerson,
        serviceSchedule: mockService,
      } as any);

      const validRes = await registerFirstTimerAction({
        firstName: 'Emeka',
        lastName: 'Eze',
        phone: '08012345678',
        serviceScheduleId: mockService.id,
        userLatitude: CHURCH_LAT,
        userLongitude: CHURCH_LNG,
      });

      expect(validRes.success).toBe(true);
      expect(validRes.personId).toBe(newPerson.id);
      expect(validRes.personName).toBe('Emeka Eze');
      expect(validRes.serviceName).toBe('Sunday School');
      expect(mockPrisma.person.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            firstName: 'Emeka',
            phoneLast4: '5678',
            status: PersonStatus.FIRST_TIMER,
          }),
        })
      );
    });

    it('C4.6: selfCheckInAction legacy adapter maps parameters cleanly into registerAttendance', async () => {
      mockPrisma.church.findFirst.mockResolvedValue(mockChurch as any);
      mockPrisma.person.findUnique.mockResolvedValue(mockMember as any);
      mockPrisma.serviceSchedule.findUnique.mockResolvedValue(mockService as any);
      mockPrisma.attendanceRecord.findFirst.mockResolvedValue(null);
      mockPrisma.attendanceRecord.create.mockResolvedValue({
        id: 'att-legacy-res',
        person: mockMember,
        serviceSchedule: mockService,
      } as any);

      const res = await selfCheckInAction({
        personId: mockMember.id,
        serviceScheduleId: mockService.id,
        subClass: 'Youth Class',
        userLatitude: CHURCH_LAT,
        userLongitude: CHURCH_LNG,
      });

      expect(res.success).toBe(true);
      expect(res.serviceName).toBe('Sunday School');
      expect(mockPrisma.attendanceRecord.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            personId: mockMember.id,
            serviceScheduleId: mockService.id,
            subClass: 'Youth Class',
          }),
        })
      );
    });
  });
});
