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
      border: 'border-emerald-200',
      text: 'text-emerald-900',
      desc: 'text-emerald-700',
      icon: <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />,
      titleDefault: 'Success',
    },
    error: {
      bg: 'bg-rose-50',
      border: 'border-rose-200',
      text: 'text-rose-900',
      desc: 'text-rose-700',
      icon: <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" />,
      titleDefault: 'Action Required',
    },
    info: {
      bg: 'bg-blue-50',
      border: 'border-blue-200',
      text: 'text-blue-900',
      desc: 'text-blue-700',
      icon: <Info className="w-5 h-5 text-blue-600 shrink-0" />,
      titleDefault: 'Information',
    },
  }[type];

  return (
    <div className="fixed top-5 right-5 z-50 max-w-sm w-full animate-in fade-in slide-in-from-top-4 duration-200 transition-all">
      <div
        className={`${styleConfig.bg} ${styleConfig.border} border shadow-lg rounded-2xl p-4 flex items-start gap-3 backdrop-blur-md`}
      >
        {styleConfig.icon}
        <div className="flex-1 text-left">
          <p className={`text-xs font-bold ${styleConfig.text}`}>
            {title || styleConfig.titleDefault}
          </p>
          <p className={`text-xs ${styleConfig.desc} mt-0.5 font-medium leading-relaxed`}>
            {message}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="text-slate-400 hover:text-slate-600 transition-colors p-1 rounded-lg hover:bg-black/5 cursor-pointer"
          aria-label="Close notification"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
