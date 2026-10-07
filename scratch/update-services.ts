import { PrismaClient, DayOfWeek } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const church = await prisma.church.findFirst();
  if (!church) {
    console.error('No church found.');
    return;
  }

  console.log(`Updating services for ${church.name}...`);

  // Update Tuesday service name to 'Digging Deep'
  await prisma.serviceSchedule.updateMany({
    where: {
      churchId: church.id,
      dayOfWeek: DayOfWeek.TUESDAY,
    },
    data: {
      name: 'Digging Deep',
    },
  });

  // Ensure Thursday Faith Clinic exists
  const existingThursday = await prisma.serviceSchedule.findFirst({
    where: {
      churchId: church.id,
      dayOfWeek: DayOfWeek.THURSDAY,
    },
  });

  if (!existingThursday) {
    await prisma.serviceSchedule.create({
      data: {
        churchId: church.id,
        name: 'Faith Clinic',
        dayOfWeek: DayOfWeek.THURSDAY,
        startTime: '17:30',
        endTime: '19:30',
        hasSubClasses: false,
      },
    });
    console.log('✅ Created Thursday Faith Clinic service');
  } else {
    await prisma.serviceSchedule.update({
      where: { id: existingThursday.id },
      data: { name: 'Faith Clinic' },
    });
    console.log('✅ Updated Thursday Faith Clinic');
  }

  // Ensure Friday Hour of Mercy exists
  const existingFriday = await prisma.serviceSchedule.findFirst({
    where: {
      churchId: church.id,
      dayOfWeek: DayOfWeek.FRIDAY,
    },
  });

  if (!existingFriday) {
    await prisma.serviceSchedule.create({
      data: {
        churchId: church.id,
        name: 'Hour of Mercy',
        dayOfWeek: DayOfWeek.FRIDAY,
        startTime: '18:00',
        endTime: '20:30',
        hasSubClasses: false,
      },
    });
    console.log('✅ Created Friday Hour of Mercy service');
  } else {
    await prisma.serviceSchedule.update({
      where: { id: existingFriday.id },
      data: { name: 'Hour of Mercy' },
    });
    console.log('✅ Updated Friday Hour of Mercy');
  }

  // List all services
  const allServices = await prisma.serviceSchedule.findMany({
    where: { churchId: church.id },
    orderBy: { startTime: 'asc' },
  });

  console.log('Active Church Services:');
  for (const s of allServices) {
    console.log(`- ${s.dayOfWeek}: ${s.name} (${s.startTime} - ${s.endTime})`);
  }
}

main()
  .catch((e) => console.error(e))
  .finally(() => prisma.$disconnect());
