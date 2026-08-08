import type { Request, Response, NextFunction, RequestHandler } from 'express';
import type { ZodSchema, ZodObject, ZodRawShape } from 'zod';
import { ZodError } from 'zod';

/**
 * Schema wrapper type for validating request body, query, and params
 * Supports both wrapped Zod schemas and the ValidationSchemas interface
 */
type WrappedSchema = ZodObject<{
  body?: ZodSchema;
  query?: ZodSchema;
  params?: ZodSchema;
}>;

interface ValidationSchemas {
  body?: ZodSchema;
  query?: ZodSchema;
  params?: ZodSchema;
}

/**
 * Validation middleware using Zod schemas
 * Supports two formats:
 * 1. Wrapped: z.object({ body: z.object({...}), query: z.object({...}) })
 * 2. Object: { body: bodySchema, query: querySchema }
 *
 * @param schema - Zod schema or object containing Zod schemas for body, query, and params
 */
export const validate = (schema: WrappedSchema | ValidationSchemas): RequestHandler => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const validateAsync = async () => {
      // Check if it's a wrapped Zod schema by looking for the shape property
      if ('shape' in schema && schema.shape) {
        // It's a wrapped Zod schema - extract the inner schemas
        const shape = schema.shape as ZodRawShape;

        if (shape.body) {
          req.body = await (shape.body as ZodSchema).parseAsync(req.body);
        }
        if (shape.query) {
          const parsed = await (shape.query as ZodSchema).parseAsync(req.query);
          Object.assign(req.query, parsed);
        }
        if (shape.params) {
          const parsed = await (shape.params as ZodSchema).parseAsync(req.params);
          Object.assign(req.params, parsed);
        }
      } else {
        // It's a ValidationSchemas object
        const schemas = schema as ValidationSchemas;

        if (schemas.body) {
          req.body = await schemas.body.parseAsync(req.body);
        }
        if (schemas.query) {
          const parsed = await schemas.query.parseAsync(req.query);
          Object.assign(req.query, parsed);
        }
        if (schemas.params) {
          const parsed = await schemas.params.parseAsync(req.params);
          Object.assign(req.params, parsed);
        }
      }
    };

    validateAsync()
      .then(() => next())
      .catch((error: unknown) => {
        if (error instanceof ZodError) {
          const formattedErrors = error.issues.map((issue) => ({
            field: issue.path.join('.'),
            message: issue.message,
            code: issue.code,
          }));

          res.status(400).json({
            success: false,
            error: {
              message: 'Validation failed',
              code: 'VALIDATION_ERROR',
              details: formattedErrors,
            },
          });
          return;
        }
        next(error);
      });
  };
};

export default validate;
