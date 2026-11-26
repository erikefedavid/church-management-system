'use client';

import React from 'react';
import { motion } from 'framer-motion';
import {
  MapPinOff,
  RefreshCw,
  Clock,
  Radio,
  Lock,
  Calendar,
  AlertTriangle,
} from 'lucide-react';
import { surfaceEntranceVariants, tactileTapProps } from '@/lib/motion';

interface GeofenceGatewayAlertProps {
  activeService?: {
    id?: string;
    name: string;
    startTime?: string;
    endTime?: string;
    dayOfWeek?: string;
  } | null;
  nextUpcomingService?: {
    name?: string;
    startTime?: string;
    endTime?: string;
    dayOfWeek?: string;
    formattedSchedule?: string;
    service?: {
      name: string;
      startTime: string;
      endTime: string;
    };
  } | null;
  isLiveNow?: boolean;
  churchName?: string;
  distanceMeters: number | null;
  errorType?: 'PERMISSION_DENIED' | 'POSITION_UNAVAILABLE' | 'TIMEOUT' | 'OUTSIDE' | null;
  onRefresh: () => void;
  geoChecking: boolean;
}

export default function GeofenceGatewayAlert({
  activeService,
  nextUpcomingService,
  isLiveNow = false,
  churchName = 'RCCG Jesus Covenant Zone',
  distanceMeters,
  errorType = 'OUTSIDE',
  onRefresh,
  geoChecking,
}: GeofenceGatewayAlertProps) {
  // Resolve service display name & timing (NextUpcomingService has flat fields; support legacy nested .service too)
  const displayService = activeService || nextUpcomingService?.service || nextUpcomingService;
  const serviceName = displayService?.name || 'No Service in Session';
  const startTime = displayService?.startTime;
  const endTime = displayService?.endTime;

  const formattedDistance =
    distanceMeters !== null
      ? distanceMeters < 1000
        ? `${distanceMeters}m`
        : `${(distanceMeters / 1000).toFixed(1)}km`
      : null;

  return (
    <motion.div
      variants={surfaceEntranceVariants}
      initial="initial"
      animate="animate"
      exit="exit"
      className="space-y-4"
    >
      {/* 1. Active or Upcoming Service Display Card */}
      <div className="bg-white border border-slate-200/90 rounded-3xl p-5 shadow-xs space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {isLiveNow ? (
              <span className="inline-flex items-center gap-1.5 text-[11px] font-black uppercase tracking-wider text-emerald-800 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-full">
                <span className="w-2 h-2 rounded-full bg-emerald-600 animate-ping" />
                Live Service Ongoing
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-blue-900 bg-blue-50 border border-blue-200 px-2.5 py-1 rounded-full">
                <Calendar className="w-3 h-3 text-blue-700" />
                Service Scheduled
              </span>
            )}
          </div>

          <span className="text-[11px] font-semibold text-slate-700">
            Nigeria Time (WAT)
          </span>
        </div>

        <div className="space-y-1">
          <h2 className="text-xl font-black text-slate-950 tracking-tight">
            {serviceName}
          </h2>
          {startTime && endTime && (
            <p className="text-xs text-slate-700 font-semibold flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-slate-500" />
              <span>
                {startTime} – {endTime}
              </span>
            </p>
          )}
        </div>
      </div>

      {/* 2. Geofence Access Restriction Notice */}
      <div className="bg-amber-50/90 border border-amber-300 rounded-3xl p-5 shadow-xs space-y-4 text-center">
        <div className="mx-auto w-12 h-12 rounded-2xl bg-amber-100 border border-amber-200 flex items-center justify-center text-amber-800 shadow-2xs">
          <Lock className="w-6 h-6 text-amber-900" />
        </div>

        <div className="space-y-1.5">
          <h3 className="text-base font-black text-amber-950">
            {errorType === 'PERMISSION_DENIED'
              ? 'Location Permission Required'
              : formattedDistance
              ? `Outside Sanctuary (~${formattedDistance} away)`
              : 'Outside Church Premises'}
          </h3>

          <p className="text-xs text-amber-900 leading-relaxed font-medium max-w-sm mx-auto">
            {errorType === 'PERMISSION_DENIED'
              ? 'Browser location access is required to verify you are inside the church premises before marking attendance.'
              : `Self check-in is restricted to youth members physically present inside the sanctuary (150m boundary). Please arrive at ${churchName} to unlock your attendance.`}
          </p>
        </div>

        {/* Quick GPS Troubleshooting Help */}
        <div className="bg-white/90 rounded-2xl p-3 border border-amber-200 text-left text-xs space-y-1 text-slate-800">
          <p className="font-bold text-slate-950 flex items-center gap-1.5 text-[11px]">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-700" />
            Already inside the church building?
          </p>
          <ul className="list-disc list-inside space-y-0.5 text-[11px] text-slate-700">
            <li>Ensure device Location / GPS is turned ON with high accuracy.</li>
            <li>If near thick concrete walls, move closer to a window or door.</li>
            <li>Tap the refresh button below to re-verify your position.</li>
          </ul>
        </div>

        {/* Refresh GPS Action */}
        <motion.button
          type="button"
          onClick={onRefresh}
          disabled={geoChecking}
          className="w-full min-h-[48px] rounded-2xl bg-amber-900 hover:bg-amber-950 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-xs transition-colors cursor-pointer disabled:opacity-60"
          {...tactileTapProps}
        >
          <RefreshCw className={`w-4 h-4 ${geoChecking ? 'animate-spin' : ''}`} />
          <span>{geoChecking ? 'Verifying GPS Satellite Signal...' : 'Refresh Location & Unlock'}</span>
        </motion.button>
      </div>
    </motion.div>
  );
}
