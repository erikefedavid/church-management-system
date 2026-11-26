/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mockPrisma } from '../helpers/prisma-mock';

vi.mock('@/lib/prisma', () => ({
  prisma: mockPrisma,
}));

import {
  calculateDistanceInMeters,
  isWithinChurchGeofence,
  isWithinGeofence,
  Coordinates,
} from '@/lib/geo';
import {
  lookupByPhoneSuffix,
  lookupMemberByLast4Action,
  lookupMemberByIdAction,
  registerAttendance,
  registerFirstTimerAction,
} from '@/app/actions/attendance';
import {
  getDeviceAttendanceLock,
  setDeviceAttendanceLock,
  clearDeviceAttendanceLock,
  isDeviceLockedForService,
  DEVICE_LOCK_STORAGE_KEY,
  LEGACY_LOCK_STORAGE_KEY,
  DeviceAttendanceLock,
} from '@/lib/device-lock';
import { getNigerianDateMidnight, getNigerianDateString } from '@/lib/service-resolver';
import { PersonCategory, PersonStatus } from '@prisma/client';

describe('Milestone 2 Adversarial Stress Suite: Attendance, Geofencing & Anti-Proxy Lock', () => {
  const CHURCH_LAT = 6.5244;
  const CHURCH_LNG = 3.3792;
  const BASE_RADIUS = 150;
  const churchCoords = { latitude: CHURCH_LAT, longitude: CHURCH_LNG };
  const oneMeterLat = 1 / ((Math.PI / 180) * 6371e3);

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
    mockStorage = {};
    (global as any).window = global;
    (global as any).localStorage = mockLocalStorage;
  });

  afterEach(() => {
    mockStorage = {};
  });

  // =========================================================================
  // SECTION 1: Geofence Boundary, Hysteresis & GPS Anomaly Stress Testing
  // =========================================================================
  describe('1. Geofence Boundary, Hysteresis & GPS Anomaly Stress Testing', () => {
    it('1.1: Exact boundary point at 149.9m offset is accepted as inside geofence', () => {
      const p149_9: Coordinates = {
        latitude: CHURCH_LAT + 149.9 * oneMeterLat,
        longitude: CHURCH_LNG,
        accuracy: 0,
      };

      const result = isWithinChurchGeofence(p149_9, churchCoords, BASE_RADIUS);
      expect(result.isAllowed).toBe(true);
      expect(result.distanceMeters).toBeLessThanOrEqual(150);
      expect(result.effectiveRadiusMeters).toBe(150);
    });

    it('1.2: Exact boundary points around 150m boundary and integer discretization threshold', () => {
      // 150.0m is exactly at the boundary
      const p150_0: Coordinates = {
        latitude: CHURCH_LAT + 150.0 * oneMeterLat,
        longitude: CHURCH_LNG,
        accuracy: 0,
      };
      const res150 = isWithinChurchGeofence(p150_0, churchCoords, BASE_RADIUS);
      expect(res150.isAllowed).toBe(true);
      expect(res150.distanceMeters).toBe(150);

      // 150.1m computes to 150m due to Math.round discretization
      const p150_1: Coordinates = {
        latitude: CHURCH_LAT + 150.1 * oneMeterLat,
        longitude: CHURCH_LNG,
        accuracy: 0,
      };
      const res150_1 = isWithinChurchGeofence(p150_1, churchCoords, BASE_RADIUS);
      expect(res150_1.distanceMeters).toBe(150);

      // Points strictly beyond the 150m integer boundary (>= 150.5m which rounds to 151m, e.g. 151.0m)
      const p151_0: Coordinates = {
        latitude: CHURCH_LAT + 151.0 * oneMeterLat,
        longitude: CHURCH_LNG,
        accuracy: 0,
      };
      const res151_0 = isWithinChurchGeofence(p151_0, churchCoords, BASE_RADIUS);
      expect(res151_0.isAllowed).toBe(false);
      expect(res151_0.distanceMeters).toBe(151);

      // Even further out: 155m
      const p155_0: Coordinates = {
        latitude: CHURCH_LAT + 155.0 * oneMeterLat,
        longitude: CHURCH_LNG,
        accuracy: 0,
      };
      const res155_0 = isWithinChurchGeofence(p155_0, churchCoords, BASE_RADIUS);
      expect(res155_0.isAllowed).toBe(false);
      expect(res155_0.distanceMeters).toBe(155);
    });

    it('1.3: Hysteresis Boundary: 184.9m inside exit boundary when previously validated inside', () => {
      const p184_9: Coordinates = {
        latitude: CHURCH_LAT + 184.9 * oneMeterLat,
        longitude: CHURCH_LNG,
        accuracy: 0,
      };

      // With hysteresis latch (base 150 + buffer 35 = 185m)
      const resWithHysteresis = isWithinChurchGeofence(p184_9, churchCoords, {
        maxRadiusMeters: 150,
        hysteresisBufferMeters: 35,
        isPreviouslyInside: true,
      });
      expect(resWithHysteresis.isAllowed).toBe(true);
      expect(resWithHysteresis.effectiveRadiusMeters).toBe(185);
      expect(resWithHysteresis.distanceMeters).toBeLessThanOrEqual(185);

      // Without hysteresis latch (new entry), 184.9m is immediately rejected!
      const resWithoutHysteresis = isWithinChurchGeofence(p184_9, churchCoords, {
        maxRadiusMeters: 150,
        hysteresisBufferMeters: 35,
        isPreviouslyInside: false,
      });
      expect(resWithoutHysteresis.isAllowed).toBe(false);
      expect(resWithoutHysteresis.effectiveRadiusMeters).toBe(150);
    });

    it('1.4: Hysteresis Boundary: points beyond 185m exit threshold are rejected', () => {
      // 185.0m is at the boundary
      const p185_0: Coordinates = {
        latitude: CHURCH_LAT + 185.0 * oneMeterLat,
        longitude: CHURCH_LNG,
        accuracy: 0,
      };
      const res185_0 = isWithinChurchGeofence(p185_0, churchCoords, {
        maxRadiusMeters: 150,
        hysteresisBufferMeters: 35,
        isPreviouslyInside: true,
      });
      expect(res185_0.isAllowed).toBe(true);
      expect(res185_0.distanceMeters).toBe(185);

      // 185.6m / 186.0m rounds to 186m, strictly outside the 185m hysteresis limit
      const p186_0: Coordinates = {
        latitude: CHURCH_LAT + 186.0 * oneMeterLat,
        longitude: CHURCH_LNG,
        accuracy: 0,
      };
      const res186_0 = isWithinChurchGeofence(p186_0, churchCoords, {
        maxRadiusMeters: 150,
        hysteresisBufferMeters: 35,
        isPreviouslyInside: true,
      });
      expect(res186_0.isAllowed).toBe(false);
      expect(res186_0.distanceMeters).toBe(186);
      expect(res186_0.effectiveRadiusMeters).toBe(185);
    });

    it('1.5: Null Island (0,0) is flagged as suspicious spoof and rejected with massive distance', () => {
      const nullIsland: Coordinates = { latitude: 0, longitude: 0, accuracy: 0 };
      const res = isWithinChurchGeofence(nullIsland, churchCoords, BASE_RADIUS);

      expect(res.isAllowed).toBe(false);
      expect(res.suspiciousMockIndicator).toBe(true);
      // Distance from (0,0) to Lagos (6.5244, 3.3792) is ~807 kilometers (807,000m)
      expect(res.distanceMeters).toBeGreaterThan(800000);
    });

    it('1.6: Flag exact zero-accuracy artifact as suspicious mock indicator', () => {
      // Even if coordinates are within church, exact 0 accuracy flags mock location injector
      const zeroAccuracyCoords: Coordinates = {
        latitude: CHURCH_LAT,
        longitude: CHURCH_LNG,
        accuracy: 0,
      };
      const res = isWithinChurchGeofence(zeroAccuracyCoords, churchCoords, BASE_RADIUS);

      expect(res.isAllowed).toBe(true); // Inside physical location
      expect(res.suspiciousMockIndicator).toBe(true); // Flagged for suspicious GPS injector
    });

    it('1.7: Invalid, NaN, and Infinity coordinates are rejected with Infinity distance', () => {
      const invalidCases: Coordinates[] = [
        { latitude: NaN, longitude: CHURCH_LNG, accuracy: 10 },
        { latitude: CHURCH_LAT, longitude: NaN, accuracy: 10 },
        { latitude: Infinity, longitude: CHURCH_LNG, accuracy: 10 },
        { latitude: CHURCH_LAT, longitude: -Infinity, accuracy: 10 },
        { latitude: 91.0, longitude: CHURCH_LNG, accuracy: 10 }, // Out of [-90, 90]
        { latitude: -95.5, longitude: CHURCH_LNG, accuracy: 10 },
        { latitude: CHURCH_LAT, longitude: 185.0, accuracy: 10 }, // Out of [-180, 180]
        { latitude: CHURCH_LAT, longitude: -190.0, accuracy: 10 },
      ];

      for (const invalidCoords of invalidCases) {
        const res = isWithinChurchGeofence(invalidCoords, churchCoords, BASE_RADIUS);
        expect(res.isAllowed).toBe(false);
        expect(res.distanceMeters).toBe(Infinity);
        expect(res.confidence).toBe('LOW');
        expect(res.suspiciousMockIndicator).toBe(true);
      }
    });

    it('1.8: Extreme accuracy variations and indoor roof cushion behavior', () => {
      // Offset ~160m (beyond 150m)
      const p160: Coordinates = {
        latitude: CHURCH_LAT + 160.0 * oneMeterLat,
        longitude: CHURCH_LNG,
        accuracy: 10, // accuracy cushion = Math.min(10 * 0.5, 20) = 5m -> adjusted distance = 155m > 150m -> false
      };
      const res1 = isWithinChurchGeofence(p160, churchCoords, BASE_RADIUS);
      expect(res1.isAllowed).toBe(false);
      expect(res1.confidence).toBe('HIGH');

      // With accuracy = 30m, cushion = Math.min(30 * 0.5, 20) = 15m -> adjusted = 160 - 15 = 145m <= 150m -> true!
      const p160Degraded: Coordinates = {
        latitude: CHURCH_LAT + 160.0 * oneMeterLat,
        longitude: CHURCH_LNG,
        accuracy: 30,
      };
      const res2 = isWithinChurchGeofence(p160Degraded, churchCoords, BASE_RADIUS);
      expect(res2.isAllowed).toBe(true);
      expect(res2.confidence).toBe('HIGH');

      // Cushion cap: accuracy = 100m, cushion is capped at 20m (adjusted = 160 - 20 = 140m <= 150m)
      const p160Capped: Coordinates = {
        latitude: CHURCH_LAT + 160.0 * oneMeterLat,
        longitude: CHURCH_LNG,
        accuracy: 100,
      };
      const res3 = isWithinChurchGeofence(p160Capped, churchCoords, BASE_RADIUS);
      expect(res3.isAllowed).toBe(true);
      expect(res3.confidence).toBe('MEDIUM');

      // Extreme poor accuracy (e.g. 1500m cell tower fallback)
      const pExtreme: Coordinates = {
        latitude: CHURCH_LAT + 160.0 * oneMeterLat,
        longitude: CHURCH_LNG,
        accuracy: 1500,
      };
      const res4 = isWithinChurchGeofence(pExtreme, churchCoords, BASE_RADIUS);
      expect(res4.confidence).toBe('LOW'); // Low confidence flagged

      // Negative accuracy input is sanitized to 0
      const pNegative: Coordinates = {
        latitude: CHURCH_LAT + 160.0 * oneMeterLat,
        longitude: CHURCH_LNG,
        accuracy: -50,
      };
      const res5 = isWithinChurchGeofence(pNegative, churchCoords, BASE_RADIUS);
      expect(res5.accuracyMeters).toBe(0);
      expect(res5.isAllowed).toBe(false);
    });

    it('1.9: High throughput benchmark: executes 10,000 geofence calculations in under 200ms', () => {
      const start = performance.now();
      for (let i = 0; i < 10000; i++) {
        const offset = (i % 300) * oneMeterLat;
        isWithinChurchGeofence(
          { latitude: CHURCH_LAT + offset, longitude: CHURCH_LNG, accuracy: 12 },
          churchCoords,
          BASE_RADIUS
        );
      }
      const elapsed = performance.now() - start;
      expect(elapsed).toBeLessThan(200);
    });
  });

  // =========================================================================
  // SECTION 2: Phone Suffix Lookup Collisions & Input Sanitization
  // =========================================================================
  describe('2. Phone Suffix Lookup Collisions & Input Sanitization', () => {
    it('2.1: Rejects malformed digit lengths (<4 or >4 digits, empty string, symbols)', async () => {
      const invalidInputs = [
        '',
        '   ',
        '1',
        '12',
        '123',
        '12345',
        '08012345678',
        'abcd',
        '!@#$',
        '   \t  ',
        null as any,
        undefined as any,
      ];

      for (const input of invalidInputs) {
        const res = await lookupByPhoneSuffix(input);
        expect(res.success).toBe(false);
        expect(res.count).toBe(0);
        expect(res.members).toEqual([]);
        expect(res.error).toContain('4 digits');
      }
    });

    it('2.2: Normalizes phone input with spaces, dashes, tabs, and parenthesized digits', async () => {
      mockPrisma.church.findFirst.mockResolvedValue({ id: 'church-1' } as any);
      mockPrisma.person.findMany.mockResolvedValue([
        {
          id: 'person-norm-1',
          firstName: 'Bukola',
          lastName: 'Saraki',
          phone: '08023456789',
          phoneLast4: '6789',
          category: 'YOUTH',
        },
      ]);

      const formattedInputs = [
        ' 6 7 8 9 ',
        '6-7-8-9',
        '(67) 89',
        '\t6789\n',
        '6.7.8.9',
        '//6789//',
      ];

      for (const input of formattedInputs) {
        const res = await lookupByPhoneSuffix(input);
        expect(res.success).toBe(true);
        expect(res.count).toBe(1);
        expect(res.members[0].firstName).toBe('Bukola');
      }
    });

    it('2.3: Zero matches scenario returns empty array gracefully (unregistered / first-timer trigger)', async () => {
      mockPrisma.church.findFirst.mockResolvedValueOnce({ id: 'church-1' } as any);
      mockPrisma.person.findMany.mockResolvedValueOnce([]);

      const res = await lookupByPhoneSuffix('0000');
      expect(res.success).toBe(true);
      expect(res.count).toBe(0);
      expect(res.members).toEqual([]);
    });

    it('2.4: Single match scenario returns exact member profile', async () => {
      mockPrisma.church.findFirst.mockResolvedValueOnce({ id: 'church-1' } as any);
      mockPrisma.person.findMany.mockResolvedValueOnce([
        {
          id: 'person-single-1',
          firstName: 'Chidinma',
          lastName: 'Okeke',
          phone: '08123454321',
          phoneLast4: '4321',
          category: 'YOUTH',
          status: 'MEMBER',
        },
      ]);

      const res = await lookupByPhoneSuffix('4321');
      expect(res.success).toBe(true);
      expect(res.count).toBe(1);
      expect(res.members[0].firstName).toBe('Chidinma');
      expect(res.members[0].phoneLast4).toBe('4321');
    });

    it('2.5: High collision stress scenario: 10 concurrent members sharing the same last 4 digits', async () => {
      mockPrisma.church.findFirst.mockResolvedValueOnce({ id: 'church-1' } as any);

      // Generate 10 collision members sharing phoneLast4 '9999'
      const collisionMembers = Array.from({ length: 10 }, (_, i) => ({
        id: `person-collision-${i + 1}`,
        firstName: `Worshipper_${i + 1}`,
        lastName: `Adeyemi_${String.fromCharCode(65 + i)}`,
        phone: `080${i}0009999`,
        phoneLast4: '9999',
        category: i % 2 === 0 ? 'YOUTH' : 'WORKER',
        subCategory: i % 2 === 0 ? 'YOUTH' : 'YOUTH_WORKER',
        status: 'MEMBER',
        photoUrl: `https://photos.example.com/worshipper_${i + 1}.jpg`,
      }));

      mockPrisma.person.findMany.mockResolvedValueOnce(collisionMembers);

      const res = await lookupByPhoneSuffix('9999');
      expect(res.success).toBe(true);
      expect(res.count).toBe(10);
      expect(res.members).toHaveLength(10);
      expect(res.members[0].phoneLast4).toBe('9999');
      expect(res.members[9].id).toBe('person-collision-10');

      // Verify Prisma query specified ordering by lastName asc, firstName asc
      expect(mockPrisma.person.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
          where: expect.objectContaining({
            churchId: 'church-1',
            isActive: true,
            OR: [{ phoneLast4: '9999' }, { phone: { endsWith: '9999' } }],
          }),
        })
      );
    });

    it('2.6: Resilient failure handling: database errors return safe failure payload without throwing', async () => {
      mockPrisma.church.findFirst.mockResolvedValueOnce({ id: 'church-1' } as any);
      mockPrisma.person.findMany.mockRejectedValueOnce(new Error('Connection terminated unexpectedly'));

      const res = await lookupByPhoneSuffix('1234');
      expect(res.success).toBe(false);
      expect(res.error).toBe('Failed to lookup member.');
      expect(res.count).toBe(0);
      expect(res.members).toEqual([]);
    });

    it('2.7: Church configuration missing returns clean error', async () => {
      mockPrisma.church.findFirst.mockResolvedValueOnce(null);

      const res = await lookupByPhoneSuffix('1234');
      expect(res.success).toBe(false);
      expect(res.error).toBe('Church not found.');
      expect(res.count).toBe(0);
    });

    it('2.8: lookupMemberByLast4Action alias works identically to lookupByPhoneSuffix', async () => {
      mockPrisma.church.findFirst.mockResolvedValueOnce({ id: 'church-1' } as any);
      mockPrisma.person.findMany.mockResolvedValueOnce([
        { id: 'alias-p1', firstName: 'Kemi', lastName: 'Afolabi', phoneLast4: '7788' },
      ]);

      const res = await lookupMemberByLast4Action('7788');
      expect(res.success).toBe(true);
      expect(res.count).toBe(1);
      expect(res.members[0].firstName).toBe('Kemi');
    });

    it('2.9: lookupMemberByIdAction handles empty or invalid ID gracefully', async () => {
      const res1 = await lookupMemberByIdAction('');
      expect(res1.success).toBe(false);
      expect(res1.error).toBe('Invalid member ID.');

      mockPrisma.person.findUnique.mockResolvedValueOnce(null);
      const res2 = await lookupMemberByIdAction('non-existent-id');
      expect(res2.success).toBe(false);
      expect(res2.error).toBe('Member not found.');
    });
  });

  // =========================================================================
  // SECTION 3: Anti-Proxy Lock Lifecycle & Dynamic Unlocking
  // =========================================================================
  describe('3. Anti-Proxy Lock Lifecycle & Dynamic Unlocking', () => {
    const todayWAT = getNigerianDateString();
    const mockLock: DeviceAttendanceLock = {
      serviceId: 'service-workers-101',
      serviceName: "Workers' Meeting",
      serviceDate: todayWAT,
      checkedInPersonId: 'person-test-1',
      checkedInName: 'Emmanuel Adebayo',
      phoneLast4: '3344',
      timestamp: Date.now(),
      method: 'LOOKUP_4DIGIT',
    };

    it('3.1: Same-service lock retention: device remains locked for current service', () => {
      setDeviceAttendanceLock(mockLock);

      // Verify sync to both current and legacy storage keys
      expect(mockLocalStorage.setItem).toHaveBeenCalledWith(
        DEVICE_LOCK_STORAGE_KEY,
        JSON.stringify(mockLock)
      );
      expect(mockLocalStorage.setItem).toHaveBeenCalledWith(
        LEGACY_LOCK_STORAGE_KEY,
        JSON.stringify(mockLock)
      );

      // Same service is locked
      expect(isDeviceLockedForService('service-workers-101')).toBe(true);

      const retrieved = getDeviceAttendanceLock();
      expect(retrieved).not.toBeNull();
      expect(retrieved?.checkedInPersonId).toBe('person-test-1');
      expect(retrieved?.checkedInName).toBe('Emmanuel Adebayo');
      expect(retrieved?.serviceId).toBe('service-workers-101');
    });

    it('3.2: Service-transition dynamic unlock: next service unlocks the device automatically', () => {
      // Worshipper previously checked in for Workers' Meeting
      setDeviceAttendanceLock(mockLock);
      expect(isDeviceLockedForService('service-workers-101')).toBe(true);

      // Time advances and active service transitions to First Celebration Service
      const nextServiceId = 'service-first-celebration-202';
      expect(isDeviceLockedForService(nextServiceId)).toBe(false);

      // When another serviceId is queried, it is unlocked
      expect(isDeviceLockedForService('service-second-celebration-303')).toBe(false);
      expect(isDeviceLockedForService(null)).toBe(false);
      expect(isDeviceLockedForService(undefined)).toBe(false);
    });

    it('3.3: New calendar day auto-release: expires yesterday lock and purges storage', () => {
      const yesterdayWAT = '2026-11-10'; // Deliberately past date
      const expiredLock: DeviceAttendanceLock = {
        ...mockLock,
        serviceDate: yesterdayWAT,
      };

      setDeviceAttendanceLock(expiredLock);

      // Calling getDeviceAttendanceLock on a new day triggers auto-expiration and cleanup
      const retrieved = getDeviceAttendanceLock();
      expect(retrieved).toBeNull();
      expect(mockLocalStorage.removeItem).toHaveBeenCalledWith(DEVICE_LOCK_STORAGE_KEY);
      expect(mockLocalStorage.removeItem).toHaveBeenCalledWith(LEGACY_LOCK_STORAGE_KEY);
      expect(isDeviceLockedForService(mockLock.serviceId)).toBe(false);
    });

    it('3.4: Controlled family override: clears device lock completely', () => {
      setDeviceAttendanceLock(mockLock);
      expect(isDeviceLockedForService(mockLock.serviceId)).toBe(true);

      // User confirms "Check in a family member"
      clearDeviceAttendanceLock();

      expect(mockLocalStorage.removeItem).toHaveBeenCalledWith(DEVICE_LOCK_STORAGE_KEY);
      expect(mockLocalStorage.removeItem).toHaveBeenCalledWith(LEGACY_LOCK_STORAGE_KEY);
      expect(getDeviceAttendanceLock()).toBeNull();
      expect(isDeviceLockedForService(mockLock.serviceId)).toBe(false);
    });

    it('3.5: Legacy storage key backward-compatibility: reads older schema format seamlessly', () => {
      // Simulate older client storage containing legacy checkin object
      mockStorage[LEGACY_LOCK_STORAGE_KEY] = JSON.stringify({
        date: todayWAT,
        personId: 'legacy-person-99',
        name: 'Grace Oladapo',
        serviceId: 'legacy-service-77',
        serviceName: 'Sunday School',
        phoneLast4: '1212',
        timestamp: 1700000000,
      });

      const lock = getDeviceAttendanceLock();
      expect(lock).not.toBeNull();
      expect(lock?.checkedInPersonId).toBe('legacy-person-99');
      expect(lock?.checkedInName).toBe('Grace Oladapo');
      expect(lock?.serviceId).toBe('legacy-service-77');
      expect(lock?.serviceDate).toBe(todayWAT);
      expect(isDeviceLockedForService('legacy-service-77')).toBe(true);
    });

    it('3.6: Corrupted JSON tolerance: handles malformed localStorage safely without crashing', () => {
      mockStorage[DEVICE_LOCK_STORAGE_KEY] = '{ INVALID_JSON_CORRUPTED: true ';

      expect(() => getDeviceAttendanceLock()).not.toThrow();
      const lock = getDeviceAttendanceLock();
      expect(lock).toBeNull();
      expect(isDeviceLockedForService('service-1')).toBe(false);
    });

    it('3.7: SSR Safety: safely handles undefined window in server rendering environments', () => {
      const originalWindow = (global as any).window;
      try {
        delete (global as any).window;

        expect(getDeviceAttendanceLock()).toBeNull();
        expect(isDeviceLockedForService('any-service')).toBe(false);
        expect(() => setDeviceAttendanceLock(mockLock)).not.toThrow();
        expect(() => clearDeviceAttendanceLock()).not.toThrow();
      } finally {
        (global as any).window = originalWindow;
      }
    });
  });

  // =========================================================================
  // SECTION 4: Server Action Attendance Registration Adversarial Pipeline
  // =========================================================================
  describe('4. Server Action Attendance Registration Adversarial Pipeline', () => {
    it('4.1: Rejects check-in when GPS coordinates are omitted or undefined', async () => {
      mockPrisma.church.findFirst.mockResolvedValueOnce({
        id: 'church-1',
        latitude: CHURCH_LAT,
        longitude: CHURCH_LNG,
        geofenceRadius: 150,
      } as any);

      const res = await registerAttendance({
        personId: 'p1',
        method: 'LOOKUP_4DIGIT',
      });

      expect(res.success).toBe(false);
      expect(res.error).toContain('Location permission is required');
    });

    it('4.2: Rejects check-in when user coordinates are 500m outside church premises', async () => {
      mockPrisma.church.findFirst.mockResolvedValueOnce({
        id: 'church-1',
        latitude: CHURCH_LAT,
        longitude: CHURCH_LNG,
        geofenceRadius: 150,
      } as any);

      const res = await registerAttendance({
        personId: 'p1',
        latitude: CHURCH_LAT + 0.0045, // ~500m away
        longitude: CHURCH_LNG,
        method: 'LOOKUP_4DIGIT',
      });

      expect(res.success).toBe(false);
      expect(res.error).toContain('Check-in rejected');
      expect(res.distanceMeters).toBeGreaterThan(150);
    });

    it('4.3: Accepts check-in inside geofence and creates attendance record', async () => {
      mockPrisma.church.findFirst.mockResolvedValueOnce({
        id: 'church-1',
        latitude: CHURCH_LAT,
        longitude: CHURCH_LNG,
        geofenceRadius: 150,
      } as any);

      mockPrisma.person.findUnique.mockResolvedValueOnce({
        id: 'p-valid-1',
        firstName: 'Fola',
        lastName: 'Ade',
        category: 'YOUTH',
      } as any);

      mockPrisma.serviceSchedule.findUnique.mockResolvedValueOnce({
        id: 'svc-1',
        name: 'First Celebration Service',
        dayOfWeek: 'SUNDAY',
      } as any);

      mockPrisma.attendanceRecord.findFirst.mockResolvedValueOnce(null);
      mockPrisma.attendanceRecord.create.mockResolvedValueOnce({
        id: 'att-created-1',
        person: { id: 'p-valid-1', firstName: 'Fola', lastName: 'Ade' },
        serviceSchedule: { id: 'svc-1', name: 'First Celebration Service' },
      } as any);

      const res = await registerAttendance({
        personId: 'p-valid-1',
        serviceScheduleId: 'svc-1',
        latitude: CHURCH_LAT,
        longitude: CHURCH_LNG,
        method: 'ONE_TAP',
      });

      expect(res.success).toBe(true);
      expect(res.alreadyCheckedIn).toBe(false);
      expect(res.personName).toBe('Fola Ade');
      expect(res.serviceName).toBe('First Celebration Service');
      expect(mockPrisma.attendanceRecord.create).toHaveBeenCalledTimes(1);
    });

    it('4.4: Prevents duplicate attendance check-in for the same service on the same WAT calendar day', async () => {
      mockPrisma.church.findFirst.mockResolvedValueOnce({
        id: 'church-1',
        latitude: CHURCH_LAT,
        longitude: CHURCH_LNG,
        geofenceRadius: 150,
      } as any);

      mockPrisma.person.findUnique.mockResolvedValueOnce({
        id: 'p-dup-1',
        firstName: 'Fola',
        category: 'YOUTH',
      } as any);

      mockPrisma.serviceSchedule.findUnique.mockResolvedValueOnce({
        id: 'svc-1',
        name: 'First Celebration Service',
      } as any);

      // Existing record already in DB for today's Nigerian date
      mockPrisma.attendanceRecord.findFirst.mockResolvedValueOnce({
        id: 'existing-record',
        personId: 'p-dup-1',
        serviceScheduleId: 'svc-1',
        date: getNigerianDateMidnight(),
      } as any);

      const res = await registerAttendance({
        personId: 'p-dup-1',
        serviceScheduleId: 'svc-1',
        latitude: CHURCH_LAT,
        longitude: CHURCH_LNG,
        method: 'LOOKUP_4DIGIT',
      });

      expect(res.success).toBe(false);
      expect(res.alreadyCheckedIn).toBe(true);
      expect(res.error).toContain('already recorded');
      expect(mockPrisma.attendanceRecord.create).not.toHaveBeenCalled();
    });

    it('4.5: Gracefully catches concurrent P2002 race conditions and returns duplicate status', async () => {
      mockPrisma.church.findFirst.mockResolvedValueOnce({
        id: 'church-1',
        latitude: CHURCH_LAT,
        longitude: CHURCH_LNG,
        geofenceRadius: 150,
      } as any);

      mockPrisma.person.findUnique.mockResolvedValueOnce({
        id: 'p-race-1',
        firstName: 'Fola',
      } as any);

      mockPrisma.serviceSchedule.findUnique.mockResolvedValueOnce({
        id: 'svc-1',
        name: 'First Celebration Service',
      } as any);

      mockPrisma.attendanceRecord.findFirst.mockResolvedValueOnce(null);

      const p2002Error: any = new Error('Unique constraint violation on (personId, serviceScheduleId, date)');
      p2002Error.code = 'P2002';
      mockPrisma.attendanceRecord.create.mockRejectedValueOnce(p2002Error);

      const res = await registerAttendance({
        personId: 'p-race-1',
        serviceScheduleId: 'svc-1',
        latitude: CHURCH_LAT,
        longitude: CHURCH_LNG,
        method: 'QR',
      });

      expect(res.success).toBe(false);
      expect(res.alreadyCheckedIn).toBe(true);
      expect(res.error).toContain('already recorded for this service today');
    });

    it('4.6: First-timer registration cleans Nigerian phone input and creates member on the fly', async () => {
      mockPrisma.church.findFirst.mockResolvedValue({
        id: 'church-1',
        latitude: CHURCH_LAT,
        longitude: CHURCH_LNG,
        geofenceRadius: 150,
      } as any);

      // Person not found -> create new First-Timer
      const mockCreatedPerson = {
        id: 'new-first-timer-1',
        churchId: 'church-1',
        firstName: 'Ayomide',
        lastName: 'Babalola',
        phone: '2348031234567',
        phoneLast4: '4567',
        category: PersonCategory.YOUTH,
        subCategory: 'YOUTH',
        status: PersonStatus.FIRST_TIMER,
      };

      mockPrisma.person.findFirst.mockResolvedValueOnce(null);
      mockPrisma.person.create.mockResolvedValueOnce(mockCreatedPerson as any);
      mockPrisma.person.findUnique.mockResolvedValueOnce(mockCreatedPerson as any);

      mockPrisma.serviceSchedule.findUnique.mockResolvedValueOnce({
        id: 'svc-1',
        name: 'First Celebration Service',
      } as any);

      mockPrisma.attendanceRecord.findFirst.mockResolvedValueOnce(null);
      mockPrisma.attendanceRecord.create.mockResolvedValueOnce({
        id: 'att-ft-1',
        person: { id: 'new-first-timer-1', firstName: 'Ayomide', lastName: 'Babalola' },
        serviceSchedule: { id: 'svc-1', name: 'First Celebration Service' },
      } as any);

      const res = await registerFirstTimerAction({
        firstName: 'Ayomide',
        lastName: 'Babalola',
        phone: '+234 803 123 4567', // Raw input with country code and spaces
        category: PersonCategory.YOUTH,
        serviceScheduleId: 'svc-1',
        userLatitude: CHURCH_LAT,
        userLongitude: CHURCH_LNG,
      });

      expect(res.success).toBe(true);
      expect(res.personName).toBe('Ayomide Babalola');
      expect(mockPrisma.person.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            phone: '2348031234567',
            phoneLast4: '4567',
            status: PersonStatus.FIRST_TIMER,
          }),
        })
      );
    });

    it('4.7: First-timer registration rejects invalid phone number (<10 digits)', async () => {
      mockPrisma.church.findFirst.mockResolvedValueOnce({ id: 'church-1' } as any);

      const res = await registerFirstTimerAction({
        firstName: 'Ayomide',
        lastName: 'Babalola',
        phone: '12345',
        category: PersonCategory.YOUTH,
      });

      expect(res.success).toBe(false);
      expect(res.error).toContain('at least 10 digits');
    });
  });
});
