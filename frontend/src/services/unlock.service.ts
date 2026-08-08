/**
 * Client for the single app password.
 *
 * Replaces auth.service (login, register, OAuth, refresh, verify-email, password
 * reset, WebAuthn, MFA). Talks to the BFF route rather than the backend directly,
 * because only a server route can set the httpOnly cookie the token lives in.
 */
export const unlockService = {
  /**
   * Submit the password. Resolves true on success.
   *
   * Deliberately returns a boolean rather than throwing on a wrong password —
   * that is an expected outcome of a login form, not an exception. Genuine
   * failures (server misconfigured, API unreachable) DO throw, so the UI can
   * tell "you typed it wrong" from "this deployment is broken".
   */
  async unlock(password: string): Promise<boolean> {
    const res = await fetch('/api/unlock', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    });

    if (res.ok) return true;
    if (res.status === 401) return false;

    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error || `Unlock failed (${res.status})`);
  },

  /** Clear the cookie. */
  async lock(): Promise<void> {
    await fetch('/api/unlock', { method: 'DELETE' });
  },
};

export default unlockService;
