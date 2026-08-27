import type { Server as HttpServer } from 'http';
import type { Socket } from 'socket.io';
import { Server } from 'socket.io';
import { env } from './config/env';
import { verifySocketTicket } from './middleware/app-password';
import logger from './config/logger';
import { markViewing, clearViewing, listViewers } from './utils/whatsapp-presence';
import { redis } from './config/redis';
import { createAdapter } from '@socket.io/redis-adapter';

let io: Server;

/**
 * Allowed browser origins for the realtime channel.
 *
 * `FRONTEND_URL` defaults to http://localhost:3000, so a deployment that forgets
 * to set it does not fail loudly — it just rejects the real UI's handshake and
 * the inbox stops updating, while every HTTP call keeps working. That reads as
 * "realtime is broken", not "one env var is missing", so say it out loud at
 * boot and honour CORS_ORIGIN as an explicit override.
 */
const socketCorsOrigin = (): string | string[] => {
  if (env.CORS_ORIGIN && env.CORS_ORIGIN !== '*') {
    return env.CORS_ORIGIN.split(',').map((o) => o.trim());
  }
  if (env.CORS_ORIGIN === '*') return '*';
  const url = env.FRONTEND_URL;
  if (env.NODE_ENV === 'production' && url.includes('localhost')) {
    logger.warn(
      `Socket.IO CORS is set to ${url} in production — FRONTEND_URL is unset, so ` +
        'the realtime inbox will reject the real UI. Set FRONTEND_URL (or CORS_ORIGIN).'
    );
  }
  return url;
};

/**
 * Per-IP handshake throttle.
 *
 * Engine.IO hijacks the HTTP server's 'request' listeners and serves anything
 * under /socket.io itself, delegating to Express only for other paths — so NOT
 * ONE piece of Express middleware runs for a handshake. ddosProtection, the WAF,
 * apiLimiter, the structured request log and the Prometheus counter are all
 * mounted on the Express app and are simply skipped.
 *
 * That left the handshake as the one credential-checking surface in the system
 * with no rate limit, no log line and no metric: a loop over
 * `GET /socket.io/?EIO=4&transport=polling&token=<guess>` was bounded only by
 * the attacker's bandwidth, and nobody watching logs or dashboards would see it.
 *
 * Same shape as ddosProtection so the two behave alike, but keyed and counted
 * separately: handshakes are rare in normal use (one per tab), so the ceiling
 * can be far lower than an HTTP request rate.
 */
const HANDSHAKE_WINDOW_SECONDS = 60;
const HANDSHAKE_MAX_PER_WINDOW = 30;
const HANDSHAKE_BLOCK_SECONDS = 300;

/** Resolve the client address the same way Express would, honouring XFF. */
function handshakeIp(req: {
  headers: Record<string, unknown>;
  socket?: { remoteAddress?: string };
}): string {
  const hops = parseInt(env.TRUST_PROXY_HOPS, 10);
  const raw = req.headers['x-forwarded-for'];
  const xff = (Array.isArray(raw) ? raw[0] : raw) as string | undefined;
  if (hops > 0 && xff) {
    // Same semantics as Express's numeric `trust proxy`: entries are appended
    // left-to-right, so the rightmost is the one the nearest trusted proxy
    // wrote. Anything further left is client-supplied and untrustworthy.
    const parts = xff
      .split(',')
      .map((v) => v.trim())
      .filter(Boolean);
    if (parts.length) return parts[parts.length - 1];
  }
  return req.socket?.remoteAddress || 'unknown';
}

async function handshakeAllowed(ip: string): Promise<boolean> {
  try {
    const blockKey = `wa:sock:block:${ip}`;
    if (await redis.get(blockKey)) return false;

    const rateKey = `wa:sock:rate:${ip}`;
    const n = await redis.incr(rateKey);
    await redis.expire(rateKey, HANDSHAKE_WINDOW_SECONDS);
    if (n > HANDSHAKE_MAX_PER_WINDOW) {
      await redis.set(blockKey, '1', 'EX', HANDSHAKE_BLOCK_SECONDS);
      logger.warn(
        `Socket.IO: blocking ${ip} for ${HANDSHAKE_BLOCK_SECONDS}s — ` +
          `${n} handshakes in ${HANDSHAKE_WINDOW_SECONDS}s`
      );
      return false;
    }
    return true;
  } catch {
    // Redis unavailable. Allow the handshake: the credential check below is
    // pure crypto and fails closed on its own, so this degrades availability
    // rather than security.
    return true;
  }
}

