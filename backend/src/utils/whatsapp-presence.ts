import { redis } from '../config/redis';
import logger from '../config/logger';

/**
 * Who else is looking at this thread, right now.
 *
 * Two operators could open the same conversation and each type a reply with no
 * sign of the other, so the customer received the same answer twice in different
 * words — or, worse, two different answers. Nothing in the product said a
 * colleague was already there, and nothing said who the thread belonged to.
 *
 * Redis with a TTL, deliberately NOT a Prisma column: a pod that dies never runs
 * the leave path, and a database row would then record a viewer who left hours
 * ago as permanently present. A key that expires on its own cannot lie for
 * longer than the TTL.
 */

/** One hash per thread: field = operator label, value = expiry epoch ms. */
const key = (conversationId: string) => `wa:viewing:${conversationId}`;

/**
 * How long a heartbeat vouches for a viewer.
 *
 * The client refreshes well inside this. The window matters because a closed
 * laptop, a crashed tab or a killed pod never announces its departure — the TTL
 * is the only thing that stops a dead session being reported as a live colleague
 * forever, and "Ravi is also viewing" that is not true is worse than nothing.
 */
const VIEWER_TTL_MS = 45_000;

/** Record (or refresh) this operator as viewing the thread. */
export async function markViewing(conversationId: string, operator: string): Promise<void> {
  try {
    const k = key(conversationId);
    await redis.hset(k, operator, String(Date.now() + VIEWER_TTL_MS));
    // Refreshed on every heartbeat so an abandoned thread's hash disappears
    // entirely rather than lingering as an empty key.
    await redis.pexpire(k, VIEWER_TTL_MS);
  } catch (e) {
    logger.debug(`WhatsApp presence: markViewing failed: ${(e as Error).message}`);
  }
}

/** Drop this operator from the thread — a close, a switch, or a disconnect. */
export async function clearViewing(conversationId: string, operator: string): Promise<void> {
  try {
    await redis.hdel(key(conversationId), operator);
  } catch (e) {
    logger.debug(`WhatsApp presence: clearViewing failed: ${(e as Error).message}`);
  }
}

/**
 * Everyone currently viewing, sorted for a stable render.
 *
 * Expired fields are dropped from the answer AND deleted, so a thread nobody
 * returns to cleans itself up instead of accumulating dead labels until the
 * key's own TTL catches up.
 *
 * Returns `[]` on any Redis failure rather than throwing: presence is an
 * enhancement, and an inbox that will not load because a cache is down is a far
 * worse outcome than an inbox that does not mention a colleague.
 */
export async function listViewers(conversationId: string): Promise<string[]> {
  try {
    const k = key(conversationId);
    const raw = (await redis.hgetall(k)) as Record<string, string>;
    const now = Date.now();
    const live: string[] = [];
    const stale: string[] = [];
    for (const [operator, expiry] of Object.entries(raw ?? {})) {
      if (Number(expiry) > now) live.push(operator);
      else stale.push(operator);
    }
    if (stale.length) await redis.hdel(k, ...stale).catch(() => {});
    return live.sort();
  } catch (e) {
    logger.debug(`WhatsApp presence: listViewers failed: ${(e as Error).message}`);
    return [];
  }
}
