'use client';

import React, { useState, useEffect } from 'react';
import {
  X,
  Clock,
  Calendar,
  Save,
  CheckCircle2,
  AlertCircle,
  Plus,
  Settings,
} from 'lucide-react';
import {
  getAllChurchServicesAction,
  updateServiceScheduleAction,
} from '../actions/admin';
import { formatTime12 } from '@/lib/service-resolver';

export interface ManageServicesModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccessToast: (msg: string) => void;
  onErrorToast: (msg: string) => void;
  onServicesUpdated?: () => void;
}

export default function ManageServicesModal({
  isOpen,
  onClose,
  onSuccessToast,
  onErrorToast,
  onServicesUpdated,
}: ManageServicesModalProps) {
  const [loading, setLoading] = useState(true);
  const [services, setServices] = useState<any[]>([]);
  const [savingId, setSavingId] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      loadServices();
    }
  }, [isOpen]);

  async function loadServices() {
    setLoading(true);
    const res = await getAllChurchServicesAction();
    if (res.success && res.services) {
      setServices(res.services);
    } else {
      onErrorToast(res.error || 'Failed to load services.');
    }
    setLoading(false);
  }

  function handleTimeChange(id: string, field: 'startTime' | 'endTime', value: string) {
    setServices((prev) =>
      prev.map((s) => (s.id === id ? { ...s, [field]: value } : s))
    );
  }

  function handleNameChange(id: string, value: string) {
    setServices((prev) =>
      prev.map((s) => (s.id === id ? { ...s, name: value } : s))
    );
  }

  async function handleSaveService(svc: any) {
    if (!svc.startTime || !svc.endTime) {
      onErrorToast('Please specify both start and end time.');
      return;
    }

    setSavingId(svc.id);
    const res = await updateServiceScheduleAction({
      id: svc.id,
      name: svc.name,
      startTime: svc.startTime,
      endTime: svc.endTime,
      hasSubClasses: svc.hasSubClasses,
    });
    setSavingId(null);

    if (res.success) {
      onSuccessToast(res.message || `Updated ${svc.name} schedule!`);
      if (onServicesUpdated) onServicesUpdated();
    } else {
      onErrorToast(res.error || 'Failed to update service.');
    }
  }

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="bg-white border border-slate-200 rounded-3xl max-w-xl w-full p-6 shadow-2xl space-y-5 animate-in zoom-in-95 duration-150 max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-start justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600 shrink-0">
              <Clock className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">Manage Service Times</h3>
              <p className="text-xs text-slate-500 font-medium">
                Adjust starting and ending hours for weekly church services
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 p-1.5 rounded-xl hover:bg-slate-100 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Services List */}
        <div className="flex-1 overflow-y-auto pr-1 space-y-3">
          {loading ? (
            <div className="text-center py-12 space-y-2">
              <div className="w-8 h-8 border-3 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
              <p className="text-xs text-slate-500 font-medium">Loading schedule...</p>
            </div>
          ) : services.length === 0 ? (
            <div className="text-center py-8 text-xs text-slate-500">
              No services found.
            </div>
          ) : (
            services.map((svc) => (
              <div
                key={svc.id}
                className="p-4 rounded-2xl border border-slate-200 hover:border-slate-300 bg-slate-50/50 transition-colors space-y-3"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-blue-100 text-blue-800 border border-blue-200 uppercase tracking-wide">
                      {svc.dayOfWeek}
                    </span>
                    <input
                      type="text"
                      value={svc.name}
                      onChange={(e) => handleNameChange(svc.id, e.target.value)}
                      className="text-sm font-bold text-slate-900 bg-transparent hover:bg-white focus:bg-white px-2 py-0.5 rounded-lg border border-transparent focus:border-blue-500 transition-all focus:outline-none"
                    />
                  </div>

                  {svc.hasSubClasses && (
                    <span className="text-[10px] font-semibold text-slate-500 bg-slate-200/60 px-2 py-0.5 rounded-md">
                      Adult & Youth Classes
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 items-end">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 mb-1">
                      Start Time {svc.startTime && <span className="text-blue-600 font-semibold font-sans">({formatTime12(svc.startTime)})</span>}
                    </label>
                    <input
                      type="time"
                      value={svc.startTime}
                      onChange={(e) => handleTimeChange(svc.id, 'startTime', e.target.value)}
                      className="w-full bg-white border border-slate-300 rounded-xl px-2.5 py-1.5 text-xs text-slate-900 font-mono font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 mb-1">
                      End Time {svc.endTime && <span className="text-blue-600 font-semibold font-sans">({formatTime12(svc.endTime)})</span>}
                    </label>
                    <input
                      type="time"
                      value={svc.endTime}
                      onChange={(e) => handleTimeChange(svc.id, 'endTime', e.target.value)}
                      className="w-full bg-white border border-slate-300 rounded-xl px-2.5 py-1.5 text-xs text-slate-900 font-mono font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
                    />
                  </div>

                  <div>
                    <button
                      type="button"
                      disabled={savingId === svc.id}
                      onClick={() => handleSaveService(svc)}
                      className="w-full py-2 px-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-xs transition-colors flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                    >
                      <Save className="w-3.5 h-3.5" />
                      <span>{savingId === svc.id ? 'Saving...' : 'Save Time'}</span>
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="pt-2 border-t border-slate-100 flex items-center justify-between shrink-0">
          <p className="text-[11px] text-slate-400">
            Changes take effect immediately across all church check-in portals.
          </p>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition-colors cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
