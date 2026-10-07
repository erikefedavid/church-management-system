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
  Crown,
  ArrowLeft,
} from 'lucide-react';
import { loginAction } from '../actions/auth';
import AmbientBackground from '../components/AmbientBackground';

export default function StaffLoginPage() {
  const router = useRouter();
  const [selectedRole, setSelectedRole] = useState<'USHER' | 'ADMIN'>('USHER');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      router.push(res.redirectTo);
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
          className="text-xs text-slate-600 hover:text-slate-900 font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Member Door Screen</span>
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
              <p className="text-xs text-slate-500 font-medium">Church Workers & Leadership Portal</p>
            </div>
          </div>

          {/* Role Toggle Selector */}
          <div className="flex rounded-2xl bg-slate-100 p-1.5 border border-slate-200">
            <button
              type="button"
              onClick={() => {
                setSelectedRole('USHER');
                setPassword('');
                setError(null);
              }}
              className={`flex-1 py-2 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                selectedRole === 'USHER'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <UserCheck className="w-4 h-4" />
              <span>Usher Desk</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setSelectedRole('ADMIN');
                setPassword('');
                setError(null);
              }}
              className={`flex-1 py-2 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                selectedRole === 'ADMIN'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Crown className="w-4 h-4" />
              <span>Pastor / Leadership</span>
            </button>
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
              <label className="text-xs font-bold text-slate-700 flex items-center justify-between">
                <span>{selectedRole === 'USHER' ? 'Usher Password or PIN' : 'Pastor / Leadership Password or PIN'}</span>
                <span className="text-[10px] text-slate-400 font-normal">
                  {selectedRole === 'USHER' ? 'PIN: 4444' : 'PIN: 7777'}
                </span>
              </label>

              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  autoFocus
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={selectedRole === 'USHER' ? 'Enter 4444 or usher password' : 'Enter 7777 or admin password'}
                  className="w-full bg-slate-50 border border-slate-300 focus:bg-white focus:border-blue-600 rounded-xl px-3.5 py-3 text-sm text-slate-900 font-semibold focus:outline-none transition-colors pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-3 text-slate-400 hover:text-slate-600 cursor-pointer"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-200 disabled:text-slate-400 text-white font-bold text-sm rounded-xl shadow-xs transition-colors flex items-center justify-center gap-2 cursor-pointer"
            >
              <Lock className="w-4 h-4" />
              <span>{loading ? 'Authenticating...' : `Enter as ${selectedRole === 'USHER' ? 'Usher' : 'Leadership'}`}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </form>

          {/* Simple explanation */}
          <div className="bg-slate-50 rounded-2xl p-3 border border-slate-200 text-center">
            <p className="text-[11px] text-slate-500 font-medium leading-relaxed">
              {selectedRole === 'USHER'
                ? 'Ushers can search members, record attendances, edit contact numbers, and download today’s service roll.'
                : 'Pastors and Admins have complete access to service metrics, first-timer follow-up feeds, and Excel exports.'}
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
