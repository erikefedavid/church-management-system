'use server';

import { cookies } from 'next/headers';

// Fixed, easy-to-remember passwords/PINs for church staff
const USHER_PASSWORDS = ['usher2026', '4444', 'usher123'];
const ADMIN_PASSWORDS = ['pastor2026', '7777', 'admin123', 'rccg2026'];

export type AuthRole = 'USHER' | 'ADMIN' | null;

/**
 * 1. Log in as Usher or Admin with a password/PIN.
 */
export async function loginAction({
  role,
  password,
}: {
  role: 'USHER' | 'ADMIN';
  password: string;
}) {
  try {
    const cleanPassword = password.trim();

    if (role === 'USHER') {
      const isValid = USHER_PASSWORDS.includes(cleanPassword);
      if (!isValid) {
        return { success: false, error: 'Incorrect Usher password or PIN. (Hint: 4444 or usher2026)' };
      }

      // Set secure session cookie (expires in 12 hours - perfect for Sunday service)
      const cookieStore = await cookies();
      cookieStore.set('rccg_session_role', 'USHER', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 60 * 60 * 12, // 12 hours
        path: '/',
      });

      return { success: true, role: 'USHER', redirectTo: '/usher' };
    }

    if (role === 'ADMIN') {
      const isValid = ADMIN_PASSWORDS.includes(cleanPassword);
      if (!isValid) {
        return { success: false, error: 'Incorrect Pastor / Admin password or PIN. (Hint: 7777 or pastor2026)' };
      }

      const cookieStore = await cookies();
      cookieStore.set('rccg_session_role', 'ADMIN', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 60 * 60 * 12,
        path: '/',
      });

      return { success: true, role: 'ADMIN', redirectTo: '/admin' };
    }

    return { success: false, error: 'Invalid role requested.' };
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
    const roleCookie = cookieStore.get('rccg_session_role');
    const role = (roleCookie?.value as AuthRole) || null;

    return { role };
  } catch (error) {
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
  } catch (error) {
    return { success: false };
  }
}
