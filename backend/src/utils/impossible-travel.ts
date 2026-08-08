/**
 * Impossible travel detection.
 * Flags logins from IPs that are geographically too far apart
 * to be reached in the time between logins.
 */

import axios from 'axios';
import logger from '../config/logger';

// Average max travel speed in km/h (commercial flight ~900 km/h + buffer)
const MAX_TRAVEL_SPEED_KMH = 1200;

// Minimum time difference to trigger check (skip if > 24h apart)
const MAX_CHECK_WINDOW_MS = 24 * 60 * 60 * 1000;

// Minimum distance to flag (skip minor location changes within same city)
const MIN_FLAG_DISTANCE_KM = 500;

interface GeoIP {
  lat: number;
  lon: number;
  country?: string;
  city?: string;
}

/**
 * Calculate distance between two coordinates using Haversine formula.
 */
function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Earth's radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Lookup approximate geolocation from IP using a free API.
 * Returns null if lookup fails (non-blocking).
 */
async function geolocateIp(ip: string): Promise<GeoIP | null> {
  // Skip private/localhost IPs
  if (
    ip === '127.0.0.1' ||
    ip === '::1' ||
    ip.startsWith('10.') ||
    ip.startsWith('192.168.') ||
    ip.startsWith('172.')
  ) {
    return null;
  }

  try {
    const { data } = await axios.get<{ lat: number; lon: number; country?: string; city?: string }>(
      `http://ip-api.com/json/${ip}?fields=lat,lon,country,city`,
      { timeout: 3000 }
    );
    if (data.lat && data.lon) {
      return { lat: data.lat, lon: data.lon, country: data.country, city: data.city };
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Check for impossible travel between current and previous login.
 * Returns a warning message if suspicious, null if OK.
 */
export async function checkImpossibleTravel(
  currentIp: string,
  previousIp: string | null,
  previousLoginAt: Date | null
): Promise<string | null> {
  if (!previousIp || !previousLoginAt) return null;
  if (currentIp === previousIp) return null;

  const timeDiffMs = Date.now() - previousLoginAt.getTime();
  if (timeDiffMs > MAX_CHECK_WINDOW_MS) return null; // Too long ago, skip

  try {
    const [currentGeo, previousGeo] = await Promise.all([
      geolocateIp(currentIp),
      geolocateIp(previousIp),
    ]);

    if (!currentGeo || !previousGeo) return null;

    const distanceKm = haversineKm(
      currentGeo.lat,
      currentGeo.lon,
      previousGeo.lat,
      previousGeo.lon
    );

    if (distanceKm < MIN_FLAG_DISTANCE_KM) return null; // Same area

    const timeDiffHours = timeDiffMs / (1000 * 60 * 60);
    const requiredSpeed = distanceKm / timeDiffHours;

    if (requiredSpeed > MAX_TRAVEL_SPEED_KMH) {
      const msg = `Suspicious login: ${Math.round(distanceKm)}km from previous location (${previousGeo.city || previousGeo.country} → ${currentGeo.city || currentGeo.country}) in ${Math.round(timeDiffHours * 60)} minutes`;
      logger.warn(`Impossible travel detected: ${msg}`);
      return msg;
    }

    return null;
  } catch (error) {
    logger.error('Impossible travel check failed', error);
    return null; // Non-blocking — don't prevent login on check failure
  }
}
