'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { Lock, ShieldCheck, ArrowRight, Users } from 'lucide-react';
import Link from 'next/link';
import { surfaceEntranceVariants, tactileTapProps } from '@/lib/motion';
import { DeviceAttendanceLock } from '@/lib/device-lock';

interface AntiProxyLockCardProps {
  lock: DeviceAttendanceLock;
  onFamilyUnlock: () => void;
}

export default function AntiProxyLockCard({ lock, onFamilyUnlock }: AntiProxyLockCardProps) {
  return (
    <motion.div
      variants={surfaceEntranceVariants}
      initial="initial"
      animate="animate"
      exit="exit"
      className="bg-white border border-slate-200/90 rounded-3xl p-6 shadow-sm space-y-5 text-center"
    >
      {/* Lock Icon Emblem */}
      <div className="mx-auto w-16 h-16 rounded-3xl bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-800 shadow-2xs">
        <Lock className="w-8 h-8 text-blue-700" />
      </div>

      <div className="space-y-1.5">
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-100 text-slate-800 text-xs font-extrabold uppercase tracking-wider">
          <ShieldCheck className="w-3.5 h-3.5 text-blue-700" />
          <span>Device Locked to Service</span>
        </div>
        <h2 className="text-lg font-extrabold text-slate-950">
          Attendance Marked on this Device
        </h2>
        <p className="text-xs text-slate-700 leading-relaxed font-medium">
          To maintain attendance integrity, this phone is locked to your pass until the next scheduled church service begins.
        </p>
      </div>

      {/* Lock Details Card */}
      <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-4 text-xs space-y-2 text-left">
        <div className="flex justify-between items-center text-slate-700">
          <span className="font-medium">Youth Member:</span>
          <span className="font-bold text-slate-950">{lock.checkedInName}</span>
        </div>
        <div className="flex justify-between items-center text-slate-700">
          <span className="font-medium">Active Service:</span>
          <span className="font-bold text-slate-950">{lock.serviceName}</span>
        </div>
        <div className="flex justify-between items-center text-slate-700">
          <span className="font-medium">Date:</span>
          <span className="font-bold text-slate-950">{lock.serviceDate}</span>
        </div>
      </div>

      {/* Actions */}
      <div className="space-y-2.5 pt-1">
        <Link
          href="/welcome"
          className="w-full min-h-[50px] rounded-2xl bg-blue-700 hover:bg-blue-800 text-white font-bold text-sm shadow-md shadow-blue-700/20 flex items-center justify-center gap-2 transition-[background-color,transform] cursor-pointer"
        >
          <span>View My Verified Attendance Pass</span>
          <ArrowRight className="w-4 h-4 text-white/90" />
        </Link>

        {/* Family checkin override with confirmation */}
        <motion.button
          type="button"
          onClick={onFamilyUnlock}
          className="w-full min-h-[44px] flex items-center justify-center gap-1.5 text-xs font-semibold text-slate-700 hover:text-slate-950 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
          {...tactileTapProps}
        >
          <Users className="w-3.5 h-3.5" />
          <span>Check in a family member without a phone</span>
        </motion.button>
      </div>
    </motion.div>
  );
}
