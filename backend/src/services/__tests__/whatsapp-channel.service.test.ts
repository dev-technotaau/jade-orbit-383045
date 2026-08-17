/**
 * Tests for channel management (src/services/whatsapp-channel.service.ts).
 *
 * Channels used to be env-driven: the sending number came from
 * META_WHATSAPP_PHONE_ID and `isDefault`/`isActive` were decorative. Now the
 * database is the authority, which puts three things at risk that are pinned
 * here. The default must come from the row an operator chose (not the env, and
 * never two rows at once); a number must not be able to lose its default badge
 * and keep sending; and the per-channel access token must be decrypted for the
 * send path while never leaving the service in an API payload.
 *
 * Prisma, env and the encryption helpers are mocked; the resolution and
 * invariants under test are this module's own.
 */

const prismaMock = {
  waChannel: {
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
    count: jest.fn(),
  },
  waChannelHealthSnapshot: { findFirst: jest.fn(), create: jest.fn() },
  $transaction: jest.fn(),
};
jest.mock('../../config/prisma', () => ({ prisma: prismaMock }));

const loggerMock = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };
jest.mock('../../config/logger', () => ({ __esModule: true, default: loggerMock }));

const envMock: Record<string, string | undefined> = {
  META_WHATSAPP_PHONE_ID: 'ENV_PHONE',
  META_WHATSAPP_WABA_ID: 'ENV_WABA',
  META_WHATSAPP_TOKEN: 'env-token',
};
jest.mock('../../config/env', () => ({ env: envMock }));

jest.mock('../../utils/encryption', () => ({
  encryptField: (v: string) => `enc:${v}`,
  tryDecryptField: (v: string) =>
    v.startsWith('enc:')
      ? { ok: true, value: v.slice(4) }
      : { ok: false, error: new Error('no key opens this ciphertext') },
  warnIfEncryptionDisabled: jest.fn(),
}));

import {
  getDefaultChannel,
  listChannels,
  createChannel,
  setDefaultChannel,
  setChannelActive,
  getChannelAccessToken,
  invalidateChannelToken,
  checkTokenHealth,
  getPhoneHealthStatus,
} from '../whatsapp-channel.service';

const channel = (over: Record<string, unknown> = {}) => ({
  id: 'ch1',
  phoneNumberId: '111',
  wabaId: 'waba1',
  displayPhone: '+911111111111',
  displayName: 'Support',
  isActive: true,
  isDefault: true,
  messagingTier: 'TIER_1K',
  qualityRating: 'GREEN',
  accessToken: null,
  tokenUpdatedAt: null,
  ...over,
});

/**
 * Graph is reached through the global `fetch`, so the token-lifecycle and
 * eligibility checks are driven from here rather than from a network.
 */
const fetchMock = jest.fn();
// eslint-disable-next-line n/no-unsupported-features/node-builtins
(globalThis as unknown as { fetch: unknown }).fetch = fetchMock;
const jsonResponse = (body: unknown, ok = true) => ({
  ok,
  status: ok ? 200 : 400,
  json: async () => body,
});

beforeEach(() => {
  jest.clearAllMocks();
  invalidateChannelToken();
  envMock.META_WHATSAPP_PHONE_ID = 'ENV_PHONE';
  envMock.META_WHATSAPP_TOKEN = 'env-token';
  envMock.META_WHATSAPP_APP_ID = undefined;
  envMock.META_WHATSAPP_APP_SECRET = undefined;
  prismaMock.waChannel.findFirst.mockResolvedValue(null);
  prismaMock.waChannel.findUnique.mockResolvedValue(null);
  prismaMock.waChannel.findMany.mockResolvedValue([]);
  prismaMock.waChannel.count.mockResolvedValue(0);
  prismaMock.waChannel.updateMany.mockResolvedValue({ count: 0 });
  prismaMock.$transaction.mockImplementation((fn: (tx: unknown) => unknown) => fn(prismaMock));
});

