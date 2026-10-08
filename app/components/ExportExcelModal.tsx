'use client';

import React from 'react';
import { X, Download, Users, Briefcase, Sparkles, UserCheck, FileSpreadsheet, GraduationCap, BookOpen } from 'lucide-react';
import { ExportCategory, filterAndExportAttendanceCSV } from '@/lib/export-excel';

export interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  records: any[];
  counts?: any;
  timeframeLabel?: string;
  dateISO?: string;
  onSuccessToast: (msg: string) => void;
  onErrorToast: (msg: string) => void;
}

export default function ExportExcelModal({
  isOpen,
  onClose,
  records,
  timeframeLabel = 'This Service',
  dateISO,
  onSuccessToast,
  onErrorToast,
}: ExportModalProps) {
  if (!isOpen) return null;

  // Calculate counts for each requested download option
  const totalCount = records.length;

  const workersCount = records.filter((r) => {
    const p = r.person || r;
    return (
      p.category === 'WORKER' ||
      p.subCategory === 'WORKER' ||
      p.subCategory === 'YOUTH_WORKER' ||
      p.subCategory === 'ADULT_WORKER'
    );
  }).length;

  const youthCount = records.filter((r) => {
    const p = r.person || r;
    const isWorker =
      p.category === 'WORKER' ||
      p.subCategory === 'WORKER' ||
      p.subCategory === 'YOUTH_WORKER' ||
      p.subCategory === 'ADULT_WORKER';
    return (p.category === 'YOUTH' || p.subCategory === 'YOUTH') && !isWorker;
  }).length;

  const adultsCount = records.filter((r) => {
    const p = r.person || r;
    const isWorker =
      p.category === 'WORKER' ||
      p.subCategory === 'WORKER' ||
      p.subCategory === 'YOUTH_WORKER' ||
      p.subCategory === 'ADULT_WORKER';
    return (p.category === 'ADULT' || p.subCategory === 'ADULT') && !isWorker;
  }).length;

  const youthSundaySchoolCount = records.filter((r) => {
    const p = r.person || r;
    return (
      r.subClass === 'YOUTH' ||
      p.subCategory === 'YOUTH' ||
      p.subCategory === 'YOUTH_WORKER' ||
      p.category === 'YOUTH'
    );
  }).length;

  const adultSundaySchoolCount = records.filter((r) => {
    const p = r.person || r;
    return (
      r.subClass === 'ADULT' ||
      p.subCategory === 'ADULT' ||
      p.subCategory === 'ADULT_WORKER' ||
      p.category === 'ADULT'
    );
  }).length;

  const firstTimersCount = records.filter((r) => {
    const p = r.person || r;
    return p.status === 'FIRST_TIMER';
  }).length;

  function handleExport(category: ExportCategory, label: string) {
    const res = filterAndExportAttendanceCSV({
      records,
      category,
      timeframeLabel,
      dateISO,
    });

    if (res.success) {
      onSuccessToast(`Exported ${res.count} ${label} records to Excel!`);
      onClose();
    } else {
      onErrorToast(res.error || 'Failed to export records.');
    }
  }

  // The downloadable sheets: Full Church, Worker, Youth, Adult, Youth Sunday School, Adult Sunday School, First-Timers
  const exportOptions = [
    {
      category: 'FULL_CHURCH' as ExportCategory,
      title: 'Full Church Attendance',
      desc: 'All recorded attendees for this service',
      count: totalCount,
      icon: <Users className="w-5 h-5 text-blue-600" />,
      badgeColor: 'bg-blue-50 text-blue-700 border-blue-200',
    },
    {
      category: 'WORKERS' as ExportCategory,
      title: 'Workers Attendance',
      desc: 'All church workers (youth and adult workers combined)',
      count: workersCount,
      icon: <Briefcase className="w-5 h-5 text-indigo-600" />,
      badgeColor: 'bg-indigo-50 text-indigo-700 border-indigo-200',
    },
    {
      category: 'YOUTH' as ExportCategory,
      title: 'Youth Attendance',
      desc: 'Attendance of church youths',
      count: youthCount,
      icon: <Sparkles className="w-5 h-5 text-amber-600" />,
      badgeColor: 'bg-amber-50 text-amber-700 border-amber-200',
    },
    {
      category: 'ADULTS' as ExportCategory,
      title: 'Adult Attendance',
      desc: 'Attendance of church adults',
      count: adultsCount,
      icon: <Users className="w-5 h-5 text-sky-600" />,
      badgeColor: 'bg-sky-50 text-sky-700 border-sky-200',
    },
    {
      category: 'YOUTH_SUNDAY_SCHOOL' as ExportCategory,
      title: 'Youth Sunday School Attendance',
      desc: 'Youth & young adults Sunday School class',
      count: youthSundaySchoolCount,
      icon: <GraduationCap className="w-5 h-5 text-purple-600" />,
      badgeColor: 'bg-purple-50 text-purple-700 border-purple-200',
    },
    {
      category: 'ADULT_SUNDAY_SCHOOL' as ExportCategory,
      title: 'Adult Sunday School Attendance',
      desc: 'Adult Sunday School class & ministers',
      count: adultSundaySchoolCount,
      icon: <BookOpen className="w-5 h-5 text-teal-600" />,
      badgeColor: 'bg-teal-50 text-teal-700 border-teal-200',
    },
    {
      category: 'FIRST_TIMERS' as ExportCategory,
      title: 'First-Timers Attendance',
      desc: 'First-time visitors captured for follow-up care',
      count: firstTimersCount,
      icon: <UserCheck className="w-5 h-5 text-emerald-600" />,
      badgeColor: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="bg-white border border-slate-200 rounded-3xl max-w-md w-full p-6 shadow-2xl space-y-4 animate-in zoom-in-95 duration-150 max-h-[90vh] overflow-y-auto">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600 shrink-0">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">Download Excel Attendance</h3>
              <p className="text-xs text-slate-500 font-medium">
                Service: <span className="text-blue-600 font-bold">{timeframeLabel}</span> ({totalCount} present)
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 p-1.5 rounded-xl hover:bg-slate-100 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Notice of exported columns */}
        <div className="bg-slate-50 border border-slate-200 rounded-2xl px-3.5 py-2.5 text-xs text-slate-600 flex items-center justify-between">
          <span className="font-semibold text-slate-700">Columns Included:</span>
          <span className="font-mono text-[11px] bg-white border border-slate-200 px-2 py-0.5 rounded-md text-blue-700 font-bold">
            Name • Category • Time Arrived
          </span>
        </div>

        {/* The 5 Downloadable Sheets */}
        <div className="space-y-2">
          {exportOptions.map((opt) => (
            <button
              key={opt.category}
              type="button"
              onClick={() => handleExport(opt.category, opt.title)}
              className="w-full flex items-center justify-between p-3 rounded-2xl border border-slate-200 hover:border-blue-400 hover:bg-blue-50/50 transition-all text-left group cursor-pointer"
            >
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-slate-50 group-hover:bg-white transition-colors">
                  {opt.icon}
                </div>
                <div>
                  <div className="text-xs font-bold text-slate-900 group-hover:text-blue-600 transition-colors">
                    {opt.title}
                  </div>
                  <div className="text-[11px] text-slate-500 font-medium">{opt.desc}</div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <span
                  className={`text-xs font-bold px-2 py-0.5 rounded-full border ${opt.badgeColor}`}
                >
                  {opt.count}
                </span>
                <Download className="w-4 h-4 text-slate-400 group-hover:text-blue-600 transition-colors" />
              </div>
            </button>
          ))}
        </div>

        <div className="pt-2 text-center border-t border-slate-100">
          <p className="text-[11px] text-slate-400">
            Exported file includes UTF-8 encoding for direct opening in Microsoft Excel and Google Sheets.
          </p>
        </div>
      </div>
    </div>
  );
}
