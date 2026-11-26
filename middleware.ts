import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

type StaffRole = 'USHER' | 'FOLLOWUP' | 'MEDIA' | 'ADMIN';

const VALID_ROLES: readonly StaffRole[] = ['USHER', 'FOLLOWUP', 'MEDIA', 'ADMIN'];

const ROLE_HOME: Record<StaffRole, string> = {
  USHER: '/usher',
  FOLLOWUP: '/followup',
  MEDIA: '/birthdays',
  ADMIN: '/admin',
};

function getSessionSecret(): string {
  return process.env.SESSION_SECRET || process.env.CRON_SECRET || 'rccg_youth_dev_secret';
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

  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(getSessionSecret()),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify']
  );

  const isValid = await crypto.subtle.verify('HMAC', key, sigBytes, encoder.encode(role));
  return isValid ? role : null;
}

function getAllowedRolesForPath(pathname: string): StaffRole[] | null {
  if (pathname.startsWith('/usher')) return ['USHER', 'ADMIN'];
  if (pathname.startsWith('/followup')) return ['FOLLOWUP', 'ADMIN'];
  if (pathname.startsWith('/birthdays')) return ['MEDIA', 'ADMIN'];
  if (pathname.startsWith('/admin')) return ['ADMIN'];
  return null;
}

/**
 * Strict Route Isolation Middleware
 *
 * - USHER -> /usher ONLY
 * - FOLLOWUP -> /followup ONLY
 * - MEDIA -> /birthdays ONLY
 * - ADMIN -> /admin (and can access staff routes if needed)
 */
export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const allowedRoles = getAllowedRolesForPath(pathname);

  if (!allowedRoles) {
    return NextResponse.next();
  }

  const rawCookie = request.cookies.get('rccg_session_role')?.value;
  const verifiedRole = await verifyRoleToken(rawCookie);

  if (!verifiedRole) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('redirect', pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (!allowedRoles.includes(verifiedRole)) {
    return NextResponse.redirect(new URL(ROLE_HOME[verifiedRole], request.url));
  }

  return NextResponse.next();
}

// Only run middleware on protected staff routes
export const config = {
  matcher: ['/usher/:path*', '/birthdays/:path*', '/followup/:path*', '/admin/:path*'],
};
