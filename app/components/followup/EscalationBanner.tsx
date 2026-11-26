'use client';

import React from 'react';
import { ShieldAlert, ArrowRight } from 'lucide-react';
import { motion } from 'framer-motion';
import { tactileTapProps, alertVariants } from '@/lib/motion';

interface EscalationBannerProps {
  escalatedCount: number;
  onViewEscalated: () => void;
}

export default function EscalationBanner({
  escalatedCount,
  onViewEscalated,
}: EscalationBannerProps) {
  if (escalatedCount <= 0) return null;

  return (
    <motion.aside
      {...alertVariants}
      aria-label="Youth President escalation alert"
      className="w-full bg-rose-50 border border-rose-200/90 rounded-2xl p-4 shadow-xs"
    >
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-xl bg-rose-100 flex items-center justify-center shrink-0 mt-0.5 sm:mt-0">
            <ShieldAlert className="w-5 h-5 text-rose-700" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-rose-950">
                {escalatedCount} Member{escalatedCount > 1 ? 's' : ''} Escalated to Youth President
              </h3>
              <span className="text-[10px] font-bold uppercase tracking-wider bg-rose-200/80 text-rose-900 px-2 py-0.5 rounded-full">
                48h SLA Overdue
              </span>
            </div>
            <p className="text-xs text-rose-900 mt-0.5 leading-relaxed">
              These members missed 2+ weeks or remained uncontacted beyond 48 hours. Direct personal call or welfare visit from the Youth President is recommended.
            </p>
          </div>
        </div>

        <motion.button
          {...tactileTapProps}
          onClick={onViewEscalated}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-rose-700 hover:bg-rose-800 text-white text-xs font-bold shrink-0 shadow-xs min-h-[44px]"
        >
          <span>Review Escalations</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </motion.button>
      </div>
    </motion.aside>
  );
}
