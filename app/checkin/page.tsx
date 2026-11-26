'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion } from 'framer-motion';
import { MapPin, Clock, RefreshCw } from 'lucide-react';
import { MOMENTUM_EASE, surfaceEntranceVariants, tactileTapProps } from '@/lib/motion';
import {
  getActiveServiceAction,
  lookupByPhoneSuffix,
  registerAttendance,
  registerFirstTimerAction,
  ActiveServiceResponse,
} from '../actions/attendance';
import { isWithinChurchGeofence } from '@/lib/geo';
import { getNigerianDateString } from '@/lib/service-resolver';
import {
  getDeviceAttendanceLock,
  setDeviceAttendanceLock,
  clearDeviceAttendanceLock,
  isDeviceLockedForService,
  DeviceAttendanceLock,
} from '@/lib/device-lock';
import Toast, { ToastProps } from '../components/Toast';
import AmbientBackground from '../components/AmbientBackground';
import AttendanceHeader from '../components/attendance/AttendanceHeader';
import RememberedProfileCard, {
  SavedMemberProfile,
} from '../components/attendance/RememberedProfileCard';
import KeypadLookup from '../components/attendance/KeypadLookup';
import CollisionChoiceList, {
  CollisionMember,
} from '../components/attendance/CollisionChoiceList';
import FirstTimerForm from '../components/attendance/FirstTimerForm';
import CheckInConfirmation, {
  CheckInReceipt,
} from '../components/attendance/CheckInConfirmation';
import AntiProxyLockCard from '../components/attendance/AntiProxyLockCard';
import GeofenceGatewayAlert from '../components/attendance/GeofenceGatewayAlert';
import { PersonCategory } from '@prisma/client';

type FlowStep = 'INPUT' | 'COLLISION_CHOICE' | 'FIRST_TIMER_FORM' | 'SUCCESS';

