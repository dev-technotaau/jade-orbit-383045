import prisma from '../config/prisma';
import logger from '../config/logger';
import { notificationService } from './notification.service';

interface GeoResult {
  country?: string;
  city?: string;
  lat?: number;
  lon?: number;
}

/**
 * Lookup geolocation from IP address using ip-api.com (free tier, 45 req/min).
 */
async function geolocateIp(ip: string): Promise<GeoResult> {
  // Skip private/local IPs
  if (
    ip === '127.0.0.1' ||
    ip === '::1' ||
    ip.startsWith('192.168.') ||
    ip.startsWith('10.') ||
    ip.startsWith('172.')
  ) {
    return { country: 'Local', city: 'Local' };
  }

  try {
    // eslint-disable-next-line n/no-unsupported-features/node-builtins
    const response = await fetch(`http://ip-api.com/json/${ip}?fields=status,country,city,lat,lon`);
    const data = await response.json();
    if (data.status === 'success') {
      return { country: data.country, city: data.city, lat: data.lat, lon: data.lon };
    }
  } catch (error) {
    logger.debug(`Geolocation lookup failed for IP ${ip}: ${error}`);
  }
  return {};
}

/**
 * Calculate distance in kilometers between two lat/lon points (Haversine formula).
 */
function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Earth radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Check device fingerprint against known devices.
 * Creates new device record and sends email alert if unknown.
 */
async function checkDevice(
  userId: string,
  fingerprint: string,
  ip: string,
  userAgent: string
): Promise<void> {
  const existing = await prisma.knownDevice.findUnique({
    where: { userId_fingerprint: { userId, fingerprint } },
  });

  if (existing) {
    // Known device — update last used
    await prisma.knownDevice.update({
      where: { id: existing.id },
      data: { lastUsedAt: new Date(), ipAddress: ip },
    });
    return;
  }

  // Parse a simple device name from user agent
  const deviceName = parseDeviceName(userAgent);
  const geo = await geolocateIp(ip);
  const location = [geo.city, geo.country].filter(Boolean).join(', ') || undefined;

  // Create new device record
  await prisma.knownDevice.create({
    data: { userId, fingerprint, name: deviceName, ipAddress: ip, location },
  });

  // Send new device login email alert
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true, firstName: true },
  });
  if (user) {
    notificationService
      .sendNewDeviceAlert(
        userId,
        user.email,
        user.firstName || 'there',
        deviceName || 'Unknown device',
        location || ip
      )
      .catch(() => {});
  }
}

/**
 * Check login location for anomalies.
 * Flags logins from new countries or cities >500km from last known location.
 */
async function checkLocation(userId: string, ip: string): Promise<void> {
  const geo = await geolocateIp(ip);

  // Store login location
  await prisma.loginLocation.create({
    data: {
      userId,
      ipAddress: ip,
      country: geo.country,
      city: geo.city,
      latitude: geo.lat,
      longitude: geo.lon,
    },
  });

  // Check for anomaly — compare with last trusted/known location
  if (!geo.lat || !geo.lon) return;

  const lastLocation = await prisma.loginLocation.findFirst({
    where: { userId, id: { not: undefined } },
    orderBy: { createdAt: 'desc' },
    skip: 1, // Skip the one we just created
  });

  if (lastLocation?.latitude && lastLocation?.longitude) {
    const distance = haversineDistance(
      lastLocation.latitude,
      lastLocation.longitude,
      geo.lat,
      geo.lon
    );
    if (distance > 500) {
      logger.warn(
        `Geolocation anomaly: User ${userId} logged in from ${geo.city}, ${geo.country} — ${Math.round(distance)}km from last location`
      );
    }
  }
}

/**
 * Parse a human-readable device name from User-Agent string.
 */
function parseDeviceName(ua: string): string {
  if (ua.includes('Chrome') && !ua.includes('Edg')) return 'Chrome on ' + getOS(ua);
  if (ua.includes('Firefox')) return 'Firefox on ' + getOS(ua);
  if (ua.includes('Safari') && !ua.includes('Chrome')) return 'Safari on ' + getOS(ua);
  if (ua.includes('Edg')) return 'Edge on ' + getOS(ua);
  return 'Unknown browser on ' + getOS(ua);
}

function getOS(ua: string): string {
  if (ua.includes('Windows')) return 'Windows';
  if (ua.includes('Mac OS')) return 'macOS';
  if (ua.includes('Linux')) return 'Linux';
  if (ua.includes('Android')) return 'Android';
  if (ua.includes('iPhone') || ua.includes('iPad')) return 'iOS';
  return 'Unknown OS';
}

/**
 * Run all post-login security checks (fire-and-forget).
 * Call after successful authentication.
 */
export async function postLoginChecks(
  userId: string,
  ip: string,
  userAgent: string,
  fingerprint?: string
): Promise<void> {
  try {
    await Promise.all([
      fingerprint ? checkDevice(userId, fingerprint, ip, userAgent) : Promise.resolve(),
      checkLocation(userId, ip),
    ]);
  } catch (error) {
    logger.error('Post-login security checks failed:', error);
  }
}

export const deviceSecurityService = {
  postLoginChecks,
  checkDevice,
  checkLocation,
  geolocateIp,
};
