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
    const raw =
      localStorage.getItem(DEVICE_LOCK_STORAGE_KEY) ||
      localStorage.getItem(LEGACY_LOCK_STORAGE_KEY);
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

export function isDeviceLockedForService(
  activeServiceId: string | null | undefined
): boolean {
  if (!activeServiceId) return false;
  const lock = getDeviceAttendanceLock();
  if (!lock) return false;
  return lock.serviceId === activeServiceId;
}
