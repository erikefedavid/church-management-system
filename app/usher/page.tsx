'use client';

import { useState, useEffect, useMemo } from 'react';
import Image from 'next/image';
import {
  Shield,
  Search,
  CheckCircle2,
  Clock,
  ClipboardList,
  UserPlus,
  Smartphone,
  X,
  Download,
  Users,
  Edit3,
  Sparkles,
  PhoneOff,
  History,
  Calendar,
  Filter,
  Lock,
  ChevronDown,
} from 'lucide-react';
import {
  usherGetServicesAction,
  usherGetRosterAction,
  usherCheckInAction,
  usherUpdatePhoneAction,
  usherGetTodayAttendanceAction,
  usherRegisterPersonAction,
  usherGetAttendanceHistoryAction,
  usherGetTodayServicesSummaryAction,
  TodayServiceReportItem,
} from '../actions/usher';
import { PersonCategory, PersonStatus } from '@prisma/client';
import Toast from '../components/Toast';
import CustomDropdown from '../components/CustomDropdown';
import ExportExcelModal from '../components/ExportExcelModal';
import AmbientBackground from '../components/AmbientBackground';
import { formatTimeRange12 } from '@/lib/service-resolver';

interface RosterMember {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
  phoneLast4: string;
  category: PersonCategory;
  subCategory: string | null;
  status: PersonStatus;
  isCheckedIn: boolean;
  checkInTime: string | null;
  checkInMethod: string | null;
}

