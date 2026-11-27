# Handoff Report: Milestone 2 — Anti-Proxy Lock, Geofencing, and Attendance Server Actions

**Agent**: `m2_explorer_2`  
**Milestone**: Milestone 2: Youth-First Attendance & UI Compliance  
**Date**: 2026-11-12T16:49:00Z  
**Target Recipient**: Orchestrator (`9ffc4707-a26f-4abc-94bd-08bbb49a081e`) & Milestone 2 Implementer  

---

## 1. Observation

### 1.1 Inviolable Geofencing & Scheduling Core
- **`lib/geo.ts:15-35, 66-138`**:
  - Implements Haversine distance in `calculateDistanceInMeters(pointA, pointB)`.
  - Core function is `isWithinChurchGeofence(userCoords, churchCoords, optionsOrRadius = 150)`.
  - Default radius: `150` meters.
  - Hysteresis exit buffer: `35` meters (`isPreviouslyInside ? baseRadius + hysteresisBuffer : baseRadius`).
  - Indoor roof cushion: `20` meters maximum (`accuracyCushion = Math.min(accuracy * 0.5, 20); adjustedDistance = Math.max(0, distanceMeters - accuracyCushion)`).
  - Anomaly detection: Null Island `(0, 0)` and `accuracy === 0` are flagged with `suspiciousMockIndicator: true`.
  - Coordinates in `prisma/schema.prisma:57-59`: `latitude: 6.5244, longitude: 3.3792, geofenceRadius: 150`.
  - Hard constraint verified: Coordinates `6.5244, 3.3792`, base radius `150m`, 35m hysteresis, and 20m indoor cushion are strictly preserved.
  - API naming: The function is currently named `isWithinChurchGeofence`. The milestone specification also references `isWithinGeofence`.

