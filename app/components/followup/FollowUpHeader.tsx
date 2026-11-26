'use client';

import React from 'react';
import Image from 'next/image';
import { RefreshCw, Search, UserCheck, Clock } from 'lucide-react';
import { motion } from 'framer-motion';
import { tactileTapProps } from '@/lib/motion';

interface FollowUpHeaderProps {
  churchName?: string;
  watTimeFormatted?: string;
  callerName: string;
  onCallerNameChange: (name: string) => void;
  onRefresh: () => void;
  isRefreshing: boolean;
  searchQuery: string;
  onSearchChange: (query: string) => void;
}

export default function FollowUpHeader({
  churchName = 'RCCG Jesus Covenant Zone',
  watTimeFormatted = 'WAT (UTC+1)',
  callerName,
  onCallerNameChange,
  onRefresh,
  isRefreshing,
  searchQuery,
  onSearchChange,
}: FollowUpHeaderProps) {
  return (
    <header className="w-full bg-white border-b border-slate-200/90 shadow-2xs">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
        {/* Brand Lockup */}
        <div className="flex items-center gap-3">
          <div className="relative w-12 h-12 shrink-0 rounded-2xl bg-white p-1 border border-slate-200 shadow-2xs">
            <Image
              src="/rccg-logo.png"
              alt="RCCG Official Seal"
              fill
              className="object-contain"
              priority
            />
          </div>
          <div className="flex flex-col">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-700">
                The Redeemed Christian Church of God
              </span>
              <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                <Clock className="w-2.5 h-2.5" />
                {watTimeFormatted}
              </span>
            </div>
            <h1 className="text-lg font-extrabold text-slate-950 leading-tight">
              {churchName}
            </h1>
            <span className="text-xs font-semibold text-blue-900">
              Zero-Forgotten-Member Follow-Up Engine
            </span>
          </div>
        </div>

        {/* Volunteer Identity & Actions */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Volunteer Caller Name Input */}
          <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 focus-within:ring-2 focus-within:ring-blue-600 focus-within:bg-white transition-all min-h-[44px]">
            <UserCheck className="w-4 h-4 text-slate-600 shrink-0" />
            <div className="flex flex-col">
              <label htmlFor="caller-name-input" className="text-[9px] font-bold uppercase tracking-wider text-slate-600">
                Active Caller
              </label>
              <input
                id="caller-name-input"
                type="text"
                value={callerName}
                onChange={(e) => onCallerNameChange(e.target.value)}
                placeholder="Your Name (e.g. Daniel)"
                className="bg-transparent text-xs font-bold text-slate-950 placeholder:text-slate-600 focus:outline-hidden min-w-[130px]"
              />
            </div>
          </div>

          {/* Search Input */}
          <div className="relative flex-1 sm:flex-none sm:w-56">
            <Search className="w-4 h-4 text-slate-600 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Search member, phone..."
              className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-3 py-2 text-xs font-medium text-slate-950 placeholder:text-slate-600 focus:bg-white focus:ring-2 focus:ring-blue-600 focus:outline-hidden min-h-[44px]"
            />
          </div>

          {/* Refresh & Sync Button */}
          <motion.button
            {...tactileTapProps}
            onClick={onRefresh}
            disabled={isRefreshing}
            className="inline-flex items-center justify-center gap-2 px-3.5 py-2 rounded-xl bg-blue-950 hover:bg-slate-900 text-white text-xs font-bold shadow-xs disabled:opacity-60 min-h-[44px]"
            title="Scan attendance & refresh follow-up queue"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">{isRefreshing ? 'Scanning...' : 'Refresh'}</span>
          </motion.button>
        </div>
      </div>
    </header>
  );
}
