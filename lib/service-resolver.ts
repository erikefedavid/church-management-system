import { prisma } from './prisma';
import { DayOfWeek, ServiceSchedule } from '@prisma/client';

export interface NextUpcomingService {
  name: string;
  dayOfWeek: string;
  startTime: string;
  endTime: string;
  formattedSchedule: string;
}

export interface ActiveServiceResult {
  activeService: ServiceSchedule | null;
  fallbackService?: ServiceSchedule | null;
  todayServices: ServiceSchedule[];
  concurrentServices?: ServiceSchedule[];
  isLiveNow: boolean;
  isOvertime: boolean;
  isSimulatedFallback: boolean;
  currentDay: DayOfWeek;
  currentTimeString: string;
  nigerianTimeFormatted: string;
  portalSubtitle: string;
  isFirstSunday: boolean;
  isThirdSaturday: boolean;
  nextUpcomingService: NextUpcomingService | null;
}

/**
 * Extracts Nigerian Time (West Africa Time - Africa/Lagos, UTC+1).
 * Guaranteed to be 100% accurate regardless of server hosting location.
 */
export function getNigerianTimeInfo(date: Date = new Date()) {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Africa/Lagos',
    hour12: false,
    weekday: 'long',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

  const parts = formatter.formatToParts(date);
  const partMap: Record<string, string> = {};
  for (const p of parts) {
    partMap[p.type] = p.value;
  }

  const weekday = (partMap.weekday || '').toUpperCase() as DayOfWeek;
  const dayOfMonth = Number(partMap.day);
  const month = Number(partMap.month);
  const year = Number(partMap.year);
  const currentTimeString = `${partMap.hour}:${partMap.minute}`;

  const formatted12Hour = date.toLocaleTimeString('en-US', {
    timeZone: 'Africa/Lagos',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });

  return {
    weekday,
    dayOfMonth,
    month,
    year,
    currentTimeString,
    formatted12Hour,
  };
}

/**
 * Formats a 24-hour time string (e.g. "07:00", "17:00") into a clean 12-hour string with AM/PM (e.g. "07:00 AM", "05:00 PM").
 */
export function formatTime12(timeStr?: string): string {
  if (!timeStr) return '';
  const parts = timeStr.trim().split(':');
  if (parts.length < 2) return timeStr;
  const h = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10);
  if (isNaN(h) || isNaN(m)) return timeStr;

  const period = h >= 12 ? 'PM' : 'AM';
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  const padHour = String(hour12).padStart(2, '0');
  const padMin = String(m).padStart(2, '0');
  return `${padHour}:${padMin} ${period}`;
}

/**
 * Formats a start and end time into an explicit AM/PM range (e.g. "07:00 AM - 08:00 AM", "05:00 PM - 06:00 PM").
 */
export function formatTimeRange12(startTime?: string, endTime?: string): string {
  if (!startTime || !endTime) return '';
  return `${formatTime12(startTime)} - ${formatTime12(endTime)}`;
}

/**
 * Checks if a given dayOfMonth is the 1st Sunday of the month (Thanksgiving Sunday).
 * 1st Sunday is always days 1 through 7.
 */
export function isFirstSundayOfMonth(dayOfMonth: number, dayOfWeek: DayOfWeek): boolean {
  return dayOfWeek === DayOfWeek.SUNDAY && dayOfMonth >= 1 && dayOfMonth <= 7;
}

/**
 * Checks if a given dayOfMonth is the 3rd Saturday of the month (Hour of Mercy).
 * 3rd Saturday is always days 15 through 21.
 */
export function isThirdSaturdayOfMonth(dayOfMonth: number, dayOfWeek: DayOfWeek): boolean {
  return dayOfWeek === DayOfWeek.SATURDAY && dayOfMonth >= 15 && dayOfMonth <= 21;
}

/**
 * Checks if a given dayOfMonth is the Friday immediately preceding the 3rd Sunday.
 * 3rd Sunday is days 15 through 21, so that Friday is always days 13 through 19.
 */
export function isFridayBeforeThirdSunday(dayOfMonth: number, dayOfWeek: DayOfWeek): boolean {
  return dayOfWeek === DayOfWeek.FRIDAY && dayOfMonth >= 13 && dayOfMonth <= 19;
}

/**
 * Computes an overtime grace window for church services:
 * - Services with NO following service (Second Service, Thanksgiving Service, Midweek Digging Deep, Midweek Faith Clinic, Saturday Hour of Mercy, Friday OTH)
 *   get the smart grace buffer so latecomers and extended fellowship are never locked out.
 * - Intermediate services (First Service, Sunday School) strictly follow their normal scheduled time (0 min buffer)
 *   so they never clash with or delay the next service.
 */