- **`lib/service-resolver.ts:33-104, 252-420`**:
  - Timezone: Evaluated using `Intl.DateTimeFormat('en-US', { timeZone: 'Africa/Lagos' })` (WAT Africa/Lagos UTC+1).
  - Normalization: `getNigerianDateMidnight(date)` returns a Date object set to `00:00:00.000 UTC` representing the Nigerian calendar day.
  - Uniqueness date string: `getNigerianDateString(date)` returns `YYYY-MM-DD`.
  - Overtime buffer: Standalone/final services (Second Service, Thanksgiving, Midweek Digging Deep, Faith Clinic, Hour of Mercy, Youth Prayer) receive a strict 20-minute buffer (`getServiceBufferEndTime`), whereas intermediate services (Workers' Meeting, First Service, Sunday School) have 0-minute buffer to avoid scheduling collisions.

### 1.2 Database Schema & Enums
- **`prisma/schema.prisma:42-45, 123-187`**:
  - `CheckInMethod` enum is defined as:
    ```prisma
    enum CheckInMethod {
      QR_SELF
      USHER_MANUAL
    }
    ```
  - `Person` model contains:
    - `phone String` (e.g. `"08012345678"`)
    - `phoneLast4 String` (e.g. `"5678"`)
    - `isActive Boolean @default(true)`
    - Compound index: `@@index([churchId, phoneLast4])`
  - `AttendanceRecord` model contains:
    - `personId String`, `serviceScheduleId String`, `date DateTime`, `method CheckInMethod @default(QR_SELF)`, `subClass String?`
    - Compound unique constraint: `@@unique([personId, serviceScheduleId, date])` ensuring strict single-record per person per service on a calendar date.

### 1.3 Server Actions in `app/actions/attendance.ts`
- **`app/actions/attendance.ts:108-143` (`lookupMemberByLast4Action`)**:
  - Queries `prisma.person.findMany({ where: { churchId, phoneLast4, isActive: true } })`.
  - Returns `{ success: true, members, count }`.
  - Does not currently check `phone.endsWith(suffix)` as a secondary fallback if `phoneLast4` is empty or desynced.
- **`app/actions/attendance.ts:148-281` (`selfCheckInAction`)**:
  - Validates `userLatitude` and `userLongitude` using `isWithinChurchGeofence`.
  - Uses `today = getNigerianDateMidnight()`.
  - Checks existing record via `prisma.attendanceRecord.findFirst({ where: { personId, serviceScheduleId: actualScheduleId, date: today } })`.
  - Handles Workers' Meeting intelligent routing: non-workers arriving during Workers' Meeting are gracefully re-routed to First Service.
  - Sets `method: CheckInMethod.QR_SELF`.
  - Returns receipt with `message`, `serviceName`, `serviceId`.
  - Does not currently accept explicit `method: 'QR' | 'LOOKUP_4DIGIT' | 'ONE_TAP'` in its signature, and does not have the standardized name `registerAttendance`.

### 1.4 Frontend & Client-Side Anti-Proxy Mechanism
- **`app/page.tsx:113-134, 177-196, 258-306, 915-952`**:
  - `localStorage` key used: `rccg_completed_checkin` and `rccg_saved_member`.
  - On mount and poll (30s interval): Checks if `storedCheckIn.serviceId === activeService.id && storedCheckIn.date === todayStr`.
  - When locked: Sets `deviceCheckInLock`, renders locked UI card:
    - "Single-Device Attendance Policy: To maintain attendance integrity, proxy check-in is not permitted. This phone is locked to your pass until the next scheduled church service begins."
    - Links to `/welcome` ("View My Verified Attendance Pass").
  - Geolocation API:
    - Calls `navigator.geolocation.getCurrentPosition` with `{ enableHighAccuracy: true, timeout: 10000, maximumAge: 15000 }`.
    - Updates `distanceMeters`, `geoAllowed`, `geoChecking`, and `geoErrorType` (`PERMISSION_DENIED`, `POSITION_UNAVAILABLE`, `TIMEOUT`, `HTTPS_REQUIRED`).

### 1.5 UI Rule Violations Identified
- **`app/components/LocationPromptModal.tsx:60`**:
  - Uses `<MapPin className={... ${geoChecking ? 'animate-bounce text-blue-600' : 'text-blue-600'}} />`.
  - This directly violates User Rule 1: *"NO cartoon bounces: Never use `animate-bounce` or rubber-band effects on standard UI elements."*

### 1.6 Current Test Infrastructure
- Vitest suite running via `npm test`: 4 files, 107 tests passing (`tests/unit/template-engine.test.ts`, `tests/unit/direct-dispatch.test.ts`, `tests/adversarial/*`).
- `tests/helpers/prisma-mock.ts` provides complete `mockPrisma` mocking.
- No `tests/unit/attendance.test.ts` exists yet.

---

## 2. Logic Chain

### 2.1 Preserving Coordinates and Geofence Bounds
1. The church coordinates `6.5244, 3.3792` and base radius `150m` in `lib/geo.ts` are mathematically calibrated to RCCG Jesus Covenant Zone premises.
2. The Haversine formula calculation in `calculateDistanceInMeters` computes spherical distance accurately.
3. Edge flapping is prevented by the 35m hysteresis buffer (`isPreviouslyInside ? 185m : 150m`).
4. Indoor roof signal degradation is cushioned by subtracting up to 20m of reported uncertainty (`Math.min(accuracy * 0.5, 20)`).
5. Providing `export const isWithinGeofence = isWithinChurchGeofence;` in `lib/geo.ts` ensures backward and forward compatibility for all consumers and tests without altering the underlying arithmetic.

### 2.2 Geolocation API Client Lifecycle
1. When a worshipper opens the portal, the client calls `navigator.geolocation.getCurrentPosition` with `enableHighAccuracy: true` and `maximumAge: 0`.
2. **GPS Warming Phase**: Hardware GPS chips take 1-3 seconds to acquire satellite locks. The UI must show a smooth non-bounce status indicator ("Acquiring satellite lock...").
3. **Distance Indicator**: Once resolved, the UI shows real-time distance from the sanctuary (e.g. `45m away`).
4. **Sanctuary Gate**:
   - If within effective radius: Badge turns emerald ("Sanctuary Verified"), and the 4-digit keypad / 1-tap profile card unlocks.
   - If outside: Warning card details the distance (e.g. `320m away`) and actionable recovery (allow browser permission, turn on GPS, switch to HTTPS).

### 2.3 Phone Suffix Lookup (`lookupByPhoneSuffix`)
1. Members enter their 4-digit suffix.
2. The query must validate `^\d{4}$`.
3. To maximize resilience against formatting variances, the query inspects both `phoneLast4: suffix` and `phone: { endsWith: suffix }` on active members (`isActive: true`).
4. **Collision Handling**:
   - `0 matches`: Prompt to register as a First-Timer.
   - `1 match`: Instant 1-tap confirmation or immediate check-in.
   - `2+ matches`: Collision picker displaying full name, category, and masked phone (`080****5678`) to uniquely identify the member.

### 2.4 Check-in Action (`registerAttendance`)
1. Receives `{ personId, latitude, longitude, method, serviceScheduleId?, subClass? }`.
2. Server validates coordinates with `isWithinChurchGeofence`. Missing or out-of-bounds coordinates return an immediate descriptive rejection.
3. Target service is validated: If `serviceScheduleId` is provided, find it; otherwise resolve live service via `getActiveChurchService`.
4. If the target service is Workers' Meeting and the attendee is not a worker, the action gracefully assigns them to First Service.
5. Calendar date is normalized to Nigerian midnight `getNigerianDateMidnight()` in WAT UTC+1.
6. Existing attendance is verified via `prisma.attendanceRecord.findFirst`. If present, return `{ success: false, alreadyCheckedIn: true, error: ... }`.
7. Client `method` (`'QR' | 'LOOKUP_4DIGIT' | 'ONE_TAP'`) maps to DB enum `CheckInMethod.QR_SELF`.
8. The database compound unique index `@@unique([personId, serviceScheduleId, date])` provides concurrency safety; any `P2002` error is caught and translated to `alreadyCheckedIn: true`.

### 2.5 Anti-Proxy Lock Mechanism
1. A phone should not be used to check in multiple different people for the same service ("proxy attendance").
2. Standardized key: `rccg_attendance_device_lock`.
3. Payload schema:
   ```ts
   interface DeviceAttendanceLock {
     serviceId: string;
     serviceName: string;
     serviceDate: string; // YYYY-MM-DD (WAT Africa/Lagos)
     checkedInPersonId: string;
     checkedInName: string;
     phoneLast4: string;
     timestamp: number;
     method: 'QR' | 'LOOKUP_4DIGIT' | 'ONE_TAP';
   }
   ```
4. **Lock Activation**: On successful attendance, payload is saved to `localStorage`.
5. **Lock Enforcement**: If `lock.serviceId === activeService.id` on the same WAT calendar day, block check-in inputs, show "Attendance Already Marked", and provide link to `/welcome`.
6. **Automatic Release**:
   - Next Service: When `activeService.id !== lock.serviceId`, device lock automatically releases so user can check in for the new service (e.g. Sunday School -> 2nd Service).
   - Next Calendar Day: When `lock.serviceDate !== getNigerianDateString()`, device lock automatically clears.
7. **Controlled Account Switching**: For family members without smartphones, an explicit user action ("Check in family member") clears the device lock upon confirmation.

---

## 3. Caveats

1. **No direct code modifications performed**: In strict compliance with explorer instructions, no application code was edited during this turn. All changes are provided as design specifications and code snippets.
2. **Prisma Enum Constraint**: In `prisma/schema.prisma`, `CheckInMethod` has two enum values: `QR_SELF` and `USHER_MANUAL`. The client self-service checkin methods (`'QR'`, `'LOOKUP_4DIGIT'`, `'ONE_TAP'`) map directly to `CheckInMethod.QR_SELF` in the database.
3. **Framer Motion installation**: `package.json` contains Tailwind v4, React 19, and Lucide React. If Framer Motion is introduced for page transitions, it must be verified against React 19 compatibility (`motion` or `framer-motion@latest`).

---

## 4. Conclusion & Actionable Design Specifications

### 4.1 Proposed `lib/geo.ts` Enhancement
Add the alias export at the bottom of `lib/geo.ts`:
```ts
/**
 * Alias export conforming to Milestone 2 attendance and test specifications.
 */
export const isWithinGeofence = isWithinChurchGeofence;
```

### 4.2 Proposed `app/actions/attendance.ts` Implementation Plan

```ts
// -------------------------------------------------------------
// 1. Phone Suffix Lookup Action
// -------------------------------------------------------------
export async function lookupByPhoneSuffix(phoneSuffix: string) {
  try {
    const cleanDigits = phoneSuffix.replace(/\D/g, '');
    if (cleanDigits.length !== 4) {
      return { success: false, error: 'Please enter exactly 4 digits.', count: 0, members: [] };
    }

    const church = await prisma.church.findFirst();
    if (!church) {
      return { success: false, error: 'Church not found.', count: 0, members: [] };
    }

    const members = await prisma.person.findMany({
      where: {
        churchId: church.id,
        isActive: true,
        OR: [
          { phoneLast4: cleanDigits },
          { phone: { endsWith: cleanDigits } },
        ],
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        phone: true,
        phoneLast4: true,
        category: true,
        subCategory: true,
        status: true,
        photoUrl: true,
      },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    });

    return {
      success: true,
      count: members.length,
      members,
    };
  } catch (error) {
    console.error('Error looking up member by phone suffix:', error);
    return { success: false, error: 'Failed to lookup member.', count: 0, members: [] };
  }
}

// Backward-compatible alias
export const lookupMemberByLast4Action = lookupByPhoneSuffix;

// -------------------------------------------------------------
// 2. Attendance Check-In Action
// -------------------------------------------------------------
export interface RegisterAttendanceParams {
  personId: string;
  latitude?: number;
  longitude?: number;
  method: 'QR' | 'LOOKUP_4DIGIT' | 'ONE_TAP';
  serviceScheduleId?: string;
  subClass?: string;
}

export async function registerAttendance({
  personId,
  latitude,
  longitude,
  method,
  serviceScheduleId,
  subClass,
}: RegisterAttendanceParams) {
  try {
    const church = await prisma.church.findFirst();
    if (!church) {
      return { success: false, error: 'Church configuration not found.' };
    }

    // 1. Server-Side Geofence Enforcement
    if (latitude === undefined || longitude === undefined) {
      return {
        success: false,
        error: 'Location permission is required to confirm you are on church premises.',
      };
    }

    const geoCheck = isWithinChurchGeofence(
      { latitude, longitude },
      { latitude: church.latitude, longitude: church.longitude },
      church.geofenceRadius || 150
    );

    if (!geoCheck.isAllowed) {
      return {
        success: false,
        error: `Check-in rejected: You are ${geoCheck.distanceMeters}m away from church premises. Must be within ${church.geofenceRadius || 150}m.`,
        distanceMeters: geoCheck.distanceMeters,
      };
    }

    // 2. Resolve Target Service
    let targetScheduleId = serviceScheduleId;
    if (!targetScheduleId) {
      const activeResult = await getActiveChurchService(church.id, new Date());
      if (activeResult.activeService) {
        targetScheduleId = activeResult.activeService.id;
      } else if (activeResult.fallbackService) {
        targetScheduleId = activeResult.fallbackService.id;
      } else {
        return { success: false, error: 'No church service is currently active or available.' };
      }
    }

    const [person, targetSchedule] = await Promise.all([
      prisma.person.findUnique({ where: { id: personId } }),
      prisma.serviceSchedule.findUnique({ where: { id: targetScheduleId } }),
    ]);

    if (!person || !targetSchedule) {
      return { success: false, error: 'Member or Service Schedule not found.' };
    }

    // 3. Workers' Meeting Integrity Routing
    let actualScheduleId = targetSchedule.id;
    let actualSchedule = targetSchedule;
    let isEarlyBird = false;

    if (targetSchedule.name.toLowerCase().includes('workers')) {
      const isWorker =
        person.category === 'WORKER' ||
        person.subCategory === 'WORKER' ||
        person.subCategory === 'YOUTH_WORKER' ||
        person.subCategory === 'ADULT_WORKER';

      if (!isWorker) {
        const nextService = await prisma.serviceSchedule.findFirst({
          where: {
            churchId: church.id,
            dayOfWeek: targetSchedule.dayOfWeek,
            startTime: { gt: targetSchedule.startTime },
          },
          orderBy: { startTime: 'asc' },
        });

        if (nextService) {
          actualScheduleId = nextService.id;
          actualSchedule = nextService;
          isEarlyBird = true;
        }
      }
    }

    // 4. WAT Africa/Lagos Duplicate Prevention
    const todayWAT = getNigerianDateMidnight();

    const existing = await prisma.attendanceRecord.findFirst({
      where: {
        personId,
        serviceScheduleId: actualScheduleId,
        date: todayWAT,
      },
    });

    if (existing) {
      return {
        success: false,
        alreadyCheckedIn: true,
        error: isEarlyBird
          ? `Early arrival already recorded! You are already checked in for ${actualSchedule.name} today.`
          : `Attendance already recorded! You have already marked your attendance for ${actualSchedule.name} today.`,
        serviceId: actualSchedule.id,
        serviceName: actualSchedule.name,
      };
    }

    // 5. Database Record Creation with Concurrency Handling
    const record = await prisma.attendanceRecord.create({
      data: {
        churchId: church.id,
        personId,
        serviceScheduleId: actualScheduleId,
        date: todayWAT,
        subClass: subClass || null,
        method: CheckInMethod.QR_SELF,
      },
      include: {
        person: true,
        serviceSchedule: true,
      },
    });

    return {
      success: true,
      alreadyCheckedIn: false,
      isEarlyBird,
      serviceId: actualSchedule.id,
      serviceName: actualSchedule.name,
      personId: record.person.id,
      personName: `${record.person.firstName} ${record.person.lastName || ''}`.trim(),
      message: isEarlyBird
        ? `Early arrival confirmed! Welcome, ${record.person.firstName}. Your attendance has been logged for ${actualSchedule.name}.`
        : `Welcome, ${record.person.firstName}! You have been checked in for ${record.serviceSchedule.name}.`,
    };
  } catch (error: any) {
    if (error?.code === 'P2002') {
      return {
        success: false,
        alreadyCheckedIn: true,
        error: 'Attendance already recorded for this service today.',
      };
    }
    console.error('Error during registerAttendance:', error);
    return { success: false, error: 'Failed to record attendance.' };
  }
}

// Backward-compatible alias
export async function selfCheckInAction(params: {
  personId: string;
  serviceScheduleId: string;
  subClass?: string;
  userLatitude?: number;
  userLongitude?: number;
}) {
  return registerAttendance({
    personId: params.personId,
    serviceScheduleId: params.serviceScheduleId,
    subClass: params.subClass,
    latitude: params.userLatitude,
    longitude: params.userLongitude,
    method: 'LOOKUP_4DIGIT',
  });
}
```

### 4.3 Proposed Anti-Proxy Helper Module (`lib/device-lock.ts`)
To isolate device lock logic cleanly from UI components:

```ts
import { getNigerianDateString } from './service-resolver';

export const DEVICE_LOCK_STORAGE_KEY = 'rccg_attendance_device_lock';
export const LEGACY_LOCK_STORAGE_KEY = 'rccg_completed_checkin';

export interface DeviceAttendanceLock {
  serviceId: string;
  serviceName: string;
  serviceDate: string; // YYYY-MM-DD
  checkedInPersonId: string;
  checkedInName: string;
  phoneLast4?: string;
  timestamp: number;
  method?: 'QR' | 'LOOKUP_4DIGIT' | 'ONE_TAP';
}

export function getDeviceAttendanceLock(): DeviceAttendanceLock | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(DEVICE_LOCK_STORAGE_KEY) || localStorage.getItem(LEGACY_LOCK_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const todayWAT = getNigerianDateString();

    // Expired if from an earlier day
    if (parsed.serviceDate && parsed.serviceDate !== todayWAT) {
      clearDeviceAttendanceLock();
      return null;
    }
    if (parsed.date && parsed.date !== todayWAT) {
      clearDeviceAttendanceLock();
      return null;
    }

    return {
      serviceId: parsed.serviceId,
      serviceName: parsed.serviceName,
      serviceDate: parsed.serviceDate || parsed.date,
      checkedInPersonId: parsed.checkedInPersonId || parsed.personId,
      checkedInName: parsed.checkedInName || parsed.name,
      phoneLast4: parsed.phoneLast4,
      timestamp: parsed.timestamp || Date.now(),
      method: parsed.method || 'LOOKUP_4DIGIT',
    };
  } catch {
    return null;
  }
}

export function setDeviceAttendanceLock(lock: DeviceAttendanceLock): void {
  if (typeof window === 'undefined') return;
  try {
    const payload = JSON.stringify(lock);
    localStorage.setItem(DEVICE_LOCK_STORAGE_KEY, payload);
    localStorage.setItem(LEGACY_LOCK_STORAGE_KEY, payload); // Sync legacy
  } catch (e) {
    console.warn('Unable to store device lock', e);
  }
}

export function clearDeviceAttendanceLock(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(DEVICE_LOCK_STORAGE_KEY);
    localStorage.removeItem(LEGACY_LOCK_STORAGE_KEY);
  } catch (e) {
    console.warn('Unable to remove device lock', e);
  }
}

export function isDeviceLockedForService(activeServiceId: string | null | undefined): boolean {
  if (!activeServiceId) return false;
  const lock = getDeviceAttendanceLock();
  if (!lock) return false;
  return lock.serviceId === activeServiceId;
}
```

### 4.4 Proposed Unit Test Suite (`tests/unit/attendance.test.ts`)
The complete test blueprint for Vitest:
```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { calculateDistanceInMeters, isWithinChurchGeofence } from '@/lib/geo';
import { lookupByPhoneSuffix, registerAttendance } from '@/app/actions/attendance';
import { mockPrisma } from '../helpers/prisma-mock';
import { getNigerianDateMidnight, getNigerianDateString } from '@/lib/service-resolver';

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
        { id: 'person-1', firstName: 'David', lastName: 'Adeleke', phoneLast4: '4567', category: 'YOUTH', status: 'MEMBER' },
      ]);

      const res = await lookupByPhoneSuffix('4567');
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
  });
});
```

---

## 5. Verification Method

To independently verify the architecture and specifications outlined in this handoff:

1. **Verify Geofence preservation & Haversine distance arithmetic**:
   Inspect `lib/geo.ts`: Verify lines 43, 69, 77, 78 confirm `EARTH_RADIUS_METERS = 6371e3`, `baseRadius = 150`, `hysteresisBuffer = 35`.
2. **Verify Nigerian WAT Timezone scheduling**:
   Inspect `lib/service-resolver.ts`: Confirm lines 34-37 use `Intl.DateTimeFormat` with `timeZone: 'Africa/Lagos'`.
3. **Verify Database schema constraints**:
   Inspect `prisma/schema.prisma`: Confirm line 184 has `@@unique([personId, serviceScheduleId, date])`.
4. **Execute Test Suite**:
   Run `npm test` from project root to verify all existing unit and adversarial test suites pass.
5. **Invalidation Conditions**:
   - Any modification changing church latitude from `6.5244` or longitude from `3.3792`.
   - Modifying base radius away from `150m`.
   - Modifying timezone resolution away from Africa/Lagos UTC+1.
   - Removing the compound unique constraint on attendance records.
