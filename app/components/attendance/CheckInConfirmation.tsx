'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { CheckCircle2, ShieldCheck, ArrowRight, RotateCcw, Clock, Sparkles } from 'lucide-react';
import Link from 'next/link';
import { surfaceEntranceVariants, tactileTapProps } from '@/lib/motion';

export interface CheckInReceipt {
  personName: string;
  serviceName: string;
  isEarlyBird?: boolean;
  message: string;
  timestampFormatted?: string;
  distanceMeters?: number | null;
}

interface CheckInConfirmationProps {
  receipt: CheckInReceipt;
  onReset: () => void;
}

export default function CheckInConfirmation({ receipt, onReset }: CheckInConfirmationProps) {
  return (
    <motion.div
      variants={surfaceEntranceVariants}
      initial="initial"
      animate="animate"
      exit="exit"
      className="bg-white border border-slate-200/90 rounded-3xl p-6 shadow-md space-y-5 text-center"
    >
      {/* Verified Emblem */}
      <div className="mx-auto w-20 h-20 rounded-3xl bg-emerald-50 border-2 border-emerald-200 flex items-center justify-center text-emerald-600 shadow-sm">
        <CheckCircle2 className="w-10 h-10 text-emerald-600" />
      </div>

      {/* Confirmation Headline */}
      <div className="space-y-1">
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-100 text-emerald-950 text-xs font-extrabold uppercase tracking-wider">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-700" />
          <span>Sanctuary Verified</span>
        </div>
        <h2 className="text-xl font-extrabold text-slate-950 pt-1">
          Attendance Confirmed!
        </h2>
        <p className="text-sm font-bold text-blue-900">
          {receipt.personName}
        </p>
      </div>

      {/* Early-Bird Banner if routed from Workers Meeting */}
      {receipt.isEarlyBird && (
        <div className="p-3 bg-amber-50 border border-amber-200 rounded-2xl flex items-center gap-2.5 text-left">
          <Sparkles className="w-5 h-5 text-amber-600 shrink-0" />
          <div className="text-xs text-amber-950">
            <span className="font-extrabold">Early Arrival Logged!</span>
            <p className="text-[11px] text-amber-900 mt-0.5">
              Attendance marked in advance for {receipt.serviceName}.
            </p>
          </div>
        </div>
      )}

      {/* Details Box */}
      <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-4 text-xs space-y-2 text-left">
        <div className="flex justify-between items-center text-slate-700">
          <span className="font-medium">Church Service:</span>
          <span className="font-bold text-slate-950">{receipt.serviceName}</span>
        </div>
        <div className="flex justify-between items-center text-slate-700">
          <span className="font-medium">Zone:</span>
          <span className="font-bold text-slate-950">RCCG Jesus Covenant Zone</span>
        </div>
        <div className="flex justify-between items-center text-slate-700">
          <span className="font-medium">Status:</span>
          <span className="font-bold text-emerald-700">Recorded & Locked to Device</span>
        </div>
      </div>

      {/* Actions */}
      <div className="space-y-2.5 pt-1">
        <Link
          href="/welcome"
          className="w-full min-h-[50px] rounded-2xl bg-blue-700 hover:bg-blue-800 text-white font-bold text-sm shadow-md shadow-blue-700/20 flex items-center justify-center gap-2 transition-[background-color,transform] cursor-pointer"
        >
          <span>Proceed to Sunday Worship Hub</span>
          <ArrowRight className="w-4 h-4 text-white/90" />
        </Link>

        <motion.button
          type="button"
          onClick={onReset}
          className="w-full min-h-[44px] flex items-center justify-center gap-1.5 text-xs font-semibold text-slate-700 hover:text-slate-950 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
          {...tactileTapProps}
        >
          <RotateCcw className="w-3.5 h-3.5" />
          <span>Check In Another Member</span>
        </motion.button>
      </div>
    </motion.div>
  );
}
