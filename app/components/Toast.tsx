'use client';

import React, { useEffect } from 'react';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';

export interface ToastProps {
  type: 'success' | 'error' | 'info';
  message: string;
  title?: string;
  onClose: () => void;
  duration?: number;
}

export default function Toast({ type, message, title, onClose, duration = 3500 }: ToastProps) {
  useEffect(() => {
    if (duration > 0) {
      const timer = setTimeout(() => {
        onClose();
      }, duration);
      return () => clearTimeout(timer);
    }
  }, [duration, onClose]);

  const styleConfig = {
    success: {
      bg: 'bg-emerald-50',
      border: 'border-emerald-300',
      text: 'text-emerald-950',
      desc: 'text-emerald-900',
      icon: <CheckCircle2 className="w-5 h-5 text-emerald-700 shrink-0 mt-0.5" />,
      titleDefault: 'Success',
    },
    error: {
      bg: 'bg-rose-50',
      border: 'border-rose-300',
      text: 'text-rose-950',
      desc: 'text-rose-900',
      icon: <AlertCircle className="w-5 h-5 text-rose-700 shrink-0 mt-0.5" />,
      titleDefault: 'Action Required',
    },
    info: {
      bg: 'bg-blue-50',
      border: 'border-blue-300',
      text: 'text-blue-950',
      desc: 'text-blue-900',
      icon: <Info className="w-5 h-5 text-blue-700 shrink-0 mt-0.5" />,
      titleDefault: 'Information',
    },
  }[type];

  return (
    <div className="fixed top-4 left-4 right-4 sm:top-5 sm:left-auto sm:right-5 sm:w-full sm:max-w-sm z-[99999] animate-in fade-in slide-in-from-top-4 duration-200 transition-all">
      <div
        className={`${styleConfig.bg} ${styleConfig.border} border shadow-lg rounded-2xl p-3 sm:p-4 flex items-start gap-2.5 sm:gap-3 backdrop-blur-md`}
      >
        {styleConfig.icon}
        <div className="flex-1 min-w-0 text-left">
          <p className={`text-xs font-bold ${styleConfig.text}`}>
            {title || styleConfig.titleDefault}
          </p>
          <p className={`text-xs ${styleConfig.desc} mt-0.5 font-medium leading-relaxed break-words`}>
            {message}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="min-w-[44px] min-h-[44px] flex items-center justify-center -mr-1.5 -mt-1.5 sm:-mr-2 sm:-mt-2 p-2 rounded-lg text-slate-700 hover:text-slate-950 hover:bg-black/5 transition-colors cursor-pointer shrink-0"
          aria-label="Close notification"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
