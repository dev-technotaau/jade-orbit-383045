import { redis } from '../config/redis';
import { AppError } from '../middleware/error';
import logger from '../config/logger';

const MAX_OTP_ATTEMPTS = 5;
const OTP_WINDOW_SECONDS = 900; // 15 minutes

/**
 * Check and increment OTP verification attempts for a user.
 * Throws 429 if the user has exceeded the max attempts within the window.
 *
 * @param userId - The user ID to rate-limit
 */
export async function checkOtpAttempts(userId: string): Promise<void> {
  const key = `otp:attempts:${userId}`;
  try {
    const attempts = await redis.incr(key);
    // Set expiry only on first attempt (when incr returns 1)
    if (attempts === 1) {
      await redis.expire(key, OTP_WINDOW_SECONDS);
    }

    if (attempts > MAX_OTP_ATTEMPTS) {
      throw new AppError(
        'Too many OTP attempts. Please wait 15 minutes before trying again.',
        429,
        'OTP_RATE_LIMITED'
      );
    }
  } catch (error) {
    // Re-throw AppError (rate limit exceeded)
    if (error instanceof AppError) throw error;
    // Graceful degradation: if Redis is down, skip rate limiting
    logger.error(`OTP rate-limit check failed for ${userId}:`, error);
  }
}

/**
 * Reset OTP attempts after successful verification.
 * @param userId - The user ID to reset
 */
export async function resetOtpAttempts(userId: string): Promise<void> {
  const key = `otp:attempts:${userId}`;
  try {
    await redis.del(key);
  } catch (error) {
    logger.error(`Failed to reset OTP attempts for ${userId}:`, error);
  }
}