describe('getDefaultChannel', () => {
  it('returns the channel the operator marked default, not the env number', async () => {
    const chosen = channel({ id: 'ch2', phoneNumberId: '222' });
    prismaMock.waChannel.findFirst.mockResolvedValue(chosen);

    const result = await getDefaultChannel();

    expect(result).toEqual(chosen);
    expect(prismaMock.waChannel.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { isDefault: true, isActive: true } })
    );
    // The env number is not consulted at all once a default exists.
    expect(prismaMock.waChannel.create).not.toHaveBeenCalled();
  });

  it('seeds the env number on an install that has no channels at all', async () => {
    prismaMock.waChannel.create.mockResolvedValue(
      channel({ id: 'seed', phoneNumberId: 'ENV_PHONE' })
    );

    const result = await getDefaultChannel();

    expect(prismaMock.waChannel.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ phoneNumberId: 'ENV_PHONE', isDefault: true }),
      })
    );
    expect(result).toMatchObject({ phoneNumberId: 'ENV_PHONE' });
  });

  it('promotes the env number when a row exists but nothing is marked default', async () => {
    // The state a webhook leaves behind when it created the row before the env
    // was configured: a channel exists, but no active default resolves.
    prismaMock.waChannel.findUnique.mockResolvedValue(
      channel({ id: 'orphan', phoneNumberId: 'ENV_PHONE', wabaId: 'ENV_WABA', isDefault: false })
    );
    prismaMock.waChannel.update.mockResolvedValue(
      channel({ id: 'orphan', phoneNumberId: 'ENV_PHONE' })
    );

    const result = await getDefaultChannel();

    expect(prismaMock.waChannel.update).toHaveBeenCalledWith({
      where: { id: 'orphan' },
      data: { isDefault: true, isActive: true },
    });
    expect(result).toMatchObject({ id: 'orphan', isDefault: true });
  });

  it('returns null when nothing is configured anywhere', async () => {
    envMock.META_WHATSAPP_PHONE_ID = undefined;

    expect(await getDefaultChannel()).toBeNull();
  });
});

describe('setDefaultChannel', () => {
  it('clears the badge on every other channel in the same transaction', async () => {
    prismaMock.waChannel.findUnique.mockResolvedValue(channel({ id: 'ch2', isDefault: false }));
    prismaMock.waChannel.update.mockResolvedValue(channel({ id: 'ch2' }));

    await setDefaultChannel('ch2');

    expect(prismaMock.waChannel.updateMany).toHaveBeenCalledWith({
      where: { isDefault: true, id: { not: 'ch2' } },
      data: { isDefault: false },
    });
    expect(prismaMock.waChannel.update).toHaveBeenCalledWith({
      where: { id: 'ch2' },
      data: { isDefault: true },
    });
  });

  it('refuses a deactivated channel — it would resolve to nothing on the send path', async () => {
    prismaMock.waChannel.findUnique.mockResolvedValue(
      channel({ id: 'ch2', isDefault: false, isActive: false })
    );

    await expect(setDefaultChannel('ch2')).rejects.toMatchObject({
      statusCode: 400,
      code: 'WA_CHANNEL_INACTIVE',
    });
    expect(prismaMock.waChannel.update).not.toHaveBeenCalled();
  });
});

describe('setChannelActive', () => {
  it('refuses to deactivate the default number', async () => {
    prismaMock.waChannel.findUnique.mockResolvedValue(channel({ isDefault: true }));

    await expect(setChannelActive('ch1', false)).rejects.toMatchObject({
      statusCode: 400,
      code: 'WA_CHANNEL_IS_DEFAULT',
    });
    expect(prismaMock.waChannel.update).not.toHaveBeenCalled();
  });

  it('deactivates a non-default number', async () => {
    prismaMock.waChannel.findUnique.mockResolvedValue(channel({ id: 'ch2', isDefault: false }));
    prismaMock.waChannel.update.mockResolvedValue(channel({ id: 'ch2', isActive: false }));

    await setChannelActive('ch2', false);

    expect(prismaMock.waChannel.update).toHaveBeenCalledWith({
      where: { id: 'ch2' },
      data: { isActive: false },
    });
  });
});

