export class AppError extends Error {
  public statusCode: number;
  public status: string;
  public isOperational: boolean;
  public code?: string;

  constructor(message: string, statusCode: number, code?: string) {
    super(message);

    this.statusCode = statusCode;
    this.status = `${statusCode}`.startsWith('4') ? 'fail' : 'error';
    this.isOperational = true;
    this.code = code;

    Error.captureStackTrace(this, this.constructor);
  }
}

import type { Request, Response, NextFunction } from 'express';
import { Prisma } from '@prisma/client';
import logger from '../config/logger';
import { captureWaException } from '../utils/whatsapp-metrics';

/**
 * Transform Prisma-specific errors into user-friendly AppError instances
 */
const handlePrismaError = (err: Error): AppError => {
  // Unique constraint violation (e.g. duplicate email)
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    switch (err.code) {
      case 'P2002': {
        const target = (err.meta?.target as string[])?.join(', ') || 'field';
        return new AppError(`A record with this ${target} already exists`, 409, 'DUPLICATE_ENTRY');
      }
      case 'P2025':
        return new AppError('Record not found', 404, 'NOT_FOUND');
      case 'P2003':
        return new AppError('Related record not found', 400, 'FOREIGN_KEY_VIOLATION');
      case 'P2014':
        return new AppError(
          'This operation would violate a required relation',
          400,
          'RELATION_VIOLATION'
        );
      case 'P2021':
        return new AppError('Database table not found', 500, 'TABLE_NOT_FOUND');
      case 'P2024':
        return new AppError('Database connection timed out. Please try again.', 503, 'DB_TIMEOUT');
      default:
        logger.error(`Unhandled Prisma error code: ${err.code}`, err);
        return new AppError('A database error occurred', 500, 'DB_ERROR');
    }
  }

  // Validation error (invalid data shape)
  if (err instanceof Prisma.PrismaClientValidationError) {
    return new AppError('Invalid data provided', 400, 'VALIDATION_ERROR');
  }

  // Initialization error (connection issues)
  if (err instanceof Prisma.PrismaClientInitializationError) {
    return new AppError('Service temporarily unavailable', 503, 'DB_UNAVAILABLE');
  }

  // Rust panic (critical internal error)
  if (err instanceof Prisma.PrismaClientRustPanicError) {
    logger.error('Prisma Rust panic error', err);
    return new AppError('An internal error occurred', 500, 'INTERNAL_ERROR');
  }

  return new AppError('An unexpected error occurred', 500);
};

/**
 * Check if an error is a Prisma error
 */
const isPrismaError = (err: Error): boolean => {
  return (
    err instanceof Prisma.PrismaClientKnownRequestError ||
    err instanceof Prisma.PrismaClientValidationError ||
    err instanceof Prisma.PrismaClientInitializationError ||
    err instanceof Prisma.PrismaClientRustPanicError
  );
};

