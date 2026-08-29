/**
 * What an E.164 number tells us about the person behind it.
 *
 * Meta supplies NO timezone, country or language for a WhatsApp contact — the
 * webhook carries a phone number and a display name and nothing else. So an
 * agent in Mumbai had no way to know they were about to message someone at 3am,
 * which is both a quality-rating risk and simply rude.
 *
 * The calling code is the only signal available, and it is a WEAK one. Two rules
 * follow from that, and both are load-bearing:
 *
 *  1. A country spanning several time zones gets NO clock. Showing "14:32" for a
 *     number in the United States is a coin flip across five zones, and a
 *     confident wrong time is worse than no time — an agent who sees one will
 *     act on it.
 *  2. Everything derived here is labelled an estimate in the UI. The number can
 *     be roaming, ported, or a virtual number in a country the person has never
 *     lived in.
 *
 * A static table rather than a phone-number library: `libphonenumber-js` is
 * ~145 kB for a lookup this shallow, and it would not fix rule 1 anyway — it
 * gives regions, not the timezone of an individual subscriber.
 */

export interface PhoneRegion {
  /** The matched calling code, without '+'. */
  code: string;
  country: string;
  /**
   * IANA zone, or null when the country spans several and no single answer is
   * honest.
   */
  timezone: string | null;
  /** Whether the country has more than one zone — drives the "no clock" case. */
  multiZone: boolean;
  /** Likely languages, most common first. A hint for template choice, never a fact. */
  languages: string[];
}

/**
 * Calling code → region. Longest-prefix wins, so '1876' (Jamaica) beats '1'.
 *
 * Ordered by how much WhatsApp traffic each actually carries rather than
 * alphabetically; the lookup sorts by length regardless.
 */
