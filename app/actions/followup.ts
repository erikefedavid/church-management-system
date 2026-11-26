'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import {
  detectAbsenteeMembers,
  AbsenceRadarScanResult,
  RadarClassifiedMember,
} from '@/lib/absence-radar';
import {
  syncFollowUpTasks,
  executeAutoEscalationScan,
  completeFollowUpTask,
  MandatedOutcome,
  getWeekNumber,
} from '@/lib/follow-up-engine';
import { dispatchDirectMessage, MessageChannel } from '@/lib/direct-dispatch';
import { polishDraftWithAi } from '@/lib/ai-assistant';
import { getNigerianTimeInfo } from '@/lib/service-resolver';
import { requireStaffSession } from './auth';

export type { MandatedOutcome };

export type RadarFilterType =
  | 'MISSED_1_WEEK'
  | 'MISSED_2_WEEKS'
  | 'FIRST_TIMER_72H'
  | 'ESCALATED'
  | 'ALL';

export interface RadarMetrics {
  missed1WeekCount: number;
  missed2WeeksCount: number;
  firstTimers72hCount: number;
  escalatedCount: number;
  totalActiveMembers: number;
  lastUpdatedWat: string;
}

export interface FollowUpMemberQueueItem {
  taskId?: string;
  personId: string;
  firstName: string;
  lastName: string;
  fullName: string;
  phone: string;
  formattedPhone: string;
  phoneLast4: string;
  category: string;
  subCategory: string | null;
  status: 'MEMBER' | 'FIRST_TIMER' | 'EVANGELISM';
  reason: 'FIRST_TIMER' | 'MISSED_1_WEEK' | 'MISSED_2_WEEKS' | 'DORMANT_CRITICAL';
  taskStatus?: 'PENDING' | 'CONTACTED' | 'ESCALATED';
  assignedTo?: string | null;
  escalatedTo?: string | null;
  dueDate?: string | null;
  isOverdue: boolean;
  daysAbsent: number;
  lastAttendanceFormatted: string;
  lastAttendanceDate: string | null;
  deterministicDraft: string;
  waMeUrl: string;
  recentNotes: {
    id: string;
    callerName: string;
    outcome: string;
    note: string | null;
    date: string;
  }[];
}

