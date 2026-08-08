/**
 * Razorpay Checkout JS loader + helper.
 *
 * Razorpay's Checkout is a hosted modal loaded from
 * `https://checkout.razorpay.com/v1/checkout.js`. We inject the script
 * lazily on first call and resolve once `window.Razorpay` is available.
 */

const SCRIPT_URL = 'https://checkout.razorpay.com/v1/checkout.js';
let loadingPromise: Promise<void> | null = null;

declare global {
  interface Window {
    Razorpay?: new (options: RazorpayCheckoutOptions) => RazorpayCheckoutInstance;
  }
}

export interface RazorpayCheckoutPrefill {
  name?: string;
  email?: string;
  contact?: string;
  method?: 'card' | 'netbanking' | 'wallet' | 'emi' | 'upi';
}

export interface RazorpayCheckoutOptions {
  key: string;
  amount: number;
  currency: string;
  name?: string;
  description?: string;
  image?: string;
  order_id: string;
  prefill?: RazorpayCheckoutPrefill;
  theme?: { color?: string };
  notes?: Record<string, string | number>;
  config?: {
    display?: {
      blocks?: Record<string, unknown>;
      sequence?: string[];
      preferences?: { show_default_blocks?: boolean };
    };
  };
  modal?: {
    ondismiss?: () => void;
    confirm_close?: boolean;
    escape?: boolean;
    backdropclose?: boolean;
  };
  handler?: (response: RazorpayCheckoutSuccess) => void;
  retry?: { enabled?: boolean; max_count?: number };
  send_sms_hash?: boolean;
  remember_customer?: boolean;
  readonly?: { name?: boolean; email?: boolean; contact?: boolean };
}

export interface RazorpayCheckoutSuccess {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}

export interface RazorpayCheckoutFailure {
  error: {
    code: string;
    description: string;
    source?: string;
    step?: string;
    reason?: string;
    metadata?: { order_id?: string; payment_id?: string };
  };
}

interface RazorpayCheckoutInstance {
  open: () => void;
  on: (event: string, cb: (resp: RazorpayCheckoutFailure) => void) => void;
  close: () => void;
}

/** Load the Razorpay Checkout script once and cache the promise. */
export function loadRazorpayCheckout(): Promise<void> {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('Razorpay Checkout requires a browser'));
  }
  if (window.Razorpay) return Promise.resolve();
  if (loadingPromise) return loadingPromise;
  loadingPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = SCRIPT_URL;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      loadingPromise = null;
      reject(new Error('Failed to load Razorpay Checkout script'));
    };
    document.head.appendChild(script);
  });
  return loadingPromise;
}

/**
 * Open the Razorpay Checkout modal. Resolves with the success payload once
 * the user completes payment, rejects with the Razorpay error envelope on
 * failure or with `{ dismissed: true }` when the user closes the modal.
 */
export async function openRazorpayCheckout(
  options: Omit<RazorpayCheckoutOptions, 'handler' | 'modal'> & {
    onDismiss?: () => void;
  },
): Promise<RazorpayCheckoutSuccess> {
  await loadRazorpayCheckout();
  if (!window.Razorpay) {
    throw new Error('Razorpay Checkout failed to initialize');
  }
  return new Promise<RazorpayCheckoutSuccess>((resolve, reject) => {
    const instance = new window.Razorpay!({
      ...options,
      handler: (response) => resolve(response),
      modal: {
        confirm_close: true,
        escape: true,
        ondismiss: () => {
          options.onDismiss?.();
          reject(new Error('CHECKOUT_DISMISSED'));
        },
      },
    });
    instance.on('payment.failed', (resp: RazorpayCheckoutFailure) => {
      reject(resp);
    });
    instance.open();
  });
}