export function getServiceBufferEndTime(serviceName: string, officialEndTime: string): string {
  const [endHourStr, endMinuteStr] = officialEndTime.split(':');
  const endHour = Number(endHourStr) || 0;
  const endMinute = Number(endMinuteStr) || 0;

  const lower = serviceName.toLowerCase();
  let bufferMinutes = 0; // Strictly 0 grace for First Service and Sunday School (normal time)

  if (lower.includes('second service') || lower.includes('thanksgiving service')) {
    bufferMinutes = 120; // 2 hours grace buffer for Sunday main services (allows check-in up to 2:00 PM / 14:00)
  } else if (lower.includes('hour of mercy')) {
    bufferMinutes = 45; // 45 minutes grace buffer for Saturday Hour of Mercy (up to 9:45 AM)
  } else if (lower.includes('digging deep') || lower.includes('faith clinic') || lower.includes('youth') || lower.includes('oth')) {
    bufferMinutes = 60; // 1 hour grace buffer for evening programs (up to 7:00 PM / 19:00 or 8:00 PM)
  }

  const totalMinutes = endHour * 60 + endMinute + bufferMinutes;
  const newHour = Math.min(23, Math.floor(totalMinutes / 60));
  const newMinute = totalMinutes % 60;

  return `${String(newHour).padStart(2, '0')}:${String(newMinute).padStart(2, '0')}`;
}

/**
 * Generates an accurate, context-aware portal subtitle based on the day,
 * whether it is Thanksgiving Sunday, 3rd Saturday, or midweek service.
 */
export function getServicePortalSubtitle(
  currentDay: DayOfWeek,
  serviceName: string,
  isThanksgiving: boolean,
  isThirdSaturday: boolean,
  isLiveNow: boolean = false
): string {
  // If off-hours (no service is currently live), show clean generic portal title
  if (!isLiveNow) {
    return 'Attendance Portal';
  }

  // Only display specific service title when the service is actively in session
  if (currentDay === DayOfWeek.SUNDAY) {
    if (serviceName.toLowerCase().includes('workers')) {
      return "Sunday Workers' Meeting";
    }
    if (serviceName.toLowerCase().includes('sunday school')) {
      return isThanksgiving ? 'Sunday School (Thanksgiving)' : 'Sunday School Portal';
    }
    if (isThanksgiving || serviceName.toLowerCase().includes('thanksgiving')) {
      return 'Thanksgiving Sunday Service';
    }
    return 'Sunday Attendance Portal';
  }

  if (currentDay === DayOfWeek.TUESDAY) {
    return 'Tuesday Digging Deep';
  }

  if (currentDay === DayOfWeek.THURSDAY) {
    return 'Thursday Faith Clinic';
  }

  if (currentDay === DayOfWeek.FRIDAY) {
    if (serviceName.toLowerCase().includes('youth') || serviceName.toLowerCase().includes('oth')) {
      return 'Youth Prayer Meeting';
    }
    return 'Attendance Portal';
  }

  if (currentDay === DayOfWeek.SATURDAY) {
    if (isThirdSaturday && serviceName.toLowerCase().includes('mercy')) {
      return 'Hour of Mercy';
    }
    return 'Attendance Portal';
  }

  return `${serviceName} Portal`;
}

/**
 * Resolves the church service automatically based on real Nigerian time (Africa/Lagos).
 * Applies an automatic overtime grace buffer so extended services never lock members out.
 */