export const initSocket = (httpServer: HttpServer) => {
  io = new Server(httpServer, {
    cors: {
      origin: socketCorsOrigin(),
      methods: ['GET', 'POST'],
      credentials: true,
    },
    // Runs before the Engine.IO session is created, so a throttled client costs
    // us nothing but the Redis round-trip.
    allowRequest: (req, callback) => {
      const ip = handshakeIp(req as never);
      void (async () => {
        let ok = true;
        try {
          ok = await handshakeAllowed(ip);
        } catch {
          ok = true; // never let a throttling failure become an outage
        }
        callback(ok ? null : 'Too many handshakes', ok);
      })();
    },
  });

  // Multi-replica fan-out: route Socket.IO events through Redis pub/sub so an
  // event emitted on one backend pod (e.g. a wa:message from the inbound worker)
  // reaches clients connected to a different pod. Best-effort — falls back to
  // in-process delivery if Redis can't be duplicated.
  try {
    const pubClient = redis.duplicate();
    const subClient = redis.duplicate();
    io.adapter(createAdapter(pubClient, subClient));
    logger.info('Socket.IO Redis adapter enabled (multi-replica fan-out)');
  } catch (e) {
    logger.warn(`Socket.IO Redis adapter not enabled: ${(e as Error).message}`);
  }

  /**
   * App-password authentication.
   *
   * Was a JWT handshake decoding userId / email / role. There are no accounts or
   * tokens now, so the client presents the same credential the HTTP routes use,
   * compared in constant time. Fails closed when APP_PASSWORD is unset, matching
   * requireAppPassword — an unset password must never mean "allow".
   *
   * Accepts EITHER a short-lived socket ticket (minted by
   * GET /api/v1/unlock/socket-ticket and fetched through the BFF) OR the raw
   * password (for scripts).
   *
   * Deliberately NOT the unlock cookie's value: handing page JavaScript the
   * session credential so it could open a socket defeated the cookie being
   * httpOnly, since that same value is what requireAppPassword accepts on every
   * HTTP route. The ticket is scoped to this handshake and expires in minutes.
   */
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token || socket.handshake.query?.token;
    const ip = handshakeIp(socket.request as never);

    if (!token || typeof token !== 'string') {
      logger.warn(`Socket.IO: handshake from ${ip} with no credential`);
      return next(new Error('Authentication required'));
    }
    if (!env.APP_PASSWORD) {
      return next(new Error('APP_PASSWORD is not configured'));
    }

    // ONLY the scoped, short-lived ticket. This used to also accept the raw
    // APP_PASSWORD "for scripts" — which turned the one Express-free surface in
    // the system into an unmetered, unlogged password oracle. A script that
    // needs a socket can mint a ticket the same way the browser does:
    //   GET /api/v1/unlock/socket-ticket   (with X-App-Password or the cookie)
    // That path runs behind requireAppPassword, the rate limiters and the audit
    // trail, which is exactly the point.
    const operator = verifySocketTicket(token);
    if (!operator) {
      logger.warn(`Socket.IO: rejected handshake from ${ip} — invalid or expired ticket`);
      return next(new Error('Invalid or expired socket ticket'));
    }

    // The ticket names the operator it was minted for, so this is the person
    // who signed in — not OPERATOR_LABEL, which was the same string for the
    // whole team and made every connection log line indistinguishable.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (socket as any).userId = operator;
    next();
  });

  io.on('connection', (socket: Socket) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const userId = (socket as any).userId as string;
    logger.info(`Client connected: ${socket.id} (operator: ${userId})`);

    void socket.join(`user:${userId}`);
    // Presence tracking removed: markUserOnline/Offline wrote an online set to
    // Redis that nothing ever read — no endpoint and no UI consumed it, and with
    // a single operator there is nobody to be present to.

    // Every authenticated connection is an operator — there are no roles left
    // to branch on, so the inbox room is joined unconditionally. Opening a
    // thread additionally joins a per-conversation room.
    void socket.join('wa:inbox');

    /**
     * Which thread this connection has open, so a disconnect can clean up.
     *
     * A closed laptop never sends `wa:close`, and without this the operator
     * would be reported as viewing that thread until the presence TTL lapsed.
     */
    let viewing: string | null = null;

    /** Tell everyone in the room who is looking at it now. */
    const broadcastViewers = async (conversationId: string) => {
      const viewers = await listViewers(conversationId);
      io?.to(`wa:conv:${conversationId}`).emit('wa:viewers', { conversationId, viewers });
    };

    socket.on('wa:open', (conversationId: string) => {
      if (typeof conversationId === 'string' && conversationId) {
        void socket.join(`wa:conv:${conversationId}`);
        viewing = conversationId;
        void markViewing(conversationId, userId).then(() => broadcastViewers(conversationId));
      }
    });
    /**
     * Refresh the presence entry without re-joining.
     *
     * The entry expires on its own so a dead session cannot be reported as a
     * live colleague; a tab that is genuinely still open has to say so
     * periodically, and this is the cheapest way to say it.
     */
    socket.on('wa:viewing', (conversationId: string) => {
      if (typeof conversationId === 'string' && conversationId && conversationId === viewing) {
        void markViewing(conversationId, userId).then(() => broadcastViewers(conversationId));
      }
    });
    socket.on('wa:close', (conversationId: string) => {
      if (typeof conversationId === 'string' && conversationId) {
        void socket.leave(`wa:conv:${conversationId}`);
        if (viewing === conversationId) viewing = null;
        void clearViewing(conversationId, userId).then(() => broadcastViewers(conversationId));
      }
    });

    // The `email:*` and `mailbox:*` handlers (campaign reply inbox and the
    // one-on-one webmail IMAP IDLE push) went with the email system.

    socket.on('disconnect', () => {
      logger.info(`Client disconnected: ${socket.id}`);
      // Announce the departure immediately rather than leaving colleagues to
      // wait out the TTL staring at a warning about somebody who has gone.
      if (viewing) {
        const left = viewing;
        viewing = null;
        void clearViewing(left, userId).then(() => broadcastViewers(left));
      }
    });
  });

  return io;
};

export const getIO = () => {
  if (!io) {
    throw new Error('Socket.io not initialized!');
  }
  return io;
};

/**
 * Disconnect every client and release the server's grip on the HTTP listener.
 * Called during graceful shutdown — without it, `server.close()` never resolves
 * while any operator tab is open.
 */
export const closeSocket = async (): Promise<void> => {
  if (!io) return;
  await new Promise<void>((resolve) => {
    void io.close(() => resolve());
    // Socket.IO's close callback waits on the underlying engine; don't let a
    // wedged client turn shutdown into a hang.
    setTimeout(resolve, 5000).unref();
  });
  logger.info('Socket.IO closed');
};
