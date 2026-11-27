'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import {
  Users,
  UserPlus,
  Sparkles,
  Smartphone,
  RefreshCw,
  Download,
  Phone,
  MessageCircle,
  Clock,
  Lock,
  Calendar,
  TrendingUp,
  FileSpreadsheet,
  ChevronDown,
  HeartHandshake,
  Cake,
  Upload,
  AlertTriangle,
  CheckCircle2,
  MapPin,
  X,
} from 'lucide-react';
import {
  getAdminScorecardAction,
  getChurchLocationAction,
  updateChurchLocationAction,
  AdminScorecardResponse,
  AdminTimeRange,
} from '../actions/admin';
import { loginAction, checkSessionAction } from '../actions/auth';
import Toast from '../components/Toast';
import CustomDropdown from '../components/CustomDropdown';
import ExportExcelModal from '../components/ExportExcelModal';
import ManageServicesModal from '../components/ManageServicesModal';
import ImportMembersModal from '../components/ImportMembersModal';
import AmbientBackground from '../components/AmbientBackground';
import { formatTimeRange12 } from '@/lib/service-resolver';

export default function AdminScorecardDashboard() {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<AdminScorecardResponse | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  // Timeframe filter state
  const [timeRange, setTimeRange] = useState<AdminTimeRange>('TODAY');

  // Simple Security PIN Gate for Leadership
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState(false);

  // Active view tab
  const [activeTab, setActiveTab] = useState<
    'SERVICES' | 'FIRST_TIMERS' | 'ROLL_CALL' | 'FOLLOW_UP' | 'BIRTHDAYS' | 'TREND'
  >('SERVICES');

  // Export Modal state
  const [showExportModal, setShowExportModal] = useState(false);
  const [selectedExportService, setSelectedExportService] = useState<{ records: any[]; label: string; dateISO?: string } | null>(null);

  // Specific date query state (e.g. YYYY-MM-DD)
  const [selectedDate, setSelectedDate] = useState('');

  // Roll call expansion state per service card
  const [expandedServiceId, setExpandedServiceId] = useState<string | null>(null);

  // Manage Services Modal state
  const [showServicesModal, setShowServicesModal] = useState(false);

  // Import Members Modal state
  const [showImportModal, setShowImportModal] = useState(false);

  // Sanctuary GPS Calibration Modal state
  const [showLocationModal, setShowLocationModal] = useState(false);
  const [locLat, setLocLat] = useState('');
  const [locLng, setLocLng] = useState('');
  const [locRadius, setLocRadius] = useState('150');
  const [locSaving, setLocSaving] = useState(false);
  const [locDetecting, setLocDetecting] = useState(false);

  async function openLocationModal() {
    setShowLocationModal(true);
    const res = await getChurchLocationAction();
    if (res.success && res.latitude !== undefined && res.longitude !== undefined) {
      setLocLat(String(res.latitude));
      setLocLng(String(res.longitude));
      setLocRadius(String(res.geofenceRadius ?? 150));
    }
  }

  function handleDetectCurrentGps() {
    if (typeof window === 'undefined' || !navigator.geolocation) {
      setToast({ type: 'error', message: 'Geolocation is not available on this device.' });
      return;
    }
    setLocDetecting(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocLat(pos.coords.latitude.toFixed(6));
        setLocLng(pos.coords.longitude.toFixed(6));
        setLocDetecting(false);
        setToast({
          type: 'info',
          message: `Detected GPS (±${Math.round(pos.coords.accuracy)}m accuracy). Click Save Location to apply.`,
        });
      },
      () => {
        setLocDetecting(false);
        setToast({ type: 'error', message: 'Could not read GPS. Check browser location permission.' });
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }

  async function handleSaveChurchLocation(e: React.FormEvent) {
    e.preventDefault();
    const lat = parseFloat(locLat);
    const lng = parseFloat(locLng);
    const rad = parseInt(locRadius, 10) || 150;
    setLocSaving(true);
    const res = await updateChurchLocationAction({ latitude: lat, longitude: lng, geofenceRadius: rad });
    setLocSaving(false);
    if (res.success) {
      setShowLocationModal(false);
      setToast({
        type: 'success',
        title: 'Sanctuary GPS Updated',
        message: `Geofence set to (${lat.toFixed(5)}, ${lng.toFixed(5)}) with ${rad}m radius.`,
      });
    } else {
      setToast({ type: 'error', message: res.error || 'Failed to update location.' });
    }
  }

  // Helper to format Youth-focused category display
  function getCategoryDisplay(person: any) {
    if (person?.status === 'FIRST_TIMER') return 'First-Timer';
    return 'Youth Member';
  }

  // Toast Notification state
  const [toast, setToast] = useState<{
    type: 'success' | 'error' | 'info';
    message: string;
    title?: string;
  } | null>(null);

  useEffect(() => {
    checkSessionAction()
      .then((sessionRes) => {
        if (sessionRes?.role === 'ADMIN') {
          setIsAuthenticated(true);
          loadScorecard('TODAY');
          return;
        }
        if (typeof window !== 'undefined') {
          const auth = sessionStorage.getItem('rccg_admin_auth');
          if (auth === 'true') {
            setIsAuthenticated(true);
            loadScorecard('TODAY');
            return;
          }
        }
        setLoading(false);
      })
      .catch(() => {
        setLoading(false);
      });
  }, []);

  // Automatic background refresh every 30 seconds for real-time live attendance sync
  useEffect(() => {
    if (!isAuthenticated) return;
    const interval = setInterval(() => {
      loadScorecard(timeRange, selectedDate);
    }, 30000);
    return () => clearInterval(interval);
  }, [isAuthenticated, timeRange, selectedDate]);

  async function loadScorecard(range: AdminTimeRange = timeRange, dateStr: string = selectedDate) {
    setRefreshing(true);
    try {
      if (typeof getAdminScorecardAction !== 'function') {
        throw new Error('Admin scorecard action is unavailable.');
      }
      const res = await getAdminScorecardAction(range, dateStr || undefined);
      if (res?.success) {
        setData(res);
      } else {
        setToast({
          type: 'error',
          title: 'Error Loading Data',
          message: res?.error || 'Failed to load attendance metrics.',
        });
      }
    } catch (err) {
      setToast({
        type: 'error',
        title: 'Error Loading Data',
        message: err instanceof Error ? err.message : 'Failed to load attendance metrics.',
      });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  function handleTimeRangeChange(newRange: AdminTimeRange) {
    setTimeRange(newRange);
    setSelectedDate('');
    loadScorecard(newRange, '');
  }

  async function handlePinSubmit(e: React.FormEvent) {
    e.preventDefault();
    const cleanPin = pinInput.trim();
    const res = await loginAction({ role: 'ADMIN', password: cleanPin });
    if (res.success) {
      setIsAuthenticated(true);
      if (typeof window !== 'undefined') {
        sessionStorage.setItem('rccg_admin_auth', 'true');
      }
      setPinError(false);
      loadScorecard('TODAY');
    } else {
      setPinError(true);
    }
  }

  const timeRangeOptions = [
    { value: 'TODAY', label: 'Today (Live)' },
    { value: '1_MONTH', label: 'Past 1 Month (30 Days)' },
    { value: '3_MONTHS', label: 'Past 3 Months (Quarter)' },
    { value: '6_MONTHS', label: 'Past 6 Months' },
    { value: '1_YEAR', label: 'Past 1 Year (Annual)' },
  ];

  // 1. PIN Gate: Prompt for Leadership Access PIN
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4 relative overflow-hidden">
        <AmbientBackground />

        <div className="relative z-10 bg-white/95 backdrop-blur-md border border-slate-200/80 rounded-3xl p-8 max-w-sm w-full shadow-xl space-y-6 text-center">
          <div className="relative w-16 h-16 mx-auto">
            <Image src="/rccg-logo.png" alt="RCCG" fill className="object-contain" priority />
          </div>

          <div className="space-y-1">
            <h1 className="text-lg font-bold text-slate-900">Admin</h1>
            <p className="text-xs text-slate-500 font-medium">Enter your 4-digit Admin PIN</p>
          </div>

          <form onSubmit={handlePinSubmit} className="space-y-4">
            <div>
              <input
                type="password"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={4}
                autoFocus
                placeholder="• • • •"
                value={pinInput}
                onChange={(e) => {
                  setPinInput(e.target.value);
                  setPinError(false);
                }}
                className="w-full h-14 text-center text-3xl font-extrabold tracking-[0.5em] bg-slate-50 border-2 border-slate-200 focus:border-blue-600 focus:bg-white rounded-2xl focus:outline-none transition-all placeholder:text-slate-300"
              />
              {pinError && (
                <p className="text-xs text-rose-600 font-semibold mt-2">
                  Incorrect PIN. Try 1234 or 7777 for leadership access.
                </p>
              )}
            </div>

            <button
              type="submit"
              className="w-full min-h-[44px] py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm rounded-xl shadow-xs transition-colors cursor-pointer flex items-center justify-center gap-2 active:scale-[0.97]"
            >
              <Lock className="w-4 h-4" />
              <span>Unlock Scorecard</span>
            </button>
          </form>

          <Link
            href="/"
            className="text-xs text-slate-500 hover:text-blue-600 transition-colors inline-flex items-center justify-center min-h-[44px] px-3 cursor-pointer font-medium"
          >
            ← Return to Member Door Screen
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col relative overflow-hidden">
      <AmbientBackground />

      {/* Floating Toast Notification */}
      {toast && (
        <Toast
          type={toast.type}
          title={toast.title}
          message={toast.message}
          onClose={() => setToast(null)}
        />
      )}

      {/* Export Excel Modal */}
      <ExportExcelModal
        isOpen={showExportModal}
        onClose={() => {
          setShowExportModal(false);
          setSelectedExportService(null);
        }}
        records={selectedExportService ? selectedExportService.records : (data?.recentAttendanceRecords || [])}
        timeframeLabel={
          selectedExportService
            ? selectedExportService.label
            : (data?.timeRangeLabel || data?.activeDateFormatted || 'Attendance')
        }
        dateISO={selectedExportService?.dateISO || data?.activeDateISO}
        onSuccessToast={(msg) =>
          setToast({
            type: 'success',
            title: 'Export Complete',
            message: msg,
          })
        }
        onErrorToast={(msg) =>
          setToast({
            type: 'error',
            title: 'Export Error',
            message: msg,
          })
        }
      />

      {/* Manage Service Times Modal */}
      <ManageServicesModal
        isOpen={showServicesModal}
        onClose={() => setShowServicesModal(false)}
        onSuccessToast={(msg) =>
          setToast({
            type: 'success',
            title: 'Schedule Updated',
            message: msg,
          })
        }
        onErrorToast={(msg) =>
          setToast({
            type: 'error',
            title: 'Update Error',
            message: msg,
          })
        }
        onServicesUpdated={() => loadScorecard(timeRange)}
      />

      {/* Import Members (Excel / Word) Modal */}
      <ImportMembersModal
        isOpen={showImportModal}
        onClose={() => setShowImportModal(false)}
        onSuccessToast={(msg) =>
          setToast({
            type: 'success',
            title: 'Members Imported',
            message: msg,
          })
        }
        onErrorToast={(msg) =>
          setToast({
            type: 'error',
            title: 'Import Error',
            message: msg,
          })
        }
        onImported={() => loadScorecard(timeRange, selectedDate)}
      />

      {/* Sanctuary GPS Calibration Modal */}
      {showLocationModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/50 backdrop-blur-xs flex items-center justify-center p-4">
          <form
            onSubmit={handleSaveChurchLocation}
            className="bg-white border border-slate-200 rounded-3xl max-w-md w-full p-6 shadow-xl space-y-4"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <MapPin className="w-5 h-5 text-emerald-600" />
                <h2 className="text-base font-bold text-slate-900">Sanctuary GPS Location</h2>
              </div>
              <button
                type="button"
                onClick={() => setShowLocationModal(false)}
                className="w-11 h-11 rounded-xl hover:bg-slate-100 flex items-center justify-center text-slate-500 cursor-pointer active:scale-[0.97]"
                aria-label="Close modal"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              Stand inside the church sanctuary on your phone and tap <strong>Use My Current GPS</strong>, or paste your Google Maps coordinates.
            </p>

            <button
              type="button"
              onClick={handleDetectCurrentGps}
              disabled={locDetecting}
              className="w-full min-h-[44px] py-2.5 px-4 rounded-xl bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-900 text-xs font-bold transition-colors cursor-pointer active:scale-[0.97]"
            >
              {locDetecting ? 'Reading GPS...' : 'Use My Current GPS Location'}
            </button>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Latitude</label>
                <input
                  type="number"
                  step="any"
                  required
                  value={locLat}
                  onChange={(e) => setLocLat(e.target.value)}
                  className="w-full min-h-[44px] rounded-xl border border-slate-300 px-3 py-2 text-xs font-mono text-slate-900"
                />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Longitude</label>
                <input
                  type="number"
                  step="any"
                  required
                  value={locLng}
                  onChange={(e) => setLocLng(e.target.value)}
                  className="w-full min-h-[44px] rounded-xl border border-slate-300 px-3 py-2 text-xs font-mono text-slate-900"
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">
                Geofence Radius (meters)
              </label>
              <input
                type="number"
                min={50}
                max={2000}
                required
                value={locRadius}
                onChange={(e) => setLocRadius(e.target.value)}
                className="w-full min-h-[44px] rounded-xl border border-slate-300 px-3 py-2 text-xs font-mono text-slate-900"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowLocationModal(false)}
                className="min-h-[44px] px-4 py-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-700 hover:bg-slate-50 cursor-pointer active:scale-[0.97]"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={locSaving}
                className="min-h-[44px] px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold cursor-pointer active:scale-[0.97]"
              >
                {locSaving ? 'Saving...' : 'Save Location'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Top Header */}
      <header className="border-b border-slate-200/80 bg-white/90 backdrop-blur-md sticky top-0 z-30 px-4 py-3 shadow-xs">
        <div className="max-w-6xl mx-auto flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="relative w-11 h-11 shrink-0">
              <Image src="/rccg-logo.png" alt="RCCG" fill className="object-contain" priority />
            </div>
            <div className="min-w-0">
              <h1 className="text-base font-bold text-slate-900 leading-tight truncate">
                RCCG Jesus Covenant Zone
              </h1>
              <p className="text-xs text-blue-700 font-semibold flex items-center gap-1.5 truncate">
                <Calendar className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">{data?.todayDateString || 'Sunday Attendance Scorecard'}</span>
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-2">
            {/* Styled Custom Timeframe Dropdown */}
            <div className="w-full sm:w-48">
              <CustomDropdown
                value={timeRange}
                onChange={(val) => handleTimeRangeChange(val as AdminTimeRange)}
                options={timeRangeOptions}
                leadingIcon={<Calendar className="w-3.5 h-3.5 text-blue-600 shrink-0" />}
                buttonClassName="min-h-[44px]"
              />
            </div>

            {/* Pick Specific Date for Past Records */}
            <div className="w-full sm:w-auto min-h-[44px] flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1.5 shadow-2xs">
              <Calendar className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => {
                  const val = e.target.value;
                  setSelectedDate(val);
                  if (val) {
                    setTimeRange('CUSTOM_DATE');
                    loadScorecard('CUSTOM_DATE', val);
                  }
                }}
                className="min-w-0 flex-1 w-full sm:w-auto text-xs text-slate-800 bg-transparent focus:outline-none cursor-pointer"
                title="Filter by specific date"
              />
              {selectedDate && (
                <button
                  type="button"
                  onClick={() => {
                    setSelectedDate('');
                    setTimeRange('TODAY');
                    loadScorecard('TODAY', '');
                  }}
                  className="text-slate-400 hover:text-slate-700 text-xs font-bold cursor-pointer p-1 shrink-0"
                  title="Clear date filter"
                  aria-label="Clear date filter"
                >
                  ✕
                </button>
              )}
            </div>

            <button
              type="button"
              onClick={openLocationModal}
              className="w-full sm:w-auto min-h-[44px] text-xs bg-slate-100 hover:bg-slate-200 text-slate-700 px-3 py-2 rounded-xl border border-slate-200 font-bold transition-colors flex items-center justify-center sm:justify-start gap-1.5 cursor-pointer active:scale-[0.97]"
              title="Set exact church sanctuary GPS coordinates"
            >
              <MapPin className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
              <span>Sanctuary GPS</span>
            </button>

            <button
              type="button"
              onClick={() => setShowServicesModal(true)}
              className="w-full sm:w-auto min-h-[44px] text-xs bg-slate-100 hover:bg-slate-200 text-slate-700 px-3 py-2 rounded-xl border border-slate-200 font-bold transition-colors flex items-center justify-center sm:justify-start gap-1.5 cursor-pointer active:scale-[0.97]"
              title="Edit church service start and end hours"
            >
              <Clock className="w-3.5 h-3.5 text-blue-600 shrink-0" />
              <span>Service Times</span>
            </button>

            <button
              type="button"
              onClick={() => loadScorecard(timeRange)}
              disabled={refreshing}
              className="w-full sm:w-auto min-h-[44px] text-xs bg-slate-100 hover:bg-slate-200 text-slate-700 px-3 py-2 rounded-xl border border-slate-200 font-bold transition-colors flex items-center justify-center sm:justify-start gap-1.5 cursor-pointer active:scale-[0.97]"
            >
              <RefreshCw className={`w-3.5 h-3.5 shrink-0 ${refreshing ? 'animate-spin' : ''}`} />
              <span>Refresh</span>
            </button>

            {/* Import Members (Excel / Word) Button */}
            <button
              type="button"
              onClick={() => setShowImportModal(true)}
              className="w-full sm:w-auto min-h-[44px] text-xs bg-indigo-50 hover:bg-indigo-100 text-indigo-800 px-3 py-2 rounded-xl border border-indigo-200 font-bold transition-colors flex items-center justify-center sm:justify-start gap-1.5 cursor-pointer shadow-2xs active:scale-[0.97]"
              title="Import Youth members from Excel (.xlsx, .csv) or Word (.docx)"
            >
              <Upload className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
              <span className="sm:hidden">Import Members</span>
              <span className="hidden sm:inline">Import Members (Excel / Word)</span>
            </button>

            {/* Export Excel / CSV Button */}
            <button
              type="button"
              onClick={() => setShowExportModal(true)}
              className="col-span-2 sm:col-span-1 w-full sm:w-auto min-h-[44px] text-xs bg-blue-600 hover:bg-blue-700 text-white px-3.5 py-2 rounded-xl font-bold shadow-xs transition-colors flex items-center justify-center gap-1.5 cursor-pointer active:scale-[0.97]"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 shrink-0" />
              <span>Download Excel</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-6xl w-full mx-auto p-4 sm:p-6 space-y-6 relative z-10">
        {loading ? (
          <div className="text-center py-24 space-y-3">
            <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
            <p className="text-slate-500 text-sm font-medium">Computing attendance scorecard...</p>
          </div>
        ) : (
          <>
            {/* Scope Badge */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-slate-500">Active Scope:</span>
                <span className="text-xs font-extrabold px-2.5 py-0.5 rounded-full bg-blue-100 text-blue-800 border border-blue-200">
                  {data?.timeRangeLabel || 'Today'}
                </span>
              </div>
            </div>

            {/* Live Service or Next Upcoming Service Banner */}
            {data?.isLiveNow && data?.activeService ? (
              <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-2xl p-3.5 flex items-center gap-3 text-xs">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse shrink-0" />
                <div>
                  <span className="font-bold text-emerald-950 block">
                    Live Service: {data.activeService.name} ({formatTimeRange12(data.activeService.startTime, data.activeService.endTime)})
                  </span>
                  <span className="text-[11px] text-emerald-800">
                    {data.sundayLabel ? `${data.sundayLabel} · ` : ''}Attendance check-ins are streaming live.
                  </span>
                </div>
              </div>
            ) : data?.nextUpcomingService ? (
              <div className="bg-blue-50/90 border border-blue-200 rounded-2xl p-3.5 flex items-center gap-3 text-xs">
                <Clock className="w-4 h-4 text-blue-600 shrink-0" />
                <div>
                  <span className="font-bold text-slate-900 block">
                    Next Upcoming Service: {data.nextUpcomingService.name} ({data.nextUpcomingService.formattedSchedule})
                  </span>
                  {data.sundayLabel && (
                    <span className="text-[11px] font-medium text-blue-800">
                      {data.sundayLabel}
                    </span>
                  )}
                </div>
              </div>
            ) : null}

            {/* Youth-Focused Executive Metric Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {/* Metric 1: Total Present */}
              <div className="bg-white/90 backdrop-blur-md border border-slate-200 rounded-3xl p-4 shadow-xs space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] sm:text-xs font-bold text-slate-600 uppercase tracking-wider">
                    Total Present
                  </span>
                  <div className="w-7 h-7 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                    <Users className="w-4 h-4" />
                  </div>
                </div>
                <div className="text-2xl sm:text-3xl font-extrabold text-slate-900">
                  {data?.totalUniqueAttendees || 0}
                </div>
                <p className="text-xs text-slate-500 font-medium">Youth &amp; First-Timers</p>
              </div>

              {/* Metric 2: Youth Members */}
              <div className="bg-white/90 backdrop-blur-md border border-slate-200 rounded-3xl p-4 shadow-xs space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] sm:text-xs font-bold text-slate-600 uppercase tracking-wider">
                    Youth Members
                  </span>
                  <div className="w-7 h-7 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
                    <Sparkles className="w-4 h-4" />
                  </div>
                </div>
                <div className="text-2xl sm:text-3xl font-extrabold text-amber-600">
                  {data?.categoryBreakdown?.totalYouth ?? Math.max(0, (data?.totalUniqueAttendees || 0) - (data?.totalFirstTimers || 0))}
                </div>
                <p className="text-xs text-slate-500 font-medium">Returning youth</p>
              </div>

              {/* Metric 3: First-Timers */}
              <div className="bg-white/90 backdrop-blur-md border border-slate-200 rounded-3xl p-4 shadow-xs space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] sm:text-xs font-bold text-slate-600 uppercase tracking-wider">
                    First-Timers
                  </span>
                  <div className="w-7 h-7 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
                    <UserPlus className="w-4 h-4" />
                  </div>
                </div>
                <div className="text-2xl sm:text-3xl font-extrabold text-emerald-600">
                  {data?.categoryBreakdown?.totalFirstTimers ?? data?.totalFirstTimers ?? 0}
                </div>
                <p className="text-xs text-slate-500 font-medium">New souls registered</p>
              </div>

              {/* Metric 4: Self Check-In Rate */}
              <div className="bg-white/90 backdrop-blur-md border border-slate-200 rounded-3xl p-4 shadow-xs space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] sm:text-xs font-bold text-slate-600 uppercase tracking-wider">
                    Self Check-In
                  </span>
                  <div className="w-7 h-7 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
                    <Smartphone className="w-4 h-4" />
                  </div>
                </div>
                <div className="text-2xl sm:text-3xl font-extrabold text-indigo-600">
                  {data?.selfScanPercentage ?? 0}%
                </div>
                <p className="text-xs text-slate-500 font-medium">QR self-scan share</p>
              </div>
            </div>

            {/* Navigation Tabs */}
            <div className="grid grid-cols-2 sm:flex sm:flex-wrap rounded-2xl bg-slate-100 p-1.5 border border-slate-200 gap-1.5">
              <button
                type="button"
                onClick={() => setActiveTab('SERVICES')}
                className={`min-h-[44px] sm:flex-1 py-2 px-3 text-xs font-bold rounded-xl transition-all cursor-pointer flex items-center justify-center active:scale-[0.97] ${
                  activeTab === 'SERVICES'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Services
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('FIRST_TIMERS')}
                className={`min-h-[44px] sm:flex-1 py-2 px-3 text-xs font-bold rounded-xl transition-all cursor-pointer flex items-center justify-center active:scale-[0.97] ${
                  activeTab === 'FIRST_TIMERS'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                First-Timers ({data?.totalFirstTimers || 0})
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('ROLL_CALL')}
                className={`min-h-[44px] sm:flex-1 py-2 px-3 text-xs font-bold rounded-xl transition-all cursor-pointer flex items-center justify-center active:scale-[0.97] ${
                  activeTab === 'ROLL_CALL'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Roll Call ({data?.recentAttendanceRecords?.length || 0})
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('FOLLOW_UP')}
                className={`min-h-[44px] sm:flex-1 py-2 px-3 text-xs font-bold rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5 active:scale-[0.97] ${
                  activeTab === 'FOLLOW_UP'
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <HeartHandshake className="w-3.5 h-3.5 shrink-0" />
                <span>Follow-Up ({data?.followUpSummary?.recentResults?.length || 0})</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('BIRTHDAYS')}
                className={`min-h-[44px] sm:flex-1 py-2 px-3 text-xs font-bold rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5 active:scale-[0.97] ${
                  activeTab === 'BIRTHDAYS'
                    ? 'bg-amber-600 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Cake className="w-3.5 h-3.5 shrink-0" />
                <span>Birthdays ({data?.upcomingBirthdays?.next7DaysCount || 0})</span>
              </button>
              {data?.trendHistory && data.trendHistory.length > 1 && (
                <button
                  type="button"
                  onClick={() => setActiveTab('TREND')}
                  className={`min-h-[44px] sm:flex-1 py-2 px-3 text-xs font-bold rounded-xl transition-all cursor-pointer flex items-center justify-center active:scale-[0.97] ${
                    activeTab === 'TREND'
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Trend ({data.trendHistory.length})
                </button>
              )}
            </div>

            {/* TAB 1: SERVICE BREAKDOWN & 1-CLICK EXPORTS */}
            {activeTab === 'SERVICES' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                    <Clock className="w-4 h-4 text-blue-600" />
                    <span>Service Breakdown &amp; Class Splits</span>
                  </h2>
                  <span className="text-[11px] text-slate-500 font-medium">
                    Showing {data?.servicesBreakdown?.length || 0} services
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {data?.servicesBreakdown?.map((svc) => {
                    const isExpanded = expandedServiceId === svc.id;
                    const hasRecords = svc.totalPresent > 0;
                    const isSundaySchool = svc.hasSubClasses || svc.name.toLowerCase().includes('sunday school');

                    return (
                      <div
                        key={svc.id}
                        className="bg-white/95 backdrop-blur-md border border-slate-200 rounded-3xl p-5 shadow-xs space-y-3.5 transition-all"
                      >
                        {/* Service Card Header */}
                        <div className="flex items-start justify-between gap-3">
                          <div className="space-y-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <h3 className="text-base font-bold text-slate-900">{svc.name}</h3>
                              <span
                                className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                                  svc.status === 'LIVE'
                                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200 animate-pulse'
                                    : svc.status === 'CONCLUDED'
                                    ? 'bg-blue-50 text-blue-700 border-blue-200'
                                    : 'bg-slate-50 text-slate-600 border-slate-200'
                                }`}
                              >
                                {svc.status === 'LIVE'
                                  ? '● Live Now'
                                  : svc.status === 'CONCLUDED'
                                  ? '✓ Completed'
                                  : '⏳ Upcoming'}
                              </span>
                            </div>
                            <p className="text-xs text-slate-500 font-mono font-medium">
                              {formatTimeRange12(svc.startTime, svc.endTime)}
                            </p>
                          </div>

                          <div className="text-right">
                            <div className="text-2xl font-extrabold text-blue-600 leading-tight">
                              {svc.totalPresent}
                            </div>
                            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                              Present
                            </p>
                          </div>
                        </div>

                        {/* Youth & First-Timer Split Pills */}
                        {hasRecords ? (
                          <div className="flex flex-wrap gap-1.5 text-[11px] pt-1 border-t border-slate-100">
                            <span className="bg-purple-50 text-purple-800 border border-purple-200 px-2.5 py-1 rounded-xl font-bold">
                              Youth Members: {Math.max(0, svc.totalPresent - (svc.firstTimersCount ?? 0))}
                            </span>

                            {(svc.firstTimersCount ?? 0) > 0 && (
                              <span className="bg-emerald-50 text-emerald-800 border border-emerald-200 px-2.5 py-1 rounded-xl font-bold flex items-center gap-1">
                                <Sparkles className="w-3 h-3" />
                                <span>1st Timers: {svc.firstTimersCount}</span>
                              </span>
                            )}
                          </div>
                        ) : (
                          <p className="text-[11px] text-slate-400 italic pt-1 border-t border-slate-100">
                            No attendance recorded yet for this session.
                          </p>
                        )}

                        {/* Action Buttons: 1-Click Excel Download & Roll Call Expansion */}
                        {hasRecords && (
                          <div className="grid grid-cols-2 sm:flex sm:items-center sm:justify-between gap-2 pt-2 border-t border-slate-100">
                            <button
                              type="button"
                              onClick={() => {
                                const dateTag = data?.activeDateFormatted || data?.timeRangeLabel || 'Service';
                                setSelectedExportService({
                                  records: svc.records,
                                  label: `${svc.name} (${dateTag})`,
                                  dateISO: data?.activeDateISO,
                                });
                                setShowExportModal(true);
                              }}
                              className="min-h-[44px] px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-xs transition-colors flex items-center justify-center gap-1.5 cursor-pointer active:scale-[0.97]"
                              title={`Download ${svc.name} attendance`}
                            >
                              <Download className="w-3.5 h-3.5 shrink-0" />
                              <span>Download Sheet</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => setExpandedServiceId(isExpanded ? null : svc.id)}
                              className="min-h-[44px] px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl border border-slate-200 transition-colors flex items-center justify-center gap-1 cursor-pointer active:scale-[0.97]"
                            >
                              <span>{isExpanded ? 'Hide Roll' : 'View Roll Call'}</span>
                              <ChevronDown
                                className={`w-3.5 h-3.5 shrink-0 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                              />
                            </button>
                          </div>
                        )}

                        {/* Roll Call Accordion */}
                        {isExpanded && hasRecords && (
                          <div className="pt-2 border-t border-slate-100 space-y-2 max-h-60 overflow-y-auto">
                            <div className="text-xs font-bold text-slate-600 px-1">
                              Attendees for {svc.name} ({svc.records.length})
                            </div>
                            {svc.records.map((r: any) => {
                              const timeFormatted = new Date(r.createdAt).toLocaleTimeString('en-US', {
                                timeZone: 'Africa/Lagos',
                                hour: '2-digit',
                                minute: '2-digit',
                                hour12: true,
                              });

                              return (
                                <div
                                  key={r.id}
                                  className="bg-slate-50 border border-slate-200 rounded-xl p-2.5 flex items-center justify-between gap-2 text-xs"
                                >
                                  <div className="min-w-0">
                                    <span className="font-bold text-slate-900 block truncate">
                                      {r.person?.firstName} {r.person?.lastName}
                                    </span>
                                    <span className="text-[11px] text-slate-500 font-mono">
                                      Arrived: <strong className="text-slate-800">{timeFormatted}</strong> &bull;{' '}
                                      {getCategoryDisplay(r.person)}
                                    </span>
                                  </div>

                                  <span
                                    className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full border shrink-0 ${
                                      r.method === 'QR_SELF'
                                        ? 'bg-blue-50 text-blue-700 border-blue-200'
                                        : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                    }`}
                                  >
                                    {r.method === 'QR_SELF' ? 'Self Check-In' : 'Usher Marked'}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* TAB 2: FIRST-TIMERS ACTION CENTER */}
            {activeTab === 'FIRST_TIMERS' && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-bold text-slate-900">
                    First-Timers Captured ({data?.firstTimersList?.length || 0})
                  </h2>
                  <span className="text-xs text-slate-500 font-medium">1-Tap Admin Outreach</span>
                </div>

                {data?.firstTimersList?.length === 0 ? (
                  <div className="bg-white/90 backdrop-blur-md border border-slate-200 rounded-3xl p-10 text-center space-y-2">
                    <UserPlus className="w-10 h-10 text-slate-300 mx-auto" />
                    <p className="text-sm font-semibold text-slate-800">
                      No first-timers recorded in this timeframe.
                    </p>
                    <p className="text-xs text-slate-500">
                      When new visitors register at the door, they will automatically appear here.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    {data?.firstTimersList?.map((ft) => {
                      const cleanPhone = ft.phone.replace(/\D/g, '');
                      const intlPhone = cleanPhone.startsWith('0') ? `234${cleanPhone.slice(1)}` : cleanPhone;
                      const welcomeMsg = encodeURIComponent(
                        `Good day ${ft.firstName}! We were blessed to have you worship with us at RCCG Jesus Covenant Zone. We pray God's grace abounds in your life!`
                      );

                      return (
                        <div
                          key={ft.id}
                          className="bg-white/95 backdrop-blur-md border border-slate-200 rounded-3xl p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs"
                        >
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <h3 className="text-base font-bold text-slate-900">
                                {ft.firstName} {ft.lastName}
                              </h3>
                              <span className="text-[11px] bg-emerald-50 text-emerald-700 border border-emerald-200 px-2.5 py-0.5 rounded-full font-bold">
                                First-Timer
                              </span>
                              <span className="text-[11px] bg-slate-100 text-slate-600 px-2.5 py-0.5 rounded-full font-medium">
                                {ft.category}
                              </span>
                            </div>
                            <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">
                              Phone: <strong className="text-slate-800">{ft.phone}</strong> &bull; Recorded on{' '}
                              <span className="text-blue-700 font-semibold">{ft.timeString}</span> during{' '}
                              <span className="text-slate-700">{ft.serviceName}</span>
                            </p>
                          </div>

                          {/* Quick 1-Tap Admin Action Buttons */}
                          <div className="flex items-center gap-2 shrink-0">
                            <a
                              href={`https://wa.me/${intlPhone}?text=${welcomeMsg}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="min-h-[44px] flex-1 sm:flex-initial text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-3.5 py-2 rounded-xl shadow-xs transition-colors flex items-center justify-center gap-1.5 cursor-pointer active:scale-[0.97]"
                            >
                              <MessageCircle className="w-3.5 h-3.5 shrink-0" />
                              <span>WhatsApp</span>
                            </a>

                            <a
                              href={`tel:${ft.phone}`}
                              className="min-h-[44px] flex-1 sm:flex-initial text-xs bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold px-3.5 py-2 rounded-xl border border-slate-200 transition-colors flex items-center justify-center gap-1.5 cursor-pointer active:scale-[0.97]"
                            >
                              <Phone className="w-3.5 h-3.5 shrink-0" />
                              <span>Call</span>
                            </a>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* TAB 3: LIVE ATTENDANCE ROLL */}
            {activeTab === 'ROLL_CALL' && (
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="text-sm font-bold text-slate-900">
                    Attendance Log ({data?.recentAttendanceRecords?.length || 0} Records)
                  </h2>
                  <button
                    type="button"
                    onClick={() => setShowExportModal(true)}
                    className="min-h-[44px] px-3 text-xs text-blue-600 hover:bg-blue-50 rounded-xl font-bold cursor-pointer flex items-center gap-1.5 active:scale-[0.97]"
                  >
                    <Download className="w-3.5 h-3.5 shrink-0" />
                    <span>Download Excel</span>
                  </button>
                </div>

                {data?.recentAttendanceRecords?.length === 0 ? (
                  <div className="bg-white/90 backdrop-blur-md border border-slate-200 rounded-3xl p-10 text-center">
                    <p className="text-sm font-semibold text-slate-700">No records found for this timeframe.</p>
                  </div>
                ) : (
                  <>
                    {/* Mobile Cards (< sm) */}
                    <div className="block sm:hidden space-y-2.5">
                      {data?.recentAttendanceRecords?.map((r: any) => (
                        <div
                          key={r.id}
                          className="bg-white/95 backdrop-blur-md border border-slate-200 rounded-2xl p-4 shadow-xs space-y-2"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <span className="text-sm font-bold text-slate-900 min-w-0 truncate">
                              {r.person?.firstName} {r.person?.lastName}
                            </span>
                            <span
                              className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold shrink-0 ${
                                r.method === 'QR_SELF'
                                  ? 'bg-blue-50 text-blue-700 border border-blue-200'
                                  : 'bg-slate-100 text-slate-700 border border-slate-200'
                              }`}
                            >
                              {r.method === 'QR_SELF' ? 'Self Scan' : 'Usher Marked'}
                            </span>
                          </div>
                          <div className="flex flex-wrap items-center gap-2 text-xs">
                            <span className="font-semibold text-blue-700">
                              {r.serviceSchedule?.name} {r.subClass && `(${r.subClass})`}
                            </span>
                            <span className="px-2 py-0.5 bg-slate-100 text-slate-600 rounded-md font-semibold text-[11px]">
                              {getCategoryDisplay(r.person)}
                            </span>
                          </div>
                          <p className="text-xs text-slate-500 font-mono">
                            {new Date(r.createdAt).toLocaleDateString([], {
                              month: 'short',
                              day: 'numeric',
                            })}{' '}
                            {new Date(r.createdAt).toLocaleTimeString([], {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </p>
                        </div>
                      ))}
                    </div>

                    {/* Desktop Table (sm+) */}
                    <div className="hidden sm:block bg-white/95 backdrop-blur-md border border-slate-200 rounded-3xl overflow-hidden shadow-xs">
                      <div className="overflow-x-auto max-h-96">
                        <table className="w-full text-left text-xs">
                          <thead className="bg-slate-50/90 border-b border-slate-200 text-slate-500 uppercase tracking-wider font-bold sticky top-0">
                            <tr>
                              <th className="p-3.5">Member Name</th>
                              <th className="p-3.5">Category</th>
                              <th className="p-3.5">Service</th>
                              <th className="p-3.5">Method</th>
                              <th className="p-3.5">Date / Time</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {data?.recentAttendanceRecords?.map((r: any) => (
                              <tr key={r.id} className="hover:bg-slate-50/80 transition-colors">
                                <td className="p-3.5 font-bold text-slate-900">
                                  {r.person?.firstName} {r.person?.lastName}
                                </td>
                                <td className="p-3.5 text-slate-600">
                                  <span className="px-2 py-0.5 bg-slate-100 rounded-md font-semibold text-[11px]">
                                    {getCategoryDisplay(r.person)}
                                  </span>
                                </td>
                                <td className="p-3.5 font-semibold text-blue-700">
                                  {r.serviceSchedule?.name} {r.subClass && `(${r.subClass})`}
                                </td>
                                <td className="p-3.5">
                                  <span
                                    className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                      r.method === 'QR_SELF'
                                        ? 'bg-blue-50 text-blue-700 border border-blue-200'
                                        : 'bg-slate-100 text-slate-600'
                                    }`}
                                  >
                                    {r.method === 'QR_SELF' ? 'Self Scan' : 'Usher Marked'}
                                  </span>
                                </td>
                                <td className="p-3.5 text-slate-500 font-mono">
                                  {new Date(r.createdAt).toLocaleDateString([], {
                                    month: 'short',
                                    day: 'numeric',
                                  })}{' '}
                                  {new Date(r.createdAt).toLocaleTimeString([], {
                                    hour: '2-digit',
                                    minute: '2-digit',
                                  })}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* TAB 4: FOLLOW-UP OUTCOMES & TASKS */}
            {activeTab === 'FOLLOW_UP' && (
              <div className="space-y-5">
                <div className="grid grid-cols-3 gap-2 sm:gap-3">
                  <div className="bg-white/95 border border-slate-200 rounded-2xl p-3 sm:p-4 shadow-xs">
                    <p className="text-[11px] sm:text-xs font-bold text-slate-500 uppercase tracking-wider">Pending</p>
                    <p className="text-2xl font-extrabold text-amber-600 mt-1">
                      {data?.followUpSummary?.pendingCount ?? 0}
                    </p>
                  </div>
                  <div className="bg-white/95 border border-slate-200 rounded-2xl p-3 sm:p-4 shadow-xs">
                    <p className="text-[11px] sm:text-xs font-bold text-slate-500 uppercase tracking-wider">Contacted</p>
                    <p className="text-2xl font-extrabold text-emerald-600 mt-1">
                      {data?.followUpSummary?.contactedCount ?? 0}
                    </p>
                  </div>
                  <div className="bg-white/95 border border-slate-200 rounded-2xl p-3 sm:p-4 shadow-xs">
                    <p className="text-[11px] sm:text-xs font-bold text-slate-500 uppercase tracking-wider">Escalated</p>
                    <p className="text-2xl font-extrabold text-rose-600 mt-1">
                      {data?.followUpSummary?.escalatedCount ?? 0}
                    </p>
                  </div>
                </div>

                {/* Recent Follow-Up Outcomes */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                      <span>Recent Follow-Up Outcomes ({data?.followUpSummary?.totalResultsCount ?? 0} total)</span>
                    </h2>
                  </div>

                  {!data?.followUpSummary?.recentResults?.length ? (
                    <div className="bg-white/90 border border-slate-200 rounded-3xl p-8 text-center space-y-1">
                      <HeartHandshake className="w-8 h-8 text-slate-300 mx-auto" />
                      <p className="text-sm font-semibold text-slate-700">No follow-up outcomes logged yet.</p>
                      <p className="text-xs text-slate-500">
                        Outcomes logged by the Follow-Up team will appear here automatically.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-2.5">
                      {data.followUpSummary.recentResults.map((res) => {
                        const cleanPhone = (res.phone || '').replace(/\D/g, '');
                        const intlPhone = cleanPhone.startsWith('0') ? `234${cleanPhone.slice(1)}` : cleanPhone;
                        const isAttention =
                          res.outcome.toLowerCase().includes('prayer') ||
                          res.outcome.toLowerCase().includes('visit') ||
                          res.outcome.toLowerCase().includes('attention');

                        return (
                          <div
                            key={res.id}
                            className="bg-white/95 border border-slate-200 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs"
                          >
                            <div className="space-y-1.5 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-sm font-bold text-slate-900">{res.personName}</span>
                                <span
                                  className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full border ${
                                    isAttention
                                      ? 'bg-amber-50 text-amber-800 border-amber-200'
                                      : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                  }`}
                                >
                                  {res.outcome}
                                </span>
                                <span className="text-xs text-slate-500 font-medium">
                                  Week {res.weekNumber} &bull; Caller: <strong className="text-slate-700">{res.callerName}</strong>
                                </span>
                              </div>
                              {res.note && (
                                <p className="text-xs text-slate-600 bg-slate-50 border border-slate-100 rounded-lg px-2.5 py-1.5 leading-relaxed">
                                  {res.note}
                                </p>
                              )}
                              <p className="text-xs text-slate-400 font-mono">{res.createdAtFormatted}</p>
                            </div>

                            {cleanPhone.length >= 7 && (
                              <div className="flex items-center gap-2 shrink-0">
                                <a
                                  href={`https://wa.me/${intlPhone}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="min-h-[44px] flex-1 sm:flex-initial text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-3.5 py-2 rounded-xl shadow-xs transition-colors flex items-center justify-center gap-1.5 active:scale-[0.97]"
                                >
                                  <MessageCircle className="w-3.5 h-3.5 shrink-0" />
                                  <span>WhatsApp</span>
                                </a>
                                <a
                                  href={`tel:${res.phone}`}
                                  className="min-h-[44px] flex-1 sm:flex-initial text-xs bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold px-3.5 py-2 rounded-xl border border-slate-200 transition-colors flex items-center justify-center gap-1.5 active:scale-[0.97]"
                                >
                                  <Phone className="w-3.5 h-3.5 shrink-0" />
                                  <span>Call</span>
                                </a>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Active & Escalated Tasks */}
                <div className="space-y-3">
                  <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                    <span>Open &amp; Escalated Follow-Up Tasks ({data?.followUpSummary?.activeTasks?.length ?? 0})</span>
                  </h2>

                  {!data?.followUpSummary?.activeTasks?.length ? (
                    <div className="bg-white/90 border border-slate-200 rounded-3xl p-6 text-center text-xs text-slate-500">
                      No open or escalated follow-up tasks.
                    </div>
                  ) : (
                    <>
                      {/* Mobile Cards (< sm) */}
                      <div className="block sm:hidden space-y-2.5">
                        {data.followUpSummary.activeTasks.map((task) => (
                          <div
                            key={task.id}
                            className="bg-white/95 border border-slate-200 rounded-2xl p-4 shadow-xs space-y-2"
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <p className="text-sm font-bold text-slate-900 truncate">{task.personName}</p>
                                <p className="text-xs text-slate-500 font-mono">{task.phone}</p>
                              </div>
                              <span
                                className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold border shrink-0 ${
                                  task.status === 'ESCALATED'
                                    ? 'bg-rose-50 text-rose-700 border-rose-200'
                                    : 'bg-amber-50 text-amber-700 border-amber-200'
                                }`}
                              >
                                {task.status}
                              </span>
                            </div>
                            <p className="text-xs text-slate-700 font-medium">{task.reason.replace(/_/g, ' ')}</p>
                            <p className="text-xs font-mono text-slate-600">
                              Due: {task.dueDateFormatted}
                              {task.isOverdue && (
                                <span className="ml-2 text-xs font-bold text-rose-600">Overdue</span>
                              )}
                            </p>
                          </div>
                        ))}
                      </div>

                      {/* Desktop Table (sm+) */}
                      <div className="hidden sm:block bg-white/95 border border-slate-200 rounded-3xl overflow-hidden shadow-xs">
                        <div className="overflow-x-auto max-h-80">
                          <table className="w-full text-left text-xs">
                            <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase tracking-wider font-bold">
                              <tr>
                                <th className="p-3">Member</th>
                                <th className="p-3">Reason</th>
                                <th className="p-3">Status</th>
                                <th className="p-3">Due</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                              {data.followUpSummary.activeTasks.map((task) => (
                                <tr key={task.id} className="hover:bg-slate-50/80">
                                  <td className="p-3 font-bold text-slate-900">
                                    {task.personName}
                                    <span className="block text-[11px] font-normal text-slate-500">{task.phone}</span>
                                  </td>
                                  <td className="p-3 text-slate-700 font-medium">{task.reason.replace(/_/g, ' ')}</td>
                                  <td className="p-3">
                                    <span
                                      className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                                        task.status === 'ESCALATED'
                                          ? 'bg-rose-50 text-rose-700 border-rose-200'
                                          : 'bg-amber-50 text-amber-700 border-amber-200'
                                      }`}
                                    >
                                      {task.status}
                                    </span>
                                  </td>
                                  <td className="p-3 font-mono text-slate-600">
                                    {task.dueDateFormatted}
                                    {task.isOverdue && (
                                      <span className="ml-1.5 text-[10px] font-bold text-rose-600">Overdue</span>
                                    )}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}

            {/* TAB 5: UPCOMING BIRTHDAYS */}
            {activeTab === 'BIRTHDAYS' && (
              <div className="space-y-5">
                <div className="grid grid-cols-3 gap-2 sm:gap-3">
                  <div className="bg-white/95 border border-slate-200 rounded-2xl p-3 sm:p-4 shadow-xs">
                    <p className="text-[11px] sm:text-xs font-bold text-slate-500 uppercase tracking-wider">Today</p>
                    <p className="text-2xl font-extrabold text-emerald-600 mt-1">
                      {data?.upcomingBirthdays?.todayCount ?? 0}
                    </p>
                  </div>
                  <div className="bg-white/95 border border-slate-200 rounded-2xl p-3 sm:p-4 shadow-xs">
                    <p className="text-[11px] sm:text-xs font-bold text-slate-500 uppercase tracking-wider">Tomorrow</p>
                    <p className="text-2xl font-extrabold text-amber-600 mt-1">
                      {data?.upcomingBirthdays?.tomorrowCount ?? 0}
                    </p>
                  </div>
                  <div className="bg-white/95 border border-slate-200 rounded-2xl p-3 sm:p-4 shadow-xs">
                    <p className="text-[11px] sm:text-xs font-bold text-slate-500 uppercase tracking-wider">Next 7 Days</p>
                    <p className="text-2xl font-extrabold text-blue-600 mt-1">
                      {data?.upcomingBirthdays?.next7DaysCount ?? 0}
                    </p>
                  </div>
                </div>

                {!data?.upcomingBirthdays?.celebrants?.length ? (
                  <div className="bg-white/90 border border-slate-200 rounded-3xl p-8 text-center space-y-1">
                    <Cake className="w-8 h-8 text-slate-300 mx-auto" />
                    <p className="text-sm font-semibold text-slate-700">No upcoming birthdays found.</p>
                    <p className="text-xs text-slate-500">
                      Import members with birth dates via Excel/Word to populate the birthday calendar.
                    </p>
                  </div>
                ) : (
                  <>
                    {/* Mobile Cards (< sm) */}
                    <div className="block sm:hidden space-y-2.5">
                      {data.upcomingBirthdays.celebrants.map((c) => {
                        const cleanPhone = (c.phone || '').replace(/\D/g, '');
                        const intlPhone = cleanPhone.startsWith('0') ? `234${cleanPhone.slice(1)}` : cleanPhone;
                        const msg = encodeURIComponent(
                          `Happy Birthday ${c.fullName}! Wishing you God's abundant grace and joy from RCCG Jesus Covenant Zone!`
                        );

                        return (
                          <div
                            key={c.personId}
                            className="bg-white/95 border border-slate-200 rounded-2xl p-4 shadow-xs space-y-3"
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <p className="text-sm font-bold text-slate-900 truncate">{c.fullName}</p>
                                <p className="text-xs font-semibold text-slate-700 mt-0.5">
                                  {c.birthDateFormatted}
                                  {c.phone && (
                                    <span className="font-mono text-slate-500 font-normal"> &bull; {c.phone}</span>
                                  )}
                                </p>
                              </div>
                              {c.isToday ? (
                                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 shrink-0">
                                  Today
                                </span>
                              ) : c.isTomorrow ? (
                                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-50 text-amber-800 border border-amber-200 shrink-0">
                                  Tomorrow
                                </span>
                              ) : (
                                <span className="text-xs text-slate-500 font-medium shrink-0">In {c.daysUntil} days</span>
                              )}
                            </div>

                            {cleanPhone.length >= 7 && (
                              <div className="flex items-center gap-2">
                                <a
                                  href={`https://wa.me/${intlPhone}?text=${msg}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="min-h-[44px] flex-1 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center justify-center gap-1.5 active:scale-[0.97]"
                                >
                                  <MessageCircle className="w-3.5 h-3.5 shrink-0" />
                                  <span>WhatsApp</span>
                                </a>
                                <a
                                  href={`tel:${c.phone}`}
                                  className="min-h-[44px] flex-1 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 font-bold text-xs flex items-center justify-center gap-1.5 active:scale-[0.97]"
                                >
                                  <Phone className="w-3.5 h-3.5 shrink-0" />
                                  <span>Call</span>
                                </a>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>

                    {/* Desktop Table (sm+) */}
                    <div className="hidden sm:block bg-white/95 border border-slate-200 rounded-3xl overflow-hidden shadow-xs">
                      <div className="overflow-x-auto max-h-[28rem]">
                        <table className="w-full text-left text-xs">
                          <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase tracking-wider font-bold sticky top-0">
                            <tr>
                              <th className="p-3.5">Name</th>
                              <th className="p-3.5">Birthday</th>
                              <th className="p-3.5">When</th>
                              <th className="p-3.5">Phone</th>
                              <th className="p-3.5 text-right">Reach Out</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {data.upcomingBirthdays.celebrants.map((c) => {
                              const cleanPhone = (c.phone || '').replace(/\D/g, '');
                              const intlPhone = cleanPhone.startsWith('0') ? `234${cleanPhone.slice(1)}` : cleanPhone;
                              const msg = encodeURIComponent(
                                `Happy Birthday ${c.fullName}! Wishing you God's abundant grace and joy from RCCG Jesus Covenant Zone!`
                              );

                              return (
                                <tr key={c.personId} className="hover:bg-slate-50/80 transition-colors">
                                  <td className="p-3.5 font-bold text-slate-900">{c.fullName}</td>
                                  <td className="p-3.5 font-semibold text-slate-700">{c.birthDateFormatted}</td>
                                  <td className="p-3.5">
                                    {c.isToday ? (
                                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                        Today
                                      </span>
                                    ) : c.isTomorrow ? (
                                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200">
                                        Tomorrow
                                      </span>
                                    ) : (
                                      <span className="text-slate-500 font-medium">In {c.daysUntil} days</span>
                                    )}
                                  </td>
                                  <td className="p-3.5 font-mono text-slate-600">{c.phone}</td>
                                  <td className="p-3.5 text-right">
                                    {cleanPhone.length >= 7 ? (
                                      <div className="inline-flex items-center gap-1.5">
                                        <a
                                          href={`https://wa.me/${intlPhone}?text=${msg}`}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[11px] inline-flex items-center gap-1 active:scale-[0.97]"
                                        >
                                          <MessageCircle className="w-3 h-3" />
                                          <span>WhatsApp</span>
                                        </a>
                                        <a
                                          href={`tel:${c.phone}`}
                                          className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 font-bold text-[11px] inline-flex items-center gap-1 active:scale-[0.97]"
                                        >
                                          <Phone className="w-3 h-3" />
                                          <span>Call</span>
                                        </a>
                                      </div>
                                    ) : (
                                      <span className="text-slate-400">—</span>
                                    )}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* TAB 6: HISTORICAL ATTENDANCE TREND */}
            {activeTab === 'TREND' && data?.trendHistory && (
              <div className="space-y-3">
                <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-blue-600" />
                  <span>Sunday-by-Sunday Attendance Trend</span>
                </h2>

                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                  {data.trendHistory.map((item) => (
                    <div
                      key={item.dateKey}
                      className="bg-white/95 backdrop-blur-md border border-slate-200 rounded-2xl p-4 shadow-xs text-center space-y-1"
                    >
                      <p className="text-xs text-slate-500 font-semibold">{item.formattedDate}</p>
                      <div className="text-2xl font-extrabold text-blue-600">{item.count}</div>
                      <p className="text-[10px] text-slate-400 font-bold uppercase">Attendees</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
