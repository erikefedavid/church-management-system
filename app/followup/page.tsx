'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import {
  Phone,
  MessageCircle,
  Users,
  UserPlus,
  AlertTriangle,
  HeartHandshake,
  CheckCircle2,
  Clock,
  Send,
  Sparkles,
  RefreshCw,
  Search,
  ChevronRight,
  ShieldAlert,
  Calendar,
  Layers,
  ArrowRight,
  Share2,
} from 'lucide-react';
import {
  getFollowUpOverviewAction,
  getMembersForFollowUpAction,
  logFollowUpResultAction,
  sendFollowUpBroadcastAction,
  FollowUpOverviewData,
  FollowUpPerson,
  FollowUpOutcome,
  FollowUpListType,
  MessageTemplateType,
  DispatchItem,
} from '../actions/followup';
import Toast from '../components/Toast';
import AmbientBackground from '../components/AmbientBackground';

export default function FollowUpDeskPage() {
  const [mounted, setMounted] = useState(false);
  const [currentWeekLabel, setCurrentWeekLabel] = useState('');
  const [loading, setLoading] = useState(true);
  const [overview, setOverview] = useState<FollowUpOverviewData | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  // Authentication Gate
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState(false);

  // Active Main Tab
  const [activeTab, setActiveTab] = useState<'CALL_DESK' | 'MESSAGING' | 'ALERTS'>('CALL_DESK');

  // Call Desk Filter States
  const [listType, setListType] = useState<FollowUpListType>('FIRST_TIMERS');
  const [selectedGroupId, setSelectedGroupId] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');
  const [members, setMembers] = useState<FollowUpPerson[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(false);

  // Volunteer Caller Identity
  const [callerName, setCallerName] = useState('');

  // Call Logging State per Member Card
  const [activeLoggingPersonId, setActiveLoggingPersonId] = useState<string | null>(null);
  const [selectedOutcome, setSelectedOutcome] = useState<FollowUpOutcome>('DOING_WELL');
  const [callNote, setCallNote] = useState('');
  const [isSubmittingLog, setIsSubmittingLog] = useState(false);

  // Automated Messaging States
  const [selectedTemplate, setSelectedTemplate] = useState<MessageTemplateType>('FIRST_TIMER_WELCOME');
  const [customMessageBody, setCustomMessageBody] = useState('');
  const [selectedRecipientIds, setSelectedRecipientIds] = useState<string[]>([]);
  const [isDispatching, setIsDispatching] = useState(false);
  const [dispatchResults, setDispatchResults] = useState<DispatchItem[] | null>(null);
  const [isDryRunResult, setIsDryRunResult] = useState(false);

  // Toast feedback
  const [toast, setToast] = useState<{
    type: 'success' | 'error' | 'info';
    title?: string;
    message: string;
  } | null>(null);

  // Check existing session on client mount
  useEffect(() => {
    setMounted(true);
    setCurrentWeekLabel(new Date().toLocaleDateString('en-GB', { month: 'short', day: 'numeric' }));
    if (typeof window !== 'undefined') {
      const savedAuth = sessionStorage.getItem('rccg_admin_auth');
      const savedCaller = localStorage.getItem('rccg_caller_name');
      if (savedCaller) setCallerName(savedCaller);
      if (savedAuth === 'true') {
        setIsAuthenticated(true);
        loadOverview();
      } else {
        setLoading(false);
      }
    }
  }, []);

  async function loadOverview() {
    setLoading(true);
    try {
      const data = await getFollowUpOverviewAction();
      setOverview(data);
      if (data.groups.length > 0 && !selectedGroupId) {
        setSelectedGroupId(data.groups[0].id);
      }
    } catch (e) {
      console.error(e);
      setToast({ type: 'error', message: 'Failed to load follow-up metrics.' });
    } finally {
      setLoading(false);
    }
  }

  // Reload members whenever list filter, group, or search changes
  useEffect(() => {
    if (!isAuthenticated) return;
    loadMembersQueue();
  }, [listType, selectedGroupId, isAuthenticated]);

  async function loadMembersQueue() {
    setLoadingMembers(true);
    try {
      const res = await getMembersForFollowUpAction({
        listType,
        groupId: listType === 'GROUP' ? selectedGroupId : undefined,
        searchQuery,
      });
      if (res.success) {
        setMembers(res.members);
        // Preselect all for messaging tab
        setSelectedRecipientIds(res.members.map((m) => m.id));
      } else {
        setToast({ type: 'error', message: res.error || 'Failed to fetch queue.' });
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingMembers(false);
    }
  }

  function handleSearchSubmit(e: React.FormEvent) {
    e.preventDefault();
    loadMembersQueue();
  }

  // Handle PIN authentication
  function handlePinSubmit(e: React.FormEvent) {
    e.preventDefault();
    const clean = pinInput.trim();
    if (clean === '1234' || clean === '7777' || clean === '4444') {
      setIsAuthenticated(true);
      if (typeof window !== 'undefined') {
        sessionStorage.setItem('rccg_admin_auth', 'true');
      }
      setPinError(false);
      loadOverview();
    } else {
      setPinError(true);
    }
  }

  // Save caller name to localStorage
  function handleCallerNameChange(name: string) {
    setCallerName(name);
    if (typeof window !== 'undefined') {
      localStorage.setItem('rccg_caller_name', name);
    }
  }

  // Submit Call Outcome Log
  async function handleSaveCallLog(personId: string) {
    if (!callerName.trim()) {
      setToast({
        type: 'error',
        title: 'Caller Name Required',
        message: 'Please enter your name at the top of the desk before logging calls.',
      });
      return;
    }

    setIsSubmittingLog(true);
    try {
      const res = await logFollowUpResultAction({
        personId,
        callerName,
        outcome: selectedOutcome,
        note: callNote,
      });

      if (res.success) {
        setToast({
          type: 'success',
          title: 'Call Recorded',
          message: res.message || 'Call result logged successfully!',
        });
        setActiveLoggingPersonId(null);
        setCallNote('');
        setSelectedOutcome('DOING_WELL');
        // Refresh overview and members
        loadOverview();
        loadMembersQueue();
      } else {
        setToast({ type: 'error', message: res.error || 'Failed to record call.' });
      }
    } catch (err) {
      console.error(err);
      setToast({ type: 'error', message: 'Network error while recording call.' });
    } finally {
      setIsSubmittingLog(false);
    }
  }

  // Dispatch / Simulate Automated Messaging Broadcast
  async function handleBroadcastDispatch(isDryRun: boolean) {
    if (selectedRecipientIds.length === 0) {
      setToast({
        type: 'error',
        title: 'No Recipients Selected',
        message: 'Please select at least one recipient to receive this message.',
      });
      return;
    }

    setIsDispatching(true);
    try {
      const res = await sendFollowUpBroadcastAction({
        recipientIds: selectedRecipientIds,
        templateType: selectedTemplate,
        customBody: customMessageBody,
        isDryRun,
      });

      if (res.success) {
        setDispatchResults(res.dispatches);
        setIsDryRunResult(res.isDryRun);
        setToast({
          type: 'success',
          title: isDryRun ? 'Simulation Complete (Dry-Run)' : 'Broadcast Dispatches Ready',
          message: isDryRun
            ? `Simulated automated messages for ${res.count} members with zero risk!`
            : `Generated 1-click WhatsApp launchers for ${res.count} members!`,
        });
      } else {
        setToast({ type: 'error', message: res.error || 'Broadcast failed.' });
      }
    } catch (e) {
      console.error(e);
      setToast({ type: 'error', message: 'Failed to process broadcast.' });
    } finally {
      setIsDispatching(false);
    }
  }

  // 1. SSR / Hydration Gate
  if (!mounted) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4 relative overflow-hidden">
        <AmbientBackground />
        <div className="relative z-10 text-center space-y-3">
          <div className="w-10 h-10 border-3 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
          <p className="text-xs text-slate-500 font-medium">Opening Follow-Up Care Desk...</p>
        </div>
      </div>
    );
  }

  // 2. PIN Gate: Prompt for Leadership / Caller PIN
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4 relative overflow-hidden">
        <AmbientBackground />

        <div className="relative z-10 bg-white/95 backdrop-blur-md border border-slate-200/80 rounded-3xl p-8 max-w-sm w-full shadow-xl space-y-6 text-center">
          <div className="relative w-16 h-16 mx-auto">
            <Image src="/rccg-logo.png" alt="RCCG" fill sizes="64px" className="object-contain" priority />
          </div>

          <div className="space-y-1">
            <h1 className="text-lg font-bold text-slate-900">Follow-Up & Care Desk</h1>
            <p className="text-xs text-slate-500 font-medium">Enter Caller or Admin PIN (e.g. 7777 or 4444)</p>
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
                className={`w-full text-center tracking-[0.5em] text-2xl font-bold py-3.5 px-4 bg-slate-50 border ${
                  pinError ? 'border-red-500 bg-red-50/50' : 'border-slate-300 focus:border-blue-600'
                } rounded-2xl outline-none transition-all text-slate-900`}
              />
              {pinError && <p className="text-xs text-red-600 font-medium mt-1.5">Incorrect PIN. Try 7777 or 4444.</p>}
            </div>

            <button
              type="submit"
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-2xl transition-all shadow-md text-sm cursor-pointer"
            >
              Access Care Desk
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
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col relative overflow-hidden font-sans">
      <AmbientBackground />

      {/* Toast Feedback */}
      {toast && (
        <Toast
          type={toast.type}
          title={toast.title}
          message={toast.message}
          onClose={() => setToast(null)}
        />
      )}

      {/* Top Navigation Bar */}
      <header className="sticky top-0 z-30 bg-white/90 backdrop-blur-md border-b border-slate-200/80 px-4 sm:px-6 py-3 shadow-2xs">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-3 w-full md:w-auto justify-between md:justify-start">
            <div className="flex items-center gap-2.5">
              <div className="relative w-8 h-8 shrink-0">
                <Image src="/rccg-logo.png" alt="RCCG" fill sizes="32px" className="object-contain" priority />
              </div>
              <div>
                <h1 className="text-sm sm:text-base font-bold text-slate-900 leading-tight">
                  Follow-Up & Member Care Hub
                </h1>
                <p className="text-[11px] text-blue-700 font-semibold flex items-center gap-1">
                  <span>RCCG Jesus Covenant Zone</span>
                  {currentWeekLabel && (
                    <>
                      <span>•</span>
                      <span>{currentWeekLabel}</span>
                    </>
                  )}
                </p>
              </div>
            </div>

            {/* Quick Link to Admin & Usher */}
            <div className="flex items-center gap-2">
              <Link
                href="/admin"
                className="text-xs font-semibold text-slate-600 hover:text-blue-600 px-2.5 py-1.5 rounded-lg border border-slate-200 bg-slate-50 transition-colors"
              >
                Admin Desk
              </Link>
              <Link
                href="/usher"
                className="text-xs font-semibold text-slate-600 hover:text-blue-600 px-2.5 py-1.5 rounded-lg border border-slate-200 bg-slate-50 transition-colors"
              >
                Usher Portal
              </Link>
            </div>
          </div>

          <div className="flex items-center gap-2.5 w-full md:w-auto justify-end">
            {/* Volunteer Caller Identity Input */}
            <div className="flex items-center gap-1.5 bg-slate-100 border border-slate-200 rounded-xl px-2.5 py-1.5">
              <Phone className="w-3.5 h-3.5 text-blue-600 shrink-0" />
              <input
                type="text"
                placeholder="Your Name (e.g. Sis Deborah)"
                value={callerName}
                onChange={(e) => handleCallerNameChange(e.target.value)}
                className="text-xs text-slate-800 bg-transparent focus:outline-none w-36 sm:w-44 font-medium"
                title="Your name will be logged with every call result"
              />
            </div>

            <button
              type="button"
              onClick={() => {
                setRefreshing(true);
                Promise.all([loadOverview(), loadMembersQueue()]).finally(() => setRefreshing(false));
              }}
              disabled={refreshing}
              className="text-xs bg-slate-100 hover:bg-slate-200 text-slate-700 px-3 py-2 rounded-xl border border-slate-200 font-bold transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">Refresh</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-6xl w-full mx-auto p-4 sm:p-6 space-y-6 relative z-10">
        {/* 4 Interactive KPI Scorecard Pills */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
          {/* 1. First-Timers */}
          <div
            onClick={() => {
              setActiveTab('CALL_DESK');
              setListType('FIRST_TIMERS');
            }}
            className={`p-4 rounded-2xl border transition-all cursor-pointer relative overflow-hidden ${
              listType === 'FIRST_TIMERS' && activeTab === 'CALL_DESK'
                ? 'bg-amber-500/10 border-amber-500 shadow-md ring-2 ring-amber-400/30'
                : 'bg-white/80 border-slate-200 hover:border-amber-400'
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-bold text-amber-700 uppercase tracking-wider flex items-center gap-1">
                <Sparkles className="w-3 h-3 text-amber-600" />
                First-Timers
              </span>
              <span className="text-xs bg-amber-100 text-amber-800 font-bold px-2 py-0.5 rounded-full">VIP</span>
            </div>
            <div className="text-2xl sm:text-3xl font-extrabold text-slate-900">
              {overview?.firstTimersCount ?? '...'}
            </div>
            <p className="text-[11px] text-slate-500 mt-1">Pending welcome call & care</p>
          </div>

          {/* 2. Absent Members */}
          <div
            onClick={() => {
              setActiveTab('CALL_DESK');
              setListType('ABSENT');
            }}
            className={`p-4 rounded-2xl border transition-all cursor-pointer relative overflow-hidden ${
              listType === 'ABSENT' && activeTab === 'CALL_DESK'
                ? 'bg-blue-500/10 border-blue-500 shadow-md ring-2 ring-blue-400/30'
                : 'bg-white/80 border-slate-200 hover:border-blue-400'
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-bold text-blue-700 uppercase tracking-wider flex items-center gap-1">
                <Users className="w-3 h-3 text-blue-600" />
                Absent Members
              </span>
              <span className="text-xs bg-blue-100 text-blue-800 font-bold px-2 py-0.5 rounded-full">Care</span>
            </div>
            <div className="text-2xl sm:text-3xl font-extrabold text-slate-900">
              {overview?.absentCount ?? '...'}
            </div>
            <p className="text-[11px] text-slate-500 mt-1">Missed latest Sunday service</p>
          </div>

          {/* 3. Calling Groups */}
          <div
            onClick={() => {
              setActiveTab('CALL_DESK');
              setListType('GROUP');
            }}
            className={`p-4 rounded-2xl border transition-all cursor-pointer relative overflow-hidden ${
              listType === 'GROUP' && activeTab === 'CALL_DESK'
                ? 'bg-indigo-500/10 border-indigo-500 shadow-md ring-2 ring-indigo-400/30'
                : 'bg-white/80 border-slate-200 hover:border-indigo-400'
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-bold text-indigo-700 uppercase tracking-wider flex items-center gap-1">
                <Layers className="w-3 h-3 text-indigo-600" />
                Calling Groups
              </span>
              <span className="text-xs bg-indigo-100 text-indigo-800 font-bold px-2 py-0.5 rounded-full">Rotate</span>
            </div>
            <div className="text-2xl sm:text-3xl font-extrabold text-slate-900">
              {overview?.groups.length ?? '...'}
            </div>
            <p className="text-[11px] text-slate-500 mt-1">Group A, B, C rotation teams</p>
          </div>

          {/* 4. Pastoral Care Alerts */}
          <div
            onClick={() => {
              setActiveTab('ALERTS');
            }}
            className={`p-4 rounded-2xl border transition-all cursor-pointer relative overflow-hidden ${
              activeTab === 'ALERTS'
                ? 'bg-rose-500/10 border-rose-500 shadow-md ring-2 ring-rose-400/30'
                : 'bg-white/80 border-slate-200 hover:border-rose-400'
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-bold text-rose-700 uppercase tracking-wider flex items-center gap-1">
                <AlertTriangle className="w-3 h-3 text-rose-600 animate-pulse" />
                Care Alerts
              </span>
              <span className="text-xs bg-rose-100 text-rose-800 font-bold px-2 py-0.5 rounded-full">Pastoral</span>
            </div>
            <div className="text-2xl sm:text-3xl font-extrabold text-rose-600">
              {overview?.alertsCount ?? '0'}
            </div>
            <p className="text-[11px] text-slate-500 mt-1">Needs Prayer / Sick / Visit</p>
          </div>
        </div>

        {/* 3 Main Action Tabs */}
        <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
          <button
            type="button"
            onClick={() => setActiveTab('CALL_DESK')}
            className={`px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all flex items-center gap-2 cursor-pointer ${
              activeTab === 'CALL_DESK'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            <Phone className="w-4 h-4" />
            <span>Volunteer Call Desk</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('MESSAGING')}
            className={`px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all flex items-center gap-2 cursor-pointer ${
              activeTab === 'MESSAGING'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            <MessageCircle className="w-4 h-4" />
            <span>Automated Messaging Hub</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('ALERTS')}
            className={`px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all flex items-center gap-2 cursor-pointer ${
              activeTab === 'ALERTS'
                ? 'bg-rose-600 text-white shadow-xs'
                : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            <ShieldAlert className="w-4 h-4" />
            <span>Pastoral Red Alerts</span>
            {overview?.alertsCount ? (
              <span className="bg-white/20 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                {overview.alertsCount}
              </span>
            ) : null}
          </button>
        </div>

        {/* ============================================================ */}
        {/* TAB 1: VOLUNTEER CALL DESK                                    */}
        {/* ============================================================ */}
        {activeTab === 'CALL_DESK' && (
          <div className="space-y-4">
            {/* Filter Pills Bar & Search */}
            <div className="bg-white/80 backdrop-blur-xs border border-slate-200/80 rounded-2xl p-3 sm:p-4 flex flex-col md:flex-row items-center justify-between gap-3 shadow-2xs">
              <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
                <button
                  type="button"
                  onClick={() => setListType('FIRST_TIMERS')}
                  className={`text-xs font-bold px-3 py-1.5 rounded-xl transition-all cursor-pointer ${
                    listType === 'FIRST_TIMERS'
                      ? 'bg-amber-600 text-white shadow-xs'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  🌟 First-Timers ({overview?.firstTimersCount ?? 0})
                </button>

                <button
                  type="button"
                  onClick={() => setListType('ABSENT')}
                  className={`text-xs font-bold px-3 py-1.5 rounded-xl transition-all cursor-pointer ${
                    listType === 'ABSENT'
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  👥 Absent Members ({overview?.absentCount ?? 0})
                </button>

                <button
                  type="button"
                  onClick={() => setListType('GROUP')}
                  className={`text-xs font-bold px-3 py-1.5 rounded-xl transition-all cursor-pointer ${
                    listType === 'GROUP'
                      ? 'bg-indigo-600 text-white shadow-xs'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  📑 By Calling Group
                </button>

                {listType === 'GROUP' && overview?.groups && (
                  <select
                    value={selectedGroupId}
                    onChange={(e) => setSelectedGroupId(e.target.value)}
                    className="text-xs bg-slate-50 border border-slate-300 rounded-xl px-2.5 py-1.5 font-semibold text-slate-800 outline-none focus:border-indigo-600"
                  >
                    {overview.groups.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.name} ({g.memberCount} members)
                      </option>
                    ))}
                  </select>
                )}
              </div>

              {/* Instant Search Bar */}
              <form onSubmit={handleSearchSubmit} className="flex items-center gap-1.5 w-full md:w-64">
                <div className="relative flex-1">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    placeholder="Search name or last 4..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full text-xs pl-8 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-blue-600 text-slate-800"
                  />
                </div>
                <button
                  type="submit"
                  className="bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold px-3 py-2 rounded-xl border border-slate-200 cursor-pointer"
                >
                  Find
                </button>
              </form>
            </div>

            {/* Members Queue Cards List */}
            {loadingMembers ? (
              <div className="text-center py-16 space-y-2">
                <div className="w-8 h-8 border-3 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
                <p className="text-xs text-slate-500 font-medium">Loading members for follow-up...</p>
              </div>
            ) : members.length === 0 ? (
              <div className="text-center py-16 bg-white/70 border border-dashed border-slate-200 rounded-2xl p-6">
                <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto mb-2 opacity-80" />
                <h3 className="text-sm font-bold text-slate-800">All Caught Up!</h3>
                <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                  No members found in this category needing calls. Great job keeping the flock connected!
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                {members.map((person) => {
                  const isLogging = activeLoggingPersonId === person.id;
                  const intlPhone = person.phone.replace(/\D/g, '').startsWith('0')
                    ? `234${person.phone.replace(/\D/g, '').slice(1)}`
                    : person.phone.replace(/\D/g, '');
                  const waGreeting = encodeURIComponent(
                    `Hello ${person.firstName}, warm Christian greetings from RCCG Jesus Covenant Zone! How are you doing today?`
                  );

                  return (
                    <div
                      key={person.id}
                      className={`bg-white/95 border rounded-2xl p-4 transition-all shadow-xs flex flex-col justify-between ${
                        isLogging ? 'border-blue-500 ring-2 ring-blue-500/20' : 'border-slate-200/90 hover:border-slate-300'
                      }`}
                    >
                      <div>
                        {/* Member Card Header */}
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <div>
                            <div className="flex items-center gap-2">
                              <h3 className="text-sm font-bold text-slate-900">
                                {person.firstName} {person.lastName}
                              </h3>
                              {person.status === 'FIRST_TIMER' && (
                                <span className="text-[10px] bg-amber-100 text-amber-800 font-bold px-2 py-0.5 rounded-full">
                                  First-Timer
                                </span>
                              )}
                              {person.category === 'WORKER' && (
                                <span className="text-[10px] bg-blue-100 text-blue-800 font-bold px-2 py-0.5 rounded-full">
                                  Worker
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-slate-500 font-medium flex items-center gap-2 mt-0.5">
                              <span>Phone: {person.phone}</span>
                              <span>•</span>
                              <span>Last 4: {person.phoneLast4}</span>
                            </p>
                          </div>

                          {person.groupName && (
                            <span className="text-[10px] font-semibold bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-lg border border-indigo-200/60">
                              {person.groupName}
                            </span>
                          )}
                        </div>

                        {/* Attendance Metadata */}
                        <div className="flex items-center gap-1.5 text-[11px] text-slate-500 mb-3 bg-slate-50 px-2.5 py-1.5 rounded-xl border border-slate-100">
                          <Calendar className="w-3 h-3 text-slate-400" />
                          <span>Last Attendance:</span>
                          <span className="font-semibold text-slate-700">
                            {person.lastAttendanceFormatted}
                          </span>
                        </div>

                        {/* Recent Notes History (if any) */}
                        {person.recentNotes && person.recentNotes.length > 0 && (
                          <div className="mb-3 space-y-1.5 bg-slate-50/70 p-2.5 rounded-xl border border-slate-100 text-[11px]">
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                              Recent Caller Notes:
                            </span>
                            {person.recentNotes.slice(0, 2).map((n) => (
                              <div key={n.id} className="text-slate-700 flex items-baseline justify-between gap-2">
                                <span>
                                  <strong className="text-slate-900">{n.callerName}:</strong> {n.outcome.replace('_', ' ')}
                                  {n.note ? ` — "${n.note}"` : ''}
                                </span>
                                <span className="text-[10px] text-slate-400 shrink-0">{n.createdAt}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Action Area: Call, WhatsApp, and Log Result */}
                      <div className="space-y-2.5 pt-2 border-t border-slate-100">
                        <div className="flex items-center gap-2">
                          {/* Native Direct Phone Call Link */}
                          <a
                            href={`tel:${person.phone}`}
                            className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold py-2 px-3 rounded-xl transition-colors flex items-center justify-center gap-1.5 shadow-2xs"
                          >
                            <Phone className="w-3.5 h-3.5" />
                            <span>Call</span>
                          </a>

                          {/* Direct WhatsApp Launcher */}
                          <a
                            href={`https://wa.me/${intlPhone}?text=${waGreeting}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 text-xs font-bold py-2 px-3 rounded-xl transition-colors flex items-center justify-center gap-1.5"
                          >
                            <MessageCircle className="w-3.5 h-3.5 text-emerald-600" />
                            <span>WhatsApp</span>
                          </a>

                          {/* Toggle Log Call Box */}
                          <button
                            type="button"
                            onClick={() =>
                              setActiveLoggingPersonId(isLogging ? null : person.id)
                            }
                            className={`text-xs font-bold py-2 px-3 rounded-xl border transition-colors cursor-pointer ${
                              isLogging
                                ? 'bg-slate-900 text-white border-slate-900'
                                : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-200'
                            }`}
                          >
                            {isLogging ? 'Close' : 'Log Call'}
                          </button>
                        </div>

                        {/* Interactive Outcome Drawer */}
                        {isLogging && (
                          <div className="bg-slate-50 border border-blue-200 rounded-xl p-3 space-y-3 animate-in fade-in duration-150">
                            <span className="text-xs font-bold text-slate-900 block">
                              Select Call Outcome for {person.firstName}:
                            </span>

                            {/* Outcome Buttons Grid */}
                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                              {[
                                { key: 'DOING_WELL', label: '🟢 Doing Well' },
                                { key: 'NEEDS_PRAYER', label: '🟡 Needs Prayer ⚠️' },
                                { key: 'SICK', label: '🔴 Ill / Sick 🚨' },
                                { key: 'WANTS_VISIT', label: '🟣 Wants Visit' },
                                { key: 'TRAVELLED', label: '🔵 Travelled' },
                                { key: 'UNREACHABLE', label: '⚪ Unreachable' },
                              ].map((opt) => (
                                <button
                                  key={opt.key}
                                  type="button"
                                  onClick={() => setSelectedOutcome(opt.key as FollowUpOutcome)}
                                  className={`text-[11px] font-bold py-1.5 px-2 rounded-lg border text-left transition-all cursor-pointer ${
                                    selectedOutcome === opt.key
                                      ? 'bg-blue-600 text-white border-blue-600 shadow-2xs'
                                      : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                                  }`}
                                >
                                  {opt.label}
                                </button>
                              ))}
                            </div>

                            {/* Optional Note Field */}
                            <div>
                              <input
                                type="text"
                                placeholder="Short note (e.g. Bro just had baby, praying for work...)"
                                value={callNote}
                                onChange={(e) => setCallNote(e.target.value)}
                                className="w-full text-xs px-3 py-2 bg-white border border-slate-300 rounded-lg outline-none focus:border-blue-600 text-slate-900 font-medium"
                              />
                            </div>

                            <button
                              type="button"
                              onClick={() => handleSaveCallLog(person.id)}
                              disabled={isSubmittingLog}
                              className="w-full bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold py-2 rounded-lg transition-colors shadow-2xs flex items-center justify-center gap-1.5 cursor-pointer"
                            >
                              {isSubmittingLog ? (
                                <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                              ) : (
                                <CheckCircle2 className="w-3.5 h-3.5" />
                              )}
                              <span>Save & Submit Call Record</span>
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ============================================================ */}
        {/* TAB 2: AUTOMATED MESSAGING HUB                               */}
        {/* ============================================================ */}
        {activeTab === 'MESSAGING' && (
          <div className="space-y-6">
            <div className="bg-white/90 border border-slate-200 rounded-2xl p-5 shadow-xs space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
                <div>
                  <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                    <MessageCircle className="w-4 h-4 text-emerald-600" />
                    Automated WhatsApp & SMS Messaging Engine
                  </h2>
                  <p className="text-xs text-slate-500 font-medium">
                    Send personalized midweek check-ins and welcome letters with dynamic member names.
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-slate-600">
                    {selectedRecipientIds.length} recipients selected
                  </span>
                </div>
              </div>

              {/* Template Selection Pills */}
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-700 uppercase tracking-wider block">
                  1. Choose Messaging Template:
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  <button
                    type="button"
                    onClick={() => setSelectedTemplate('FIRST_TIMER_WELCOME')}
                    className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                      selectedTemplate === 'FIRST_TIMER_WELCOME'
                        ? 'bg-amber-500/10 border-amber-500 ring-2 ring-amber-400/20 shadow-xs'
                        : 'bg-white border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    <span className="text-xs font-bold text-amber-800 block flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-amber-600" />
                      First-Timer Welcome
                    </span>
                    <span className="text-[11px] text-slate-500 mt-1 block">
                      Dispatched Monday 9:00 AM to new guests from Sunday.
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setSelectedTemplate('ABSENT_CARE')}
                    className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                      selectedTemplate === 'ABSENT_CARE'
                        ? 'bg-blue-500/10 border-blue-500 ring-2 ring-blue-400/20 shadow-xs'
                        : 'bg-white border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    <span className="text-xs font-bold text-blue-800 block flex items-center gap-1.5">
                      <HeartHandshake className="w-3.5 h-3.5 text-blue-600" />
                      Absent Member Care
                    </span>
                    <span className="text-[11px] text-slate-500 mt-1 block">
                      Midweek welfare check for members who missed Sunday.
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setSelectedTemplate('MIDWEEK_REMINDER')}
                    className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                      selectedTemplate === 'MIDWEEK_REMINDER'
                        ? 'bg-indigo-500/10 border-indigo-500 ring-2 ring-indigo-400/20 shadow-xs'
                        : 'bg-white border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    <span className="text-xs font-bold text-indigo-800 block flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5 text-indigo-600" />
                      Midweek Service Ping
                    </span>
                    <span className="text-[11px] text-slate-500 mt-1 block">
                      Faith Clinic & Digging Deep invitation broadcast.
                    </span>
                  </button>
                </div>
              </div>

              {/* Message Live Preview Box */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700 uppercase tracking-wider block">
                  2. Live Message Preview (with dynamic &#123;FirstName&#125; tag):
                </label>
                <div className="bg-slate-900 text-emerald-300 font-mono text-xs p-4 rounded-xl shadow-inner border border-slate-800 whitespace-pre-wrap leading-relaxed">
                  {selectedTemplate === 'FIRST_TIMER_WELCOME' &&
                    `Good day {FirstName}! 🎉 It was an honour having you worship with us at RCCG Jesus Covenant Zone! We pray God's immense peace and blessings remain upon you and your family this week. If you ever need prayer or guidance, we are always here for you. Have a fruitful week in His presence! 🙏`}
                  {selectedTemplate === 'ABSENT_CARE' &&
                    `Hello {FirstName}, warm Christian greetings from RCCG Jesus Covenant Zone! We missed your presence in church last Sunday and wanted to check in on your welfare. We are standing with you in prayer and look forward to fellowshipping together this coming Sunday. May the Lord strengthen you! ❤️`}
                  {selectedTemplate === 'MIDWEEK_REMINDER' &&
                    `Calvary greetings {FirstName}! Join us this evening for our Faith Clinic / Midweek Service at 6:00 PM. Come with faith to receive a fresh word and divine empowerment from the Lord. See you in church! 🕊️`}
                </div>
              </div>

              {/* Action Buttons: Dry Run Simulation vs 1-Click WhatsApp Generation */}
              <div className="flex flex-col sm:flex-row items-center gap-3 pt-3 border-t border-slate-100">
                {/* Dry Run Button */}
                <button
                  type="button"
                  onClick={() => handleBroadcastDispatch(true)}
                  disabled={isDispatching}
                  className="w-full sm:w-auto bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold px-4 py-3 rounded-xl border border-slate-300 transition-colors flex items-center justify-center gap-2 cursor-pointer shadow-2xs"
                  title="Simulate the broadcast with zero spam"
                >
                  <Sparkles className="w-4 h-4 text-blue-600" />
                  <span>Simulate Test Run (Zero Risk)</span>
                </button>

                {/* Actual Dispatch Launcher */}
                <button
                  type="button"
                  onClick={() => handleBroadcastDispatch(false)}
                  disabled={isDispatching}
                  className="w-full sm:flex-1 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-4 py-3 rounded-xl transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Send className="w-4 h-4" />
                  <span>Generate 1-Click WhatsApp Launcher ({selectedRecipientIds.length} members)</span>
                </button>
              </div>
            </div>

            {/* Dispatch Results Table / Cards */}
            {dispatchResults && (
              <div className="bg-white/95 border border-slate-200 rounded-2xl p-4 sm:p-5 shadow-xs space-y-3 animate-in fade-in">
                <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                  <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    <span>
                      {isDryRunResult ? 'Simulated Message Dispatch Log' : 'Ready-to-Send WhatsApp Launchers'}
                    </span>
                  </h3>
                  <span className="text-xs bg-slate-100 text-slate-700 px-2.5 py-1 rounded-full font-bold">
                    {dispatchResults.length} Items Generated
                  </span>
                </div>

                <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
                  {dispatchResults.map((item, idx) => (
                    <div
                      key={item.personId}
                      className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 bg-slate-50 rounded-xl border border-slate-100 text-xs"
                    >
                      <div>
                        <div className="font-bold text-slate-900 flex items-center gap-2">
                          <span>#{idx + 1} {item.recipientName}</span>
                          <span className="text-[11px] text-slate-400 font-normal">({item.phone})</span>
                        </div>
                        <p className="text-slate-600 line-clamp-1 mt-0.5 italic">"{item.messageText}"</p>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        {isDryRunResult ? (
                          <span className="text-[10px] bg-blue-100 text-blue-800 font-bold px-2 py-1 rounded-lg">
                            Simulated ✓
                          </span>
                        ) : (
                          <a
                            href={item.whatsAppLink}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-3 py-1.5 rounded-lg text-xs flex items-center gap-1.5 transition-colors shadow-2xs"
                          >
                            <MessageCircle className="w-3.5 h-3.5" />
                            <span>Launch WhatsApp</span>
                          </a>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ============================================================ */}
        {/* TAB 3: PASTORAL CARE RED ALERTS & HISTORY                    */}
        {/* ============================================================ */}
        {activeTab === 'ALERTS' && (
          <div className="space-y-4">
            <div className="bg-rose-50 border border-rose-200 rounded-2xl p-4 sm:p-5 flex items-start gap-3">
              <ShieldAlert className="w-6 h-6 text-rose-600 shrink-0 mt-0.5" />
              <div>
                <h3 className="text-sm font-bold text-rose-900">Pastoral Care Alert Center</h3>
                <p className="text-xs text-rose-700 mt-0.5">
                  Any call logged by a volunteer that results in <strong>Needs Prayer</strong>, <strong>Ill / In Hospital</strong>, or <strong>Wants Visit</strong> is escalated here automatically for the Pastor and Pastoral care team.
                </p>
              </div>
            </div>

            {/* List of Recent Emergency / Pastoral Logs */}
            <div className="bg-white/95 border border-slate-200 rounded-2xl p-4 sm:p-5 shadow-xs space-y-3">
              <h3 className="text-sm font-bold text-slate-900 mb-2">Recent Follow-up Activity & Care Records</h3>

              {overview?.recentCalls && overview.recentCalls.length > 0 ? (
                <div className="divide-y divide-slate-100">
                  {overview.recentCalls.map((call) => {
                    const isAlert =
                      call.outcome === 'NEEDS_PRAYER' ||
                      call.outcome === 'SICK' ||
                      call.outcome === 'WANTS_VISIT';

                    return (
                      <div key={call.id} className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-bold text-slate-900">{call.memberName}</span>
                            <span
                              className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                                isAlert
                                  ? 'bg-rose-100 text-rose-800 border border-rose-200'
                                  : 'bg-emerald-100 text-emerald-800'
                              }`}
                            >
                              {call.outcome.replace('_', ' ')}
                            </span>
                          </div>
                          <p className="text-xs text-slate-600">
                            Called by <strong className="text-slate-800">{call.callerName}</strong>
                            {call.note ? ` — Note: "${call.note}"` : ''}
                          </p>
                        </div>

                        <div className="text-[11px] text-slate-400 font-medium shrink-0">
                          {call.date}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-xs text-slate-500 py-6 text-center">
                  No call logs recorded yet. Start calling in the Volunteer Call Desk tab!
                </p>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
