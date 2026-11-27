'use client';

import React, { useState, useEffect, useCallback, useMemo, useSyncExternalStore } from 'react';
import { CalendarDays, MessageCircle, Phone, RefreshCw, Sparkles } from 'lucide-react';
import {
  getBirthdayDashboardAction,
  BirthdayCelebrantItem,
} from '@/app/actions/birthdays';
import BirthdayHeader from '@/app/components/birthdays/BirthdayHeader';
import BirthdayCalendar from '@/app/components/birthdays/BirthdayCalendar';
import BirthdayTable from '@/app/components/birthdays/BirthdayTable';
import Toast from '@/app/components/Toast';

const emptySubscribe = () => () => {};

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

function getLagosTodayFallback() {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Africa/Lagos',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
  }).formatToParts(new Date());
  const map: Record<string, string> = {};
  for (const p of parts) map[p.type] = p.value;
  return {
    year: Number(map.year) || new Date().getFullYear(),
    month: Number(map.month) || new Date().getMonth() + 1,
    day: Number(map.day) || new Date().getDate(),
  };
}

export default function BirthdayDashboardPage() {
  const mounted = useSyncExternalStore(emptySubscribe, () => true, () => false);
  const fallbackToday = useMemo(() => getLagosTodayFallback(), []);

  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [allCelebrants, setAllCelebrants] = useState<BirthdayCelebrantItem[]>([]);

  const [todayDate, setTodayDate] = useState(fallbackToday);
  const [isLast7DaysOfMonth, setIsLast7DaysOfMonth] = useState(() => {
    const daysInMonth = new Date(Date.UTC(fallbackToday.year, fallbackToday.month, 0)).getUTCDate();
    return daysInMonth - fallbackToday.day < 7;
  });

  // Calendar view state
  const [viewYear, setViewYear] = useState(fallbackToday.year);
  const [viewMonth, setViewMonth] = useState(fallbackToday.month);
  const [selectedDay, setSelectedDay] = useState<{ month: number; day: number } | null>(null);
  const [showAllMonths, setShowAllMonths] = useState(false);

  const [toast, setToast] = useState<{
    type: 'success' | 'error' | 'info';
    title?: string;
    message: string;
  } | null>(null);

  const loadBirthdays = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getBirthdayDashboardAction({ timeframe: 'ALL' });
      if (res.success) {
        setAllCelebrants(res.celebrants);
        if (res.metrics.currentYear && res.metrics.currentMonth && res.metrics.currentDay) {
          setTodayDate({
            year: res.metrics.currentYear,
            month: res.metrics.currentMonth,
            day: res.metrics.currentDay,
          });
        }
        if (typeof res.metrics.isLast7DaysOfMonth === 'boolean') {
          setIsLast7DaysOfMonth(res.metrics.isLast7DaysOfMonth);
        }
      } else {
        setToast({
          type: 'error',
          message: res.error || 'Failed to load birthdays.',
        });
      }
    } catch {
      setToast({
        type: 'error',
        message: 'Could not connect to database.',
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let ignore = false;
    Promise.resolve().then(() => {
      if (!ignore) {
        loadBirthdays();
      }
    });
    return () => {
      ignore = true;
    };
  }, [loadBirthdays]);

  // Birthdays Tomorrow (highlighted at the top)
  const tomorrowCelebrants = useMemo(
    () => allCelebrants.filter((c) => c.isTomorrow),
    [allCelebrants]
  );

  // Coming Up Next Month (shown automatically within the last 7 days of current month)
  const nextMonthNumber = todayDate.month === 12 ? 1 : todayDate.month + 1;
  const nextMonthName = MONTH_NAMES[nextMonthNumber - 1];
  const nextMonthCelebrants = useMemo(
    () =>
      allCelebrants
        .filter((c) => c.birthMonth === nextMonthNumber)
        .sort((a, b) => a.birthDay - b.birthDay),
    [allCelebrants, nextMonthNumber]
  );

  // Filtered celebrants for the main sheet/table
  const filteredCelebrants = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    let list = allCelebrants;

    if (q) {
      list = list.filter(
        (c) =>
          c.fullName.toLowerCase().includes(q) ||
          c.phone.includes(q) ||
          c.formattedPhone.includes(q) ||
          c.phoneLast4.includes(q)
      );
      return [...list].sort((a, b) =>
        a.birthMonth !== b.birthMonth ? a.birthMonth - b.birthMonth : a.birthDay - b.birthDay
      );
    }

    if (selectedDay) {
      return list
        .filter((c) => c.birthMonth === selectedDay.month && c.birthDay === selectedDay.day)
        .sort((a, b) => a.fullName.localeCompare(b.fullName));
    }

    if (!showAllMonths) {
      return list
        .filter((c) => c.birthMonth === viewMonth)
        .sort((a, b) => a.birthDay - b.birthDay);
    }

    return [...list].sort((a, b) =>
      a.birthMonth !== b.birthMonth ? a.birthMonth - b.birthMonth : a.birthDay - b.birthDay
    );
  }, [allCelebrants, searchQuery, selectedDay, showAllMonths, viewMonth]);

  const tableTitle = useMemo(() => {
    if (searchQuery.trim()) {
      return `Search Results for "${searchQuery.trim()}"`;
    }
    if (selectedDay) {
      return `Birthdays on ${MONTH_NAMES[selectedDay.month - 1]} ${selectedDay.day}`;
    }
    if (!showAllMonths) {
      return `${MONTH_NAMES[viewMonth - 1]} Birthdays`;
    }
    return 'All Birthdays';
  }, [searchQuery, selectedDay, showAllMonths, viewMonth]);

  const handlePrevMonth = () => {
    setSelectedDay(null);
    setShowAllMonths(false);
    if (viewMonth === 1) {
      setViewMonth(12);
      setViewYear((y) => y - 1);
    } else {
      setViewMonth((m) => m - 1);
    }
  };

  const handleNextMonth = () => {
    setSelectedDay(null);
    setShowAllMonths(false);
    if (viewMonth === 12) {
      setViewMonth(1);
      setViewYear((y) => y + 1);
    } else {
      setViewMonth((m) => m + 1);
    }
  };

  const handleSelectDay = (month: number, day: number) => {
    setShowAllMonths(false);
    if (selectedDay && selectedDay.month === month && selectedDay.day === day) {
      setSelectedDay(null);
    } else {
      setSelectedDay({ month, day });
    }
  };

  const handleResetToToday = () => {
    setViewYear(todayDate.year);
    setViewMonth(todayDate.month);
    setSelectedDay(null);
    setShowAllMonths(false);
  };

  if (!mounted) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="w-8 h-8 rounded-full border-2 border-slate-300 border-t-slate-900 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50/70 pb-16">
      {toast && (
        <Toast
          type={toast.type}
          title={toast.title}
          message={toast.message}
          onClose={() => setToast(null)}
        />
      )}

      <BirthdayHeader
        churchName="RCCG Jesus Covenant Zone"
        onRefresh={loadBirthdays}
        isLoading={loading}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
      />

      <main className="max-w-5xl mx-auto px-4 sm:px-6 pt-6 space-y-6">
        {/* Highlight: Birthdays Tomorrow */}
        <section
          aria-label="Birthdays Tomorrow"
          className={`rounded-2xl border p-4 sm:p-5 shadow-2xs ${
            tomorrowCelebrants.length > 0
              ? 'bg-amber-50 border-amber-300'
              : 'bg-white border-slate-200/90'
          }`}
        >
          <div className="flex items-center justify-between gap-2 mb-2">
            <div className="flex items-center gap-2">
              <Sparkles
                className={`w-4 h-4 ${
                  tomorrowCelebrants.length > 0 ? 'text-amber-700' : 'text-slate-600'
                }`}
              />
              <h2 className="text-sm font-bold text-slate-900">Birthdays Tomorrow</h2>
            </div>
            <span
              className={`text-xs font-bold px-2.5 py-0.5 rounded-full ${
                tomorrowCelebrants.length > 0
                  ? 'bg-amber-200 text-amber-950'
                  : 'bg-slate-100 text-slate-700'
              }`}
            >
              {tomorrowCelebrants.length}
            </span>
          </div>

          {tomorrowCelebrants.length === 0 ? (
            <p className="text-xs font-medium text-slate-700">
              No birthdays tomorrow.
            </p>
          ) : (
            <div className="mt-3 divide-y divide-amber-200/80 bg-white rounded-xl border border-amber-200 overflow-hidden">
              {tomorrowCelebrants.map((c) => (
                <div
                  key={c.personId}
                  className="px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                >
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                    <span className="text-sm font-bold text-slate-900">{c.fullName}</span>
                    <span className="text-xs font-semibold text-amber-900 bg-amber-100 px-2 py-0.5 rounded-full">
                      {c.birthDateFormatted}
                    </span>
                    <span className="text-xs font-medium text-slate-800 tabular-nums">
                      {c.formattedPhone || c.phone}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 sm:flex sm:items-center gap-2 w-full sm:w-auto">
                    <a
                      href={c.waMeGreetingUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="h-11 px-3 inline-flex items-center justify-center gap-1.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-900 border border-emerald-200 text-xs font-semibold transition-colors active:scale-[0.97]"
                    >
                      <MessageCircle className="w-4 h-4 shrink-0" />
                      <span>WhatsApp</span>
                    </a>
                    <a
                      href={`tel:${c.phone}`}
                      className="h-11 px-3 inline-flex items-center justify-center gap-1.5 rounded-xl bg-white hover:bg-slate-50 text-slate-800 border border-slate-200 text-xs font-semibold transition-colors active:scale-[0.97]"
                    >
                      <Phone className="w-4 h-4 shrink-0" />
                      <span>Call</span>
                    </a>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Coming Up Next Month (only shown within last 7 days of current month) */}
        {isLast7DaysOfMonth && (
          <section
            aria-label={`Coming Up Next Month: ${nextMonthName}`}
            className="bg-blue-50/70 rounded-2xl border border-blue-200 p-4 sm:p-5 shadow-2xs"
          >
            <div className="flex items-center justify-between gap-2 mb-3">
              <div className="flex items-center gap-2">
                <CalendarDays className="w-4 h-4 text-blue-700" />
                <h2 className="text-sm font-bold text-slate-900">
                  Coming Up Next Month ({nextMonthName})
                </h2>
              </div>
              <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-blue-100 text-blue-900">
                {nextMonthCelebrants.length}
              </span>
            </div>

            {nextMonthCelebrants.length === 0 ? (
              <p className="text-xs font-medium text-slate-700">
                No birthdays recorded for {nextMonthName}.
              </p>
            ) : (
              <div className="bg-white rounded-xl border border-blue-200/80 overflow-hidden">
                {/* Mobile Cards (< sm) */}
                <div className="block sm:hidden divide-y divide-slate-100">
                  {nextMonthCelebrants.map((c) => (
                    <div key={c.personId} className="p-4 flex flex-col gap-3">
                      <div className="min-w-0">
                        <div className="text-base font-bold text-slate-900 leading-snug">
                          {c.fullName}
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-slate-700">
                          <span className="font-semibold text-slate-900">{c.birthDateFormatted}</span>
                          <span className="text-slate-400">•</span>
                          <span className="font-medium text-slate-800 tabular-nums">
                            {c.formattedPhone || c.phone}
                          </span>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2.5">
                        <a
                          href={c.waMeGreetingUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="h-11 px-3 inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-900 border border-emerald-200 text-xs font-semibold transition-colors active:scale-[0.97]"
                          aria-label={`WhatsApp ${c.fullName}`}
                        >
                          <MessageCircle className="w-4 h-4 shrink-0" />
                          <span>WhatsApp</span>
                        </a>
                        <a
                          href={`tel:${c.phone}`}
                          className="h-11 px-3 inline-flex items-center justify-center gap-2 rounded-xl bg-white hover:bg-slate-50 text-slate-800 border border-slate-200 text-xs font-semibold transition-colors active:scale-[0.97]"
                          aria-label={`Call ${c.fullName}`}
                        >
                          <Phone className="w-4 h-4 shrink-0" />
                          <span>Call</span>
                        </a>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Desktop / Tablet Table (sm:+) */}
                <div className="hidden sm:block overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-slate-200/80 bg-slate-50/70">
                        <th className="py-2 px-4 text-[11px] font-bold uppercase tracking-wider text-slate-700">
                          Name
                        </th>
                        <th className="py-2 px-4 text-[11px] font-bold uppercase tracking-wider text-slate-700">
                          Date
                        </th>
                        <th className="py-2 px-4 text-[11px] font-bold uppercase tracking-wider text-slate-700">
                          Phone Number
                        </th>
                        <th className="py-2 px-4 text-[11px] font-bold uppercase tracking-wider text-slate-700 text-right">
                          Contact
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {nextMonthCelebrants.map((c) => (
                        <tr key={c.personId} className="hover:bg-slate-50/70 transition-colors">
                          <td className="py-2.5 px-4 text-sm font-semibold text-slate-900">
                            {c.fullName}
                          </td>
                          <td className="py-2.5 px-4 text-xs font-semibold text-slate-800 whitespace-nowrap">
                            {c.birthDateFormatted}
                          </td>
                          <td className="py-2.5 px-4 text-xs font-medium text-slate-800 whitespace-nowrap tabular-nums">
                            {c.formattedPhone || c.phone}
                          </td>
                          <td className="py-2.5 px-4 text-right">
                            <div className="inline-flex items-center justify-end gap-1.5">
                              <a
                                href={c.waMeGreetingUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="h-11 px-3 inline-flex items-center justify-center gap-1.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-900 border border-emerald-200 text-xs font-semibold transition-colors"
                                aria-label={`WhatsApp ${c.fullName}`}
                              >
                                <MessageCircle className="w-3.5 h-3.5" />
                                <span>WhatsApp</span>
                              </a>
                              <a
                                href={`tel:${c.phone}`}
                                className="h-11 px-3 inline-flex items-center justify-center gap-1.5 rounded-xl bg-white hover:bg-slate-50 text-slate-800 border border-slate-200 text-xs font-semibold transition-colors"
                                aria-label={`Call ${c.fullName}`}
                              >
                                <Phone className="w-3.5 h-3.5" />
                                <span>Call</span>
                              </a>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </section>
        )}

        {/* Calendar + Birthday Sheet */}
        {loading && allCelebrants.length === 0 ? (
          <div className="py-12 flex flex-col items-center justify-center gap-2">
            <RefreshCw className="w-6 h-6 text-slate-600 animate-spin" />
            <p className="text-xs font-medium text-slate-700">Loading birthdays...</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            <div className="lg:col-span-4">
              <BirthdayCalendar
                viewYear={viewYear}
                viewMonth={viewMonth}
                todayYear={todayDate.year}
                todayMonth={todayDate.month}
                todayDay={todayDate.day}
                selectedDay={selectedDay}
                celebrants={allCelebrants}
                onPrevMonth={handlePrevMonth}
                onNextMonth={handleNextMonth}
                onSelectDay={handleSelectDay}
                onResetToToday={handleResetToToday}
              />
            </div>

            <div className="lg:col-span-8">
              <BirthdayTable
                title={tableTitle}
                celebrants={filteredCelebrants}
                emptyMessage={
                  searchQuery.trim()
                    ? `No birthday matches "${searchQuery.trim()}".`
                    : selectedDay
                      ? `No birthdays on ${MONTH_NAMES[selectedDay.month - 1]} ${selectedDay.day}.`
                      : `No birthdays in ${MONTH_NAMES[viewMonth - 1]}.`
                }
                headerAction={
                  <div className="flex items-center gap-2 flex-wrap">
                    {selectedDay && (
                      <button
                        type="button"
                        onClick={() => setSelectedDay(null)}
                        className="h-11 px-3.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-800 transition-colors"
                      >
                        Clear day
                      </button>
                    )}
                    {!searchQuery.trim() && !selectedDay && (
                      <button
                        type="button"
                        onClick={() => setShowAllMonths((v) => !v)}
                        className={`h-11 px-3.5 rounded-xl border text-xs font-semibold transition-colors ${
                          showAllMonths
                            ? 'bg-slate-900 text-white border-slate-900'
                            : 'bg-white text-slate-800 border-slate-200 hover:bg-slate-50'
                        }`}
                      >
                        {showAllMonths ? `Show ${MONTH_NAMES[viewMonth - 1]} Only` : 'View All Months'}
                      </button>
                    )}
                  </div>
                }
              />
            </div>
          </div>
        )}
      </main>

      <footer className="max-w-5xl mx-auto px-4 sm:px-6 pt-8 pb-4 text-center">
        <p className="text-xs italic text-slate-500">
          &ldquo;The LORD bless you and keep you...&rdquo; (Numbers 6:24)
        </p>
      </footer>
    </div>
  );
}
