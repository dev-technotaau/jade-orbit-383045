'use client';

import { useRef, useState } from 'react';
import { Turnstile as TurnstileWidget, type TurnstileInstance } from '@marsidev/react-turnstile';

const SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || '';

interface TurnstileProps {
  /** Fires with the token once the challenge passes, or null when it is lost. */
  onToken: (token: string | null) => void;
  /**
   * Bump to force a fresh challenge. Used as a React `key`, so the widget is
   * remounted rather than reset through an effect — a Turnstile token is
   * single-use, and a failed submit must not be retried with the same one.
   */
  resetKey?: number;
  className?: string;
}

/**
 * Cloudflare Turnstile challenge.
 *
 * The backend REQUIRES a token on `/unlock` in production and fails closed
 * without one, so this is not decoration: with no site key configured the form
 * cannot be submitted, and the component says so rather than rendering nothing.
 * The host platform's version returns `null` when unconfigured, which silently
 * produces a login form whose submissions the API will reject — the operator
 * sees "CAPTCHA required" with no CAPTCHA on screen and nothing to click.
 */
export default function Turnstile({ onToken, resetKey = 0, className }: TurnstileProps) {
  if (!SITE_KEY) {
    return (
      <p
        role="alert"
        className={`rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800 ${className ?? ''}`}
      >
        NEXT_PUBLIC_TURNSTILE_SITE_KEY is not set, so the bot check cannot load and sign-in will be
        rejected by the API. Set it to your Cloudflare Turnstile site key.
      </p>
    );
  }

  return <Challenge key={resetKey} onToken={onToken} className={className} />;
}

/**
 * The widget itself, remounted by its key on every reset. Keeping `failed` in
 * here means it clears on remount with no effect and no setState-in-effect.
 */
function Challenge({
  onToken,
  className,
}: {
  onToken: (token: string | null) => void;
  className?: string;
}) {
  const ref = useRef<TurnstileInstance>(null);
  const [failed, setFailed] = useState(false);

  return (
    <div className={`flex flex-col items-center gap-2 ${className ?? ''}`}>
      <TurnstileWidget
        ref={ref}
        siteKey={SITE_KEY}
        onSuccess={(token) => {
          setFailed(false);
          onToken(token);
        }}
        onError={() => {
          setFailed(true);
          onToken(null);
        }}
        onExpire={() => {
          // Tokens expire after a few minutes; get another rather than letting
          // the operator submit one the API will reject as stale.
          onToken(null);
          ref.current?.reset();
        }}
        options={{ theme: 'auto', size: 'normal' }}
      />
      {failed && (
        <p role="alert" className="text-sm text-[var(--error)]">
          The bot check could not load. Check your connection and try again.
        </p>
      )}
    </div>
  );
}
