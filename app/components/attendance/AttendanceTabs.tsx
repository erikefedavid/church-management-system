'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { QrCode, Phone } from 'lucide-react';
import { tactileTapProps } from '@/lib/motion';

export type AttendanceTabMode = 'phone' | 'qr';

interface AttendanceTabsProps {
  activeTab: AttendanceTabMode;
  onTabChange: (tab: AttendanceTabMode) => void;
}

export default function AttendanceTabs({ activeTab, onTabChange }: AttendanceTabsProps) {
  return (
    <div
      role="tablist"
      aria-label="Attendance check-in method"
      className="w-full grid grid-cols-2 p-1.5 bg-slate-200/70 rounded-2xl gap-1 border border-slate-300/50"
    >
      {/* Phone Lookup Tab */}
      <motion.button
        type="button"
        role="tab"
        aria-selected={activeTab === 'phone'}
        onClick={() => onTabChange('phone')}
        className={`min-h-[44px] rounded-xl text-xs font-extrabold flex items-center justify-center gap-2 transition-all cursor-pointer ${
          activeTab === 'phone'
            ? 'bg-white text-slate-950 shadow-xs'
            : 'text-slate-700 hover:text-slate-950 hover:bg-white/50'
        }`}
        {...tactileTapProps}
      >
        <Phone className="w-4 h-4 text-blue-700" />
        <span>4-Digit Phone</span>
      </motion.button>

      {/* QR Code Tab */}
      <motion.button
        type="button"
        role="tab"
        aria-selected={activeTab === 'qr'}
        onClick={() => onTabChange('qr')}
        className={`min-h-[44px] rounded-xl text-xs font-extrabold flex items-center justify-center gap-2 transition-all cursor-pointer ${
          activeTab === 'qr'
            ? 'bg-white text-slate-950 shadow-xs'
            : 'text-slate-700 hover:text-slate-950 hover:bg-white/50'
        }`}
        {...tactileTapProps}
      >
        <QrCode className="w-4 h-4 text-blue-700" />
        <span>Scan QR Code</span>
      </motion.button>
    </div>
  );
}
