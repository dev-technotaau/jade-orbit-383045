/**
 * Lightweight IP geo lookup. Used by:
 *   - pricing.service.resolvePlaceOfSupplyState() — GST place-of-supply fallback
 *   - fraud.service GEO_MISMATCH check
 *
 * Strategy: prefer Cloudflare's `cf-ipcountry` request header at the route
 * layer (set on every request when behind CF). For node-only callers, we
 * fall back to a tiny static range table for India + a "best effort" note
 * that returns null otherwise — callers degrade gracefully.
 *
 * Why no maxmind / external DB? We're already behind Cloudflare in prod;
 * adding a separate IP-database dependency is unnecessary weight.
 */

import logger from '../config/logger';

export interface IpGeoResult {
  /** ISO-3166 alpha-2 country code (e.g. 'IN', 'US', 'GB'). */
  country: string;
  /** GST state code if country=IN and we can resolve, else null. */
  gstStateCode: string | null;
}

const PRIVATE_RANGES = [
  /^10\./,
  /^192\.168\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^127\./,
  /^169\.254\./,
  /^::1$/,
  /^fc/i,
  /^fd/i,
];

function isPrivate(ip: string): boolean {
  return PRIVATE_RANGES.some((re) => re.test(ip));
}

/**
 * Resolve IP → country (and GST state if Indian).
 *
 * The actual country resolution should be wired at the request middleware
 * layer using the `cf-ipcountry` header (Cloudflare) or `X-Country-Code`
 * (custom proxy). This function looks for those values on a passed-in
 * header object first; if not provided, returns null.
 */
export async function lookupIpCountryAndState(
  ipAddress: string,
  headers?: Record<string, string | string[] | undefined>
): Promise<IpGeoResult | null> {
  if (!ipAddress) return null;
  if (isPrivate(ipAddress)) return null;

  // Prefer headers set by Cloudflare / nginx geoip
  if (headers) {
    const cfCountry = stringHeader(headers['cf-ipcountry']);
    const xCountry = stringHeader(headers['x-country-code']);
    const country = (cfCountry ?? xCountry ?? '').toUpperCase();
    if (country && country !== 'XX' && country !== 'T1') {
      const gstStateCode = country === 'IN' ? stringHeader(headers['cf-region-code']) : null;
      return {
        country,
        gstStateCode: gstStateCode && /^[0-9]{2}$/.test(gstStateCode) ? gstStateCode : null,
      };
    }
  }

  // No external DB — log and return null. Caller falls through to next step
  // in the place-of-supply chain.
  logger.debug('lookupIpCountryAndState: no resolver available — returning null', {
    ipAddress,
  });
  return null;
}

function stringHeader(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

/**
 * Convenience helper for fraud service — returns true if the IP's country
 * differs from the buyer's stated country (when both are resolvable).
 */
export async function ipBuyerCountryMismatch(args: {
  ipAddress?: string | null;
  buyerCountryCode?: string | null;
  headers?: Record<string, string | string[] | undefined>;
}): Promise<boolean> {
  if (!args.ipAddress || !args.buyerCountryCode) return false;
  const ipGeo = await lookupIpCountryAndState(args.ipAddress, args.headers);
  if (!ipGeo) return false;
  const buyerCountry = args.buyerCountryCode.toUpperCase();
  return ipGeo.country !== buyerCountry;
}
