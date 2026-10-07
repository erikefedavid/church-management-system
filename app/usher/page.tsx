'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import {
  Shield,
  Search,
  CheckCircle2,
  AlertCircle,
  Edit3,
  Clock,
  ClipboardList,
  UserCheck,
  UserPlus,
  Smartphone,
  X,
  ArrowLeft,
  FileSpreadsheet,
  Download,
} from 'lucide-react';
import { getActiveServiceAction } from '../actions/attendance';
import {
  usherSearchMembersAction,
  usherCheckInAction,
  usherUpdatePhoneAction,
  usherGetTodayAttendanceAction,
  usherRegisterPersonAction,
} from '../actions/usher';
import { PersonCategory, PersonStatus } from '@prisma/client';
import Toast from '../components/Toast';
import CustomDropdown from '../components/CustomDropdown';
import ExportExcelModal from '../components/ExportExcelModal';
import AmbientBackground from '../components/AmbientBackground';

export default function UsherHelpDesk() {
  const [loading, setLoading] = useState(true);
  const [church, setChurch] = useState<any>(null);
  const [services, setServices] = useState<any[]>([]);
  const [selectedServiceId, setSelectedServiceId] = useState<string>('');

  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);

  // Today's attendance roll
  const [todayRecords, setTodayRecords] = useState<any[]>([]);
  const [categoryCounts, setCategoryCounts] = useState<{
    total?: number;
    workers?: number;
    youth?: number;
    firstTimers?: number;
  }>({});
  const [activeTab, setActiveTab] = useState<'SEARCH' | 'TODAY_LIST'>('SEARCH');

  // Phone edit state (when someone lost phone or changed SIM)
  const [editingPerson, setEditingPerson] = useState<any>(null);
  const [newPhoneNumber, setNewPhoneNumber] = useState('');
  const [submittingPhone, setSubmittingPhone] = useState(false);

  // Add New Person modal state
  const [showAddPersonModal, setShowAddPersonModal] = useState(false);
  const [newFirstName, setNewFirstName] = useState('');
  const [newLastName, setNewLastName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newCategory, setNewCategory] = useState<PersonCategory>(PersonCategory.ADULT);
  const [newStatus, setNewStatus] = useState<PersonStatus>(PersonStatus.MEMBER);
  const [markAttendanceImmediately, setMarkAttendanceImmediately] = useState(true);
  const [submittingNewPerson, setSubmittingNewPerson] = useState(false);

  // Export Modal state
  const [showExportModal, setShowExportModal] = useState(false);

  // Toast notification state
  const [toast, setToast] = useState<{
    type: 'success' | 'error' | 'info';
    message: string;
    title?: string;
  } | null>(null);

  useEffect(() => {
    initUsherDesk();
  }, []);

  async function initUsherDesk() {
    setLoading(true);
    const serviceRes = await getActiveServiceAction();
    if (serviceRes.success && serviceRes.church) {
      setChurch(serviceRes.church);
      setServices(serviceRes.todayServices || []);
      const defaultId = serviceRes.activeService?.id || (serviceRes.todayServices?.[0]?.id ?? '');
      setSelectedServiceId(defaultId);
      loadTodayAttendance(defaultId);
    }
    setLoading(false);
  }

  async function loadTodayAttendance(serviceId?: string) {
    const res = await usherGetTodayAttendanceAction(serviceId);
    if (res.success) {
      setTodayRecords(res.records || []);
      if (res.counts) {
        setCategoryCounts(res.counts);
      }
    }
  }

  // Handle Search Input with debounce
  useEffect(() => {
    if (!searchQuery.trim() || searchQuery.trim().length < 2) {
      setSearchResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      setSearching(true);
      const res = await usherSearchMembersAction(searchQuery);
      if (res.success) {
        setSearchResults(res.members || []);
      }
      setSearching(false);
    }, 250);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Handle Usher 1-Tap Check-In
  async function handleUsherCheckIn(person: any) {
    if (!selectedServiceId) {
      setToast({
        type: 'error',
        title: 'Select Service',
        message: 'Please choose an active service first.',
      });
      return;
    }

    const res = await usherCheckInAction({
      personId: person.id,
      serviceScheduleId: selectedServiceId,
    });

    if (res.success) {
      setToast({
        type: 'success',
        title: 'Attendance Marked',
        message: res.message || 'Marked present successfully!',
      });
      loadTodayAttendance(selectedServiceId);
    } else {
      setToast({
        type: 'error',
        title: 'Check-In Notice',
        message: res.error || 'Failed to check in.',
      });
    }
  }

  // Handle Phone Update (When someone changed SIM or lost their phone)
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
      const searchRes = await usherSearchMembersAction(searchQuery);
      if (searchRes.success) setSearchResults(searchRes.members || []);
    } else {
      setToast({
        type: 'error',
        title: 'Update Failed',
        message: res.error || 'Failed to update phone number.',
      });
    }
  }

  // Handle Adding a Brand New Person
  async function handleAddNewPerson(e: React.FormEvent) {
    e.preventDefault();
    if (!newFirstName.trim() || !newPhone.trim()) {
      setToast({
        type: 'error',
        title: 'Missing Fields',
        message: 'Please provide at least a First Name and Phone Number.',
      });
      return;
    }

    setSubmittingNewPerson(true);
    const res = await usherRegisterPersonAction({
      firstName: newFirstName,
      lastName: newLastName,
      phone: newPhone,
      category: newCategory,
      status: newStatus,
      serviceScheduleId: markAttendanceImmediately ? selectedServiceId : undefined,
    });
    setSubmittingNewPerson(false);

    if (res.success) {
      setToast({
        type: 'success',
        title: 'Person Added',
        message: res.message || 'Registered into church database!',
      });
      setShowAddPersonModal(false);
      setNewFirstName('');
      setNewLastName('');
      setNewPhone('');
      setNewCategory(PersonCategory.ADULT);
      setNewStatus(PersonStatus.MEMBER);

      if (markAttendanceImmediately) {
        loadTodayAttendance(selectedServiceId);
      }
    } else {
      setToast({
        type: 'error',
        title: 'Registration Error',
        message: res.error || 'Could not register person.',
      });
    }
  }

  const serviceOptions = services.map((svc) => ({
    value: svc.id,
    label: svc.name,
    sublabel: `${svc.startTime} - ${svc.endTime}`,
  }));

  const categoryOptions = [
    { value: 'ADULT', label: 'Adult' },
    { value: 'YOUTH', label: 'Youth' },
    { value: 'WORKER', label: 'Worker' },
    { value: 'CHILD', label: 'Child' },
  ];

  const statusOptions = [
    { value: 'MEMBER', label: 'Member' },
    { value: 'FIRST_TIMER', label: 'First-Timer' },
    { value: 'EVANGELISM', label: 'Evangelism' },
  ];

  const activeServiceObj = services.find((s) => s.id === selectedServiceId);

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

      {/* Category Excel Export Modal */}
      <ExportExcelModal
        isOpen={showExportModal}
        onClose={() => setShowExportModal(false)}
        records={todayRecords}
        counts={categoryCounts}
        timeframeLabel={activeServiceObj ? activeServiceObj.name : 'Today'}
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

      {/* Top Header */}
      <header className="border-b border-slate-200/80 bg-white/90 backdrop-blur-md sticky top-0 z-30 px-4 py-3 shadow-xs">
        <div className="max-w-3xl mx-auto flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Link
              href="/"
              className="text-xs text-slate-500 hover:text-blue-600 transition-colors p-1.5 rounded-lg hover:bg-slate-100 flex items-center gap-1 font-bold cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Door</span>
            </Link>
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
                  Assisted Check-In & Directory
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 text-xs">
            <button
              type="button"
              onClick={() => setShowAddPersonModal(true)}
              className="bg-blue-600 hover:bg-blue-700 text-white font-bold px-3 py-1.5 rounded-xl shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <UserPlus className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Add Person</span>
            </button>

            <button
              type="button"
              onClick={() => setShowExportModal(true)}
              className="bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 font-bold px-3 py-1.5 rounded-xl shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer"
              title="Download Excel Spreadsheet"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-blue-600" />
              <span className="hidden sm:inline">Excel</span>
            </button>

            <span className="bg-blue-50 text-blue-700 border border-blue-200 px-2.5 py-1 rounded-full font-bold flex items-center gap-1">
              <UserCheck className="w-3.5 h-3.5" />
              <span>{todayRecords.length}</span>
            </span>
          </div>
        </div>
      </header>

      {/* Main Body */}
      <main className="flex-1 max-w-2xl w-full mx-auto p-4 space-y-4 relative z-10">
        {/* Service Selector & Tabs */}
        <div className="bg-white/95 backdrop-blur-md border border-slate-200 rounded-3xl p-4 sm:p-5 shadow-xs space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-blue-600" />
              <span>Recording For Service:</span>
            </label>
            <div className="sm:w-64">
              <CustomDropdown
                value={selectedServiceId}
                onChange={(val) => {
                  setSelectedServiceId(val);
                  loadTodayAttendance(val);
                }}
                options={serviceOptions}
              />
            </div>
          </div>

          {/* Toggle between Search & Today's Attendance List */}
          <div className="flex rounded-2xl bg-slate-100 p-1 border border-slate-200">
            <button
              type="button"
              onClick={() => setActiveTab('SEARCH')}
              className={`flex-1 py-2 text-xs font-bold rounded-xl transition-colors flex items-center justify-center gap-1.5 cursor-pointer ${
                activeTab === 'SEARCH'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Search className="w-3.5 h-3.5" />
              <span>Member Search</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('TODAY_LIST')}
              className={`flex-1 py-2 text-xs font-bold rounded-xl transition-colors flex items-center justify-center gap-1.5 cursor-pointer ${
                activeTab === 'TODAY_LIST'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <ClipboardList className="w-3.5 h-3.5" />
              <span>Today&apos;s Roll Call ({todayRecords.length})</span>
            </button>
          </div>
        </div>

        {/* TAB 1: SEARCH & 1-TAP CHECK-IN */}
        {activeTab === 'SEARCH' && (
          <div className="space-y-3">
            {/* Search Input Bar */}
            <div className="relative">
              <input
                type="text"
                autoFocus
                placeholder="Search by first name, last name, or phone number..."
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

            {/* Quick Status / Guidance */}
            {searchQuery.trim().length === 0 && (
              <div className="bg-white/90 backdrop-blur-md border border-slate-200 rounded-3xl p-8 text-center space-y-2">
                <Search className="w-8 h-8 text-slate-300 mx-auto" />
                <p className="text-xs font-semibold text-slate-700">
                  Search any member to mark attendance or update phone details
                </p>
                <p className="text-[11px] text-slate-500">
                  Example: Type <strong className="text-slate-700">&quot;Ade&quot;</strong> or{' '}
                  <strong className="text-slate-700">&quot;0802&quot;</strong>
                </p>
              </div>
            )}

            {searching && (
              <div className="text-center py-6 text-xs text-slate-500 font-medium">
                Searching church directory...
              </div>
            )}

            {/* Search Results List */}
            {searchQuery.trim().length >= 2 && !searching && searchResults.length === 0 && (
              <div className="bg-white/90 backdrop-blur-md border border-slate-200 rounded-3xl p-8 text-center space-y-3">
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
                  <span>Register &quot;{searchQuery}&quot; as New Person</span>
                </button>
              </div>
            )}

            <div className="space-y-2">
              {searchResults.map((person) => {
                const isAlreadyCheckedIn = todayRecords.some(
                  (r) => r.personId === person.id && r.serviceScheduleId === selectedServiceId
                );

                return (
                  <div
                    key={person.id}
                    className="bg-white/95 backdrop-blur-md border border-slate-200 rounded-3xl p-4 flex items-center justify-between gap-3 shadow-xs hover:border-slate-300 transition-colors"
                  >
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-slate-900">
                          {person.firstName} {person.lastName}
                        </span>
                        <span className="text-[10px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full font-semibold">
                          {person.category}
                        </span>
                      </div>
                      <div className="text-xs text-slate-500 flex items-center gap-2">
                        <span>{person.phone}</span>
                        <span>•</span>
                        <span className="font-mono text-blue-700 font-semibold">
                          PIN: {person.phoneLast4}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setEditingPerson(person);
                          setNewPhoneNumber(person.phone);
                        }}
                        className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-colors cursor-pointer"
                        title="Update Phone Number"
                      >
                        <Edit3 className="w-4 h-4" />
                      </button>

                      {isAlreadyCheckedIn ? (
                        <span className="px-3 py-1.5 text-xs font-bold rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-1">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>Present</span>
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleUsherCheckIn(person)}
                          className="px-3.5 py-1.5 text-xs font-bold rounded-xl bg-blue-600 hover:bg-blue-700 text-white shadow-xs transition-colors flex items-center gap-1 cursor-pointer"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>Mark Present</span>
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* TAB 2: TODAY'S LIVE ROLL CALL */}
        {activeTab === 'TODAY_LIST' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-700">
                Total Check-Ins: <strong className="text-blue-700">{todayRecords.length}</strong>
              </span>
              <button
                type="button"
                onClick={() => setShowExportModal(true)}
                className="text-xs text-blue-600 hover:underline font-bold flex items-center gap-1 cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Export to Excel</span>
              </button>
            </div>

            {todayRecords.length === 0 ? (
              <div className="bg-white/90 backdrop-blur-md border border-slate-200 rounded-3xl p-8 text-center space-y-2">
                <ClipboardList className="w-8 h-8 text-slate-300 mx-auto" />
                <p className="text-xs font-semibold text-slate-700">No attendance marked for this service yet.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {todayRecords.map((r: any) => (
                  <div
                    key={r.id}
                    className="bg-white/95 backdrop-blur-md border border-slate-200 rounded-2xl p-3 flex items-center justify-between text-xs shadow-xs"
                  >
                    <div>
                      <span className="font-bold text-slate-900 block">
                        {r.person?.firstName} {r.person?.lastName}
                      </span>
                      <span className="text-[11px] text-slate-500 font-mono">
                        {new Date(r.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}{' '}
                        • {r.person?.category}
                      </span>
                    </div>

                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        r.method === 'QR_SELF'
                          ? 'bg-blue-50 text-blue-700 border border-blue-200'
                          : 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      {r.method === 'QR_SELF' ? 'Self Check-In' : 'Usher Marked'}
                    </span>
                  </div>
                ))}
              </div>
            )}
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

        {/* MODAL 2: ADD BRAND NEW PERSON TO DATABASE */}
        {showAddPersonModal && (
          <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs z-50 flex items-center justify-center p-4">
            <div className="bg-white border border-slate-200 rounded-3xl p-6 max-w-sm w-full space-y-4 shadow-xl animate-in zoom-in-95 duration-150">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                  <UserPlus className="w-4 h-4 text-blue-600" />
                  <span>Add Person to Church Database</span>
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
                  <label className="text-slate-700 font-bold block mb-1">Phone Number *</label>
                  <input
                    type="tel"
                    required
                    value={newPhone}
                    onChange={(e) => setNewPhone(e.target.value)}
                    placeholder="e.g. 08023456789"
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <CustomDropdown
                      label="Category"
                      value={newCategory}
                      onChange={(val) => setNewCategory(val as PersonCategory)}
                      options={categoryOptions}
                    />
                  </div>

                  <div>
                    <CustomDropdown
                      label="Status"
                      value={newStatus}
                      onChange={(val) => setNewStatus(val as PersonStatus)}
                      options={statusOptions}
                    />
                  </div>
                </div>

                <div className="pt-1 flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="markNow"
                    checked={markAttendanceImmediately}
                    onChange={(e) => setMarkAttendanceImmediately(e.target.checked)}
                    className="w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500 cursor-pointer"
                  />
                  <label htmlFor="markNow" className="text-slate-700 font-semibold cursor-pointer">
                    Mark present for current service now
                  </label>
                </div>

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
