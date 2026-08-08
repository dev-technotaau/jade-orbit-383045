import { PrismaClient } from '@prisma/client';
import { mockDeep } from 'jest-mock-extended';
import { redis } from '../src/config/redis';

// Timeout for E2E tests
jest.setTimeout(30000);

// Mock Prisma Client globally
jest.mock('../src/config/database', () => ({
    __esModule: true,
    default: mockDeep<PrismaClient>(),
    prisma: mockDeep<PrismaClient>(),
}));

// Mock R2/S3 Client globally
jest.mock('../src/config/r2', () => ({
    r2Client: {
        send: jest.fn(),
    },
    R2_BUCKET_NAME: 'test-bucket',
}));

// Close Redis connection after all tests
afterAll(async () => {
    await redis.quit();
});
