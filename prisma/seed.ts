import { PrismaClient, DayOfWeek, PersonStatus, PersonCategory, UserRole } from '@prisma/client';

const prisma = new PrismaClient();

async function connectWithRetry(retries = 5, delayMs = 3000) {
  for (let i = 1; i <= retries; i++) {
    try {
      console.log(`Connecting to database (attempt ${i}/${retries})...`);
      await prisma.$connect();
      console.log('✅ Connected to database successfully!');
      return;
    } catch (err: any) {
      console.warn(`Connection attempt ${i} failed: ${err.message}`);
      if (i === retries) throw err;
      console.log(`Waiting ${delayMs / 1000}s for Neon compute to resume...`);
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
}

async function main() {
  console.log('🌱 Starting comprehensive church test database seed...');
  await connectWithRetry();

  // 1. Upsert Church Profile
  const churchCoords = {
    latitude: 6.5244,
    longitude: 3.3792,
    geofenceRadius: 150,
  };

  const existingChurch = await prisma.church.findFirst();
  const church = existingChurch
    ? await prisma.church.update({
        where: { id: existingChurch.id },
        data: {
          name: 'RCCG Jesus Covenant Zone',
          ...churchCoords,
        },
      })
    : await prisma.church.create({
        data: {
          name: 'RCCG Jesus Covenant Zone',
          ...churchCoords,
        },
      });

  console.log(`✅ Church: ${church.name} (${church.id}) at (${church.latitude}, ${church.longitude})`);

  // 2. Upsert Staff Accounts
  await prisma.user.upsert({
    where: { email: 'pastor@gracechurch.com' },
    update: { churchId: church.id },
    create: {
      churchId: church.id,
      name: 'Pastor Michael (Youth Pastor)',
      email: 'pastor@gracechurch.com',
      passwordHash: 'password123',
      role: UserRole.PASTOR,
    },
  });

  await prisma.user.upsert({
    where: { email: 'usher@gracechurch.com' },
    update: { churchId: church.id },
    create: {
      churchId: church.id,
      name: 'Brother David (Head Usher)',
      email: 'usher@gracechurch.com',
      passwordHash: 'password123',
      role: UserRole.USHER,
    },
  });

  // 3. Service Schedules
  const serviceConfigs = [
    { name: "Workers' Meeting", dayOfWeek: DayOfWeek.SUNDAY, startTime: '07:00', endTime: '08:00', hasSubClasses: false },
    { name: 'First Service', dayOfWeek: DayOfWeek.SUNDAY, startTime: '08:00', endTime: '09:15', hasSubClasses: false },
    { name: 'Sunday School', dayOfWeek: DayOfWeek.SUNDAY, startTime: '09:00', endTime: '09:50', hasSubClasses: true },
    { name: 'Second Service', dayOfWeek: DayOfWeek.SUNDAY, startTime: '10:00', endTime: '12:00', hasSubClasses: false },
    { name: 'Digging Deep', dayOfWeek: DayOfWeek.TUESDAY, startTime: '17:00', endTime: '18:30', hasSubClasses: false },
    { name: 'Faith Clinic', dayOfWeek: DayOfWeek.THURSDAY, startTime: '17:00', endTime: '18:30', hasSubClasses: false },
  ];

  const createdServices: Record<string, string> = {};
  for (const svc of serviceConfigs) {
    const existing = await prisma.serviceSchedule.findFirst({
      where: { churchId: church.id, name: svc.name, dayOfWeek: svc.dayOfWeek },
    });
    if (existing) {
      createdServices[svc.name] = existing.id;
    } else {
      const created = await prisma.serviceSchedule.create({
        data: { churchId: church.id, ...svc },
      });
      createdServices[svc.name] = created.id;
    }
  }

  // Determine current Nigerian calendar date for dynamic test birthdays
  const now = new Date();
  const todayDay = now.getDate();
  const todayMonth = now.getMonth() + 1; // 1-12

  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const tomorrowDay = tomorrow.getDate();
  const tomorrowMonth = tomorrow.getMonth() + 1;

  const inFourDays = new Date(now.getTime() + 4 * 24 * 60 * 60 * 1000);
  const inFourDaysDay = inFourDays.getDate();
  const inFourDaysMonth = inFourDays.getMonth() + 1;

  // 4. Sample Youth Members
  const sampleMembers = [
    // Today's Birthday Celebrant -> Appears on /birthdays TODAY!
    {
      firstName: 'Toluwanimi',
      lastName: 'Adegoke',
      phone: '08130001122',
      phoneLast4: '1122',
      birthDay: todayDay,
      birthMonth: todayMonth,
      category: PersonCategory.YOUTH,
      subCategory: 'MEDIA_TEAM',
      photoUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=400',
      status: PersonStatus.MEMBER,
    },
    // Tomorrow's Birthday Celebrant -> Appears in T-1 Media Flyer Alert Queue!
    {
      firstName: 'Chukwuebuka',
      lastName: 'Nnamdi',
      phone: '08023334455',
      phoneLast4: '4455',
      birthDay: tomorrowDay,
      birthMonth: tomorrowMonth,
      category: PersonCategory.YOUTH,
      subCategory: 'CHOIR',
      photoUrl: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400',
      status: PersonStatus.MEMBER,
    },
    // Upcoming Celebrant (in 4 days)
    {
      firstName: 'Damilola',
      lastName: 'Ogunlesi',
      phone: '07038889900',
      phoneLast4: '9900',
      birthDay: inFourDaysDay,
      birthMonth: inFourDaysMonth,
      category: PersonCategory.YOUTH,
      subCategory: 'USHERING',
      photoUrl: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=400',
      status: PersonStatus.MEMBER,
    },
    // Collision Test 1 (Phone ends with 4567)
    {
      firstName: 'Emmanuel',
      lastName: 'Okonkwo',
      phone: '08031234567',
      phoneLast4: '4567',
      birthDay: 15,
      birthMonth: 8,
      category: PersonCategory.YOUTH,
      subCategory: 'YOUTH_EXCO',
      photoUrl: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=400',
      status: PersonStatus.MEMBER,
    },
    // Collision Test 2 (Same last 4 digits: 4567 -> tests interactive card picker!)
    {
      firstName: 'Samuel',
      lastName: 'Oladipo',
      phone: '08087774567',
      phoneLast4: '4567',
      birthDay: 22,
      birthMonth: 4,
      category: PersonCategory.YOUTH,
      subCategory: 'TECHNICAL',
      photoUrl: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=400',
      status: PersonStatus.MEMBER,
    },
    // Member who missed 1 week -> Appears on /followup under "Missed 1 Sunday"
    {
      firstName: 'Chidinma',
      lastName: 'Adeyemi',
      phone: '08129876543',
      phoneLast4: '6543',
      birthDay: 10,
      birthMonth: 11,
      category: PersonCategory.YOUTH,
      subCategory: 'DRAMA',
      photoUrl: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=400',
      status: PersonStatus.MEMBER,
    },
    // Member who missed 2 consecutive weeks -> Appears on /followup under "Missed 2 Consecutive Sundays"
    {
      firstName: 'Tunde',
      lastName: 'Bakare',
      phone: '09051112233',
      phoneLast4: '2233',
      birthDay: 5,
      birthMonth: 2,
      category: PersonCategory.WORKER,
      subCategory: 'YOUTH_WORKER',
      photoUrl: 'https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?w=400',
      status: PersonStatus.MEMBER,
    },
    // 72-Hour First Timer -> Appears on /followup under "First Timers (72h Care Window)"
    {
      firstName: 'Blessing',
      lastName: 'Eze',
      phone: '08065551212',
      phoneLast4: '1212',
      birthDay: 18,
      birthMonth: 9,
      category: PersonCategory.YOUTH,
      subCategory: 'FIRST_TIMER',
      photoUrl: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=400',
      status: PersonStatus.FIRST_TIMER,
    },
  ];

  const createdPeople: Record<string, string> = {};

  for (const m of sampleMembers) {
    const existing = await prisma.person.findFirst({
      where: { churchId: church.id, phone: m.phone },
    });
    if (existing) {
      await prisma.person.update({
        where: { id: existing.id },
        data: {
          birthDay: m.birthDay,
          birthMonth: m.birthMonth,
          photoUrl: m.photoUrl,
          subCategory: m.subCategory,
          status: m.status,
        },
      });
      createdPeople[m.phoneLast4] = existing.id;
    } else {
      const created = await prisma.person.create({
        data: { churchId: church.id, ...m },
      });
      createdPeople[m.phoneLast4] = created.id;
    }
  }

  // 5. Seed Historical Attendance Records
  // Provide attendance records for past Sundays so the Absence Radar detects real patterns:
  const secondServiceId = createdServices['Second Service'] || Object.values(createdServices)[0];

  if (secondServiceId) {
    const twoSundaysAgo = new Date();
    twoSundaysAgo.setDate(twoSundaysAgo.getDate() - 14);
    twoSundaysAgo.setHours(10, 30, 0, 0);

    const oneSundayAgo = new Date();
    oneSundayAgo.setDate(oneSundayAgo.getDate() - 7);
    oneSundayAgo.setHours(10, 30, 0, 0);

    // Chidinma attended 2 weeks ago, missed last week -> Missed 1 week
    const chidinmaId = createdPeople['6543'];
    if (chidinmaId) {
      await prisma.attendanceRecord.upsert({
        where: {
          personId_serviceScheduleId_date: {
            personId: chidinmaId,
            serviceScheduleId: secondServiceId,
            date: twoSundaysAgo,
          },
        },
        update: {},
        create: {
          churchId: church.id,
          personId: chidinmaId,
          serviceScheduleId: secondServiceId,
          date: twoSundaysAgo,
        },
      });
    }

    // Emmanuel & Toluwanimi attended last Sunday -> Active
    const emmanuelId = createdPeople['4567'];
    if (emmanuelId) {
      await prisma.attendanceRecord.upsert({
        where: {
          personId_serviceScheduleId_date: {
            personId: emmanuelId,
            serviceScheduleId: secondServiceId,
            date: oneSundayAgo,
          },
        },
        update: {},
        create: {
          churchId: church.id,
          personId: emmanuelId,
          serviceScheduleId: secondServiceId,
          date: oneSundayAgo,
        },
      });
    }
  }

  console.log('🎉 Test database seed finished successfully!');
  console.log(`- Celebrant TODAY: Toluwanimi Adegoke (${todayMonth}/${todayDay}) - Last4: 1122`);
  console.log(`- Celebrant TOMORROW (T-1 Media Alert): Chukwuebuka Nnamdi (${tomorrowMonth}/${tomorrowDay}) - Last4: 4455`);
  console.log(`- Phone Collision Test: Emmanuel & Samuel (Both Last4: 4567)`);
  console.log(`- Absence Radar Test: Chidinma (Missed 1 Week: 6543), Tunde (Missed 2 Weeks: 2233)`);
  console.log(`- First-Timer (72h Care): Blessing Eze (Last4: 1212)`);
}

main()
  .catch((e) => {
    console.error('❌ Error during database seed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
