import { PrismaClient, DayOfWeek } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const church = await prisma.church.findFirst();
  if (!church) {
    console.error('No church found.');
    return;
  }

  console.log(`Syncing accurate schedule for ${church.name}...`);

  // Target services list
  const targetServices = [
    // Regular Sunday Schedule
    {
      name: 'First Service',
      dayOfWeek: DayOfWeek.SUNDAY,
      startTime: '08:00',
      endTime: '09:15',
      hasSubClasses: false,
    },
    {
      name: 'Sunday School',
      dayOfWeek: DayOfWeek.SUNDAY,
      startTime: '09:00',
      endTime: '09:50',
      hasSubClasses: true, // Adult or Youth class
    },
    {
      name: 'Second Service',
      dayOfWeek: DayOfWeek.SUNDAY,
      startTime: '10:00',
      endTime: '12:00', // Official 12:00 PM with automatic 2:00 PM grace buffer
      hasSubClasses: false,
    },

    // 1st Sunday (Thanksgiving Sunday) Schedule
    {
      name: 'Sunday School (Thanksgiving)',
      dayOfWeek: DayOfWeek.SUNDAY,
      startTime: '08:00',
      endTime: '08:50',
      hasSubClasses: true,
    },
    {
      name: 'Thanksgiving Service',
      dayOfWeek: DayOfWeek.SUNDAY,
      startTime: '09:00',
      endTime: '12:00', // Official 12:00 PM with automatic 2:00 PM grace buffer
      hasSubClasses: false,
    },

    // Midweek Programs
    {
      name: 'Digging Deep',
      dayOfWeek: DayOfWeek.TUESDAY,
      startTime: '17:00',
      endTime: '18:00',
      hasSubClasses: false,
    },
    {
      name: 'Faith Clinic',
      dayOfWeek: DayOfWeek.THURSDAY,
      startTime: '17:00',
      endTime: '18:00',
      hasSubClasses: false,
    },

    // 3rd Saturday Hour of Mercy
    {
      name: 'Hour of Mercy',
      dayOfWeek: DayOfWeek.SATURDAY,
      startTime: '08:00',
      endTime: '09:00',
      hasSubClasses: false,
    },
  ];

  // Remove old Friday Hour of Mercy if present
  await prisma.serviceSchedule.deleteMany({
    where: {
      churchId: church.id,
      dayOfWeek: DayOfWeek.FRIDAY,
      name: 'Hour of Mercy',
    },
  });

  // Remove old Sunday Workers Meeting if present
  await prisma.serviceSchedule.deleteMany({
    where: {
      churchId: church.id,
      dayOfWeek: DayOfWeek.SUNDAY,
      name: 'Workers Meeting',
    },
  });

  for (const svc of targetServices) {
    const existing = await prisma.serviceSchedule.findFirst({
      where: {
        churchId: church.id,
        dayOfWeek: svc.dayOfWeek,
        name: svc.name,
      },
    });

    if (existing) {
      await prisma.serviceSchedule.update({
        where: { id: existing.id },
        data: {
          startTime: svc.startTime,
          endTime: svc.endTime,
          hasSubClasses: svc.hasSubClasses,
        },
      });
      console.log(`Updated: ${svc.name} (${svc.startTime} - ${svc.endTime})`);
    } else {
      await prisma.serviceSchedule.create({
        data: {
          churchId: church.id,
          name: svc.name,
          dayOfWeek: svc.dayOfWeek,
          startTime: svc.startTime,
          endTime: svc.endTime,
          hasSubClasses: svc.hasSubClasses,
        },
      });
      console.log(`Created: ${svc.name} (${svc.startTime} - ${svc.endTime})`);
    }
  }

  // Print summary of all services
  const all = await prisma.serviceSchedule.findMany({
    where: { churchId: church.id },
    orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }],
  });

  console.log('\n--- Final Synchronized Church Schedule ---');
  for (const s of all) {
    console.log(`${s.dayOfWeek}: ${s.name} (${s.startTime} - ${s.endTime})${s.hasSubClasses ? ' [Adult/Youth]' : ''}`);
  }
}

main()
  .catch((e) => console.error(e))
  .finally(() => prisma.$disconnect());
