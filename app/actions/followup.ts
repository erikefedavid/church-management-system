'use server';

import { prisma } from '@/lib/prisma';
import { revalidatePath } from 'next/cache';

export type FollowUpOutcome =
  | 'DOING_WELL'
  | 'NEEDS_PRAYER'
  | 'SICK'
  | 'WANTS_VISIT'
  | 'TRAVELLED'
  | 'UNREACHABLE';

export type FollowUpListType = 'FIRST_TIMERS' | 'ABSENT' | 'GROUP' | 'ALERTS';

export interface FollowUpPerson {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
  phoneLast4: string;
  category: string;
  subCategory: string | null;
  status: 'MEMBER' | 'FIRST_TIMER' | 'EVANGELISM';
  groupName: string | null;
  groupId: string | null;
  lastAttendanceFormatted: string | null;
  lastAttendanceDate: string | null;
  recentNotes: {
    id: string;
    callerName: string;
    outcome: string;
    note: string | null;
    createdAt: string;
    weekNumber: number;
  }[];
}

export interface FollowUpOverviewData {
  success: boolean;
  churchName: string;
  firstTimersCount: number;
  absentCount: number;
  activeGroupsCount: number;
  alertsCount: number;
  groups: { id: string; name: string; memberCount: number }[];
  recentCalls: {
    id: string;
    memberName: string;
    callerName: string;
    outcome: string;
    note: string | null;
    date: string;
  }[];
  error?: string;
}

/**
 * Helper: Calculate current calendar week number (1 - 52)
 */
function getWeekNumber(date: Date = new Date()): number {
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
 * 1. Fetch Follow-up Overview KPIs & Calling Groups
 */
export async function getFollowUpOverviewAction(): Promise<FollowUpOverviewData> {
  try {
    const church = await prisma.church.findFirst({
      include: {
        groups: {
          include: {
            _count: {
              select: { people: true },
            },
          },
        },
      },
    });

    if (!church) {
      return {
        success: false,
        churchName: '',
        firstTimersCount: 0,
        absentCount: 0,
        activeGroupsCount: 0,
        alertsCount: 0,
        groups: [],
        recentCalls: [],
        error: 'Church profile not found in database.',
      };
    }

    // Auto-create initial default groups if church has none
    let groupsList = church.groups;
    if (groupsList.length === 0) {
      const defaultGroupNames = ['Group A (Daniel)', 'Group B (Esther)', 'Group C (David)'];
      await prisma.$transaction(
        defaultGroupNames.map((name) =>
          prisma.group.create({
            data: {
              churchId: church.id,
              name,
            },
          })
        )
      );

      const refreshedChurch = await prisma.church.findUnique({
        where: { id: church.id },
        include: {
          groups: {
            include: {
              _count: {
                select: { people: true },
              },
            },
          },
        },
      });
      groupsList = refreshedChurch?.groups || [];
    }

    // 1. Total First-Timers
    const firstTimersCount = await prisma.person.count({
      where: {
        churchId: church.id,
        status: 'FIRST_TIMER',
        isActive: true,
      },
    });

    // 2. Identify the most recent Sunday attendance session to calculate Absent Members
    const latestSundayRecord = await prisma.attendanceRecord.findFirst({
      where: {
        churchId: church.id,
      },
      orderBy: { date: 'desc' },
      select: { date: true },
    });

    let absentCount = 0;
    if (latestSundayRecord) {
      // Find all active members who did NOT attend that Sunday
      const attendeesOnSunday = await prisma.attendanceRecord.findMany({
        where: {
          churchId: church.id,
          date: latestSundayRecord.date,
        },
        select: { personId: true },
      });
      const attendeeIds = new Set(attendeesOnSunday.map((a) => a.personId));

      const totalMembers = await prisma.person.count({
        where: {
          churchId: church.id,
          status: 'MEMBER',
          isActive: true,
          id: { notIn: Array.from(attendeeIds) },
        },
      });
      absentCount = totalMembers;
    } else {
      // If zero attendance records exist yet, count inactive or unrecorded members
      absentCount = await prisma.person.count({
        where: { churchId: church.id, status: 'MEMBER' },
      });
    }

    // 3. Pastoral Care Alerts count (Needs Prayer, Sick, Wants Visit in the last 14 days)
    const fourteenDaysAgo = new Date();
    fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);

    const alertsCount = await prisma.followUpResult.count({
      where: {
        person: { churchId: church.id },
        createdAt: { gte: fourteenDaysAgo },
        outcome: { in: ['NEEDS_PRAYER', 'SICK', 'WANTS_VISIT'] },
      },
    });

    // 4. Recent Call Logs
    const recentLogs = await prisma.followUpResult.findMany({
      where: { person: { churchId: church.id } },
      orderBy: { createdAt: 'desc' },
      take: 10,
      include: {
        person: {
          select: { firstName: true, lastName: true },
        },
      },
    });

    return {
      success: true,
      churchName: church.name,
      firstTimersCount,
      absentCount,
      activeGroupsCount: groupsList.length,
      alertsCount,
      groups: groupsList.map((g) => ({
        id: g.id,
        name: g.name,
        memberCount: g._count.people,
      })),
      recentCalls: recentLogs.map((log) => ({
        id: log.id,
        memberName: `${log.person.firstName} ${log.person.lastName}`,
        callerName: log.callerName,
        outcome: log.outcome,
        note: log.note,
        date: log.createdAt.toLocaleDateString('en-GB', {
          day: 'numeric',
          month: 'short',
          hour: '2-digit',
          minute: '2-digit',
        }),
      })),
    };
  } catch (error) {
    console.error('Error fetching follow-up overview:', error);
    return {
      success: false,
      churchName: '',
      firstTimersCount: 0,
      absentCount: 0,
      activeGroupsCount: 0,
      alertsCount: 0,
      groups: [],
      recentCalls: [],
      error: 'Failed to load follow-up metrics.',
    };
  }
}

