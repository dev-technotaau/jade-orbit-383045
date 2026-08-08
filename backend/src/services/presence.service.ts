import { realtimeDb } from '../config/firebase';
import logger from '../config/logger';
import { isFeatureEnabled } from '../config/feature-flags';

/**
 * Presence is written by the live browser client (Firebase RTDB
 * onDisconnect), using a per-connection model:
 *   presence/{uid}/connections/{pushId} : <timestamp>   (one per live tab)
 *   presence/{uid}/lastSeen             : <timestamp>
 *
 * A user is online while they have ≥1 connection child AND a fresh
 * `lastSeen`. The server only READS presence and can FORCE a user offline
 * (e.g. moderation) — it never fakes an "online" write, which previously
 * left ghosts with no disconnect cleanup.
 */

// 2× the client's 5-min heartbeat + buffer — keep in sync with the
// frontend usePresence STALE_MS.
const STALE_MS = 11 * 60 * 1000;

function toMs(lastSeen: unknown): number | null {
  if (typeof lastSeen === 'number') return lastSeen;
  if (typeof lastSeen === 'string') {
    const t = Date.parse(lastSeen);
    return Number.isNaN(t) ? null : t;
  }
  return null;
}

function deriveOnline(data: unknown): { online: boolean; lastSeen: string | null } {
  const node = (data ?? {}) as { connections?: Record<string, unknown>; lastSeen?: unknown };
  const connCount =
    node.connections && typeof node.connections === 'object'
      ? Object.keys(node.connections).length
      : 0;
  const lastSeenMs = toMs(node.lastSeen);
  const fresh = lastSeenMs != null && Date.now() - lastSeenMs < STALE_MS;
  return {
    online: connCount > 0 && fresh,
    lastSeen: lastSeenMs != null ? new Date(lastSeenMs).toISOString() : null,
  };
}

export const presenceService = {
  /**
   * Force a user fully offline (moderation / admin action). Removes all
   * connection children and stamps lastSeen. NOT called on normal logout —
   * tab close is handled client-side per connection.
   */
  async setOffline(userId: string): Promise<void> {
    if (!(await isFeatureEnabled('enablePresence'))) return;
    if (!realtimeDb) return;
    try {
      await realtimeDb.ref(`presence/${userId}/connections`).remove();
      await realtimeDb.ref(`presence/${userId}/lastSeen`).set(new Date().toISOString());
    } catch (error) {
      logger.debug(`Presence setOffline failed: ${(error as Error).message}`);
    }
  },

  async getPresence(userId: string): Promise<{ online: boolean; lastSeen: string | null } | null> {
    if (!(await isFeatureEnabled('enablePresence'))) return null;
    if (!realtimeDb) return null;
    try {
      const snapshot = await realtimeDb.ref(`presence/${userId}`).get();
      return snapshot.exists() ? deriveOnline(snapshot.val()) : null;
    } catch (error) {
      logger.debug(`Presence getPresence failed: ${(error as Error).message}`);
      return null;
    }
  },

  async getMultiplePresence(
    userIds: string[]
  ): Promise<Record<string, { online: boolean; lastSeen: string | null }>> {
    if (!(await isFeatureEnabled('enablePresence'))) return {};
    if (!realtimeDb || userIds.length === 0) return {};
    try {
      const results: Record<string, { online: boolean; lastSeen: string | null }> = {};
      // Batch read via individual gets (Realtime DB doesn't support multi-get)
      await Promise.all(
        userIds.map(async (userId) => {
          const snapshot = await realtimeDb!.ref(`presence/${userId}`).get();
          if (snapshot.exists()) {
            results[userId] = deriveOnline(snapshot.val());
          }
        })
      );
      return results;
    } catch (error) {
      logger.debug(`Presence getMultiplePresence failed: ${(error as Error).message}`);
      return {};
    }
  },
};
