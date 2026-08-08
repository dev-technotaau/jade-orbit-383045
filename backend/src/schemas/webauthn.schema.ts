import { z } from 'zod';

export const registerOptionsSchema = z.object({});

export const registerVerifySchema = z.object({
  body: z.object({
    credential: z.object({
      id: z.string(),
      rawId: z.string(),
      response: z.object({
        attestationObject: z.string(),
        clientDataJSON: z.string(),
        transports: z.array(z.string()).optional(),
      }),
      type: z.literal('public-key'),
      clientExtensionResults: z.record(z.string(), z.unknown()).optional(),
      authenticatorAttachment: z.string().optional(),
    }),
    friendlyName: z.string().max(100).optional(),
  }),
});

export const loginOptionsSchema = z.object({
  body: z
    .object({
      email: z.string().email().optional(),
    })
    .optional(),
});

export const loginVerifySchema = z.object({
  body: z.object({
    credential: z.object({
      id: z.string(),
      rawId: z.string(),
      response: z.object({
        authenticatorData: z.string(),
        clientDataJSON: z.string(),
        signature: z.string(),
        userHandle: z.string().optional(),
      }),
      type: z.literal('public-key'),
      clientExtensionResults: z.record(z.string(), z.unknown()).optional(),
      authenticatorAttachment: z.string().optional(),
    }),
    mfaCode: z.string().optional(),
  }),
});

export const deleteCredentialSchema = z.object({
  params: z.object({
    id: z.string().min(1),
  }),
});
