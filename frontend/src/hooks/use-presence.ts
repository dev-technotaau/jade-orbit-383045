'use client';

import { useEffect, useState } from 'react';
import { getFirebaseDatabase } from '@/lib/firebase';
import { ref, onValue } from 'firebase/database';
import { useFeatureFlag } from '@/hooks/use-feature-flags';

interface PresenceData {
  online: boolean;
  lastSeen: Date | null;
}

/**
 * A user is only treated as online if they have a live connection child
 * AND their `lastSeen` is within this window (2× the 5-min heartbeat +
 * buffer). The freshness gate lets crashed tabs / stale nodes — whose
 * onDisconnect may never have fired — decay to offline on their own.
 */
const STALE_MS = 11 * 60 * 1000;

function parseTs(v: unknown): number | null {
  if (typeof v === 'number') return v;
  if (typeof v === 'string') {
    const t = Date.parse(v);
    return Number.isNaN(t) ? null : t;
  }
  return null;
}

export function usePresence(userId: string | null | undefined): PresenceData {
  const presenceEnabled = useFeatureFlag('enablePresence', true);
  // `forUserId` is stamped with each snapshot so a stale read from a
  // previous user is ignored when `userId` changes (output is gated on it).
  const [raw, setRaw] = useState<{
    forUserId: string | null;
    connCount: number;
    lastSeenMs: number | null;
  }>({ forUserId: null, connCount: 0, lastSeenMs: null });
  // Drives a periodic re-evaluation of `fresh` so a node that stops
  // updating (e.g. crashed tab) flips to offline without a new RTDB event.
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!userId || !presenceEnabled) return;

    const db = getFirebaseDatabase();
    if (!db) return;

    const presenceRef = ref(db, `presence/${userId}`);

    const unsubscribe = onValue(
      presenceRef,
      (snapshot) => {
        const data = snapshot.exists() ? snapshot.val() : null;
        const connections = data?.connections;
        const connCount =
          connections && typeof connections === 'object' ? Object.keys(connections).length : 0;
        setRaw({ forUserId: userId, connCount, lastSeenMs: parseTs(data?.lastSeen) });
      },
      () => {
        // Silently handle errors (Firebase may not be configured)
        setRaw({ forUserId: userId, connCount: 0, lastSeenMs: null });
      },
    );

    return () => {
      unsubscribe();
    };
  }, [userId, presenceEnabled]);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60 * 1000);
    return () => clearInterval(t);
  }, []);

  // Gate the output rather than resetting state in the effect: ignore data
  // that belongs to a different user, or when presence is disabled.
  const valid = Boolean(userId) && presenceEnabled && raw.forUserId === userId;
  const fresh = valid && raw.lastSeenMs != null && now - raw.lastSeenMs < STALE_MS;
  const online = valid && raw.connCount > 0 && fresh;
  const lastSeen = valid && raw.lastSeenMs != null ? new Date(raw.lastSeenMs) : null;

  return { online, lastSeen };
}
