'use client';

import React from 'react';
import Image from 'next/image';

interface AttendanceHeaderProps {
  churchName?: string;
  isLiveNow?: boolean;
  activeServiceName?: string;
  sundayLabel?: string | null;
  currentTimeString?: string;
  geoAllowed?: boolean | null;
  geoChecking?: boolean;
  distanceMeters?: number | null;
  onRefreshLocation?: () => void;
}

const AttendanceHeader = React.memo(function AttendanceHeader({
  churchName = 'RCCG Jesus Covenant Zone',
  isLiveNow = false,
  activeServiceName,
  sundayLabel,
  currentTimeString,
}: AttendanceHeaderProps) {
  return (
    <header className="w-full bg-white border-b border-slate-200/90 shadow-2xs">
      <div className="max-w-md mx-auto px-4 py-3 flex items-center justify-between gap-3">
        {/* Brand Lockup */}
        <div className="flex items-center gap-3 min-w-0">
          <div className="relative w-11 h-11 shrink-0">
            <Image
              src="/rccg-logo.png"
              alt="The Redeemed Christian Church of God Official Seal"
              fill
              className="object-contain"
              priority
            />
          </div>
          <div className="flex flex-col min-w-0">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-700 truncate">
              The Redeemed Christian Church of God
            </span>
            <h1 className="text-sm font-extrabold text-slate-950 leading-tight truncate">
              {churchName}
            </h1>
            <span className="text-[11px] font-semibold text-blue-900">
              Youth Portal
            </span>
          </div>
        </div>
      </div>

      {/* Subheader: Active Service Status Bar */}
      <div className="bg-slate-50 border-t border-slate-100 px-4 py-2">
        <div className="max-w-md mx-auto flex items-center justify-between text-xs">
          <div className="flex items-center gap-2">
            <span
              className={`inline-block w-2 h-2 rounded-full ${
                isLiveNow ? 'bg-emerald-600 animate-pulse' : 'bg-slate-400'
              }`}
            />
            <div className="flex flex-col">
              <div className="flex items-center gap-2">
                <span className="font-bold text-slate-900">
                  {activeServiceName || 'No Service in Session'}
                </span>
                {isLiveNow && (
                  <span className="text-[10px] font-extrabold px-1.5 py-0.5 rounded-md bg-emerald-100 text-emerald-950 uppercase tracking-wider">
                    Live
                  </span>
                )}
              </div>
              {activeServiceName && sundayLabel && (
                <span className="text-[11px] font-medium text-slate-600">
                  {sundayLabel}
                </span>
              )}
            </div>
          </div>
          {currentTimeString && (
            <span className="text-slate-700 font-mono text-[11px] font-medium shrink-0">
              WAT {currentTimeString}
            </span>
          )}
        </div>
      </div>
    </header>
  );
});

export default AttendanceHeader;
