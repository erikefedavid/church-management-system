'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  CheckCircle2,
  Calendar,
  Clock,
  BookOpen,
  BellOff,
  Sparkles,
  ChevronDown,
  ChevronUp,
  ShieldCheck,
  Check,
  ArrowRight,
  Radio,
} from 'lucide-react';
import { getActiveServiceAction } from '../actions/attendance';

interface AttendanceSlip {
  personId: string;
  name: string;
  serviceId: string;
  serviceName: string;
  date: string;
  time: string;
}

// Official RCCG Jesus Covenant Zone Weekly Schedule
const WEEKLY_SERVICES = [
  {
    day: '1st Sunday of the Month',
    name: 'Thanksgiving Sunday Service',
    time: '09:00 AM - 12:00 PM',
    desc: "Workers' Meeting: 07:00 AM | Sunday School: 08:00 AM | Main Thanksgiving: 09:00 AM",
    badge: 'Monthly Special',
    badgeColor: 'bg-amber-100 text-amber-800 border-amber-300',
  },
  {
    day: 'Regular Sundays (2nd, 3rd, 4th, 5th)',
    name: 'Celebration Services',
    time: '08:00 AM - 12:00 PM',
    desc: "Workers' Meeting: 07:00 AM | 1st Service: 08:00 AM | Sunday School: 09:00 AM | 2nd Service: 10:00 AM",
    badge: 'Weekly',
    badgeColor: 'bg-blue-100 text-blue-800 border-blue-200',
  },
  {
    day: 'Tuesday',
    name: 'Digging Deep (Bible Study)',
    time: '05:00 PM - 06:30 PM',
    desc: 'Systematic expository teaching and verse-by-verse scripture analysis.',
    badge: 'Midweek',
    badgeColor: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  },
  {
    day: 'Thursday',
    name: 'Faith Clinic & Breakthrough Prayers',
    time: '05:00 PM - 06:30 PM',
    desc: 'Intercession, spiritual warfare, deliverance, and personal petition prayers.',
    badge: 'Midweek',
    badgeColor: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  },
  {
    day: 'Friday (Before 3rd Sunday)',
    name: 'Youth Prayer Meeting',
    time: '05:00 PM - 07:00 PM',
    desc: 'Special monthly youth prayer assembly (held the Friday immediately preceding the 3rd Sunday).',
    badge: 'Monthly Special',
    badgeColor: 'bg-purple-100 text-purple-800 border-purple-200',
  },
  {
    day: '3rd Saturday of the Month',
    name: 'Hour of Mercy',
    time: '08:00 AM - 09:00 AM',
    desc: 'Early morning divine mercy covenant prayer altar.',
    badge: 'Monthly Special',
    badgeColor: 'bg-amber-100 text-amber-800 border-amber-300',
  },
];