export default function MemberCheckInPortal() {
  // Core Service & Telemetry state
  const [church, setChurch] = useState<any>(null);
  const [activeService, setActiveService] = useState<any>(null);
  const [nextUpcomingService, setNextUpcomingService] = useState<any>(null);
  const [currentTimeString, setCurrentTimeString] = useState<string>('');
  const [isLiveNow, setIsLiveNow] = useState<boolean>(false);
  const [isReady, setIsReady] = useState(false);

  // Geolocation state (strict real GPS enforced)
  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const userLocationRef = useRef<{ latitude: number; longitude: number } | null>(null);
  const [distanceMeters, setDistanceMeters] = useState<number | null>(null);
  const [geoAllowed, setGeoAllowed] = useState<boolean | null>(null);
  const [geoChecking, setGeoChecking] = useState<boolean>(false);
  const [geoErrorType, setGeoErrorType] = useState<
    'PERMISSION_DENIED' | 'POSITION_UNAVAILABLE' | 'TIMEOUT' | 'OUTSIDE' | null
  >(null);

  // Anti-Proxy device lock state
  const [deviceLock, setDeviceLock] = useState<DeviceAttendanceLock | null>(null);

  // Remembered member state
  const [savedMember, setSavedMember] = useState<SavedMemberProfile | null>(null);
  const [showManualMode, setShowManualMode] = useState(false);

  // Flow navigation
  const [step, setStep] = useState<FlowStep>('INPUT');

  // Input states
  const [digits, setDigits] = useState('');
  const [matchedMembers, setMatchedMembers] = useState<CollisionMember[]>([]);
  const [isActionLoading, setIsActionLoading] = useState(false);
  const [receipt, setReceipt] = useState<CheckInReceipt | null>(null);

  // Toast notification
  const [toast, setToast] = useState<Omit<ToastProps, 'onClose'> | null>(null);

  const showToast = useCallback(
    (type: 'success' | 'error' | 'info', message: string, title?: string) => {
      setToast({ type, message, title });
    },
    []
  );

  const handleCloseToast = useCallback(() => {
    setToast(null);
  }, []);

  const persistCompletedCheckIn = useCallback(
    (params: { personId: string; name: string; serviceId: string; serviceName: string }) => {
      try {
        const now = new Date();
        const payload = {
          personId: params.personId,
          name: params.name,
          serviceId: params.serviceId,
          serviceName: params.serviceName,
          date: getNigerianDateString(now),
          time: now.toLocaleTimeString('en-NG', {
            timeZone: 'Africa/Lagos',
            hour: '2-digit',
            minute: '2-digit',
            hour12: true,
          }),
        };
        localStorage.setItem('rccg_completed_checkin', JSON.stringify(payload));
      } catch (e) {
        console.warn('Unable to persist completed check-in slip', e);
      }
    },
    []
  );

  // 1. Initial Load: Service schedule & device lock detection
  useEffect(() => {
    async function loadService() {
      try {
        const res: ActiveServiceResponse = await getActiveServiceAction();
        if (res.success && res.church) {
          setChurch(res.church);
          setActiveService(res.activeService || null);
          setNextUpcomingService(res.nextUpcomingService || null);
          setCurrentTimeString(res.currentTimeString || '');
          setIsLiveNow(res.isLiveNow || false);

          // Check device attendance lock
          const existingLock = getDeviceAttendanceLock();
          if (existingLock && res.activeService && existingLock.serviceId === res.activeService.id) {
            setDeviceLock(existingLock);
          } else {
            setDeviceLock(null);
          }
        }
      } catch (err) {
        console.error('Failed to load active service:', err);
      } finally {
        setIsReady(true);
      }
    }

    loadService();

    // Check localStorage for 1-Tap remembered member
    try {
      const stored = localStorage.getItem('rccg_saved_member');
      if (stored) {
        const parsed = JSON.parse(stored);
        queueMicrotask(() => {
          setSavedMember(parsed);
        });
      }
    } catch (e) {
      console.warn('Unable to read saved member profile', e);
    }
  }, []);

  // 2. Geolocation Request & Sanctuary Verification
  const requestLocation = useCallback(async (): Promise<boolean> => {
    setGeoChecking(true);
    setGeoErrorType(null);

    if (typeof window === 'undefined' || !navigator.geolocation) {
      setGeoChecking(false);
      setGeoAllowed(false);
      setGeoErrorType('POSITION_UNAVAILABLE');
      return false;
    }

    return new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const coords = {
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
            accuracy: pos.coords.accuracy,
          };
          userLocationRef.current = coords;
          setUserLocation(coords);

          const churchCoords = church
            ? { latitude: church.latitude, longitude: church.longitude }
            : { latitude: 6.5244, longitude: 3.3792 };
          const baseRadius = church?.geofenceRadius || 150;

          const check = isWithinChurchGeofence(coords, churchCoords, baseRadius);
          setDistanceMeters(check.distanceMeters);
          setGeoAllowed(check.isAllowed);
          setGeoChecking(false);

          if (!check.isAllowed) {
            setGeoErrorType('OUTSIDE');
          }

          resolve(check.isAllowed);
        },
        (error) => {
          setGeoChecking(false);
          setGeoAllowed(false);
          if (error.code === error.PERMISSION_DENIED) {
            setGeoErrorType('PERMISSION_DENIED');
          } else if (error.code === error.TIMEOUT) {
            setGeoErrorType('TIMEOUT');
          } else {
            setGeoErrorType('POSITION_UNAVAILABLE');
          }
          resolve(false);
        },
        {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 15000,
        }
      );
    });
  }, [church]);

  // Trigger location on mount once church is loaded
  useEffect(() => {
    if (church) {
      const timer = setTimeout(() => {
        void requestLocation();
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [church, requestLocation]);

  // 3. Complete check-in logic
  const executeCheckIn = useCallback(
    async (
      personId: string,
      personName: string,
      phoneLast4?: string,
      category?: string,
      method: 'QR' | 'LOOKUP_4DIGIT' | 'ONE_TAP' = 'LOOKUP_4DIGIT'
    ) => {
      setIsActionLoading(true);

      try {
        // 1. Ensure GPS coordinates are present
        let loc = userLocationRef.current;
        if (!loc) {
          const allowed = await requestLocation();
          loc = userLocationRef.current;
          if (!allowed && !loc) {
            showToast(
              'error',
              'Location permission is required to verify you are in the sanctuary.',
              'Location Required'
            );
            setIsActionLoading(false);
            return;
          }
        }

        const res = await registerAttendance({
          personId,
          latitude: loc?.latitude,
          longitude: loc?.longitude,
          method,
          serviceScheduleId: activeService?.id,
        });

        if (!res.success) {
          if (res.alreadyCheckedIn) {
            showToast(
              'info',
              res.error || 'Attendance has already been marked for this service today.',
              'Already Checked In'
            );
            // Set device lock & slip if already checked in
            if (activeService) {
              const resolvedServiceId = res.serviceId || activeService.id;
              const resolvedServiceName = res.serviceName || activeService.name;
              const lockPayload: DeviceAttendanceLock = {
                serviceId: resolvedServiceId,
                serviceName: resolvedServiceName,
                serviceDate: getNigerianDateString(),
                checkedInPersonId: personId,
                checkedInName: personName,
                phoneLast4,
                timestamp: Date.now(),
                method,
              };
              setDeviceAttendanceLock(lockPayload);
              setDeviceLock(lockPayload);
              persistCompletedCheckIn({
                personId,
                name: personName,
                serviceId: resolvedServiceId,
                serviceName: resolvedServiceName,
              });
            }
          } else {
            showToast('error', res.error || 'Unable to record attendance.', 'Check-In Rejected');
          }
          setIsActionLoading(false);
          return;
        }

        const resolvedName = res.personName || personName;
        const resolvedServiceId = res.serviceId || activeService?.id || '';
        const resolvedServiceName = res.serviceName || activeService?.name || 'RCCG Celebration Service';

        // Save member profile for 1-tap rapid check-in next time
        const profileToSave: SavedMemberProfile = {
          id: personId,
          firstName: resolvedName.split(' ')[0] || resolvedName,
          lastName: resolvedName.split(' ').slice(1).join(' ') || '',
          phoneLast4,
          category,
        };
        try {
          localStorage.setItem('rccg_saved_member', JSON.stringify(profileToSave));
          setSavedMember(profileToSave);
        } catch (e) {
          console.warn('Unable to persist member profile', e);
        }

        // Write completed check-in slip for /welcome
        persistCompletedCheckIn({
          personId: res.personId || personId,
          name: resolvedName,
          serviceId: resolvedServiceId,
          serviceName: resolvedServiceName,
        });

        // Apply Anti-Proxy Device Lock
        if (activeService || resolvedServiceId) {
          const lockPayload: DeviceAttendanceLock = {
            serviceId: resolvedServiceId,
            serviceName: resolvedServiceName,
            serviceDate: getNigerianDateString(),
            checkedInPersonId: res.personId || personId,
            checkedInName: resolvedName,
            phoneLast4,
            timestamp: Date.now(),
            method,
          };
          setDeviceAttendanceLock(lockPayload);
          setDeviceLock(lockPayload);
        }

        // Transition to Celebration Confirmation View
        setReceipt({
          personName: resolvedName,
          serviceName: resolvedServiceName,
          isEarlyBird: res.isEarlyBird,
          message: res.message || 'Attendance successfully confirmed.',
          distanceMeters,
        });
        setStep('SUCCESS');
      } catch (err: any) {
        console.error('Error in executeCheckIn:', err);
        showToast('error', err?.message || 'Check-in failed. Please try again.');
      } finally {
        setIsActionLoading(false);
      }
    },
    [activeService, distanceMeters, persistCompletedCheckIn, requestLocation, showToast]
  );

  // 4. Phone Suffix Search Handler
  const handleSearchDigits = useCallback(
    async (enteredDigits: string) => {
      if (enteredDigits.length !== 4) return;
      setIsActionLoading(true);

      try {
        const res = await lookupByPhoneSuffix(enteredDigits);
        if (!res.success) {
          showToast('error', res.error || 'Failed to search member.');
          setIsActionLoading(false);
          return;
        }

        if (res.count === 0) {
          // No member found -> Open First Timer registration form
          setStep('FIRST_TIMER_FORM');
        } else if (res.count === 1 && res.members[0]) {
          // Exact 1 match -> Check in immediately
          const m = res.members[0];
          const fullName = `${m.firstName} ${m.lastName || ''}`.trim();
          await executeCheckIn(m.id, fullName, m.phoneLast4 || enteredDigits, m.category, 'LOOKUP_4DIGIT');
        } else {
          // Multiple matches -> Open Collision Choice Disambiguation
          setMatchedMembers(res.members);
          setStep('COLLISION_CHOICE');
        }
      } catch (err) {
        console.error('Error during 4-digit search:', err);
        showToast('error', 'Search failed. Please check network connection.');
      } finally {
        setIsActionLoading(false);
      }
    },
    [executeCheckIn, showToast]
  );

  // 5. First Timer Submission
  const handleFirstTimerSubmit = useCallback(
    async (formData: {
      firstName: string;
      lastName: string;
      phone: string;
      category: PersonCategory;
    }) => {
      setIsActionLoading(true);

      try {
        let loc = userLocationRef.current;
        if (!loc) {
          await requestLocation();
          loc = userLocationRef.current;
        }

        const res = await registerFirstTimerAction({
          firstName: formData.firstName,
          lastName: formData.lastName,
          phone: formData.phone,
          category: formData.category,
          serviceScheduleId: activeService?.id,
          userLatitude: loc?.latitude,
          userLongitude: loc?.longitude,
        });

        if (!res.success) {
          showToast('error', res.error || 'Failed to register.');
          setIsActionLoading(false);
          return;
        }

        const fullName = res.personName || `${formData.firstName} ${formData.lastName}`.trim();
        const phoneLast4 = formData.phone.slice(-4);
        const resolvedServiceId = res.serviceId || activeService?.id || '';
        const resolvedServiceName = res.serviceName || activeService?.name || 'RCCG Celebration Service';

        // Save member profile
        const profile: SavedMemberProfile = {
          id: res.personId,
          firstName: formData.firstName,
          lastName: formData.lastName,
          phoneLast4,
          category: formData.category,
        };
        try {
          localStorage.setItem('rccg_saved_member', JSON.stringify(profile));
          setSavedMember(profile);
        } catch (e) {
          console.warn('Unable to persist member profile', e);
        }

        // Write completed check-in slip for /welcome
        persistCompletedCheckIn({
          personId: res.personId,
          name: fullName,
          serviceId: resolvedServiceId,
          serviceName: resolvedServiceName,
        });

        // Set Device Lock
        if (activeService || resolvedServiceId) {
          const lockPayload: DeviceAttendanceLock = {
            serviceId: resolvedServiceId,
            serviceName: resolvedServiceName,
            serviceDate: getNigerianDateString(),
            checkedInPersonId: res.personId,
            checkedInName: fullName,
            phoneLast4,
            timestamp: Date.now(),
            method: 'LOOKUP_4DIGIT',
          };
          setDeviceAttendanceLock(lockPayload);
          setDeviceLock(lockPayload);
        }

        setReceipt({
          personName: fullName,
          serviceName: resolvedServiceName,
          isEarlyBird: res.isEarlyBird,
          message: res.message || 'Welcome to RCCG Jesus Covenant Zone!',
          distanceMeters,
        });
        setStep('SUCCESS');
      } catch (err: any) {
        console.error('Error submitting first timer:', err);
        showToast('error', err?.message || 'Registration failed.');
      } finally {
        setIsActionLoading(false);
      }
    },
    [activeService, distanceMeters, persistCompletedCheckIn, requestLocation, showToast]
  );

  // Reset to fresh lookup
  const handleResetFlow = useCallback(() => {
    setDigits('');
    setMatchedMembers([]);
    setStep('INPUT');
    setReceipt(null);
  }, []);

  // Controlled family unlock override
  const handleFamilyUnlock = useCallback(() => {
    if (
      window.confirm(
        'Check in another family member? This allows you to log attendance for a family member without a phone.'
      )
    ) {
      clearDeviceAttendanceLock();
      setDeviceLock(null);
      setShowManualMode(true);
      handleResetFlow();
    }
  }, [handleResetFlow]);

  const handleOneTapCheckIn = useCallback(
    (m: SavedMemberProfile) => {
      const fullName = `${m.firstName} ${m.lastName || ''}`.trim();
      executeCheckIn(m.id, fullName, m.phoneLast4, m.category, 'ONE_TAP');
    },
    [executeCheckIn]
  );

  const handleCollisionSelect = useCallback(
    (m: CollisionMember) => {
      const fullName = `${m.firstName} ${m.lastName || ''}`.trim();
      executeCheckIn(m.id, fullName, m.phoneLast4 || digits, m.category, 'LOOKUP_4DIGIT');
    },
    [digits, executeCheckIn]
  );

  const handleSwitchToManual = useCallback(() => {
    setShowManualMode(true);
  }, []);

  const handleReturnToOneTap = useCallback(() => {
    setShowManualMode(false);
  }, []);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col justify-between selection:bg-blue-100 selection:text-blue-900">
      <AmbientBackground />

      {/* Toast Alert */}
      {toast && (
        <Toast
          type={toast.type}
          title={toast.title}
          message={toast.message}
          onClose={handleCloseToast}
        />
      )}

      {/* Sticky Header with Prominent RCCG Logo & Sanctuary Status */}
      <AttendanceHeader
        churchName={church?.name}
        isLiveNow={isLiveNow}
        activeServiceName={activeService?.name}
        currentTimeString={currentTimeString}
        geoAllowed={geoAllowed}
        geoChecking={geoChecking}
        distanceMeters={distanceMeters}
        onRefreshLocation={requestLocation}
      />

      {/* Main Central Stage (One section per screen discipline) */}
      <main className="flex-1 max-w-md w-full mx-auto px-4 py-6 flex flex-col justify-center space-y-4">
        {/* 1. Verify sanctuary location first before showing 4-digit input */}
        {!isReady || geoChecking || geoAllowed === null ? (
          <motion.div
            variants={surfaceEntranceVariants}
            initial="initial"
            animate="animate"
            className="bg-white border border-slate-200 rounded-3xl p-8 text-center shadow-sm space-y-5"
          >
            <div className="relative w-16 h-16 mx-auto flex items-center justify-center">
              <motion.span
                aria-hidden="true"
                animate={{ scale: [1, 1.35, 1], opacity: [0.45, 0, 0.45] }}
                transition={{ duration: 1.8, repeat: Infinity, ease: MOMENTUM_EASE }}
                className="absolute inset-0 rounded-full bg-blue-500/20"
              />
              <div className="relative w-14 h-14 rounded-2xl bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-700">
                <MapPin className="w-6 h-6" />
              </div>
            </div>

            <div className="space-y-1.5">
              <h2 className="text-lg font-extrabold text-slate-900">
                {!isReady
                  ? 'Checking service schedule...'
                  : 'Hold on, verifying your location...'}
              </h2>
              <p className="text-xs font-medium text-slate-600 leading-relaxed">
                Confirming you are inside the 150m sanctuary boundary before opening check-in.
              </p>
            </div>
          </motion.div>
        ) : geoAllowed === false ? (
          <GeofenceGatewayAlert
            activeService={activeService}
            nextUpcomingService={nextUpcomingService}
            isLiveNow={isLiveNow}
            churchName={church?.name}
            distanceMeters={distanceMeters}
            errorType={geoErrorType}
            onRefresh={requestLocation}
            geoChecking={geoChecking}
          />
        ) : !isLiveNow || !activeService ? (
          /* 2. No Service Currently in Session */
          <motion.div
            variants={surfaceEntranceVariants}
            initial="initial"
            animate="animate"
            className="bg-white border border-slate-200 rounded-3xl p-7 text-center shadow-sm space-y-5"
          >
            <div className="w-14 h-14 mx-auto rounded-2xl bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-700">
              <Clock className="w-6 h-6" />
            </div>

            <div className="space-y-1.5">
              <span className="inline-block text-[11px] font-bold uppercase tracking-wider text-slate-500">
                Sanctuary Verified · Off-Hours
              </span>
              <h2 className="text-xl font-extrabold text-slate-900">
                No service is currently in session
              </h2>
              <p className="text-sm text-slate-600 leading-relaxed">
                Check-in opens automatically when a scheduled service starts.
              </p>
            </div>

            {nextUpcomingService && (
              <div className="bg-blue-50/70 border border-blue-200 rounded-2xl p-4 text-left space-y-1">
                <span className="text-[11px] font-bold uppercase tracking-wider text-blue-700 block">
                  Next Upcoming Service
                </span>
                <p className="text-sm font-extrabold text-slate-900">
                  {nextUpcomingService.name}
                </p>
                <p className="text-xs font-medium text-slate-700">
                  {nextUpcomingService.formattedSchedule}
                </p>
              </div>
            )}

            <motion.button
              type="button"
              onClick={() => window.location.reload()}
              className="w-full py-3 min-h-[44px] rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold flex items-center justify-center gap-2 transition-colors cursor-pointer"
              {...tactileTapProps}
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Refresh Service Status</span>
            </motion.button>
          </motion.div>
        ) : deviceLock && step !== 'SUCCESS' ? (
          <AntiProxyLockCard lock={deviceLock} onFamilyUnlock={handleFamilyUnlock} />
        ) : step === 'SUCCESS' && receipt ? (
          /* Check-In Celebration Confirmation */
          <CheckInConfirmation receipt={receipt} onReset={handleResetFlow} />
        ) : savedMember && !showManualMode ? (
          /* 1-Tap Remembered Profile Card */
          <RememberedProfileCard
            member={savedMember}
            isCheckingIn={isActionLoading}
            onCheckIn={handleOneTapCheckIn}
            onSwitchAccount={handleSwitchToManual}
          />
        ) : (
          /* 4-Digit Phone Lookup & Registration Flow */
          <div className="space-y-4">
            {step === 'INPUT' ? (
              <KeypadLookup
                digits={digits}
                onDigitsChange={setDigits}
                onSearch={handleSearchDigits}
                isLoading={isActionLoading}
              />
            ) : step === 'COLLISION_CHOICE' ? (
              <CollisionChoiceList
                digits={digits}
                members={matchedMembers}
                isSubmitting={isActionLoading}
                onSelectMember={handleCollisionSelect}
                onBack={handleResetFlow}
              />
            ) : step === 'FIRST_TIMER_FORM' ? (
              <FirstTimerForm
                initialPhoneDigits={digits}
                isSubmitting={isActionLoading}
                onSubmit={handleFirstTimerSubmit}
                onBack={handleResetFlow}
              />
            ) : null}

            {/* If user switched from Remembered Profile, give 1-tap option to return */}
            {savedMember && showManualMode && (
              <div className="text-center pt-2">
                <button
                  type="button"
                  onClick={handleReturnToOneTap}
                  className="min-h-[44px] px-3 py-2 text-xs font-bold text-blue-900 hover:text-blue-950 hover:underline cursor-pointer"
                >
                  ← Return to 1-Tap Check-In as {savedMember.firstName}
                </button>
              </div>
            )}
          </div>
        )}
      </main>

      {/* Subtle Accessible Footer */}
      <footer className="w-full border-t border-slate-200/90 bg-white py-3">
        <div className="max-w-md mx-auto px-4 flex items-center justify-between text-[11px] text-slate-700 font-medium">
          <span>RCCG Jesus Covenant Zone CMS</span>
          <span className="font-mono">Geofence: 150m Strict</span>
        </div>
      </footer>
    </div>
  );
}
