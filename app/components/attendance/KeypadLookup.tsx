'use client';

import React, { useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Search, ArrowRight } from 'lucide-react';
import { surfaceEntranceVariants, tactileTapProps } from '@/lib/motion';

interface KeypadLookupProps {
  digits: string;
  onDigitsChange: (digits: string) => void;
  onSearch: (digits: string) => void;
  isLoading: boolean;
}

const KeypadLookup = React.memo(function KeypadLookup({
  digits,
  onDigitsChange,
  onSearch,
  isLoading,
}: KeypadLookupProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const lastAutoSearchedRef = useRef<string>('');

  // Auto-focus input on mount so mobile numeric keypad pops up immediately
  useEffect(() => {
    const timer = setTimeout(() => {
      inputRef.current?.focus();
    }, 150);
    return () => clearTimeout(timer);
  }, []);

  // Auto-search once when 4th digit entered (reset guard when < 4 digits)
  useEffect(() => {
    if (digits.length < 4) {
      lastAutoSearchedRef.current = '';
      return;
    }
    if (digits.length === 4 && !isLoading && lastAutoSearchedRef.current !== digits) {
      lastAutoSearchedRef.current = digits;
      onSearch(digits);
    }
  }, [digits, isLoading, onSearch]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const clean = e.target.value.replace(/\D/g, '').slice(0, 4);
    onDigitsChange(clean);
  };

  const handleClear = () => {
    onDigitsChange('');
    inputRef.current?.focus();
  };

  return (
    <motion.div
      variants={surfaceEntranceVariants}
      initial="initial"
      animate="animate"
      exit="exit"
      className="bg-white border border-slate-200/90 rounded-3xl p-6 shadow-sm space-y-6"
    >
      {/* Title & Instructions */}
      <div className="text-center space-y-1.5">
        <h2 className="text-lg font-black text-slate-950 tracking-tight">
          Enter Last 4 Digits of Phone
        </h2>
        <p className="text-xs text-slate-600 font-medium">
          Type your last 4 digits to locate your profile
        </p>
      </div>

      {/* Segmented Display & Hidden Native Phone Input */}
      <div
        onClick={() => inputRef.current?.focus()}
        className="relative flex flex-col items-center justify-center gap-4 cursor-text py-2"
      >
        {/* Real Native Phone Input (triggers the mobile numeric keyboard on iOS & Android) */}
        <input
          ref={inputRef}
          type="tel"
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={4}
          value={digits}
          onChange={handleInputChange}
          autoComplete="one-time-code"
          autoFocus
          className="absolute inset-0 opacity-0 cursor-text w-full h-full z-10"
          aria-label="Last 4 digits of phone number"
        />

        {/* 4 Large Visual Digit Boxes */}
        <div className="flex items-center justify-center gap-3 w-full max-w-[280px]">
          {[0, 1, 2, 3].map((index) => {
            const char = digits[index] || '';
            const isCurrent = digits.length === index;
            return (
              <div
                key={index}
                className={`flex-1 h-20 rounded-2xl border-2 flex items-center justify-center text-3xl font-mono font-black transition-all ${
                  char
                    ? 'border-blue-600 bg-blue-50/60 text-blue-950 shadow-xs'
                    : isCurrent
                    ? 'border-blue-500 bg-white ring-4 ring-blue-100 shadow-sm'
                    : 'border-slate-200 bg-slate-50/70 text-slate-300'
                }`}
              >
                {char || (isCurrent ? <span className="w-3 h-0.5 bg-blue-600 animate-pulse" /> : '•')}
              </div>
            );
          })}
        </div>

        {/* Active Typing Helper */}
        <div className="flex items-center gap-2 text-xs text-slate-500 font-medium">
          {digits.length > 0 ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleClear();
              }}
              className="text-slate-600 hover:text-slate-950 font-bold underline cursor-pointer"
            >
              Clear input
            </button>
          ) : (
            <span>Tap above to type using your phone&apos;s number pad</span>
          )}
        </div>
      </div>

      {/* Loading state indicator */}
      {isLoading && (
        <div className="flex items-center justify-center gap-2 py-1 text-xs font-bold text-blue-900">
          <span className="w-4 h-4 border-2 border-blue-900 border-t-transparent rounded-full animate-spin" />
          <span>Locating member record...</span>
        </div>
      )}

      {/* Search / Submit Action Button */}
      <motion.button
        type="button"
        onClick={() => {
          if (digits.length === 4) {
            onSearch(digits);
          } else {
            inputRef.current?.focus();
          }
        }}
        disabled={isLoading || digits.length === 0}
        className="w-full min-h-[52px] rounded-2xl bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-extrabold text-sm flex items-center justify-center gap-2 shadow-sm transition-all disabled:opacity-40 disabled:pointer-events-none cursor-pointer"
        {...tactileTapProps}
      >
        <Search className="w-4 h-4" />
        <span>{digits.length === 4 ? 'Confirm & Check In' : 'Enter 4 Digits to Check In'}</span>
        <ArrowRight className="w-4 h-4" />
      </motion.button>
    </motion.div>
  );
});

export default KeypadLookup;
