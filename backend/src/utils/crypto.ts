import crypto from 'crypto';
import { env } from '../config/env';

/**
 * Generate a cryptographically secure random token
 * @param length - Length of the token in bytes (default: 32)
 * @returns Hex encoded token string
 */
export const generateSecureToken = (length: number = 32): string => {
  return crypto.randomBytes(length).toString('hex');
};

/**
 * Hash a token using SHA256 for secure storage
 * @param token - Plain token to hash
 * @returns Hashed token
 */
export const hashToken = (token: string): string => {
  return crypto.createHash('sha256').update(token).digest('hex');
};

/**
 * Generate a random numeric OTP
 * @param length - Length of the OTP (default from env)
 * @returns Numeric OTP string
 */
export const generateOtp = (length: number = parseInt(env.OTP_LENGTH, 10)): string => {
  const min = Math.pow(10, length - 1);
  const max = Math.pow(10, length);
  return crypto.randomInt(min, max).toString();
};

/**
 * Generate backup codes for MFA recovery
 * @param count - Number of backup codes to generate
 * @returns Array of backup codes
 */
export const generateBackupCodes = (count: number = 10): string[] => {
  const codes: string[] = [];
  for (let i = 0; i < count; i++) {
    // Format: XXXX-XXXX (8 alphanumeric characters)
    const code = crypto.randomBytes(4).toString('hex').toUpperCase();
    codes.push(`${code.slice(0, 4)}-${code.slice(4, 8)}`);
  }
  return codes;
};

/**
 * Compare a plain token with a hashed token
 * @param plainToken - Plain token to compare
 * @param hashedToken - Hashed token from storage
 * @returns Boolean indicating if tokens match
 */
export const compareTokens = (plainToken: string, hashedToken: string): boolean => {
  const hashedPlain = hashToken(plainToken);
  return crypto.timingSafeEqual(Buffer.from(hashedPlain, 'hex'), Buffer.from(hashedToken, 'hex'));
};
