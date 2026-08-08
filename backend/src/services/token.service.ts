import prisma from '../config/prisma';
import redis from '../config/redis';
import { hashToken, generateSecureToken } from '../utils/crypto';
import { signRefreshToken, getTokenExpirationMs } from '../utils/jwt';
import { env } from '../config/env';
import logger from '../config/logger';

const TOKEN_CACHE_TTL = 60; // 1 minute — short enough for timely revocation
const tokenCacheKey = (hashedToken: string) => `token:valid:${hashedToken}`;

/**
 * Create and store a new refresh token for a user
 * @param userId - User ID
 * @param userAgent - User agent string
 * @param ipAddress - IP address
 * @returns The plain refresh token (to send to client)
 */
export const createRefreshToken = async (
  userId: string,
  userAgent?: string,
  ipAddress?: string,
  sessionId?: string
): Promise<string> => {
  // Generate a unique token ID
  const tokenId = generateSecureToken(16);

  // Create the JWT refresh token with the token ID embedded
  const refreshToken = signRefreshToken({
    userId,
    email: '', // Will be filled by auth service
    role: '', // Will be filled by auth service
    sessionId: sessionId || '',
  });

  // Calculate expiration date
  const expiresIn = getTokenExpirationMs(env.JWT_REFRESH_EXPIRES_IN);
  const expiresAt = new Date(Date.now() + expiresIn);

  // Hash the token for storage
  const hashedToken = hashToken(refreshToken);

  // Store in database
  await prisma.refreshToken.create({
    data: {
      id: tokenId,
      token: hashedToken,
      userId,
      expiresAt,
      userAgent,
      ipAddress,
      sessionId,
    },
  });

  // Enforce session limit
  const maxSessions = parseInt(env.MAX_SESSIONS_PER_USER, 10);
  const sessions = await prisma.refreshToken.findMany({
    where: { userId, isRevoked: false },
    orderBy: { createdAt: 'desc' },
  });
  if (sessions.length > maxSessions) {
    const toRevoke = sessions.slice(maxSessions);
    await prisma.refreshToken.updateMany({
      where: { id: { in: toRevoke.map((s) => s.id) } },
      data: { isRevoked: true },
    });
  }

  logger.debug(`Created refresh token for user ${userId}`);

  return refreshToken;
};

/**
 * Revoke a specific refresh token
 * @param token - Plain refresh token
 */
export const revokeToken = async (token: string): Promise<void> => {
  const hashedToken = hashToken(token);

  await prisma.refreshToken.updateMany({
    where: { token: hashedToken },
    data: { isRevoked: true },
  });

  // Invalidate cached validity so revocation is immediate
  redis.del(tokenCacheKey(hashedToken)).catch(() => {});

  logger.debug('Refresh token revoked');
};

/**
 * Revoke all refresh tokens for a user (logout everywhere)
 * @param userId - User ID
 */
export const revokeAllUserTokens = async (userId: string): Promise<void> => {
  // Fetch hashed tokens before revoking so we can invalidate cache
  const tokens = await prisma.refreshToken.findMany({
    where: { userId, isRevoked: false },
    select: { token: true },
  });

  const result = await prisma.refreshToken.updateMany({
    where: { userId },
    data: { isRevoked: true },
  });

  // Invalidate cached validity for all revoked tokens
  for (const t of tokens) {
    redis.del(tokenCacheKey(t.token)).catch(() => {});
  }

  logger.info(`Revoked ${result.count} tokens for user ${userId}`);
};

/**
 * Check if a refresh token is valid (not revoked, not expired)
 * @param token - Plain refresh token
 * @returns Boolean indicating if token is valid
 */
export const isTokenValid = async (token: string): Promise<boolean> => {
  const hashedToken = hashToken(token);
  const cacheKey = tokenCacheKey(hashedToken);

  // Check Redis cache first
  try {
    const cached = await redis.get(cacheKey);
    if (cached === '1') return true;
    if (cached === '0') return false;
  } catch {
    // Redis down — fall through to DB
  }

  const storedToken = await prisma.refreshToken.findUnique({
    where: { token: hashedToken },
  });

  const valid = !!storedToken && !storedToken.isRevoked && storedToken.expiresAt >= new Date();

  // Cache the result (fire-and-forget)
  redis.set(cacheKey, valid ? '1' : '0', 'EX', TOKEN_CACHE_TTL).catch(() => {});

  return valid;
};

/**
 * Get refresh token record by plain token
 * @param token - Plain refresh token
 * @returns RefreshToken record or null
 */
export const getTokenRecord = async (token: string) => {
  const hashedToken = hashToken(token);

  return prisma.refreshToken.findUnique({
    where: { token: hashedToken },
    include: { user: true },
  });
};

/**
 * Clean up expired and revoked tokens (for scheduled job)
 */
export const cleanupExpiredTokens = async (): Promise<number> => {
  const result = await prisma.refreshToken.deleteMany({
    where: {
      OR: [{ expiresAt: { lt: new Date() } }, { isRevoked: true }],
    },
  });

  logger.info(`Cleaned up ${result.count} expired/revoked tokens`);
  return result.count;
};
