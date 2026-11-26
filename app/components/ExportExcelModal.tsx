'use client';

import React from 'react';
import { X, Download, Users, Sparkles, UserCheck, FileSpreadsheet } from 'lucide-react';
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

  const totalCount = records.length;

  const youthMembersCount = records.filter((r) => {
    const p = r.person || r;
    return p.status !== 'FIRST_TIMER';
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

  const exportOptions = [
    {
      category: 'ALL_YOUTH' as ExportCategory,
      title: 'All Youth Attendance',
      desc: 'All Youth Members & First-Timers present',
      count: totalCount,
      icon: <Users className="w-5 h-5 text-blue-600" />,
      badgeColor: 'bg-blue-50 text-blue-700 border-blue-200',
    },
    {
      category: 'YOUTH_MEMBERS' as ExportCategory,
      title: 'Youth Members',
      desc: 'Existing Youth Members only',
      count: youthMembersCount,
      icon: <Sparkles className="w-5 h-5 text-amber-600" />,
      badgeColor: 'bg-amber-50 text-amber-700 border-amber-200',
    },
    {
      category: 'FIRST_TIMERS' as ExportCategory,
      title: 'First-Timers',
      desc: 'First-time youth visitors for follow-up care',
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
              <h3 className="text-base font-bold text-slate-900">Download Youth Attendance</h3>
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
        <div className="bg-slate-50 border border-slate-200 rounded-2xl px-3.5 py-2.5 text-xs text-slate-600 flex items-center justify-between gap-2">
          <span className="font-semibold text-slate-700 shrink-0">Columns:</span>
          <span className="font-mono text-[11px] bg-white border border-slate-200 px-2 py-0.5 rounded-md text-blue-700 font-bold truncate">
            Name • Status • Service • Time (WAT) • Method
          </span>
        </div>

        <div className="space-y-2">
          {exportOptions.map((opt) => (
            <button
              key={opt.category}
              type="button"
              onClick={() => handleExport(opt.category, opt.title)}
              className="w-full flex items-center justify-between p-3 rounded-2xl border border-slate-200 hover:border-blue-400 hover:bg-blue-50/50 transition-all text-left group cursor-pointer active:scale-[0.99]"
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
