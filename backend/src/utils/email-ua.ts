/**
 * Lightweight User-Agent classification for email analytics. Opens are usually
 * proxied (Apple MPP, Gmail image proxy) so the UA identifies the mailbox
 * provider; clicks carry the real browser/OS so we can also derive a device
 * class. Hand-rolled (no dep) — good enough for the common providers/devices.
 */

export interface UaClass {
  client: string; // mail client / provider (or browser for clicks)
  device: string; // mobile | desktop | tablet | bot | unknown
}

const CLIENT_RULES: { name: string; re: RegExp }[] = [
  { name: 'Apple Mail Privacy', re: /apple|maccatalyst|mail privacy/i },
  { name: 'Gmail', re: /googleimageproxy|gmail|google-read|via ggpht/i },
  { name: 'Outlook', re: /outlook|microsoft office|msoffice|microsoft-webdav/i },
  { name: 'Yahoo Mail', re: /yahoo|ymail/i },
  { name: 'Proofpoint', re: /proofpoint/i },
  { name: 'Mimecast', re: /mimecast/i },
  { name: 'Thunderbird', re: /thunderbird/i },
  { name: 'Superhuman', re: /superhuman/i },
  { name: 'Apple Mail', re: /\biphone\b|\bipad\b|\bipod\b|macintosh.*mail/i },
  { name: 'Chrome', re: /\bchrome\b|\bcrios\b/i },
  { name: 'Safari', re: /\bsafari\b/i },
  { name: 'Firefox', re: /\bfirefox\b|\bfxios\b/i },
  { name: 'Edge', re: /\bedg(e|a|ios)?\b/i },
];

const BOT_RE =
  /bot|crawler|spider|preview|scan|monitor|healthcheck|python-requests|curl|wget|okhttp/i;
const TABLET_RE = /ipad|tablet|kindle|silk|playbook/i;
const MOBILE_RE = /mobi|iphone|ipod|android.*mobile|windows phone|blackberry|opera mini/i;

function deviceOf(ua: string): string {
  if (BOT_RE.test(ua)) return 'bot';
  if (TABLET_RE.test(ua)) return 'tablet';
  if (MOBILE_RE.test(ua)) return 'mobile';
  // Apple MPP / Gmail proxy opens have no real device — treat as unknown.
  if (/googleimageproxy|apple.*mail privacy|via ggpht/i.test(ua)) return 'unknown';
  if (/windows|macintosh|linux|x11|cros/i.test(ua)) return 'desktop';
  return 'unknown';
}

export function classifyUserAgent(ua: string | null | undefined): UaClass {
  if (!ua || !ua.trim()) return { client: 'Unknown', device: 'unknown' };
  const client = CLIENT_RULES.find((r) => r.re.test(ua))?.name ?? 'Other';
  return { client, device: deviceOf(ua) };
}