export async function getActiveChurchService(
  churchId: string,
  targetDate: Date = new Date(),
  overrideTimeString?: string,
  overrideDay?: DayOfWeek
): Promise<ActiveServiceResult> {
  const ngTime = getNigerianTimeInfo(targetDate);
  const currentDay = overrideDay || ngTime.weekday;
  const currentTimeString = overrideTimeString || ngTime.currentTimeString;

  const isFirstSunday = isFirstSundayOfMonth(ngTime.dayOfMonth, currentDay);
  const isThirdSaturday = isThirdSaturdayOfMonth(ngTime.dayOfMonth, currentDay);
  const isOthFriday = isFridayBeforeThirdSunday(ngTime.dayOfMonth, currentDay);

  // Fetch all services for this church
  const allChurchServices = await prisma.serviceSchedule.findMany({
    where: { churchId },
    orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }],
  });

  // Services for today
  const rawDayServices = allChurchServices.filter((s) => s.dayOfWeek === currentDay);

  // Filter today's services according to Thanksgiving vs Regular Sunday
  let todayServices = rawDayServices;

  if (currentDay === DayOfWeek.SUNDAY) {
    if (isFirstSunday) {
      const thanksgivingServices = rawDayServices.filter(
        (s) =>
          s.name.toLowerCase().includes('thanksgiving') ||
          s.name.toLowerCase().includes('sunday school (thanksgiving)') ||
          s.name.toLowerCase().includes('workers')
      );
      if (thanksgivingServices.length > 0) {
        todayServices = thanksgivingServices;
      }
    } else {
      const regularServices = rawDayServices.filter(
        (s) => !s.name.toLowerCase().includes('thanksgiving')
      );
      if (regularServices.length > 0) {
        todayServices = regularServices;
      }
    }
  }

  if (currentDay === DayOfWeek.FRIDAY) {
    if (!isOthFriday) {
      // Youth Prayer Meeting occurs exclusively on the Friday before the 3rd Sunday
      todayServices = rawDayServices.filter(
        (s) => !s.name.toLowerCase().includes('youth') && !s.name.toLowerCase().includes('oth')
      );
    }
  }

  if (currentDay === DayOfWeek.SATURDAY) {
    if (!isThirdSaturday) {
      // Hour of Mercy occurs exclusively on the 3rd Saturday of the month
      todayServices = rawDayServices.filter((s) => !s.name.toLowerCase().includes('hour of mercy'));
    }
  }

  // 1. Check if current Nigerian time falls strictly within a scheduled service window + grace buffer
  const matchingServices: ServiceSchedule[] = [];
  let isOvertime = false;

  for (const service of todayServices) {
    const bufferEndTime = getServiceBufferEndTime(service.name, service.endTime);
    if (currentTimeString >= service.startTime && currentTimeString <= bufferEndTime) {
      matchingServices.push(service);
    }
  }

  let activeService: ServiceSchedule | null = null;
  if (matchingServices.length > 0) {
    // If multiple services are concurrently active (e.g. 09:00 - 09:15 handover between First Service and Sunday School),
    // default to the newest service that started (Sunday School), but provide all options in concurrentServices
    activeService = matchingServices[matchingServices.length - 1];
    if (currentTimeString > activeService.endTime) {
      isOvertime = true;
    }
  }

  let isLiveNow = activeService !== null;
  let isSimulatedFallback = false;

  // 2. Compute Next Upcoming Service
  let nextUpcomingService: NextUpcomingService | null = null;

  // A. Check if there is another service later today
  const upcomingToday = todayServices.find((s) => s.startTime > currentTimeString);
  if (upcomingToday) {
    nextUpcomingService = {
      name: upcomingToday.name,
      dayOfWeek: 'Today',
      startTime: upcomingToday.startTime,
      endTime: upcomingToday.endTime,
      formattedSchedule: `Today at ${formatTime12(upcomingToday.startTime)}`,
    };
  } else {
    // B. Find next scheduled service in the weekly cycle
    const dayOrder: DayOfWeek[] = [
      DayOfWeek.SUNDAY,
      DayOfWeek.MONDAY,
      DayOfWeek.TUESDAY,
      DayOfWeek.WEDNESDAY,
      DayOfWeek.THURSDAY,
      DayOfWeek.FRIDAY,
      DayOfWeek.SATURDAY,
    ];

    const currentDayIdx = dayOrder.indexOf(currentDay);
    for (let i = 1; i <= 7; i++) {
      const checkDay = dayOrder[(currentDayIdx + i) % 7];
      const svcs = allChurchServices.filter((s) => s.dayOfWeek === checkDay);
      if (svcs.length > 0) {
        const nextSvc = svcs[0];
        const dayLabel = i === 1 ? 'Tomorrow' : nextSvc.dayOfWeek;
        nextUpcomingService = {
          name: nextSvc.name,
          dayOfWeek: dayLabel,
          startTime: nextSvc.startTime,
          endTime: nextSvc.endTime,
          formattedSchedule: `${dayLabel} at ${formatTime12(nextSvc.startTime)}`,
        };
        break;
      }
    }
  }

  // 3. Simulated Fallback (Used when testing/off-hours)
  let fallbackService: ServiceSchedule = activeService || todayServices[0];
  if (!fallbackService) {
    // Pick Sunday service if today has none
    const sundaySvc = allChurchServices.find((s) => s.dayOfWeek === DayOfWeek.SUNDAY);
    fallbackService = sundaySvc || allChurchServices[0];
    isSimulatedFallback = true;
  } else if (!isLiveNow) {
    isSimulatedFallback = true;
  }

  const resolvedService = activeService || fallbackService;

  const portalSubtitle = getServicePortalSubtitle(
    currentDay,
    resolvedService?.name || 'Church Service',
    isFirstSunday,
    isThirdSaturday,
    isLiveNow
  );

  return {
    activeService: isLiveNow ? activeService : null,
    fallbackService: fallbackService || null,
    todayServices,
    concurrentServices: matchingServices,
    isLiveNow,
    isOvertime,
    isSimulatedFallback,
    currentDay,
    currentTimeString,
    nigerianTimeFormatted: `${ngTime.formatted12Hour} WAT`,
    portalSubtitle: isLiveNow ? portalSubtitle : 'Attendance Portal (Off-Hours)',
    isFirstSunday,
    isThirdSaturday,
    nextUpcomingService,
  };
}
