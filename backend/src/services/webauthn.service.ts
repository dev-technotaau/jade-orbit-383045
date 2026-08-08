import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from '@simplewebauthn/server';
import type {
  RegistrationResponseJSON,
  AuthenticationResponseJSON,
  AuthenticatorTransportFuture,
} from '@simplewebauthn/types';
import prisma from '../config/prisma';
import redis from '../config/redis';
import { env } from '../config/env';
import logger from '../config/logger';
import { AppError } from '../middleware/error';

const RP_ID = env.WEBAUTHN_RP_ID;
const RP_NAME = env.WEBAUTHN_RP_NAME;
const ORIGIN = env.WEBAUTHN_ORIGIN;
const CHALLENGE_TTL = 300; // 5 minutes

function challengeKey(sessionId: string, type: 'reg' | 'auth'): string {
  return `webauthn:challenge:${type}:${sessionId}`;
}

async function storeChallenge(
  sessionId: string,
  type: 'reg' | 'auth',
  challenge: string
): Promise<void> {
  try {
    await redis.set(challengeKey(sessionId, type), challenge, 'EX', CHALLENGE_TTL);
  } catch (error) {
    logger.error('Failed to store WebAuthn challenge in Redis:', error);
    throw new AppError('Authentication service unavailable', 503, 'REDIS_UNAVAILABLE');
  }
}

async function getChallenge(sessionId: string, type: 'reg' | 'auth'): Promise<string | null> {
  try {
    const challenge = await redis.get(challengeKey(sessionId, type));
    if (challenge) {
      await redis.del(challengeKey(sessionId, type));
    }
    return challenge;
  } catch (error) {
    logger.error('Failed to retrieve WebAuthn challenge from Redis:', error);
    throw new AppError('Authentication service unavailable', 503, 'REDIS_UNAVAILABLE');
  }
}

export const webauthnService = {
  async generateRegistrationOptions(userId: string, userEmail: string, sessionId: string) {
    const existingCredentials = await prisma.webAuthnCredential.findMany({
      where: { userId },
      select: { credentialId: true, transports: true },
    });

    const options = await generateRegistrationOptions({
      rpName: RP_NAME,
      rpID: RP_ID,
      userName: userEmail,
      userDisplayName: userEmail,
      attestationType: 'none',
      excludeCredentials: existingCredentials.map((cred) => ({
        id: cred.credentialId,
        transports: cred.transports as AuthenticatorTransportFuture[],
      })),
      authenticatorSelection: {
        residentKey: 'preferred',
        userVerification: 'preferred',
      },
    });

    await storeChallenge(sessionId, 'reg', options.challenge);
    return options;
  },

  async verifyRegistration(
    userId: string,
    credential: RegistrationResponseJSON,
    sessionId: string,
    friendlyName?: string
  ) {
    const expectedChallenge = await getChallenge(sessionId, 'reg');
    if (!expectedChallenge) {
      throw new AppError('Registration challenge expired or not found', 401, 'CHALLENGE_EXPIRED');
    }

    const verification = await verifyRegistrationResponse({
      response: credential,
      expectedChallenge,
      expectedOrigin: ORIGIN,
      expectedRPID: RP_ID,
    });

    if (!verification.verified || !verification.registrationInfo) {
      throw new AppError('Registration verification failed', 400, 'REGISTRATION_FAILED');
    }

    const {
      credential: verifiedCredential,
      credentialDeviceType,
      credentialBackedUp,
    } = verification.registrationInfo;

    const stored = await prisma.webAuthnCredential.create({
      data: {
        userId,
        credentialId: verifiedCredential.id,
        publicKey: Buffer.from(verifiedCredential.publicKey),
        counter: verifiedCredential.counter,
        transports: credential.response.transports || [],
        deviceType: credentialDeviceType,
        backedUp: credentialBackedUp,
        friendlyName: friendlyName || 'My Passkey',
      },
    });

    logger.info(`WebAuthn credential registered for user ${userId}: ${stored.id}`);
    return { credentialId: stored.id, friendlyName: stored.friendlyName };
  },

  async generateAuthenticationOptions(sessionId: string, userId?: string) {
    let allowCredentials: { id: string; transports: AuthenticatorTransportFuture[] }[] | undefined;

    if (userId) {
      const credentials = await prisma.webAuthnCredential.findMany({
        where: { userId },
        select: { credentialId: true, transports: true },
      });
      allowCredentials = credentials.map((cred) => ({
        id: cred.credentialId,
        transports: cred.transports as AuthenticatorTransportFuture[],
      }));
    }

    const options = await generateAuthenticationOptions({
      rpID: RP_ID,
      userVerification: 'preferred',
      allowCredentials,
    });

    await storeChallenge(sessionId, 'auth', options.challenge);
    return options;
  },

  async verifyAuthentication(credential: AuthenticationResponseJSON, sessionId: string) {
    const expectedChallenge = await getChallenge(sessionId, 'auth');
    if (!expectedChallenge) {
      throw new AppError('Authentication challenge expired or not found', 401, 'CHALLENGE_EXPIRED');
    }

    const storedCredential = await prisma.webAuthnCredential.findUnique({
      where: { credentialId: credential.id },
      include: { user: true },
    });

    if (!storedCredential) {
      throw new AppError('Credential not found', 404, 'CREDENTIAL_NOT_FOUND');
    }

    const verification = await verifyAuthenticationResponse({
      response: credential,
      expectedChallenge,
      expectedOrigin: ORIGIN,
      expectedRPID: RP_ID,
      credential: {
        id: storedCredential.credentialId,
        publicKey: storedCredential.publicKey,
        counter: Number(storedCredential.counter),
        transports: storedCredential.transports as AuthenticatorTransportFuture[],
      },
    });

    if (!verification.verified) {
      throw new AppError('Authentication verification failed', 401, 'AUTH_VERIFICATION_FAILED');
    }

    // Update counter
    await prisma.webAuthnCredential.update({
      where: { id: storedCredential.id },
      data: { counter: verification.authenticationInfo.newCounter },
    });

    return { verified: true, user: storedCredential.user };
  },

  async listCredentials(userId: string) {
    return prisma.webAuthnCredential.findMany({
      where: { userId },
      select: {
        id: true,
        credentialId: true,
        friendlyName: true,
        deviceType: true,
        backedUp: true,
        createdAt: true,
        transports: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  },

  async deleteCredential(userId: string, credentialId: string) {
    const credential = await prisma.webAuthnCredential.findFirst({
      where: { id: credentialId, userId },
    });

    if (!credential) {
      throw new AppError('Credential not found or not owned by user', 404, 'CREDENTIAL_NOT_FOUND');
    }

    await prisma.webAuthnCredential.delete({ where: { id: credentialId } });
    logger.info(`WebAuthn credential deleted for user ${userId}: ${credentialId}`);
  },
};
