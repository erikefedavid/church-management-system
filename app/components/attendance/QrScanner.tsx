'use client';

import React, { useEffect, useState, useRef } from 'react';
import { motion } from 'framer-motion';
import { Camera, CameraOff, AlertCircle, ArrowRight, RefreshCw, KeyRound } from 'lucide-react';
import { surfaceEntranceVariants, tactileTapProps } from '@/lib/motion';

interface QrScannerProps {
  onScanSuccess: (decodedText: string) => void;
  onFallbackToPhone: () => void;
}

export default function QrScanner({ onScanSuccess, onFallbackToPhone }: QrScannerProps) {
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [isInitializing, setIsInitializing] = useState(true);
  const [manualCode, setManualCode] = useState('');
  const scannerRef = useRef<any>(null);
  const hasScannedRef = useRef(false);

  useEffect(() => {
    let html5QrCode: any = null;
    let isSubscribed = true;

    async function initScanner() {
      try {
        setIsInitializing(true);
        setCameraError(null);

        // Dynamically import html5-qrcode on client
        const { Html5Qrcode } = await import('html5-qrcode');

        if (!isSubscribed) return;

        const element = document.getElementById('rccg-qr-reader');
        if (!element) return;

        html5QrCode = new Html5Qrcode('rccg-qr-reader');
        scannerRef.current = html5QrCode;

        const config = {
          fps: 10,
          qrbox: { width: 220, height: 220 },
          aspectRatio: 1.0,
        };

        await html5QrCode.start(
          { facingMode: 'environment' },
          config,
          (decodedText: string) => {
            if (!hasScannedRef.current) {
              hasScannedRef.current = true;
              onScanSuccess(decodedText.trim());
            }
          },
          () => {
            // Frame scan failure (expected between QR detections)
          }
        );

        if (isSubscribed) {
          setIsInitializing(false);
        }
      } catch (err: any) {
        if (!isSubscribed) return;
        setIsInitializing(false);
        const errMsg = err?.message || '';
        if (
          errMsg.includes('NotAllowedError') ||
          errMsg.includes('Permission') ||
          errMsg.includes('denied')
        ) {
          setCameraError(
            'Camera permission is needed to scan your QR code. Please enable camera access in your browser or enter your code below.'
          );
        } else if (errMsg.includes('NotFoundError') || errMsg.includes('DevicesNotFoundError')) {
          setCameraError('No camera found on this device. Please use phone lookup instead.');
        } else {
          setCameraError(
            'Camera is currently unavailable or requires HTTPS. Use manual entry or 4-digit phone lookup.'
          );
        }
      }
    }

    initScanner();

    return () => {
      isSubscribed = false;
      if (scannerRef.current) {
        try {
          scannerRef.current.stop().catch(() => {});
        } catch {
          // Ignore cleanup errors
        }
      }
    };
  }, [onScanSuccess]);

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = manualCode.trim();
    if (clean) {
      onScanSuccess(clean);
    }
  };

  return (
    <motion.div
      variants={surfaceEntranceVariants}
      initial="initial"
      animate="animate"
      exit="exit"
      className="bg-white border border-slate-200/90 rounded-3xl p-5 shadow-sm space-y-4"
    >
      <div className="text-center space-y-1">
        <h2 className="text-base font-extrabold text-slate-950">
          Point Camera at Member QR Code
        </h2>
        <p className="text-xs text-slate-700 font-medium">
          Instant check-in via your personal QR attendance badge
        </p>
      </div>

      {/* Camera Viewfinder Container */}
      <div className="relative w-full aspect-square max-w-[280px] mx-auto rounded-3xl overflow-hidden bg-slate-950 border-2 border-slate-300 shadow-inner flex items-center justify-center">
        {/* DOM target for html5-qrcode */}
        <div id="rccg-qr-reader" className="w-full h-full" />

        {/* Viewfinder Overlays & Corner Brackets */}
        {!cameraError && (
          <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
            <div className="w-48 h-48 border-2 border-dashed border-white/60 rounded-2xl relative">
              <span className="absolute -top-1 -left-1 w-5 h-5 border-t-4 border-l-4 border-blue-500 rounded-tl" />
              <span className="absolute -top-1 -right-1 w-5 h-5 border-t-4 border-r-4 border-blue-500 rounded-tr" />
              <span className="absolute -bottom-1 -left-1 w-5 h-5 border-b-4 border-l-4 border-blue-500 rounded-bl" />
              <span className="absolute -bottom-1 -right-1 w-5 h-5 border-b-4 border-r-4 border-blue-500 rounded-br" />
            </div>
          </div>
        )}

        {/* Initializing Spinner */}
        {isInitializing && !cameraError && (
          <div className="absolute inset-0 bg-slate-950/80 flex flex-col items-center justify-center gap-2 text-white">
            <RefreshCw className="w-6 h-6 animate-spin text-blue-400" />
            <span className="text-xs font-semibold">Starting camera...</span>
          </div>
        )}

        {/* Camera Permission / Error Fallback */}
        {cameraError && (
          <div className="absolute inset-0 bg-slate-900 p-4 flex flex-col items-center justify-center text-center text-white space-y-3">
            <CameraOff className="w-8 h-8 text-amber-400" />
            <p className="text-xs text-slate-200 font-medium leading-relaxed">
              {cameraError}
            </p>
            <motion.button
              type="button"
              onClick={onFallbackToPhone}
              className="min-h-[44px] px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl flex items-center gap-2 transition-colors cursor-pointer"
              {...tactileTapProps}
            >
              <span>Switch to 4-Digit Lookup</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </motion.button>
          </div>
        )}
      </div>

      {/* Manual Code Fallback Form */}
      <form onSubmit={handleManualSubmit} className="space-y-2 pt-2 border-t border-slate-100">
        <label
          htmlFor="manual-qr-code"
          className="block text-xs font-bold text-slate-900 text-left"
        >
          Or enter Member ID / Code manually:
        </label>
        <div className="flex gap-2">
          <input
            id="manual-qr-code"
            type="text"
            value={manualCode}
            onChange={(e) => setManualCode(e.target.value)}
            placeholder="e.g. member id or phone number"
            className="flex-1 min-h-[44px] px-3.5 rounded-xl border border-slate-300 bg-slate-50 text-slate-950 text-xs font-mono focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-blue-600"
          />
          <motion.button
            type="submit"
            disabled={!manualCode.trim()}
            className="min-h-[44px] px-4 rounded-xl bg-blue-700 hover:bg-blue-800 disabled:opacity-50 text-white font-bold text-xs flex items-center gap-1.5 transition-colors cursor-pointer shrink-0"
            {...tactileTapProps}
          >
            <KeyRound className="w-3.5 h-3.5" />
            <span>Submit</span>
          </motion.button>
        </div>
      </form>
    </motion.div>
  );
}