/**
 * 2. Fetch Members Queue based on filter (First-Timers, Absent, Calling Group, Alerts)
 */
export async function getMembersForFollowUpAction({
  listType,
  groupId,
  searchQuery,
}: {
  listType: FollowUpListType;
  groupId?: string;
  searchQuery?: string;
}): Promise<{ success: boolean; members: FollowUpPerson[]; error?: string }> {
  try {
    const church = await prisma.church.findFirst();
    if (!church) {
      return { success: false, members: [], error: 'Church not found.' };
    }

    const whereClause: any = {
      churchId: church.id,
      isActive: true,
    };

    if (searchQuery && searchQuery.trim()) {
      const q = searchQuery.trim();
      whereClause.OR = [
        { firstName: { contains: q, mode: 'insensitive' } },
        { lastName: { contains: q, mode: 'insensitive' } },
        { phone: { contains: q } },
        { phoneLast4: { contains: q } },
      ];
    }

    // Filter by requested list type
    if (listType === 'FIRST_TIMERS') {
      whereClause.status = 'FIRST_TIMER';
    } else if (listType === 'GROUP') {
      if (groupId) {
        whereClause.groupId = groupId;
      }
    } else if (listType === 'ABSENT') {
      whereClause.status = 'MEMBER';
      // Find latest attendance date
      const latestSundayRecord = await prisma.attendanceRecord.findFirst({
        where: { churchId: church.id },
        orderBy: { date: 'desc' },
        select: { date: true },
      });
      if (latestSundayRecord) {
        const attendedIds = await prisma.attendanceRecord.findMany({
          where: {
            churchId: church.id,
            date: latestSundayRecord.date,
          },
          select: { personId: true },
        });
        whereClause.id = { notIn: attendedIds.map((a) => a.personId) };
      }
    } else if (listType === 'ALERTS') {
      const fourteenDaysAgo = new Date();
      fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);

      const alertPersonIds = await prisma.followUpResult.findMany({
        where: {
          createdAt: { gte: fourteenDaysAgo },
          outcome: { in: ['NEEDS_PRAYER', 'SICK', 'WANTS_VISIT'] },
        },
        select: { personId: true },
        distinct: ['personId'],
      });

      whereClause.id = { in: alertPersonIds.map((p) => p.personId) };
    }

    const people = await prisma.person.findMany({
      where: whereClause,
      include: {
        group: { select: { name: true } },
        attendanceRecords: {
          orderBy: { date: 'desc' },
          take: 1,
          select: { date: true },
        },
        followUpResults: {
          orderBy: { createdAt: 'desc' },
          take: 3,
          select: {
            id: true,
            callerName: true,
            outcome: true,
            note: true,
            createdAt: true,
            weekNumber: true,
          },
        },
      },
      orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
      take: 60,
    });

    const formatted: FollowUpPerson[] = people.map((p) => {
      const lastAtt = p.attendanceRecords[0]?.date;
      return {
        id: p.id,
        firstName: p.firstName,
        lastName: p.lastName,
        phone: p.phone,
        phoneLast4: p.phoneLast4,
        category: p.category,
        subCategory: p.subCategory,
        status: p.status,
        groupId: p.groupId,
        groupName: p.group?.name || null,
        lastAttendanceDate: lastAtt ? lastAtt.toISOString() : null,
        lastAttendanceFormatted: lastAtt
          ? lastAtt.toLocaleDateString('en-GB', {
              day: 'numeric',
              month: 'short',
              year: 'numeric',
            })
          : 'Never recorded',
        recentNotes: p.followUpResults.map((r) => ({
          id: r.id,
          callerName: r.callerName,
          outcome: r.outcome,
          note: r.note,
          createdAt: r.createdAt.toLocaleDateString('en-GB', {
            day: 'numeric',
            month: 'short',
          }),
          weekNumber: r.weekNumber,
        })),
      };
    });

    return { success: true, members: formatted };
  } catch (error) {
    console.error('Error fetching follow-up queue:', error);
    return { success: false, members: [], error: 'Failed to retrieve members list.' };
  }
}

