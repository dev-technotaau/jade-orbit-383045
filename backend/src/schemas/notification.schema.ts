import { z } from 'zod';

// ===============================
// List Notifications
// ===============================
export const listNotificationsSchema = z.object({
  query: z.object({
    isRead: z.string().optional(),
    category: z.string().optional(),
    page: z.string().optional(),
    limit: z.string().optional(),
  }),
});

export type ListNotificationsQuery = z.infer<typeof listNotificationsSchema>['query'];

// ===============================
// Mark Notification as Read
// ===============================
export const markReadSchema = z.object({
  params: z.object({
    id: z.string().min(1, 'Notification ID is required'),
  }),
});

export type MarkReadParams = z.infer<typeof markReadSchema>['params'];
