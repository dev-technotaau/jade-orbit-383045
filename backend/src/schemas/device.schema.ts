import { z } from 'zod';

// ===============================
// Register FCM Token
// ===============================
export const registerFcmTokenSchema = z.object({
  body: z.object({
    token: z.string().min(1, 'FCM token is required'),
    platform: z.string().optional(),
    deviceName: z.string().optional(),
  }),
});

export type RegisterFcmTokenInput = z.infer<typeof registerFcmTokenSchema>['body'];

// ===============================
// Register Push Subscription
// ===============================
export const registerPushSubscriptionSchema = z.object({
  body: z.object({
    endpoint: z.string().url('Endpoint must be a valid URL'),
    keys: z.object({
      p256dh: z.string().min(1, 'p256dh key is required'),
      auth: z.string().min(1, 'auth key is required'),
    }),
    userAgent: z.string().optional(),
  }),
});

export type RegisterPushSubscriptionInput = z.infer<typeof registerPushSubscriptionSchema>['body'];
