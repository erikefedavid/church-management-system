'use client';

import React from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { ArrowLeft, RefreshCw, Search, X } from 'lucide-react';
import { motion } from 'framer-motion';
import { tactileTapProps } from '@/lib/motion';

interface BirthdayHeaderProps {
  churchName?: string;
  onRefresh: () => void;
  isLoading: boolean;
  searchQuery: string;
  onSearchChange: (query: string) => void;
}

export default function BirthdayHeader({
  churchName = 'RCCG Jesus Covenant Zone',
  onRefresh,
  isLoading,
  searchQuery,
  onSearchChange,
}: BirthdayHeaderProps) {
  return (
    <header className="w-full bg-white border-b border-slate-200/90 shadow-2xs">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-4 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
        {/* Back Button & Brand Lockup */}
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <Link
            href="/"
            className="h-11 px-3 inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-800 hover:bg-slate-50 hover:text-slate-950 transition-colors shrink-0 active:scale-[0.97]"
            aria-label="Back to Home"
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="hidden sm:inline">Back</span>
          </Link>

          <div className="relative w-11 h-11 shrink-0 rounded-xl bg-white p-1 border border-slate-200 shadow-2xs">
            <Image
              src="/rccg-logo.png"
              alt="RCCG Official Seal"
              fill
              className="object-contain"
              priority
            />
          </div>

          <div className="flex flex-col min-w-0">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-700">
              Birthdays
            </span>
            <h1 className="text-base sm:text-xl font-bold tracking-tight text-slate-900 leading-tight truncate">
              {churchName}
            </h1>
          </div>
        </div>

        {/* Search & Refresh */}
        <div className="flex items-center gap-2.5 w-full md:w-auto min-w-0 shrink-0">
          <div className="relative flex-1 min-w-0 md:w-52 lg:w-64">
            <Search className="w-4 h-4 text-slate-600 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Search name or phone..."
              className="w-full h-11 pl-9 pr-11 text-sm sm:text-xs font-medium rounded-xl border border-slate-200 bg-slate-50/60 text-slate-900 placeholder:text-slate-600 focus:outline-hidden focus:ring-2 focus:ring-slate-900/15 focus:border-slate-900 focus:bg-white transition-all"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => onSearchChange('')}
                className="absolute right-0 top-1/2 -translate-y-1/2 w-11 h-11 flex items-center justify-center text-slate-600 hover:text-slate-900 rounded-xl"
                aria-label="Clear search"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          <motion.button
            {...tactileTapProps}
            type="button"
            onClick={onRefresh}
            disabled={isLoading}
            className="h-11 min-w-[44px] px-3.5 inline-flex items-center justify-center gap-1.5 rounded-xl text-xs font-semibold text-slate-800 bg-white hover:bg-slate-50 border border-slate-200 shadow-2xs disabled:opacity-50 transition-colors shrink-0"
            aria-label="Refresh birthdays"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">Refresh</span>
          </motion.button>
        </div>
      </div>
    </header>
  );
}
