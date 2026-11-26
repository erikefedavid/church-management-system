'use client';

import React from 'react';
import Image from 'next/image';
import {
  Palette,
  ExternalLink,
  CheckCircle,
  Image as ImageIcon,
  AlertTriangle,
} from 'lucide-react';
import { motion } from 'framer-motion';
import { tactileTapProps } from '@/lib/motion';
import { BirthdayCelebrantItem } from '@/app/actions/birthdays';

interface MediaFlyerQueueProps {
  celebrants: BirthdayCelebrantItem[];
  onOpenAttachModal: (celebrant: BirthdayCelebrantItem) => void;
  onMarkFlyerReady: (personId: string, currentUrl?: string | null) => Promise<void>;
}

export default function MediaFlyerQueue({
  celebrants,
  onOpenAttachModal,
  onMarkFlyerReady,
}: MediaFlyerQueueProps) {
  // Filter celebrants who are today, tomorrow, or in the next 7 days
  const pendingCelebrants = celebrants.filter((c) => c.daysUntil <= 7);

  if (pendingCelebrants.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200/90 p-8 text-center shadow-2xs">
        <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-700 flex items-center justify-center mx-auto mb-3">
          <CheckCircle className="w-6 h-6" />
        </div>
        <h3 className="text-sm font-bold text-slate-900 mb-1">Flyer Queue All Caught Up!</h3>
        <p className="text-xs text-slate-700 max-w-sm mx-auto font-medium">
          No urgent birthday flyer preparation needed for the next 7 days.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between px-1">
        <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
          <Palette className="w-4 h-4 text-blue-600" />
          <span>Media Graphics Duty Queue ({pendingCelebrants.length})</span>
        </h2>
        <span className="text-xs text-slate-700 font-medium">Sorted by upcoming urgency</span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
        {pendingCelebrants.map((celebrant) => {
          const isFlyerReady = celebrant.tMinus1Log?.status === 'FLYER_READY';
          const firstChar = (celebrant.firstName || '').trim()[0] || '';
          const lastChar = (celebrant.lastName || '').trim()[0] || '';
          const initials = (firstChar + lastChar).toUpperCase() || 'M';

          return (
            <div
              key={celebrant.personId}
              className={`p-4 rounded-2xl border transition-all duration-150 flex flex-col justify-between gap-3 ${
                isFlyerReady
                  ? 'bg-emerald-50/20 border-emerald-200/70'
                  : celebrant.isTomorrow || celebrant.isToday
                    ? 'bg-amber-50/20 border-amber-200'
                    : 'bg-white border-slate-200/90'
              } shadow-2xs`}
            >
              <div className="flex items-start gap-3">
                {/* Photo / Avatar */}
                <div className="relative w-12 h-12 shrink-0 rounded-2xl overflow-hidden bg-slate-100 border border-slate-200 flex items-center justify-center">
                  {celebrant.photoUrl ? (
                    <Image
                      src={celebrant.photoUrl}
                      alt={celebrant.fullName}
                      fill
                      unoptimized
                      className="object-cover"
                      sizes="48px"
                    />
                  ) : (
                    <span className="text-xs font-bold text-slate-700">{initials}</span>
                  )}
                </div>

                {/* Details */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                        celebrant.isToday
                          ? 'bg-amber-500 text-white border-amber-600'
                          : celebrant.isTomorrow
                            ? 'bg-blue-600 text-white border-blue-700'
                            : 'bg-slate-100 text-slate-800 border-slate-200'
                      }`}
                    >
                      {celebrant.isToday
                        ? '🎉 TODAY'
                        : celebrant.isTomorrow
                          ? '⏰ TOMORROW (T-1)'
                          : `In ${celebrant.daysUntil} days`}
                    </span>

                    {celebrant.photoUrl ? (
                      <a
                        href={celebrant.photoUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-[10px] font-semibold text-blue-900 bg-blue-50 px-2 py-0.5 rounded-full border border-blue-200 hover:bg-blue-100 transition-colors"
                      >
                        <ExternalLink className="w-2.5 h-2.5" />
                        View High-Res Photo
                      </a>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-amber-800 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
                        <AlertTriangle className="w-2.5 h-2.5 text-amber-600" />
                        No Photo on File
                      </span>
                    )}
                  </div>

                  <h3 className="text-sm font-bold text-slate-900 truncate">{celebrant.fullName}</h3>
                  <p className="text-xs text-slate-700 font-medium">
                    {celebrant.department} • {celebrant.birthDateFormatted}
                  </p>
                </div>
              </div>

              {/* Status and Action Buttons */}
              <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-2">
                <div className="text-xs">
                  {isFlyerReady ? (
                    <span className="inline-flex items-center gap-1 text-emerald-800 font-bold text-[11px]">
                      <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />
                      Flyer Approved & Ready
                    </span>
                  ) : (
                    <span className="text-slate-700 font-medium text-[11px]">
                      Status: {celebrant.tMinus1Log?.status || 'Pending Flyer'}
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  {celebrant.tMinus1Log?.flyerUrl && (
                    <a
                      href={celebrant.tMinus1Log.flyerUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="h-11 px-3 inline-flex items-center gap-1 rounded-xl text-xs font-semibold text-slate-800 bg-slate-100 hover:bg-slate-200 border border-slate-200 transition-colors"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      View Flyer
                    </a>
                  )}

                  {!isFlyerReady && celebrant.tMinus1Log?.flyerUrl && (
                    <motion.button
                      {...tactileTapProps}
                      type="button"
                      onClick={() => onMarkFlyerReady(celebrant.personId, celebrant.tMinus1Log?.flyerUrl)}
                      className="h-11 px-3 inline-flex items-center gap-1 rounded-xl text-xs font-semibold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 transition-colors"
                    >
                      <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />
                      Approve
                    </motion.button>
                  )}

                  <motion.button
                    {...tactileTapProps}
                    type="button"
                    onClick={() => onOpenAttachModal(celebrant)}
                    className="h-11 px-3.5 inline-flex items-center gap-1.5 rounded-xl text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 border border-blue-600 shadow-2xs transition-colors"
                  >
                    <ImageIcon className="w-3.5 h-3.5" />
                    <span>{celebrant.tMinus1Log?.flyerUrl ? 'Update Flyer' : 'Upload Flyer'}</span>
                  </motion.button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
