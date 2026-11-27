'use client';

import { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Shield,
  Lock,
  ArrowRight,
  AlertCircle,
  Eye,
  EyeOff,
  UserCheck,
  HeartHandshake,
  Cake,
  ArrowLeft,
} from 'lucide-react';
import { loginAction, type StaffRole } from '../actions/auth';
import AmbientBackground from '../components/AmbientBackground';

const ROLE_OPTIONS: {
  id: StaffRole;
  label: string;
  description: string;
  placeholder: string;
  icon: typeof UserCheck;
  allowedPrefix: string;
}[] = [
  {
    id: 'USHER',
    label: 'Usher Desk',
    description:
      'Ushers search members, record service attendance, and register first-timers at the desk.',
    placeholder: 'Enter usher password or PIN',
    icon: UserCheck,
    allowedPrefix: '/usher',
  },
  {
    id: 'FOLLOWUP',
    label: 'Follow-Up Team',
    description:
      'Follow-Up workers view recent first-timers and missed Sundays, and log outreach notes.',
    placeholder: 'Enter follow-up password or PIN',
    icon: HeartHandshake,
    allowedPrefix: '/followup',
  },
  {
    id: 'MEDIA',
    label: 'Birthdays / Media',
    description:
      'Media team views upcoming youth birthdays and monthly birthday schedules.',
    placeholder: 'Enter media password or PIN',
    icon: Cake,
    allowedPrefix: '/birthdays',
  },
  {
    id: 'ADMIN',
    label: 'Admin',
    description:
      'Admins have complete access to attendance metrics, follow-up outcomes, birthdays, and member imports.',
    placeholder: 'Enter admin password or PIN',
    icon: Shield,
    allowedPrefix: '/admin',
  },
];

export default function StaffLoginPage() {
  const router = useRouter();
  const [selectedRole, setSelectedRole] = useState<StaffRole>('USHER');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const activeRole = ROLE_OPTIONS.find((r) => r.id === selectedRole) ?? ROLE_OPTIONS[0];

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!password.trim()) {
      setError('Please enter your password or PIN.');
      return;
    }

    setLoading(true);
    setError(null);

    const res = await loginAction({
      role: selectedRole,
      password: password.trim(),
    });

    setLoading(false);

    if (res.success && res.redirectTo) {
      const params = new URLSearchParams(window.location.search);
      const requestedRedirect = params.get('redirect');
      const isRoleAllowed =
        requestedRedirect &&
        requestedRedirect.startsWith('/') &&
        !requestedRedirect.startsWith('//') &&
        (selectedRole === 'ADMIN' || requestedRedirect.startsWith(activeRole.allowedPrefix));

      router.push(isRoleAllowed ? requestedRedirect : res.redirectTo);
      router.refresh();
    } else {
      setError(res.error || 'Authentication failed. Check your password.');
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col justify-between p-4 selection:bg-blue-600 selection:text-white relative overflow-hidden">
      <AmbientBackground />

      {/* Top Bar */}
      <div className="max-w-md w-full mx-auto flex items-center justify-between pt-2 relative z-10">
        <Link
          href="/"
          className="text-xs text-slate-600 hover:text-slate-900 font-semibold flex items-center gap-1.5 min-h-[44px] transition-colors cursor-pointer"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Back to Home</span>
        </Link>
        <span className="text-[11px] font-bold text-blue-700 bg-blue-50 border border-blue-200 px-2.5 py-0.5 rounded-full">
          Authorized Staff Only
        </span>
      </div>

      {/* Main Login Card */}
      <main className="max-w-md w-full mx-auto my-auto py-8 relative z-10">
        <div className="bg-white/95 backdrop-blur-md border border-slate-200 rounded-3xl p-6 sm:p-8 shadow-xl space-y-6">
          {/* Logo & Church Branding */}
          <div className="text-center space-y-2">
            <div className="relative w-16 h-16 mx-auto">
              <Image
                src="/rccg-logo.png"
                alt="RCCG Logo"
                fill
                className="object-contain"
                priority
              />
            </div>
            <div>
              <h1 className="text-lg font-bold text-slate-900">RCCG Jesus Covenant Zone</h1>
              <p className="text-xs text-slate-500 font-medium">Church Workers &amp; Admin Portal</p>
            </div>
          </div>

          {/* 4-Role Selector */}
          <div className="grid grid-cols-2 gap-1.5 rounded-2xl bg-slate-100 p-1.5 border border-slate-200">
            {ROLE_OPTIONS.map((role) => {
              const Icon = role.icon;
              const isSelected = selectedRole === role.id;
              return (
                <button
                  key={role.id}
                  type="button"
                  onClick={() => {
                    setSelectedRole(role.id);
                    setPassword('');
                    setError(null);
                  }}
                  className={`py-2.5 px-2 min-h-[44px] text-xs font-bold rounded-xl transition-all duration-150 flex items-center justify-center gap-1.5 cursor-pointer active:scale-[0.97] ${
                    isSelected
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
                  }`}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  <span className="truncate">{role.label}</span>
                </button>
              );
            })}
          </div>

          {/* Error Alert */}
          {error && (
            <div className="p-3.5 bg-red-50 border border-red-200 text-red-700 text-xs font-semibold rounded-xl flex items-start gap-2 shadow-xs">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-red-600" />
              <span>{error}</span>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label
                htmlFor="staff-password"
                className="text-xs font-bold text-slate-700 flex items-center justify-between"
              >
                <span>{activeRole.label} Password or PIN</span>
              </label>

              <div className="relative">
                <input
                  id="staff-password"
                  type={showPassword ? 'text' : 'password'}
                  required
                  autoFocus
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={activeRole.placeholder}
                  className="w-full bg-slate-50 border border-slate-300 focus:bg-white focus:border-blue-600 rounded-xl px-3.5 py-3 min-h-[44px] text-sm text-slate-900 font-semibold focus:outline-none transition-colors pr-11"
                />
                <button
                  type="button"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 min-w-[44px] min-h-[44px] flex items-center justify-center text-slate-400 hover:text-slate-600 cursor-pointer"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 min-h-[48px] bg-blue-600 hover:bg-blue-700 disabled:bg-slate-200 disabled:text-slate-400 text-white font-bold text-sm rounded-xl shadow-xs transition-all duration-100 active:scale-[0.97] flex items-center justify-center gap-2 cursor-pointer"
            >
              <Lock className="w-4 h-4" />
              <span>{loading ? 'Authenticating...' : `Enter as ${activeRole.label}`}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </form>

          {/* Role Description */}
          <div className="bg-slate-50 rounded-2xl p-3 border border-slate-200 text-center">
            <p className="text-[11px] text-slate-500 font-medium leading-relaxed">
              {activeRole.description}
            </p>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="text-center text-[11px] text-slate-400 max-w-md mx-auto w-full pb-2">
        <span>RCCG Jesus Covenant Zone Management System</span>
      </footer>
    </div>
  );
}
