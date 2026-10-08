/**
 * Helper to export church attendance records to Excel-friendly CSV.
 * Includes UTF-8 BOM (\uFEFF) to guarantee Microsoft Excel renders names and symbols perfectly.
 * Columns: S/N, Full Name, Category/Role (Youth Worker, Adult Worker, Youth, Adult), Time Arrived (WAT).
 */

export type ExportCategory =
  | 'FULL_CHURCH'
  | 'WORKERS'
  | 'YOUTH'
  | 'ADULTS'
  | 'YOUTH_SUNDAY_SCHOOL'
  | 'ADULT_SUNDAY_SCHOOL'
  | 'FIRST_TIMERS';

export function getPersonDisplayCategory(person: any): string {
  if (!person) return 'Adult';
  if (person.status === 'FIRST_TIMER') return 'First-Timer';

  const subCat = person.subCategory;
  const cat = person.category;

  // A worker is a worker whether youth or adult - all united under 'Worker'
  if (
    cat === 'WORKER' ||
    subCat === 'WORKER' ||
    subCat === 'YOUTH_WORKER' ||
    subCat === 'ADULT_WORKER'
  ) {
    return 'Worker';
  }

  if (cat === 'YOUTH' || subCat === 'YOUTH') return 'Youth';
  return 'Adult';
}

export function filterAndExportAttendanceCSV({
  records,
  category = 'FULL_CHURCH',
  timeframeLabel = 'Today',
  churchName = 'RCCG Jesus Covenant Zone',
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

  // 1. Filter by requested church sheet
  let filtered = records;
  let categoryLabel = 'Full_Church';

  if (category === 'WORKERS') {
    filtered = records.filter((r) => {
      const p = r.person || r;
      return (
        p.category === 'WORKER' ||
        p.subCategory === 'WORKER' ||
        p.subCategory === 'YOUTH_WORKER' ||
        p.subCategory === 'ADULT_WORKER'
      );
    });
    categoryLabel = 'Workers_Attendance';
  } else if (category === 'YOUTH') {
    filtered = records.filter((r) => {
      const p = r.person || r;
      const isWorker =
        p.category === 'WORKER' ||
        p.subCategory === 'WORKER' ||
        p.subCategory === 'YOUTH_WORKER' ||
        p.subCategory === 'ADULT_WORKER';
      return (p.category === 'YOUTH' || p.subCategory === 'YOUTH') && !isWorker;
    });
    categoryLabel = 'Youth_Attendance';
  } else if (category === 'ADULTS') {
    filtered = records.filter((r) => {
      const p = r.person || r;
      const isWorker =
        p.category === 'WORKER' ||
        p.subCategory === 'WORKER' ||
        p.subCategory === 'YOUTH_WORKER' ||
        p.subCategory === 'ADULT_WORKER';
      return (p.category === 'ADULT' || p.subCategory === 'ADULT') && !isWorker;
    });
    categoryLabel = 'Adult_Attendance';
  } else if (category === 'ADULT_SUNDAY_SCHOOL') {
    filtered = records.filter((r) => {
      const p = r.person || r;
      return (
        r.subClass === 'ADULT' ||
        p.subCategory === 'ADULT' ||
        p.subCategory === 'ADULT_WORKER' ||
        p.category === 'ADULT'
      );
    });
    categoryLabel = 'Adult_Sunday_School';
  } else if (category === 'YOUTH_SUNDAY_SCHOOL') {
    filtered = records.filter((r) => {
      const p = r.person || r;
      return (
        r.subClass === 'YOUTH' ||
        p.subCategory === 'YOUTH' ||
        p.subCategory === 'YOUTH_WORKER' ||
        p.category === 'YOUTH'
      );
    });
    categoryLabel = 'Youth_Sunday_School';
  } else if (category === 'FIRST_TIMERS') {
    filtered = records.filter((r) => {
      const p = r.person || r;
      return p.status === 'FIRST_TIMER';
    });
    categoryLabel = 'First_Timers';
  } else {
    // FULL_CHURCH
    filtered = records;
    categoryLabel = 'Full_Church';
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

  // Formatted columns: S/N, Full Name, Category, Time Arrived (WAT)
  const headers = ['S/N', 'Full Name', 'Category', 'Time Arrived (WAT)'];

  const rows = filtered.map((r, index) => {
    const person = r.person || r;
    const fullName = `${person.firstName || ''} ${person.lastName || ''}`.trim();
    const catLabel = getPersonDisplayCategory(person);
    const timeArrived = formatWatTime(r.createdAt || r.date);

    return [index + 1, fullName, catLabel, timeArrived];
  });

  // 3. Build CSV with Excel UTF-8 BOM
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
  const filename = `RCCG_${cleanLabel}_${categoryLabel}_${fileDate}.csv`;

  // 4. Download file in browser
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
