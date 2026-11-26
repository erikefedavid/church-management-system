/**
 * Authorized Birthday Cron Route Handler
 * Endpoint: /api/cron/birthdays
 * RCCG Jesus Covenant Zone (Milestone 4 / Requirement R3)
 *
 * Security:
 * - Validates `Authorization: Bearer <CRON_SECRET>` header.
 * - Supports `x-cron-secret` header.
 * - Supports fallback query parameter `?secret=<CRON_SECRET>`.
 * - Returns HTTP 401 Unauthorized if secret is missing or mismatched.
 *
 * Pipeline Execution:
 * 1. Stage 1 (T-1 Media Alert): Dispatches Markdown notification + photoUrl to Telegram Media Bot.
 * 2. Stage 2 (Day-Of Celebration & Direct DM): Dispatches celebration alert + direct member DM.
 * 3. Idempotently records dispatches in BirthdayReminderLog with @@unique([personId, year, type]).
 * 4. Returns structured JSON telemetry with HTTP 200.
 */

import { NextRequest, NextResponse } from 'next/server';
import { runBirthdayPipeline } from '@/lib/birthday-engine';

export const dynamic = 'force-dynamic';

function isAuthorized(request: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET;
  const validSecret =
    cronSecret || (process.env.NODE_ENV !== 'production' ? 'test-cron-secret' : null);

  if (!validSecret) {
    console.error('CRON_SECRET is not configured in environment variables.');
    return false;
  }

  // 1. Bearer Authorization header
  const authHeader = request.headers.get('authorization');
  if (authHeader) {
    const parts = authHeader.trim().split(/\s+/);
    if (parts.length === 2 && parts[0]?.toLowerCase() === 'bearer' && parts[1] === validSecret) {
      return true;
    }
    return false;
  }

  // 2. x-cron-secret header
  const customHeader = request.headers.get('x-cron-secret');
  if (customHeader === validSecret) {
    return true;
  }

  // 3. Fallback query parameter ?secret=...
  const querySecret = request.nextUrl.searchParams.get('secret');
  if (querySecret === validSecret) {
    return true;
  }

  return false;
}

async function handleBirthdayCron(request: NextRequest): Promise<NextResponse> {
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
    const searchParams = request.nextUrl.searchParams;
    const dryRun = searchParams.get('dryRun') === 'true';
    const targetDateParam = searchParams.get('targetDate');
    const targetDate = targetDateParam ? new Date(targetDateParam) : new Date();

    // 2. Execute Birthday Pipeline (T-1 Media + Day-Of Celebration & Member DMs)
    const pipelineResult = await runBirthdayPipeline({
      targetDate,
      dryRun,
    });

    const durationMs = Date.now() - startTime;

    // 3. Return Structured JSON Telemetry
    return NextResponse.json(
      {
        success: true,
        timestamp: new Date().toISOString(),
        watDate: pipelineResult.targetDateWat,
        durationMs,
        dryRun,
        tMinus1: {
          celebrantsCount: pipelineResult.tMinus1.celebrantsCount,
          mediaAlertsSent: pipelineResult.tMinus1.mediaAlertsSent,
          skippedAlreadyLogged: pipelineResult.tMinus1.skippedAlreadyLogged,
          failed: pipelineResult.tMinus1.failed,
          celebrantIds: pipelineResult.tMinus1.celebrantIds,
        },
        dayOf: {
          celebrantsCount: pipelineResult.dayOf.celebrantsCount,
          mediaAlertsSent: pipelineResult.dayOf.mediaAlertsSent,
          memberDmsSent: pipelineResult.dayOf.memberDmsSent ?? 0,
          memberDmsFallbackWaMe: pipelineResult.dayOf.memberDmsFallbackWaMe ?? 0,
          skippedAlreadyLogged: pipelineResult.dayOf.skippedAlreadyLogged,
          failed: pipelineResult.dayOf.failed,
          celebrantIds: pipelineResult.dayOf.celebrantIds,
        },
        logsCreated: pipelineResult.logsCreated,
        totalCelebrants:
          pipelineResult.tMinus1.celebrantsCount + pipelineResult.dayOf.celebrantsCount,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Error during birthday cron execution:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Internal birthday cron failure',
        durationMs: Date.now() - startTime,
      },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  return handleBirthdayCron(request);
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  return handleBirthdayCron(request);
}
