## 2026-11-12T15:42:05Z
You are an Explorer for Milestone 2: Youth-First Attendance & UI Compliance in the RCCG Jesus Covenant Zone CMS.

MANDATORY FIRST STEP:
Read the verbatim user request at:
c:\Users\dafen\OneDrive\Desktop\church-management-system\.agents\teamwork\ORIGINAL_REQUEST.md
Also read the project architecture and milestone scope at:
c:\Users\dafen\OneDrive\Desktop\church-management-system\.agents\teamwork\orchestrator\PROJECT.md

YOUR STATE FOLDER:
c:\Users\dafen\OneDrive\Desktop\church-management-system\.agents\teamwork\m2_explorer_2/

YOUR OBJECTIVE:
Investigate and design the Anti-Proxy Lock, Geofencing, and Attendance Server Actions for Milestone 2:
1. Examine `lib/geo.ts` and `lib/service-resolver.ts`:
   - HARD CONSTRAINT: Coordinates `6.5244, 3.3792`, base radius `150m` (with 35m hysteresis and 20m indoor cushion), and WAT Africa/Lagos UTC+1 time resolution must NEVER be modified or broken.
   - Investigate how browser Geolocation API (`navigator.geolocation.getCurrentPosition` with highAccuracy) interfaces with `isWithinGeofence` and client-side feedback (GPS warming, distance indicator, outside warning).
2. Examine and design `app/actions/attendance.ts`:
   - Investigate lookup by 4-digit phone suffix (`lookupByPhoneSuffix` or equivalent): database query finding active members by `phone.endsWith(suffix)`. Handle collisions cleanly.
   - Investigate check-in action (`registerAttendance`): receives `personId`, `latitude`, `longitude`, `method` ('QR' | 'LOOKUP_4DIGIT' | 'ONE_TAP'), and validates geofence on server side using `isWithinGeofence`.
   - Prevent duplicate check-in for the same service on the same calendar day in WAT timezone.
3. Design the Anti-Proxy Lock mechanism:
   - Client device lock stored in `localStorage` (e.g., `rccg_attendance_device_lock`: { serviceId: string, serviceDate: string, checkedInPersonId: string, timestamp: number }).
   - Prevents one device from checking in multiple different people in the same service session (anti-proxy protection), while allowing account switching if explicitly cleared or when a new service starts.
4. Define test cases needed in `tests/unit/attendance.test.ts` and component mocks.
5. DO NOT modify any code files directly. Write your complete handoff report to `c:\Users\dafen\OneDrive\Desktop\church-management-system\.agents\teamwork\m2_explorer_2\handoff.md` and send a summary message when complete.