describe('createChannel', () => {
  it('stores the access token encrypted and never returns it', async () => {
    prismaMock.waChannel.create.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
      Promise.resolve(channel({ ...data, id: 'new' }))
    );

    const created = await createChannel({
      phoneNumberId: '333',
      wabaId: 'waba2',
      accessToken: 'secret-token',
    });

    expect(prismaMock.waChannel.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ accessToken: 'enc:secret-token' }),
      })
    );
    expect(created).not.toHaveProperty('accessToken');
    expect(created.hasToken).toBe(true);
  });

  it('rejects a phone number ID that is already connected', async () => {
    prismaMock.waChannel.findUnique.mockResolvedValue(channel());

    await expect(createChannel({ phoneNumberId: '111' })).rejects.toMatchObject({
      statusCode: 409,
      code: 'WA_CHANNEL_ALREADY_EXISTS',
    });
  });

  it('makes the very first channel the default whatever the caller asked for', async () => {
    prismaMock.waChannel.create.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
      Promise.resolve(channel({ ...data, id: 'new' }))
    );

    await createChannel({ phoneNumberId: '333' });

    expect(prismaMock.waChannel.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ isDefault: true }) })
    );
  });
});

describe('listChannels', () => {
  it('reports whether a token is set without returning it', async () => {
    prismaMock.waChannel.findMany.mockResolvedValue([
      channel({ id: 'a', accessToken: 'enc:secret' }),
      channel({ id: 'b', accessToken: null }),
    ]);

    const rows = await listChannels();

    expect(rows.map((r) => r.hasToken)).toEqual([true, false]);
    expect(JSON.stringify(rows)).not.toContain('secret');
  });
});

describe('getChannelAccessToken', () => {
  it('uses the channel’s own token when it has one', async () => {
    prismaMock.waChannel.findUnique.mockResolvedValue({ accessToken: 'enc:channel-token' });

    expect(await getChannelAccessToken('222')).toBe('channel-token');
  });

  it('falls back to the env token for a channel with none', async () => {
    prismaMock.waChannel.findUnique.mockResolvedValue({ accessToken: null });

    expect(await getChannelAccessToken('222')).toBe('env-token');
  });

  it('falls back — loudly — when the stored token cannot be decrypted', async () => {
    // A rotated-away key. Passing the ciphertext to Meta would 401 every send
    // with nothing saying why, so it is treated as absent and logged instead.
    prismaMock.waChannel.findUnique.mockResolvedValue({ accessToken: 'iv:tag:data' });

    expect(await getChannelAccessToken('222')).toBe('env-token');
    expect(loggerMock.error).toHaveBeenCalledWith(
      expect.stringContaining('could not be decrypted')
    );
  });

  it('caches per number, and the cache can be dropped on a rotation', async () => {
    prismaMock.waChannel.findUnique.mockResolvedValue({ accessToken: 'enc:first' });

    expect(await getChannelAccessToken('222')).toBe('first');
    expect(await getChannelAccessToken('222')).toBe('first');
    expect(prismaMock.waChannel.findUnique).toHaveBeenCalledTimes(1);

    prismaMock.waChannel.findUnique.mockResolvedValue({ accessToken: 'enc:second' });
    invalidateChannelToken('222');

    expect(await getChannelAccessToken('222')).toBe('second');
  });
});

/**
 * `debug_token` and `health_status`: the two questions the module never asked.
 *
 * Both have a failure mode that only shows up in production. A system-user token
 * reports `expires_at: 0`, and storing that verbatim would render as 'expired in
 * 1970' on every settings page — precisely inverting the warning it exists to
 * give. And an eligibility check that Meta refuses to answer must not be recorded
 * as 'this number cannot send', because that is what gates a campaign launch.
 */
