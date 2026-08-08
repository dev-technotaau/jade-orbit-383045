import axios from 'axios';
import crypto from 'crypto';
import logger from '../config/logger';
import { env } from '../config/env';

const HIBP_API_URL = 'https://api.pwnedpasswords.com/range';

/**
 * Check if a password has been exposed in known data breaches
 * Uses the k-anonymity model - only sends first 5 chars of SHA1 hash
 *
 * @param password - Plain text password to check
 * @returns Object with isBreached boolean and count if found
 */
export const checkPasswordBreach = async (
  password: string
): Promise<{ isBreached: boolean; count: number; warning?: string }> => {
  // Skip if HIBP is disabled
  if (!env.HIBP_ENABLED) {
    return { isBreached: false, count: 0 };
  }

  try {
    // Hash the password with SHA-1 (required by HIBP API)
    const sha1Hash = crypto.createHash('sha1').update(password).digest('hex').toUpperCase();

    // Split hash into prefix (first 5 chars) and suffix (rest)
    const prefix = sha1Hash.slice(0, 5);
    const suffix = sha1Hash.slice(5);

    // Request all hashes that start with this prefix
    const response = await axios.get(`${HIBP_API_URL}/${prefix}`, {
      timeout: 5000,
      headers: {
        'User-Agent': 'HireAdda-PasswordCheck',
      },
    });

    // Parse response - each line is "SUFFIX:COUNT"
    const hashes = response.data.split('\n');

    for (const hash of hashes) {
      const [hashSuffix, count] = hash.split(':');
      if (hashSuffix.trim() === suffix) {
        const breachCount = parseInt(count.trim(), 10);
        logger.warn(`Password found in ${breachCount} data breaches`);

        return {
          isBreached: true,
          count: breachCount,
          warning: `This password has appeared in ${breachCount.toLocaleString()} data breaches. We recommend choosing a different password for better security.`,
        };
      }
    }

    return { isBreached: false, count: 0 };
  } catch (error) {
    // Log error but don't block registration
    logger.error('HIBP API check failed:', error);
    return { isBreached: false, count: 0 };
  }
};

/**
 * Validate password strength against configured rules
 * @param password - Password to validate
 * @returns Object with isValid boolean and errors array
 */
export const validatePasswordStrength = (
  password: string
): { isValid: boolean; errors: string[] } => {
  const errors: string[] = [];
  const minLength = parseInt(env.PASSWORD_MIN_LENGTH, 10);
  const maxLength = parseInt(env.PASSWORD_MAX_LENGTH, 10);

  if (password.length < minLength) {
    errors.push(`Password must be at least ${minLength} characters`);
  }

  if (password.length > maxLength) {
    errors.push(`Password must be at most ${maxLength} characters`);
  }

  if (env.PASSWORD_REQUIRE_UPPERCASE === 'true' && !/[A-Z]/.test(password)) {
    errors.push('Password must contain at least one uppercase letter');
  }

  if (env.PASSWORD_REQUIRE_LOWERCASE === 'true' && !/[a-z]/.test(password)) {
    errors.push('Password must contain at least one lowercase letter');
  }

  if (env.PASSWORD_REQUIRE_NUMBER === 'true' && !/\d/.test(password)) {
    errors.push('Password must contain at least one number');
  }

  if (env.PASSWORD_REQUIRE_SPECIAL === 'true' && !/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
    errors.push('Password must contain at least one special character');
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
};
