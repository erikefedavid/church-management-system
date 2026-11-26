'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { UserCheck, ArrowLeft, CheckCircle2 } from 'lucide-react';
import { surfaceEntranceVariants, tactileTapProps } from '@/lib/motion';

export interface CollisionMember {
  id: string;
  firstName: string;
  lastName?: string | null;
  phone?: string | null;
  phoneLast4?: string | null;
  category?: string;
  subCategory?: string | null;
  status?: string;
}

interface CollisionChoiceListProps {
  digits: string;
  members: CollisionMember[];
  isSubmitting: boolean;
  onSelectMember: (member: CollisionMember) => void;
  onBack: () => void;
}

export default function CollisionChoiceList({
  digits,
  members,
  isSubmitting,
  onSelectMember,
  onBack,
}: CollisionChoiceListProps) {
  return (
    <motion.div
      variants={surfaceEntranceVariants}
      initial="initial"
      animate="animate"
      exit="exit"
      className="bg-white border border-slate-200/90 rounded-3xl p-5 shadow-sm space-y-4"
    >
      <div className="flex items-center justify-between border-b border-slate-100 pb-3">
        <div>
          <h2 className="text-base font-extrabold text-slate-950">
            Select Your Name
          </h2>
          <p className="text-xs text-slate-700 font-medium">
            Multiple members found ending in &ldquo;{digits}&rdquo;
          </p>
        </div>
        <span className="text-xs font-bold px-2 py-1 bg-blue-50 border border-blue-200 text-blue-950 rounded-full">
          {members.length} matches
        </span>
      </div>

      <div className="space-y-2.5 max-h-72 overflow-y-auto pr-1">
        {members.map((member) => {
          const initials = `${member.firstName?.[0] || 'M'}${member.lastName?.[0] || ''}`.toUpperCase();
          const category = member.subCategory || member.category || 'MEMBER';

          return (
            <motion.button
              key={member.id}
              type="button"
              disabled={isSubmitting}
              onClick={() => onSelectMember(member)}
              className="w-full min-h-[56px] p-3 rounded-2xl bg-slate-50 hover:bg-blue-50/70 border border-slate-200/80 hover:border-blue-300 text-left flex items-center justify-between gap-3 transition-[background-color,border-color] cursor-pointer"
              {...tactileTapProps}
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-xl bg-white border border-slate-200 flex items-center justify-center text-blue-900 font-extrabold text-xs shrink-0">
                  {initials}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="font-extrabold text-sm text-slate-950 truncate">
                      {member.firstName} {member.lastName || ''}
                    </span>
                    <span className="text-[10px] font-extrabold px-1.5 py-0.5 rounded-md bg-slate-200 text-slate-800">
                      {category}
                    </span>
                  </div>
                  {member.phone && (
                    <span className="text-xs font-mono text-slate-700">
                      •••• ••• {member.phone.slice(-4)}
                    </span>
                  )}
                </div>
              </div>

              <div className="shrink-0 text-blue-700">
                <UserCheck className="w-5 h-5" />
              </div>
            </motion.button>
          );
        })}
      </div>

      <motion.button
        type="button"
        onClick={onBack}
        disabled={isSubmitting}
        className="w-full min-h-[44px] flex items-center justify-center gap-2 text-xs font-semibold text-slate-700 hover:text-slate-950 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
        {...tactileTapProps}
      >
        <ArrowLeft className="w-4 h-4" />
        <span>Try a different 4-digit code</span>
      </motion.button>
    </motion.div>
  );
}
