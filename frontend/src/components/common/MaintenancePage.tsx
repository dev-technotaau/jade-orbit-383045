'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Settings, Wrench, RefreshCw, Mail, Clock } from 'lucide-react';
import { APP_CONFIG } from '@/constants/config';
import { useMaintenanceStore } from '@/store/maintenance.store';
import Tooltip from '@/components/ui/Tooltip';

const STATUS_MESSAGES = [
  'Upgrading system components...',
  'Optimizing database performance...',
  'Deploying latest improvements...',
  'Running security patches...',
  'Enhancing platform reliability...',
  'Configuring new features...',
  'Fine-tuning search algorithms...',
  'Improving application speed...',
];

const AUTO_REFRESH_INTERVAL = 30_000; // 30 seconds

interface MaintenancePageProps {
  message?: string | null;
  estimatedReturnTime?: string | null;
}

/** Full-screen enterprise maintenance page with animations and auto-refresh. */
export default function MaintenancePage(props: MaintenancePageProps = {}) {
  const storeMessage = useMaintenanceStore((s) => s.message);
  const storeReturnTime = useMaintenanceStore((s) => s.estimatedReturnTime);

  // Props (from feature flags) take precedence, fall back to store (from 503 interceptor)
  const message = props.message || storeMessage;
  const estimatedReturnTime = props.estimatedReturnTime || storeReturnTime;

  const [statusIndex, setStatusIndex] = useState(0);
  const [countdown, setCountdown] = useState<{
    hours: number;
    minutes: number;
    seconds: number;
  } | null>(null);

  // Rotate status messages every 4s
  useEffect(() => {
    const timer = setInterval(() => {
      setStatusIndex((prev) => (prev + 1) % STATUS_MESSAGES.length);
    }, 4000);
    return () => clearInterval(timer);
  }, []);

  // Countdown timer
  useEffect(() => {
    if (!estimatedReturnTime) {
      queueMicrotask(() => setCountdown(null));
      return;
    }

    const target = new Date(estimatedReturnTime).getTime();

    // Guard: if the date is invalid or already in the past on mount, skip countdown
    // (prevents reload loop when estimatedReturnTime is stale / past)
    if (Number.isNaN(target) || target <= Date.now()) {
      queueMicrotask(() => setCountdown(null));
      return;
    }

    function updateCountdown() {
      const diff = target - Date.now();
      if (diff <= 0) {
        setCountdown(null);
        window.location.reload();
        return;
      }
      setCountdown({
        hours: Math.floor(diff / 3_600_000),
        minutes: Math.floor((diff % 3_600_000) / 60_000),
        seconds: Math.floor((diff % 60_000) / 1_000),
      });
    }

    updateCountdown();
    const timer = setInterval(updateCountdown, 1000);
    return () => clearInterval(timer);
  }, [estimatedReturnTime]);

  // Auto-refresh: poll feature flags with raw fetch (bypasses Axios 503 interceptor)
  const reloadTriggered = useRef(false);
  useEffect(() => {
    async function checkMaintenance() {
      if (reloadTriggered.current) return;
      try {
        // Bust all caches: fresh=true bypasses backend cache, _t busts HTTP cache
        const url = `/api/proxy/feature-flags/client?fresh=true&_t=${Date.now()}`;
        const res = await fetch(url, {
          credentials: 'include',
          cache: 'no-store',
        }).catch(() =>
          fetch(`${APP_CONFIG.apiUrl}/feature-flags/client?fresh=true&_t=${Date.now()}`, {
            cache: 'no-store',
          }),
        );
        if (res.ok) {
          const json = await res.json();
          if (json?.data?.maintenanceMode === false) {
            reloadTriggered.current = true;
            window.location.reload();
          }
        }
      } catch {
        // Network error — keep showing maintenance page
      }
    }

    const timer = setInterval(checkMaintenance, AUTO_REFRESH_INTERVAL);
    return () => clearInterval(timer);
  }, []);

  // Keyboard shortcut: press R to refresh
  const handleRefresh = useCallback(() => {
    window.location.reload();
  }, []);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'r' || e.key === 'R') {
        // Don't trigger if user is typing in an input
        if (
          (e.target as HTMLElement).tagName === 'INPUT' ||
          (e.target as HTMLElement).tagName === 'TEXTAREA'
        )
          return;
        handleRefresh();
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleRefresh]);

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[var(--bg)]">
      {/* Animated background orbs */}
      <motion.div
        className="from-primary/20 pointer-events-none absolute -top-32 -left-32 h-96 w-96 rounded-full bg-gradient-to-br to-blue-500/10 blur-3xl"
        animate={{
          x: [0, 60, -30, 0],
          y: [0, -40, 50, 0],
          scale: [1, 1.15, 0.95, 1],
        }}
        transition={{ duration: 18, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.div
        className="pointer-events-none absolute top-1/3 -right-24 h-80 w-80 rounded-full bg-gradient-to-br from-purple-500/15 to-pink-500/10 blur-3xl"
        animate={{
          x: [0, -50, 40, 0],
          y: [0, 60, -30, 0],
          scale: [1, 0.9, 1.1, 1],
        }}
        transition={{ duration: 22, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.div
        className="pointer-events-none absolute -bottom-20 left-1/3 h-72 w-72 rounded-full bg-gradient-to-br from-emerald-500/15 to-teal-500/10 blur-3xl"
        animate={{
          x: [0, 40, -60, 0],
          y: [0, -50, 30, 0],
          scale: [1, 1.1, 0.9, 1],
        }}
        transition={{ duration: 20, repeat: Infinity, ease: 'easeInOut' }}
      />

      {/* Main content card */}
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, ease: 'easeOut' }}
        className="relative z-10 mx-4 w-full max-w-lg"
      >
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-secondary)] p-8 shadow-xl sm:p-12">
          {/* Animated icon */}
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.2, duration: 0.5 }}
            className="relative mx-auto mb-8 flex h-24 w-24 items-center justify-center"
          >
            {/* Outer pulse ring */}
            <motion.div
              className="bg-primary/10 absolute inset-0 rounded-full"
              animate={{ scale: [1, 1.4, 1], opacity: [0.4, 0, 0.4] }}
              transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
            />
            {/* Icon background */}
            <div className="bg-primary/10 relative flex h-20 w-20 items-center justify-center rounded-full">
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 8, repeat: Infinity, ease: 'linear' }}
              >
                <Settings className="text-primary h-10 w-10" />
              </motion.div>
              <motion.div
                className="absolute -right-1 -bottom-1"
                animate={{ rotate: [-10, 10, -10] }}
                transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
              >
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--bg-secondary)] shadow-md">
                  <Wrench className="text-primary h-4 w-4" />
                </div>
              </motion.div>
            </div>
          </motion.div>

          {/* Title */}
          <motion.h1
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3, duration: 0.5 }}
            className="mb-3 text-center text-2xl font-bold text-[var(--text)] sm:text-3xl"
          >
            Scheduled Maintenance
          </motion.h1>

          {/* Description */}
          <motion.p
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4, duration: 0.5 }}
            className="mb-6 text-center text-[var(--text-secondary)]"
          >
            {message ||
              "We're performing scheduled maintenance to improve your experience. We'll be back online shortly."}
          </motion.p>

          {/* Rotating status message */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5 }}
            className="mb-6 flex h-8 items-center justify-center"
          >
            <AnimatePresence mode="wait">
              <motion.span
                key={statusIndex}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -12 }}
                transition={{ duration: 0.3 }}
                className="text-primary text-sm font-medium"
              >
                {STATUS_MESSAGES[statusIndex]}
              </motion.span>
            </AnimatePresence>
          </motion.div>

          {/* Progress dots */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.6 }}
            className="mb-8 flex items-center justify-center gap-2"
          >
            {[0, 1, 2].map((i) => (
              <motion.div
                key={i}
                className="bg-primary h-2.5 w-2.5 rounded-full"
                animate={{
                  scale: [1, 1.5, 1],
                  opacity: [0.4, 1, 0.4],
                }}
                transition={{
                  duration: 1.4,
                  repeat: Infinity,
                  delay: i * 0.2,
                  ease: 'easeInOut',
                }}
              />
            ))}
          </motion.div>

          {/* Countdown timer */}
          {countdown && (
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.7 }}
              className="mb-8"
            >
              <div className="mb-2 flex items-center justify-center gap-1.5 text-xs font-medium tracking-wider text-[var(--text-secondary)] uppercase">
                <Clock className="h-3.5 w-3.5" />
                Estimated return
              </div>
              <div className="flex items-center justify-center gap-3">
                {[
                  { label: 'Hours', value: countdown.hours },
                  { label: 'Min', value: countdown.minutes },
                  { label: 'Sec', value: countdown.seconds },
                ].map(({ label, value }) => (
                  <div key={label} className="text-center">
                    <div className="flex h-14 w-14 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--bg)] text-xl font-bold text-[var(--text)] tabular-nums">
                      {String(value).padStart(2, '0')}
                    </div>
                    <span className="mt-1 block text-[10px] font-medium tracking-wider text-[var(--text-secondary)] uppercase">
                      {label}
                    </span>
                  </div>
                ))}
              </div>
            </motion.div>
          )}

          {/* Divider */}
          <div className="mb-6 border-t border-[var(--border)]" />

          {/* Actions */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.8 }}
            className="flex flex-col items-center gap-4 sm:flex-row sm:justify-center"
          >
            <Tooltip content="Refresh the page to check status">
              <button
                onClick={handleRefresh}
                className="bg-primary hover:bg-primary/90 focus:ring-primary/50 inline-flex items-center gap-2 rounded-lg px-5 py-2.5 text-sm font-medium text-white transition-colors focus:ring-2 focus:outline-none"
              >
                <RefreshCw className="h-4 w-4" />
                Refresh Page
              </button>
            </Tooltip>
            <Tooltip content="Send an email to support">
              <a
                href={`mailto:${APP_CONFIG.supportEmail}`}
                className="focus:ring-primary/50 inline-flex items-center gap-2 rounded-lg border border-[var(--border)] px-5 py-2.5 text-sm font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg)] focus:ring-2 focus:outline-none"
              >
                <Mail className="h-4 w-4" />
                Contact Support
              </a>
            </Tooltip>
          </motion.div>

          {/* Keyboard hint */}
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1 }}
            className="mt-6 text-center text-xs text-[var(--text-secondary)]/60"
          >
            Press{' '}
            <kbd className="rounded border border-[var(--border)] bg-[var(--bg)] px-1.5 py-0.5 font-mono text-[10px]">
              R
            </kbd>{' '}
            to refresh
          </motion.p>
        </div>

        {/* Auto-refresh indicator */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.1 }}
          className="mt-4 text-center text-xs text-[var(--text-secondary)]/50"
        >
          This page automatically checks for updates every 30 seconds
        </motion.p>
      </motion.div>
    </div>
  );
}
