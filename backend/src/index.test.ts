import request from 'supertest';
import express from 'express';

// Mock heavy dependencies so we don't pull in the full app tree
// (avoids ESM-only node_modules like uuid, @exodus/bytes, etc.)
jest.mock('./config/prisma', () => ({
  __esModule: true,
  default: {},
}));
jest.mock('./config/redis', () => ({
  redis: { status: 'end' },
}));
jest.mock('./config/elasticsearch', () => ({
  __esModule: true,
  default: { cluster: { health: jest.fn() } },
}));
jest.mock('./utils/kafka-lag-monitor', () => ({
  getConsumerLag: jest.fn().mockResolvedValue(null),
}));

import { checkLiveness } from './controllers/health.controller';

describe('Health Check', () => {
  it('should return 200 from liveness probe', async () => {
    const app = express();
    app.get('/health/live', checkLiveness);

    const res = await request(app).get('/health/live');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('status', 'alive');
  });
});
