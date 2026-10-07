/**
 * Helper to export attendance records to an Excel-friendly CSV file.
 * Includes UTF-8 BOM (\uFEFF) to ensure Microsoft Excel displays all characters correctly.
 */

export type ExportCategory = 'ALL' | 'WORKER' | 'YOUTH' | 'FIRST_TIMER' | 'ADULT';

export interface ExportRecordItem {
  firstName: string;
  lastName: string;
  phone: string;
  category: string;
  status: string;
  serviceName: string;
  subClass?: string;
  method: string;
  date: string;
  time: string;
}

export function filterAndExportAttendanceCSV({
  records,
  category = 'ALL',
  timeframeLabel = 'Today',
  churchName = 'RCCG Jesus Covenant Zone',
}: {
  records: any[];
  category?: ExportCategory;
  timeframeLabel?: string;
  churchName?: string;
}): { success: boolean; count: number; filename?: string; error?: string } {
  if (!records || records.length === 0) {
    return { success: false, count: 0, error: 'No attendance records available to export.' };
  }

  // 1. Filter by category
  let filtered = records;
  let categoryLabel = 'Full Church';

  if (category === 'WORKER') {
    filtered = records.filter(
      (r) => r.person?.category === 'WORKER' || r.category === 'WORKER'
    );
    categoryLabel = 'Workers';
  } else if (category === 'YOUTH') {
    filtered = records.filter(
      (r) =>
        r.person?.category === 'YOUTH' ||
        r.category === 'YOUTH' ||
        r.subClass === 'YOUTH'
    );
    categoryLabel = 'Youth';
  } else if (category === 'FIRST_TIMER') {
    filtered = records.filter(
      (r) => r.person?.status === 'FIRST_TIMER' || r.status === 'FIRST_TIMER'
    );
    categoryLabel = 'First-Timers';
  } else if (category === 'ADULT') {
    filtered = records.filter(
      (r) => r.person?.category === 'ADULT' || r.category === 'ADULT'
    );
    categoryLabel = 'Adults';
  }

  if (filtered.length === 0) {
    return {
      success: false,
      count: 0,
      error: `No records found for "${categoryLabel}" in this timeframe.`,
    };
  }

  // 2. Prepare headers and rows
  const headers = [
    'S/N',
    'First Name',
    'Last Name',
    'Phone Number',
    'Category',
    'Status',
    'Service Attended',
    'Class / Group',
    'Verification Method',
    'Date',
    'Check-In Time',
  ];

  const rows = filtered.map((r, index) => {
    const person = r.person || r;
    const service = r.serviceSchedule || {};
    const d = new Date(r.createdAt || r.date || Date.now());

    return [
      index + 1,
      person.firstName || '',
      person.lastName || '',
      person.phone || '',
      person.category || 'MEMBER',
      person.status || 'MEMBER',
      service.name || r.serviceName || 'Church Service',
      r.subClass || 'General',
      r.method === 'QR_SELF' ? 'Self Check-In (Door)' : 'Usher Assisted',
      d.toLocaleDateString('en-GB'),
      d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
    ];
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

  // 4. Download file
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');

  const cleanDate = new Date().toISOString().slice(0, 10);
  const cleanCat = categoryLabel.replace(/\s+/g, '_');
  const filename = `RCCG_${cleanCat}_Attendance_${cleanDate}.csv`;

  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);

  return { success: true, count: filtered.length, filename };
}
