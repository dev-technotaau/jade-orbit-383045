'use client';

/**
 * ExitIntentSaveSearchModal — first-time guest sees a single
 * "Don't lose your search — save it" modal on mouseleave.
 *
 * Per Phase 17 of the master plan: capped to once per 30 days,
 * visible only when:
 *   1. The user is unauthenticated.
 *   2. The pointer leaves the document via the top edge (suggesting
 *      the user is heading for the close-tab button).
 *   3. The user has not been shown this modal in the last 30 days.
 *
 * Lightweight implementation — no UI library coupling, just a portal-
 * less Modal. Suppresses itself silently if any guard fails.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { X, Bell } from 'lucide-react';
import Modal from '@/components/ui/Modal';
import Button from '@/components/ui/Button';
import { useAuthStore } from '@/store/auth.store';

const STORAGE_KEY = 'ha_exit_intent_shown_at';
const COOLDOWN_DAYS = 30;

interface Props {
  /**
   * Optional payload describing the current search. Persisted to
   * localStorage when the user clicks "Save this search" — picked up
   * after sign-up to materialise the saved search server-side.
   */
  searchSnapshot?: { type: 'JOB' | 'COMPANY'; filters: Record<string, unknown> };
}

export default function ExitIntentSaveSearchModal({ searchSnapshot }: Props) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (isAuthenticated) return;
    let armed = false;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const ts = Number(raw);
        if (Number.isFinite(ts) && Date.now() - ts < COOLDOWN_DAYS * 86_400_000) {
          return; // already shown within cooldown window
        }
      }
      armed = true;
    } catch {
      armed = true;
    }
    if (!armed) return;

    const handleMouseLeave = (e: MouseEvent) => {
      // Fire only when leaving via the top edge (heading to close tab).
      if (e.clientY > 0) return;
      setOpen(true);
      try {
        localStorage.setItem(STORAGE_KEY, String(Date.now()));
      } catch {
        // ignore — cooldown not enforced this session.
      }
      document.removeEventListener('mouseleave', handleMouseLeave);
    };

    document.addEventListener('mouseleave', handleMouseLeave);
    return () => document.removeEventListener('mouseleave', handleMouseLeave);
  }, [isAuthenticated]);

  if (isAuthenticated) return null;

  const onSaveAndSignup = () => {
    try {
      if (searchSnapshot) {
        localStorage.setItem('ha_pending_saved_search', JSON.stringify(searchSnapshot));
      }
    } catch {
      // ignore
    }
    setOpen(false);
    // Redirect to register; the candidate page consumes
    // `ha_pending_saved_search` after auth and creates the SavedSearch.
    window.location.href = '/auth/register/candidate?action=save_search';
  };

  return (
    <Modal isOpen={open} onClose={() => setOpen(false)} title="Don't lose your search">
      <div className="space-y-4">
        <div className="flex items-start gap-3">
          <div className="bg-primary/10 text-primary flex h-10 w-10 shrink-0 items-center justify-center rounded-full">
            <Bell className="h-5 w-5" />
          </div>
          <p className="text-sm text-[var(--text-secondary)]">
            Save this search and we&apos;ll email you the moment new matching jobs are posted. Free
            for candidates — no spam, just the openings you care about.
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={() => setOpen(false)}>
            <X className="mr-1 h-4 w-4" />
            Not now
          </Button>
          <Button variant="primary" onClick={onSaveAndSignup}>
            Save & sign up free
          </Button>
        </div>
        <p className="text-center text-xs text-[var(--text-muted)]">
          Already have an account?{' '}
          <Link
            href="/auth/login/candidate?action=save_search"
            className="text-primary font-medium hover:underline"
          >
            Login to save
          </Link>
        </p>
      </div>
    </Modal>
  );
}
