'use client';

import React, { useState, useEffect, useCallback, startTransition, useSyncExternalStore } from 'react';
import Link from 'next/link';
import { CheckCircle2 } from 'lucide-react';
import { motion } from 'framer-motion';
import {
  surfaceEntranceVariants,
} from '@/lib/motion';
import {
  getFollowUpRadarDashboardAction,
  triggerRadarSyncAction,
  RadarMetrics,
  RadarFilterType,
  FollowUpMemberQueueItem,
  MandatedOutcome,
} from '../actions/followup';
import FollowUpHeader from '../components/followup/FollowUpHeader';
import EscalationBanner from '../components/followup/EscalationBanner';
import RadarOverview from '../components/followup/RadarOverview';
import MemberFollowUpCard from '../components/followup/MemberFollowUpCard';
import Toast from '../components/Toast';

const emptySubscribe = () => () => {};

export default function FollowUpDashboardPage() {
  const mounted = useSyncExternalStore(emptySubscribe, () => true, () => false);

  // Volunteer Caller Identity
  const [callerName, setCallerName] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('rccg_caller_name') || '';
    }
    return '';
  });

  // Dashboard Data State
  const [loading, setLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [metrics, setMetrics] = useState<RadarMetrics>({
    missed1WeekCount: 0,
    missed2WeeksCount: 0,
    firstTimers72hCount: 0,
    escalatedCount: 0,
    totalActiveMembers: 0,
    lastUpdatedWat: 'WAT',
  });
  const [members, setMembers] = useState<FollowUpMemberQueueItem[]>([]);

  // Filter & Search State
  const [activeFilter, setActiveFilter] = useState<RadarFilterType>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // Toast Feedback
  const [toast, setToast] = useState<{
    type: 'success' | 'error' | 'info';
    title?: string;
    message: string;
  } | null>(null);

  // 2. Fetch Dashboard Data
  const loadDashboardData = useCallback(async (filter: RadarFilterType, search?: string) => {
    setLoading(true);
    try {
      const res = await getFollowUpRadarDashboardAction({
        filter,
        searchQuery: search ?? searchQuery,
      });

      if (res.success) {
        setMetrics(res.metrics);
        setMembers(res.members);
      } else {
        setToast({
          type: 'error',
          message: res.error || 'Could not load the follow-up list.',
        });
      }
    } catch {
      setToast({
        type: 'error',
        message: 'Could not connect to database.',
      });
    } finally {
      setLoading(false);
    }
  }, [searchQuery]);

  // 1. Initial Data Fetch on Mount
  useEffect(() => {
    let ignore = false;

    Promise.resolve().then(() => {
      if (!ignore) setLoading(true);
    });

    getFollowUpRadarDashboardAction({ filter: 'ALL' })
      .then((res) => {
        if (!ignore) {
          if (res.success) {
            setMetrics(res.metrics);
            setMembers(res.members);
          }
          setLoading(false);
        }
      })
      .catch(() => {
        if (!ignore) {
          setLoading(false);
        }
      });

    return () => {
      ignore = true;
    };
  }, []);

  // Update caller name in localStorage
  const handleCallerNameChange = (name: string) => {
    setCallerName(name);
    if (typeof window !== 'undefined') {
      localStorage.setItem('rccg_caller_name', name);
    }
  };

  // 3. Handle Active Filter Change
  const handleFilterChange = (filter: RadarFilterType) => {
    setActiveFilter(filter);
    startTransition(() => {
      loadDashboardData(filter, searchQuery);
    });
  };

  // 4. Handle Search Change
  const handleSearchChange = (query: string) => {
    setSearchQuery(query);
    startTransition(() => {
      loadDashboardData(activeFilter, query);
    });
  };

  // 5. Handle Refresh Trigger
  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      const res = await triggerRadarSyncAction();
      if (res.success) {
        setMetrics(res.metrics);
        const newCount = res.tasksCreated ?? 0;
        setToast({
          type: 'success',
          title: 'Follow-up list refreshed',
          message:
            newCount > 0
              ? `Found ${newCount} new ${newCount === 1 ? 'person' : 'people'} to follow up with.`
              : 'Everyone is up to date.',
        });
        await loadDashboardData(activeFilter, searchQuery);
      } else {
        setToast({
          type: 'error',
          message: res.error || 'Could not refresh the list.',
        });
      }
    } catch {
      setToast({
        type: 'error',
        message: 'Could not refresh the follow-up list.',
      });
    } finally {
      setIsRefreshing(false);
    }
  };

  // 6. Handle Member Outcome Logged (remove from active queue view or update status)
  const handleOutcomeLogged = (personId: string, outcome: MandatedOutcome) => {
    setMembers((prev) =>
      prev.map((m) =>
        m.personId === personId
          ? {
              ...m,
              taskStatus: 'CONTACTED',
              isOverdue: false,
              recentNotes: [
                {
                  id: String(Date.now()),
                  callerName: callerName || 'Volunteer',
                  outcome,
                  note: null,
                  date: 'Just now',
                },
                ...m.recentNotes,
              ],
            }
          : m
      )
    );
  };

  if (!mounted) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="w-8 h-8 border-3 border-blue-900 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // Follow-Up Dashboard
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col selection:bg-blue-100 selection:text-blue-950">
      {/* Toast Feedback */}
      {toast && (
        <Toast
          type={toast.type}
          title={toast.title}
          message={toast.message}
          onClose={() => setToast(null)}
        />
      )}

      {/* Main Header */}
      <FollowUpHeader
        callerName={callerName}
        onCallerNameChange={handleCallerNameChange}
        onRefresh={handleRefresh}
        isRefreshing={isRefreshing}
        searchQuery={searchQuery}
        onSearchChange={handleSearchChange}
      />

      {/* Main Content Workspace */}
      <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 py-6 flex flex-col gap-6">
        {/* Youth President Escalation Alert Banner */}
        <EscalationBanner
          escalatedCount={metrics.escalatedCount}
          onViewEscalated={() => handleFilterChange('ESCALATED')}
        />

        {/* 3 Interactive Radar Metric Cards */}
        <RadarOverview
          metrics={metrics}
          activeFilter={activeFilter}
          onFilterChange={handleFilterChange}
        />

        {/* Active Filter Queue Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-200 pb-3">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-sm font-extrabold text-slate-950">
              {activeFilter === 'ALL' && 'All Absent Members & First-Timers'}
              {activeFilter === 'MISSED_1_WEEK' && 'Missed 1 Sunday'}
              {activeFilter === 'MISSED_2_WEEKS' && 'Missed 2 Consecutive Sundays'}
              {activeFilter === 'FIRST_TIMER_72H' && 'First-Timers'}
              {activeFilter === 'ESCALATED' && 'Needs Attention'}
            </h2>
            <span className="text-xs font-bold text-slate-600 bg-slate-200/80 px-2 py-0.5 rounded-full">
              {members.length} {members.length === 1 ? 'member' : 'members'}
            </span>
          </div>

          <div className="text-xs text-slate-600">
            Send WhatsApp DM or Call Member, then record outcome for Youth President
          </div>
        </div>

        {/* Member Queue Cards */}
        {loading ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <div className="w-8 h-8 border-3 border-blue-900 border-t-transparent rounded-full animate-spin" />
            <span className="text-xs font-bold text-slate-700">
              Loading follow-up list...
            </span>
          </div>
        ) : members.length === 0 ? (
          <motion.div
            {...surfaceEntranceVariants}
            className="w-full bg-white border border-slate-200/90 rounded-3xl p-12 text-center flex flex-col items-center justify-center gap-3 shadow-2xs"
          >
            <div className="w-12 h-12 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-800">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <h3 className="text-base font-extrabold text-slate-950">
              All Clear for this Category!
            </h3>
            <p className="text-xs text-slate-600 max-w-md">
              {searchQuery
                ? `No members found matching "${searchQuery}". Try clearing search.`
                : 'No members currently pending follow-up in this segment. Glory to God!'}
            </p>
            {searchQuery && (
              <button
                type="button"
                onClick={() => handleSearchChange('')}
                className="mt-2 text-xs font-bold text-blue-900 hover:underline min-h-[44px] px-3 flex items-center"
              >
                Clear Search Filter
              </button>
            )}
          </motion.div>
        ) : (
          <div className="space-y-4">
            {members.map((member) => (
              <MemberFollowUpCard
                key={`${member.personId}-${member.taskId || 'new'}`}
                member={member}
                callerName={callerName}
                onOutcomeLogged={handleOutcomeLogged}
                onToast={setToast}
              />
            ))}
          </div>
        )}
      </main>

      {/* Footer Nav */}
      <footer className="w-full border-t border-slate-200 bg-white py-4 mt-8">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 flex flex-col gap-2 text-xs text-slate-600">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-2">
            <div className="flex items-center gap-2 flex-wrap justify-center">
              <span className="font-bold text-slate-900">RCCG Jesus Covenant Zone</span>
              <span>•</span>
              <span>Zero-Forgotten-Member Follow-Up Engine</span>
            </div>
            <div className="flex items-center gap-4">
              <Link href="/" className="hover:text-slate-950 font-bold hover:underline min-h-[44px] inline-flex items-center px-2">
                Back to Home
              </Link>
            </div>
          </div>
          <p className="text-xs italic text-slate-500 text-center">
            &ldquo;Be sure you know the condition of your flocks...&rdquo; — Proverbs 27:23
          </p>
        </div>
      </footer>
    </div>
  );
}
