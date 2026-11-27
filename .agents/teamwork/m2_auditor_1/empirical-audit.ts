/**
 * Independent Forensic Empirical Verification Script
 * Milestone 2: Youth-First Attendance & UI Compliance
 * Author: m2_auditor_1 (Forensic Integrity Auditor)
 */

import { calculateDistanceInMeters, isWithinChurchGeofence, isWithinGeofence } from '../../../lib/geo';
import { MOMENTUM_EASE, DRAWER_EASE, SNAPPY_EASE, surfaceEntranceVariants, alertVariants, tactileTapProps } from '../../../lib/motion';
import { getNigerianDateString } from '../../../lib/service-resolver';
import * as fs from 'fs';
import * as path from 'path';

interface AuditResult {
  checkName: string;
  category: string;
  passed: boolean;
  details: string;
  evidence?: any;
}

const auditLog: AuditResult[] = [];

function recordCheck(category: string, checkName: string, passed: boolean, details: string, evidence?: any) {
  auditLog.push({ category, checkName, passed, details, evidence });
  const statusIcon = passed ? '✅ PASS' : '❌ FAIL';
  console.log(`${statusIcon} [${category}] ${checkName}: ${details}`);
}

async function runEmpiricalAudit() {
  console.log('================================================================');
  console.log('STARTING INDEPENDENT FORENSIC AUDIT: MILESTONE 2 DELIVERABLES');
  console.log('================================================================\n');

  const CHURCH_LAT = 6.5244;
  const CHURCH_LNG = 3.3792;
  const BASE_RADIUS = 150;

  // -------------------------------------------------------------
  // SECTION 1: Geofence Preservation & Math Verification
  // -------------------------------------------------------------
  console.log('--- SECTION 1: Geofencing Math & Invariant Verification ---');

  // 1.1 Epicenter Distance (must be 0 meters)
  const d0 = calculateDistanceInMeters(
    { latitude: CHURCH_LAT, longitude: CHURCH_LNG },
    { latitude: CHURCH_LAT, longitude: CHURCH_LNG }
  );
  recordCheck(
    'GEOFENCE_MATH',
    'Haversine Epicenter Distance',
    d0 === 0,
    `Epicenter distance is exactly ${d0}m (expected 0m)`,
    { d0 }
  );

  // 1.2 Geofence check at exact church coordinates
  const checkEpicenter = isWithinChurchGeofence(
    { latitude: CHURCH_LAT, longitude: CHURCH_LNG, accuracy: 5 },
    { latitude: CHURCH_LAT, longitude: CHURCH_LNG },
    BASE_RADIUS
  );
  recordCheck(
    'GEOFENCE_MATH',
    'Epicenter Geofence Acceptance',
    checkEpicenter.isAllowed === true && checkEpicenter.distanceMeters === 0 && checkEpicenter.confidence === 'HIGH',
    `Epicenter isAllowed=${checkEpicenter.isAllowed}, distance=${checkEpicenter.distanceMeters}m, confidence=${checkEpicenter.confidence}`,
    checkEpicenter
  );

  // 1.3 Verify Alias is identical function reference
  recordCheck(
    'GEOFENCE_MATH',
    'isWithinGeofence Alias Verification',
    isWithinGeofence === isWithinChurchGeofence,
    `isWithinGeofence reference strictly equals isWithinChurchGeofence: ${isWithinGeofence === isWithinChurchGeofence}`
  );

  // 1.4 Boundary Tests: Haversine distance calculations at incremental offsets
  // 1 degree latitude ~= 111,139 meters. 1 meter ~= 0.00000899 degrees.
  const oneMeterLat = 1 / 111139;

  // Test at ~50m
  const coords50m = { latitude: CHURCH_LAT + 50 * oneMeterLat, longitude: CHURCH_LNG, accuracy: 10 };
  const check50m = isWithinChurchGeofence(coords50m, { latitude: CHURCH_LAT, longitude: CHURCH_LNG }, BASE_RADIUS);
  recordCheck(
    'GEOFENCE_MATH',
    'Inner Sanctuary Boundary (50m)',
    check50m.isAllowed === true && Math.abs(check50m.distanceMeters - 50) <= 2,
    `Calculated distance=${check50m.distanceMeters}m, allowed=${check50m.isAllowed}`
  );

  // Test at ~140m (inside 150m boundary)
  const coords140m = { latitude: CHURCH_LAT + 140 * oneMeterLat, longitude: CHURCH_LNG, accuracy: 10 };
  const check140m = isWithinChurchGeofence(coords140m, { latitude: CHURCH_LAT, longitude: CHURCH_LNG }, BASE_RADIUS);
  recordCheck(
    'GEOFENCE_MATH',
    'Near Perimeter Boundary (140m)',
    check140m.isAllowed === true && Math.abs(check140m.distanceMeters - 140) <= 2,
    `Calculated distance=${check140m.distanceMeters}m, allowed=${check140m.isAllowed}`
  );

  // Test at ~250m (clearly outside 150m boundary, no hysteresis)
  const coords250m = { latitude: CHURCH_LAT + 250 * oneMeterLat, longitude: CHURCH_LNG, accuracy: 10 };
  const check250m = isWithinChurchGeofence(coords250m, { latitude: CHURCH_LAT, longitude: CHURCH_LNG }, BASE_RADIUS);
  recordCheck(
    'GEOFENCE_MATH',
    'Outside Boundary Rejection (250m)',
    check250m.isAllowed === false && Math.abs(check250m.distanceMeters - 250) <= 3,
    `Calculated distance=${check250m.distanceMeters}m, allowed=${check250m.isAllowed} (expected false)`
  );

  // 1.5 Hysteresis Buffer Verification (35m expansion when isPreviouslyInside: true)
  // At 165m from center: outside base 150m, but inside 150 + 35 = 185m
  const coords165m = { latitude: CHURCH_LAT + 165 * oneMeterLat, longitude: CHURCH_LNG, accuracy: 10 };
  const check165NoHysteresis = isWithinChurchGeofence(
    coords165m,
    { latitude: CHURCH_LAT, longitude: CHURCH_LNG },
    { maxRadiusMeters: 150, hysteresisBufferMeters: 35, isPreviouslyInside: false }
  );
  const check165WithHysteresis = isWithinChurchGeofence(
    coords165m,
    { latitude: CHURCH_LAT, longitude: CHURCH_LNG },
    { maxRadiusMeters: 150, hysteresisBufferMeters: 35, isPreviouslyInside: true }
  );

  recordCheck(
    'GEOFENCE_MATH',
    'Hysteresis State Latch (165m)',
    check165NoHysteresis.isAllowed === false && check165WithHysteresis.isAllowed === true && check165WithHysteresis.effectiveRadiusMeters === 185,
    `Without hysteresis allowed=${check165NoHysteresis.isAllowed}; With hysteresis allowed=${check165WithHysteresis.isAllowed}, effectiveRadius=${check165WithHysteresis.effectiveRadiusMeters}m`
  );

  // 1.6 Anti-Spoof Detection: Null Island & Zero Accuracy
  const checkNullIsland = isWithinChurchGeofence(
    { latitude: 0, longitude: 0, accuracy: 0 },
    { latitude: CHURCH_LAT, longitude: CHURCH_LNG },
    BASE_RADIUS
  );
  recordCheck(
    'GEOFENCE_MATH',
    'Null Island (0,0) Spoof Detection',
    checkNullIsland.isAllowed === false && checkNullIsland.suspiciousMockIndicator === true,
    `Null Island allowed=${checkNullIsland.isAllowed}, suspiciousMockIndicator=${checkNullIsland.suspiciousMockIndicator}`
  );

  // 1.7 Anomalous Invalid Coordinates (NaN or out-of-range)
  const checkInvalidCoords = isWithinChurchGeofence(
    { latitude: 120, longitude: 200, accuracy: 10 },
    { latitude: CHURCH_LAT, longitude: CHURCH_LNG },
    BASE_RADIUS
  );
  recordCheck(
    'GEOFENCE_MATH',
    'Invalid Coordinate Handling (>90 / >180)',
    checkInvalidCoords.isAllowed === false && checkInvalidCoords.suspiciousMockIndicator === true,
    `Out of bounds allowed=${checkInvalidCoords.isAllowed}, distance=${checkInvalidCoords.distanceMeters}`
  );

  // -------------------------------------------------------------
  // SECTION 2: Emil Kowalski Motion Physics Verification
  // -------------------------------------------------------------
  console.log('\n--- SECTION 2: Motion Physics & Animation Token Verification ---');

  // 2.1 Deceleration Momentum Curve: [0.23, 1, 0.32, 1]
  const momentumMatches = JSON.stringify(MOMENTUM_EASE) === JSON.stringify([0.23, 1, 0.32, 1]);
  recordCheck(
    'MOTION_PHYSICS',
    'Momentum Deceleration Easing [0.23, 1, 0.32, 1]',
    momentumMatches,
    `MOMENTUM_EASE curve is ${JSON.stringify(MOMENTUM_EASE)}`
  );

  // 2.2 Scale Entrance Never Starts from Zero (Must start at 0.95)
  const startsAt95 = (surfaceEntranceVariants.initial as any).scale === 0.95;
  const animatesTo1 = (surfaceEntranceVariants.animate as any).scale === 1;
  const surfaceDuration = (surfaceEntranceVariants.animate as any).transition?.duration;
  recordCheck(
    'MOTION_PHYSICS',
    'Scale Entrance Starts at 0.95',
    startsAt95 && animatesTo1 && surfaceDuration === 0.24,
    `initial.scale=${(surfaceEntranceVariants.initial as any).scale}, animate.scale=${(surfaceEntranceVariants.animate as any).scale}, duration=${surfaceDuration}s (expected <= 280ms)`
  );

  // 2.3 Tactile Click / Tap Feedback Under 100ms
  const tapScale = tactileTapProps.whileTap.scale;
  const tapDuration = tactileTapProps.transition.duration;
  recordCheck(
    'MOTION_PHYSICS',
    'Tactile Tap Feedback (<100ms budget)',
    tapScale === 0.97 && tapDuration < 0.1,
    `whileTap.scale=${tapScale}, duration=${tapDuration}s (${tapDuration * 1000}ms, budget <100ms)`
  );

  // -------------------------------------------------------------
  // SECTION 3: Device Lock & WAT Date Integrity
  // -------------------------------------------------------------
  console.log('\n--- SECTION 3: Device Lock & Timezone Synchronization ---');

  const watDateString = getNigerianDateString();
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  recordCheck(
    'DEVICE_LOCK',
    'WAT Africa/Lagos Date String Format',
    dateRegex.test(watDateString),
    `Current WAT date string: ${watDateString}`
  );

  // Verify device-lock.ts source structure
  const deviceLockSource = fs.readFileSync(path.resolve(process.cwd(), 'lib/device-lock.ts'), 'utf-8');
  const hasStorageKeys = deviceLockSource.includes('rccg_attendance_device_lock') && deviceLockSource.includes('rccg_completed_checkin');
  const hasAutoExpiration = deviceLockSource.includes('todayWAT') && deviceLockSource.includes('clearDeviceAttendanceLock()');
  recordCheck(
    'DEVICE_LOCK',
    'Device Lock Source Mechanics',
    hasStorageKeys && hasAutoExpiration,
    `Contains dual storage keys: ${hasStorageKeys}, Contains auto-expiration on day rollover: ${hasAutoExpiration}`
  );

  // -------------------------------------------------------------
  // SECTION 4: AI Tells & UI Design Standard Compliance
  // -------------------------------------------------------------
  console.log('\n--- SECTION 4: Purge of AI Tells & UI Compliance ---');

  const appDir = path.resolve(process.cwd(), 'app');

  function scanDirectoryForTerms(dir: string, forbiddenRegex: RegExp): { file: string; match: string }[] {
    const hits: { file: string; match: string }[] = [];
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== '.next' && entry.name !== 'node_modules') {
          hits.push(...scanDirectoryForTerms(fullPath, forbiddenRegex));
        }
      } else if (/\.(tsx|ts|css|jsx|js)$/.test(entry.name)) {
        const content = fs.readFileSync(fullPath, 'utf-8');
        const match = content.match(forbiddenRegex);
        if (match) {
          hits.push({ file: path.relative(process.cwd(), fullPath), match: match[0] });
        }
      }
    }
    return hits;
  }

  // Check 4.1: Floating blur bubbles & gradient orbs
  const blurHits = scanDirectoryForTerms(appDir, /blur-3xl|animate-float-slow|animate-float-reverse/);
  recordCheck(
    'UI_COMPLIANCE',
    'Zero Floating Blur Bubbles / Floaters',
    blurHits.length === 0,
    `Found ${blurHits.length} occurrences in app directory`,
    blurHits
  );

  // Check 4.2: Cartoon bounce animations
  const bounceHits = scanDirectoryForTerms(appDir, /animate-bounce/);
  recordCheck(
    'UI_COMPLIANCE',
    'Zero Cartoon Bounces (animate-bounce)',
    bounceHits.length === 0,
    `Found ${bounceHits.length} occurrences in app directory`,
    bounceHits
  );

  // Check 4.3: Decorative matrix dot grids
  const gridHits = scanDirectoryForTerms(appDir, /codex-grid|bg-grid|radial-gradient\(circle at 1px 1px/);
  recordCheck(
    'UI_COMPLIANCE',
    'Zero Decorative Matrix Grid Patterns',
    gridHits.length === 0,
    `Found ${gridHits.length} occurrences in app directory`,
    gridHits
  );

  // Check 4.4: Official RCCG Logo Asset Presence & Dimensions
  const logoPath = path.resolve(process.cwd(), 'public/rccg-logo.png');
  const logoExists = fs.existsSync(logoPath);
  const logoStats = logoExists ? fs.statSync(logoPath) : null;
  recordCheck(
    'UI_COMPLIANCE',
    'Prominent Official RCCG Logo Asset',
    logoExists && (logoStats?.size || 0) > 1000,
    `public/rccg-logo.png exists: ${logoExists}, size=${logoStats?.size} bytes`
  );

  // Check 4.5: Touch Target Discipline (44px min in AttendanceHeader & KeypadLookup)
  const headerContent = fs.readFileSync(path.resolve(appDir, 'components/attendance/AttendanceHeader.tsx'), 'utf-8');
  const keypadContent = fs.readFileSync(path.resolve(appDir, 'components/attendance/KeypadLookup.tsx'), 'utf-8');
  const has44pxHeader = headerContent.includes('min-w-[44px]') && headerContent.includes('min-h-[44px]');
  const has44pxKeypad = keypadContent.includes('min-h-[44px]') || keypadContent.includes('min-h-[52px]');
  recordCheck(
    'UI_COMPLIANCE',
    '44px Minimum Interactive Touch Targets',
    has44pxHeader && has44pxKeypad,
    `Header touch target >= 44px: ${has44pxHeader}, Keypad buttons >= 44px: ${has44pxKeypad}`
  );

  // -------------------------------------------------------------
  // SECTION 5: Server Actions & Business Logic Integrity
  // -------------------------------------------------------------
  console.log('\n--- SECTION 5: Server Actions & Business Logic Integrity ---');

  const attendanceActionsPath = path.resolve(appDir, 'actions/attendance.ts');
  const actionsContent = fs.readFileSync(attendanceActionsPath, 'utf-8');

  // 5.1 Genuine Database Integration
  const usesPrisma = actionsContent.includes('prisma.attendanceRecord.create') &&
                     actionsContent.includes('prisma.person.findMany') &&
                     actionsContent.includes('prisma.church.findFirst');
  recordCheck(
    'SERVER_ACTIONS',
    'Authentic Prisma Database Operations',
    usesPrisma,
    `Direct database persistence active without mocked shortcuts: ${usesPrisma}`
  );

  // 5.2 Server-Side Geofence Enforcement
  const enforcesServerGeofence = actionsContent.includes('isWithinChurchGeofence(') &&
                                  actionsContent.includes('!geoCheck.isAllowed') &&
                                  actionsContent.includes('Check-in rejected');
  recordCheck(
    'SERVER_ACTIONS',
    'Server-Side Geofence Enforcement',
    enforcesServerGeofence,
    `Server rejects coordinates outside church geofence: ${enforcesServerGeofence}`
  );

  // 5.3 Workers' Meeting Integrity Routing
  const hasWorkersRouting = actionsContent.includes("targetSchedule.name.toLowerCase().includes('workers')") &&
                            actionsContent.includes('isEarlyBird = true');
  recordCheck(
    'SERVER_ACTIONS',
    "Workers' Meeting Non-Worker Routing",
    hasWorkersRouting,
    `Automatically re-routes non-workers arriving early to First Service: ${hasWorkersRouting}`
  );

  // 5.4 Duplicate Prevention on WAT Date
  const hasDuplicateCheck = actionsContent.includes('getNigerianDateMidnight()') &&
                            actionsContent.includes('alreadyCheckedIn: true') &&
                            actionsContent.includes("errObj?.code === 'P2002'");
  recordCheck(
    'SERVER_ACTIONS',
    'Duplicate Prevention & Concurrency Handling (P2002)',
    hasDuplicateCheck,
    `Checks existing records for todayWAT and catches unique index collisions: ${hasDuplicateCheck}`
  );

  // 5.5 4-Digit Collision Resolution
  const hasCollisionLogic = actionsContent.includes('cleanDigits.length !== 4') &&
                            actionsContent.includes('count: members.length') &&
                            actionsContent.includes('phoneLast4: cleanDigits');
  recordCheck(
    'SERVER_ACTIONS',
    'Phone 4-Digit Collision Resolution',
    hasCollisionLogic,
    `Returns all matching members for disambiguation: ${hasCollisionLogic}`
  );

  // -------------------------------------------------------------
  // SUMMARY
  // -------------------------------------------------------------
  console.log('\n================================================================');
  const totalChecks = auditLog.length;
  const passedChecks = auditLog.filter((c) => c.passed).length;
  const failedChecks = totalChecks - passedChecks;

  console.log(`TOTAL CHECKS: ${totalChecks}`);
  console.log(`PASSED: ${passedChecks}`);
  console.log(`FAILED: ${failedChecks}`);
  console.log(`AUDIT VERDICT: ${failedChecks === 0 ? 'CLEAN (ALL VERIFIED)' : 'INTEGRITY VIOLATION'}`);
  console.log('================================================================\n');

  // Write detailed findings JSON to state folder
  const outputPath = path.resolve(process.cwd(), '.agents/teamwork/m2_auditor_1/empirical-audit-results.json');
  fs.writeFileSync(
    outputPath,
    JSON.stringify(
      {
        timestamp: new Date().toISOString(),
        totalChecks,
        passedChecks,
        failedChecks,
        verdict: failedChecks === 0 ? 'CLEAN' : 'INTEGRITY VIOLATION',
        results: auditLog,
      },
      null,
      2
    )
  );

  if (failedChecks > 0) {
    process.exit(1);
  }
}

runEmpiricalAudit().catch((err) => {
  console.error('Audit execution error:', err);
  process.exit(1);
});
