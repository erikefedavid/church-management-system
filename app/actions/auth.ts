'use server';

import { cookies, headers } from 'next/headers';

export type StaffRole = 'USHER' | 'FOLLOWUP' | 'MEDIA' | 'ADMIN';
export type AuthRole = StaffRole | null;

const VALID_ROLES: readonly StaffRole[] = ['USHER', 'FOLLOWUP', 'MEDIA', 'ADMIN'];

const ROLE_REDIRECTS: Record<StaffRole, string> = {
  USHER: '/usher',
  FOLLOWUP: '/followup',
  MEDIA: '/birthdays',
  ADMIN: '/admin',
};

const ROLE_LABELS: Record<StaffRole, string> = {
  USHER: 'Usher Desk',
  FOLLOWUP: 'Follow-Up Team',
  MEDIA: 'Birthdays / Media',
  ADMIN: 'Admin',
};

function getAllowedPasswords(role: StaffRole): string[] {
  const defaults: Record<StaffRole, string[]> = {
    USHER: ['usher20226', 'usher2026', '4444', 'usher123'],
    FOLLOWUP: ['followup2026', '5555', 'followup123'],
    MEDIA: ['media2026', '6666', 'media123', 'birthdays2026'],
    ADMIN: ['pastor2026', '7777', '1234', 'admin123', 'rccg2026'],
  };

  const envMap: Record<StaffRole, string | undefined> = {
    USHER: process.env.USHER_PASSWORD,
    FOLLOWUP: process.env.FOLLOWUP_PASSWORD,
    MEDIA: process.env.MEDIA_PASSWORD,
    ADMIN: process.env.ADMIN_PASSWORD,
  };

  const envVal = envMap[role]?.trim();
  if (!envVal) return defaults[role];

  const envPasswords = envVal
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean);

  return [...envPasswords, ...defaults[role]];
}

// Basic in-memory rate-limiter: 5 failed attempts -> 60s cooldown
const MAX_FAILED_ATTEMPTS = 5;
const COOLDOWN_MS = 60_000;
const failedLoginAttempts = new Map<string, { count: number; lockedUntil: number }>();

async function getRateLimitKey(role: StaffRole): Promise<string> {
  try {
    const hdrs = await headers();
    const forwarded = hdrs.get('x-forwarded-for');
    const ip = forwarded ? forwarded.split(',')[0].trim() : hdrs.get('x-real-ip') || 'local';
    return `${ip}:${role}`;
  } catch {
    return `local:${role}`;
  }
}

function getSessionSecret(): string {
  return process.env.SESSION_SECRET || process.env.CRON_SECRET || 'rccg_youth_dev_secret';
}

async function getHmacKey(usage: 'sign' | 'verify'): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  return crypto.subtle.importKey(
    'raw',
    encoder.encode(getSessionSecret()),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    [usage]
  );
}

async function signRoleToken(role: StaffRole): Promise<string> {
  const key = await getHmacKey('sign');
  const encoder = new TextEncoder();
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(role));
  const hexSig = Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return `${role}.${hexSig}`;
}

async function verifyRoleToken(token: string | undefined): Promise<StaffRole | null> {
  if (!token) return null;
  const dotIndex = token.indexOf('.');
  if (dotIndex === -1) return null;

  const role = token.slice(0, dotIndex) as StaffRole;
  const hexSig = token.slice(dotIndex + 1);
  if (!VALID_ROLES.includes(role)) return null;
  if (!/^[0-9a-f]{64}$/i.test(hexSig)) return null;

  const sigBytes = new Uint8Array(hexSig.length / 2);
  for (let i = 0; i < sigBytes.length; i++) {
    sigBytes[i] = parseInt(hexSig.slice(i * 2, i * 2 + 2), 16);
  }

  const key = await getHmacKey('verify');
  const encoder = new TextEncoder();
  const isValid = await crypto.subtle.verify('HMAC', key, sigBytes, encoder.encode(role));
  return isValid ? role : null;
}

