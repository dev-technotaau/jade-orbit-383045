import type { Server as HttpServer } from 'http';
import type { Socket } from 'socket.io';
import { Server } from 'socket.io';
import crypto from 'crypto';
import { env } from './config/env';
import { verifySocketTicket } from './middleware/app-password';
import logger from './config/logger';
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

export const initSocket = (httpServer: HttpServer) => {
  io = new Server(httpServer, {
    cors: {
      origin: socketCorsOrigin(),
      methods: ['GET', 'POST'],
      credentials: true,
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
    if (!token || typeof token !== 'string') {
      return next(new Error('Authentication required'));
    }
    if (!env.APP_PASSWORD) {
      return next(new Error('APP_PASSWORD is not configured'));
    }
    const equals = (a: string, b: string): boolean => {
      const ab = Buffer.from(a);
      const bb = Buffer.from(b);
      return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
    };
    if (!verifySocketTicket(token) && !equals(token, env.APP_PASSWORD)) {
      return next(new Error('Invalid or expired socket ticket'));
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (socket as any).userId = env.OPERATOR_LABEL || 'operator';
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

    // Every authenticated connection is the operator — there are no roles left
    // to branch on, so the inbox room is joined unconditionally. Opening a
    // thread additionally joins a per-conversation room.
    void socket.join('wa:inbox');

    socket.on('wa:open', (conversationId: string) => {
      if (typeof conversationId === 'string' && conversationId) {
        void socket.join(`wa:conv:${conversationId}`);
      }
    });
    socket.on('wa:close', (conversationId: string) => {
      if (typeof conversationId === 'string' && conversationId) {
        void socket.leave(`wa:conv:${conversationId}`);
      }
    });

    // The `email:*` and `mailbox:*` handlers (campaign reply inbox and the
    // one-on-one webmail IMAP IDLE push) went with the email system.

    socket.on('disconnect', () => {
      logger.info(`Client disconnected: ${socket.id}`);
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
