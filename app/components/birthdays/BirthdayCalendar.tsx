'use client';

import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { BirthdayCelebrantItem } from '@/app/actions/birthdays';

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

interface BirthdayCalendarProps {
  viewYear: number;
  viewMonth: number; // 1-12
  todayYear: number;
  todayMonth: number; // 1-12
  todayDay: number;
  selectedDay: { month: number; day: number } | null;
  celebrants: BirthdayCelebrantItem[];
  onPrevMonth: () => void;
  onNextMonth: () => void;
  onSelectDay: (month: number, day: number) => void;
  onResetToToday: () => void;
}

export default function BirthdayCalendar({
  viewYear,
  viewMonth,
  todayYear,
  todayMonth,
  todayDay,
  selectedDay,
  celebrants,
  onPrevMonth,
  onNextMonth,
  onSelectDay,
  onResetToToday,
}: BirthdayCalendarProps) {
  const daysInMonth = new Date(Date.UTC(viewYear, viewMonth, 0)).getUTCDate();
  const firstDayOfWeek = new Date(Date.UTC(viewYear, viewMonth - 1, 1)).getUTCDay();

  // Map day -> count of birthdays in viewed month
  const birthdayCountByDay = new Map<number, number>();
  for (const c of celebrants) {
    if (c.birthMonth === viewMonth) {
      birthdayCountByDay.set(c.birthDay, (birthdayCountByDay.get(c.birthDay) || 0) + 1);
    }
  }

  const cells: Array<{ day: number | null }> = [];
  for (let i = 0; i < firstDayOfWeek; i++) {
    cells.push({ day: null });
  }
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ day: d });
  }

  const isViewingCurrentMonth = viewYear === todayYear && viewMonth === todayMonth;

  return (
    <section
      aria-label="Birthday Calendar"
      className="w-full min-w-0 bg-white rounded-2xl border border-slate-200/90 p-3.5 sm:p-4 shadow-2xs"
    >
      {/* Month Navigation */}
      <div className="flex items-center justify-between gap-2 mb-3">
        <button
          type="button"
          onClick={onPrevMonth}
          className="w-11 h-11 shrink-0 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-800 flex items-center justify-center transition-colors active:scale-[0.97]"
          aria-label="Previous month"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>

        <div className="flex flex-col items-center min-w-0">
          <h2 className="text-sm font-bold text-slate-900 truncate">
            {MONTH_NAMES[viewMonth - 1]} {viewYear}
          </h2>
          {!isViewingCurrentMonth && (
            <button
              type="button"
              onClick={onResetToToday}
              className="text-xs font-semibold text-blue-700 hover:text-blue-900 underline underline-offset-2 py-1 px-2 min-h-[32px]"
            >
              Jump to today
            </button>
          )}
        </div>

        <button
          type="button"
          onClick={onNextMonth}
          className="w-11 h-11 shrink-0 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-800 flex items-center justify-center transition-colors active:scale-[0.97]"
          aria-label="Next month"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {/* Weekday Headers */}
      <div className="grid grid-cols-7 gap-1 mb-1">
        {WEEKDAYS.map((wd) => (
          <div
            key={wd}
            className="h-7 flex items-center justify-center text-xs font-semibold text-slate-600"
          >
            {wd}
          </div>
        ))}
      </div>

      {/* Day Grid */}
      <div className="grid grid-cols-7 gap-1">
        {cells.map((cell, idx) => {
          if (cell.day === null) {
            return <div key={`empty-${idx}`} className="h-11" />;
          }

          const d = cell.day;
          const bCount = birthdayCountByDay.get(d) || 0;
          const hasBirthdays = bCount > 0;
          const isToday = isViewingCurrentMonth && d === todayDay;
          const isSelected =
            selectedDay !== null && selectedDay.month === viewMonth && selectedDay.day === d;

          return (
            <button
              key={d}
              type="button"
              onClick={() => onSelectDay(viewMonth, d)}
              title={
                hasBirthdays
                  ? `${bCount} birthday${bCount > 1 ? 's' : ''} on ${MONTH_NAMES[viewMonth - 1]} ${d}`
                  : `${MONTH_NAMES[viewMonth - 1]} ${d}`
              }
              className={`relative h-11 min-w-0 rounded-xl text-xs font-semibold flex flex-col items-center justify-center transition-colors active:scale-[0.97] ${
                isSelected
                  ? 'bg-slate-900 text-white'
                  : hasBirthdays
                    ? 'bg-amber-100 text-amber-950 hover:bg-amber-200/80 border border-amber-300'
                    : isToday
                      ? 'bg-slate-100 text-slate-950 ring-1 ring-slate-900'
                      : 'text-slate-800 hover:bg-slate-100'
              }`}
            >
              <span>{d}</span>
              {hasBirthdays && (
                <span
                  className={`w-1.5 h-1.5 rounded-full mt-0.5 ${
                    isSelected ? 'bg-amber-400' : 'bg-amber-600'
                  }`}
                />
              )}
            </button>
          );
        })}
      </div>

      {/* Legend */}
      <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-700 font-medium">
        <span className="inline-flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-amber-500 inline-block" />
          Birthday
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-sm ring-1 ring-slate-900 bg-slate-100 inline-block" />
          Today
        </span>
      </div>
    </section>
  );
}
