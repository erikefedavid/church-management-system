'use client';

import React from 'react';
import Image from 'next/image';
import { MapPin, RefreshCw, ShieldCheck, AlertCircle } from 'lucide-react';
import { motion } from 'framer-motion';
import { tactileTapProps } from '@/lib/motion';

interface AttendanceHeaderProps {
  churchName?: string;
  isLiveNow?: boolean;
  activeServiceName?: string;
  currentTimeString?: string;
  geoAllowed: boolean | null;
  geoChecking: boolean;
  distanceMeters: number | null;
  onRefreshLocation: () => void;
}

const AttendanceHeader = React.memo(function AttendanceHeader({
  churchName = 'RCCG Jesus Covenant Zone',
  isLiveNow = false,
  activeServiceName,
  currentTimeString,
  geoAllowed,
  geoChecking,
  distanceMeters,
  onRefreshLocation,
}: AttendanceHeaderProps) {
  return (
    <header className="w-full bg-white border-b border-slate-200/90 shadow-2xs">
      <div className="max-w-md mx-auto px-4 py-3 flex items-center justify-between gap-3">
        {/* Brand Lockup */}
        <div className="flex items-center gap-3">
          <div className="relative w-11 h-11 shrink-0">
            <Image
              src="/rccg-logo.png"
              alt="The Redeemed Christian Church of God Official Seal"
              fill
              className="object-contain"
              priority
            />
          </div>
          <div className="flex flex-col">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-700">
              The Redeemed Christian Church of God
            </span>
            <h1 className="text-sm font-extrabold text-slate-950 leading-tight">
              {churchName}
            </h1>
            <span className="text-[11px] font-semibold text-blue-900">
              Youth Portal
            </span>
          </div>
        </div>

        {/* GPS Telemetry Pill & Refresh Action */}
        <div className="flex items-center gap-1.5 shrink-0">
          <div
            className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-xs font-bold border transition-colors ${
              geoChecking
                ? 'bg-blue-50 border-blue-200 text-blue-950'
                : geoAllowed === true
                ? 'bg-emerald-50 border-emerald-200 text-emerald-950'
                : geoAllowed === false
                ? 'bg-amber-50 border-amber-200 text-amber-950'
                : 'bg-slate-100 border-slate-200 text-slate-800'
            }`}
          >
            {geoChecking ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 animate-spin text-blue-700 shrink-0" />
                <span className="text-[11px]">GPS...</span>
              </>
            ) : geoAllowed === true ? (
              <>
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
                <span className="text-[11px]">
                  {distanceMeters !== null ? `${distanceMeters}m` : 'Verified'}
                </span>
              </>
            ) : geoAllowed === false ? (
              <>
                <AlertCircle className="w-3.5 h-3.5 text-amber-700 shrink-0" />
                <span className="text-[11px]">
                  {distanceMeters !== null ? `${distanceMeters}m` : 'Outside'}
                </span>
              </>
            ) : (
              <>
                <MapPin className="w-3.5 h-3.5 text-slate-700 shrink-0" />
                <span className="text-[11px]">Pending</span>
              </>
            )}
          </div>

          {/* Accessible 44px GPS Refresh Button */}
          <motion.button
            type="button"
            onClick={onRefreshLocation}
            disabled={geoChecking}
            aria-label="Refresh GPS location"
            className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 hover:text-slate-950 transition-colors disabled:opacity-50 cursor-pointer"
            {...tactileTapProps}
          >
            <RefreshCw
              className={`w-4 h-4 ${geoChecking ? 'animate-spin text-blue-700' : 'text-slate-700'}`}
            />
          </motion.button>
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
            <span className="font-bold text-slate-900">
              {activeServiceName || 'No Service in Session'}
            </span>
            {isLiveNow && (
              <span className="text-[10px] font-extrabold px-1.5 py-0.5 rounded-md bg-emerald-100 text-emerald-950 uppercase tracking-wider">
                Live
              </span>
            )}
          </div>
          {currentTimeString && (
            <span className="text-slate-700 font-mono text-[11px] font-medium">
              WAT {currentTimeString}
            </span>
          )}
        </div>
      </div>
    </header>
  );
});

export default AttendanceHeader;
