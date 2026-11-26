/**
 * Helper to export Youth attendance records to Excel-friendly CSV.
 * Includes UTF-8 BOM (\uFEFF) to guarantee Microsoft Excel renders names and symbols perfectly.
 * Columns: S/N, Full Name, Status, Service, Time Arrived (WAT), Check-In Method.
 */

export type ExportCategory = 'ALL_YOUTH' | 'YOUTH_MEMBERS' | 'FIRST_TIMERS';

export function getPersonDisplayCategory(person: any): string {
  if (!person) return 'Youth Member';
  if (person.status === 'FIRST_TIMER') return 'First-Timer';
  return 'Youth Member';
}

export function formatCheckInMethod(method?: string | null): string {
  if (method === 'QR_SELF') return 'Self QR';
  if (method === 'USHER_MANUAL') return 'Usher Marked';
  return method || 'Usher Marked';
}

export function filterAndExportAttendanceCSV({
  records,
  category = 'ALL_YOUTH',
  timeframeLabel = 'Today',
  dateISO,
}: {
  records: any[];
  category?: ExportCategory;
  timeframeLabel?: string;
  churchName?: string;
  dateISO?: string;
}): { success: boolean; count: number; filename?: string; error?: string } {
  if (!records || records.length === 0) {
    return { success: false, count: 0, error: 'No attendance records available to export for this service.' };
  }

  let filtered = records;
  let categoryLabel = 'Youth_Attendance';

  if (category === 'YOUTH_MEMBERS') {
    filtered = records.filter((r) => {
      const p = r.person || r;
      return p.status !== 'FIRST_TIMER';
    });
    categoryLabel = 'Youth_Members';
  } else if (category === 'FIRST_TIMERS') {
    filtered = records.filter((r) => {
      const p = r.person || r;
      return p.status === 'FIRST_TIMER';
    });
    categoryLabel = 'First_Timers';
  } else {
    filtered = records;
    categoryLabel = 'Youth_Attendance';
  }

  if (filtered.length === 0) {
    const readable = categoryLabel.replace(/_/g, ' ');
    return {
      success: false,
      count: 0,
      error: `No records found for "${readable}" in this service.`,
    };
  }

  // Helper to format Nigerian West Africa Time (WAT)
  const formatWatTime = (dateInput: any) => {
    try {
      const d = new Date(dateInput || Date.now());
      return d.toLocaleTimeString('en-US', {
        timeZone: 'Africa/Lagos',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true,
      });
    } catch {
      return 'N/A';
    }
  };

  // Formatted columns: S/N, Full Name, Status, Service, Time Arrived (WAT), Check-In Method
  const headers = ['S/N', 'Full Name', 'Status', 'Service', 'Time Arrived (WAT)', 'Check-In Method'];

  const rows = filtered.map((r, index) => {
    const person = r.person || r;
    const fullName = `${person.firstName || ''} ${person.lastName || ''}`.trim();
    const statusLabel = getPersonDisplayCategory(person);
    const serviceName = r.serviceSchedule?.name || timeframeLabel || 'Youth Service';
    const timeArrived = formatWatTime(r.createdAt || r.date);
    const methodLabel = formatCheckInMethod(r.method);

    return [index + 1, fullName, statusLabel, serviceName, timeArrived, methodLabel];
  });

  // Build CSV with Excel UTF-8 BOM
  const csvContent =
    '\uFEFF' +
    [
      headers.map((h) => `"${h}"`).join(','),
      ...rows.map((row) =>
        row
          .map((val) => {
            const str = String(val ?? '').replace(/"/g, '""');
            return `"${str}"`;
          })
          .join(',')
      ),
    ].join('\r\n');

  const fileDate = dateISO || new Date().toISOString().slice(0, 10);
  const cleanLabel = timeframeLabel.replace(/[^a-zA-Z0-9_-]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
  const filename = `RCCG_Youth_${cleanLabel}_${categoryLabel}_${fileDate}.csv`;

  // Download file in browser
  if (typeof document !== 'undefined') {
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');

    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  return { success: true, count: filtered.length, filename };
}
