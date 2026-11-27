/**
 * Authorized Follow-Up Cron Route Handler
 * Endpoint: /api/cron/follow-up
 * RCCG Jesus Covenant Zone (Milestone 3 / Requirement R2 & R3)
 *
 * Security:
 * - Validates `Authorization: Bearer <CRON_SECRET>` header.
 * - Supports fallback query parameter `?secret=<CRON_SECRET>`.
 * - Returns HTTP 401 Unauthorized if secret is missing or mismatched.
 *
 * Execution:
 * 1. Runs absence detection radar across active members.
 * 2. Idempotently creates/updates FollowUpTasks with 0-token deterministic message drafts.
 * 3. Sends $0-cost Telegram summary alert (dry-run safe) when new absentees/first-timers are detected.
 * 4. Scans for overdue tasks (>48h) and auto-escalates to Youth President with audit logging.
 * 5. Returns structured JSON telemetry with HTTP 200.
 */

import { NextRequest, NextResponse } from 'next/server';
import { syncFollowUpTasks, executeAutoEscalationScan } from '@/lib/follow-up-engine';

export const dynamic = 'force-dynamic';

function isAuthorized(request: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET;

  // If no secret configured in environment, allow in development/test with default fallback
  const validSecret = cronSecret || (process.env.NODE_ENV !== 'production' ? 'test-cron-secret' : null);

  if (!validSecret) {
    console.error('CRON_SECRET is not configured in environment variables.');
    return false;
  }

  // 1. Check Bearer Authorization header
  const authHeader = request.headers.get('authorization');
  if (authHeader) {
    const parts = authHeader.trim().split(/\s+/);
    if (parts.length === 2 && parts[0]?.toLowerCase() === 'bearer' && parts[1] === validSecret) {
      return true;
    }
    return false;
  }

  // 2. Check x-cron-secret header
  const customHeader = request.headers.get('x-cron-secret');
  if (customHeader === validSecret) {
    return true;
  }

  // 3. Fallback: Check query parameter `?secret=...`
  const searchParams = request.nextUrl.searchParams;
  const querySecret = searchParams.get('secret');
  if (querySecret === validSecret) {
    return true;
  }

  return false;
}

async function handleFollowUpCron(request: NextRequest): Promise<NextResponse> {
  const startTime = Date.now();

  // 1. Enforce Authentication Gate
  if (!isAuthorized(request)) {
    return NextResponse.json(
      {
        success: false,
        error: 'Unauthorized: Invalid or missing authorization header/secret',
        code: 'UNAUTHORIZED',
      },
      { status: 401 }
    );
  }

  try {
    // 2. Run Idempotent Task Synchronization
    const syncResult = await syncFollowUpTasks();

    // 3. Run 48-Hour Auto-Escalation Scanner
    const escalationResult = await executeAutoEscalationScan();

    const durationMs = Date.now() - startTime;

    // 4. Return Structured Telemetry Response
    return NextResponse.json(
      {
        success: true,
        timestamp: new Date().toISOString(),
        durationMs,
        radar: {
          scanned: syncResult.radarResult.stats.scannedCount,
          missed1Week: syncResult.radarResult.stats.missed1WeekCount,
          missed2Weeks: syncResult.radarResult.stats.missed2WeeksCount,
          firstTimers72h: syncResult.radarResult.stats.firstTimers72hCount,
          escalatedCount: syncResult.radarResult.stats.escalatedCount,
          totalAbsentees: syncResult.radarResult.stats.totalAbsentees,
        },
        sync: {
          tasksCreated: syncResult.createdCount,
          tasksUpdated: syncResult.updatedCount,
          skippedDuplicate: syncResult.skippedDuplicate,
          skippedCooldown: syncResult.skippedCooldown,
        },
        escalations: {
          tasksEscalated: escalationResult.escalatedCount,
          taskIds: escalationResult.taskIds,
        },
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Error during follow-up cron execution:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Internal follow-up cron failure',
        durationMs: Date.now() - startTime,
      },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  return handleFollowUpCron(request);
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  return handleFollowUpCron(request);
}
