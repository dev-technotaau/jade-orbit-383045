import type { JwtPayload, SignOptions } from 'jsonwebtoken';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';

export interface TokenPayload {
  userId: string;
  email: string;
  role: string;
  sessionId: string;
}

export interface DecodedToken extends JwtPayload {
  userId: string;
  email: string;
  role: string;
  sessionId?: string;
}

const isRS256 = env.JWT_ALGORITHM === 'RS256';

/** Get the key used to sign access tokens */
const getAccessSigningKey = (): jwt.Secret => {
  if (isRS256 && env.JWT_PRIVATE_KEY) {
    return env.JWT_PRIVATE_KEY.replace(/\\n/g, '\n');
  }
  return env.JWT_SECRET;
};

/** Get the key used to verify access tokens */
const getAccessVerifyingKey = (): jwt.Secret => {
  if (isRS256 && env.JWT_PUBLIC_KEY) {
    return env.JWT_PUBLIC_KEY.replace(/\\n/g, '\n');
  }
  return env.JWT_SECRET;
};

/** Get the key used to sign refresh tokens */
const getRefreshSigningKey = (): jwt.Secret => {
  if (isRS256 && env.JWT_PRIVATE_KEY) {
    return env.JWT_PRIVATE_KEY.replace(/\\n/g, '\n');
  }
  return env.JWT_REFRESH_SECRET;
};

/** Get the key used to verify refresh tokens */
const getRefreshVerifyingKey = (): jwt.Secret => {
  if (isRS256 && env.JWT_PUBLIC_KEY) {
    return env.JWT_PUBLIC_KEY.replace(/\\n/g, '\n');
  }
  return env.JWT_REFRESH_SECRET;
};

/**
 * Sign an access token (short-lived)
 * @param payload - Token payload
 * @returns Signed JWT access token
 */
export const signAccessToken = (payload: TokenPayload): string => {
  const options: SignOptions = {
    expiresIn: env.JWT_EXPIRES_IN as `${number}${'s' | 'm' | 'h' | 'd'}`,
    algorithm: env.JWT_ALGORITHM as jwt.Algorithm,
  };

  return jwt.sign(payload, getAccessSigningKey(), options);
};

/**
 * Sign a refresh token (long-lived)
 * @param payload - Token payload
 * @returns Signed JWT refresh token
 */
export const signRefreshToken = (payload: TokenPayload): string => {
  const options: SignOptions = {
    expiresIn: env.JWT_REFRESH_EXPIRES_IN as `${number}${'s' | 'm' | 'h' | 'd'}`,
    algorithm: env.JWT_ALGORITHM as jwt.Algorithm,
  };

  return jwt.sign(payload, getRefreshSigningKey(), options);
};

/**
 * Verify an access token
 * @param token - JWT to verify
 * @returns Decoded token payload
 * @throws Error if token is invalid
 */
export const verifyAccessToken = (token: string): DecodedToken => {
  return jwt.verify(token, getAccessVerifyingKey(), {
    algorithms: [env.JWT_ALGORITHM as jwt.Algorithm],
  }) as DecodedToken;
};

/**
 * Verify a refresh token
 * @param token - JWT to verify
 * @returns Decoded token payload
 * @throws Error if token is invalid
 */
export const verifyRefreshToken = (token: string): DecodedToken => {
  return jwt.verify(token, getRefreshVerifyingKey(), {
    algorithms: [env.JWT_ALGORITHM as jwt.Algorithm],
  }) as DecodedToken;
};

/**
 * Decode a token without verification (for debugging)
 * @param token - JWT to decode
 * @returns Decoded token or null
 */
export const decodeToken = (token: string): DecodedToken | null => {
  return jwt.decode(token) as DecodedToken | null;
};

/**
 * Get token expiration time in milliseconds
 * @param expiresIn - Expiration string (e.g., '7d', '15m')
 * @returns Expiration time in milliseconds from now
 */
export const getTokenExpirationMs = (expiresIn: string): number => {
  const units: Record<string, number> = {
    s: 1000,
    m: 60 * 1000,
    h: 60 * 60 * 1000,
    d: 24 * 60 * 60 * 1000,
  };

  const match = expiresIn.match(/^(\d+)([smhd])$/);
  if (!match) {
    throw new Error(`Invalid expiration format: ${expiresIn}`);
  }

  const [, value, unit] = match;
  return parseInt(value, 10) * units[unit];
};
