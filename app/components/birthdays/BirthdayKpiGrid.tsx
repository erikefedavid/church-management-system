'use client';

import React from 'react';
import { Cake, Palette, Calendar, CheckCircle2 } from 'lucide-react';
import { motion } from 'framer-motion';
import { tactileTapProps } from '@/lib/motion';
import { BirthdayMetrics, BirthdayTimeframeFilter } from '@/app/actions/birthdays';

interface BirthdayKpiGridProps {
  metrics: BirthdayMetrics;
  activeFilter: BirthdayTimeframeFilter;
  onFilterChange: (filter: BirthdayTimeframeFilter) => void;
}

export default function BirthdayKpiGrid({
  metrics,
  activeFilter,
  onFilterChange,
}: BirthdayKpiGridProps) {
  const cards = [
    {
      id: 'TODAY' as BirthdayTimeframeFilter,
      label: "Today's Celebrants",
      sublabel: 'Day-Of Celebration',
      count: metrics.todayCount,
      icon: Cake,
      activeRing: 'ring-2 ring-amber-600 bg-amber-50/40',
      badgeClass: 'bg-amber-100 text-amber-900 border-amber-200',
      iconClass: 'text-amber-700 bg-amber-100',
    },
    {
      id: 'TOMORROW' as BirthdayTimeframeFilter,
      label: 'T-1 Flyer Alerts',
      sublabel: 'Media Alert Target',
      count: metrics.tomorrowCount,
      icon: Palette,
      activeRing: 'ring-2 ring-blue-600 bg-blue-50/40',
      badgeClass: 'bg-blue-100 text-blue-900 border-blue-200',
      iconClass: 'text-blue-700 bg-blue-100',
    },
    {
      id: 'THIS_MONTH' as BirthdayTimeframeFilter,
      label: 'Upcoming This Month',
      sublabel: 'Active Calendar',
      count: metrics.monthCount,
      icon: Calendar,
      activeRing: 'ring-2 ring-indigo-600 bg-indigo-50/40',
      badgeClass: 'bg-indigo-100 text-indigo-900 border-indigo-200',
      iconClass: 'text-indigo-700 bg-indigo-100',
    },
    {
      id: 'ALL' as BirthdayTimeframeFilter,
      label: 'Total Broadcasts Logged',
      sublabel: 'Audit History',
      count: metrics.totalLogsCount,
      icon: CheckCircle2,
      activeRing: 'ring-2 ring-emerald-600 bg-emerald-50/40',
      badgeClass: 'bg-emerald-100 text-emerald-900 border-emerald-200',
      iconClass: 'text-emerald-700 bg-emerald-100',
    },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
      {cards.map((card) => {
        const IconComponent = card.icon;
        const isActive = activeFilter === card.id;

        return (
          <motion.button
            key={card.id}
            {...tactileTapProps}
            type="button"
            onClick={() => onFilterChange(card.id)}
            className={`w-full text-left p-4 rounded-2xl border transition-all duration-150 flex flex-col justify-between ${
              isActive
                ? `${card.activeRing} border-transparent shadow-xs`
                : 'bg-white border-slate-200/90 hover:border-slate-300 hover:bg-slate-50/60 shadow-2xs'
            }`}
          >
            <div className="flex items-center justify-between gap-2 w-full mb-3">
              <span className="text-xs font-semibold text-slate-800 line-clamp-1">
                {card.label}
              </span>
              <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${card.iconClass}`}>
                <IconComponent className="w-4 h-4" />
              </div>
            </div>

            <div className="flex items-baseline justify-between gap-2 w-full">
              <span className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900">
                {card.count}
              </span>
              <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${card.badgeClass}`}>
                {card.sublabel}
              </span>
            </div>
          </motion.button>
        );
      })}
    </div>
  );
}
