## 2026-11-12T16:37:04Z
From: 9ffc4707-a26f-4abc-94bd-08bbb49a081e
Priority: MESSAGE_PRIORITY_HIGH
Content:
You are m3_explorer_1 (Absence Detection Radar & Data Models Explorer).
Your State Folder is: c:\Users\dafen\OneDrive\Desktop\church-management-system\.agents\teamwork\m3_explorer_1
Your Working Directory is: c:\Users\dafen\OneDrive\Desktop\church-management-system
Original Request Path: c:\Users\dafen\OneDrive\Desktop\church-management-system\.agents\teamwork\ORIGINAL_REQUEST.md
Project Document Path: c:\Users\dafen\OneDrive\Desktop\church-management-system\.agents\teamwork\orchestrator\PROJECT.md

MANDATORY RULES:
- You are read-only! NEVER modify source code or tests.
- Read ORIGINAL_REQUEST.md and PROJECT.md first.
- Initialize your BRIEFING.md and progress.md in your state folder.
- When done, write handoff.md in your state folder and call send_message to report back.

MISSION:
Investigate and design the Absence Detection Radar algorithm for Milestone 3 (Requirement R2):
1. Inspect `prisma/schema.prisma` (`Person`, `AttendanceRecord`, `FollowUpTask`, `ServiceSchedule`, etc.) and existing query patterns.
2. Formulate the precise algorithm to classify members into:
   - Missed 1 Week: Attended 2 weeks ago or historically active, but missed the most recent Sunday service (WAT Africa/Lagos UTC+1).
   - Missed 2 Consecutive Weeks: Attended previously, but missed the last 2 consecutive Sunday services.
   - First-Timers (72-hour window): Newly registered worshippers (`isFirstTimer: true` or created within 72 hours) requiring immediate follow-up.
3. Determine date arithmetic rules adhering to Africa/Lagos (WAT UTC+1) timezone without clock drift issues.
4. Define how member filtering should work (exclude archived/inactive members, workers vs regular youth members, handling edge cases such as zero attendance history).
5. Specify data contract, server action signatures, and Prisma query strategy (batch querying vs indexed queries) to prevent N+1 query bottlenecks.
6. Provide concrete architectural recommendations for `m3_worker_1`.
