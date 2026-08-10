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
      LIMIT_FILE_SIZE: ['File is larger than the 16 MB WhatsApp limit', 413, 'WA_FILE_TOO_LARGE'],
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
