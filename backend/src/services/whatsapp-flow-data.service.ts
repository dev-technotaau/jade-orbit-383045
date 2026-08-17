import crypto from 'crypto';
import logger from '../config/logger';
import { env } from '../config/env';
import { AppError } from '../middleware/error';

/**
 * WhatsApp Flows data-exchange (endpoint-backed / "dynamic" flows).
 *
 * A static flow renders whatever its Flow JSON says. A DYNAMIC one calls back to
 * us between screens, which is what makes real use cases possible — looking up a
 * patient record, offering only the appointment slots that are actually free,
 * validating an entry before the customer moves on.
 *
 * Meta will not send plaintext. Every request is a three-part envelope:
 *
 *   encrypted_aes_key   RSA-OAEP(SHA-256) of a one-time AES key, to our public key
 *   encrypted_flow_data AES-128-GCM of the JSON body, under that key
 *   initial_vector      the IV, base64
 *
 * and the response must be AES-GCM under the SAME key with the IV BITWISE
 * INVERTED — an unusual requirement, and the single most common reason a Flow
 * endpoint appears to "work" (200 OK) while the client shows a generic error.
 *
 * Key handling is deliberately fail-closed: if no private key is configured we
 * refuse rather than fall back to anything unencrypted.
 */

interface FlowRequest {
  version: string;
  action: 'ping' | 'INIT' | 'BACK' | 'data_exchange' | string;
  screen?: string;
  data?: Record<string, unknown>;
  flow_token?: string;
}

function privateKey(): crypto.KeyObject {
  const pem = env.WA_FLOW_PRIVATE_KEY;
  if (!pem) {
    throw new AppError(
      'Flow data-exchange is not configured — set WA_FLOW_PRIVATE_KEY',
      503,
      'WA_FLOW_KEY_MISSING'
    );
  }
  try {
    return crypto.createPrivateKey({
      // Newlines survive .env round-trips badly; accept the common \n-escaped form.
      key: pem.includes('\\n') ? pem.replace(/\\n/g, '\n') : pem,
      ...(env.WA_FLOW_KEY_PASSPHRASE ? { passphrase: env.WA_FLOW_KEY_PASSPHRASE } : {}),
    });
  } catch (err) {
    throw new AppError(
      `WA_FLOW_PRIVATE_KEY could not be parsed: ${err instanceof Error ? err.message : 'unknown'}`,
      500,
      'WA_FLOW_KEY_INVALID'
    );
  }
}

/** Decrypt one envelope. Returns the request plus the material needed to reply. */
export function decryptFlowRequest(body: {
  encrypted_flow_data: string;
  encrypted_aes_key: string;
  initial_vector: string;
}): { request: FlowRequest; aesKey: Buffer; iv: Buffer } {
  const aesKey = crypto.privateDecrypt(
    { key: privateKey(), padding: crypto.constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' },
    Buffer.from(body.encrypted_aes_key, 'base64')
  );

  const iv = Buffer.from(body.initial_vector, 'base64');
  const payload = Buffer.from(body.encrypted_flow_data, 'base64');

  // GCM auth tag is the trailing 16 bytes, not a separate field.
  const TAG_LENGTH = 16;
  const ciphertext = payload.subarray(0, -TAG_LENGTH);
  const authTag = payload.subarray(-TAG_LENGTH);

  const decipher = crypto.createDecipheriv('aes-128-gcm', aesKey, iv);
  decipher.setAuthTag(authTag);
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);

  return { request: JSON.parse(plaintext.toString('utf8')) as FlowRequest, aesKey, iv };
}

/**
 * Encrypt a response under the same AES key with the IV inverted.
 *
 * Meta requires the flipped IV. Reusing the original produces a response the
 * client cannot decrypt, and the failure surfaces to the customer as a generic
 * "something went wrong" with a 200 in our own logs.
 */
export function encryptFlowResponse(
  response: Record<string, unknown>,
  aesKey: Buffer,
  iv: Buffer
): string {
  const flipped = Buffer.from(iv.map((b) => ~b & 0xff));
  const cipher = crypto.createCipheriv('aes-128-gcm', aesKey, flipped);
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(response), 'utf8'),
    cipher.final(),
    cipher.getAuthTag(),
  ]);
  return encrypted.toString('base64');
}

/**
 * Handle a decrypted request.
 *
 * `ping` is Meta's health check and MUST answer `{ data: { status: 'active' } }`
 * — a wrong shape here marks the endpoint unhealthy and Meta stops delivering,
 * which looks like the flow silently breaking.
 *
 * Everything else is application logic. The default is intentionally a terminal,
 * honest screen rather than a guess: a dynamic flow whose endpoint invents screen
 * data produces a broken form for a real customer.
 */
export async function handleFlowRequest(request: FlowRequest): Promise<Record<string, unknown>> {
  if (request.action === 'ping') {
    return { data: { status: 'active' } };
  }

  // Meta relays client-side errors here so they are visible server-side rather
  // than only to the customer.
  if (request.data?.error) {
    logger.warn(
      `WhatsApp Flow client error (screen ${request.screen ?? 'unknown'}): ` +
        `${JSON.stringify(request.data.error)}`
    );
    return { data: { acknowledged: true } };
  }

  logger.info(
    `WhatsApp Flow data-exchange: action=${request.action} screen=${request.screen ?? '-'}`
  );

  // No screen logic is registered yet. Answering with a made-up screen would show
  // the customer a broken form, so we acknowledge instead and let the flow's own
  // JSON drive navigation until real handlers are added here.
  return { data: { acknowledged: true } };
}