describe('checkTokenHealth', () => {
  const okChannel = () => {
    prismaMock.waChannel.findFirst.mockResolvedValue(channel());
    prismaMock.waChannel.update.mockResolvedValue(channel());
  };

  it('records a never-expiring system-user token as having no expiry at all', async () => {
    okChannel();
    fetchMock.mockResolvedValue(
      jsonResponse({
        data: { is_valid: true, expires_at: 0, scopes: ['whatsapp_business_messaging'] },
      })
    );

    const health = await checkTokenHealth();

    expect(health).toMatchObject({ ok: true, valid: true, expiresAt: null, daysRemaining: null });
    expect(prismaMock.waChannel.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tokenValid: true,
          tokenExpiresAt: null,
          tokenScopes: ['whatsapp_business_messaging'],
        }),
      })
    );
  });

  it('counts the days left on a user token, which is the whole point of the check', async () => {
    okChannel();
    // Deliberately off a whole-day boundary: `daysRemaining` floors, and an exact
    // multiple of 24h would flip between 3 and 2 on the millisecond the call took.
    const expiresAt = Math.floor((Date.now() + 3.5 * 86_400_000) / 1000);
    fetchMock.mockResolvedValue(
      jsonResponse({ data: { is_valid: true, expires_at: expiresAt, scopes: [] } })
    );

    const health = await checkTokenHealth();

    expect(health.ok).toBe(true);
    expect(health.daysRemaining).toBe(3);
    expect(health.expiresAt).toBe(new Date(expiresAt * 1000).toISOString());
  });

  it('reports a refused check without writing anything to the row', async () => {
    okChannel();
    fetchMock.mockResolvedValue(jsonResponse({ error: { message: 'Invalid OAuth token' } }, false));

    const health = await checkTokenHealth();

    expect(health).toMatchObject({ ok: false, valid: false, error: 'Invalid OAuth token' });
    expect(prismaMock.waChannel.update).not.toHaveBeenCalled();
  });

  it('uses the app access token when the app credentials are configured', async () => {
    okChannel();
    envMock.META_WHATSAPP_APP_ID = 'app-1';
    envMock.META_WHATSAPP_APP_SECRET = 'shhh';
    fetchMock.mockResolvedValue(jsonResponse({ data: { is_valid: true, expires_at: 0 } }));

    await checkTokenHealth();

    const url = String(fetchMock.mock.calls[0][0]);
    expect(url).toContain('input_token=env-token');
    expect(url).toContain(`access_token=${encodeURIComponent('app-1|shhh')}`);
  });
});

describe('getPhoneHealthStatus', () => {
  it('persists Meta’s verdict and the entities behind it', async () => {
    prismaMock.waChannel.findFirst.mockResolvedValue(channel());
    prismaMock.waChannel.update.mockResolvedValue(channel());
    fetchMock.mockResolvedValue(
      jsonResponse({
        health_status: {
          can_send_message: 'LIMITED',
          entities: [
            { entity_type: 'PHONE_NUMBER', id: '111', can_send_message: 'AVAILABLE' },
            {
              entity_type: 'WABA',
              id: 'waba1',
              can_send_message: 'LIMITED',
              errors: [
                {
                  error_code: 131049,
                  error_description: 'Per-user cap',
                  possible_solution: 'Wait',
                },
              ],
            },
          ],
        },
      })
    );

    const status = await getPhoneHealthStatus();

    expect(status.available).toBe(true);
    expect(status.canSend).toBe('LIMITED');
    expect(status.entities).toEqual([
      { type: 'PHONE_NUMBER', id: '111', canSend: 'AVAILABLE', errors: [] },
      {
        type: 'WABA',
        id: 'waba1',
        canSend: 'LIMITED',
        errors: [{ code: 131049, description: 'Per-user cap', solution: 'Wait' }],
      },
    ]);
    expect(prismaMock.waChannel.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ healthStatus: 'LIMITED' }) })
    );
  });

  it('answers “not checked” rather than “blocked” when Meta refuses the field', async () => {
    // This gates a campaign launch. An unanswerable check reported as BLOCKED
    // would stop every send on a WABA whose token simply lacks the permission.
    prismaMock.waChannel.findFirst.mockResolvedValue(channel());
    fetchMock.mockResolvedValue(jsonResponse({ error: { message: 'no permission' } }, false));

    const status = await getPhoneHealthStatus();

    expect(status).toEqual({
      available: false,
      canSend: null,
      entities: [],
      checkedAt: null,
      error: 'no permission',
    });
    expect(prismaMock.waChannel.update).not.toHaveBeenCalled();
  });
});
