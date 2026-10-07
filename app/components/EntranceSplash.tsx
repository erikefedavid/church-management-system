'use client';

import React, { useEffect, useState } from 'react';
import Image from 'next/image';

interface EntranceSplashProps {
  onComplete: () => void;
  churchName?: string;
  minDurationMs?: number;
  isReady?: boolean;
}

export default function EntranceSplash({
  onComplete,
  churchName = 'RCCG Jesus Covenant Zone',
  minDurationMs = 900,
  isReady = true,
}: EntranceSplashProps) {
  const [fadingOut, setFadingOut] = useState(false);

  useEffect(() => {
    let exitTimer: NodeJS.Timeout | null = null;
    if (isReady) {
      exitTimer = setTimeout(() => {
        setFadingOut(true);
        setTimeout(() => {
          onComplete();
        }, 350);
      }, minDurationMs);
    }

    return () => {
      if (exitTimer) clearTimeout(exitTimer);
    };
  }, [isReady, minDurationMs, onComplete]);

  return (
    <div
      className={`fixed inset-0 z-50 flex flex-col items-center justify-between p-8 bg-white text-slate-900 transition-opacity duration-300 ease-out select-none ${
        fadingOut ? 'opacity-0 pointer-events-none' : 'opacity-100'
      }`}
      aria-label="Welcome screen"
    >
      {/* Top subtle spacing */}
      <div className="pt-8"></div>

      {/* Center Clean Church Seal & Title */}
      <div className="flex flex-col items-center justify-center text-center space-y-5 animate-in fade-in zoom-in-95 duration-500">
        <div className="relative w-24 h-24 sm:w-28 sm:h-28 rounded-3xl bg-slate-50 p-3 shadow-md border border-slate-200/80 flex items-center justify-center">
          <div className="relative w-full h-full">
            <Image
              src="/rccg-logo.png"
              alt="RCCG Logo"
              fill
              className="object-contain"
              priority
            />
          </div>
        </div>

        <div className="space-y-1">
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">
            {churchName}
          </h1>
          <p className="text-xs text-blue-700 font-semibold tracking-wide">
            Attendance Verification Portal
          </p>
        </div>
      </div>

      {/* Bottom Minimal Smooth Loader */}
      <div className="pb-8 flex flex-col items-center space-y-2">
        <div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
        <span className="text-[11px] font-medium text-slate-400">
          Verifying sanctuary...
        </span>
      </div>
    </div>
  );
}
