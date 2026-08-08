import { env } from '../config/env';
import logger from '../config/logger';

// --- Types ---

export interface GeocodingResult {
  latitude: number;
  longitude: number;
  formattedAddress?: string;
}

interface GeocodingProvider {
  geocode(address: string): Promise<GeocodingResult | null>;
}

// --- LRU Cache ---

interface CacheEntry {
  result: GeocodingResult | null;
  expiresAt: number;
}

class LRUCache {
  private cache = new Map<string, CacheEntry>();
  private readonly maxSize: number;
  private readonly ttlMs: number;

  constructor(maxSize = 1000, ttlMs = 24 * 60 * 60 * 1000) {
    this.maxSize = maxSize;
    this.ttlMs = ttlMs;
  }

  get(key: string): GeocodingResult | null | undefined {
    const entry = this.cache.get(key);
    if (!entry) return undefined;
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return undefined;
    }
    // Move to end (most recent)
    this.cache.delete(key);
    this.cache.set(key, entry);
    return entry.result;
  }

  set(key: string, result: GeocodingResult | null): void {
    if (this.cache.size >= this.maxSize) {
      // Delete oldest (first) entry
      const firstKey = this.cache.keys().next().value;
      if (firstKey !== undefined) this.cache.delete(firstKey);
    }
    this.cache.set(key, { result, expiresAt: Date.now() + this.ttlMs });
  }
}

// --- Nominatim Provider (OpenStreetMap) ---

class NominatimProvider implements GeocodingProvider {
  private readonly baseUrl: string;
  private readonly userAgent: string;
  private lastRequestTime = 0;

  constructor() {
    this.baseUrl = env.NOMINATIM_BASE_URL;
    this.userAgent = env.NOMINATIM_USER_AGENT;
  }

  async geocode(address: string): Promise<GeocodingResult | null> {
    // Rate limit: 1 request per second
    const now = Date.now();
    const elapsed = now - this.lastRequestTime;
    if (elapsed < 1100) {
      await new Promise((resolve) => setTimeout(resolve, 1100 - elapsed));
    }
    this.lastRequestTime = Date.now();

    const url = `${this.baseUrl}/search?${new URLSearchParams({
      q: address,
      format: 'json',
      limit: '1',
      addressdetails: '1',
    })}`;

    // eslint-disable-next-line n/no-unsupported-features/node-builtins
    const response = await fetch(url, {
      headers: { 'User-Agent': this.userAgent },
    });

    if (!response.ok) {
      logger.error(`Nominatim geocoding failed: ${response.status} ${response.statusText}`);
      return null;
    }

    const data = (await response.json()) as Array<{
      lat: string;
      lon: string;
      display_name: string;
    }>;

    if (!data || data.length === 0) {
      return null;
    }

    const result = data[0];
    return {
      latitude: parseFloat(result.lat),
      longitude: parseFloat(result.lon),
      formattedAddress: result.display_name,
    };
  }
}

// --- Google Provider (stub for future use) ---

class GoogleProvider implements GeocodingProvider {
  private readonly apiKey: string;

  constructor() {
    this.apiKey = env.GOOGLE_GEOCODING_API_KEY || '';
  }

  async geocode(address: string): Promise<GeocodingResult | null> {
    if (!this.apiKey) {
      logger.error('Google Geocoding API key not configured');
      return null;
    }

    const url = `https://maps.googleapis.com/maps/api/geocode/json?${new URLSearchParams({
      address,
      key: this.apiKey,
    })}`;

    // eslint-disable-next-line n/no-unsupported-features/node-builtins
    const response = await fetch(url);
    if (!response.ok) {
      logger.error(`Google geocoding failed: ${response.status}`);
      return null;
    }

    const data = (await response.json()) as {
      status: string;
      results: Array<{
        geometry: { location: { lat: number; lng: number } };
        formatted_address: string;
      }>;
    };

    if (data.status !== 'OK' || !data.results.length) {
      return null;
    }

    const result = data.results[0];
    return {
      latitude: result.geometry.location.lat,
      longitude: result.geometry.location.lng,
      formattedAddress: result.formatted_address,
    };
  }
}

// --- Main Service ---

class GeocodingService {
  private provider: GeocodingProvider;
  private cache = new LRUCache(1000, 24 * 60 * 60 * 1000);

  constructor() {
    this.provider =
      env.GEOCODING_PROVIDER === 'google' ? new GoogleProvider() : new NominatimProvider();
  }

  async geocode(address: string): Promise<GeocodingResult | null> {
    const normalizedAddress = address.trim().toLowerCase();
    if (!normalizedAddress) return null;

    // Check cache
    const cached = this.cache.get(normalizedAddress);
    if (cached !== undefined) return cached;

    try {
      const result = await this.provider.geocode(address);
      this.cache.set(normalizedAddress, result);
      return result;
    } catch (error) {
      logger.error('Geocoding error:', error);
      return null;
    }
  }
}

export const geocodingService = new GeocodingService();