export default function AttendanceProofPage() {
  const router = useRouter();
  const [slip, setSlip] = useState<AttendanceSlip | null>(null);
  const [showWeeklyServices, setShowWeeklyServices] = useState<boolean>(true);
  const [nextLiveService, setNextLiveService] = useState<any>(null);

  // Read stored check-in and listen for next service transitions
  useEffect(() => {
    let currentSlip: AttendanceSlip | null = null;
    if (typeof window !== 'undefined') {
      try {
        const stored = localStorage.getItem('rccg_completed_checkin');
        if (stored) {
          currentSlip = JSON.parse(stored);
          setSlip(currentSlip);
        }
      } catch (e) {
        console.warn('Could not read from localStorage', e);
      }
    }

    // Function to check if a new service has started
    async function checkForNewService() {
      try {
        const res = await getActiveServiceAction();
        if (res.success && res.activeService) {
          // If a new service is live that is DIFFERENT from the slip's service
          if (currentSlip && res.activeService.id !== currentSlip.serviceId) {
            setNextLiveService(res.activeService);
          } else {
            setNextLiveService(null);
          }
        }
      } catch (err) {
        console.warn('Could not check active service status', err);
      }
    }

    checkForNewService();

    // Check every 45 seconds so it detects when the clock enters the next service
    const interval = setInterval(checkForNewService, 45000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900 flex flex-col justify-between selection:bg-blue-600 selection:text-white">
      {/* Top Header */}
      <header className="border-b border-slate-200/90 bg-white/95 backdrop-blur-md sticky top-0 z-30 px-4 py-3 shadow-xs">
        <div className="max-w-md mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="relative w-10 h-10 shrink-0">
              <Image
                src="/rccg-logo.png"
                alt="RCCG Logo"
                fill
                className="object-contain"
                priority
              />
            </div>
            <div>
              <h1 className="text-sm font-extrabold text-slate-900 leading-tight tracking-tight">
                RCCG Jesus Covenant Zone
              </h1>
              <p className="text-[11px] text-blue-700 font-semibold tracking-wide">
                Sanctuary Attendance Verification
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 bg-emerald-500/10 border border-emerald-500/30 px-2.5 py-1 rounded-full text-[11px] font-bold text-emerald-700">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            <span>Recorded</span>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-md w-full mx-auto p-4 space-y-4">
        {/* AUTOMATIC NEXT SERVICE BANNER (Switches dynamically when next service arrives) */}
        {nextLiveService && (
          <div className="bg-emerald-600 text-white rounded-2xl p-4 shadow-lg animate-in slide-in-from-top-3 duration-300 space-y-2.5">
            <div className="flex items-center gap-2">
              <Radio className="w-4 h-4 text-emerald-200 animate-pulse" />
              <span className="text-xs font-bold uppercase tracking-wider text-emerald-100">
                Next Service Is Now Live!
              </span>
            </div>
            <p className="text-sm font-extrabold leading-snug">
              {nextLiveService.name} is currently in session.
            </p>
            <Link
              href="/"
              className="w-full py-2.5 bg-white hover:bg-slate-100 text-emerald-900 font-bold text-xs rounded-xl shadow-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <span>Mark Attendance for {nextLiveService.name}</span>
              <ArrowRight className="w-3.5 h-3.5 text-emerald-700" />
            </Link>
          </div>
        )}

        {/* Reverence Sanctuary Banner */}
        <div className="bg-amber-50 border border-amber-200/90 rounded-2xl p-3 flex items-center gap-3 text-xs text-amber-950 shadow-2xs">
          <div className="w-8 h-8 rounded-xl bg-amber-100 flex items-center justify-center shrink-0 text-amber-800">
            <BellOff className="w-4 h-4" />
          </div>
          <p className="leading-snug">
            <strong>Sanctuary Order:</strong> Kindly keep mobile devices on silent mode while in God&apos;s presence.
          </p>
        </div>

        {/* ========================================================================= */}
        {/* SHARP DIGITAL SANCTUARY PASS / ATTENDANCE SLIP (NO BARCODE / NO CODE) */}
        {/* ========================================================================= */}
        <div className="bg-white rounded-3xl shadow-xl border border-slate-300 overflow-hidden relative animate-in fade-in zoom-in-95 duration-300">
          {/* Slip Top Header - Royal Navy */}
          <div className="bg-gradient-to-r from-slate-950 via-slate-900 to-blue-950 text-white p-5 pb-4 relative overflow-hidden">
            {/* Subtle background insignia */}
            <div className="absolute -right-4 -bottom-6 w-28 h-28 opacity-10 pointer-events-none">
              <Image src="/rccg-logo.png" alt="" fill className="object-contain" />
            </div>

            <div className="flex items-start justify-between relative z-10">
              <div className="space-y-1">
                <span className="text-[10px] font-mono uppercase tracking-widest text-emerald-400 font-bold block">
                  Official Sanctuary Credential
                </span>
                <h2 className="text-xs font-semibold text-slate-300 tracking-wide uppercase">
                  The Redeemed Christian Church of God
                </h2>
                <p className="text-sm font-black text-white tracking-tight">
                  Jesus Covenant Zone
                </p>
              </div>

              <div className="bg-emerald-500/20 border border-emerald-400/40 rounded-xl px-2.5 py-1 text-right backdrop-blur-xs">
                <span className="text-[9px] font-mono uppercase text-emerald-300 block font-bold">
                  Status
                </span>
                <span className="text-xs font-black text-white tracking-wider flex items-center gap-1">
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                  VERIFIED
                </span>
              </div>
            </div>
          </div>

          {/* Ticket Perforation Notch (Cutouts on Left & Right) */}
          <div className="relative flex items-center bg-white px-4 py-2">
            {/* Left circular cutout */}
            <div className="absolute -left-3.5 w-7 h-7 rounded-full bg-slate-100 border border-slate-300 shadow-inner z-10"></div>
            {/* Dashed tear line */}
            <div className="w-full border-t-2 border-dashed border-slate-300 mx-3"></div>
            {/* Right circular cutout */}
            <div className="absolute -right-3.5 w-7 h-7 rounded-full bg-slate-100 border border-slate-300 shadow-inner z-10"></div>
          </div>

          {/* Slip Body - Member Details */}
          <div className="p-6 pt-3 space-y-5">
            {/* Member Name */}
            <div className="text-center space-y-1.5 pt-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block font-mono">
                Worshipper Name
              </span>
              <h3 className="text-2xl font-black text-slate-900 tracking-tight leading-tight">
                {slip?.name || 'Faithful Worshipper'}
              </h3>
              <div className="inline-flex items-center gap-1.5 bg-blue-50 border border-blue-200 text-blue-900 font-bold text-xs px-3 py-1 rounded-full">
                <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                <span>{slip?.serviceName || 'Sunday Celebration Service'}</span>
              </div>
            </div>

            {/* Clean 3-Item Specification Grid (No codes, no barcode clutter) */}
            <div className="grid grid-cols-3 gap-2 bg-slate-50 border border-slate-200/90 rounded-2xl p-3 text-center">
              <div className="bg-white rounded-xl p-2.5 border border-slate-200/70 shadow-2xs">
                <span className="text-[10px] text-slate-400 block font-semibold uppercase tracking-wider">
                  Date
                </span>
                <span className="text-xs font-bold text-slate-900 flex items-center justify-center gap-1 pt-1">
                  <Calendar className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                  <span>{slip?.date || new Date().toISOString().split('T')[0]}</span>
                </span>
              </div>

              <div className="bg-white rounded-xl p-2.5 border border-slate-200/70 shadow-2xs">
                <span className="text-[10px] text-slate-400 block font-semibold uppercase tracking-wider">
                  Logged Time
                </span>
                <span className="text-xs font-bold text-slate-900 flex items-center justify-center gap-1 pt-1 font-mono">
                  <Clock className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                  <span>{slip?.time || 'Confirmed'}</span>
                </span>
              </div>

              <div className="bg-white rounded-xl p-2.5 border border-slate-200/70 shadow-2xs">
                <span className="text-[10px] text-slate-400 block font-semibold uppercase tracking-wider">
                  Sanctuary
                </span>
                <span className="text-xs font-bold text-emerald-700 flex items-center justify-center gap-1 pt-1">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  <span>Present</span>
                </span>
              </div>
            </div>

            {/* Priestly Blessing Scripture Card */}
            <div className="bg-gradient-to-br from-blue-50 to-indigo-50/50 border border-blue-200/80 rounded-2xl p-4 text-left space-y-2">
              <div className="flex items-center gap-1.5 text-[11px] font-bold text-blue-900 uppercase tracking-wide">
                <BookOpen className="w-3.5 h-3.5 text-blue-700" />
                <span>The Priestly Blessing:</span>
              </div>
              <p className="text-xs text-slate-800 italic leading-relaxed">
                &ldquo;The LORD bless you and keep you; The LORD make His face shine upon you, and be gracious to you; The LORD lift up His countenance upon you, and give you peace.&rdquo;
              </p>
              <p className="text-[11px] font-bold text-blue-700 text-right font-sans">
                — Numbers 6:24–26
              </p>
            </div>
          </div>
        </div>

        {/* Dynamic Transition Reassurance Note */}
        <div className="bg-white border border-slate-200 rounded-2xl p-3.5 text-xs text-slate-600 flex items-start gap-2.5 shadow-2xs">
          <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
          <div className="space-y-0.5">
            <p className="font-bold text-slate-800">
              Attendance Locked for This Service
            </p>
            <p className="text-[11px] leading-relaxed text-slate-500">
              Your attendance is officially recorded. When it is time for the next church service, this device will automatically unlock so you can mark attendance for the new service.
            </p>
          </div>
        </div>

        {/* ========================================================================= */}
        {/* 2. SERVICES FOR THE WEEK (ACCURATE RCCG SCHEDULE) */}
        {/* ========================================================================= */}
        <div className="bg-white border border-slate-200 rounded-3xl shadow-sm overflow-hidden">
          <button
            type="button"
            onClick={() => setShowWeeklyServices((prev) => !prev)}
            className="w-full p-4 flex items-center justify-between text-left cursor-pointer hover:bg-slate-50 transition-colors"
          >
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-700">
                <Calendar className="w-4 h-4" />
              </div>
              <div>
                <span className="text-xs font-extrabold text-slate-900 uppercase tracking-wider block">
                  Church Services for the Week
                </span>
                <span className="text-[11px] text-slate-500">
                  Tap to view meeting days and service times
                </span>
              </div>
            </div>
            {showWeeklyServices ? (
              <ChevronUp className="w-4 h-4 text-slate-400 shrink-0" />
            ) : (
              <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />
            )}
          </button>

          {showWeeklyServices && (
            <div className="p-4 pt-0 border-t border-slate-100 divide-y divide-slate-100 text-xs animate-in fade-in duration-200">
              {WEEKLY_SERVICES.map((svc, idx) => (
                <div key={idx} className="py-3 space-y-1.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-900 text-xs">
                          {svc.name}
                        </span>
                        <span
                          className={`text-[9px] font-bold px-1.5 py-0.5 rounded border uppercase tracking-wider ${svc.badgeColor}`}
                        >
                          {svc.badge}
                        </span>
                      </div>
                      <span className="font-bold text-blue-800 text-[11px] block">
                        {svc.day}
                      </span>
                    </div>

                    <span className="text-[11px] font-mono font-bold text-slate-900 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded-md shrink-0">
                      {svc.time}
                    </span>
                  </div>

                  <p className="text-[11px] text-slate-500 leading-snug">
                    {svc.desc}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Additional Relatable Scripture */}
        <div className="bg-white border border-slate-200 rounded-2xl p-4 text-center space-y-1.5 shadow-2xs">
          <p className="text-xs text-slate-700 italic leading-snug">
            &ldquo;Surely goodness and mercy shall follow me all the days of my life: and I will dwell in the house of the LORD for ever.&rdquo;
          </p>
          <span className="text-[11px] font-bold text-blue-700 block">
            — Psalm 23:6
          </span>
        </div>
      </main>

      {/* Footer */}
      <footer className="py-4 text-center border-t border-slate-200 max-w-md mx-auto w-full px-4 text-xs text-slate-500 font-medium">
        <span>God bless you for worshipping with us today!</span>
      </footer>
    </div>
  );
}
