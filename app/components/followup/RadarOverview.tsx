'use client';

import React from 'react';
import { UserCheck, AlertTriangle, UserPlus, Users } from 'lucide-react';
import { motion } from 'framer-motion';
import { tactileTapProps } from '@/lib/motion';
import { RadarMetrics, RadarFilterType } from '@/app/actions/followup';

interface RadarOverviewProps {
  metrics: RadarMetrics;
  activeFilter: RadarFilterType;
  onFilterChange: (filter: RadarFilterType) => void;
}

export default function RadarOverview({
  metrics,
  activeFilter,
  onFilterChange,
}: RadarOverviewProps) {
  const cards = [
    {
      type: 'MISSED_1_WEEK' as RadarFilterType,
      label: 'Missed 1 Sunday',
      count: metrics.missed1WeekCount,
      description: 'Missed latest Sunday service',
      icon: UserCheck,
      badgeText: 'Catch Early',
      accentColor: 'text-blue-900',
      accentBg: 'bg-blue-50',
      activeRing: 'ring-2 ring-blue-600 border-blue-600 bg-blue-50/40',
      badgeClass: 'bg-blue-100 text-blue-900',
    },
    {
      type: 'MISSED_2_WEEKS' as RadarFilterType,
      label: 'Missed 2 Sundays',
      count: metrics.missed2WeeksCount,
      description: '2 consecutive Sundays absent',
      icon: AlertTriangle,
      badgeText: 'Check On Them',
      accentColor: 'text-amber-900',
      accentBg: 'bg-amber-50',
      activeRing: 'ring-2 ring-amber-600 border-amber-600 bg-amber-50/40',
      badgeClass: 'bg-amber-100 text-amber-900',
    },
    {
      type: 'FIRST_TIMER_72H' as RadarFilterType,
      label: 'First-Timers',
      count: metrics.firstTimers72hCount,
      description: 'New visitors to welcome',
      icon: UserPlus,
      badgeText: 'Welcome Care',
      accentColor: 'text-emerald-900',
      accentBg: 'bg-emerald-50',
      activeRing: 'ring-2 ring-emerald-600 border-emerald-600 bg-emerald-50/40',
      badgeClass: 'bg-emerald-100 text-emerald-900',
    },
  ];

  return (
    <section className="w-full">
      {/* Filter Switcher Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-700">
            Follow-Up Radar
          </h2>
          <span className="text-[11px] text-slate-600">
            ({metrics.totalActiveMembers} total members)
          </span>
        </div>

        {/* 'View All' Toggle */}
        <motion.button
          {...tactileTapProps}
          onClick={() => onFilterChange('ALL')}
          className={`inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all min-h-[44px] cursor-pointer ${
            activeFilter === 'ALL'
              ? 'bg-slate-900 text-white shadow-xs'
              : 'bg-white text-slate-700 hover:text-slate-950 border border-slate-200'
          }`}
        >
          <Users className="w-3.5 h-3.5" />
          <span>All Follow-Ups</span>
        </motion.button>
      </div>

      {/* 3 Interactive Radar Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
        {cards.map((card) => {
          const Icon = card.icon;
          const isActive = activeFilter === card.type;

          return (
            <motion.button
              key={card.type}
              {...tactileTapProps}
              type="button"
              onClick={() => onFilterChange(card.type)}
              className={`w-full text-left bg-white border rounded-2xl p-4 shadow-2xs transition-all relative overflow-hidden min-h-[44px] cursor-pointer ${
                isActive
                  ? card.activeRing
                  : 'border-slate-200 hover:border-slate-300'
              }`}
            >
              <div className="flex items-start justify-between mb-2">
                <div className={`w-9 h-9 rounded-xl ${card.accentBg} flex items-center justify-center shrink-0`}>
                  <Icon className={`w-5 h-5 ${card.accentColor}`} />
                </div>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${card.badgeClass}`}>
                  {card.badgeText}
                </span>
              </div>

              <div className="flex items-baseline gap-2 mb-1">
                <span className="text-2xl font-black text-slate-950 tracking-tight">
                  {card.count}
                </span>
                <span className="text-xs font-bold text-slate-800">
                  {card.label}
                </span>
              </div>

              <p className="text-[11px] text-slate-600 leading-snug">
                {card.description}
              </p>
            </motion.button>
          );
        })}
      </div>
    </section>
  );
}
