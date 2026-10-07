'use server';

import { prisma } from '@/lib/prisma';
import { CheckInMethod, PersonCategory, PersonStatus } from '@prisma/client';

/**
 * 1. Search members by first name, last name, or phone number.
 */
export async function usherSearchMembersAction(query: string) {
  try {
    const trimmed = query.trim();
    if (!trimmed || trimmed.length < 2) {
      return { success: true, members: [] };
    }

    const church = await prisma.church.findFirst();
    if (!church) {
      return { success: false, error: 'Church not found.' };
    }

    const members = await prisma.person.findMany({
      where: {
        churchId: church.id,
        isActive: true,
        OR: [
          { firstName: { contains: trimmed, mode: 'insensitive' } },
          { lastName: { contains: trimmed, mode: 'insensitive' } },
          { phone: { contains: trimmed } },
          { phoneLast4: { contains: trimmed } },
        ],
      },
      take: 15, // Keep search fast and responsive
      orderBy: { firstName: 'asc' },
    });

    return { success: true, members };
  } catch (error) {
    console.error('Error searching members:', error);
    return { success: false, error: 'Failed to search members.' };
  }
}

/**
 * 2. Usher marks attendance manually for a person.
 */
export async function usherCheckInAction({
  personId,
  serviceScheduleId,
  subClass,
  usherUserId,
}: {
  personId: string;
  serviceScheduleId: string;
  subClass?: string;
  usherUserId?: string;
}) {
  try {
    const church = await prisma.church.findFirst();
    if (!church) {
      return { success: false, error: 'Church not found.' };
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Check if already checked in today for this service
    const existing = await prisma.attendanceRecord.findFirst({
      where: {
        personId,
        serviceScheduleId,
        date: today,
      },
      include: { person: true },
    });

    if (existing) {
      return {
        success: true,
        alreadyCheckedIn: true,
        message: `${existing.person.firstName} is already marked present for this service!`,
      };
    }

    const record = await prisma.attendanceRecord.create({
      data: {
        churchId: church.id,
        personId,
        serviceScheduleId,
        date: today,
        subClass: subClass || null,
        method: CheckInMethod.USHER_MANUAL,
        usherId: usherUserId || null,
      },
      include: {
        person: true,
        serviceSchedule: true,
      },
    });

    return {
      success: true,
      alreadyCheckedIn: false,
      message: `Marked present: ${record.person.firstName} ${record.person.lastName} (${record.serviceSchedule.name})`,
    };
  } catch (error) {
    console.error('Error during usher check-in:', error);
    return { success: false, error: 'Failed to mark attendance.' };
  }
}

/**
 * 3. Update a member's phone number when they change SIM cards.
 */
export async function usherUpdatePhoneAction({
  personId,
  newPhone,
}: {
  personId: string;
  newPhone: string;
}) {
  try {
    const cleanPhone = newPhone.trim().replace(/\s+/g, '');
    if (cleanPhone.length < 7) {
      return { success: false, error: 'Invalid phone number.' };
    }

    const phoneLast4 = cleanPhone.slice(-4);

    const updated = await prisma.person.update({
      where: { id: personId },
      data: {
        phone: cleanPhone,
        phoneLast4,
      },
    });

    return {
      success: true,
      message: `Updated phone number for ${updated.firstName}. New last 4 digits: ${updated.phoneLast4}`,
      updatedPerson: updated,
    };
  } catch (error) {
    console.error('Error updating phone number:', error);
    return { success: false, error: 'Failed to update phone number.' };
  }
}

/**
 * 4. Get today's attendance live list and total count.
 */
export async function usherGetTodayAttendanceAction(serviceScheduleId?: string) {
  try {
    const church = await prisma.church.findFirst();
    if (!church) {
      return { success: false, error: 'Church not found.' };
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const whereClause: any = {
      churchId: church.id,
      date: today,
    };

    if (serviceScheduleId) {
      whereClause.serviceScheduleId = serviceScheduleId;
    }

    const records = await prisma.attendanceRecord.findMany({
      where: whereClause,
      include: {
        person: true,
        serviceSchedule: true,
        usher: {
          select: { name: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const totalWorkers = records.filter((r) => r.person?.category === 'WORKER').length;
    const totalYouth = records.filter((r) => r.person?.category === 'YOUTH' || r.subClass === 'YOUTH').length;
    const totalAdults = records.filter((r) => r.person?.category === 'ADULT').length;
    const totalFirstTimers = records.filter((r) => r.person?.status === 'FIRST_TIMER').length;

    return {
      success: true,
      count: records.length,
      counts: {
        total: records.length,
        workers: totalWorkers,
        youth: totalYouth,
        adults: totalAdults,
        firstTimers: totalFirstTimers,
      },
      records,
    };
  } catch (error) {
    console.error('Error fetching today attendance:', error);
    return { success: false, error: 'Failed to fetch attendance.' };
  }
}

/**
 * 5. Usher registers a brand new person (Member or First-Timer) into the database.
 */
export async function usherRegisterPersonAction({
  firstName,
  lastName,
  phone,
  category = PersonCategory.ADULT,
  status = PersonStatus.MEMBER,
  serviceScheduleId,
  usherUserId,
}: {
  firstName: string;
  lastName: string;
  phone: string;
  category?: PersonCategory;
  status?: PersonStatus;
  serviceScheduleId?: string;
  usherUserId?: string;
}) {
  try {
    const church = await prisma.church.findFirst();
    if (!church) {
      return { success: false, error: 'Church not found.' };
    }

    const cleanPhone = phone.trim().replace(/\s+/g, '');
    if (cleanPhone.length < 7) {
      return { success: false, error: 'Please enter a valid phone number.' };
    }

    const phoneLast4 = cleanPhone.slice(-4);

    // Create the person
    const person = await prisma.person.create({
      data: {
        churchId: church.id,
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        phone: cleanPhone,
        phoneLast4,
        category,
        status,
      },
    });

    // If an active service was selected, automatically mark attendance as well
    if (serviceScheduleId) {
      await usherCheckInAction({
        personId: person.id,
        serviceScheduleId,
        usherUserId,
      });
    }

    return {
      success: true,
      person,
      message: `Successfully registered ${person.firstName} ${person.lastName} into the database.`,
    };
  } catch (error) {
    console.error('Error in usher registering person:', error);
    return { success: false, error: 'Failed to add person to database.' };
  }
}
