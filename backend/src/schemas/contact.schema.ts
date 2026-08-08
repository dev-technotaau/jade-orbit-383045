import { z } from 'zod';

export const submitContactSchema = z.object({
  body: z.object({
    name: z.string().min(2).max(100),
    email: z.string().email(),
    subject: z.string().min(1).max(200),
    message: z.string().min(10).max(5000),
  }),
});
