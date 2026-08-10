import type { Server as HttpServer } from 'http';
import type { Socket } from 'socket.io';
import { Server } from 'socket.io';
import crypto from 'crypto';
import { env } from './config/env';
import { unlockToken } from './middleware/app-password';
import logger from './config/logger';
import { redis } from './config/redis';
import { createAdapter } from '@socket.io/redis-adapter';

let io: Server;

export const initSocket = (httpServer: HttpServer) => {
  io = new Server(httpServer, {
    cors: {
      origin: env.FRONTEND_URL || '*',
      methods: ['GET', 'POST'],
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
   * Accepts EITHER the unlock token (the HMAC held in the httpOnly `wa_unlock`
   * cookie, handed to the browser by the BFF's /api/auth/socket-token) OR the
   * raw password (for scripts). The browser therefore never holds the password
   * itself — same split as requireAppPassword's cookie-or-header.
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
    if (!equals(token, unlockToken()) && !equals(token, env.APP_PASSWORD)) {
      return next(new Error('Invalid app password'));
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (socket as any).userId = env.OPERATOR_LABEL || 'operator';
    next();
  });

  io.on('connection', (socket: Socket) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const userId = (socket as any).userId as string;
    logger.info(`Client connected: ${socket.id} (operator: ${userId})`);

    socket.join(`user:${userId}`);
    // Presence tracking removed: markUserOnline/Offline wrote an online set to
    // Redis that nothing ever read — no endpoint and no UI consumed it, and with
    // a single operator there is nobody to be present to.

    // Every authenticated connection is the operator — there are no roles left
    // to branch on, so the inbox room is joined unconditionally. Opening a
    // thread additionally joins a per-conversation room.
    socket.join('wa:inbox');

    socket.on('wa:open', (conversationId: string) => {
      if (typeof conversationId === 'string' && conversationId) {
        socket.join(`wa:conv:${conversationId}`);
      }
    });
    socket.on('wa:close', (conversationId: string) => {
      if (typeof conversationId === 'string' && conversationId) {
        socket.leave(`wa:conv:${conversationId}`);
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