// ---------------------------------------------------------------------------
// 1. Fetch Radar Dashboard Metrics & Member Queue
// ---------------------------------------------------------------------------
export async function getFollowUpRadarDashboardAction(filters: {
  filter?: RadarFilterType;
  searchQuery?: string;
} = {}): Promise<{
  success: boolean;
  metrics: RadarMetrics;
  members: FollowUpMemberQueueItem[];
  error?: string;
}> {
  try {
    const auth = await requireStaffSession(['FOLLOWUP', 'ADMIN']);
    if (!auth.authorized) {
      return {
        success: false,
        metrics: {
          missed1WeekCount: 0,
          missed2WeeksCount: 0,
          firstTimers72hCount: 0,
          escalatedCount: 0,
          totalActiveMembers: 0,
          lastUpdatedWat: '',
        },
        members: [],
        error: auth.error || 'Unauthorized staff access.',
      };
    }

    const radarResult: AbsenceRadarScanResult = await detectAbsenteeMembers();
    const activeFilter = filters.filter || 'ALL';
    const query = (filters.searchQuery || '').trim().toLowerCase();

    // 1. Determine members based on filter
    let rawMembers: RadarClassifiedMember[] = [];
    switch (activeFilter) {
      case 'MISSED_1_WEEK':
        rawMembers = radarResult.missed1Week;
        break;
      case 'MISSED_2_WEEKS':
        rawMembers = radarResult.missed2Weeks;
        break;
      case 'FIRST_TIMER_72H':
        rawMembers = radarResult.firstTimers72h;
        break;
      case 'ESCALATED':
        rawMembers = radarResult.escalatedToPastor;
        break;
      case 'ALL':
      default: {
        const seen = new Set<string>();
        const combined: RadarClassifiedMember[] = [];
        for (const m of [
          ...radarResult.escalatedToPastor,
          ...radarResult.firstTimers72h,
          ...radarResult.missed1Week,
          ...radarResult.missed2Weeks,
        ]) {
          if (m.reason !== 'DORMANT_CRITICAL' && !seen.has(m.personId)) {
            seen.add(m.personId);
            combined.push(m);
          }
        }
        rawMembers = combined;
        break;
      }
    }

    // 2. Filter out members without reachable phone numbers
    rawMembers = rawMembers.filter((m) => {
      const clean = (m.phone || '').replace(/\D/g, '');
      return clean.length >= 7 && m.phone !== 'N/A' && m.phone !== '0000';
    });

    // 3. Apply search filter
    if (query) {
      rawMembers = rawMembers.filter(
        (m) =>
          m.firstName.toLowerCase().includes(query) ||
          m.lastName.toLowerCase().includes(query) ||
          m.fullName.toLowerCase().includes(query) ||
          m.phone.includes(query) ||
          m.phoneLast4.includes(query)
      );
    }

    // 3. Fetch recent call notes for all returned members in 1 batch query
    const personIds = rawMembers.map((m) => m.personId);
    const recentResults = await prisma.followUpResult.findMany({
      where: {
        personId: { in: personIds },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
      select: {
        id: true,
        personId: true,
        callerName: true,
        outcome: true,
        note: true,
        createdAt: true,
      },
    });

    const notesByPerson = new Map<string, typeof recentResults>();
    for (const res of recentResults) {
      const existing = notesByPerson.get(res.personId) || [];
      if (existing.length < 3) {
        existing.push(res);
        notesByPerson.set(res.personId, existing);
      }
    }

    const now = Date.now();
    const formattedQueue: FollowUpMemberQueueItem[] = rawMembers.map((m) => {
      const isOverdue = m.dueDate ? m.dueDate.getTime() < now : false;
      const notes = (notesByPerson.get(m.personId) || []).map((n) => ({
        id: n.id,
        callerName: n.callerName,
        outcome: n.outcome,
        note: n.note,
        date: n.createdAt.toLocaleDateString('en-GB', {
          day: 'numeric',
          month: 'short',
        }),
      }));

      return {
        taskId: m.existingTaskId,
        personId: m.personId,
        firstName: m.firstName,
        lastName: m.lastName,
        fullName: m.fullName,
        phone: m.phone,
        formattedPhone: m.formattedPhone,
        phoneLast4: m.phoneLast4,
        category: m.category,
        subCategory: m.subCategory,
        status: m.status,
        reason: m.reason,
        taskStatus: m.taskStatus,
        assignedTo: m.subCategory ? `${m.subCategory} Volunteer` : 'Youth Volunteer',
        escalatedTo: m.escalatedTo || null,
        dueDate: m.dueDate ? m.dueDate.toISOString() : null,
        isOverdue: isOverdue || m.isEscalated,
        daysAbsent: m.daysAbsent,
        lastAttendanceFormatted: m.lastAttendedFormatted,
        lastAttendanceDate: m.lastAttendedDate ? m.lastAttendedDate.toISOString() : null,
        deterministicDraft: m.aiDraftNote,
        waMeUrl: m.waMeUrl,
        recentNotes: notes,
      };
    });

    const ngInfo = getNigerianTimeInfo();
    const lastUpdatedWat = `${ngInfo.formatted12Hour} WAT`;

    return {
      success: true,
      metrics: {
        missed1WeekCount: radarResult.stats.missed1WeekCount,
        missed2WeeksCount: radarResult.stats.missed2WeeksCount,
        firstTimers72hCount: radarResult.stats.firstTimers72hCount,
        escalatedCount: radarResult.stats.escalatedCount,
        totalActiveMembers: radarResult.totalActiveMembers,
        lastUpdatedWat,
      },
      members: formattedQueue,
    };
  } catch (error) {
    console.error('Error fetching follow-up radar dashboard:', error);
    return {
      success: false,
      metrics: {
        missed1WeekCount: 0,
        missed2WeeksCount: 0,
        firstTimers72hCount: 0,
        escalatedCount: 0,
        totalActiveMembers: 0,
        lastUpdatedWat: '',
      },
      members: [],
      error: error instanceof Error ? error.message : 'Failed to retrieve radar dashboard',
    };
  }
}

// ---------------------------------------------------------------------------
// 2. Direct Gateway Dispatch via SMS / WhatsApp API
// ---------------------------------------------------------------------------
export async function dispatchDirectMessageAction(params: {
  taskId?: string;
  personId: string;
  messageText: string;
  channel?: MessageChannel;
}): Promise<{
  success: boolean;
  status: 'DELIVERED' | 'QUEUED' | 'FALLBACK_GENERATED' | 'FAILED';
  provider: string;
  waMeUrl: string;
  error?: string;
}> {
  try {
    const auth = await requireStaffSession(['FOLLOWUP', 'ADMIN']);
    if (!auth.authorized) {
      return {
        success: false,
        status: 'FAILED',
        provider: 'NONE',
        waMeUrl: '',
        error: auth.error || 'Unauthorized staff access.',
      };
    }

    const person = await prisma.person.findUnique({
      where: { id: params.personId },
      select: { id: true, firstName: true, lastName: true, phone: true },
    });

    if (!person) {
      return {
        success: false,
        status: 'FAILED',
        provider: 'NONE',
        waMeUrl: '',
        error: 'Recipient member record not found.',
      };
    }

    const dispatchResult = await dispatchDirectMessage({
      to: person.phone,
      body: params.messageText,
      channel: params.channel || 'AUTO',
      recipientName: `${person.firstName} ${person.lastName}`,
    });

    // If dispatch succeeded or generated 1-click fallback, auto-resolve task if taskId provided
    if (params.taskId && (dispatchResult.status === 'DELIVERED' || dispatchResult.status === 'QUEUED')) {
      try {
        await completeFollowUpTask({
          taskId: params.taskId,
          personId: person.id,
          callerName: `Automated Dispatch (${dispatchResult.provider})`,
          outcome: 'Contacted (WhatsApp)',
          note: `Message dispatched via ${dispatchResult.provider}. Status: ${dispatchResult.status}`,
        });
        revalidatePath('/followup');
      } catch (taskErr) {
        console.warn('Could not auto-complete task after direct dispatch:', taskErr);
      }
    }

    return {
      success: dispatchResult.success,
      status: dispatchResult.status,
      provider: dispatchResult.provider,
      waMeUrl: dispatchResult.waMeUrl,
      error: dispatchResult.error,
    };
  } catch (error) {
    console.error('Error dispatching direct message:', error);
    return {
      success: false,
      status: 'FAILED',
      provider: 'NONE',
      waMeUrl: '',
      error: error instanceof Error ? error.message : 'Dispatch failed',
    };
  }
}

// ---------------------------------------------------------------------------
// 3. On-Demand AI Polish with 7-Day Deduplication Cache
// ---------------------------------------------------------------------------
export async function polishFollowUpDraftAction(params: {
  personId: string;
  baseDraft: string;
  tone?: string;
}): Promise<{
  success: boolean;
  text: string;
  cached: boolean;
  tokensConsumed: number;
  error?: string;
}> {
  try {
    const auth = await requireStaffSession(['FOLLOWUP', 'ADMIN']);
    if (!auth.authorized) {
      return {
        success: false,
        text: params.baseDraft,
        cached: false,
        tokensConsumed: 0,
        error: auth.error || 'Unauthorized staff access.',
      };
    }

    const person = await prisma.person.findUnique({
      where: { id: params.personId },
      select: {
        firstName: true,
        lastName: true,
        phone: true,
        category: true,
        subCategory: true,
      },
    });

    if (!person) {
      return {
        success: false,
        text: params.baseDraft,
        cached: false,
        tokensConsumed: 0,
        error: 'Member not found',
      };
    }

    const polishResult = await polishDraftWithAi(
      params.baseDraft,
      {
        firstName: person.firstName,
        lastName: person.lastName,
        phone: person.phone,
        category: person.category,
        subCategory: person.subCategory,
      },
      params.tone || 'CASUAL_YOUTH'
    );

    return {
      success: true,
      text: polishResult.text,
      cached: polishResult.cached,
      tokensConsumed: polishResult.tokensConsumed,
    };
  } catch (error) {
    console.error('Error in polishFollowUpDraftAction:', error);
    return {
      success: false,
      text: params.baseDraft,
      cached: false,
      tokensConsumed: 0,
      error: error instanceof Error ? error.message : 'AI polish failed',
    };
  }
}

// ---------------------------------------------------------------------------
// 4. Complete Follow-Up Task & Log Outcome
// ---------------------------------------------------------------------------
export async function completeFollowUpTaskAction(params: {
  taskId?: string;
  personId: string;
  callerName: string;
  outcome: MandatedOutcome;
  note?: string;
}): Promise<{
  success: boolean;
  message: string;
  error?: string;
}> {
  try {
    const auth = await requireStaffSession(['FOLLOWUP', 'ADMIN']);
    if (!auth.authorized) {
      return { success: false, message: '', error: auth.error || 'Unauthorized staff access.' };
    }

    if (!params.personId) {
      return { success: false, message: '', error: 'Member identifier is required.' };
    }

    const cleanCaller = params.callerName?.trim() || 'Youth President';
    const weekNumber = getWeekNumber(new Date());

    if (params.taskId) {
      // Complete existing FollowUpTask and create FollowUpResult
      await completeFollowUpTask({
        taskId: params.taskId,
        personId: params.personId,
        callerName: cleanCaller,
        outcome: params.outcome,
        note: params.note,
      });
    } else {
      // Find open task if one exists
      const existingTask = await prisma.followUpTask.findFirst({
        where: {
          personId: params.personId,
          status: { in: ['PENDING', 'ESCALATED'] },
        },
      });

      if (existingTask) {
        await completeFollowUpTask({
          taskId: existingTask.id,
          personId: params.personId,
          callerName: cleanCaller,
          outcome: params.outcome,
          note: params.note,
        });
      } else {
        // Just log the result directly
        await prisma.followUpResult.create({
          data: {
            personId: params.personId,
            callerName: cleanCaller,
            weekNumber,
            outcome: params.outcome,
            note: params.note?.trim() || null,
          },
        });
      }
    }

    revalidatePath('/followup');
    revalidatePath('/admin');

    return {
      success: true,
      message: `Follow-up outcome "${params.outcome}" recorded successfully.`,
    };
  } catch (error) {
    console.error('Error completing follow-up task:', error);
    return {
      success: false,
      message: '',
      error: error instanceof Error ? error.message : 'Failed to record task outcome',
    };
  }
}

// ---------------------------------------------------------------------------
// 5. Trigger Immediate Radar Sync (On-Demand scan & escalation)
// ---------------------------------------------------------------------------
export async function triggerRadarSyncAction(): Promise<{
  success: boolean;
  tasksCreated: number;
  tasksEscalated: number;
  metrics: RadarMetrics;
  error?: string;
}> {
  try {
    const auth = await requireStaffSession(['FOLLOWUP', 'ADMIN']);
    if (!auth.authorized) {
      return {
        success: false,
        tasksCreated: 0,
        tasksEscalated: 0,
        metrics: {
          missed1WeekCount: 0,
          missed2WeeksCount: 0,
          firstTimers72hCount: 0,
          escalatedCount: 0,
          totalActiveMembers: 0,
          lastUpdatedWat: '',
        },
        error: auth.error || 'Unauthorized staff access.',
      };
    }

    const syncResult = await syncFollowUpTasks();
    const escalationResult = await executeAutoEscalationScan();

    revalidatePath('/followup');

    const ngInfo = getNigerianTimeInfo();

    return {
      success: true,
      tasksCreated: syncResult.createdCount,
      tasksEscalated: escalationResult.escalatedCount,
      metrics: {
        missed1WeekCount: syncResult.radarResult.stats.missed1WeekCount,
        missed2WeeksCount: syncResult.radarResult.stats.missed2WeeksCount,
        firstTimers72hCount: syncResult.radarResult.stats.firstTimers72hCount,
        escalatedCount: syncResult.radarResult.stats.escalatedCount,
        totalActiveMembers: syncResult.radarResult.totalActiveMembers,
        lastUpdatedWat: `${ngInfo.formatted12Hour} WAT`,
      },
    };
  } catch (error) {
    console.error('Error triggering radar sync action:', error);
    return {
      success: false,
      tasksCreated: 0,
      tasksEscalated: 0,
      metrics: {
        missed1WeekCount: 0,
        missed2WeeksCount: 0,
        firstTimers72hCount: 0,
        escalatedCount: 0,
        totalActiveMembers: 0,
        lastUpdatedWat: '',
      },
      error: error instanceof Error ? error.message : 'Failed to trigger radar sync',
    };
  }
}
