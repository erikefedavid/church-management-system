/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockPrisma } from '../helpers/prisma-mock';

vi.mock('@/lib/prisma', () => ({
  prisma: mockPrisma,
}));

import { calculateDistanceInMeters, isWithinChurchGeofence, isWithinGeofence } from '@/lib/geo';
import {
  lookupByPhoneSuffix,
  lookupMemberByLast4Action,
  lookupMemberByIdAction,
  registerAttendance,
  selfCheckInAction,
} from '@/app/actions/attendance';
import { getNigerianDateMidnight } from '@/lib/service-resolver';

describe('Milestone 2 Attendance Engine Unit Tests', () => {
  const CHURCH_LAT = 6.5244;
  const CHURCH_LNG = 3.3792;
  const BASE_RADIUS = 150;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('1. Geofence Calculation & Preservation', () => {
    it('preserves exact church coordinates and returns 0m at epicenter', () => {
      const distance = calculateDistanceInMeters(
        { latitude: CHURCH_LAT, longitude: CHURCH_LNG },
        { latitude: CHURCH_LAT, longitude: CHURCH_LNG }
      );
      expect(distance).toBe(0);

      const check = isWithinChurchGeofence(
        { latitude: CHURCH_LAT, longitude: CHURCH_LNG, accuracy: 10 },
        { latitude: CHURCH_LAT, longitude: CHURCH_LNG },
        BASE_RADIUS
      );
      expect(check.isAllowed).toBe(true);
      expect(check.distanceMeters).toBe(0);
      expect(check.confidence).toBe('HIGH');
    });

    it('exports and verifies isWithinGeofence alias behaves identically', () => {
      expect(isWithinGeofence).toBe(isWithinChurchGeofence);

      const check = isWithinGeofence(
        { latitude: CHURCH_LAT, longitude: CHURCH_LNG, accuracy: 5 },
        { latitude: CHURCH_LAT, longitude: CHURCH_LNG },
        BASE_RADIUS
      );
      expect(check.isAllowed).toBe(true);
      expect(check.distanceMeters).toBe(0);
    });

    it('permits check-in inside 100m with high accuracy', () => {
      // Offset ~80m north
      const userCoords = { latitude: CHURCH_LAT + 0.00072, longitude: CHURCH_LNG, accuracy: 8 };
      const check = isWithinChurchGeofence(userCoords, { latitude: CHURCH_LAT, longitude: CHURCH_LNG }, BASE_RADIUS);
      expect(check.isAllowed).toBe(true);
      expect(check.distanceMeters).toBeLessThan(100);
    });

    it('rejects position outside 150m radius (e.g. 250m away)', () => {
      // Offset ~250m
      const userCoords = { latitude: CHURCH_LAT + 0.00225, longitude: CHURCH_LNG, accuracy: 10 };
      const check = isWithinChurchGeofence(userCoords, { latitude: CHURCH_LAT, longitude: CHURCH_LNG }, BASE_RADIUS);
      expect(check.isAllowed).toBe(false);
      expect(check.distanceMeters).toBeGreaterThan(200);
    });

    it('applies 35m hysteresis buffer when user was previously validated inside', () => {
      // Position at ~170m away (beyond 150m, inside 185m)
      const userCoords = { latitude: CHURCH_LAT + 0.00153, longitude: CHURCH_LNG, accuracy: 10 };

      const withoutHysteresis = isWithinChurchGeofence(
        userCoords,
        { latitude: CHURCH_LAT, longitude: CHURCH_LNG },
        { maxRadiusMeters: 150, hysteresisBufferMeters: 35, isPreviouslyInside: false }
      );
      expect(withoutHysteresis.isAllowed).toBe(false);

      const withHysteresis = isWithinChurchGeofence(
        userCoords,
        { latitude: CHURCH_LAT, longitude: CHURCH_LNG },
        { maxRadiusMeters: 150, hysteresisBufferMeters: 35, isPreviouslyInside: true }
      );
      expect(withHysteresis.isAllowed).toBe(true);
      expect(withHysteresis.effectiveRadiusMeters).toBe(185);
    });

    it('flags Null Island (0,0) as suspicious spoof indicator', () => {
      const check = isWithinChurchGeofence(
        { latitude: 0, longitude: 0, accuracy: 0 },
        { latitude: CHURCH_LAT, longitude: CHURCH_LNG },
        BASE_RADIUS
      );
      expect(check.isAllowed).toBe(false);
      expect(check.suspiciousMockIndicator).toBe(true);
    });
  });

  describe('2. Phone Suffix Lookup (lookupByPhoneSuffix)', () => {
    it('rejects input with invalid digit length', async () => {
      const res1 = await lookupByPhoneSuffix('123');
      expect(res1.success).toBe(false);
      expect(res1.error).toContain('4 digits');

      const res2 = await lookupByPhoneSuffix('12345');
      expect(res2.success).toBe(false);
    });

    it('returns empty array when no active member matches', async () => {
      mockPrisma.church.findFirst.mockResolvedValueOnce({ id: 'church-1' } as any);
      mockPrisma.person.findMany.mockResolvedValueOnce([]);

      const res = await lookupByPhoneSuffix('9999');
      expect(res.success).toBe(true);
      expect(res.count).toBe(0);
      expect(res.members).toEqual([]);
    });

    it('returns single member on exact match', async () => {
      mockPrisma.church.findFirst.mockResolvedValueOnce({ id: 'church-1' } as any);
      mockPrisma.person.findMany.mockResolvedValueOnce([
        {
          id: 'person-1',
          firstName: 'David',
          lastName: 'Adeleke',
          phone: '08012345678',
          phoneLast4: '5678',
          category: 'YOUTH',
          status: 'MEMBER',
        },
      ]);

      const res = await lookupByPhoneSuffix('5678');
      expect(res.success).toBe(true);
      expect(res.count).toBe(1);
      expect(res.members[0].firstName).toBe('David');
    });

    it('handles collisions by returning all matching members', async () => {
      mockPrisma.church.findFirst.mockResolvedValueOnce({ id: 'church-1' } as any);
      mockPrisma.person.findMany.mockResolvedValueOnce([
        { id: 'person-1', firstName: 'David', lastName: 'Adeleke', phoneLast4: '4567', category: 'YOUTH' },
        { id: 'person-2', firstName: 'Daniel', lastName: 'Okonkwo', phoneLast4: '4567', category: 'WORKER' },
      ]);

      const res = await lookupByPhoneSuffix('4567');
      expect(res.success).toBe(true);
      expect(res.count).toBe(2);
      expect(res.members).toHaveLength(2);
    });

    it('lookupMemberByLast4Action alias works identically to lookupByPhoneSuffix', async () => {
      mockPrisma.church.findFirst.mockResolvedValueOnce({ id: 'church-1' } as any);
      mockPrisma.person.findMany.mockResolvedValueOnce([
        { id: 'person-1', firstName: 'Tolu', lastName: 'Bakare', phoneLast4: '1122', category: 'YOUTH' },
      ]);

      const res = await lookupMemberByLast4Action('1122');
      expect(res.success).toBe(true);
      expect(res.count).toBe(1);
      expect(res.members[0].firstName).toBe('Tolu');
    });

    it('lookupMemberByIdAction finds member by primary key ID', async () => {
      mockPrisma.person.findUnique.mockResolvedValueOnce({
        id: 'person-qr-1',
        firstName: 'Deborah',
        lastName: 'Eze',
        phoneLast4: '8899',
        category: 'YOUTH',
      } as any);

      const res = await lookupMemberByIdAction('person-qr-1');
      expect(res.success).toBe(true);
      expect(res.member?.firstName).toBe('Deborah');
    });
  });

  describe('3. Attendance Registration (registerAttendance)', () => {
    it('rejects registration when GPS coordinates are omitted', async () => {
      mockPrisma.church.findFirst.mockResolvedValueOnce({
        id: 'church-1',
        latitude: CHURCH_LAT,
        longitude: CHURCH_LNG,
        geofenceRadius: 150,
      } as any);

      const res = await registerAttendance({
        personId: 'person-1',
        method: 'LOOKUP_4DIGIT',
      });
      expect(res.success).toBe(false);
      expect(res.error).toContain('Location permission is required');
    });

    it('rejects registration when user coordinates fall outside 150m geofence', async () => {
      mockPrisma.church.findFirst.mockResolvedValueOnce({
        id: 'church-1',
        latitude: CHURCH_LAT,
        longitude: CHURCH_LNG,
        geofenceRadius: 150,
      } as any);

      const res = await registerAttendance({
        personId: 'person-1',
        latitude: CHURCH_LAT + 0.005, // ~550m away
        longitude: CHURCH_LNG,
        method: 'QR',
      });
      expect(res.success).toBe(false);
      expect(res.error).toContain('Check-in rejected');
      expect(res.distanceMeters).toBeGreaterThan(150);
    });

    it('accepts registration inside geofence and creates attendance receipt', async () => {
      mockPrisma.church.findFirst.mockResolvedValueOnce({
        id: 'church-1',
        latitude: CHURCH_LAT,
        longitude: CHURCH_LNG,
        geofenceRadius: 150,
      } as any);

      mockPrisma.person.findUnique.mockResolvedValueOnce({
        id: 'person-1',
        firstName: 'Tolu',
        lastName: 'Bakare',
        category: 'YOUTH',
      } as any);

      mockPrisma.serviceSchedule.findUnique.mockResolvedValueOnce({
        id: 'service-1',
        name: 'Sunday School',
        dayOfWeek: 'SUNDAY',
      } as any);

      mockPrisma.attendanceRecord.findFirst.mockResolvedValueOnce(null); // No previous checkin

      mockPrisma.attendanceRecord.create.mockResolvedValueOnce({
        id: 'att-1',
        person: { id: 'person-1', firstName: 'Tolu', lastName: 'Bakare' },
        serviceSchedule: { id: 'service-1', name: 'Sunday School' },
      } as any);

      const res = await registerAttendance({
        personId: 'person-1',
        serviceScheduleId: 'service-1',
        latitude: CHURCH_LAT,
        longitude: CHURCH_LNG,
        method: 'ONE_TAP',
      });

      expect(res.success).toBe(true);
      expect(res.alreadyCheckedIn).toBe(false);
      expect(res.serviceName).toBe('Sunday School');
      expect(mockPrisma.attendanceRecord.create).toHaveBeenCalledTimes(1);
    });

    it('prevents duplicate check-in on the same WAT calendar day', async () => {
      mockPrisma.church.findFirst.mockResolvedValueOnce({
        id: 'church-1',
        latitude: CHURCH_LAT,
        longitude: CHURCH_LNG,
        geofenceRadius: 150,
      } as any);

      mockPrisma.person.findUnique.mockResolvedValueOnce({
        id: 'person-1',
        firstName: 'Tolu',
        category: 'YOUTH',
      } as any);

      mockPrisma.serviceSchedule.findUnique.mockResolvedValueOnce({
        id: 'service-1',
        name: 'Sunday School',
      } as any);

      mockPrisma.attendanceRecord.findFirst.mockResolvedValueOnce({
        id: 'existing-att',
        personId: 'person-1',
        serviceScheduleId: 'service-1',
        date: getNigerianDateMidnight(),
      } as any);

      const res = await registerAttendance({
        personId: 'person-1',
        serviceScheduleId: 'service-1',
        latitude: CHURCH_LAT,
        longitude: CHURCH_LNG,
        method: 'LOOKUP_4DIGIT',
      });

      expect(res.success).toBe(false);
      expect(res.alreadyCheckedIn).toBe(true);
      expect(res.error).toContain('already recorded');
      expect(mockPrisma.attendanceRecord.create).not.toHaveBeenCalled();
    });

    it('handles Workers Meeting routing for non-workers gracefully', async () => {
      mockPrisma.church.findFirst.mockResolvedValueOnce({
        id: 'church-1',
        latitude: CHURCH_LAT,
        longitude: CHURCH_LNG,
        geofenceRadius: 150,
      } as any);

      // Non-worker Youth
      mockPrisma.person.findUnique.mockResolvedValueOnce({
        id: 'person-youth-1',
        firstName: 'Samuel',
        lastName: 'Oladipo',
        category: 'YOUTH',
        subCategory: 'YOUTH',
      } as any);

      // Target schedule is Workers Meeting
      mockPrisma.serviceSchedule.findUnique.mockResolvedValueOnce({
        id: 'service-workers',
        name: "Workers' Meeting",
        dayOfWeek: 'SUNDAY',
        startTime: '07:30',
      } as any);

      // Next schedule is First Service
      mockPrisma.serviceSchedule.findFirst.mockResolvedValueOnce({
        id: 'service-first',
        name: 'First Celebration Service',
        dayOfWeek: 'SUNDAY',
        startTime: '08:30',
      } as any);

      mockPrisma.attendanceRecord.findFirst.mockResolvedValueOnce(null);

      mockPrisma.attendanceRecord.create.mockResolvedValueOnce({
        id: 'att-routed-1',
        person: { id: 'person-youth-1', firstName: 'Samuel', lastName: 'Oladipo' },
        serviceSchedule: { id: 'service-first', name: 'First Celebration Service' },
      } as any);

      const res = await registerAttendance({
        personId: 'person-youth-1',
        serviceScheduleId: 'service-workers',
        latitude: CHURCH_LAT,
        longitude: CHURCH_LNG,
        method: 'LOOKUP_4DIGIT',
      });

      expect(res.success).toBe(true);
      expect(res.isEarlyBird).toBe(true);
      expect(res.serviceName).toBe('First Celebration Service');
      expect(res.message).toContain('Early arrival confirmed');
    });

    it('handles concurrency unique constraint P2002 error gracefully', async () => {
      mockPrisma.church.findFirst.mockResolvedValueOnce({
        id: 'church-1',
        latitude: CHURCH_LAT,
        longitude: CHURCH_LNG,
        geofenceRadius: 150,
      } as any);

      mockPrisma.person.findUnique.mockResolvedValueOnce({
        id: 'person-1',
        firstName: 'Tolu',
      } as any);

      mockPrisma.serviceSchedule.findUnique.mockResolvedValueOnce({
        id: 'service-1',
        name: 'Sunday School',
      } as any);

      mockPrisma.attendanceRecord.findFirst.mockResolvedValueOnce(null);

      const p2002Error: any = new Error('Unique constraint violation');
      p2002Error.code = 'P2002';
      mockPrisma.attendanceRecord.create.mockRejectedValueOnce(p2002Error);

      const res = await registerAttendance({
        personId: 'person-1',
        serviceScheduleId: 'service-1',
        latitude: CHURCH_LAT,
        longitude: CHURCH_LNG,
        method: 'ONE_TAP',
      });

      expect(res.success).toBe(false);
      expect(res.alreadyCheckedIn).toBe(true);
      expect(res.error).toContain('Attendance already recorded for this service today');
    });

    it('selfCheckInAction backward-compatible alias routes through registerAttendance', async () => {
      mockPrisma.church.findFirst.mockResolvedValueOnce({
        id: 'church-1',
        latitude: CHURCH_LAT,
        longitude: CHURCH_LNG,
        geofenceRadius: 150,
      } as any);

      mockPrisma.person.findUnique.mockResolvedValueOnce({
        id: 'person-1',
        firstName: 'Tolu',
      } as any);

      mockPrisma.serviceSchedule.findUnique.mockResolvedValueOnce({
        id: 'service-1',
        name: 'Sunday School',
      } as any);

      mockPrisma.attendanceRecord.findFirst.mockResolvedValueOnce(null);

      mockPrisma.attendanceRecord.create.mockResolvedValueOnce({
        id: 'att-legacy-1',
        person: { id: 'person-1', firstName: 'Tolu', lastName: 'Bakare' },
        serviceSchedule: { id: 'service-1', name: 'Sunday School' },
      } as any);

      const res = await selfCheckInAction({
        personId: 'person-1',
        serviceScheduleId: 'service-1',
        userLatitude: CHURCH_LAT,
        userLongitude: CHURCH_LNG,
      });

      expect(res.success).toBe(true);
      expect(res.serviceName).toBe('Sunday School');
    });
  });
});
