'use client';

import React from 'react';
import { Phone, MessageCircle, Cake } from 'lucide-react';
import { BirthdayCelebrantItem } from '@/app/actions/birthdays';

interface BirthdayTableProps {
  title: string;
  celebrants: BirthdayCelebrantItem[];
  emptyMessage: string;
  headerAction?: React.ReactNode;
}

export default function BirthdayTable({
  title,
  celebrants,
  emptyMessage,
  headerAction,
}: BirthdayTableProps) {
  return (
    <section className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs overflow-hidden">
      {/* Table Header */}
      <div className="px-4 sm:px-5 py-3.5 border-b border-slate-200/80 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-bold text-slate-900">{title}</h2>
          <span className="text-xs font-semibold text-slate-700 bg-slate-100 px-2 py-0.5 rounded-full">
            {celebrants.length}
          </span>
        </div>
        {headerAction}
      </div>

      {celebrants.length === 0 ? (
        <div className="p-8 text-center">
          <div className="w-10 h-10 rounded-xl bg-slate-100 text-slate-600 flex items-center justify-center mx-auto mb-2.5">
            <Cake className="w-5 h-5" />
          </div>
          <p className="text-xs font-medium text-slate-700">{emptyMessage}</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200/80 bg-slate-50/70">
                <th className="py-2.5 px-4 sm:px-5 text-[11px] font-bold uppercase tracking-wider text-slate-700">
                  Name
                </th>
                <th className="py-2.5 px-4 text-[11px] font-bold uppercase tracking-wider text-slate-700">
                  Date
                </th>
                <th className="py-2.5 px-4 text-[11px] font-bold uppercase tracking-wider text-slate-700">
                  Phone Number
                </th>
                <th className="py-2.5 px-4 sm:px-5 text-[11px] font-bold uppercase tracking-wider text-slate-700 text-right">
                  Contact
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {celebrants.map((c) => (
                <tr key={c.personId} className="hover:bg-slate-50/70 transition-colors">
                  <td className="py-3 px-4 sm:px-5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold text-slate-900">
                        {c.fullName}
                      </span>
                      {c.isToday && (
                        <span className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-900 border border-emerald-200">
                          Today
                        </span>
                      )}
                      {c.isTomorrow && (
                        <span className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 border border-amber-200">
                          Tomorrow
                        </span>
                      )}
                    </div>
                  </td>

                  <td className="py-3 px-4 text-xs font-semibold text-slate-800 whitespace-nowrap">
                    {c.birthDateFormatted}
                  </td>

                  <td className="py-3 px-4 text-xs font-medium text-slate-800 whitespace-nowrap tabular-nums">
                    {c.formattedPhone || c.phone}
                  </td>

                  <td className="py-3 px-4 sm:px-5 text-right">
                    <div className="inline-flex items-center justify-end gap-1.5">
                      <a
                        href={c.waMeGreetingUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="h-11 px-3 inline-flex items-center justify-center gap-1.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-900 border border-emerald-200 text-xs font-semibold transition-colors active:scale-[0.97]"
                        aria-label={`WhatsApp ${c.fullName}`}
                      >
                        <MessageCircle className="w-3.5 h-3.5" />
                        <span className="hidden sm:inline">WhatsApp</span>
                      </a>
                      <a
                        href={`tel:${c.phone}`}
                        className="h-11 px-3 inline-flex items-center justify-center gap-1.5 rounded-xl bg-white hover:bg-slate-50 text-slate-800 border border-slate-200 text-xs font-semibold transition-colors active:scale-[0.97]"
                        aria-label={`Call ${c.fullName}`}
                      >
                        <Phone className="w-3.5 h-3.5" />
                        <span className="hidden sm:inline">Call</span>
                      </a>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
