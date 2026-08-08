/**
 * Window-augmentation declarations for every analytics provider's
 * global object. Co-located so we have one place to audit which third
 * parties write to `window`, what name they use, and the rough shape
 * of their public API.
 *
 * Each provider's component lazily injects its loader script after
 * consent is granted, so these globals are only populated when the
 * user has opted in. Treat every property as optional — never assert
 * it exists at call sites.
 */

declare global {
  interface Window {
    /** Google Analytics 4 + GTM */
    gtag?: (...args: unknown[]) => void;
    dataLayer?: unknown[];

    /** Facebook Pixel */
    fbq?: (...args: unknown[]) => void;
    _fbq?: unknown;

    /** Microsoft Clarity */
    clarity?: ((...args: unknown[]) => void) & {
      q?: unknown[];
    };

    /** LinkedIn Insight Tag */
    _linkedin_partner_id?: string;
    _linkedin_data_partner_ids?: string[];
    lintrk?: ((eventName: string, props?: Record<string, unknown>) => void) & {
      q?: unknown[];
    };

    /**
     * Contentsquare UXA — successor to Hotjar after the
     * October 2023 acquisition. Commands are pushed onto `_uxa`
     * as `[command, ...args]` tuples; the SDK drains the queue
     * after load.
     */
    _uxa?: unknown[];
    CS_CONF?: Record<string, unknown>;

    /** Pinterest Tag */
    pintrk?: ((...args: unknown[]) => void) & {
      version?: string;
      queue?: unknown[];
    };

    /** Reddit Pixel */
    rdt?: (...args: unknown[]) => void;

    /** X / Twitter Pixel */
    twq?: (...args: unknown[]) => void;

    /** TikTok Pixel */
    ttq?:
      | ((...args: unknown[]) => void)
      | {
          load?: (id: string) => void;
          page?: () => void;
          track?: (event: string, params?: Record<string, unknown>) => void;
          identify?: (params: Record<string, unknown>) => void;
        };

    /** Quora Pixel */
    qp?: (...args: unknown[]) => void;

    /** Microsoft Bing UET */
    uetq?: unknown[] | { push: (...args: unknown[]) => void };
    UET?: new (config: Record<string, unknown>) => unknown;

    /** Snap Pixel */
    snaptr?: (...args: unknown[]) => void;

    /** PostHog */
    posthog?: {
      capture?: (event: string, props?: Record<string, unknown>) => void;
      identify?: (id: string, traits?: Record<string, unknown>) => void;
      reset?: () => void;
      register?: (props: Record<string, unknown>) => void;
      __loaded?: boolean;
      init?: (key: string, opts: Record<string, unknown>) => void;
    };

    /** Adobe Analytics / Launch */
    _satellite?: {
      track?: (event: string, props?: Record<string, unknown>) => void;
      pageBottom?: () => void;
    };
    digitalData?: Record<string, unknown>;
  }
}

/**
 * Discriminated union of events the unified `track()` facade dispatches.
 * Adding a new event here forces every consumer to handle it explicitly —
 * keeps analytics surface honest and TS-checked.
 */
export type AnalyticsEvent =
  | { name: 'page_view'; props?: { path?: string; title?: string; referrer?: string } }
  | { name: 'sign_up'; props?: { method?: string; role?: string } }
  | { name: 'login'; props?: { method?: string } }
  | { name: 'logout'; props?: Record<string, never> }
  | {
      name: 'job_view';
      props: { jobId: string; title?: string; companyName?: string; value?: number };
    }
  | {
      name: 'job_apply';
      props: { jobId: string; title?: string; companyName?: string; value?: number };
    }
  | { name: 'search'; props: { query: string; resultsCount?: number } }
  | {
      name: 'purchase';
      props: { orderId: string; planCode: string; valueInr: number; currency?: string };
    }
  | {
      name: 'begin_checkout';
      props: { planCode: string; valueInr: number; currency?: string };
    }
  | {
      name: 'add_to_cart';
      props: { planCode: string; valueInr: number; currency?: string };
    }
  | { name: 'lead'; props: { source?: string; value?: number } }
  | { name: 'contact'; props?: { source?: string } };

export type AnalyticsEventName = AnalyticsEvent['name'];

/**
 * Identify payload used by providers that support stable user tracking
 * (GA4 user_id, PostHog identify, Clarity identify, Hotjar identify,
 * LinkedIn email-hash, Facebook AdvancedMatching). Each provider
 * cherry-picks the fields it understands.
 *
 * Email + phone should already be hashed (SHA-256, lowercase, trimmed)
 * before reaching this layer when the downstream provider doesn't hash
 * itself — keep PII off the wire where we can.
 */
export interface IdentifyTraits {
  userId: string;
  role?: 'CANDIDATE' | 'EMPLOYER' | 'ADMIN' | 'SUPER_ADMIN';
  emailSha256?: string;
  phoneSha256?: string;
  /** First-name only — many providers reject full names for privacy. */
  firstName?: string;
  city?: string;
  state?: string;
  /** Free-form extras passed through to providers that support custom traits. */
  custom?: Record<string, string | number | boolean>;
}
