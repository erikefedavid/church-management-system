'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import {
  Users,
  UserPlus,
  Briefcase,
  Sparkles,
  Smartphone,
  RefreshCw,
  Download,
  Phone,
  MessageCircle,
  Clock,
  Shield,
  Lock,
  Calendar,
  TrendingUp,
  FileSpreadsheet,
} from 'lucide-react';
import {
  getAdminScorecardAction,
  AdminScorecardResponse,
  AdminTimeRange,
} from '../actions/admin';
import Toast from '../components/Toast';
import CustomDropdown from '../components/CustomDropdown';
import ExportExcelModal from '../components/ExportExcelModal';
import ManageServicesModal from '../components/ManageServicesModal';
import AmbientBackground from '../components/AmbientBackground';

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
  const [activeTab, setActiveTab] = useState<'SERVICES' | 'FIRST_TIMERS' | 'ROLL_CALL' | 'TREND'>('SERVICES');

  // Export Modal state
  const [showExportModal, setShowExportModal] = useState(false);

  // Manage Services Modal state
  const [showServicesModal, setShowServicesModal] = useState(false);

  // Toast Notification state
  const [toast, setToast] = useState<{
    type: 'success' | 'error' | 'info';
    message: string;
    title?: string;
  } | null>(null);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const auth = sessionStorage.getItem('rccg_admin_auth');
      if (auth === 'true') {
        setIsAuthenticated(true);
        loadScorecard('TODAY');
        return;
      }
    }
    setLoading(false);
  }, []);

  async function loadScorecard(range: AdminTimeRange = timeRange) {
    setRefreshing(true);
    const res = await getAdminScorecardAction(range);
    if (res.success) {
      setData(res);
    } else {
      setToast({
        type: 'error',
        title: 'Error Loading Data',
        message: res.error || 'Failed to load attendance metrics.',
      });
    }
    setLoading(false);
    setRefreshing(false);
  }

  function handleTimeRangeChange(newRange: AdminTimeRange) {
    setTimeRange(newRange);
    loadScorecard(newRange);
  }

  function handlePinSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (pinInput === '1234' || pinInput === '7777') {
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
            <h1 className="text-lg font-bold text-slate-900">Leadership Access</h1>
            <p className="text-xs text-slate-500 font-medium">Enter your 4-digit Pastor / Admin PIN</p>
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
              className="w-full py-3.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm rounded-xl shadow-xs transition-colors cursor-pointer flex items-center justify-center gap-2"
            >
              <Lock className="w-4 h-4" />
              <span>Unlock Scorecard</span>
            </button>
          </form>

          <Link
            href="/"
            className="text-xs text-slate-500 hover:text-blue-600 transition-colors block cursor-pointer font-medium"
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
        onClose={() => setShowExportModal(false)}
        records={data?.recentAttendanceRecords || []}
        counts={{
          total: data?.totalUniqueAttendees || data?.recentAttendanceRecords?.length || 0,
          workers: data?.categoryBreakdown?.totalWorkers || 0,
          youth: data?.categoryBreakdown?.totalYouth || 0,
          firstTimers: data?.totalFirstTimers || 0,
        }}
        timeframeLabel={data?.timeRangeLabel || 'Selected Timeframe'}
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

      {/* Top Header */}
      <header className="border-b border-slate-200/80 bg-white/90 backdrop-blur-md sticky top-0 z-30 px-4 py-3 shadow-xs">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="relative w-11 h-11 shrink-0">
              <Image src="/rccg-logo.png" alt="RCCG" fill className="object-contain" priority />
            </div>
            <div>
              <h1 className="text-base font-bold text-slate-900 leading-tight">
                RCCG Jesus Covenant Zone
              </h1>
              <p className="text-xs text-blue-700 font-semibold flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5" />
                <span>{data?.todayDateString || 'Sunday Attendance Scorecard'}</span>
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Styled Custom Timeframe Dropdown */}
            <div className="w-44">
              <CustomDropdown
                value={timeRange}
                onChange={(val) => handleTimeRangeChange(val as AdminTimeRange)}
                options={timeRangeOptions}
                leadingIcon={<Calendar className="w-3.5 h-3.5 text-blue-600" />}
              />
            </div>

            <button
              type="button"
              onClick={() => setShowServicesModal(true)}
              className="text-xs bg-slate-100 hover:bg-slate-200 text-slate-700 px-3 py-2 rounded-xl border border-slate-200 font-bold transition-colors flex items-center gap-1.5 cursor-pointer"
              title="Edit church service start and end hours"
            >
              <Clock className="w-3.5 h-3.5 text-blue-600" />
              <span>Service Times</span>
            </button>

            <button
              type="button"
              onClick={() => loadScorecard(timeRange)}
              disabled={refreshing}
              className="text-xs bg-slate-100 hover:bg-slate-200 text-slate-700 px-3 py-2 rounded-xl border border-slate-200 font-bold transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
              <span>Refresh</span>
            </button>

            {/* Export Excel / CSV Button */}
            <button
              type="button"
              onClick={() => setShowExportModal(true)}
              className="text-xs bg-blue-600 hover:bg-blue-700 text-white px-3.5 py-2 rounded-xl font-bold shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span>Download Excel</span>
            </button>

            <Link
              href="/usher"
              className="text-xs bg-slate-100 hover:bg-slate-200 text-slate-700 px-3 py-2 rounded-xl border border-slate-200 font-bold transition-colors cursor-pointer"
            >
              Usher Desk
            </Link>
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
              <p className="text-xs text-slate-400 font-medium">
                Showing data from live PostgreSQL database
              </p>
            </div>

            {/* 4 Executive Metric Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
              {/* Metric 1: Total Attendees */}
              <div className="bg-white/90 backdrop-blur-md border border-slate-200 rounded-3xl p-5 shadow-xs space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                    Total Present
                  </span>
                  <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
                    <Users className="w-5 h-5" />
                  </div>
                </div>
                <div className="text-3xl sm:text-4xl font-extrabold text-slate-900">
                  {data?.totalUniqueAttendees || 0}
                </div>
                <p className="text-[11px] text-slate-500 font-medium">Unique attendees in this timeframe</p>
              </div>

              {/* Metric 2: Workers */}
              <div className="bg-white/90 backdrop-blur-md border border-slate-200 rounded-3xl p-5 shadow-xs space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                    Workers
                  </span>
                  <div className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
                    <Briefcase className="w-5 h-5" />
                  </div>
                </div>
                <div className="text-3xl sm:text-4xl font-extrabold text-indigo-600">
                  {data?.categoryBreakdown?.totalWorkers || 0}
                </div>
                <p className="text-[11px] text-slate-500 font-medium">Ministers & church workers</p>
              </div>

              {/* Metric 3: Youth */}
              <div className="bg-white/90 backdrop-blur-md border border-slate-200 rounded-3xl p-5 shadow-xs space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                    Youth
                  </span>
                  <div className="w-9 h-9 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
                    <Sparkles className="w-5 h-5" />
                  </div>
                </div>
                <div className="text-3xl sm:text-4xl font-extrabold text-amber-600">
                  {data?.categoryBreakdown?.totalYouth || 0}
                </div>
                <p className="text-[11px] text-slate-500 font-medium">Youth class & young adults</p>
              </div>

              {/* Metric 4: First-Timers */}
              <div className="bg-white/90 backdrop-blur-md border border-slate-200 rounded-3xl p-5 shadow-xs space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                    First-Timers
                  </span>
                  <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
                    <UserPlus className="w-5 h-5" />
                  </div>
                </div>
                <div className="text-3xl sm:text-4xl font-extrabold text-emerald-600">
                  {data?.totalFirstTimers || 0}
                </div>
                <p className="text-[11px] text-slate-500 font-medium">New souls registered</p>
              </div>
            </div>

            {/* Navigation Tabs */}
            <div className="flex rounded-2xl bg-slate-100 p-1.5 border border-slate-200 max-w-lg">
              <button
                type="button"
                onClick={() => setActiveTab('SERVICES')}
                className={`flex-1 py-2 text-xs font-bold rounded-xl transition-all cursor-pointer ${
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
                className={`flex-1 py-2 text-xs font-bold rounded-xl transition-all cursor-pointer ${
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
                className={`flex-1 py-2 text-xs font-bold rounded-xl transition-all cursor-pointer ${
                  activeTab === 'ROLL_CALL'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Full Roll ({data?.recentAttendanceRecords?.length || 0})
              </button>
              {data?.trendHistory && data.trendHistory.length > 1 && (
                <button
                  type="button"
                  onClick={() => setActiveTab('TREND')}
                  className={`flex-1 py-2 text-xs font-bold rounded-xl transition-all cursor-pointer ${
                    activeTab === 'TREND'
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Trend ({data.trendHistory.length})
                </button>
              )}
            </div>

            {/* TAB 1: SERVICE BREAKDOWN */}
            {activeTab === 'SERVICES' && (
              <div className="space-y-3">
                <h2 className="text-sm font-bold text-slate-900">Service Breakdown</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                  {data?.servicesBreakdown?.map((svc) => (
                    <div
                      key={svc.id}
                      className="bg-white/95 backdrop-blur-md border border-slate-200 rounded-3xl p-5 shadow-xs space-y-3"
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <h3 className="text-base font-bold text-slate-900">{svc.name}</h3>
                          <p className="text-xs text-slate-500 font-mono font-medium">
                            {svc.startTime} - {svc.endTime}
                          </p>
                        </div>
                        <div className="text-right">
                          <span className="text-2xl font-extrabold text-blue-600">{svc.totalPresent}</span>
                          <p className="text-[10px] text-slate-400 font-bold uppercase">Present</p>
                        </div>
                      </div>

                      {svc.hasSubClasses && (
                        <div className="pt-2 border-t border-slate-100 flex items-center gap-3">
                          <span className="text-xs bg-blue-50 text-blue-800 border border-blue-200 px-3 py-1 rounded-lg font-bold">
                            Adult Class: {svc.adultCount}
                          </span>
                          <span className="text-xs bg-indigo-50 text-indigo-800 border border-indigo-200 px-3 py-1 rounded-lg font-bold">
                            Youth Class: {svc.youthCount}
                          </span>
                        </div>
                      )}
                    </div>
                  ))}
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
                  <span className="text-xs text-slate-500 font-medium">1-Tap Pastoral Outreach</span>
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
                          <div>
                            <div className="flex items-center gap-2">
                              <h3 className="text-base font-bold text-slate-900">
                                {ft.firstName} {ft.lastName}
                              </h3>
                              <span className="text-[10px] bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded-full font-bold">
                                First-Timer
                              </span>
                              <span className="text-[10px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full font-medium">
                                {ft.category}
                              </span>
                            </div>
                            <p className="text-xs text-slate-500 mt-1">
                              Phone: <strong className="text-slate-800">{ft.phone}</strong> • Recorded on{' '}
                              <span className="text-blue-700 font-semibold">{ft.timeString}</span> during{' '}
                              <span className="text-slate-700">{ft.serviceName}</span>
                            </p>
                          </div>

                          {/* Quick 1-Tap Pastoral Action Buttons */}
                          <div className="flex items-center gap-2 shrink-0">
                            <a
                              href={`https://wa.me/${intlPhone}?text=${welcomeMsg}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-3 py-2 rounded-xl shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer"
                            >
                              <MessageCircle className="w-3.5 h-3.5" />
                              <span>WhatsApp</span>
                            </a>

                            <a
                              href={`tel:${ft.phone}`}
                              className="text-xs bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold px-3 py-2 rounded-xl border border-slate-200 transition-colors flex items-center gap-1.5 cursor-pointer"
                            >
                              <Phone className="w-3.5 h-3.5" />
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
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-bold text-slate-900">
                    Attendance Log ({data?.recentAttendanceRecords?.length || 0} Records)
                  </h2>
                  <button
                    type="button"
                    onClick={() => setShowExportModal(true)}
                    className="text-xs text-blue-600 hover:underline font-bold cursor-pointer flex items-center gap-1"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Download Excel</span>
                  </button>
                </div>

                {data?.recentAttendanceRecords?.length === 0 ? (
                  <div className="bg-white/90 backdrop-blur-md border border-slate-200 rounded-3xl p-10 text-center">
                    <p className="text-sm font-semibold text-slate-700">No records found for this timeframe.</p>
                  </div>
                ) : (
                  <div className="bg-white/95 backdrop-blur-md border border-slate-200 rounded-3xl overflow-hidden shadow-xs">
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
                                  {r.person?.category}
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
                )}
              </div>
            )}

            {/* TAB 4: HISTORICAL ATTENDANCE TREND */}
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
