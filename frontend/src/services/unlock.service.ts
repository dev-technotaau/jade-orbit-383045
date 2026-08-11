/**
 * Client for the single app password.
 *
 * Replaces auth.service (login, register, OAuth, refresh, verify-email, password
 * reset, WebAuthn, MFA). Talks to the BFF routes rather than the backend
 * directly, because only a server route can set the httpOnly cookies the
 * credentials live in — the browser never holds a session token, an MFA
 * challenge ticket or a trusted-device token in readable JavaScript.
 */

/** What step 1 resolved to. */
export type UnlockResult =
  /** Fully signed in. */
  | { status: 'unlocked' }
  /** Password accepted; a second factor is required to finish. */
  | { status: 'mfa_required' }
  /** The password was wrong. */
  | { status: 'invalid_password' };

export const unlockService = {
  /**
   * Submit the password and the bot-challenge token.
   *
   * Returns a discriminated result rather than throwing for a wrong password —
   * that is an expected outcome of a login form, not an exception. Genuine
   * failures (bot check rejected, server misconfigured, API unreachable) DO
   * throw, so the UI can tell "you typed it wrong" from "this is broken".
   */
  async unlock(password: string, turnstileToken?: string | null): Promise<UnlockResult> {
    const res = await fetch('/api/unlock', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password, turnstileToken }),
    });

    if (res.ok) {
      const body = (await res.json().catch(() => ({}))) as { mfaRequired?: boolean };
      return body.mfaRequired ? { status: 'mfa_required' } : { status: 'unlocked' };
    }
    if (res.status === 401) return { status: 'invalid_password' };

    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error || `Unlock failed (${res.status})`);
  },

  /**
   * Submit the second factor — a 6-digit TOTP code or a recovery code.
   *
   * The challenge ticket is not passed here: it lives in an httpOnly cookie the
   * BFF reads server-side.
   */
  async verifyMfa(
    code: string,
    trustDevice = false,
  ): Promise<{ status: 'unlocked' } | { status: 'invalid_code' } | { status: 'expired' }> {
    const res = await fetch('/api/unlock/mfa', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, trustDevice }),
    });

    if (res.ok) return { status: 'unlocked' };

    const body = (await res.json().catch(() => ({}))) as { error?: string };
    if (res.status === 401) {
      return /expired/i.test(body.error ?? '') ? { status: 'expired' } : { status: 'invalid_code' };
    }
    throw new Error(body.error || `Verification failed (${res.status})`);
  },

  /** Clear the session. The trusted-device cookie deliberately survives. */
  async lock(): Promise<void> {
    await fetch('/api/unlock', { method: 'DELETE' });
  },
};

export default unlockService;
