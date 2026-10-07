import { PrismaClient, DayOfWeek, PersonStatus, PersonCategory, UserRole } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting attendance database seed...');

  // 1. Create the Church
  const church = await prisma.church.create({
    data: {
      name: 'RCCG Jesus Covenant Zone',
      latitude: 6.5244, // Sample coordinates (can be updated with your exact Google Maps coords)
      longitude: 3.3792,
      geofenceRadius: 150, // 150 meters
    },
  });

  console.log(`✅ Created Church: ${church.name} (ID: ${church.id})`);

  // 2. Create an Usher and Pastor user account
  const usher = await prisma.user.create({
    data: {
      churchId: church.id,
      name: 'Brother David (Head Usher)',
      email: 'usher@gracechurch.com',
      passwordHash: 'password123',
      role: UserRole.USHER,
    },
  });

  const pastor = await prisma.user.create({
    data: {
      churchId: church.id,
      name: 'Pastor Michael',
      email: 'pastor@gracechurch.com',
      passwordHash: 'password123',
      role: UserRole.PASTOR,
    },
  });

  console.log(`✅ Created Users: ${usher.name}, ${pastor.name}`);

  // 3. Create Sunday & Midweek Services
  const services = await Promise.all([
    // Sunday Schedule
    prisma.serviceSchedule.create({
      data: {
        churchId: church.id,
        name: "Workers' Meeting",
        dayOfWeek: DayOfWeek.SUNDAY,
        startTime: '07:00',
        endTime: '08:00',
        hasSubClasses: false,
      },
    }),
    prisma.serviceSchedule.create({
      data: {
        churchId: church.id,
        name: 'First Service',
        dayOfWeek: DayOfWeek.SUNDAY,
        startTime: '08:00',
        endTime: '09:15',
        hasSubClasses: false,
      },
    }),
    prisma.serviceSchedule.create({
      data: {
        churchId: church.id,
        name: 'Sunday School',
        dayOfWeek: DayOfWeek.SUNDAY,
        startTime: '09:00',
        endTime: '09:50',
        hasSubClasses: true, // Youth or Adult class
      },
    }),
    prisma.serviceSchedule.create({
      data: {
        churchId: church.id,
        name: 'Second Service',
        dayOfWeek: DayOfWeek.SUNDAY,
        startTime: '10:00',
        endTime: '12:00',
        hasSubClasses: false,
      },
    }),

    // 1st Sunday (Thanksgiving Sunday) Schedule
    prisma.serviceSchedule.create({
      data: {
        churchId: church.id,
        name: 'Sunday School (Thanksgiving)',
        dayOfWeek: DayOfWeek.SUNDAY,
        startTime: '08:00',
        endTime: '08:50',
        hasSubClasses: true,
      },
    }),
    prisma.serviceSchedule.create({
      data: {
        churchId: church.id,
        name: 'Thanksgiving Service',
        dayOfWeek: DayOfWeek.SUNDAY,
        startTime: '09:00',
        endTime: '12:00',
        hasSubClasses: false,
      },
    }),

    // Midweek Programs
    prisma.serviceSchedule.create({
      data: {
        churchId: church.id,
        name: 'Digging Deep',
        dayOfWeek: DayOfWeek.TUESDAY,
        startTime: '17:00',
        endTime: '18:00',
        hasSubClasses: false,
      },
    }),
    prisma.serviceSchedule.create({
      data: {
        churchId: church.id,
        name: 'Faith Clinic',
        dayOfWeek: DayOfWeek.THURSDAY,
        startTime: '17:00',
        endTime: '18:00',
        hasSubClasses: false,
      },
    }),

    // 3rd Saturday Program
    prisma.serviceSchedule.create({
      data: {
        churchId: church.id,
        name: 'Hour of Mercy',
        dayOfWeek: DayOfWeek.SATURDAY,
        startTime: '08:00',
        endTime: '09:00',
        hasSubClasses: false,
      },
    }),
  ]);

  console.log(`✅ Created ${services.length} Service Schedules`);

  // 4. Create Sample Members
  const samplePeople = [
    {
      firstName: 'Emmanuel',
      lastName: 'Okonkwo',
      phone: '08031234567',
      phoneLast4: '4567',
      category: PersonCategory.ADULT,
      status: PersonStatus.MEMBER,
    },
    {
      firstName: 'Chidinma',
      lastName: 'Adeyemi',
      phone: '08129876543',
      phoneLast4: '6543',
      category: PersonCategory.YOUTH,
      status: PersonStatus.MEMBER,
    },
    {
      firstName: 'Tunde',
      lastName: 'Bakare',
      phone: '09051112233',
      phoneLast4: '2233',
      category: PersonCategory.WORKER,
      status: PersonStatus.MEMBER,
    },
    {
      firstName: 'Grace',
      lastName: 'Nwosu',
      phone: '07034445566',
      phoneLast4: '5566',
      category: PersonCategory.ADULT,
      status: PersonStatus.MEMBER,
    },
    {
      firstName: 'Samuel',
      lastName: 'Oladipo',
      phone: '08087774567', // Same last 4 digits as Emmanuel (4567) to test collision handling
      phoneLast4: '4567',
      category: PersonCategory.YOUTH,
      status: PersonStatus.MEMBER,
    },
  ];

  for (const person of samplePeople) {
    await prisma.person.create({
      data: {
        churchId: church.id,
        ...person,
      },
    });
  }

  console.log(`✅ Created ${samplePeople.length} sample members (including a test phone collision for '4567')`);
  console.log('🎉 Seed completed successfully!');
}

main()
  .catch((e) => {
    console.error('❌ Error during seeding:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
