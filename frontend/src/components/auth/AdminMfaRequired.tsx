'use client';

import { Shield, LogOut } from 'lucide-react';
import Logo from '@/components/common/Logo';
import Button from '@/components/ui/Button';
import { useAuth } from '@/hooks/use-auth';

export default function AdminMfaRequired() {
  const { logout } = useAuth();

  return (
    <div className="flex min-h-screen flex-col bg-[var(--bg-secondary)]">
      <header className="flex h-16 items-center px-4 sm:h-20 sm:px-6">
        <Logo />
      </header>

      <main className="flex flex-1 items-center justify-center px-4 py-8">
        <div className="w-full max-w-md">
          <div className="rounded-2xl border border-[var(--border)] bg-white p-6 shadow-sm sm:p-8">
            <div className="mb-6 text-center">
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-amber-100">
                <Shield className="h-7 w-7 text-amber-600" />
              </div>
              <h1 className="text-2xl font-bold text-[var(--text)]">MFA Setup Required</h1>
              <p className="mt-3 text-sm text-[var(--text-secondary)]">
                Two-factor authentication is required to access the admin panel. Please contact a
                Super Admin to set up MFA for your account.
              </p>
            </div>

            <div className="rounded-lg bg-[var(--bg-secondary)] p-4 text-sm text-[var(--text-muted)]">
              <p>
                For security purposes, admin MFA must be configured by a Super Admin. Once MFA is
                enabled for your account, you will be able to access the admin panel.
              </p>
            </div>

            <Button
              variant="outline"
              fullWidth
              className="mt-6"
              onClick={() => logout()}
              leftIcon={<LogOut className="h-4 w-4" />}
              tooltip="Sign out of your account"
            >
              Sign Out
            </Button>
          </div>
        </div>
      </main>

      <footer className="py-4 text-center text-sm text-[var(--text-muted)]">
        &copy; {new Date().getFullYear()} HireAdda. All rights reserved.
      </footer>
    </div>
  );
}