export default function UsherHelpDesk() {
  const [loading, setLoading] = useState(true);
  const [church, setChurch] = useState<any>(null);
  const [services, setServices] = useState<any[]>([]);
  const [todayServices, setTodayServices] = useState<any[]>([]);
  const [selectedServiceId, setSelectedServiceId] = useState<string>('');
  const [activeService, setActiveService] = useState<any>(null);
  const [justFinishedService, setJustFinishedService] = useState<any>(null);
  const [isLiveNow, setIsLiveNow] = useState<boolean>(false);
  const [nigerianTimeFormatted, setNigerianTimeFormatted] = useState<string>('');
  const [nextUpcomingService, setNextUpcomingService] = useState<any>(null);
  const [currentDay, setCurrentDay] = useState<string>('');

  // Active Tab for Today: ROSTER | TODAY_LIST
  const [activeTab, setActiveTab] = useState<'ROSTER' | 'TODAY_LIST'>('ROSTER');

  // Roster state (A-Z)
  const [roster, setRoster] = useState<RosterMember[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [checkingInId, setCheckingInId] = useState<string | null>(null);

  // Today's roll call state
  const [todayRecords, setTodayRecords] = useState<any[]>([]);

  // History Modal state (Triggered from Navbar)
  const [showHistoryModal, setShowHistoryModal] = useState<boolean>(false);
  const [historyDate, setHistoryDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [historyServiceId, setHistoryServiceId] = useState<string>('');
  const [historyRecords, setHistoryRecords] = useState<any[]>([]);
  const [loadingHistory, setLoadingHistory] = useState<boolean>(false);
  const [hasSearchedHistory, setHasSearchedHistory] = useState<boolean>(false);

  // Phone edit state
  const [editingPerson, setEditingPerson] = useState<any>(null);
  const [newPhoneNumber, setNewPhoneNumber] = useState('');
  const [submittingPhone, setSubmittingPhone] = useState(false);

  // Add New Person modal state (Worker, Youth, Adult)
  const [showAddPersonModal, setShowAddPersonModal] = useState(false);
  const [newFirstName, setNewFirstName] = useState('');
  const [newLastName, setNewLastName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newRoleType, setNewRoleType] = useState<'ADULT' | 'YOUTH' | 'WORKER'>('ADULT');
  const [newStatus, setNewStatus] = useState<PersonStatus>(PersonStatus.MEMBER);
  const [markAttendanceImmediately, setMarkAttendanceImmediately] = useState(true);
  const [submittingNewPerson, setSubmittingNewPerson] = useState(false);

  // Export Modal state (SINGLE DOWNLOAD MODAL)
  const [showExportModal, setShowExportModal] = useState(false);
  const [showSelectServiceModal, setShowSelectServiceModal] = useState(false);
  const [exportSource, setExportSource] = useState<'CURRENT' | 'HISTORY' | 'SERVICE'>('CURRENT');
  const [selectedExportService, setSelectedExportService] = useState<{ records: any[]; label: string } | null>(null);

  // Today's completed services & roll call report state
  const [todayServicesSummary, setTodayServicesSummary] = useState<TodayServiceReportItem[]>([]);
  const [allTodayRecords, setAllTodayRecords] = useState<any[]>([]);
  const [expandedServiceId, setExpandedServiceId] = useState<string | null>(null);

  // Toast notification state
  const [toast, setToast] = useState<{
    type: 'success' | 'error' | 'info';
    message: string;
    title?: string;
  } | null>(null);

  // Initialize Usher Desk & Services
  useEffect(() => {
    initUsherDesk();
  }, []);

  async function initUsherDesk() {
    setLoading(true);
    const serviceRes = await usherGetServicesAction();
    if (serviceRes.success && serviceRes.church) {
      setChurch(serviceRes.church);
      setServices(serviceRes.services || []);
      setTodayServices(serviceRes.todayServices || []);
      setActiveService(serviceRes.activeService || null);
      setJustFinishedService(serviceRes.justFinishedService || null);
      setIsLiveNow(!!serviceRes.isLiveNow);
      setNigerianTimeFormatted(serviceRes.nigerianTimeFormatted || '');
      setNextUpcomingService(serviceRes.nextUpcomingService || null);
      setCurrentDay(serviceRes.currentDay || '');

      const activeId =
        (serviceRes.isLiveNow && serviceRes.activeService?.id) ||
        serviceRes.activeServiceId ||
        (serviceRes.todayServices?.[0]?.id ?? serviceRes.services?.[0]?.id ?? '');
      setSelectedServiceId(activeId);

      // Load roster, attendance for live service, and today's completed services summary
      await Promise.all([
        loadRoster(activeId),
        loadTodayAttendance(activeId),
        loadTodayServicesSummary(),
      ]);
    }
    setLoading(false);
  }

  // Load Today's Completed Services Breakdown
  async function loadTodayServicesSummary() {
    const res = await usherGetTodayServicesSummaryAction();
    if (res.success && res.services) {
      setTodayServicesSummary(res.services);
      if (res.allTodayRecords) {
        setAllTodayRecords(res.allTodayRecords);
      }
    }
  }

  // Load A-Z Member Roster (Independent per service)
  async function loadRoster(serviceId?: string) {
    const res = await usherGetRosterAction(serviceId);
    if (res.success && res.roster) {
      setRoster(res.roster);
    }
  }

  // Load Today's Attendance List (Independent per service)
  async function loadTodayAttendance(serviceId?: string) {
    const res = await usherGetTodayAttendanceAction(serviceId);
    if (res.success) {
      setTodayRecords(res.records || []);
    }
  }

  // Load Past Attendance History
  async function handleSearchHistory(e?: React.FormEvent) {
    if (e) e.preventDefault();
    setLoadingHistory(true);
    const res = await usherGetAttendanceHistoryAction({
      targetDate: historyDate,
      serviceScheduleId: historyServiceId || undefined,
    });
    if (res.success) {
      setHistoryRecords(res.records || []);
      setHasSearchedHistory(true);
    } else {
      setToast({
        type: 'error',
        title: 'History Query Failed',
        message: res.error || 'Could not fetch past records.',
      });
    }
    setLoadingHistory(false);
  }

  // When service dropdown changes, reload roster and attendance specifically for that service
  function handleServiceChange(newServiceId: string) {
    setSelectedServiceId(newServiceId);
    loadRoster(newServiceId);
    loadTodayAttendance(newServiceId);
  }

  // Instant client-side search filter across full A-Z roster
  const filteredRoster = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return roster;

    return roster.filter((person) => {
      const fullName = `${person.firstName} ${person.lastName}`.toLowerCase();
      const phone = (person.phone || '').toLowerCase();
      const last4 = (person.phoneLast4 || '').toLowerCase();
      return fullName.includes(q) || phone.includes(q) || last4.includes(q);
    });
  }, [roster, searchQuery]);

  // Handle Usher 1-Tap Check-In with live arrival timestamp (Strictly scoped to live activeService)
  async function handleUsherCheckIn(person: RosterMember) {
    if (!isLiveNow || !activeService) {
      setToast({
        type: 'error',
        title: 'Attendance Closed',
        message: 'No church service is currently live. Attendance marking only opens during official service hours.',
      });
      return;
    }

    setCheckingInId(person.id);

    const fallbackTime = new Date().toLocaleTimeString('en-US', {
      timeZone: 'Africa/Lagos',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });

    const res = await usherCheckInAction({
      personId: person.id,
      serviceScheduleId: activeService.id,
    });

    setCheckingInId(null);

    if (res.success) {
      const recordedTime = res.checkInTime || fallbackTime;

      // Update person row in local roster immediately
      setRoster((prev) =>
        prev.map((m) =>
          m.id === person.id
            ? {
                ...m,
                isCheckedIn: true,
                checkInTime: recordedTime,
                checkInMethod: 'USHER_MANUAL',
              }
            : m
        )
      );

      setToast({
        type: 'success',
        title: 'Attendance Marked',
        message: `${person.firstName} marked present at ${recordedTime}`,
      });

      // Refresh today's records list and summary in background
      loadTodayAttendance(activeService.id);
      loadTodayServicesSummary();
    } else {
      setToast({
        type: 'error',
        title: 'Check-In Notice',
        message: res.error || 'Failed to check in.',
      });
    }
  }

  // Handle Phone Update
  async function handleSavePhone(e: React.FormEvent) {
    e.preventDefault();
    if (!editingPerson || !newPhoneNumber.trim()) return;

    setSubmittingPhone(true);
    const res = await usherUpdatePhoneAction({
      personId: editingPerson.id,
      newPhone: newPhoneNumber,
    });
    setSubmittingPhone(false);

    if (res.success) {
      setToast({
        type: 'success',
        title: 'Phone Number Updated',
        message: res.message || 'Phone updated successfully!',
      });
      setEditingPerson(null);
      setNewPhoneNumber('');
      loadRoster(selectedServiceId);
    } else {
      setToast({
        type: 'error',
        title: 'Update Failed',
        message: res.error || 'Failed to update phone number.',
      });
    }
  }

  // Handle Adding Person (Can be existing member or first-timer)
  async function handleAddNewPerson(e: React.FormEvent) {
    e.preventDefault();
    if (!newFirstName.trim()) {
      setToast({
        type: 'error',
        title: 'Missing First Name',
        message: 'Please provide at least a First Name.',
      });
      return;
    }

    const shouldCheckIn = markAttendanceImmediately && isLiveNow && activeService;

    setSubmittingNewPerson(true);
    const res = await usherRegisterPersonAction({
      firstName: newFirstName,
      lastName: newLastName,
      phone: newPhone,
      roleType: newRoleType,
      status: newStatus,
      serviceScheduleId: shouldCheckIn ? activeService.id : undefined,
    });
    setSubmittingNewPerson(false);

    if (res.success) {
      setToast({
        type: 'success',
        title: 'Person Added',
        message: res.message || 'Saved to church database!',
      });
      setShowAddPersonModal(false);
      setNewFirstName('');
      setNewLastName('');
      setNewPhone('');
      setNewRoleType('ADULT');
      setNewStatus(PersonStatus.MEMBER);

      // Refresh roster, roll call, and summary
      await Promise.all([
        loadRoster(activeService?.id),
        activeService?.id ? loadTodayAttendance(activeService.id) : Promise.resolve(),
        loadTodayServicesSummary(),
      ]);
    } else {
      setToast({
        type: 'error',
        title: 'Registration Error',
        message: res.error || 'Could not register person.',
      });
    }
  }

  // Helper to format role badge (Worker, Youth, Adult)
  function formatRoleBadge(person: RosterMember) {
    const subCat = person.subCategory;
    const cat = person.category;
    if (
      cat === 'WORKER' ||
      subCat === 'WORKER' ||
      subCat === 'YOUTH_WORKER' ||
      subCat === 'ADULT_WORKER'
    ) {
      return { label: 'Worker', color: 'bg-indigo-50 text-indigo-700 border-indigo-200' };
    }
    if (cat === 'YOUTH' || subCat === 'YOUTH') {
      return { label: 'Youth', color: 'bg-amber-50 text-amber-700 border-amber-200' };
    }
    return { label: 'Adult', color: 'bg-slate-100 text-slate-700 border-slate-200' };
  }

  // Helper to format attendee category in roll call views
  function getCategoryDisplay(person: any, subClass?: string | null) {
    if (subClass) return `${subClass} Sunday School`;
    if (person?.status === 'FIRST_TIMER') return 'First-Timer';
    const sub = person?.subCategory;
    const cat = person?.category;
    if (cat === 'WORKER' || sub === 'WORKER' || sub === 'YOUTH_WORKER' || sub === 'ADULT_WORKER') return 'Worker';
    if (cat === 'YOUTH' || sub === 'YOUTH') return 'Youth';
    return 'Adult';
  }

  const historyServiceOptions = useMemo(() => {
    return [
      { value: '', label: 'All Services on this Date' },
      ...services.map((svc) => ({
        value: svc.id,
        label: svc.name,
        sublabel: `${svc.dayOfWeek} • ${formatTimeRange12(svc.startTime, svc.endTime)}`,
      })),
    ];
  }, [services]);

  const roleOptions = [
    { value: 'WORKER', label: 'Worker' },
    { value: 'YOUTH', label: 'Youth' },
    { value: 'ADULT', label: 'Adult' },
  ];

  const statusOptions = [
    { value: 'MEMBER', label: 'Church Member (Existing)' },
    { value: 'FIRST_TIMER', label: 'First-Timer (Visitor)' },
  ];

  const currentHistoryServiceObj = services.find((s) => s.id === historyServiceId);

  // Records to export depending on trigger (Current Live Service, History, or Specific Today's Service)
  const recordsToExport =
    exportSource === 'HISTORY'
      ? historyRecords
      : exportSource === 'SERVICE' && selectedExportService
      ? selectedExportService.records
      : isLiveNow && activeService
      ? todayRecords
      : allTodayRecords;

  const exportLabel =
    exportSource === 'HISTORY'
      ? `${currentHistoryServiceObj ? currentHistoryServiceObj.name : 'All_Services'}_${historyDate}`
      : exportSource === 'SERVICE' && selectedExportService
      ? `${selectedExportService.label}_${new Date().toISOString().slice(0, 10)}`
      : activeService
      ? `${activeService.name}_${new Date().toISOString().slice(0, 10)}`
      : `Today_Attendance_${new Date().toISOString().slice(0, 10)}`;

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

      {/* Single Excel Export Modal (The 5 Attendance Sheets) */}
      <ExportExcelModal
        isOpen={showExportModal}
        onClose={() => setShowExportModal(false)}
        records={recordsToExport}
        timeframeLabel={exportLabel}
        dateISO={exportSource === 'HISTORY' ? historyDate : undefined}
        onSuccessToast={(msg) =>
          setToast({
            type: 'success',
            title: 'Spreadsheet Exported',
            message: msg,
          })
        }
        onErrorToast={(msg) =>
          setToast({
            type: 'error',
            title: 'Export Failed',
            message: msg,
          })
        }
      />

      {/* Top Header - DOOR & NAVBAR COUNT REMOVED, HISTORY ICON ADDED */}
      <header className="border-b border-slate-200/80 bg-white/95 backdrop-blur-md sticky top-0 z-40 px-4 py-3 shadow-xs">
        <div className="max-w-3xl mx-auto flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="relative w-8 h-8 shrink-0">
              <Image src="/rccg-logo.png" alt="RCCG Logo" fill className="object-contain" priority />
            </div>
            <div>
              <h1 className="text-sm font-bold text-slate-900 flex items-center gap-1.5 leading-none">
                <Shield className="w-4 h-4 text-blue-600" />
                <span>RCCG Usher Desk</span>
              </h1>
              <p className="text-[11px] text-slate-500 font-medium mt-0.5">
                Assisted Check-In & Attendance Roster
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 text-xs">
            {/* PAST RECORDS HISTORY BUTTON ON NAVBAR */}
            <button
              type="button"
              onClick={() => {
                setShowHistoryModal(true);
                if (!hasSearchedHistory) {
                  handleSearchHistory();
                }
              }}
              className="bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 font-bold px-2.5 py-1.5 rounded-xl shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer"
              title="View & Download Past Attendance History"
            >
              <History className="w-3.5 h-3.5 text-blue-600" />
              <span className="hidden sm:inline">Past Records</span>
            </button>

            {/* ADD PERSON BUTTON */}
            <button
              type="button"
              onClick={() => setShowAddPersonModal(true)}
              className="bg-blue-600 hover:bg-blue-700 text-white font-bold px-3 py-1.5 rounded-xl shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <UserPlus className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Add Person</span>
            </button>

            {/* DOWNLOAD ATTENDANCE BUTTON */}
            <button
              type="button"
              onClick={() => {
                // If multiple services are scheduled/held today (e.g. Sunday has Workers, 1st Service, Sunday School, 2nd Service)
                if (todayServicesSummary.length > 1) {
                  setShowSelectServiceModal(true);
                } else if (todayServicesSummary.length === 1) {
                  const svc = todayServicesSummary[0];
                  setSelectedExportService({
                    records: svc.records,
                    label: svc.name.replace(/\s+/g, '_'),
                  });
                  setExportSource('SERVICE');
                  setShowExportModal(true);
                } else {
                  setExportSource('CURRENT');
                  setShowExportModal(true);
                }
              }}
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-3 py-1.5 rounded-xl shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer"
              title="Download Attendance of today's services"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Download Attendance</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Body */}
      <main className="flex-1 max-w-2xl w-full mx-auto p-4 space-y-4 relative z-10">
        {/* Service in Session / Just Finished Alert Banner */}
        {isLiveNow && activeService && (
          <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-2xl p-3 flex items-center gap-2.5 text-xs">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse shrink-0" />
            <div>
              <span className="font-bold text-emerald-950 block">
                {activeService.name} is Currently Active ({formatTimeRange12(activeService.startTime, activeService.endTime)})
              </span>
              <span className="text-[11px] text-emerald-800">
                Check-ins are streaming live in West Africa Time ({nigerianTimeFormatted}).
              </span>
            </div>
          </div>
        )}

        {!isLiveNow && justFinishedService && (
          <div className="bg-blue-500/10 border border-blue-500/20 rounded-2xl p-3 flex items-center gap-2.5 text-xs">
            <Clock className="w-4 h-4 text-blue-600 shrink-0" />
            <div>
              <span className="font-bold text-blue-950 block">
                {justFinishedService.name} Concluded ({formatTimeRange12(justFinishedService.startTime, justFinishedService.endTime)})
              </span>
              <span className="text-[11px] text-blue-800">
                Click &ldquo;Download Attendance&rdquo; to export the finalized report for this service.
              </span>
            </div>
          </div>
        )}

        {!isLiveNow && !justFinishedService && (
          <div className="bg-slate-100/90 border border-slate-200 rounded-2xl p-3 flex items-center gap-2.5 text-xs">
            <Clock className="w-4 h-4 text-slate-500 shrink-0" />
            <div>
              <span className="font-bold text-slate-800 block">
                Off-Hours • No Church Service Currently in Session
              </span>
              <span className="text-[11px] text-slate-500">
                {nextUpcomingService
                  ? `Next Scheduled Service: ${nextUpcomingService.name}`
                  : 'Roster and records are available for administrative review.'}
              </span>
            </div>
          </div>
        )}

        {/* Service Status & Tabs: ZERO DROPDOWN, COMPLETELY AUTOMATIC */}
        <div className="bg-white/95 backdrop-blur-md border border-slate-200 rounded-3xl p-4 sm:p-5 shadow-xs space-y-3 relative z-30">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            {isLiveNow && activeService ? (
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-xs font-bold text-emerald-800 uppercase tracking-wide">Recording Service:</span>
                <span className="text-sm font-extrabold text-slate-900">{activeService.name}</span>
                <span className="text-xs font-mono font-bold text-blue-700 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-lg ml-1">
                  {formatTimeRange12(activeService.startTime, activeService.endTime)}
                </span>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-slate-400" />
                <span className="text-xs font-bold text-slate-700">Off-Hours • Attendance Marking Locked</span>
              </div>
            )}

            <div className="text-right">
              <span className="text-[11px] text-slate-500 font-medium">
                {currentDay ? `${currentDay} • West Africa Time` : 'West Africa Time'}
              </span>
            </div>
          </div>

          {/* Toggle between Live Roll Call (A-Z) & Attendance for Today */}
          <div className="flex rounded-2xl bg-slate-100 p-1 border border-slate-200 text-xs">
            <button
              type="button"
              onClick={() => setActiveTab('ROSTER')}
              className={`flex-1 py-2.5 font-bold rounded-xl transition-colors flex items-center justify-center gap-1.5 cursor-pointer ${
                activeTab === 'ROSTER'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              <span>Mark Attendance (Live Roster)</span>
              {isLiveNow && (
                <span className="w-2 h-2 rounded-full bg-emerald-300 animate-pulse ml-0.5" />
              )}
            </button>

            <button
              type="button"
              onClick={() => {
                setActiveTab('TODAY_LIST');
                loadTodayServicesSummary();
              }}
              className={`flex-1 py-2.5 font-bold rounded-xl transition-colors flex items-center justify-center gap-1.5 cursor-pointer ${
                activeTab === 'TODAY_LIST'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <ClipboardList className="w-3.5 h-3.5" />
              <span>Attendance for Today</span>
              {todayServicesSummary.length > 0 && (
                <span className="bg-blue-100 text-blue-800 text-[10px] px-1.5 py-0.2 rounded-full font-bold ml-0.5">
                  {todayServicesSummary.filter((s) => s.totalCount > 0).length}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* TAB 1: ALPHABETICAL DIRECTORY (A-Z) WITH LIVE SEARCH */}
        {activeTab === 'ROSTER' && (
          <div className="space-y-3 relative z-10">
            {!isLiveNow ? (
              <div className="bg-white/95 backdrop-blur-md border border-slate-200 rounded-3xl p-8 text-center space-y-3 shadow-xs">
                <div className="w-14 h-14 bg-amber-50 text-amber-600 rounded-2xl flex items-center justify-center mx-auto border border-amber-200">
                  <Clock className="w-7 h-7" />
                </div>
                <div className="space-y-1.5 max-w-md mx-auto">
                  <h3 className="text-base font-bold text-slate-900">Attendance Marking is Locked</h3>
                  <p className="text-xs text-slate-500 leading-relaxed">
                    No church service is currently live. Ushers can only record attendance when a church service is in session.
                  </p>
                  <p className="text-[11px] text-slate-400">
                    Click the <strong className="text-blue-700">Attendance for Today</strong> tab above to review today&apos;s completed roll calls, or tap <strong className="text-slate-700">Past Records</strong> in the top bar to inspect previous dates.
                  </p>
                </div>
              </div>
            ) : (
              <>
                {/* Live Search Filter Bar */}
                <div className="relative">
                  <input
                    type="text"
                    placeholder="Search by name or phone/PIN..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full bg-white/95 backdrop-blur-md border border-slate-200 rounded-2xl pl-11 pr-10 py-3 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 shadow-xs"
                  />
                  <Search className="w-5 h-5 text-slate-400 absolute left-3.5 top-3.5 pointer-events-none" />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => setSearchQuery('')}
                      className="absolute right-3.5 top-3.5 text-slate-400 hover:text-slate-600 cursor-pointer"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>

                {/* Sub-header counter */}
                <div className="flex items-center justify-between text-xs px-1 text-slate-500">
                  <span>
                    Showing <strong className="text-slate-800">{filteredRoster.length}</strong> members (Alphabetical)
                  </span>
                  <span>
                    Marked in {activeService?.name || 'Service'}: <strong className="text-emerald-700">{todayRecords.length}</strong>
                  </span>
                </div>

                {/* Empty Search State */}
                {filteredRoster.length === 0 && (
                  <div className="bg-white/90 backdrop-blur-md border border-slate-200 rounded-3xl p-8 text-center space-y-3">
                    <Users className="w-8 h-8 text-slate-300 mx-auto" />
                    <p className="text-xs text-slate-600">
                      No member found matching &quot;<strong className="text-slate-900">{searchQuery}</strong>&quot;.
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        setNewFirstName(searchQuery);
                        setShowAddPersonModal(true);
                      }}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl shadow-xs transition-colors cursor-pointer"
                    >
                      <UserPlus className="w-3.5 h-3.5" />
                      <span>Add &quot;{searchQuery}&quot; to Database</span>
                    </button>
                  </div>
                )}

                {/* Roster Cards List */}
                <div className="space-y-2">
                  {filteredRoster.map((person) => {
                    const isCheckingIn = checkingInId === person.id;
                    const isCheckedIn = person.isCheckedIn;
                    const roleBadge = formatRoleBadge(person);

                    return (
                      <div
                        key={person.id}
                        className="bg-white/95 backdrop-blur-md border border-slate-200 rounded-2xl p-3.5 sm:p-4 flex items-center justify-between gap-3 shadow-xs hover:border-slate-300 transition-colors"
                      >
                        <div className="space-y-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-bold text-slate-900">
                              {person.firstName} {person.lastName}
                            </span>

                            {/* Demographic Role Tag (Youth Worker, Adult Worker, Youth, Adult) */}
                            <span
                              className={`text-[10px] px-2 py-0.5 rounded-full font-bold border ${roleBadge.color}`}
                            >
                              {roleBadge.label}
                            </span>

                            {/* First-Timer Indicator */}
                            {person.status === 'FIRST_TIMER' && (
                              <span className="text-[10px] bg-emerald-50 text-emerald-700 border border-emerald-200 px-1.5 py-0.5 rounded-full font-bold flex items-center gap-0.5">
                                <Sparkles className="w-2.5 h-2.5" />
                                <span>1st Timer</span>
                              </span>
                            )}
                          </div>

                          {/* Phone or No-Phone indicator */}
                          <div className="text-xs text-slate-500 flex items-center gap-2">
                            {person.phone && person.phone !== 'NO-PHONE' ? (
                              <>
                                <span>{person.phone}</span>
                                <span>•</span>
                                <span className="font-mono text-blue-700 font-semibold">
                                  PIN: {person.phoneLast4}
                                </span>
                              </>
                            ) : (
                              <span className="text-slate-400 italic flex items-center gap-1">
                                <PhoneOff className="w-3 h-3 text-slate-300" />
                                <span>No phone registered</span>
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Actions: Edit Phone & Check-In */}
                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            onClick={() => {
                              setEditingPerson(person);
                              setNewPhoneNumber(person.phone === 'NO-PHONE' ? '' : person.phone);
                            }}
                            className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-colors cursor-pointer"
                            title="Update Phone Number"
                          >
                            <Edit3 className="w-4 h-4" />
                          </button>

                          {isCheckedIn ? (
                            <div className="px-3 py-1.5 text-xs font-bold rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-1.5 shadow-2xs">
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                              <span>Present ({person.checkInTime || 'Checked In'})</span>
                            </div>
                          ) : (
                            <button
                              type="button"
                              disabled={isCheckingIn}
                              onClick={() => handleUsherCheckIn(person)}
                              className="px-3.5 py-1.5 text-xs font-bold rounded-xl bg-blue-600 hover:bg-blue-700 text-white shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                            >
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              <span>{isCheckingIn ? 'Marking...' : 'Mark Present'}</span>
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        )}

        {/* TAB 2: ATTENDANCE FOR TODAY (COMPLETED & ACTIVE SERVICES FOR THE DAY) */}
        {activeTab === 'TODAY_LIST' && (
          <div className="space-y-4 relative z-10">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                <ClipboardList className="w-4 h-4 text-blue-600" />
                <span>Attendance Records for Today ({currentDay || 'Today'})</span>
              </span>
              <span className="text-[11px] text-slate-500 font-medium">
                Resets at midnight &bull; Auto-saved to History
              </span>
            </div>

            {todayServicesSummary.length === 0 ? (
              <div className="bg-white/90 backdrop-blur-md border border-slate-200 rounded-3xl p-8 text-center space-y-2">
                <ClipboardList className="w-8 h-8 text-slate-300 mx-auto" />
                <p className="text-xs font-semibold text-slate-700">
                  No attendance recorded for today yet.
                </p>
                <p className="text-[11px] text-slate-500">
                  As each service begins and concludes, its attendance records and class breakdowns will display here.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {todayServicesSummary.map((svc) => {
                  const isExpanded = expandedServiceId === svc.id;
                  const hasRecords = svc.totalCount > 0;
                  const isSundaySchool = svc.hasSubClasses || svc.name.toLowerCase().includes('sunday school');

                  return (
                    <div
                      key={svc.id}
                      className="bg-white/95 backdrop-blur-md border border-slate-200 rounded-3xl p-4 sm:p-5 shadow-xs space-y-3 transition-all"
                    >
                      {/* Top Header of Service Card */}
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-bold text-slate-900">{svc.name}</span>
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
                                ? '● Live Service'
                                : svc.status === 'CONCLUDED'
                                ? '✓ Concluded'
                                : '⏳ Upcoming'}
                            </span>
                          </div>
                          <span className="text-[11px] font-mono text-slate-500 block">
                            {formatTimeRange12(svc.startTime, svc.endTime)}
                          </span>
                        </div>

                        {/* Attendance Count & Action Buttons */}
                        <div className="flex items-center gap-2 flex-wrap">
                          <div className="px-2.5 py-1 rounded-xl bg-slate-100 border border-slate-200 text-xs font-bold text-slate-800">
                            <span className="text-blue-700 font-extrabold text-sm mr-1">{svc.totalCount}</span>
                            <span>{svc.totalCount === 1 ? 'attendee' : 'attendees'}</span>
                          </div>

                          {/* Download Excel Sheet for this specific service */}
                          {hasRecords && (
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedExportService({
                                  records: svc.records,
                                  label: svc.name.replace(/\s+/g, '_'),
                                });
                                setExportSource('SERVICE');
                                setShowExportModal(true);
                              }}
                              className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer"
                              title={`Download ${svc.name} attendance`}
                            >
                              <Download className="w-3.5 h-3.5" />
                              <span className="hidden sm:inline">Download Sheet</span>
                            </button>
                          )}

                          {/* Toggle Roll Call Expansion */}
                          {hasRecords && (
                            <button
                              type="button"
                              onClick={() => setExpandedServiceId(isExpanded ? null : svc.id)}
                              className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl border border-slate-200 transition-colors flex items-center gap-1.5 cursor-pointer"
                            >
                              <span>{isExpanded ? 'Hide Roll Call' : 'View Roll Call'}</span>
                              <ChevronDown
                                className={`w-3.5 h-3.5 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                              />
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Demographic Breakdown Pills */}
                      {hasRecords ? (
                        <div className="flex flex-wrap gap-1.5 text-[11px]">
                          {/* If Sunday School, show Adult Sunday School and Youth Sunday School specifically! */}
                          {isSundaySchool ? (
                            <>
                              <span className="bg-blue-50 text-blue-800 border border-blue-200 px-2 py-0.5 rounded-lg font-medium">
                                Adult Sunday School: <strong>{svc.adultSundaySchoolCount}</strong>
                              </span>
                              <span className="bg-purple-50 text-purple-800 border border-purple-200 px-2 py-0.5 rounded-lg font-medium">
                                Youth Sunday School: <strong>{svc.youthSundaySchoolCount}</strong>
                              </span>
                            </>
                          ) : (
                            <>
                              {svc.workersCount > 0 && (
                                <span className="bg-amber-50 text-amber-800 border border-amber-200 px-2 py-0.5 rounded-lg font-medium">
                                  Workers: <strong>{svc.workersCount}</strong>
                                </span>
                              )}
                              {svc.adultCount > 0 && (
                                <span className="bg-blue-50 text-blue-800 border border-blue-200 px-2 py-0.5 rounded-lg font-medium">
                                  Adults: <strong>{svc.adultCount}</strong>
                                </span>
                              )}
                              {svc.youthCount > 0 && (
                                <span className="bg-purple-50 text-purple-800 border border-purple-200 px-2 py-0.5 rounded-lg font-medium">
                                  Youths: <strong>{svc.youthCount}</strong>
                                </span>
                              )}
                            </>
                          )}

                          {svc.firstTimersCount > 0 && (
                            <span className="bg-emerald-50 text-emerald-800 border border-emerald-200 px-2 py-0.5 rounded-lg font-medium flex items-center gap-0.5">
                              <Sparkles className="w-2.5 h-2.5" />
                              <span>1st Timers: <strong>{svc.firstTimersCount}</strong></span>
                            </span>
                          )}
                        </div>
                      ) : (
                        <p className="text-[11px] text-slate-400 italic">
                          No attendance marked yet for this program.
                        </p>
                      )}

                      {/* Expanded Roll Call List */}
                      {isExpanded && hasRecords && (
                        <div className="pt-2 border-t border-slate-100 space-y-2 max-h-72 overflow-y-auto">
                          <div className="text-[11px] font-bold text-slate-600 px-1">
                            Roll Call for {svc.name} ({svc.records.length} attendees)
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
                                className="bg-slate-50 border border-slate-200 rounded-xl p-2.5 flex items-center justify-between text-xs shadow-2xs"
                              >
                                <div>
                                  <span className="font-bold text-slate-900 block">
                                    {r.person?.firstName} {r.person?.lastName}
                                  </span>
                                  <span className="text-[11px] text-slate-500 font-mono">
                                    Arrived: <strong className="text-slate-800">{timeFormatted}</strong> &bull;{' '}
                                    {getCategoryDisplay(r.person, r.subClass)}
                                  </span>
                                </div>

                                <span
                                  className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
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

                {/* Helpful Note at Bottom of Today's Attendance */}
                <div className="bg-slate-100/70 border border-slate-200/80 rounded-2xl p-3 text-center">
                  <p className="text-[11px] text-slate-500">
                    💡 Today&apos;s attendance clears at midnight and is preserved forever in{' '}
                    <strong className="text-slate-700">Past Records History</strong>. Tap{' '}
                    <strong className="text-blue-700">Past Records</strong> in the top bar anytime to query past dates.
                  </p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* MODAL: SELECT TODAY'S SERVICE TO DOWNLOAD */}
        {showSelectServiceModal && (
          <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs z-50 flex items-center justify-center p-4">
            <div className="bg-white border border-slate-200 rounded-3xl p-5 sm:p-6 max-w-lg w-full space-y-4 shadow-2xl animate-in zoom-in-95 duration-150 max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <div className="p-2 rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-200">
                    <Download className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-900">Download Attendance for Today</h3>
                    <p className="text-[11px] text-slate-500">
                      {currentDay || 'Today'} &bull; Choose a service to download its attendance report
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowSelectServiceModal(false)}
                  className="text-slate-400 hover:text-slate-700 p-1 rounded-lg hover:bg-slate-100 cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Service options list */}
              <div className="space-y-2.5">
                {todayServicesSummary.map((svc) => {
                  const isSundaySchool = svc.hasSubClasses || svc.name.toLowerCase().includes('sunday school');
                  return (
                    <div
                      key={svc.id}
                      className="p-3.5 bg-slate-50 hover:bg-emerald-50/40 border border-slate-200 hover:border-emerald-300 rounded-2xl transition-all flex items-center justify-between gap-3"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h4 className="text-sm font-bold text-slate-900">{svc.name}</h4>
                          <span
                            className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                              svc.status === 'LIVE'
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                : svc.status === 'CONCLUDED'
                                ? 'bg-blue-50 text-blue-700 border-blue-200'
                                : 'bg-slate-100 text-slate-600 border-slate-200'
                            }`}
                          >
                            {svc.status === 'LIVE'
                              ? 'Live'
                              : svc.status === 'CONCLUDED'
                              ? 'Concluded'
                              : 'Upcoming'}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-[11px] text-slate-500 font-mono">
                          <span>{formatTimeRange12(svc.startTime, svc.endTime)}</span>
                          <span>&bull;</span>
                          <span className="font-bold text-slate-700 font-sans">
                            {svc.totalCount} {svc.totalCount === 1 ? 'attendee' : 'attendees'}
                          </span>
                        </div>
                        {isSundaySchool && (
                          <p className="text-[10px] text-purple-700 font-medium">
                            Includes Youth Sunday School &amp; Adult Sunday School
                          </p>
                        )}
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          setSelectedExportService({
                            records: svc.records,
                            label: svc.name.replace(/\s+/g, '_'),
                          });
                          setExportSource('SERVICE');
                          setShowSelectServiceModal(false);
                          setShowExportModal(true);
                        }}
                        className="px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-xs transition-colors flex items-center gap-1.5 shrink-0 cursor-pointer"
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>Download</span>
                      </button>
                    </div>
                  );
                })}

                {/* Option for Full Day Combined Attendance */}
                <div className="p-3.5 bg-blue-50/60 border border-blue-200 rounded-2xl flex items-center justify-between gap-3 mt-1">
                  <div className="space-y-0.5">
                    <h4 className="text-sm font-bold text-blue-950">Full Today Attendance (All Services)</h4>
                    <p className="text-[11px] text-blue-700">
                      Combined roll call for all services held today ({allTodayRecords.length} total attendees)
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setExportSource('CURRENT');
                      setShowSelectServiceModal(false);
                      setShowExportModal(true);
                    }}
                    className="px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl shadow-xs transition-colors flex items-center gap-1.5 shrink-0 cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Download All</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* MODAL: PAST ATTENDANCE HISTORY (TRIGGERED FROM NAVBAR ICON) */}
        {showHistoryModal && (
          <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs z-50 flex items-center justify-center p-4">
            <div className="bg-white border border-slate-200 rounded-3xl p-5 sm:p-6 max-w-xl w-full space-y-4 shadow-2xl animate-in zoom-in-95 duration-150 max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <div className="p-2 rounded-xl bg-blue-50 text-blue-600">
                    <History className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-900">Past Services Attendance History</h3>
                    <p className="text-[11px] text-slate-500">Query and download attendance for any past church date</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowHistoryModal(false)}
                  className="text-slate-400 hover:text-slate-700 p-1 rounded-lg hover:bg-slate-100 cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Filter controls */}
              <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-3.5 space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
                  <div>
                    <label className="text-slate-700 font-bold block mb-1">Service Date</label>
                    <input
                      type="date"
                      value={historyDate}
                      onChange={(e) => setHistoryDate(e.target.value)}
                      className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  <div className="relative z-50">
                    <CustomDropdown
                      label="Service Program"
                      value={historyServiceId}
                      onChange={(val) => setHistoryServiceId(val)}
                      options={historyServiceOptions}
                    />
                  </div>
                </div>

                <div className="flex gap-2 pt-1">
                  <button
                    type="button"
                    disabled={loadingHistory}
                    onClick={() => handleSearchHistory()}
                    className="flex-1 py-2 text-xs text-white bg-blue-600 hover:bg-blue-700 rounded-xl font-bold shadow-xs transition-colors flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                  >
                    <Search className="w-3.5 h-3.5" />
                    <span>{loadingHistory ? 'Searching...' : 'Search Past Records'}</span>
                  </button>

                  {historyRecords.length > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        setExportSource('HISTORY');
                        setShowExportModal(true);
                      }}
                      className="py-2 px-3 text-xs text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl font-bold shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Download Sheet</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Past Records Summary */}
              {historyRecords.length > 0 && (
                <div className="flex items-center justify-between text-xs px-1 text-slate-600 font-medium">
                  <span>
                    Found <strong className="text-blue-700">{historyRecords.length}</strong> attendees on{' '}
                    <strong className="text-slate-900">{historyDate}</strong>
                  </span>
                </div>
              )}

              {/* Empty History Results */}
              {hasSearchedHistory && historyRecords.length === 0 && !loadingHistory && (
                <div className="bg-slate-50 border border-slate-200 rounded-2xl p-6 text-center space-y-2">
                  <Calendar className="w-7 h-7 text-slate-300 mx-auto" />
                  <p className="text-xs font-semibold text-slate-700">
                    No attendance records found for {historyDate}.
                  </p>
                  <p className="text-[11px] text-slate-500">
                    Try choosing another date or selecting &ldquo;All Services on this Date&rdquo;.
                  </p>
                </div>
              )}

              {/* History Records List */}
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {historyRecords.map((r: any) => {
                  const timeFormatted = new Date(r.createdAt).toLocaleTimeString('en-US', {
                    timeZone: 'Africa/Lagos',
                    hour: '2-digit',
                    minute: '2-digit',
                    hour12: true,
                  });

                  return (
                    <div
                      key={r.id}
                      className="bg-white border border-slate-200 rounded-xl p-2.5 flex items-center justify-between text-xs shadow-2xs"
                    >
                      <div>
                        <span className="font-bold text-slate-900 block">
                          {r.person?.firstName} {r.person?.lastName}
                        </span>
                        <span className="text-[11px] text-slate-500 font-mono">
                          {r.serviceSchedule?.name} • Arrived: <strong className="text-slate-800">{timeFormatted}</strong> •{' '}
                          {getCategoryDisplay(r.person, r.subClass)}
                        </span>
                      </div>

                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                          r.method === 'QR_SELF'
                            ? 'bg-blue-50 text-blue-700 border-blue-200'
                            : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                        }`}
                      >
                        {r.method === 'QR_SELF' ? 'Self QR' : 'Usher Marked'}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* MODAL 1: EDIT PHONE NUMBER */}
        {editingPerson && (
          <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs z-50 flex items-center justify-center p-4">
            <div className="bg-white border border-slate-200 rounded-3xl p-6 max-w-sm w-full space-y-4 shadow-xl animate-in zoom-in-95 duration-150">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                  <Smartphone className="w-4 h-4 text-blue-600" />
                  <span>Update Phone Number</span>
                </h3>
                <button
                  type="button"
                  onClick={() => setEditingPerson(null)}
                  className="text-slate-400 hover:text-slate-700 cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <p className="text-xs text-slate-500">
                Updating phone for <strong className="text-slate-900">{editingPerson.firstName} {editingPerson.lastName}</strong>.
              </p>

              <form onSubmit={handleSavePhone} className="space-y-4">
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1.5">
                    New Phone Number
                  </label>
                  <input
                    type="tel"
                    required
                    value={newPhoneNumber}
                    onChange={(e) => setNewPhoneNumber(e.target.value)}
                    placeholder="e.g. 08023456789"
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                  />
                  <p className="text-[11px] text-slate-400 mt-1">
                    Their new check-in last 4 digits will become:{' '}
                    <strong className="text-blue-600">
                      {newPhoneNumber.trim().length >= 4 ? newPhoneNumber.trim().slice(-4) : '••••'}
                    </strong>
                  </p>
                </div>

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setEditingPerson(null)}
                    className="flex-1 py-2 text-xs text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl font-bold transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submittingPhone}
                    className="flex-1 py-2 text-xs text-white bg-blue-600 hover:bg-blue-700 rounded-xl font-bold shadow-xs transition-colors cursor-pointer"
                  >
                    {submittingPhone ? 'Saving...' : 'Save & Update'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* MODAL 2: ADD BRAND NEW PERSON (YOUTH WORKER, ADULT WORKER, YOUTH, ADULT) */}
        {showAddPersonModal && (
          <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs z-50 flex items-center justify-center p-4">
            <div className="bg-white border border-slate-200 rounded-3xl p-6 max-w-sm w-full space-y-4 shadow-xl animate-in zoom-in-95 duration-150">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                  <UserPlus className="w-4 h-4 text-blue-600" />
                  <span>Add Person to Church Roster</span>
                </h3>
                <button
                  type="button"
                  onClick={() => setShowAddPersonModal(false)}
                  className="text-slate-400 hover:text-slate-700 cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleAddNewPerson} className="space-y-3 text-xs">
                <div>
                  <label className="text-slate-700 font-bold block mb-1">First Name *</label>
                  <input
                    type="text"
                    required
                    value={newFirstName}
                    onChange={(e) => setNewFirstName(e.target.value)}
                    placeholder="e.g. Oluwaseun"
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="text-slate-700 font-bold block mb-1">Last Name</label>
                  <input
                    type="text"
                    value={newLastName}
                    onChange={(e) => setNewLastName(e.target.value)}
                    placeholder="e.g. Adeleke"
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-slate-700 font-bold">Phone Number</label>
                    <span className="text-[10px] text-slate-400 font-normal">Optional (e.g. elderly members)</span>
                  </div>
                  <input
                    type="tel"
                    value={newPhone}
                    onChange={(e) => setNewPhone(e.target.value)}
                    placeholder="e.g. 08023456789 (or leave blank)"
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                {/* Role / Demographic (Youth Worker, Adult Worker, Youth, Adult) */}
                <div>
                  <CustomDropdown
                    label="Category / Demographic"
                    value={newRoleType}
                    onChange={(val) => setNewRoleType(val as any)}
                    options={roleOptions}
                  />
                </div>

                {/* Member vs First-Timer */}
                <div>
                  <CustomDropdown
                    label="Church Status"
                    value={newStatus}
                    onChange={(val) => setNewStatus(val as PersonStatus)}
                    options={statusOptions}
                  />
                </div>

                {isLiveNow && activeService ? (
                  <div className="pt-1 flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="markNow"
                      checked={markAttendanceImmediately}
                      onChange={(e) => setMarkAttendanceImmediately(e.target.checked)}
                      className="w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500 cursor-pointer"
                    />
                    <label htmlFor="markNow" className="text-slate-700 font-semibold cursor-pointer">
                      Mark present for {activeService.name} now
                    </label>
                  </div>
                ) : (
                  <p className="text-[11px] text-slate-500 italic pt-1">
                    Off-hours: Member will be added to database (attendance marking is locked until service is live).
                  </p>
                )}

                <div className="flex gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowAddPersonModal(false)}
                    className="flex-1 py-2 text-xs text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl font-bold transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submittingNewPerson}
                    className="flex-1 py-2 text-xs text-white bg-blue-600 hover:bg-blue-700 rounded-xl font-bold shadow-xs transition-colors cursor-pointer"
                  >
                    {submittingNewPerson ? 'Saving...' : 'Save to DB'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