export const errorHandler = (err: any, req: Request, res: Response, _next: NextFunction) => {
  // Hold on to the error we were actually handed. The branches below REPLACE
  // `err` with an AppError built inside this file, whose stack therefore points
  // at this file — so reporting the transformed error would collapse every
  // Prisma failure in the application into one issue on handlePrismaError's
  // stack, which is the opposite of what the error tracker is for.
  const originalErr = err;

  // Transform Prisma errors into AppErrors
  if (isPrismaError(err)) {
    const prismaError = handlePrismaError(err);
    err = prismaError;
  }

  // Multer (file uploads). A MulterError has no `isOperational`, so it fell
  // through to the generic branch and an oversized attachment came back as a
  // 500 "Something went wrong. Please try again later." — which tells the
  // operator nothing about the actual problem, which is that their file is too
  // big. Give it the real status and say the limit out loud.
  if (err?.name === 'MulterError') {
    const multerMessages: Record<string, [string, number, string]> = {
      LIMIT_FILE_SIZE: ['File is larger than the 100 MB WhatsApp limit', 413, 'WA_FILE_TOO_LARGE'],
      LIMIT_FILE_COUNT: ['Too many files — send one at a time', 400, 'WA_TOO_MANY_FILES'],
      LIMIT_UNEXPECTED_FILE: ['Unexpected file field', 400, 'WA_UNEXPECTED_FILE'],
    };
    const [message, code, errorCode] = multerMessages[err.code as string] ?? [
      'File upload failed',
      400,
      'WA_UPLOAD_FAILED',
    ];
    err = new AppError(message, code, errorCode);
  }

  // Body-parser size failures. `entity.too.large` carries a real 413 but no
  // `isOperational`, so in production it fell through to the generic branch at the
  // bottom and came back as a 500 "Something went wrong. Please try again later.":
  // an operator whose uploaded campaign audience was a few rows too big was told
  // the server had broken, with nothing pointing at the body they had just pasted.
  // Say the limit out loud, and keep the status the parser actually chose.
  if (err?.type === 'entity.too.large') {
    const limit = Number(err.limit);
    const label = !Number.isFinite(limit)
      ? 'allowed'
      : limit >= 1024 * 1024
        ? `${Math.round(limit / (1024 * 1024))} MB`
        : `${Math.round(limit / 1024)} KB`;
    err = new AppError(
      `Request body is larger than the ${label} limit for this endpoint — send it in smaller batches.`,
      413,
      'PAYLOAD_TOO_LARGE'
    );
  }

  // NEVER assign onto the caught error. Some library errors expose these as
  // getter-only accessors — notably the OpenSearch client's ResponseError,
  // which defines `get statusCode()` with no setter
  // (@opensearch-project/opensearch/lib/errors.js:124-129). Under strict mode
  // (which TS emits) the assignment throws TypeError INSIDE this handler, so
  // Express falls back to its default handler: the original error is never
  // logged, never reaches Sentry, and the client gets a raw HTML error page
  // instead of the {success,error:{…}} envelope.
  //
  // That silently swallowed every OpenSearch failure across the entire API.
  // Read into locals instead.
  const statusCode: number = Number(err?.statusCode) || 500;
  const status: string = err?.status || 'error';

  // Include request ID for tracing
  const requestId = req.id;

  // Report server-side failures. A 5xx is by definition something on our side,
  // and the body the client gets back is deliberately vague ("Something went
  // wrong"), so without this the only record of what actually broke is a log
  // line nobody is watching. 4xx are the caller's problem and stay out of the
  // error tracker, or every bad request would drown the real failures.
  if (statusCode >= 500) {
    void captureWaException(originalErr, {
      requestId,
      method: req.method,
      // Path WITHOUT the query string: Meta's webhook verification arrives as
      // `?hub.verify_token=<secret>`, and a 500 on that route would otherwise
      // park the token in the error tracker for good.
      path: req.originalUrl.split('?')[0],
      statusCode,
      ...(err?.code ? { code: err.code as string } : {}),
    });
  }

  /**
   * Structured payload some operational errors attach for the client to act
   * on — e.g. a 409 stale-write carries the expected vs actual version so
   * the UI can offer "reload / overwrite", and a 409 resource-lock carries
   * the holder so it can name them.
   *
   * Only forwarded for OPERATIONAL errors (errors we constructed
   * deliberately), so an unexpected exception can never leak internals here.
   */
  const details = (err as AppError & { details?: unknown }).details;

  if (process.env.NODE_ENV === 'development') {
    logger.error(`[${requestId}] Error: ${err.message}`, err);
    res.status(statusCode).json({
      success: false,
      error: {
        message: err.message,
        code: err.code,
        status,
        stack: err.stack,
        ...(details !== undefined ? { details } : {}),
        requestId,
      },
    });
  } else {
    // Production
    if (err.isOperational) {
      res.status(statusCode).json({
        success: false,
        error: {
          message: err.message,
          code: err.code,
          ...(details !== undefined ? { details } : {}),
          requestId,
        },
      });
    } else {
      // Programming or other unknown error: don't leak details
      logger.error(`[${requestId}] ERROR`, err);
      res.status(500).json({
        success: false,
        error: {
          message: 'Something went wrong. Please try again later.',
          requestId,
        },
      });
    }
  }
};
