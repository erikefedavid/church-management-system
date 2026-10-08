import { getActiveChurchService } from '../lib/service-resolver';
import { prisma } from '../lib/prisma';
import { DayOfWeek } from '@prisma/client';

async function testCalendarDates() {
  const church = await prisma.church.findFirst();
  if (!church) {
    console.log('No church found');
    return;
  }

  // 1. Regular Sunday (e.g. Oct 11, 2026 - 2nd Sunday) at 12:00 AM
  const regSundayDate = new Date('2026-10-11T00:01:00Z');
  const resRegSunday = await getActiveChurchService(church.id, regSundayDate);
  console.log('=== REGULAR SUNDAY (12:00 AM) ===');
  console.log('isFirstSunday:', resRegSunday.isFirstSunday);
  console.log('Services:', resRegSunday.todayServices.map(s => s.name));

  // 2. Thanksgiving Sunday (e.g. Oct 4, 2026 - 1st Sunday) at 12:00 AM
  const thkSundayDate = new Date('2026-10-04T00:01:00Z');
  const resThkSunday = await getActiveChurchService(church.id, thkSundayDate);
  console.log('\n=== THANKSGIVING SUNDAY (12:00 AM) ===');
  console.log('isFirstSunday:', resThkSunday.isFirstSunday);
  console.log('Services:', resThkSunday.todayServices.map(s => s.name));

  // 3. Tuesday (e.g. Oct 6, 2026) at 12:00 AM
  const tuesdayDate = new Date('2026-10-06T00:01:00Z');
  const resTuesday = await getActiveChurchService(church.id, tuesdayDate);
  console.log('\n=== TUESDAY (12:00 AM) ===');
  console.log('Services:', resTuesday.todayServices.map(s => s.name));

  // 4. Thursday (e.g. Oct 8, 2026) at 12:00 AM
  const thursdayDate = new Date('2026-10-08T00:01:00Z');
  const resThursday = await getActiveChurchService(church.id, thursdayDate);
  console.log('\n=== THURSDAY (12:00 AM) ===');
  console.log('Services:', resThursday.todayServices.map(s => s.name));

  // 5. 3rd Saturday (e.g. Oct 17, 2026) at 12:00 AM
  const sat3rdDate = new Date('2026-10-17T00:01:00Z');
  const resSat3rd = await getActiveChurchService(church.id, sat3rdDate);
  console.log('\n=== 3RD SATURDAY (12:00 AM) ===');
  console.log('isThirdSaturday:', resSat3rd.isThirdSaturday);
  console.log('Services:', resSat3rd.todayServices.map(s => s.name));

  // 6. Friday before 3rd Sunday (e.g. Oct 16, 2026) at 12:00 AM
  const friPre3rd = new Date('2026-10-16T00:01:00Z');
  const resFriPre3rd = await getActiveChurchService(church.id, friPre3rd);
  console.log('\n=== FRIDAY BEFORE 3RD SUNDAY (12:00 AM) ===');
  console.log('Services:', resFriPre3rd.todayServices.map(s => s.name));

  // 7. Regular Friday (e.g. Oct 9, 2026) at 12:00 AM
  const regFri = new Date('2026-10-09T00:01:00Z');
  const resRegFri = await getActiveChurchService(church.id, regFri);
  console.log('\n=== REGULAR FRIDAY (12:00 AM) ===');
  console.log('Services:', resRegFri.todayServices.map(s => s.name));
}

testCalendarDates().catch(console.error);
