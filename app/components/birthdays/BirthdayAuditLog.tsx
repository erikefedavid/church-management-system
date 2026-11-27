'use client';

import React from 'react';
import { History, ExternalLink, CheckCircle } from 'lucide-react';
import { BirthdayAuditLogItem } from '@/app/actions/birthdays';

interface BirthdayAuditLogProps {
  logs: BirthdayAuditLogItem[];
  totalCount: number;
}

export default function BirthdayAuditLog({ logs, totalCount }: BirthdayAuditLogProps) {
  if (logs.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200/90 p-8 text-center shadow-2xs">
        <div className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-600 flex items-center justify-center mx-auto mb-3">
          <History className="w-6 h-6" />
        </div>
        <h3 className="text-sm font-bold text-slate-900 mb-1">No Broadcast Records Yet</h3>
        <p className="text-xs text-slate-700 max-w-sm mx-auto font-medium">
          Birthday alerts and flyer dispatches will appear here once recorded.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
        <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
          <History className="w-4 h-4 text-emerald-600" />
          <span>Birthday Broadcast Audit Stream ({totalCount})</span>
        </h2>
        <span className="text-xs text-slate-700 font-medium">Showing recent {logs.length} entries</span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead className="bg-slate-50 text-slate-800 font-semibold border-b border-slate-200/80">
            <tr>
              <th className="py-3 px-4">Date / Time (WAT)</th>
              <th className="py-3 px-4">Celebrant</th>
              <th className="py-3 px-4">Department</th>
              <th className="py-3 px-4">Broadcast Type</th>
              <th className="py-3 px-4">Status</th>
              <th className="py-3 px-4 text-right">Flyer Asset</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {logs.map((log) => {
              const isT1 = log.type === 'GRAPHICS_T_MINUS_1';

              return (
                <tr key={log.id} className="hover:bg-slate-50/60 transition-colors">
                  <td className="py-3 px-4 font-mono text-slate-700 whitespace-nowrap">
                    {log.sentAtFormatted}
                  </td>
                  <td className="py-3 px-4 font-bold text-slate-900 whitespace-nowrap">
                    {log.personName}
                  </td>
                  <td className="py-3 px-4 text-slate-700 whitespace-nowrap">
                    {log.department}
                  </td>
                  <td className="py-3 px-4 whitespace-nowrap">
                    <span
                      className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                        isT1
                          ? 'bg-blue-50 text-blue-900 border-blue-200'
                          : 'bg-amber-50 text-amber-900 border-amber-200'
                      }`}
                    >
                      {isT1 ? '🎨 T-1 Media Alert' : '🎉 Day-Of Celebration'}
                    </span>
                  </td>
                  <td className="py-3 px-4 whitespace-nowrap">
                    <span className="inline-flex items-center gap-1 font-semibold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200 text-[10px]">
                      <CheckCircle className="w-2.5 h-2.5 text-emerald-600" />
                      {log.status}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-right whitespace-nowrap">
                    {log.flyerUrl ? (
                      <a
                        href={log.flyerUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-900 hover:text-blue-950 underline"
                      >
                        <ExternalLink className="w-3 h-3" />
                        View Flyer
                      </a>
                    ) : (
                      <span className="text-slate-600 font-mono text-[11px]">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
