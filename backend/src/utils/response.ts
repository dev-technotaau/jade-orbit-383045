import type { Response } from 'express';

interface SuccessResponse<T> {
  success: true;
  data: T;
  message?: string;
  meta?: {
    page?: number;
    limit?: number;
    total?: number;
    totalPages?: number;
  };
}

interface ErrorResponse {
  success: false;
  error: {
    message: string;
    code?: string;
    details?: unknown;
  };
}

type ApiResponse<T> = SuccessResponse<T> | ErrorResponse;

/**
 * Standard success response
 */
export const success = <T>(
  res: Response,
  data: T,
  message?: string,
  statusCode = 200,
  meta?: SuccessResponse<T>['meta']
): Response<ApiResponse<T>> => {
  const response: SuccessResponse<T> = {
    success: true,
    data,
  };
  if (message) response.message = message;
  if (meta) response.meta = meta;
  return res.status(statusCode).json(response);
};

/**
 * Standard error response
 */
export const error = (
  res: Response,
  message: string,
  statusCode = 400,
  code?: string,
  details?: unknown
): Response<ErrorResponse> => {
  const response: ErrorResponse = {
    success: false,
    error: {
      message,
    },
  };
  if (code) response.error.code = code;
  if (details) response.error.details = details;
  return res.status(statusCode).json(response);
};

/**
 * Paginated success response
 */
export const paginated = <T>(
  res: Response,
  data: T[],
  page: number,
  limit: number,
  total: number,
  message?: string
): Response<ApiResponse<T[]>> => {
  return success(res, data, message, 200, {
    page,
    limit,
    total,
    totalPages: Math.ceil(total / limit),
  });
};

/**
 * Created response (201)
 */
export const created = <T>(
  res: Response,
  data: T,
  message = 'Created successfully'
): Response<ApiResponse<T>> => {
  return success(res, data, message, 201);
};

/**
 * No content response (204)
 */
export const noContent = (res: Response): Response => {
  return res.status(204).send();
};

export default { success, error, paginated, created, noContent };
