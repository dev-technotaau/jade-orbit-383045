import crypto from 'crypto';
import type { Request, Response } from 'express';
import { env } from '../config/env';
import logger from '../config/logger';
import { isBridgeEnabled, proxyOutboundToMeta } from '../services/whatsapp-bridge.service';

/**
 * Constant-time secret comparison. Length-guarded (timingSafeEqual throws on
 * unequal-length buffers, which itself leaks length) so a mismatch never short-
 * circuits early and never throws. Returns false when either side is empty.
 */
function bridgeSecretMatches(provided: string | undefined): boolean {
  const expected = env.CHATWOOT_BRIDGE_SECRET;
  if (!expected || !provided) return false;
  const a = Buffer.from(provided, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

/**
 * `POST /api/v1/whatsapp-proxy/:phoneNumberId/messages`
 *
 * Mimics Meta's send endpoint so a self-hosted Chatwoot can route its outbound
 * WhatsApp sends THROUGH our backend (keeping a single sender → one
 * rate-limiter + log + pinned Graph version). Gated by the `X-Bridge-Secret`
 * header. Mounted app-level (no user auth / CSRF) with its own JSON parser.
 */
export async function handleOutboundProxy(req: Request, res: Response): Promise<void> {
  if (!isBridgeEnabled()) {
    res.status(404).json({ error: 'bridge disabled' });
    return;
  }
  // Constant-time secret check (not `!==`) to avoid timing side-channels.
  if (!bridgeSecretMatches(req.get('x-bridge-secret') ?? undefined)) {
    res.status(401).json({ error: 'unauthorized' });
    return;
  }
  try {
    const result = await proxyOutboundToMeta(req.body ?? {});
    res.status(result.status).json(result.body);
  } catch (err) {
    logger.error('WhatsApp outbound proxy failed', { err });
    res.status(502).json({ error: 'proxy failed' });
  }
}