const REGIONS: Record<string, Omit<PhoneRegion, 'code'>> = {
  '91': { country: 'India', timezone: 'Asia/Kolkata', multiZone: false, languages: ['hi', 'en'] },
  '971': {
    country: 'United Arab Emirates',
    timezone: 'Asia/Dubai',
    multiZone: false,
    languages: ['ar', 'en'],
  },
  '966': {
    country: 'Saudi Arabia',
    timezone: 'Asia/Riyadh',
    multiZone: false,
    languages: ['ar'],
  },
  '974': { country: 'Qatar', timezone: 'Asia/Qatar', multiZone: false, languages: ['ar', 'en'] },
  '965': { country: 'Kuwait', timezone: 'Asia/Kuwait', multiZone: false, languages: ['ar'] },
  '968': { country: 'Oman', timezone: 'Asia/Muscat', multiZone: false, languages: ['ar'] },
  '973': { country: 'Bahrain', timezone: 'Asia/Bahrain', multiZone: false, languages: ['ar'] },
  '44': {
    country: 'United Kingdom',
    timezone: 'Europe/London',
    multiZone: false,
    languages: ['en'],
  },
  '65': { country: 'Singapore', timezone: 'Asia/Singapore', multiZone: false, languages: ['en'] },
  '60': {
    country: 'Malaysia',
    timezone: 'Asia/Kuala_Lumpur',
    multiZone: false,
    languages: ['ms', 'en'],
  },
  '62': {
    // Three zones (WIB/WITA/WIT).
    country: 'Indonesia',
    timezone: null,
    multiZone: true,
    languages: ['id'],
  },
  '63': {
    country: 'Philippines',
    timezone: 'Asia/Manila',
    multiZone: false,
    languages: ['en', 'tl'],
  },
  '66': { country: 'Thailand', timezone: 'Asia/Bangkok', multiZone: false, languages: ['th'] },
  '84': { country: 'Vietnam', timezone: 'Asia/Ho_Chi_Minh', multiZone: false, languages: ['vi'] },
  '880': { country: 'Bangladesh', timezone: 'Asia/Dhaka', multiZone: false, languages: ['bn'] },
  '92': { country: 'Pakistan', timezone: 'Asia/Karachi', multiZone: false, languages: ['ur', 'en'] },
  '94': { country: 'Sri Lanka', timezone: 'Asia/Colombo', multiZone: false, languages: ['si', 'ta'] },
  '977': { country: 'Nepal', timezone: 'Asia/Kathmandu', multiZone: false, languages: ['ne'] },
  '86': {
    // One official zone despite the geography.
    country: 'China',
    timezone: 'Asia/Shanghai',
    multiZone: false,
    languages: ['zh'],
  },
  '81': { country: 'Japan', timezone: 'Asia/Tokyo', multiZone: false, languages: ['ja'] },
  '82': { country: 'South Korea', timezone: 'Asia/Seoul', multiZone: false, languages: ['ko'] },
  '852': { country: 'Hong Kong', timezone: 'Asia/Hong_Kong', multiZone: false, languages: ['zh'] },
  '20': { country: 'Egypt', timezone: 'Africa/Cairo', multiZone: false, languages: ['ar'] },
  '212': { country: 'Morocco', timezone: 'Africa/Casablanca', multiZone: false, languages: ['ar', 'fr'] },
  '213': { country: 'Algeria', timezone: 'Africa/Algiers', multiZone: false, languages: ['ar', 'fr'] },
  '216': { country: 'Tunisia', timezone: 'Africa/Tunis', multiZone: false, languages: ['ar', 'fr'] },
  '234': { country: 'Nigeria', timezone: 'Africa/Lagos', multiZone: false, languages: ['en'] },
  '254': { country: 'Kenya', timezone: 'Africa/Nairobi', multiZone: false, languages: ['sw', 'en'] },
  '27': {
    country: 'South Africa',
    timezone: 'Africa/Johannesburg',
    multiZone: false,
    languages: ['en', 'af'],
  },
  '251': { country: 'Ethiopia', timezone: 'Africa/Addis_Ababa', multiZone: false, languages: ['am'] },
  '233': { country: 'Ghana', timezone: 'Africa/Accra', multiZone: false, languages: ['en'] },
  '255': { country: 'Tanzania', timezone: 'Africa/Dar_es_Salaam', multiZone: false, languages: ['sw'] },
  '256': { country: 'Uganda', timezone: 'Africa/Kampala', multiZone: false, languages: ['en', 'sw'] },
  '49': { country: 'Germany', timezone: 'Europe/Berlin', multiZone: false, languages: ['de'] },
  '33': { country: 'France', timezone: 'Europe/Paris', multiZone: false, languages: ['fr'] },
  '39': { country: 'Italy', timezone: 'Europe/Rome', multiZone: false, languages: ['it'] },
  '34': { country: 'Spain', timezone: 'Europe/Madrid', multiZone: false, languages: ['es'] },
  '351': { country: 'Portugal', timezone: 'Europe/Lisbon', multiZone: false, languages: ['pt'] },
  '31': { country: 'Netherlands', timezone: 'Europe/Amsterdam', multiZone: false, languages: ['nl'] },
  '32': { country: 'Belgium', timezone: 'Europe/Brussels', multiZone: false, languages: ['nl', 'fr'] },
  '41': { country: 'Switzerland', timezone: 'Europe/Zurich', multiZone: false, languages: ['de', 'fr'] },
  '43': { country: 'Austria', timezone: 'Europe/Vienna', multiZone: false, languages: ['de'] },
  '46': { country: 'Sweden', timezone: 'Europe/Stockholm', multiZone: false, languages: ['sv'] },
  '47': { country: 'Norway', timezone: 'Europe/Oslo', multiZone: false, languages: ['no'] },
  '45': { country: 'Denmark', timezone: 'Europe/Copenhagen', multiZone: false, languages: ['da'] },
  '358': { country: 'Finland', timezone: 'Europe/Helsinki', multiZone: false, languages: ['fi'] },
  '48': { country: 'Poland', timezone: 'Europe/Warsaw', multiZone: false, languages: ['pl'] },
  '30': { country: 'Greece', timezone: 'Europe/Athens', multiZone: false, languages: ['el'] },
  '353': { country: 'Ireland', timezone: 'Europe/Dublin', multiZone: false, languages: ['en'] },
  '90': { country: 'Türkiye', timezone: 'Europe/Istanbul', multiZone: false, languages: ['tr'] },
  '380': { country: 'Ukraine', timezone: 'Europe/Kyiv', multiZone: false, languages: ['uk'] },
  '972': { country: 'Israel', timezone: 'Asia/Jerusalem', multiZone: false, languages: ['he', 'ar'] },
  '98': { country: 'Iran', timezone: 'Asia/Tehran', multiZone: false, languages: ['fa'] },
  '964': { country: 'Iraq', timezone: 'Asia/Baghdad', multiZone: false, languages: ['ar'] },
  '962': { country: 'Jordan', timezone: 'Asia/Amman', multiZone: false, languages: ['ar'] },
  '961': { country: 'Lebanon', timezone: 'Asia/Beirut', multiZone: false, languages: ['ar'] },
  '7': {
    // Russia spans eleven zones; Kazakhstan shares the code.
    country: 'Russia / Kazakhstan',
    timezone: null,
    multiZone: true,
    languages: ['ru'],
  },
  '55': { country: 'Brazil', timezone: null, multiZone: true, languages: ['pt'] },
  '52': { country: 'Mexico', timezone: null, multiZone: true, languages: ['es'] },
  '54': { country: 'Argentina', timezone: 'America/Argentina/Buenos_Aires', multiZone: false, languages: ['es'] },
  '56': { country: 'Chile', timezone: 'America/Santiago', multiZone: false, languages: ['es'] },
  '57': { country: 'Colombia', timezone: 'America/Bogota', multiZone: false, languages: ['es'] },
  '51': { country: 'Peru', timezone: 'America/Lima', multiZone: false, languages: ['es'] },
  '58': { country: 'Venezuela', timezone: 'America/Caracas', multiZone: false, languages: ['es'] },
  '61': { country: 'Australia', timezone: null, multiZone: true, languages: ['en'] },
  '64': { country: 'New Zealand', timezone: 'Pacific/Auckland', multiZone: false, languages: ['en'] },
  '1': {
    // US + Canada + much of the Caribbean, across six zones.
    country: 'US / Canada',
    timezone: null,
    multiZone: true,
    languages: ['en', 'es'],
  },
};

