'use client';

import React, { useState } from 'react';
import { CheckCircle2, Phone, MessageSquare, HeartHandshake, Calendar, PhoneOff } from 'lucide-react';
import { motion } from 'framer-motion';
import { tactileTapProps } from '@/lib/motion';
import { MandatedOutcome } from '@/app/actions/followup';

interface TaskOutcomeSelectorProps {
  callerName: string;
  onSubmitOutcome: (outcome: MandatedOutcome, note?: string) => Promise<boolean>;
  isSubmitting: boolean;
}

export default function TaskOutcomeSelector({
  callerName,
  onSubmitOutcome,
  isSubmitting,
}: TaskOutcomeSelectorProps) {
  const [selectedOutcome, setSelectedOutcome] = useState<MandatedOutcome>('Contacted (WhatsApp)');
  const [note, setNote] = useState('');

  const outcomes: { value: MandatedOutcome; label: string; icon: React.ElementType; color: string }[] = [
    {
      value: 'Contacted (WhatsApp)',
      label: 'Contacted (WhatsApp)',
      icon: MessageSquare,
      color: 'hover:border-emerald-500 data-[selected=true]:border-emerald-600 data-[selected=true]:bg-emerald-50 data-[selected=true]:text-emerald-950',
    },
    {
      value: 'Contacted (Call)',
      label: 'Contacted (Call)',
      icon: Phone,
      color: 'hover:border-blue-500 data-[selected=true]:border-blue-600 data-[selected=true]:bg-blue-50 data-[selected=true]:text-blue-950',
    },
    {
      value: 'Prayed With',
      label: 'Prayed With',
      icon: HeartHandshake,
      color: 'hover:border-indigo-500 data-[selected=true]:border-indigo-600 data-[selected=true]:bg-indigo-50 data-[selected=true]:text-indigo-950',
    },
    {
      value: 'Visit Scheduled',
      label: 'Visit Scheduled',
      icon: Calendar,
      color: 'hover:border-amber-500 data-[selected=true]:border-amber-600 data-[selected=true]:bg-amber-50 data-[selected=true]:text-amber-950',
    },
    {
      value: 'No Response',
      label: 'No Response',
      icon: PhoneOff,
      color: 'hover:border-slate-500 data-[selected=true]:border-slate-600 data-[selected=true]:bg-slate-100 data-[selected=true]:text-slate-950',
    },
  ];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const success = await onSubmitOutcome(selectedOutcome, note);
    if (success) {
      setNote('');
    }
  };

  return (
    <form onSubmit={handleSubmit} className="w-full flex flex-col gap-3 pt-3 border-t border-slate-200">
      <div className="flex flex-wrap items-center justify-between gap-1">
        <span className="text-xs font-bold uppercase tracking-wider text-slate-700">
          Record Follow-Up Call Outcome:
        </span>
        <span className="text-xs text-slate-600">
          Caller: <strong className="text-slate-950">{callerName || 'Volunteer'}</strong>
        </span>
      </div>

      {/* Outcome Chips */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
        {outcomes.map((opt) => {
          const Icon = opt.icon;
          const isSelected = selectedOutcome === opt.value;
          return (
            <button
              type="button"
              key={opt.value}
              data-selected={isSelected}
              onClick={() => setSelectedOutcome(opt.value)}
              className={`flex items-center gap-1.5 px-2.5 py-2 rounded-xl border text-xs font-bold transition-all min-h-[44px] cursor-pointer text-slate-700 ${
                isSelected
                  ? 'border-blue-600 bg-blue-50 text-blue-950 ring-1 ring-blue-600 shadow-2xs'
                  : 'bg-white border-slate-200 hover:border-slate-300'
              }`}
            >
              <Icon className="w-3.5 h-3.5 shrink-0" />
              <span className="line-clamp-1 text-left">{opt.label}</span>
            </button>
          );
        })}
      </div>

      {/* Note Field & Submit Button */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
        <input
          type="text"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Call note (e.g. Navigating exams, requested prayer for strength)..."
          className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm sm:text-xs text-slate-950 placeholder:text-slate-600 focus:bg-white focus:ring-2 focus:ring-blue-600 focus:outline-hidden min-h-[44px]"
        />

        <motion.button
          {...tactileTapProps}
          type="submit"
          disabled={isSubmitting}
          className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-blue-950 hover:bg-slate-900 text-white text-sm sm:text-xs font-bold shadow-xs disabled:opacity-50 min-h-[44px] shrink-0"
        >
          {isSubmitting ? (
            <span className="inline-flex items-center gap-2">
              <span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
              Recording...
            </span>
          ) : (
            <>
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>Save Outcome</span>
            </>
          )}
        </motion.button>
      </div>
    </form>
  );
}
