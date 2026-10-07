import { prisma } from '../lib/prisma';
import { getActiveChurchService } from '../lib/service-resolver';
import { DayOfWeek } from '@prisma/client';

async function testSundayTimeline() {
  const church = await prisma.church.findFirst();
  if (!church) return;

  const testTimes = ['07:15', '08:05', '09:05', '09:30', '10:15', '12:30', '14:30'];
  // Regular Sunday date (e.g. 2nd Sunday: Oct 11, 2026)
  const regularSunday = new Date('2026-10-11T12:00:00Z');

  console.log('=== REGULAR SUNDAY SERVICE RESOLUTION ===');
  for (const time of testTimes) {
    const res = await getActiveChurchService(church.id, regularSunday, time, DayOfWeek.SUNDAY);
    console.log(`[${time}] -> Active: ${res.activeService?.name} (${res.activeService?.startTime}-${res.activeService?.endTime}) | Subtitle: "${res.portalSubtitle}" | Overtime: ${res.isOvertime} | Concurrent: ${res.concurrentServices?.map(s => s.name).join(', ')}`);
  }

  // 1st Sunday (Thanksgiving: Oct 4, 2026)
  const thanksgivingSunday = new Date('2026-10-04T12:00:00Z');
  console.log('\n=== THANKSGIVING SUNDAY (1ST SUNDAY) SERVICE RESOLUTION ===');
  const tgTimes = ['07:30', '08:15', '09:30', '12:45', '14:30'];
  for (const time of tgTimes) {
    const res = await getActiveChurchService(church.id, thanksgivingSunday, time, DayOfWeek.SUNDAY);
    console.log(`[${time}] -> Active: ${res.activeService?.name} (${res.activeService?.startTime}-${res.activeService?.endTime}) | Subtitle: "${res.portalSubtitle}" | Overtime: ${res.isOvertime}`);
  }
}

testSundayTimeline().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
