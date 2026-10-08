import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * Industry-Standard Route Guard Middleware
 * 
 * Protects staff-only routes:
 * 1. /usher -> Requires 'USHER' or 'ADMIN' session cookie.
 * 2. /admin -> Requires 'ADMIN' session cookie.
 * 
 * If an unauthenticated person (e.g. regular member) attempts to visit these routes directly,
 * the server automatically halts their request and redirects them to /login.
 */
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const roleCookie = request.cookies.get('rccg_session_role')?.value;

  // Protect /usher route
  if (pathname.startsWith('/usher')) {
    if (roleCookie !== 'USHER' && roleCookie !== 'ADMIN') {
      const loginUrl = new URL('/login', request.url);
      loginUrl.searchParams.set('redirect', '/usher');
      return NextResponse.redirect(loginUrl);
    }
  }

  // Protect /admin route
  if (pathname.startsWith('/admin')) {
    if (roleCookie !== 'ADMIN') {
      const loginUrl = new URL('/login', request.url);
      loginUrl.searchParams.set('redirect', '/admin');
      return NextResponse.redirect(loginUrl);
    }
  }

  return NextResponse.next();
}

// Only run middleware on protected staff routes
export const config = {
  matcher: ['/usher/:path*', '/admin/:path*'],
};
