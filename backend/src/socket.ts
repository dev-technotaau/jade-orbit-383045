import type { Server as HttpServer } from 'http';
import type { Socket } from 'socket.io';
import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';
import { env } from './config/env';
import logger from './config/logger';
import { redis } from './config/redis';
import { createAdapter } from '@socket.io/redis-adapter';
import { markUserOnline, markUserOffline } from './utils/online-users';
import { getAccountRow, resolveImapCreds } from './services/email-account.service';
import { watchMailbox } from './services/email-idle.service';

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
  // reaches clients connected to a different pod. The deployment runs 2+ replicas;
  // best-effort — falls back to in-process delivery if Redis can't be duplicated.
  try {
    const pubClient = redis.duplicate();
    const subClient = redis.duplicate();
    io.adapter(createAdapter(pubClient, subClient));
    logger.info('Socket.IO Redis adapter enabled (multi-replica fan-out)');
  } catch (e) {
    logger.warn(`Socket.IO Redis adapter not enabled: ${(e as Error).message}`);
  }

  // JWT Authentication middleware
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token || socket.handshake.query?.token;
    if (!token || typeof token !== 'string') {
      return next(new Error('Authentication required'));
    }

    try {
      const decoded = jwt.verify(token, env.JWT_SECRET) as {
        userId: string;
        email: string;
        role: string;
      };
      (socket as any).userId = decoded.userId;
      (socket as any).userRole = decoded.role;
      next();
    } catch {
      next(new Error('Invalid or expired token'));
    }
  });

  io.on('connection', (socket: Socket) => {
    const userId = (socket as any).userId;
    logger.info(`Client connected: ${socket.id} (user: ${userId})`);

    // Auto-join user-specific room
    if (userId) {
      socket.join(`user:${userId}`);
      markUserOnline(userId).catch(() => {});
    }

    // Super-admins / admins auto-join the WhatsApp inbox room for live updates;
    // opening a thread additionally joins a per-conversation room.
    const userRole = (socket as any).userRole;
    if (userRole === 'SUPER_ADMIN' || userRole === 'ADMIN') {
      socket.join('wa:inbox');
      // Email replies inbox — same auto-join pattern; opening a thread joins a
      // per-thread room for live message/status updates.
      socket.join('email:inbox');
    }
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
    socket.on('email:open', (threadId: string) => {
      if (typeof threadId === 'string' && threadId) socket.join(`email:thread:${threadId}`);
    });
    socket.on('email:close', (threadId: string) => {
      if (typeof threadId === 'string' && threadId) socket.leave(`email:thread:${threadId}`);
    });

    // ── Admin soft locks / presence ──
    // An admin opening a shared record joins that record's room so lock and
    // presence changes arrive without polling. Joining a room only receives
    // lock STATE (who is here) — never the record itself — so this needs no
    // permission check beyond "is an admin"; the record's own endpoint still
    // decides whether they can read it.
    if (userRole === 'SUPER_ADMIN' || userRole === 'ADMIN') {
      socket.on('lock:watch', (payload: { resourceType?: string; resourceId?: string }) => {
        const { resourceType, resourceId } = payload ?? {};
        if (typeof resourceType !== 'string' || typeof resourceId !== 'string') return;
        if (!resourceType || !resourceId) return;
        socket.join(`lock:${resourceType}:${resourceId}`);
      });
      socket.on('lock:unwatch', (payload: { resourceType?: string; resourceId?: string }) => {
        const { resourceType, resourceId } = payload ?? {};
        if (typeof resourceType !== 'string' || typeof resourceId !== 'string') return;
        if (!resourceType || !resourceId) return;
        socket.leave(`lock:${resourceType}:${resourceId}`);
      });
    }

    // ── One-on-one webmail: live IMAP IDLE push ──
    // Subscribe to real-time updates for a personal mailbox folder. Ownership is
    // enforced (getAccountRow throws unless the account belongs to this user);
    // the pooled idle watcher relays new-mail/expunge/flag changes to this socket.
    const mailboxUnsubs = new Map<string, () => void>();
    socket.on('mailbox:subscribe', async (payload: { accountId?: string; folder?: string }) => {
      const accountId = payload?.accountId;
      const folder = payload?.folder;
      if (typeof accountId !== 'string' || typeof folder !== 'string' || !accountId || !folder) {
        return;
      }
      if (userRole !== 'SUPER_ADMIN') return;
      const key = `${accountId}::${folder}`;
      if (mailboxUnsubs.has(key)) return;
      mailboxUnsubs.set(key, () => {}); // reserve synchronously against concurrent subscribes
      try {
        const account = await getAccountRow(userId, accountId);
        const unwatch = await watchMailbox(resolveImapCreds(account), folder, (update) => {
          socket.emit('mailbox:update', { accountId, ...update });
        });
        // Unsubscribed/disconnected during connect → the reservation was removed.
        if (!mailboxUnsubs.has(key) || socket.disconnected) {
          unwatch();
          mailboxUnsubs.delete(key);
          return;
        }
        mailboxUnsubs.set(key, unwatch);
      } catch {
        // not owned / connect failed — drop the reservation; UI keeps its poll fallback
        mailboxUnsubs.delete(key);
      }
    });
    socket.on('mailbox:unsubscribe', (payload: { accountId?: string; folder?: string }) => {
      const key = `${payload?.accountId}::${payload?.folder}`;
      const unwatch = mailboxUnsubs.get(key);
      if (unwatch) {
        unwatch();
        mailboxUnsubs.delete(key);
      }
    });

    socket.on('disconnect', () => {
      logger.info(`Client disconnected: ${socket.id}`);
      for (const unwatch of mailboxUnsubs.values()) unwatch();
      mailboxUnsubs.clear();
      if (userId) {
        markUserOffline(userId).catch(() => {});
      }
    });

    // Keep backward compat for manual room joining
    socket.on('join_user', (requestedUserId: string) => {
      if (requestedUserId === userId) {
        socket.join(`user:${requestedUserId}`);
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
