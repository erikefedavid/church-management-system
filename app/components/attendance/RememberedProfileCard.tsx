'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { Check, User, ArrowRight, UserCheck } from 'lucide-react';
import { surfaceEntranceVariants, tactileTapProps } from '@/lib/motion';

export interface SavedMemberProfile {
  id: string;
  firstName: string;
  lastName?: string;
  phoneLast4?: string;
  category?: string;
  subCategory?: string;
}

interface RememberedProfileCardProps {
  member: SavedMemberProfile;
  isCheckingIn: boolean;
  onCheckIn: (member: SavedMemberProfile) => void;
  onSwitchAccount: () => void;
}

export default function RememberedProfileCard({
  member,
  isCheckingIn,
  onCheckIn,
  onSwitchAccount,
}: RememberedProfileCardProps) {
  const initials = `${member.firstName?.[0] || 'W'}${member.lastName?.[0] || ''}`.toUpperCase();

  return (
    <motion.div
      variants={surfaceEntranceVariants}
      initial="initial"
      animate="animate"
      exit="exit"
      className="bg-white border border-slate-200/90 rounded-3xl p-6 shadow-sm space-y-5"
    >
      {/* Profile Header */}
      <div className="flex items-center gap-4">
        <div className="w-14 h-14 rounded-2xl bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-900 font-extrabold text-lg shrink-0">
          {initials}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
              Remembered Member
            </span>
            <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-950">
              {member.category || 'YOUTH'}
            </span>
          </div>
          <h2 className="text-lg font-extrabold text-slate-950 truncate">
            {member.firstName} {member.lastName || ''}
          </h2>
          {member.phoneLast4 && (
            <p className="text-xs font-mono text-slate-700">
              Phone: ••• ••• {member.phoneLast4}
            </p>
          )}
        </div>
      </div>

      {/* Primary 1-Tap CTA */}
      <motion.button
        type="button"
        onClick={() => onCheckIn(member)}
        disabled={isCheckingIn}
        className="w-full min-h-[56px] rounded-2xl bg-blue-700 hover:bg-blue-800 text-white font-bold text-base shadow-md shadow-blue-700/20 flex items-center justify-center gap-2 disabled:opacity-60 transition-[background-color,transform] cursor-pointer"
        {...tactileTapProps}
      >
        {isCheckingIn ? (
          <span className="inline-flex items-center gap-2 text-white">
            <span className="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            <span>Marking Attendance...</span>
          </span>
        ) : (
          <>
            <UserCheck className="w-5 h-5 text-white" />
            <span>1-Tap Check-In as {member.firstName}</span>
            <ArrowRight className="w-4 h-4 text-white/80" />
          </>
        )}
      </motion.button>

      {/* Switch Account Secondary Action */}
      <motion.button
        type="button"
        onClick={onSwitchAccount}
        disabled={isCheckingIn}
        className="w-full min-h-[44px] flex items-center justify-center text-xs font-semibold text-slate-700 hover:text-slate-950 hover:bg-slate-50 rounded-xl transition-colors cursor-pointer"
        {...tactileTapProps}
      >
        Not you? Check in with phone number or QR code
      </motion.button>
    </motion.div>
  );
}
