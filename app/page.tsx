'use client';

import React from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { motion, useReducedMotion } from 'framer-motion';
import {
  MapPin,
  Users,
  HeartHandshake,
  Cake,
  ArrowRight,
  Clock,
  CheckCircle2,
} from 'lucide-react';
import { MOMENTUM_EASE, tactileTapProps } from '@/lib/motion';

const WEEKLY_SCHEDULE = [
  {
    day: '1st Sunday',
    service: 'Thanksgiving Sunday',
    time: '07:00 AM – 12:00 PM',
    note: "Workers' Meeting 7:00 AM · Sunday School 8:00 AM · Thanksgiving 9:00 AM",
  },
  {
    day: 'Regular Sundays',
    service: 'Celebration Services',
    time: '07:00 AM – 12:00 PM',
    note: "Workers' Meeting 7:00 AM · 1st Service 8:00 AM · Sunday School 9:00 AM · 2nd Service 10:00 AM",
  },
  {
    day: 'Tuesday',
    service: 'Digging Deep (Bible Study)',
    time: '05:00 PM – 06:00 PM',
    note: 'Weekly midweek scripture study (WAT)',
  },
  {
    day: 'Thursday',
    service: 'Faith Clinic',
    time: '05:00 PM – 06:00 PM',
    note: 'Midweek prayer & breakthrough service (WAT)',
  },
  {
    day: 'Fri (Before 3rd Sun)',
    service: 'Youth Prayer Meeting',
    time: '05:00 PM – 07:00 PM',
    note: 'Monthly youth prayer assembly',
  },
  {
    day: '3rd Saturday',
    service: 'Hour of Mercy',
    time: '08:00 AM – 09:00 AM',
    note: 'Monthly covenant prayer hour',
  },
];

