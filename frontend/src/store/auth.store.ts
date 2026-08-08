'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/**
 * Unlock state for the single app password.
 *
 * This replaces the host application's auth store (JWT access/refresh tokens,
 * a real User record fetched from /auth/me, role, MFA state, cross-tab session
 * sync). There are no accounts here — one shared secret gates the module.
 *
 * The store keeps the ORIGINAL SHAPE on purpose. `user`, `isAuthenticated`,
 * `login`, `logout` and `setUser` are read by ~24 files (header, sidebar,
 * command palette, inbox); reshaping them would mean touching every one. So
 * `user` is a fixed synthetic operator and `isAuthenticated` means "unlocked",
 * not "signed in".
 *
 * Only the unlocked FLAG is persisted — never the password. The real credential
 * lives in an httpOnly cookie set by the backend, which JavaScript cannot read.
 */
export interface OperatorUser {
  id: string;
  email: string;
  role: 'ADMIN';
  firstName: string | null;
  lastName: string | null;
  avatar: string | null;
  mobileNumber: string | null;
  isMobileVerified: boolean;
  isWhatsappVerified: boolean;
  whatsappNumber?: string | null;
  isActive: boolean;
  isSuspended: boolean;
  isEmailVerified: boolean;
  mfaEnabled: boolean;
}

/**
 * Must match the backend's APP_ACTOR (middleware/app-password.ts) — the inbox
 * compares `assignedTo` against this id for its "Assigned to me" filter.
 */
export const OPERATOR: OperatorUser = {
  id: process.env.NEXT_PUBLIC_OPERATOR_LABEL || 'operator',
  email: 'operator@localhost',
  role: 'ADMIN',
  firstName: 'Operator',
  lastName: null,
  avatar: null,
  mobileNumber: null,
  isMobileVerified: false,
  isWhatsappVerified: false,
  isActive: true,
  isSuspended: false,
  isEmailVerified: true,
  // True so the removed MFA gates never trip anything that still reads it.
  mfaEnabled: true,
};

interface AuthState {
  user: OperatorUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  setUser: (user: OperatorUser | null) => void;
  login: (user?: OperatorUser) => void;
  logout: () => void;
  setLoading: (loading: boolean) => void;
  hydrate: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      isAuthenticated: false,
      // Starts false, not true: there is nothing async to wait for. A `true`
      // here would make every consumer render a spinner forever.
      isLoading: false,

      setUser: (user) => set({ user, isAuthenticated: !!user }),
      login: () => set({ user: OPERATOR, isAuthenticated: true, isLoading: false }),
      logout: () => set({ user: null, isAuthenticated: false, isLoading: false }),
      setLoading: (isLoading) => set({ isLoading }),
      hydrate: () => set({ isLoading: false }),
    }),
    {
      name: 'wa-unlock',
      // Persist the flag only. The password itself is never held in JS.
      partialize: (s) => ({ user: s.user, isAuthenticated: s.isAuthenticated }),
    }
  )
);