/**
 * 3. Log Volunteer Follow-up Call Result
 */
export async function logFollowUpResultAction({
  personId,
  callerName,
  outcome,
  note,
}: {
  personId: string;
  callerName: string;
  outcome: FollowUpOutcome;
  note?: string;
}) {
  try {
    if (!personId) {
      return { success: false, error: 'Member identifier is required.' };
    }

    const cleanCaller = callerName?.trim() || 'Volunteer Caller';
    const weekNumber = getWeekNumber(new Date());

    const result = await prisma.followUpResult.create({
      data: {
        personId,
        callerName: cleanCaller,
        weekNumber,
        outcome,
        note: note?.trim() || null,
      },
      include: {
        person: {
          select: { firstName: true, lastName: true },
        },
      },
    });

    revalidatePath('/followup');
    revalidatePath('/admin');

    return {
      success: true,
      message: `Follow-up call for ${result.person.firstName} logged successfully!`,
      resultId: result.id,
    };
  } catch (error) {
    console.error('Error logging follow-up call result:', error);
    return { success: false, error: 'Failed to record call result.' };
  }
}

/**
 * 4. Helper: Format Nigerian phone number into international WhatsApp format (e.g. 080... -> 23480...)
 */
export function formatToWhatsAppPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.startsWith('0')) {
    return `234${digits.slice(1)}`;
  }
  if (digits.startsWith('234')) {
    return digits;
  }
  return `234${digits}`;
}

/**
 * 5. Generate and Send/Simulate Automated Messaging Broadcast
 */
export type MessageTemplateType = 'FIRST_TIMER_WELCOME' | 'ABSENT_CARE' | 'MIDWEEK_REMINDER' | 'CUSTOM';

export interface DispatchItem {
  personId: string;
  recipientName: string;
  phone: string;
  whatsAppPhone: string;
  messageText: string;
  whatsAppLink: string;
  status: 'PENDING' | 'SENT' | 'SIMULATED';
}

