import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';
import type { ApiError } from '@/types/api';
import { useMaintenanceStore } from '@/store/maintenance.store';
import { broadcastLogout } from '@/lib/auth-channel';

/** Raw error body shape returned by the backend — supports both legacy and new formats */
interface RawErrorBody {
  status?: string;
  message?: string;
  error?: {
    message?: string;
    code?: string;
    requestId?: string;
    details?: unknown;
    estimatedReturnTime?: string;
  };
  errors?: Record<string, string[]> | unknown;
}

/**
 * Axios instance for all API calls.
 * Routes through the BFF proxy (/api/proxy) which attaches httpOnly cookie tokens.
 * Cookies are sent automatically via withCredentials.
 */
const api = axios.create({
  baseURL: '/api/proxy',
  timeout: 30000,
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
});

// CSRF token management (stored in memory only — never localStorage)
let csrfToken: string | null = null;
let csrfFetchPromise: Promise<string | null> | null = null;
const MUTATION_METHODS = ['post', 'put', 'patch', 'delete'];

async function fetchCsrfToken(): Promise<string | null> {
  try {
    // Fetch CSRF token via BFF route (proxies to backend's /api/csrf-token)
    const { data } = await axios.get('/api/csrf-token', {
      withCredentials: true,
    });
    csrfToken = data.csrfToken;
    return csrfToken;
  } catch {
    return null;
  }
}

async function ensureCsrfToken(): Promise<string | null> {
  if (csrfToken) return csrfToken;
  if (!csrfFetchPromise) {
    csrfFetchPromise = fetchCsrfToken().finally(() => {
      csrfFetchPromise = null;
    });
  }
  return csrfFetchPromise;
}

// Request interceptor: attach CSRF token on mutations (no more Bearer token — BFF handles it)
api.interceptors.request.use(
  async (config: InternalAxiosRequestConfig) => {
    if (config.method && MUTATION_METHODS.includes(config.method.toLowerCase())) {
      const csrf = await ensureCsrfToken();
      if (csrf && config.headers) {
        config.headers['x-csrf-token'] = csrf;
      }
    }

    return config;
  },
  (error) => Promise.reject(error),
);

// Response interceptor: handle error codes
// NOTE: 401 refresh is now handled server-side by the BFF proxy.
// If we still get a 401, the refresh also failed → session is dead.
api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError<ApiError>) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & {
      _rateLimitRetry?: boolean;
      _csrfRetry?: boolean;
      _authRetry?: boolean;
    };

    // Handle 403 CSRF token mismatch — re-fetch token and retry once
    if (error.response?.status === 403 && !originalRequest._csrfRetry) {
      const errorData = error.response.data as RawErrorBody;
      const isCsrfError =
        errorData?.error?.code === 'EBADCSRFTOKEN' ||
        errorData?.message?.toLowerCase().includes('csrf');
      if (isCsrfError) {
        originalRequest._csrfRetry = true;
        csrfToken = null;
        const newToken = await fetchCsrfToken();
        if (newToken && originalRequest.headers) {
          originalRequest.headers['x-csrf-token'] = newToken;
        }
        return api(originalRequest);
      }
    }

    // Handle 429 Too Many Requests — wait and retry once
    if (error.response?.status === 429 && !originalRequest._rateLimitRetry) {
      originalRequest._rateLimitRetry = true;
      const retryAfter = Number(error.response.headers['retry-after']) || 5;
      await new Promise((resolve) => setTimeout(resolve, retryAfter * 1000));
      return api(originalRequest);
    }

    // Handle 503 Service Unavailable — maintenance mode
    if (error.response?.status === 503) {
      const errorData = error.response.data as RawErrorBody;
      if (errorData?.error?.code === 'MAINTENANCE_MODE') {
        useMaintenanceStore
          .getState()
          .setMaintenanceMode(
            true,
            errorData?.error?.message,
            errorData?.error?.estimatedReturnTime,
          );
      }
      return Promise.reject(transformError(error));
    }

    // 401 after BFF already tried refresh — retry once before giving up.
    // During rolling restarts, the first 401 may be transient (pod switchover).
    if (error.response?.status === 401) {
      if (!originalRequest._authRetry) {
        originalRequest._authRetry = true;
        await new Promise((resolve) => setTimeout(resolve, 1500));
        return api(originalRequest);
      }
      // Second 401 → session is truly dead
      axios.post('/api/auth/logout', {}, { withCredentials: true }).catch(() => {});
      broadcastLogout();
      redirectToLogin();
    }

    return Promise.reject(transformError(error));
  },
);

function transformError(error: AxiosError<ApiError>): ApiError {
  if (error.response?.data) {
    const data = error.response.data as RawErrorBody;
    const message = data.error?.message || data.message || 'An unexpected error occurred';
    const code = data.error?.code;
    const requestId = data.error?.requestId;

    return {
      status: (data.status as ApiError['status']) || 'error',
      message,
      statusCode: error.response.status,
      errors: data.errors || data.error?.details,
      // Also surfaced under its own key. `errors` is the field-validation
      // channel and callers destructure it as such; the admin concurrency
      // layer needs the structured conflict payload (holder / expected
      // version) without having to guess which of the two it landed in.
      ...(data.error?.details !== undefined && { details: data.error.details }),
      ...(code && { code }),
      ...(requestId && { requestId }),
    };
  }

  if (error.code === 'ECONNABORTED') {
    return { status: 'error', message: 'Request timed out. Please try again.', statusCode: 408 };
  }

  if (!error.response) {
    return {
      status: 'error',
      message: 'Network error. Please check your connection.',
      statusCode: 0,
    };
  }

  return {
    status: 'error',
    message: 'An unexpected error occurred',
    statusCode: error.response?.status || 500,
  };
}

const protectedPrefixes = ['/candidate', '/employer', '/admin', '/super-admin', '/notifications'];
const adminPrefixes = ['/admin', '/super-admin'];

let redirectPending = false;

// Reset redirect guard when page is restored from bfcache (browser back button)
if (typeof window !== 'undefined') {
  window.addEventListener('pageshow', (e) => {
    if (e.persisted) redirectPending = false;
  });
}

function redirectToLogin() {
  if (typeof window === 'undefined' || redirectPending) return;

  const path = window.location.pathname;
  const isProtected = protectedPrefixes.some((p) => path.startsWith(p));
  const isAdminRoute = adminPrefixes.some((p) => path.startsWith(p));

  if (isProtected && !path.startsWith('/auth/') && !path.startsWith('/portal/')) {
    redirectPending = true;
    const loginUrl = isAdminRoute ? '/portal/login' : '/auth/login';
    window.location.href = `${loginUrl}?redirect=${encodeURIComponent(path)}`;
  }
}

export default api;
