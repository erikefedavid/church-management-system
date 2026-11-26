'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Link as LinkIcon, Check, Image as ImageIcon } from 'lucide-react';
import { MOMENTUM_EASE, tactileTapProps } from '@/lib/motion';

interface AttachFlyerModalProps {
  isOpen: boolean;
  celebrantName: string;
  personId: string;
  currentFlyerUrl?: string | null;
  currentStatus?: string;
  onClose: () => void;
  onSubmit: (params: {
    personId: string;
    flyerUrl: string;
    status: 'SENT' | 'ACKNOWLEDGED' | 'FLYER_READY';
  }) => Promise<void>;
}

export default function AttachFlyerModal({
  isOpen,
  celebrantName,
  personId,
  currentFlyerUrl = '',
  currentStatus = 'FLYER_READY',
  onClose,
  onSubmit,
}: AttachFlyerModalProps) {
  const [flyerUrl, setFlyerUrl] = useState(currentFlyerUrl || '');
  const [status, setStatus] = useState<'SENT' | 'ACKNOWLEDGED' | 'FLYER_READY'>(
    (currentStatus as 'SENT' | 'ACKNOWLEDGED' | 'FLYER_READY') || 'FLYER_READY'
  );
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!flyerUrl.trim()) return;

    setSubmitting(true);
    try {
      await onSubmit({
        personId,
        flyerUrl: flyerUrl.trim(),
        status,
      });
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs"
          />

          {/* Modal Container */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{
              opacity: 1,
              scale: 1,
              transition: { duration: 0.24, ease: MOMENTUM_EASE },
            }}
            exit={{
              opacity: 0,
              scale: 0.97,
              transition: { duration: 0.16 },
            }}
            className="relative w-full max-w-md bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden z-10"
          >
            {/* Header */}
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-blue-50 text-blue-700 flex items-center justify-center">
                  <ImageIcon className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Attach Graphic Flyer</h3>
                  <p className="text-xs text-slate-700 font-medium">{celebrantName}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="w-8 h-8 flex items-center justify-center rounded-xl text-slate-600 hover:text-slate-700 hover:bg-slate-100 transition-colors"
                aria-label="Close dialog"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-800 mb-1.5">
                  Flyer Public Link (Cloud, Drive, Imgur, or CDN)
                </label>
                <div className="relative">
                  <LinkIcon className="w-4 h-4 text-slate-600 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="url"
                    required
                    value={flyerUrl}
                    onChange={(e) => setFlyerUrl(e.target.value)}
                    placeholder="https://drive.google.com/... or https://..."
                    className="w-full h-11 pl-9 pr-3 text-xs rounded-xl border border-slate-200 bg-slate-50/50 text-slate-900 placeholder:text-slate-600 focus:outline-hidden focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600 transition-all"
                  />
                </div>
                <p className="text-[11px] text-slate-700 font-medium mt-1">
                  Paste the high-resolution flyer asset link prepared by the media graphics team.
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-800 mb-1.5">
                  Flyer Production Status
                </label>
                <select
                  value={status}
                  onChange={(e) =>
                    setStatus(e.target.value as 'SENT' | 'ACKNOWLEDGED' | 'FLYER_READY')
                  }
                  className="w-full h-11 px-3 text-xs rounded-xl border border-slate-200 bg-slate-50/50 text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600 transition-all font-medium"
                >
                  <option value="FLYER_READY">FLYER_READY — Approved for Broadcast</option>
                  <option value="ACKNOWLEDGED">ACKNOWLEDGED — In Design Progress</option>
                  <option value="SENT">SENT — Alert Received by Media</option>
                </select>
              </div>

              {/* Actions */}
              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="h-11 px-4 rounded-xl text-xs font-semibold text-slate-800 hover:bg-slate-100 transition-colors"
                >
                  Cancel
                </button>
                <motion.button
                  {...tactileTapProps}
                  type="submit"
                  disabled={submitting || !flyerUrl.trim()}
                  className="h-11 px-4 inline-flex items-center justify-center gap-1.5 rounded-xl text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 shadow-2xs transition-colors"
                >
                  {submitting ? (
                    <span>Saving...</span>
                  ) : (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      <span>Save Flyer Link</span>
                    </>
                  )}
                </motion.button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