export default function LandingPage() {
  const shouldReduceMotion = useReducedMotion();

  const fadeUp = (delay = 0) =>
    shouldReduceMotion
      ? {}
      : {
          initial: { opacity: 0, y: 12, scale: 0.98 },
          animate: { opacity: 1, y: 0, scale: 1 },
          transition: { duration: 0.3, delay, ease: MOMENTUM_EASE },
        };

  const scrollReveal = (delay = 0) =>
    shouldReduceMotion
      ? {}
      : {
          initial: { opacity: 0, y: 14, scale: 0.98 },
          whileInView: { opacity: 1, y: 0, scale: 1 },
          viewport: { once: true, amount: 0.12 },
          transition: { duration: 0.28, delay, ease: MOMENTUM_EASE },
        };

  return (
    <div className="min-h-screen bg-[#f8fafc] text-slate-900 flex flex-col selection:bg-blue-700 selection:text-white">
      {/* Top Navbar: Transparent, stays at the top over the hero */}
      <header className="absolute top-0 left-0 right-0 z-40 bg-transparent">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between gap-4">
          <Link
            href="/"
            className="flex items-center gap-3 min-h-[44px] focus:outline-none"
          >
            <div className="relative w-10 h-10 shrink-0 rounded-full overflow-hidden">
              <Image
                src="/rccg-logo.png"
                alt="RCCG Official Seal"
                fill
                className="object-cover scale-[1.08] rounded-full"
                priority
              />
            </div>
            <div className="leading-tight">
              <span className="block text-sm font-bold tracking-tight text-white">
                RCCG Jesus Covenant Zone
              </span>
              <span className="block text-xs font-medium text-slate-200">
                Youth Fellowship
              </span>
            </div>
          </Link>

          <motion.div {...(shouldReduceMotion ? {} : tactileTapProps)}>
            <Link
              href="/checkin"
              className="inline-flex items-center justify-center px-5 py-2.5 min-h-[44px] rounded-full bg-white hover:bg-slate-100 text-slate-950 text-sm font-bold shadow-xs transition-colors duration-150"
            >
              <span>Check In</span>
            </Link>
          </motion.div>
        </div>
      </header>

      <main className="flex-1">
        {/* Screen 1: Centered Problem-Solving Hero over Sanctuary Photograph */}
        <section className="relative min-h-screen pt-20 flex items-center justify-center overflow-hidden bg-slate-950">
          <Image
            src="/images/sanctuary-hero.jpg"
            alt="Youth members inside the RCCG Jesus Covenant Zone sanctuary before service"
            fill
            priority
            sizes="100vw"
            className="object-cover"
          />
          <div
            aria-hidden="true"
            className="absolute inset-0 bg-slate-950/70"
          />

          <div className="relative z-10 max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-16 text-center space-y-6">
            <motion.h1
              {...fadeUp(0.04)}
              className="text-3xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight text-white leading-[1.1]"
            >
              Know who showed up. Notice who is missing. Never forget anyone.
            </motion.h1>

            <motion.p
              {...fadeUp(0.1)}
              className="text-base sm:text-lg text-slate-100 leading-relaxed max-w-2xl mx-auto"
            >
              RCCG Jesus Covenant Zone&apos;s church management system turns Sunday check-ins into real pastoral care—recording sanctuary attendance accurately, alerting workers when a member or first-timer needs a call, and celebrating every youth birthday on time.
            </motion.p>

            <motion.div {...fadeUp(0.16)} className="pt-2 flex justify-center">
              <motion.div {...(shouldReduceMotion ? {} : tactileTapProps)}>
                <Link
                  href="/checkin"
                  className="inline-flex items-center justify-center gap-2.5 px-7 py-4 min-h-[52px] rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-base font-bold shadow-lg transition-colors duration-150"
                >
                  <span>Check In</span>
                  <ArrowRight className="w-5 h-5" />
                </Link>
              </motion.div>
            </motion.div>

            <motion.div
              {...fadeUp(0.22)}
              className="grid grid-cols-3 gap-4 pt-6 border-t border-white/20 max-w-xl mx-auto text-white"
            >
              <div>
                <span className="block text-xl sm:text-2xl font-extrabold">150m</span>
                <span className="text-xs font-medium text-slate-200">Sanctuary geofence</span>
              </div>
              <div>
                <span className="block text-xl sm:text-2xl font-extrabold">4-Digit</span>
                <span className="text-xs font-medium text-slate-200">Phone check-in</span>
              </div>
              <div>
                <span className="block text-xl sm:text-2xl font-extrabold">WAT</span>
                <span className="text-xs font-medium text-slate-200">Auto service switch</span>
              </div>
            </motion.div>
          </div>
        </section>

        {/* Screen 2: Pillar 1 — Attendance & Usher Care */}
        <section className="bg-white border-b border-slate-200 py-16 sm:py-24">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-12 items-center">
            <motion.div {...scrollReveal(0)} className="lg:col-span-6 space-y-6">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-50 border border-blue-200 text-xs font-bold text-blue-800">
                <MapPin className="w-3.5 h-3.5" />
                <span>Attendance &amp; Usher Care</span>
              </div>

              <h2 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold tracking-tight text-slate-900 leading-tight">
                Fast sanctuary check-in for every worshipper
              </h2>

              <p className="text-base text-slate-700 leading-relaxed">
                Members confirm they are within 150m of the sanctuary, enter the last 4 digits of their phone number, and receive a live arrival pass showing their name and check-in time.
              </p>

              <ul className="space-y-3 text-sm text-slate-800">
                <li className="flex items-start gap-3">
                  <CheckCircle2 className="w-5 h-5 text-blue-700 shrink-0 mt-0.5" />
                  <span>150m geofenced 4-digit phone lookup prevents remote or duplicate sign-ins.</span>
                </li>
                <li className="flex items-start gap-3">
                  <CheckCircle2 className="w-5 h-5 text-blue-700 shrink-0 mt-0.5" />
                  <span>Live arrival pass confirms your name, current service, and arrival timestamp.</span>
                </li>
                <li className="flex items-start gap-3">
                  <Users className="w-5 h-5 text-blue-700 shrink-0 mt-0.5" />
                  <span>Ushers can sign in members without phones or internet directly at the entrance.</span>
                </li>
              </ul>
            </motion.div>

            <motion.div {...scrollReveal(0.1)} className="lg:col-span-6">
              <div className="group relative aspect-[4/3] w-full rounded-3xl overflow-hidden border border-slate-200 bg-slate-100 shadow-md">
                <Image
                  src="/images/geofence-map.jpg"
                  alt="Map navigation view showing the church building inside a 150m geofence radius"
                  fill
                  sizes="(max-width: 1024px) 100vw, 50vw"
                  className="object-cover transition-transform duration-300 ease-out group-hover:scale-[1.02]"
                />
              </div>
            </motion.div>
          </div>
        </section>

        {/* Screen 3: Pillars 2 & 3 — Follow-Up & Birthday Care */}
        <section className="bg-[#f8fafc] border-b border-slate-200 py-16 sm:py-24">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 space-y-12">
            <motion.div {...scrollReveal(0)} className="max-w-2xl space-y-3">
              <span className="text-xs font-bold uppercase tracking-wider text-blue-700">
                Pastoral Care &amp; Celebration
              </span>
              <h2 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold tracking-tight text-slate-900">
                Follow-up and birthdays built into every Sunday
              </h2>
              <p className="text-base text-slate-700 leading-relaxed">
                Attendance records automatically feed pastoral care—helping workers reach out early and celebrate members consistently.
              </p>
            </motion.div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              {/* Follow-Up Care Card */}
              <motion.div
                {...scrollReveal(0.05)}
                className="bg-white border border-slate-200 rounded-3xl overflow-hidden shadow-2xs flex flex-col"
              >
                <div className="group relative aspect-[16/10] w-full bg-slate-100 overflow-hidden">
                  <Image
                    src="/images/followup-call.jpg"
                    alt="Follow-up team member calling and checking in on a youth member"
                    fill
                    sizes="(max-width: 1024px) 100vw, 50vw"
                    className="object-cover transition-transform duration-300 ease-out group-hover:scale-[1.02]"
                  />
                </div>
                <div className="p-6 sm:p-8 space-y-4 flex-1">
                  <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-50 border border-amber-200 text-xs font-bold text-amber-800">
                    <HeartHandshake className="w-3.5 h-3.5" />
                    <span>Follow-Up Care</span>
                  </div>
                  <h3 className="text-xl font-extrabold text-slate-900">
                    Spot missed Sundays &amp; 72-hour first-timers
                  </h3>
                  <p className="text-sm text-slate-700 leading-relaxed">
                    Follow-Up automatically surfaces members who missed 1 or 2 Sundays alongside new first-timers within their first 72 hours, so no one slips through the cracks unnoticed.
                  </p>
                </div>
              </motion.div>

              {/* Birthday Care Card */}
              <motion.div
                {...scrollReveal(0.12)}
                className="bg-white border border-slate-200 rounded-3xl overflow-hidden shadow-2xs flex flex-col"
              >
                <div className="group relative aspect-[16/10] w-full bg-slate-100 overflow-hidden">
                  <Image
                    src="/images/followup-care.jpg"
                    alt="Youth fellowship celebrating a member birthday together"
                    fill
                    sizes="(max-width: 1024px) 100vw, 50vw"
                    className="object-cover transition-transform duration-300 ease-out group-hover:scale-[1.02]"
                  />
                </div>
                <div className="p-6 sm:p-8 space-y-4 flex-1">
                  <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-rose-50 border border-rose-200 text-xs font-bold text-rose-800">
                    <Cake className="w-3.5 h-3.5" />
                    <span>Birthday Care</span>
                  </div>
                  <h3 className="text-xl font-extrabold text-slate-900">
                    Never miss a youth birthday celebration
                  </h3>
                  <p className="text-sm text-slate-700 leading-relaxed">
                    Tracks upcoming birthdays for tomorrow, the next 7 days, and the coming month—paired with automated Telegram reminders so the media and care teams celebrate every member on time.
                  </p>
                </div>
              </motion.div>
            </div>
          </div>
        </section>

        {/* Screen 4: Weekly Schedule (WAT) */}
        <section className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-20">
          <motion.div
            {...scrollReveal(0)}
            className="bg-white border border-slate-200 rounded-3xl p-6 sm:p-8 shadow-2xs space-y-6"
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <span className="text-xs font-bold uppercase tracking-wider text-blue-700">
                  Service Schedule
                </span>
                <h2 className="text-xl sm:text-2xl font-extrabold text-slate-900 mt-1">
                  Weekly Fellowship Times
                </h2>
              </div>
              <div className="flex items-center gap-3 self-start sm:self-center">
                <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-700 shrink-0">
                  <Clock className="w-5 h-5" />
                </div>
                <motion.div {...(shouldReduceMotion ? {} : tactileTapProps)}>
                  <Link
                    href="/checkin"
                    className="inline-flex items-center gap-2 px-4 py-2.5 min-h-[44px] rounded-xl bg-blue-700 hover:bg-blue-800 text-white text-xs font-bold transition-colors duration-150"
                  >
                    <span>Check In Now</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </Link>
                </motion.div>
              </div>
            </div>

            <div className="divide-y divide-slate-200">
              {WEEKLY_SCHEDULE.map((row) => (
                <div
                  key={row.service}
                  className="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-slate-900">
                        {row.service}
                      </span>
                      <span className="text-[11px] font-semibold px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 border border-slate-200">
                        {row.day}
                      </span>
                    </div>
                    <p className="text-xs text-slate-600 mt-0.5">{row.note}</p>
                  </div>
                  <span className="text-xs font-mono font-bold text-slate-900 bg-slate-100 border border-slate-200 px-2.5 py-1 rounded-lg self-start sm:self-center shrink-0">
                    {row.time}
                  </span>
                </div>
              ))}
            </div>
          </motion.div>
        </section>
      </main>

      {/* Footer: Check-In + Tiny Subtle Staff Login */}
      <footer className="bg-white border-t border-slate-200 py-6">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-600">
          <span className="font-semibold text-slate-800">
            RCCG Jesus Covenant Zone · Youth Fellowship
          </span>
          <div className="flex items-center gap-5">
            <Link href="/checkin" className="font-semibold text-slate-700 hover:text-slate-900 py-1">
              Check-In
            </Link>
            <Link
              href="/login"
              className="text-[11px] text-slate-400 hover:text-slate-600 transition-colors py-1"
            >
              Staff Login
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
