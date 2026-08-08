import { prisma } from '../config/prisma';
import redis from '../config/redis';
import logger from '../config/logger';
import { AppError } from '../middleware/error';
import {} from '../kafka/producer';
import { publishEvent } from '../kafka/producer';
import { KafkaTopics } from '../kafka/topics';

const SESSION_CACHE_TTL = 60; // 1 minute
const FULL_SESSION_TTL = 86400; // 24 hours
const sessionCacheKey = (id: string) => `session:active:${id}`;
const fullSessionKey = (id: string) => `session:full:${id}`;
const tokenCacheKey = (hashedToken: string) => `token:valid:${hashedToken}`;

interface CachedSessionData {
  userId: string;
  userAgent?: string;
  ipAddress?: string;
  isActive: boolean;
  createdAt: string;
  lastSeenAt: string;
}

class SessionService {
  async createSession(userId: string, userAgent?: string, ipAddress?: string) {
    const session = await prisma.session.create({
      data: { userId, userAgent, ipAddress },
    });

    // Cache full session in Redis (fire-and-forget)
    const sessionData: CachedSessionData = {
      userId,
      userAgent,
      ipAddress,
      isActive: true,
      createdAt: session.createdAt.toISOString(),
      lastSeenAt: session.lastSeenAt.toISOString(),
    };
    redis
      .set(fullSessionKey(session.id), JSON.stringify(sessionData), 'EX', FULL_SESSION_TTL)
      .catch(() => {});

    return session;
  }

  async listActiveSessions(userId: string) {
    return prisma.session.findMany({
      where: { userId, isActive: true },
      orderBy: { lastSeenAt: 'desc' },
    });
  }

  /**
   * Check if a session is still active (Redis-cached for performance).
   * Uses full session cache first, then falls back to simple active cache, then DB.
   */
  async isSessionActive(sessionId: string): Promise<boolean> {
    // Try full session cache first (richer data, longer TTL)
    try {
      const fullCached = await redis.get(fullSessionKey(sessionId));
      if (fullCached) {
        const data = JSON.parse(fullCached) as CachedSessionData;
        return data.isActive;
      }
    } catch {
      // Redis down — fall through
    }

    // Try simple active cache
    try {
      const cached = await redis.get(sessionCacheKey(sessionId));
      if (cached === '1') return true;
      if (cached === '0') return false;
    } catch {
      // Redis down — fall through to DB
    }

    const session = await prisma.session.findUnique({
      where: { id: sessionId },
      select: {
        isActive: true,
        userId: true,
        userAgent: true,
        ipAddress: true,
        createdAt: true,
        lastSeenAt: true,
      },
    });
    const active = !!session?.isActive;

    // Cache the results (fire-and-forget)
    redis
      .set(sessionCacheKey(sessionId), active ? '1' : '0', 'EX', SESSION_CACHE_TTL)
      .catch(() => {});
    if (session) {
      const sessionData: CachedSessionData = {
        userId: session.userId,
        userAgent: session.userAgent || undefined,
        ipAddress: session.ipAddress || undefined,
        isActive: session.isActive,
        createdAt: session.createdAt.toISOString(),
        lastSeenAt: session.lastSeenAt.toISOString(),
      };
      redis
        .set(fullSessionKey(sessionId), JSON.stringify(sessionData), 'EX', FULL_SESSION_TTL)
        .catch(() => {});
    }

    return active;
  }

  /**
   * Revoke a specific session by userId + sessionId.
   * Also revokes all linked refresh tokens and invalidates Redis caches.
   */
  async revokeSession(userId: string, sessionId: string) {
    const session = await prisma.session.findFirst({
      where: { id: sessionId, userId },
    });
    if (!session) throw new AppError('Session not found', 404);

    // Deactivate session
    await prisma.session.update({
      where: { id: sessionId },
      data: { isActive: false },
    });

    // Invalidate all session Redis caches
    redis.del(sessionCacheKey(sessionId)).catch(() => {});
    redis.del(fullSessionKey(sessionId)).catch(() => {});

    // Revoke linked refresh tokens and invalidate their caches
    await this.revokeLinkedTokens(sessionId);

    // Publish Kafka event
    publishEvent(KafkaTopics.SESSION_REVOKED, userId, { userId, sessionId }).catch(() => {});
  }

  /**
   * Revoke a session by sessionId only (for super admin — no userId ownership check).
   */
  async revokeSessionById(sessionId: string) {
    const session = await prisma.session.findUnique({
      where: { id: sessionId },
    });
    if (!session) throw new AppError('Session not found', 404);

    await prisma.session.update({
      where: { id: sessionId },
      data: { isActive: false },
    });

    redis.del(sessionCacheKey(sessionId)).catch(() => {});
    redis.del(fullSessionKey(sessionId)).catch(() => {});
    await this.revokeLinkedTokens(sessionId);
  }

  async updateLastSeen(sessionId: string) {
    await prisma.session
      .update({
        where: { id: sessionId },
        data: { lastSeenAt: new Date() },
      })
      .catch(() => {}); // Non-critical, don't throw
  }

  async revokeAllSessions(userId: string, excludeSessionId?: string) {
    const where: { userId: string; isActive: true; id?: { not: string } } = {
      userId,
      isActive: true,
    };
    if (excludeSessionId) {
      where.id = { not: excludeSessionId };
    }

    // Get all active sessions to invalidate caches
    const sessions = await prisma.session.findMany({
      where,
      select: { id: true },
    });

    await prisma.session.updateMany({ where, data: { isActive: false } });

    // Invalidate Redis cache for each session + revoke linked tokens
    for (const session of sessions) {
      redis.del(sessionCacheKey(session.id)).catch(() => {});
      redis.del(fullSessionKey(session.id)).catch(() => {});
      await this.revokeLinkedTokens(session.id);
    }
  }

  /**
   * Revoke all refresh tokens linked to a session and invalidate their Redis caches.
   */
  private async revokeLinkedTokens(sessionId: string) {
    // Get hashed tokens before revoking so we can invalidate their caches
    const tokens = await prisma.refreshToken.findMany({
      where: { sessionId, isRevoked: false },
      select: { token: true },
    });

    if (tokens.length === 0) return;

    await prisma.refreshToken.updateMany({
      where: { sessionId, isRevoked: false },
      data: { isRevoked: true },
    });

    // Invalidate token cache keys
    for (const t of tokens) {
      redis.del(tokenCacheKey(t.token)).catch(() => {});
    }

    logger.debug(`Revoked ${tokens.length} refresh tokens for session ${sessionId}`);
  }
}

export const sessionService = new SessionService();
