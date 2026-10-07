/**
 * Production-Grade Geofence Calculator & Anti-Cheat Engine
 * 
 * Features:
 * 1. Haversine spherical distance calculation (Earth radius: 6,371km).
 * 2. Hysteresis (boundary flapping / edge jitter mitigation):
 *    - Strict entry radius (e.g. 150m)
 *    - Expanded exit buffer (e.g. 185m) to prevent fluttering at the fence edge.
 * 3. Accuracy Cushion:
 *    - Accounts for indoor/roof GPS degradation (e.g. ±15m-25m jitter).
 * 4. Spoofing & Anomaly Detection:
 *    - Flags Null Island (0,0), impossible coordinates, and zero-accuracy artifacts.
 */

export interface Coordinates {
  latitude: number;
  longitude: number;
  accuracy?: number; // In meters, as reported by navigator.geolocation
}

export interface GeofenceOptions {
  maxRadiusMeters?: number;          // Standard church geofence radius (e.g. 150m)
  hysteresisBufferMeters?: number;   // Extra buffer when user was previously validated inside (e.g. 35m)
  isPreviouslyInside?: boolean;      // State latch flag to prevent boundary flutter
}

export interface GeofenceCheckResult {
  isAllowed: boolean;
  distanceMeters: number;
  effectiveRadiusMeters: number;
  accuracyMeters: number;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  suspiciousMockIndicator?: boolean;
}

/**
 * Calculates accurate great-circle distance between two GPS coordinates using the Haversine formula.
 */
export function calculateDistanceInMeters(
  pointA: Coordinates,
  pointB: Coordinates
): number {
  const EARTH_RADIUS_METERS = 6371e3;

  const lat1Rad = (pointA.latitude * Math.PI) / 180;
  const lat2Rad = (pointB.latitude * Math.PI) / 180;

  const deltaLat = ((pointB.latitude - pointA.latitude) * Math.PI) / 180;
  const deltaLng = ((pointB.longitude - pointA.longitude) * Math.PI) / 180;

  const a =
    Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
    Math.cos(lat1Rad) *
      Math.cos(lat2Rad) *
      Math.sin(deltaLng / 2) *
      Math.sin(deltaLng / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return Math.round(EARTH_RADIUS_METERS * c);
}

/**
 * Validates whether user coordinates fall within the church geofence with edge-jitter mitigation.
 */
export function isWithinChurchGeofence(
  userCoords: Coordinates,
  churchCoords: Coordinates,
  optionsOrRadius: number | GeofenceOptions = 150
): GeofenceCheckResult {
  // Normalize options
  const options: GeofenceOptions =
    typeof optionsOrRadius === 'number'
      ? { maxRadiusMeters: optionsOrRadius }
      : optionsOrRadius;

  const baseRadius = options.maxRadiusMeters ?? 150;
  const hysteresisBuffer = options.hysteresisBufferMeters ?? 35;
  const isPreviouslyInside = options.isPreviouslyInside ?? false;

  // 1. Sanity check for anomalous or spoofed inputs
  const isInvalidCoords =
    isNaN(userCoords.latitude) ||
    isNaN(userCoords.longitude) ||
    Math.abs(userCoords.latitude) > 90 ||
    Math.abs(userCoords.longitude) > 180;

  // Null Island (0,0) or exact zero accuracy often indicates mock location injector artifacts
  const isSuspicious =
    (userCoords.latitude === 0 && userCoords.longitude === 0) ||
    userCoords.accuracy === 0;

  if (isInvalidCoords) {
    return {
      isAllowed: false,
      distanceMeters: Infinity,
      effectiveRadiusMeters: baseRadius,
      accuracyMeters: 0,
      confidence: 'LOW',
      suspiciousMockIndicator: true,
    };
  }

  // 2. Compute Haversine distance
  const distanceMeters = calculateDistanceInMeters(userCoords, churchCoords);
  const accuracy = Math.max(0, userCoords.accuracy ?? 15);

  // 3. Compute Hysteresis Boundary:
  // If user was already verified inside during this session, use exit boundary (base + hysteresis)
  // to avoid fluttering in/out due to GPS drift at the back pew or church gate.
  const effectiveRadius = isPreviouslyInside
    ? baseRadius + hysteresisBuffer
    : baseRadius;

  // 4. Accuracy Cushion:
  // Indoor sanctuary roofs degrade GPS accuracy. We allow up to 20m of reported uncertainty cushion.
  const accuracyCushion = Math.min(accuracy * 0.5, 20);
  const adjustedDistance = Math.max(0, distanceMeters - accuracyCushion);

  const isAllowed = adjustedDistance <= effectiveRadius;

  // 5. Compute Confidence Level
  let confidence: 'HIGH' | 'MEDIUM' | 'LOW' = 'HIGH';
  if (accuracy > 100) {
    confidence = 'LOW'; // Cell tower fallback, poor accuracy
  } else if (accuracy > 35) {
    confidence = 'MEDIUM';
  }

  return {
    isAllowed,
    distanceMeters,
    effectiveRadiusMeters: effectiveRadius,
    accuracyMeters: accuracy,
    confidence,
    suspiciousMockIndicator: isSuspicious,
  };
}
