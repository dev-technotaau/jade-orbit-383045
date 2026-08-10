/**
 * The app-password gate is positional — this test makes it enforced.
 *
 * `whatsapp.routes.ts` applies authentication with a single bare
 * `router.use(requireAppPassword)` partway down the file. Every route
 * registered ABOVE that line is public, and nothing about a route's own source
 * says which side of the line it is on. Adding a handler in the wrong place is
 * a one-line, entirely plausible mistake that exposes an operator endpoint to
 * the internet and looks correct in review.
 *
 * So: load the real router and walk its layer stack. If any route layer is
 * registered before the gate layer, fail and name it.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

jest.mock('../../config/env', () => ({
  env: {
    APP_PASSWORD: 'test-password-at-least-16',
    SESSION_EPOCH: '1',
    OPERATOR_LABEL: 'operator',
    RATE_LIMIT_WINDOW_MS: '900000',
    RATE_LIMIT_MAX_REQUESTS: '2000',
    AUTH_RATE_LIMIT_WINDOW_MS: '300000',
    AUTH_RATE_LIMIT_MAX_ATTEMPTS: '30',
    REDIS_ENABLED: 'false',
    DEFAULT_COUNTRY_CODE: '91',
    WHATSAPP_OPT_OUT_KEYWORDS: 'STOP',
    META_WHATSAPP_API_VERSION: 'v21.0',
  },
}));

jest.mock('../../config/prisma', () => ({ prisma: {} }));
jest.mock('../../config/redis', () => ({
  redis: {
    call: jest.fn(),
    duplicate: jest.fn(() => ({ call: jest.fn(), on: jest.fn() })),
    on: jest.fn(),
    status: 'disabled',
  },
}));
// The rate limiters build a Redis-backed store at import time and probe the
// client's reply shape. We only care about the router's layer ORDER here, so
// swap the limiter factory and its store for pass-throughs.
jest.mock('express-rate-limit', () => ({
  __esModule: true,
  default: () => (_req: any, _res: any, next: any) => next(),
  rateLimit: () => (_req: any, _res: any, next: any) => next(),
}));
jest.mock('rate-limit-redis', () => ({
  RedisStore: class {
    init = jest.fn();
    increment = jest.fn();
    decrement = jest.fn();
    resetKey = jest.fn();
  },
}));
jest.mock('../../middleware/rate-limit', () => {
  const passthrough = (_req: any, _res: any, next: any) => next();
  return new Proxy({}, { get: () => passthrough });
});
jest.mock('../../config/logger', () => ({
  __esModule: true,
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));
// ESM-only `uuid` reaches this module tree via storage.service (DPDP erase).
jest.mock('../../services/storage.service', () => ({
  deleteFileFromR2: jest.fn(),
  uploadFileToR2: jest.fn(),
  getSignedUrlForKey: jest.fn(),
}));
// Queues would open real BullMQ connections on import.
jest.mock('bullmq', () => ({
  Queue: class {
    add = jest.fn();
    on = jest.fn();
    getJob = jest.fn();
    getJobs = jest.fn(() => []);
    getJobCounts = jest.fn(() => ({}));
  },
  Worker: class {
    on = jest.fn();
    close = jest.fn();
  },
}));

import whatsappRouter from '../whatsapp.routes';
import { requireAppPassword } from '../../middleware/app-password';

/**
 * Routes deliberately reachable without the app password, with the reason.
 * Adding to this list is a security decision and should be argued for in review
 * — that is the point of it being an explicit list rather than an absence.
 */
const INTENTIONALLY_PUBLIC: Array<{ method: string; path: string; why: string }> = [];

type Layer = {
  name?: string;
  handle?: unknown;
  route?: { path?: string; methods?: Record<string, boolean> };
};

function describeRoute(layer: Layer): { method: string; path: string } {
  const methods = Object.keys(layer.route?.methods ?? {}).filter((m) => layer.route?.methods?.[m]);
  return {
    method: (methods[0] ?? 'all').toUpperCase(),
    path: layer.route?.path ?? '(unknown)',
  };
}

describe('whatsapp.routes — the app-password gate', () => {
  const stack = (whatsappRouter as unknown as { stack: Layer[] }).stack;

  it('registers requireAppPassword exactly once', () => {
    const gates = stack.filter((l) => l.handle === requireAppPassword);
    expect(gates).toHaveLength(1);
  });

  it('leaves no route registered in front of the gate', () => {
    const gateIndex = stack.findIndex((l) => l.handle === requireAppPassword);
    expect(gateIndex).toBeGreaterThanOrEqual(0);

    const ungated = stack
      .slice(0, gateIndex)
      .filter((l) => l.route)
      .map(describeRoute)
      .filter((r) => !INTENTIONALLY_PUBLIC.some((p) => p.method === r.method && p.path === r.path));

    expect(ungated).toEqual([]);
  });

  it('gates every route the router exposes', () => {
    const gateIndex = stack.findIndex((l) => l.handle === requireAppPassword);
    const gatedCount = stack.slice(gateIndex).filter((l) => l.route).length;
    const totalCount = stack.filter((l) => l.route).length;

    // Sanity: the router really does have routes, so a refactor that empties
    // the stack cannot make this suite pass vacuously.
    expect(totalCount).toBeGreaterThan(20);
    expect(gatedCount).toBe(totalCount - INTENTIONALLY_PUBLIC.length);
  });
});
