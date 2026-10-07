'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  CheckCircle2,
  AlertCircle,
  MapPin,
  Clock,
  Users,
  Sparkles,
  ArrowRight,
  ShieldCheck,
  RotateCcw,
  BookOpen,
  User,
  Calendar,
  ShieldAlert,
  MapPinOff,
  Lock,
  ChevronDown,
  ChevronUp,
  Check,
} from 'lucide-react';
import {
  getActiveServiceAction,
  lookupMemberByLast4Action,
  selfCheckInAction,
  registerFirstTimerAction,
} from './actions/attendance';
import { isWithinChurchGeofence } from '@/lib/geo';
import Toast from './components/Toast';
import AmbientBackground from './components/AmbientBackground';
import EntranceSplash from './components/EntranceSplash';

// Weekly / Sunday Encouraging Scriptures
const SUNDAY_SCRIPTURES = [
  { verse: "I was glad when they said unto me, Let us go into the house of the LORD.", ref: "Psalm 122:1" },
  { verse: "For where two or three gather in my name, there am I with them.", ref: "Matthew 18:20" },
  { verse: "Not forsaking the assembling of ourselves together... but exhorting one another.", ref: "Hebrews 10:25" },
];

export default function MemberCheckInPortal() {
  // Service & Church state
  const [loading, setLoading] = useState(true);
  const [church, setChurch] = useState<any>(null);
  const [activeService, setActiveService] = useState<any>(null);
  const [concurrentServices, setConcurrentServices] = useState<any[]>([]);
  const [portalSubtitle, setPortalSubtitle] = useState<string>('Attendance Portal');

  // Live / Off-Hours State
  const [isLiveNow, setIsLiveNow] = useState<boolean>(true);
  const [isOvertime, setIsOvertime] = useState<boolean>(false);
  const [nigerianTime, setNigerianTime] = useState<string>('');
  const [nextUpcomingService, setNextUpcomingService] = useState<any>(null);
  const [showBulletin, setShowBulletin] = useState<boolean>(false);

  // Remembered Member State (Auto-Fill / 1-Tap Check-In for returning members)
  const [savedMember, setSavedMember] = useState<{ id: string; name: string; phoneLast4: string } | null>(null);

  // Geolocation state (100% automated background check)
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [distanceMeters, setDistanceMeters] = useState<number | null>(null);
  const [geoAllowed, setGeoAllowed] = useState<boolean | null>(null);
  const [geoChecking, setGeoChecking] = useState<boolean>(true);
  const [geoErrorType, setGeoErrorType] = useState<'PERMISSION_DENIED' | 'POSITION_UNAVAILABLE' | 'TIMEOUT' | 'HTTPS_REQUIRED' | null>(null);
  const [showEntranceSplash, setShowEntranceSplash] = useState<boolean>(true);

  const router = useRouter();

  // Device-level Anti-Proxy Check-In Lock
  const [deviceCheckInLock, setDeviceCheckInLock] = useState<{
    personId: string;
    name: string;
    serviceId: string;
    serviceName: string;
    date: string;
    time: string;
  } | null>(null);

  // User flow state: 'INPUT' | 'COLLISION_CHOICE' | 'FIRST_TIMER_FORM' | 'SUCCESS'
  const [step, setStep] = useState<'INPUT' | 'COLLISION_CHOICE' | 'FIRST_TIMER_FORM' | 'SUCCESS'>('INPUT');

  // Input & Member state
  const [digits, setDigits] = useState<string>('');
  const [lookupLoading, setLookupLoading] = useState(false);
  const [matchedMembers, setMatchedMembers] = useState<any[]>([]);
  const [selectedMember, setSelectedMember] = useState<any>(null);
  const [selectedSubClass, setSelectedSubClass] = useState<string>('ADULT');

  // First timer form state
  const [ftFirstName, setFtFirstName] = useState('');
  const [ftLastName, setFtLastName] = useState('');
  const [ftPhone, setFtPhone] = useState('');

  // Status/Feedback messages
  const [feedbackMessage, setFeedbackMessage] = useState<{ type: 'error' | 'success' | 'info'; text: string } | null>(null);

  // Selected Scripture
  const [scripture] = useState(SUNDAY_SCRIPTURES[0]);

  // 1. On Mount: Check localStorage for returning member & anti-proxy device lock, load service + location, and fetch DB stats
  useEffect(() => {
    // Check if phone remembers this member from previous Sunday
    if (typeof window !== 'undefined') {
      try {
        const stored = localStorage.getItem('rccg_saved_member');
        if (stored) {
          const parsed = JSON.parse(stored);
          if (parsed && parsed.name && parsed.id) {
            setSavedMember(parsed);
          }
        }

        // Anti-proxy check: Has this phone logged attendance previously?
        const storedCheckIn = localStorage.getItem('rccg_completed_checkin');
        if (storedCheckIn) {
          const parsedCheckIn = JSON.parse(storedCheckIn);
          const todayStr = new Date().toISOString().split('T')[0];
          // If the stored pass is from an earlier day, clear it so member can mark for today
          if (parsedCheckIn && parsedCheckIn.date !== todayStr) {
            localStorage.removeItem('rccg_completed_checkin');
          }
        }
      } catch (e) {
        console.warn('Could not read from localStorage', e);
      }
    }

    loadActiveServiceAndLocation();

    // Automatically check for service transitions every 30 seconds so when
    // it's time for the next service, the portal switches automatically
    const pollInterval = setInterval(() => {
      loadActiveServiceAndLocation();
    }, 30000);

    return () => clearInterval(pollInterval);
  }, [router]);

  async function loadActiveServiceAndLocation(retryCount = 0) {
    setLoading(true);
    try {
      const res = await getActiveServiceAction();
      if (res.success && res.church) {
        setChurch(res.church);
        if (res.activeService) {
          setActiveService(res.activeService);
        }
        if (res.concurrentServices) {
          setConcurrentServices(res.concurrentServices);
        }
        if (res.portalSubtitle) {
          setPortalSubtitle(res.portalSubtitle);
        }
        if (res.isLiveNow !== undefined) {
          setIsLiveNow(res.isLiveNow);
        }
        if (res.isOvertime !== undefined) {
          setIsOvertime(res.isOvertime);
        }
        if (res.nigerianTimeFormatted) {
          setNigerianTime(res.nigerianTimeFormatted);
        }
        if (res.nextUpcomingService) {
          setNextUpcomingService(res.nextUpcomingService);
        }

        // Dynamic Anti-Proxy & Service-Bound Lock:
        // Only lock if user already marked attendance for THIS exact service today!
        if (typeof window !== 'undefined' && res.activeService) {
          try {
            const storedCheckIn = localStorage.getItem('rccg_completed_checkin');
            if (storedCheckIn) {
              const parsed = JSON.parse(storedCheckIn);
              const todayStr = new Date().toISOString().split('T')[0];
              if (parsed && parsed.serviceId === res.activeService.id && parsed.date === todayStr) {
                setDeviceCheckInLock(parsed);
                router.replace('/welcome');
                return;
              } else {
                // It is time for the next church service! Release the device lock.
                setDeviceCheckInLock(null);
              }
            }
          } catch (lockErr) {
            console.warn('Service lock parse error:', lockErr);
          }
        }

        // Automatically verify location in the background
        executeLocationCheck(undefined, res.church);
        // Ensure no error toast is showing
        setFeedbackMessage(null);
      } else if (retryCount < 2) {
        // Retry silently in background without flashing any error
        setTimeout(() => loadActiveServiceAndLocation(retryCount + 1), 350);
        return;
      }
    } catch (e) {
      console.warn('Initial service load error:', e);
      if (retryCount < 2) {
        setTimeout(() => loadActiveServiceAndLocation(retryCount + 1), 350);
        return;
      }
    }
    setLoading(false);
  }

  // Explicit, context-first location check
  function executeLocationCheck(
    mockCoords?: { latitude: number; longitude: number },
    overrideChurch?: any
  ): Promise<boolean> {
    const targetChurch = overrideChurch || church;
    if (!targetChurch) {
      setGeoChecking(false);
      return Promise.resolve(false);
    }

    setGeoChecking(true);
    setGeoErrorType(null);

    // Mobile browsers strictly require HTTPS for geolocation
    if (
      typeof window !== 'undefined' &&
      !window.isSecureContext &&
      window.location.hostname !== 'localhost' &&
      window.location.hostname !== '127.0.0.1'
    ) {
      setGeoErrorType('HTTPS_REQUIRED');
      setGeoAllowed(false);
      setGeoChecking(false);
      return Promise.resolve(false);
    }

    if (mockCoords) {
      setUserLocation({ lat: mockCoords.latitude, lng: mockCoords.longitude });
      const check = isWithinChurchGeofence(
        mockCoords,
        { latitude: targetChurch.latitude, longitude: targetChurch.longitude },
        targetChurch.geofenceRadius || 150
      );
      setDistanceMeters(check.distanceMeters);
      setGeoAllowed(check.isAllowed);
      setGeoChecking(false);
      return Promise.resolve(check.isAllowed);
    }

    return new Promise((resolve) => {
      if (typeof window !== 'undefined' && 'geolocation' in navigator) {
        navigator.geolocation.getCurrentPosition(
          (position) => {
            const userCoords = {
              latitude: position.coords.latitude,
              longitude: position.coords.longitude,
              accuracy: position.coords.accuracy,
            };
            setUserLocation({ lat: userCoords.latitude, lng: userCoords.longitude });

            const check = isWithinChurchGeofence(
              userCoords,
              { latitude: targetChurch.latitude, longitude: targetChurch.longitude },
              {
                maxRadiusMeters: targetChurch.geofenceRadius || 150,
                hysteresisBufferMeters: 35,
                isPreviouslyInside: Boolean(geoAllowed),
              }
            );

            setDistanceMeters(check.distanceMeters);
            setGeoAllowed(check.isAllowed);
            setGeoChecking(false);
            setGeoErrorType(null);
            resolve(check.isAllowed);
          },
          (error) => {
            console.warn('Geolocation check failed or denied:', error.code, error.message);
            if (error.code === 1) { // PERMISSION_DENIED
              setGeoErrorType('PERMISSION_DENIED');
            } else if (error.code === 2) { // POSITION_UNAVAILABLE
              setGeoErrorType('POSITION_UNAVAILABLE');
            } else if (error.code === 3) { // TIMEOUT
              setGeoErrorType('TIMEOUT');
            }
            setGeoAllowed(false);
            setGeoChecking(false);
            resolve(false);
          },
          { enableHighAccuracy: true, timeout: 10000, maximumAge: 15000 }
        );
      } else {
        setGeoErrorType('HTTPS_REQUIRED');
        setGeoAllowed(false);
        setGeoChecking(false);
        resolve(false);
      }
    });
  }

  // Clean numeric-only input handler (Strictly 4 numbers)
  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const raw = e.target.value;
    const sanitized = raw.replace(/\D/g, '').slice(0, 4);
    setDigits(sanitized);
    setFeedbackMessage(null);
  }

  // Trigger search on submit
  async function handleFindAndMarkAttendance(e?: React.FormEvent) {
    if (e) e.preventDefault();

    if (!digits || digits.length !== 4) {
      setFeedbackMessage({ type: 'error', text: 'Please enter all 4 digits of your phone number.' });
      return;
    }

    setLookupLoading(true);
    setFeedbackMessage(null);

    const res = await lookupMemberByLast4Action(digits);
    setLookupLoading(false);

    if (!res.success) {
      setFeedbackMessage({ type: 'error', text: res.error || 'Lookup failed.' });
      return;
    }

    if (res.count === 0) {
      setStep('FIRST_TIMER_FORM');
      setFtPhone('');
    } else if (res.count === 1 && res.members) {
      setSelectedMember(res.members[0]);
    } else {
      setMatchedMembers(res.members || []);
      setStep('COLLISION_CHOICE');
    }
  }

  function handleReset() {
    setDigits('');
    setFeedbackMessage(null);
    setMatchedMembers([]);
    setSelectedMember(null);
    setStep('INPUT');
  }

  // Save member to localStorage so they never have to type digits on return visits!
  function rememberMemberOnDevice(id: string, name: string, last4: string) {
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem(
          'rccg_saved_member',
          JSON.stringify({ id, name, phoneLast4: last4 })
        );
        setSavedMember({ id, name, phoneLast4: last4 });
      } catch (e) {
        console.warn('Could not save to localStorage', e);
      }
    }
  }

  function forgetMemberOnDevice() {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('rccg_saved_member');
      setSavedMember(null);
    }
  }

  // Confirm Check-in for a member
  async function handleConfirmCheckIn(person: any) {
    if (!activeService) {
      setFeedbackMessage({ type: 'error', text: 'No active church service detected.' });
      return;
    }

    // Guard: in-person attendance strictly requires being within church grounds
    if (!geoAllowed) {
      setFeedbackMessage({ type: 'error', text: 'You must be within RCCG Jesus Covenant Zone premises (150m) to check in.' });
      return;
    }

    setLookupLoading(true);
    const res = await selfCheckInAction({
      personId: person.id,
      serviceScheduleId: activeService.id,
      subClass: activeService.hasSubClasses ? selectedSubClass : undefined,
      userLatitude: userLocation?.lat,
      userLongitude: userLocation?.lng,
    });
    setLookupLoading(false);

    if (res.success) {
      const memberFullName = `${person.firstName} ${person.lastName || ''}`.trim();
      const todayDate = new Date().toISOString().split('T')[0];
      const slipData = {
        personId: person.id,
        name: memberFullName,
        serviceId: activeService.id,
        serviceName: activeService.name,
        date: todayDate,
        time: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
      };

      if (typeof window !== 'undefined') {
        localStorage.setItem('rccg_completed_checkin', JSON.stringify(slipData));
      }
      setDeviceCheckInLock(slipData);

      // Remember this member on this phone for 1-tap check-in next Sunday!
      rememberMemberOnDevice(
        person.id,
        memberFullName,
        person.phoneLast4 || digits
      );

      setSelectedMember(person);
      setFeedbackMessage({ type: 'success', text: res.message || 'Check-in confirmed!' });
      setStep('SUCCESS');

      // Automatically navigate worshipper to Sunday Worship Hub & Attendance Pass (replace history)
      setTimeout(() => {
        router.replace('/welcome');
      }, 1400);
    } else {
      setFeedbackMessage({ type: 'error', text: res.error || 'Check-in failed.' });
    }
  }

  // Quick 1-Tap Check-In for remembered returning members
  async function handleSavedMemberQuickCheckIn() {
    if (!savedMember) return;
    await handleConfirmCheckIn({
      id: savedMember.id,
      firstName: savedMember.name,
      lastName: '',
      phoneLast4: savedMember.phoneLast4,
    });
  }

  // Register First Timer
  async function handleRegisterFirstTimer(e: React.FormEvent) {
    e.preventDefault();
    if (!ftFirstName.trim() || !ftPhone.trim()) {
      setFeedbackMessage({ type: 'error', text: 'Please enter your First Name and Phone Number.' });
      return;
    }

    if (!activeService) {
      setFeedbackMessage({ type: 'error', text: 'No active service available.' });
      return;
    }

    if (!geoAllowed) {
      setFeedbackMessage({ type: 'error', text: 'You must be within RCCG Jesus Covenant Zone premises (150m) to register.' });
      return;
    }

    setLookupLoading(true);
    const res = await registerFirstTimerAction({
      firstName: ftFirstName,
      lastName: ftLastName || '(First-Timer)',
      phone: ftPhone,
      serviceScheduleId: activeService.id,
      subClass: activeService.hasSubClasses ? selectedSubClass : undefined,
      userLatitude: userLocation?.lat,
      userLongitude: userLocation?.lng,
    });
    setLookupLoading(false);

    if (res.success) {
      const ftFullName = `${ftFirstName} ${ftLastName}`.trim();
      const todayDate = new Date().toISOString().split('T')[0];
      const slipData = {
        personId: (res as any).personId || 'first-timer',
        name: ftFullName,
        serviceId: activeService.id,
        serviceName: activeService.name,
        date: todayDate,
        time: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
      };

      if (typeof window !== 'undefined') {
        localStorage.setItem('rccg_completed_checkin', JSON.stringify(slipData));
      }
      setDeviceCheckInLock(slipData);

      rememberMemberOnDevice(
        (res as any).personId || 'member',
        ftFullName,
        ftPhone.slice(-4)
      );

      setSelectedMember({ firstName: ftFirstName, lastName: ftLastName });
      setFeedbackMessage({ type: 'success', text: (res as any).message || 'Welcome! Your attendance is recorded.' });
      setStep('SUCCESS');

      // Automatically navigate worshipper to Sunday Worship Hub & Attendance Pass (replace history)
      setTimeout(() => {
        router.replace('/welcome');
      }, 1400);
    } else {
      setFeedbackMessage({ type: 'error', text: res.error || 'Registration failed.' });
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col justify-between selection:bg-blue-600 selection:text-white relative overflow-hidden">
      <AmbientBackground />

      {/* 1.5s GPU-accelerated Entrance Splash with RCCG 3D-depth Emblem */}
      {showEntranceSplash && (
        <EntranceSplash
          onComplete={() => setShowEntranceSplash(false)}
          churchName={church ? church.name : 'RCCG Jesus Covenant Zone'}
          isReady={!loading}
        />
      )}

      {/* Floating Toast Notification */}
      {feedbackMessage && (
        <Toast
          type={feedbackMessage.type}
          message={feedbackMessage.text}
          onClose={() => setFeedbackMessage(null)}
        />
      )}

      {/* Top Header - Official RCCG Branding */}
      <header className="border-b border-slate-200/80 bg-white/90 backdrop-blur-md sticky top-0 z-30 px-4 py-3 shadow-xs">
        <div className="max-w-md mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="relative w-11 h-11 shrink-0">
              <Image
                src="/rccg-logo.png"
                alt="RCCG Logo"
                fill
                className="object-contain"
                priority
              />
            </div>
            <div>
              <h1 className="text-sm font-bold text-slate-900 leading-tight">
                {church ? church.name : 'RCCG Jesus Covenant Zone'}
              </h1>
              <p className="text-[11px] text-blue-700 font-semibold tracking-wide">
                {portalSubtitle}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Automatic Location / Sanctuary Status Pill */}
            <div
              className={`flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1 rounded-full ${
                geoChecking
                  ? 'text-blue-700 bg-blue-50 border border-blue-200'
                  : geoAllowed
                  ? 'text-emerald-700 bg-emerald-50 border border-emerald-200'
                  : 'text-amber-800 bg-amber-50 border border-amber-200'
              }`}
            >
              <MapPin className="w-3.5 h-3.5 shrink-0" />
              <span>
                {geoChecking
                  ? 'Verifying...'
                  : geoAllowed
                  ? 'Sanctuary Verified'
                  : 'Outside Sanctuary'}
              </span>
            </div>

            {/* Live Service Indicator */}
            <div
              className={`flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1 rounded-full ${
                isLiveNow
                  ? 'text-emerald-700 bg-emerald-50 border border-emerald-200'
                  : 'text-slate-600 bg-slate-100 border border-slate-200'
              }`}
            >
              <span
                className={`w-2 h-2 rounded-full ${
                  isLiveNow ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'
                }`}
              ></span>
              <span>{isLiveNow ? 'Live' : 'Off-Hours'}</span>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-md w-full mx-auto p-4 flex flex-col justify-center space-y-4">
        {loading ? (
          <div className="text-center py-16 space-y-3">
            <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
            <p className="text-slate-500 text-sm font-medium">Loading attendance portal...</p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Elegant Daily Scripture Card (Subtle & Uplifting) */}
            <div className="bg-white/80 border border-blue-100 rounded-2xl p-3.5 shadow-2xs flex items-start gap-2.5">
              <BookOpen className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
              <div className="space-y-0.5">
                <p className="text-xs text-slate-700 italic leading-snug">
                  &ldquo;{scripture.verse}&rdquo;
                </p>
                <p className="text-[10px] text-blue-700 font-bold tracking-wide">
                  — {scripture.ref}
                </p>
              </div>
            </div>

            {/* Active / Scheduled Service Card */}
            {activeService && (
              <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-blue-700 uppercase tracking-wider">
                    <Clock className="w-3.5 h-3.5" />
                    <span>{isLiveNow ? 'Current Service' : 'Scheduled Service'}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-semibold text-slate-500 font-mono">
                      {activeService.startTime} - {activeService.endTime}
                    </span>
                    {isOvertime && (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 border border-blue-200">
                        Overtime Buffer
                      </span>
                    )}
                  </div>
                </div>

                <div className="bg-blue-50/80 border border-blue-100 rounded-xl p-3 flex items-center justify-between">
                  <div>
                    <h2 className="text-base font-bold text-blue-950">{activeService.name}</h2>
                    <p className="text-[11px] text-blue-700 font-medium">
                      {isOvertime
                        ? 'Service extended — attendance remains open'
                        : isLiveNow
                        ? 'Attendance automatically logged for this session'
                        : 'Attendance portal ready'}
                    </p>
                  </div>
                  <ShieldCheck className="w-6 h-6 text-blue-600" />
                </div>

                {/* Handover Session Selector if more than 1 service active right now */}
                {concurrentServices.length > 1 && (
                  <div className="bg-blue-50/60 border border-blue-200/80 rounded-xl p-2.5 space-y-1.5">
                    <div className="flex items-center justify-between text-[11px] font-bold text-blue-900">
                      <span>Transition Period — Select Your Service:</span>
                      <span className="text-[10px] bg-blue-100 text-blue-800 font-semibold px-1.5 py-0.5 rounded">
                        {concurrentServices.length} Active
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-1.5">
                      {concurrentServices.map((svc) => (
                        <button
                          key={svc.id}
                          type="button"
                          onClick={() => {
                            setActiveService(svc);
                            if (!svc.hasSubClasses) {
                              setSelectedSubClass('ADULT');
                            }
                          }}
                          className={`p-2 rounded-lg text-left transition-all cursor-pointer ${
                            activeService?.id === svc.id
                              ? 'bg-blue-600 text-white shadow-xs'
                              : 'bg-white border border-slate-200 text-slate-700 hover:border-blue-300'
                          }`}
                        >
                          <div className="text-xs font-bold truncate">{svc.name}</div>
                          <div className={`text-[10px] font-mono ${activeService?.id === svc.id ? 'text-blue-100' : 'text-slate-500'}`}>
                            {svc.startTime} - {svc.endTime}
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* If Sunday School, choose class */}
                {activeService.hasSubClasses && (
                  <div className="pt-2 border-t border-slate-100 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-slate-700">Choose Your Class:</span>
                      <div className="flex gap-1.5 bg-slate-100 p-1 rounded-lg">
                        <button
                          type="button"
                          onClick={() => setSelectedSubClass('ADULT')}
                          className={`text-xs px-3 py-1 rounded-md font-bold transition-all cursor-pointer ${
                            selectedSubClass === 'ADULT'
                              ? 'bg-blue-600 text-white shadow-xs'
                              : 'text-slate-600 hover:text-slate-900'
                          }`}
                        >
                          Adult Class
                        </button>
                        <button
                          type="button"
                          onClick={() => setSelectedSubClass('YOUTH')}
                          className={`text-xs px-3 py-1 rounded-md font-bold transition-all cursor-pointer ${
                            selectedSubClass === 'YOUTH'
                              ? 'bg-blue-600 text-white shadow-xs'
                              : 'text-slate-600 hover:text-slate-900'
                          }`}
                        >
                          Youth Class
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* Geofence Status */}
                <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1 border-t border-slate-100">
                  <div className="flex items-center gap-1.5 font-medium">
                    <MapPin className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                    {geoChecking ? (
                      <span className="text-blue-600 font-semibold animate-pulse">Verifying church grounds...</span>
                    ) : geoAllowed ? (
                      <span className="text-emerald-700 font-semibold">
                        Church Grounds Verified ({distanceMeters !== null ? `${distanceMeters}m away` : 'inside 150m'})
                      </span>
                    ) : (
                      <span className="text-amber-800 font-semibold">
                        Outside Sanctuary ({distanceMeters !== null ? `${distanceMeters}m away` : 'within 150m required'})
                      </span>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => executeLocationCheck()}
                    title="Refresh GPS"
                    className="text-[11px] text-blue-600 hover:text-blue-800 font-bold flex items-center gap-1 cursor-pointer"
                  >
                    <RotateCcw className="w-3 h-3" />
                    <span>Refresh</span>
                  </button>
                </div>
              </div>
            )}

            {/* FEEDBACK POPUP: Green for success, Red for error */}
            {feedbackMessage && (
              <div
                className={`p-3.5 rounded-xl text-xs font-semibold border flex items-start gap-2.5 shadow-xs transition-all ${
                  feedbackMessage.type === 'error'
                    ? 'bg-red-50 border-red-200 text-red-700'
                    : feedbackMessage.type === 'success'
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                    : 'bg-blue-50 border-blue-200 text-blue-700'
                }`}
              >
                {feedbackMessage.type === 'error' ? (
                  <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                ) : (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                )}
                <span className="leading-tight">{feedbackMessage.text}</span>
              </div>
            )}

            {/* STEP: SUCCESS CELEBRATION */}
            {step === 'SUCCESS' && (
              <div className="bg-white border border-slate-200 rounded-3xl p-8 shadow-md text-center space-y-5 animate-in zoom-in-95 duration-200">
                <div className="w-20 h-20 rounded-full bg-emerald-50 border-2 border-emerald-500 text-emerald-600 flex items-center justify-center mx-auto shadow-xs">
                  <CheckCircle2 className="w-12 h-12" />
                </div>

                <div className="space-y-1">
                  <h3 className="text-xl font-bold text-slate-900">Attendance Recorded!</h3>
                  <p className="text-sm text-slate-700 font-medium">
                    Welcome, <strong className="text-blue-600">{selectedMember?.firstName}</strong>.
                  </p>
                  <p className="text-xs text-slate-500">Redirecting you to the Sunday Worship Hub...</p>
                </div>

                <Link
                  href="/welcome"
                  className="w-full py-3.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer"
                >
                  <span>Proceed to Sunday Worship Hub</span>
                  <ArrowRight className="w-4 h-4" />
                </Link>
              </div>
            )}

            {/* AUTOMATED GEOFENCE GATEWAY: Checking Sanctuary GPS */}
            {step !== 'SUCCESS' && geoChecking && (
              <div className="bg-white border border-slate-200 rounded-3xl p-8 shadow-xs text-center space-y-4">
                <div className="w-14 h-14 rounded-full bg-blue-50 border-2 border-blue-200 text-blue-600 flex items-center justify-center mx-auto animate-pulse">
                  <MapPin className="w-7 h-7" />
                </div>
                <div className="space-y-1.5">
                  <h3 className="text-base font-bold text-slate-900">Verifying Sanctuary Location</h3>
                  <p className="text-xs text-slate-500 max-w-xs mx-auto leading-relaxed">
                    Connecting to GPS to confirm you are within church grounds at RCCG Jesus Covenant Zone...
                  </p>
                </div>
                <div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
              </div>
            )}

            {/* AUTOMATED GEOFENCE GATEWAY: Outside Sanctuary Grounds */}
            {step !== 'SUCCESS' && !geoChecking && !geoAllowed && (
              <div className="bg-white border border-amber-200 rounded-3xl p-6 shadow-xs text-center space-y-4 animate-in fade-in duration-200">
                <div className="w-14 h-14 rounded-full bg-amber-50 border-2 border-amber-300 text-amber-600 flex items-center justify-center mx-auto">
                  <AlertCircle className="w-7 h-7" />
                </div>
                <div className="space-y-1.5">
                  <h3 className="text-base font-bold text-slate-900">Sanctuary Attendance Only</h3>
                  <p className="text-xs text-slate-600 leading-relaxed max-w-sm mx-auto">
                    In-person check-in is restricted to worshippers inside or within 150m of <strong>RCCG Jesus Covenant Zone</strong>.
                  </p>
                  {distanceMeters !== null && (
                    <p className="text-[11px] text-amber-800 font-semibold bg-amber-50 rounded-lg py-1 px-2.5 inline-block border border-amber-200">
                      Current position: ~{distanceMeters}m away from church grounds
                    </p>
                  )}
                </div>

                {/* Specific Browser/Device Troubleshooting if Location Failed */}
                {geoErrorType === 'PERMISSION_DENIED' && (
                  <div className="bg-amber-50/90 border border-amber-200 rounded-2xl p-3.5 text-left space-y-2">
                    <div className="flex items-center gap-2 text-xs font-bold text-amber-950">
                      <Lock className="w-4 h-4 text-amber-700 shrink-0" />
                      <span>Chrome is blocking location for this site</span>
                    </div>
                    <p className="text-[11px] text-amber-800 leading-snug">
                      If Chrome doesn&apos;t show the popup notification, permissions were previously blocked. To allow it:
                    </p>
                    <div className="bg-white/90 rounded-xl p-2.5 space-y-1 text-[11px] text-slate-700 border border-amber-200/80 font-medium">
                      <p>1. Tap the <strong>lock 🔒 or tune icon</strong> at the left of the website address bar above.</p>
                      <p>2. Tap <strong>Permissions</strong> (or <strong>Site settings</strong>).</p>
                      <p>3. Set <strong>Location</strong> to <strong>Allow</strong>.</p>
                      <p>4. Tap <strong>Refresh GPS Location</strong> below.</p>
                    </div>
                  </div>
                )}

                {geoErrorType === 'POSITION_UNAVAILABLE' && (
                  <div className="bg-amber-50/90 border border-amber-200 rounded-2xl p-3.5 text-left space-y-1.5">
                    <div className="flex items-center gap-2 text-xs font-bold text-amber-950">
                      <MapPinOff className="w-4 h-4 text-amber-700 shrink-0" />
                      <span>Phone GPS / Location is turned OFF</span>
                    </div>
                    <p className="text-[11px] text-amber-800 leading-relaxed">
                      Please swipe down your phone&apos;s quick settings menu, turn ON <strong>Location / GPS</strong>, and tap Refresh below.
                    </p>
                  </div>
                )}

                {geoErrorType === 'HTTPS_REQUIRED' && (
                  <div className="bg-rose-50 border border-rose-200 rounded-2xl p-3.5 text-left space-y-1.5">
                    <div className="flex items-center gap-2 text-xs font-bold text-rose-950">
                      <ShieldAlert className="w-4 h-4 text-rose-700 shrink-0" />
                      <span>Secure Connection (HTTPS) Required</span>
                    </div>
                    <p className="text-[11px] text-rose-800 leading-relaxed">
                      Mobile Chrome strictly blocks GPS over insecure HTTP connections. Please access via HTTPS.
                    </p>
                  </div>
                )}

                <div className="pt-2">
                  <button
                    type="button"
                    onClick={() => executeLocationCheck()}
                    className="w-full py-3.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl shadow-xs transition-all flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <RotateCcw className="w-4 h-4" />
                    <span>Refresh GPS Location</span>
                  </button>
                </div>
              </div>
            )}

            {/* SANCTUARY ACCESS GRANTED: 4-Digit Input & Check-In */}
            {step !== 'SUCCESS' && !geoChecking && geoAllowed && (
              <>
                {deviceCheckInLock ? (
                  /* Anti-Proxy Device Lock Card */
                  <div className="bg-white border-2 border-emerald-300 rounded-3xl p-6 shadow-md text-center space-y-4 animate-in fade-in duration-200">
                    <div className="w-16 h-16 rounded-full bg-emerald-50 border-2 border-emerald-500 text-emerald-600 flex items-center justify-center mx-auto shadow-xs">
                      <CheckCircle2 className="w-9 h-9" />
                    </div>

                    <div className="space-y-1">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-800 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200 inline-block">
                        Attendance Already Marked
                      </span>
                      <h3 className="text-xl font-bold text-slate-900 pt-1">
                        {deviceCheckInLock.name}
                      </h3>
                      <p className="text-xs text-slate-500">
                        Attendance recorded for <strong className="text-slate-800">{deviceCheckInLock.serviceName}</strong> at {deviceCheckInLock.time || 'earlier'}.
                      </p>
                    </div>

                    <div className="bg-amber-50 rounded-2xl p-3.5 text-[11px] text-amber-900 border border-amber-200/80 text-left space-y-1">
                      <p className="font-bold flex items-center gap-1.5 text-amber-950">
                        <ShieldCheck className="w-4 h-4 text-amber-700" />
                        <span>Single-Device Attendance Policy</span>
                      </p>
                      <p className="text-[11px] text-amber-800 leading-relaxed">
                        To maintain attendance integrity, proxy check-in is not permitted. This phone is locked to your pass until the next scheduled church service begins.
                      </p>
                    </div>

                    <Link
                      href="/welcome"
                      className="w-full py-4 bg-slate-950 hover:bg-slate-900 text-white font-bold text-xs rounded-2xl shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer"
                    >
                      <span>View My Verified Attendance Pass</span>
                      <ArrowRight className="w-4 h-4 text-emerald-400" />
                    </Link>
                  </div>
                ) : (
                  <>
                    {/* AUTO-FILL CARD: Returning Member (1-Tap Check-In) */}
                    {savedMember && step === 'INPUT' && !selectedMember && (
                  <div className="bg-blue-50/70 border-2 border-blue-200 rounded-3xl p-5 shadow-xs space-y-3.5">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2.5">
                        <div className="w-10 h-10 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold">
                          <User className="w-5 h-5" />
                        </div>
                        <div>
                          <span className="text-[11px] font-bold text-blue-700 uppercase tracking-wider">
                            Welcome Back
                          </span>
                          <h3 className="text-base font-bold text-slate-900 leading-tight">
                            {savedMember.name}
                          </h3>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={forgetMemberOnDevice}
                        className="text-[11px] text-slate-400 hover:text-slate-600 underline cursor-pointer"
                      >
                        Switch account
                      </button>
                    </div>

                    <button
                      type="button"
                      disabled={lookupLoading}
                      onClick={handleSavedMemberQuickCheckIn}
                      className="w-full py-3.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm rounded-2xl shadow-sm transition-all flex items-center justify-center gap-2 cursor-pointer"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      <span>{lookupLoading ? 'Recording...' : '1-Tap: Mark My Attendance'}</span>
                    </button>
                  </div>
                )}

                {/* STEP 1: CLEAN 4-DIGIT INPUT (Opens native phone numeric dialpad) */}
                {step === 'INPUT' && !selectedMember && (
                  <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-xs space-y-5">
                    <div className="text-center space-y-1">
                      <h2 className="text-lg font-bold text-slate-900">
                        {savedMember ? 'Or Enter 4 Digits' : 'Mark Your Attendance'}
                      </h2>
                      <p className="text-xs text-slate-500 font-medium">
                        Type the last 4 digits of your phone number
                      </p>
                    </div>

                    <form onSubmit={handleFindAndMarkAttendance} className="space-y-4">
                      <div>
                        <input
                          type="text"
                          inputMode="numeric"
                          pattern="[0-9]*"
                          maxLength={4}
                          placeholder="• • • •"
                          value={digits}
                          onChange={handleInputChange}
                          className="w-full h-18 text-center text-4xl font-extrabold tracking-[0.5em] text-blue-900 bg-slate-50 border-2 border-slate-200 focus:border-blue-600 focus:bg-white rounded-2xl focus:outline-none transition-all placeholder:text-slate-300 placeholder:tracking-widest cursor-text"
                        />
                        <p className="text-[11px] text-slate-400 text-center mt-2 font-medium">
                          Strictly 4 digits (e.g. 4567)
                        </p>
                      </div>

                      <button
                        type="submit"
                        disabled={lookupLoading || digits.length !== 4}
                        className="w-full py-4 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-200 disabled:text-slate-400 text-white font-bold text-base rounded-2xl shadow-md shadow-blue-500/20 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:cursor-not-allowed"
                      >
                        <CheckCircle2 className="w-5 h-5" />
                        <span>{lookupLoading ? 'Checking Directory...' : 'Mark Your Attendance'}</span>
                      </button>
                    </form>
                  </div>
                )}

                {/* CONFIRMATION CARD (Single member match) */}
                {selectedMember && step === 'INPUT' && (
                  <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-md space-y-5 animate-in fade-in zoom-in-95 duration-200">
                    <div className="text-center space-y-2">
                      <div className="w-14 h-14 rounded-full bg-blue-50 border-2 border-blue-500 text-blue-600 flex items-center justify-center mx-auto shadow-xs">
                        <Sparkles className="w-7 h-7" />
                      </div>
                      <h3 className="text-lg font-bold text-slate-900">
                        Hi, {selectedMember.firstName} {selectedMember.lastName}!
                      </h3>
                      <p className="text-xs text-slate-500">
                        Member Category: <span className="text-blue-700 font-bold">{selectedMember.category}</span>
                      </p>
                    </div>

                    <div className="space-y-2">
                      <button
                        type="button"
                        disabled={lookupLoading}
                        onClick={() => handleConfirmCheckIn(selectedMember)}
                        className="w-full py-4 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-bold text-base rounded-2xl shadow-md shadow-blue-500/20 transition-all flex items-center justify-center gap-2 cursor-pointer"
                      >
                        <CheckCircle2 className="w-5 h-5" />
                        <span>{lookupLoading ? 'Recording Attendance...' : 'Yes, Confirm My Attendance'}</span>
                      </button>
                      <button
                        type="button"
                        onClick={handleReset}
                        className="w-full py-2.5 text-xs text-slate-500 hover:text-slate-800 font-medium transition-colors flex items-center justify-center gap-1 cursor-pointer"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        <span>Not you? Try another number</span>
                      </button>
                    </div>
                  </div>
                )}

                {/* STEP: COLLISION CHOICE */}
                {step === 'COLLISION_CHOICE' && (
                  <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-md space-y-4">
                    <div className="text-center space-y-1">
                      <div className="w-12 h-12 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center mx-auto mb-1">
                        <Users className="w-6 h-6" />
                      </div>
                      <h3 className="text-base font-bold text-slate-900">Which one is you?</h3>
                      <p className="text-xs text-slate-500">
                        Multiple members end in <strong className="text-blue-600 font-bold">...{digits}</strong>
                      </p>
                    </div>

                    <div className="space-y-2.5 max-h-60 overflow-y-auto">
                      {matchedMembers.map((member) => (
                        <button
                          key={member.id}
                          type="button"
                          onClick={() => handleConfirmCheckIn(member)}
                          className="w-full text-left p-3.5 bg-slate-50 hover:bg-blue-50 active:bg-blue-100 border border-slate-200 hover:border-blue-400 rounded-2xl transition-all flex items-center justify-between group cursor-pointer"
                        >
                          <div>
                            <p className="text-sm font-bold text-slate-900 group-hover:text-blue-700">
                              {member.firstName} {member.lastName}
                            </p>
                            <p className="text-[11px] text-slate-500">{member.category}</p>
                          </div>
                          <span className="text-xs bg-white border border-slate-200 px-2.5 py-1 rounded-md text-slate-700 group-hover:bg-blue-600 group-hover:text-white transition-colors font-medium flex items-center gap-1">
                            <span>Select</span>
                            <ArrowRight className="w-3 h-3" />
                          </span>
                        </button>
                      ))}
                    </div>

                    <button
                      type="button"
                      onClick={handleReset}
                      className="w-full py-2 text-xs text-slate-500 hover:text-slate-800 text-center block font-medium cursor-pointer"
                    >
                      Cancel and try again
                    </button>
                  </div>
                )}

                {/* STEP: FIRST TIMER FORM */}
                {step === 'FIRST_TIMER_FORM' && (
                  <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-md space-y-4 animate-in fade-in duration-200">
                    <div className="text-center space-y-1">
                      <div className="w-12 h-12 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center mx-auto mb-1">
                        <Sparkles className="w-6 h-6" />
                      </div>
                      <h3 className="text-base font-bold text-slate-900">Welcome to Church!</h3>
                      <p className="text-xs text-slate-500">
                        We didn&apos;t recognize <strong className="text-blue-600 font-bold">...{digits}</strong>. Are you visiting for the first time?
                      </p>
                    </div>

                    <form onSubmit={handleRegisterFirstTimer} className="space-y-3">
                      <div>
                        <label className="text-xs text-slate-700 font-semibold mb-1 block">First Name *</label>
                        <input
                          type="text"
                          required
                          placeholder="e.g. Joy"
                          value={ftFirstName}
                          onChange={(e) => setFtFirstName(e.target.value)}
                          className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                      <div>
                        <label className="text-xs text-slate-700 font-semibold mb-1 block">Last Name</label>
                        <input
                          type="text"
                          placeholder="e.g. Eze"
                          value={ftLastName}
                          onChange={(e) => setFtLastName(e.target.value)}
                          className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                      <div>
                        <label className="text-xs text-slate-700 font-semibold mb-1 block">Full Phone Number *</label>
                        <input
                          type="tel"
                          required
                          placeholder="e.g. 08012345678"
                          value={ftPhone}
                          onChange={(e) => setFtPhone(e.target.value)}
                          className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>

                      <div className="pt-2 space-y-2">
                        <button
                          type="submit"
                          disabled={lookupLoading}
                          className="w-full py-3.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm rounded-xl shadow-md shadow-blue-500/20 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                        >
                          <CheckCircle2 className="w-4 h-4" />
                          <span>{lookupLoading ? 'Checking In...' : 'Register & Mark Attendance'}</span>
                        </button>
                        <button
                          type="button"
                          onClick={handleReset}
                          className="w-full py-2 text-xs text-slate-500 hover:text-slate-800 font-medium cursor-pointer"
                        >
                          Cancel and re-type digits
                        </button>
                      </div>
                    </form>
                  </div>
                )}
                    </>
                  )}
              </>
            )}
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="py-4 text-center border-t border-slate-200 max-w-md mx-auto w-full px-4 text-xs text-slate-500 font-medium">
        <span>No phone or need assistance? Please meet an usher at the entrance.</span>
      </footer>
    </div>
  );
}
