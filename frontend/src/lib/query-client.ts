'use client';

import { QueryClient } from '@tanstack/react-query';

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 5 * 60 * 1000, // 5 minutes
        /**
         * Never retry a client error, and 429 above all.
         *
         * `retry: 1` retried everything, including rate-limit rejections — and
         * lib/api.ts ALREADY retries a 429 once itself, after honouring
         * Retry-After. Stacked, one logical query hit the server up to four
         * times exactly when it was over budget, so a brief burst became a
         * sustained one and the whole console 429'd for the rest of the window.
         *
         * A 4xx is the server's considered answer; repeating the same request
         * cannot change it. Retries stay for 5xx and transport failures, which
         * are the ones a second attempt can actually fix.
         */
        retry: (failureCount: number, error: unknown) => {
          const status = (error as { statusCode?: number } | null)?.statusCode;
          if (typeof status === 'number' && status >= 400 && status < 500) return false;
          return failureCount < 1;
        },
        refetchOnWindowFocus: true,
        refetchOnReconnect: true,
      },
      mutations: {
        retry: 0,
      },
    },
  });
}

let browserQueryClient: QueryClient | undefined;

export function getQueryClient() {
  if (typeof window === 'undefined') {
    // Server: always make a new query client
    return makeQueryClient();
  }
  // Browser: reuse client across renders
  if (!browserQueryClient) {
    browserQueryClient = makeQueryClient();
  }
  return browserQueryClient;
}
