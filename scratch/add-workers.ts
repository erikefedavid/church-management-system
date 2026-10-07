import { prisma } from '../lib/prisma';
import { DayOfWeek } from '@prisma/client';

async function addWorkersMeeting() {
  const church = await prisma.church.findFirst();
  if (!church) {
    console.log('No church found.');
    return;
  }

  const existing = await prisma.serviceSchedule.findFirst({
    where: {
      churchId: church.id,
      name: "Workers' Meeting",
    },
  });

  if (!existing) {
    const created = await prisma.serviceSchedule.create({
      data: {
        churchId: church.id,
        name: "Workers' Meeting",
        dayOfWeek: DayOfWeek.SUNDAY,
        startTime: '07:00',
        endTime: '08:00',
        hasSubClasses: false,
      },
    });
    console.log('✅ Created Workers Meeting in database:', created.name, created.startTime, created.endTime);
  } else {
    console.log('ℹ️ Workers Meeting already exists:', existing.startTime, existing.endTime);
  }
}

addWorkersMeeting().then(() => process.exit(0)).catch(err => {
  console.error(err);
  process.exit(1);
});
