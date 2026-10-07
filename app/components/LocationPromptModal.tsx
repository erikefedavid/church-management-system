'use client';

import React, { useState } from 'react';
import { MapPin, ShieldCheck, AlertCircle, RefreshCw, X } from 'lucide-react';

interface LocationPromptModalProps {
  isOpen: boolean;
  onClose: () => void;
  onRequestLocation: () => Promise<boolean>;
  geoChecking: boolean;
  distanceMeters: number | null;
  geoAllowed: boolean | null;
}

export default function LocationPromptModal({
  isOpen,
  onClose,
  onRequestLocation,
  geoChecking,
  distanceMeters,
  geoAllowed,
}: LocationPromptModalProps) {
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!isOpen) return null;

  async function handleVerifyClick() {
    setErrorMessage(null);
    try {
      const allowed = await onRequestLocation();
      if (!allowed) {
        setErrorMessage('Location could not be verified within the sanctuary.');
      } else {
        // Automatically close after a moment of showing success
        setTimeout(() => {
          onClose();
        }, 800);
      }
    } catch (err: any) {
      setErrorMessage(err?.message || 'Permission was denied or GPS timed out.');
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white border border-slate-200/90 rounded-3xl p-6 shadow-xl max-w-sm w-full space-y-5 text-center relative">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-100 transition-colors"
          aria-label="Close"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Dynamic Icon */}
        <div className="mx-auto w-16 h-16 rounded-3xl flex items-center justify-center border transition-all duration-300 bg-blue-50 border-blue-100 text-blue-600">
          {geoAllowed ? (
            <ShieldCheck className="w-8 h-8 text-emerald-600" />
          ) : (
            <MapPin className={`w-8 h-8 ${geoChecking ? 'animate-bounce text-blue-600' : 'text-blue-600'}`} />
          )}
        </div>

        {/* Copy */}
        <div className="space-y-1.5">
          <h3 className="text-lg font-bold text-slate-900">
            {geoAllowed ? 'Sanctuary Verified' : 'Confirm Church Premises'}
          </h3>
          <p className="text-xs text-slate-600 leading-relaxed">
            {geoAllowed
              ? `You are inside the church premises (${distanceMeters !== null ? `${distanceMeters}m` : 'verified'}).`
              : 'To mark your attendance, please confirm your device is within the RCCG sanctuary.'}
          </p>
        </div>

        {/* Error / Distance Warning Notice */}
        {errorMessage && !geoAllowed && (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-3 text-left flex items-start gap-2.5">
            <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <div className="space-y-0.5 text-xs text-amber-900">
              <p className="font-semibold">Unable to verify inside sanctuary</p>
              <p className="text-[11px] text-amber-800 leading-snug">
                {distanceMeters !== null && distanceMeters > 200
                  ? `Your device is detected ~${distanceMeters}m away (limit is 150m).`
                  : errorMessage}
              </p>
            </div>
          </div>
        )}

        {/* Primary Action Button */}
        <div className="space-y-2">
          {!geoAllowed ? (
            <button
              onClick={handleVerifyClick}
              disabled={geoChecking}
              className="w-full h-12 bg-blue-600 hover:bg-blue-700 active:scale-[0.99] text-white font-bold rounded-2xl transition-all shadow-md shadow-blue-600/20 flex items-center justify-center gap-2 disabled:opacity-60 text-sm cursor-pointer"
            >
              {geoChecking ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Checking GPS Accuracy...</span>
                </>
              ) : (
                <>
                  <MapPin className="w-4 h-4" />
                  <span>Verify Location & Continue</span>
                </>
              )}
            </button>
          ) : (
            <button
              onClick={onClose}
              className="w-full h-12 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-2xl transition-all shadow-md shadow-emerald-600/20 flex items-center justify-center gap-2 text-sm cursor-pointer"
            >
              <ShieldCheck className="w-4 h-4" />
              <span>Location Verified — Continue</span>
            </button>
          )}

          <button
            onClick={onClose}
            className="w-full py-2 text-xs font-semibold text-slate-500 hover:text-slate-800 transition-colors cursor-pointer"
          >
            Close
          </button>
        </div>

        <p className="text-[10px] text-slate-400">
          Your location is checked once to confirm you are within church grounds (150m radius).
        </p>
      </div>
    </div>
  );
}
