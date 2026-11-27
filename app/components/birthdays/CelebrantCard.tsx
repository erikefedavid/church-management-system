'use client';

import React, { useState } from 'react';
import Image from 'next/image';
import {
  MessageSquare,
  Palette,
  CheckCircle,
  Sparkles,
  Camera,
  Image as ImageIcon,
} from 'lucide-react';
import { motion } from 'framer-motion';
import { tactileTapProps } from '@/lib/motion';
import { BirthdayCelebrantItem } from '@/app/actions/birthdays';

interface CelebrantCardProps {
  celebrant: BirthdayCelebrantItem;
  onOpenAttachModal: (celebrant: BirthdayCelebrantItem) => void;
}

export default function CelebrantCard({
  celebrant,
  onOpenAttachModal,
}: CelebrantCardProps) {
  const [imageError, setImageError] = useState(false);

  // Timing Pill determination
  let timingBadgeClass = 'bg-slate-100 text-slate-800 border-slate-200';
  let timingLabel = `In ${celebrant.daysUntil} days`;
  if (celebrant.isToday) {
    timingBadgeClass = 'bg-amber-500 text-white border-amber-600 font-bold';
    timingLabel = '🎉 TODAY';
  } else if (celebrant.isTomorrow) {
    timingBadgeClass = 'bg-blue-600 text-white border-blue-700 font-bold';
    timingLabel = '⏰ TOMORROW (T-1)';
  }

  // Flyer Status determination
  const flyerReady = celebrant.tMinus1Log?.status === 'FLYER_READY';
  const flyerSent = celebrant.tMinus1Log?.status === 'SENT';
  const flyerAcknowledged = celebrant.tMinus1Log?.status === 'ACKNOWLEDGED';

  // Defensive initials fallback
  const firstChar = (celebrant.firstName || '').trim()[0] || '';
  const lastChar = (celebrant.lastName || '').trim()[0] || '';
  const initials = (firstChar + lastChar).toUpperCase() || 'M';

  return (
    <div className="bg-white rounded-2xl border border-slate-200/90 p-4 sm:p-5 shadow-2xs hover:shadow-xs hover:border-slate-300 transition-all duration-150 flex flex-col justify-between gap-4">
      {/* Top Details */}
      <div className="flex items-start gap-3.5">
        {/* Avatar or Photo */}
        <div className="relative w-14 h-14 shrink-0 rounded-2xl overflow-hidden bg-slate-100 border border-slate-200 flex items-center justify-center">
          {celebrant.photoUrl && !imageError ? (
            <Image
              src={celebrant.photoUrl}
              alt={celebrant.fullName}
              fill
              unoptimized
              onError={() => setImageError(true)}
              className="object-cover"
              sizes="56px"
            />
          ) : (
            <span className="text-sm font-extrabold text-slate-700">{initials}</span>
          )}
        </div>

        {/* Member Identity & Department */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className={`text-[10px] px-2 py-0.5 rounded-full border ${timingBadgeClass}`}>
              {timingLabel}
            </span>

            {celebrant.photoUrl ? (
              <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                <CheckCircle className="w-2.5 h-2.5 text-emerald-600" />
                Photo on File
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-amber-800 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
                <Camera className="w-2.5 h-2.5 text-amber-600" />
                Photo Needed
              </span>
            )}
          </div>

          <h3 className="text-sm font-bold text-slate-900 truncate">{celebrant.fullName}</h3>
          <p className="text-xs text-slate-700 font-medium truncate">
            {celebrant.department} • {celebrant.birthDateFormatted}
          </p>
          <p className="text-[11px] text-slate-700 font-mono mt-0.5">
            {celebrant.formattedPhone}
          </p>
        </div>
      </div>

      {/* Flyer & Dispatch Pipeline Statuses */}
      <div className="bg-slate-50/70 rounded-xl p-2.5 border border-slate-200/60 text-[11px] flex items-center justify-between gap-2 flex-wrap">
        {/* Flyer Status Indicator */}
        <div className="flex items-center gap-1.5">
          <Palette className="w-3.5 h-3.5 text-slate-600 shrink-0" />
          <span className="font-semibold text-slate-800">Media Flyer:</span>
          {flyerReady ? (
            <span className="text-emerald-800 font-bold inline-flex items-center gap-1">
              <CheckCircle className="w-3 h-3 text-emerald-600" />
              Ready
            </span>
          ) : flyerAcknowledged ? (
            <span className="text-blue-800 font-semibold">Designing</span>
          ) : flyerSent ? (
            <span className="text-sky-800 font-semibold">Alert Sent</span>
          ) : (
            <span className="text-slate-700">Pending</span>
          )}
        </div>

        {/* Day-Of Alert Status */}
        <div className="flex items-center gap-1.5">
          <Sparkles className="w-3.5 h-3.5 text-slate-600 shrink-0" />
          <span className="font-semibold text-slate-800">Celebration:</span>
          {celebrant.dayOfLog ? (
            <span className="text-emerald-800 font-bold inline-flex items-center gap-1">
              <CheckCircle className="w-3 h-3 text-emerald-600" />
              Logged
            </span>
          ) : (
            <span className="text-slate-700">Scheduled</span>
          )}
        </div>
      </div>

      {/* Action Buttons (Strictly min 44px height for accessibility) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1 border-t border-slate-100">
        {/* 1-Click WhatsApp Button */}
        <motion.a
          {...tactileTapProps}
          href={celebrant.waMeGreetingUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="h-11 px-3 rounded-xl text-xs font-semibold text-emerald-900 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 flex items-center justify-center gap-1.5 transition-colors"
          title="Open WhatsApp with pre-rendered personalized greeting"
        >
          <MessageSquare className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
          <span className="truncate">1-Click WhatsApp</span>
        </motion.a>

        {/* Attach Graphic Flyer */}
        <motion.button
          {...tactileTapProps}
          type="button"
          onClick={() => onOpenAttachModal(celebrant)}
          className="h-11 px-3 rounded-xl text-xs font-semibold text-indigo-900 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 flex items-center justify-center gap-1.5 transition-colors"
          title="Attach or view flyer asset URL"
        >
          <ImageIcon className="w-3.5 h-3.5 text-indigo-700 shrink-0" />
          <span className="truncate">Attach Flyer</span>
        </motion.button>
      </div>
    </div>
  );
}
