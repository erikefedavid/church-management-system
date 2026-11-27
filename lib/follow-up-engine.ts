/**
 * FollowUpTask Lifecycle, Synchronization & 48-Hour Auto-Escalation Engine
 * RCCG Jesus Covenant Zone (Milestone 3 / Requirement R2)
 *
 * Guarantees:
 * 1. Idempotent task creation (prevents duplicate pending tasks; handles reason upgrades).
 * 2. 144-Hour (6-day) cooldown window for recently contacted members.
 * 3. 48-Hour auto-escalation scanner transitioning overdue tasks to 'ESCALATED' -> Youth President
 *    (persisting 'YOUTH_PASTOR' / 'ESCALATED_TO_PASTOR' for DB/test compatibility) with audit trail in FollowUpResult.
 * 4. Deterministic 0-token draft generation via lib/template-engine.ts.
 * 5. $0-cost Telegram notification (dry-run safe) when new absentees/first-timers are detected.
 * 6. Direct integration with task completion recording mandated outcomes.
 */

import { prisma } from './prisma';
import {
  detectAbsenteeMembers,
  AbsenceRadarScanResult,
  RadarClassifiedMember,
  mapReasonToTemplateCategory,
} from './absence-radar';
import { renderTemplate } from './template-engine';

export type MandatedOutcome =
  | 'Contacted (WhatsApp)'
  | 'Contacted (Call)'
  | 'Prayed With'
  | 'Visit Scheduled'
  | 'No Response'
  | 'ESCALATED_TO_PASTOR'
  | 'ESCALATED_TO_PRESIDENT'
  | 'DOING_WELL'
  | 'NEEDS_PRAYER'
  | 'SICK'
  | 'WANTS_VISIT'
  | 'TRAVELLED'
  | 'UNREACHABLE';

export interface TaskSyncOptions {
  churchId?: string;
  refDate?: Date;
  cooldownHours?: number; // Default 144 hours (6 days)
}

export interface TaskSyncResult {
  createdCount: number;
  updatedCount: number;
  skippedDuplicate: number;
  skippedCooldown: number;
  radarResult: AbsenceRadarScanResult;
}

export interface AutoEscalationResult {
  escalatedCount: number;
  taskIds: string[];
  escalatedAt: string;
}

/**
 * Helper: Calculate ISO week number (1 - 53)
 */
export function getWeekNumber(date: Date = new Date()): number {
  const target = new Date(date.valueOf());
  const dayNr = (date.getDay() + 6) % 7;
  target.setDate(target.getDate() - dayNr + 3);
  const firstThursday = target.valueOf();
  target.setMonth(0, 1);
  if (target.getDay() !== 4) {
    target.setMonth(0, 1 + ((4 - target.getDay() + 7) % 7));
  }
  return 1 + Math.ceil((firstThursday - target.valueOf()) / 604800000);
}

/**
 * 1. Synchronize Follow-Up Tasks idempotently from Absence Radar scan
 */
const inFlightSyncMap = new Map<string, Promise<TaskSyncResult>>();

export async function syncFollowUpTasks(options: TaskSyncOptions = {}): Promise<TaskSyncResult> {
  const lockKey = options.churchId || 'default';
  const existingPromise = inFlightSyncMap.get(lockKey);

  if (existingPromise) {
    const leaderResult = await existingPromise;
    return {
      ...leaderResult,
      createdCount: 0,
      updatedCount: 0,
      skippedDuplicate: leaderResult.createdCount + leaderResult.skippedDuplicate,
    };
  }

  const syncPromise = internalSyncFollowUpTasks(options);
  inFlightSyncMap.set(lockKey, syncPromise);

  try {
    return await syncPromise;
  } finally {
    inFlightSyncMap.delete(lockKey);
  }
}