/** Longest calling code first, so '971' is tried before '9' would be. */
const CODES = Object.keys(REGIONS).sort((a, b) => b.length - a.length);

/** Resolve an E.164 number to its region, or null when nothing matches. */
export function phoneRegion(phone: string | null | undefined): PhoneRegion | null {
  if (!phone) return null;
  const digits = phone.replace(/[^\d]/g, '');
  if (!digits) return null;
  for (const code of CODES) {
    if (digits.startsWith(code)) return { code, ...REGIONS[code] };
  }
  return null;
}

/**
 * The contact's local time, or null when we cannot honestly give one.
 *
 * Null for an unknown country AND for any country spanning several zones — see
 * the note at the top of this file. The caller shows the country alone in that
 * case rather than a time that is right by luck.
 */
export function localTimeFor(region: PhoneRegion | null, now: Date = new Date()): string | null {
  if (!region?.timezone) return null;
  try {
    return new Intl.DateTimeFormat([], {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: region.timezone,
    }).format(now);
  } catch {
    // An environment without that zone in its ICU data. Silence beats a wrong
    // clock, which is the whole principle here.
    return null;
  }
}

/**
 * Whether it is a reasonable hour to message someone there.
 *
 * 21:00–08:00 local is "asleep". Advisory only — a customer who wrote to US
 * first has opened a service window and expects a reply, so this must never
 * BLOCK a send, only warn before an unprompted one.
 */
export function isUnsociableHour(region: PhoneRegion | null, now: Date = new Date()): boolean {
  if (!region?.timezone) return false;
  try {
    const hour = Number(
      new Intl.DateTimeFormat('en-GB', {
        hour: '2-digit',
        hour12: false,
        timeZone: region.timezone,
      }).format(now)
    );
    return Number.isFinite(hour) && (hour >= 21 || hour < 8);
  } catch {
    return false;
  }
}
