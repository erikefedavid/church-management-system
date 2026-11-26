'use client';

import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { UserPlus, ArrowLeft, Heart, CheckCircle2 } from 'lucide-react';
import { surfaceEntranceVariants, tactileTapProps } from '@/lib/motion';
import { PersonCategory } from '@prisma/client';

interface FirstTimerFormProps {
  initialPhoneDigits: string;
  isSubmitting: boolean;
  onSubmit: (formData: {
    firstName: string;
    lastName: string;
    phone: string;
    category: PersonCategory;
  }) => void;
  onBack: () => void;
}

export default function FirstTimerForm({
  isSubmitting,
  onSubmit,
  onBack,
}: FirstTimerFormProps) {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!firstName.trim()) {
      setError('Please enter your first name.');
      return;
    }

    const cleanPhone = phone.replace(/\D/g, '');
    if (cleanPhone.length < 10) {
      setError('Please enter a valid phone number (at least 10 digits).');
      return;
    }

    onSubmit({
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      phone: cleanPhone,
      category: PersonCategory.YOUTH,
    });
  };

  return (
    <motion.div
      variants={surfaceEntranceVariants}
      initial="initial"
      animate="animate"
      exit="exit"
      className="bg-white border border-slate-200/90 rounded-3xl p-5 shadow-sm space-y-4"
    >
      <div className="flex items-start gap-3 border-b border-slate-100 pb-3">
        <div className="w-10 h-10 rounded-2xl bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-700 shrink-0">
          <Heart className="w-5 h-5 text-amber-600" />
        </div>
        <div>
          <h2 className="text-base font-extrabold text-slate-950">
            Welcome to RCCG Jesus Covenant!
          </h2>
          <p className="text-xs text-slate-700 font-medium">
            We couldn&apos;t find an existing record. Please fill this quick form to register and mark your attendance.
          </p>
        </div>
      </div>

      {error && (
        <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs font-semibold text-rose-950">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-3.5">
        <div className="grid grid-cols-2 gap-2.5">
          <div>
            <label className="block text-xs font-bold text-slate-900 mb-1">
              First Name *
            </label>
            <input
              type="text"
              required
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              placeholder="e.g. Samuel"
              className="w-full min-h-[44px] px-3 rounded-xl border border-slate-300 bg-slate-50 text-slate-950 text-xs font-medium focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-blue-600"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-900 mb-1">
              Last Name
            </label>
            <input
              type="text"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              placeholder="e.g. Adeleke"
              className="w-full min-h-[44px] px-3 rounded-xl border border-slate-300 bg-slate-50 text-slate-950 text-xs font-medium focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-blue-600"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-900 mb-1">
            Phone Number *
          </label>
          <input
            type="tel"
            required
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="e.g. 08012345678"
            className="w-full min-h-[44px] px-3 rounded-xl border border-slate-300 bg-slate-50 text-slate-950 text-xs font-mono font-medium focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-blue-600"
          />
        </div>

        {/* Youth-only Congregation Badge */}
        <div className="flex items-center justify-between px-3 py-2.5 rounded-xl bg-blue-50 border border-blue-200 text-xs">
          <span className="font-bold text-slate-900">Fellowship</span>
          <span className="font-extrabold text-blue-950">Youth / Young Adult</span>
        </div>

        {/* Submit Button */}
        <motion.button
          type="submit"
          disabled={isSubmitting}
          className="w-full min-h-[50px] rounded-2xl bg-blue-700 hover:bg-blue-800 text-white font-bold text-sm shadow-md shadow-blue-700/20 flex items-center justify-center gap-2 disabled:opacity-60 transition-[background-color,transform] cursor-pointer"
          {...tactileTapProps}
        >
          {isSubmitting ? (
            <span className="inline-flex items-center gap-2">
              <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              <span>Registering & Marking Attendance...</span>
            </span>
          ) : (
            <>
              <UserPlus className="w-4 h-4 text-white" />
              <span>Register & Check-In</span>
            </>
          )}
        </motion.button>
      </form>

      <motion.button
        type="button"
        onClick={onBack}
        disabled={isSubmitting}
        className="w-full min-h-[44px] flex items-center justify-center gap-2 text-xs font-semibold text-slate-700 hover:text-slate-950 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
        {...tactileTapProps}
      >
        <ArrowLeft className="w-4 h-4" />
        <span>Back to 4-Digit Lookup</span>
      </motion.button>
    </motion.div>
  );
}