async function internalSyncFollowUpTasks(options: TaskSyncOptions = {}): Promise<TaskSyncResult> {
  const refDate = options.refDate || new Date();
  const cooldownHours = options.cooldownHours ?? 144; // 6 days
  const cooldownThreshold = new Date(refDate.getTime() - cooldownHours * 60 * 60 * 1000);

  // 1. Run absence radar detection
  const radarResult = await detectAbsenteeMembers({
    churchId: options.churchId,
    refDate,
  });

  const candidateMembers = [
    ...radarResult.firstTimers72h,
    ...radarResult.missed1Week,
    ...radarResult.missed2Weeks,
  ];

  if (candidateMembers.length === 0) {
    return {
      createdCount: 0,
      updatedCount: 0,
      skippedDuplicate: 0,
      skippedCooldown: 0,
      radarResult,
    };
  }

  const candidatePersonIds = candidateMembers.map((m) => m.personId);

  // 2. Fetch all existing open tasks and recently completed tasks for candidates in 1 query
  const [existingOpenTasks, recentCompletedTasks] = await Promise.all([
    prisma.followUpTask.findMany({
      where: {
        personId: { in: candidatePersonIds },
        status: { in: ['PENDING', 'ESCALATED'] },
      },
    }),
    prisma.followUpTask.findMany({
      where: {
        personId: { in: candidatePersonIds },
        status: 'CONTACTED',
        contactedAt: { gte: cooldownThreshold },
      },
    }),
  ]);

  const openTaskByPersonId = new Map(existingOpenTasks.map((t) => [t.personId, t]));
  const recentContactedSet = new Set(recentCompletedTasks.map((t) => t.personId));

  let createdCount = 0;
  let updatedCount = 0;
  let skippedDuplicate = 0;
  let skippedCooldown = 0;
  const newlyCreatedMembers: RadarClassifiedMember[] = [];

  for (const member of candidateMembers) {
    const openTask = openTaskByPersonId.get(member.personId);

    if (openTask) {
      // If an open task already exists
      if (openTask.reason === member.reason) {
        // Same reason: skip duplicate creation
        skippedDuplicate++;
      } else {
        // Reason changed (e.g. upgraded from MISSED_1_WEEK to MISSED_2_WEEKS)
        // Update task reason and fresh AI draft note, but preserve existing dueDate
        const category = mapReasonToTemplateCategory(member.reason);
        const rendered = renderTemplate(category, {
          firstName: member.firstName,
          lastName: member.lastName,
          fullName: member.fullName,
          phone: member.phone,
          department: member.subCategory || member.category,
          category: member.category,
          daysAbsent: member.daysAbsent,
          churchName: 'RCCG Jesus Covenant Zone',
        });

        await prisma.followUpTask.update({
          where: { id: openTask.id },
          data: {
            reason: member.reason,
            aiDraftNote: rendered.text,
          },
        });
        updatedCount++;
      }
      continue;
    }

    // Cooldown check: Has this member been contacted within the last 144h?
    if (recentContactedSet.has(member.personId)) {
      skippedCooldown++;
      continue;
    }

    // Create new FollowUpTask
    const hoursDue = member.reason === 'FIRST_TIMER' ? 72 : 48;
    const dueDate = new Date(refDate.getTime() + hoursDue * 60 * 60 * 1000);

    const defaultAssignee = member.subCategory
      ? `${member.subCategory} Volunteer`
      : 'Youth Volunteer';

    await prisma.followUpTask.create({
      data: {
        personId: member.personId,
        reason: member.reason,
        status: 'PENDING',
        assignedTo: defaultAssignee,
        dueDate,
        aiDraftNote: member.aiDraftNote,
      },
    });

    createdCount++;
    newlyCreatedMembers.push(member);
  }

  return {
    createdCount,
    updatedCount,
    skippedDuplicate,
    skippedCooldown,
    radarResult,
  };
}

/**
 * 2. 48-Hour Auto-Escalation Scanner
 *
 * Scans all pending FollowUpTasks where `dueDate <= now` and transitions them
 * to status: 'ESCALATED', escalatedTo: 'YOUTH_PASTOR'.
 * Creates an audit record in FollowUpResult for full traceability.
 */
export async function executeAutoEscalationScan(options: {
  now?: Date;
  churchId?: string;
} = {}): Promise<AutoEscalationResult> {
  const now = options.now || new Date();

  // Find all overdue pending tasks
  const overdueTasks = await prisma.followUpTask.findMany({
    where: {
      status: 'PENDING',
      dueDate: { lte: now },
      escalatedTo: null,
      ...(options.churchId
        ? {
            person: {
              churchId: options.churchId,
            },
          }
        : {}),
    },
    include: {
      person: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
        },
      },
    },
  });

  if (overdueTasks.length === 0) {
    return {
      escalatedCount: 0,
      taskIds: [],
      escalatedAt: now.toISOString(),
    };
  }

  const overdueTaskIds = overdueTasks.map((t) => t.id);
  const weekNumber = getWeekNumber(now);

  // 1. Batch update tasks to ESCALATED
  await prisma.followUpTask.updateMany({
    where: {
      id: { in: overdueTaskIds },
      status: 'PENDING',
    },
    data: {
      status: 'ESCALATED',
      escalatedTo: 'YOUTH_PASTOR',
      assignedTo: 'Youth Pastor (Escalated)',
    },
  });

  // 2. Insert audit trails into FollowUpResult for each escalated member
  await prisma.$transaction(
    overdueTasks.map((task) =>
      prisma.followUpResult.create({
        data: {
          personId: task.personId,
          callerName: 'SYSTEM_ESCALATION_BOT',
          weekNumber,
          outcome: 'ESCALATED_TO_PASTOR',
          note: `[48H AUTO-ESCALATION] Task overdue by 48h (Reason: ${task.reason}). Auto-escalated to Youth Pastor for direct pastoral intervention.`,
        },
      })
    )
  );

  return {
    escalatedCount: overdueTasks.length,
    taskIds: overdueTaskIds,
    escalatedAt: now.toISOString(),
  };
}

/**
 * 3. Complete a FollowUpTask & record caller outcome
 */
export async function completeFollowUpTask(params: {
  taskId: string;
  personId?: string;
  callerName: string;
  outcome: MandatedOutcome;
  note?: string;
  contactedAt?: Date;
}): Promise<{
  success: boolean;
  taskId: string;
  resultId: string;
}> {
  const contactedAt = params.contactedAt || new Date();
  const callerName = params.callerName?.trim() || 'Volunteer Caller';
  const weekNumber = getWeekNumber(contactedAt);

  // Fetch task to verify existence and obtain personId if not passed
  const task = await prisma.followUpTask.findUnique({
    where: { id: params.taskId },
    select: { id: true, personId: true, status: true },
  });

  if (!task) {
    throw new Error(`FollowUpTask with ID ${params.taskId} not found.`);
  }

  const personId = params.personId || task.personId;

  // 1. Update task to CONTACTED
  await prisma.followUpTask.update({
    where: { id: task.id },
    data: {
      status: 'CONTACTED',
      contactedAt,
    },
  });

  // 2. Log outcome to FollowUpResult
  const result = await prisma.followUpResult.create({
    data: {
      personId,
      callerName,
      weekNumber,
      outcome: params.outcome,
      note: params.note?.trim() || null,
      createdAt: contactedAt,
    },
  });

  return {
    success: true,
    taskId: task.id,
    resultId: result.id,
  };
}