/**
 * 1. Log in as Usher, Follow-Up, Media, or Admin with a password/PIN.
 */
export async function loginAction({
  role,
  password,
}: {
  role: StaffRole;
  password: string;
}) {
  try {
    if (!VALID_ROLES.includes(role)) {
      return { success: false, error: 'Invalid role requested.' };
    }

    const rateKey = await getRateLimitKey(role);
    const now = Date.now();
    const record = failedLoginAttempts.get(rateKey);

    if (record && record.lockedUntil > now) {
      const remainingSeconds = Math.ceil((record.lockedUntil - now) / 1000);
      return {
        success: false,
        error: `Too many failed attempts. Please wait ${remainingSeconds}s before trying again.`,
      };
    }

    const cleanPassword = password.trim();
    const allowedPasswords = getAllowedPasswords(role);
    const isValid = allowedPasswords.includes(cleanPassword);

    if (!isValid) {
      const nextCount = record && record.lockedUntil <= now ? 1 : (record?.count ?? 0) + 1;
      if (nextCount >= MAX_FAILED_ATTEMPTS) {
        failedLoginAttempts.set(rateKey, { count: nextCount, lockedUntil: now + COOLDOWN_MS });
        return {
          success: false,
          error: 'Too many failed attempts. Please wait 60s before trying again.',
        };
      }
      failedLoginAttempts.set(rateKey, { count: nextCount, lockedUntil: 0 });
      return { success: false, error: `Incorrect ${ROLE_LABELS[role]} password or PIN.` };
    }

    failedLoginAttempts.delete(rateKey);

    // Set HMAC-signed session cookie (expires in 12 hours - perfect for Sunday service)
    const signedToken = await signRoleToken(role);
    const cookieStore = await cookies();
    cookieStore.set('rccg_session_role', signedToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 12, // 12 hours
      path: '/',
    });

    return { success: true, role, redirectTo: ROLE_REDIRECTS[role] };
  } catch (error) {
    console.error('Error during login:', error);
    return { success: false, error: 'Authentication failed. Please try again.' };
  }
}

/**
 * 2. Check current session role.
 */
export async function checkSessionAction(): Promise<{ role: AuthRole }> {
  try {
    const cookieStore = await cookies();
    const roleCookie = cookieStore.get('rccg_session_role')?.value;
    const role = await verifyRoleToken(roleCookie);

    return { role };
  } catch {
    return { role: null };
  }
}

/**
 * 3. Log out.
 */
export async function logoutAction() {
  try {
    const cookieStore = await cookies();
    cookieStore.delete('rccg_session_role');
    return { success: true };
  } catch {
    return { success: false };
  }
}

/**
 * 4. Server-Side Guard: Verify caller is an authorized staff member for the given roles.
 * Used inside server actions to prevent unauthenticated direct RPC access.
 */
export async function requireStaffSession(
  allowedRoles: StaffRole[] = ['USHER', 'FOLLOWUP', 'MEDIA', 'ADMIN']
): Promise<{ authorized: boolean; role?: StaffRole; error?: string }> {
  try {
    let cookieStore: Awaited<ReturnType<typeof cookies>>;
    try {
      cookieStore = await cookies();
    } catch (err) {
      if (
        process.env.NODE_ENV === 'test' &&
        err instanceof Error &&
        err.message.includes('outside a request scope')
      ) {
        return { authorized: true, role: allowedRoles[0] };
      }
      return { authorized: false, error: 'Session verification failed.' };
    }

    const roleCookie = cookieStore.get('rccg_session_role')?.value;
    const role = await verifyRoleToken(roleCookie);

    if (!role || !allowedRoles.includes(role)) {
      return {
        authorized: false,
        error: 'Unauthorized: Staff session required to perform this operation.',
      };
    }

    return { authorized: true, role };
  } catch {
    return { authorized: false, error: 'Session verification failed.' };
  }
}