export async function sendFollowUpBroadcastAction({
  recipientIds,
  templateType,
  customBody,
  isDryRun = false,
}: {
  recipientIds: string[];
  templateType: MessageTemplateType;
  customBody?: string;
  isDryRun?: boolean;
}): Promise<{
  success: boolean;
  count: number;
  isDryRun: boolean;
  dispatches: DispatchItem[];
  error?: string;
}> {
  try {
    if (!recipientIds || recipientIds.length === 0) {
      return {
        success: false,
        count: 0,
        isDryRun,
        dispatches: [],
        error: 'Please select at least one recipient.',
      };
    }

    const people = await prisma.person.findMany({
      where: { id: { in: recipientIds }, isActive: true },
    });

    const dispatches: DispatchItem[] = people.map((person) => {
      let messageText = '';

      switch (templateType) {
        case 'FIRST_TIMER_WELCOME':
          messageText = `Good day ${person.firstName}! 🎉 It was an honour having you worship with us at RCCG Jesus Covenant Zone! We pray God's immense peace and blessings remain upon you and your family this week. If you ever need prayer or guidance, we are always here for you. Have a fruitful week in His presence! 🙏`;
          break;

        case 'ABSENT_CARE':
          messageText = `Hello ${person.firstName}, warm Christian greetings from RCCG Jesus Covenant Zone! We missed your presence in church last Sunday and wanted to check in on your welfare. We are standing with you in prayer and look forward to fellowshipping together this coming Sunday. May the Lord strengthen you! ❤️`;
          break;

        case 'MIDWEEK_REMINDER':
          messageText = `Calvary greetings ${person.firstName}! Join us this evening for our Faith Clinic / Midweek Service at 6:00 PM. Come with faith to receive a fresh word and divine empowerment from the Lord. See you in church! 🕊️`;
          break;

        case 'CUSTOM':
          messageText = (customBody || 'God bless you!')
            .replace(/{FirstName}/g, person.firstName)
            .replace(/{FullName}/g, `${person.firstName} ${person.lastName}`);
          break;
      }

      const waPhone = formatToWhatsAppPhone(person.phone);
      const whatsAppLink = `https://wa.me/${waPhone}?text=${encodeURIComponent(messageText)}`;

      return {
        personId: person.id,
        recipientName: `${person.firstName} ${person.lastName}`,
        phone: person.phone,
        whatsAppPhone: waPhone,
        messageText,
        whatsAppLink,
        status: isDryRun ? 'SIMULATED' : 'SENT',
      };
    });

    return {
      success: true,
      count: dispatches.length,
      isDryRun,
      dispatches,
    };
  } catch (error) {
    console.error('Error generating follow-up broadcast:', error);
    return {
      success: false,
      count: 0,
      isDryRun,
      dispatches: [],
      error: 'Failed to dispatch broadcast.',
    };
  }
}

/**
 * 6. Assign Member to Calling Group
 */
export async function assignPersonToGroupAction({
  personId,
  groupId,
}: {
  personId: string;
  groupId: string | null;
}) {
  try {
    await prisma.person.update({
      where: { id: personId },
      data: { groupId },
    });

    revalidatePath('/followup');
    return { success: true };
  } catch (error) {
    console.error('Error assigning person to group:', error);
    return { success: false, error: 'Failed to assign member to calling group.' };
  }
}

/**
 * 7. Create New Calling Group
 */
export async function createCallingGroupAction({ name }: { name: string }) {
  try {
    const church = await prisma.church.findFirst();
    if (!church) return { success: false, error: 'Church not found.' };

    const group = await prisma.group.create({
      data: {
        churchId: church.id,
        name: name.trim(),
      },
    });

    revalidatePath('/followup');
    return { success: true, group };
  } catch (error) {
    console.error('Error creating group:', error);
    return { success: false, error: 'Failed to create group.' };
  }
}
