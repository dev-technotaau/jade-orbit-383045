/**
 * App configuration.
 *
 * Pruned from the host platform's 239-line version, which also carried
 * PAGINATION, FILE_LIMITS, PASSWORD_RULES_DEFAULTS, ACCOUNT_SECURITY_DEFAULTS,
 * OTP_CONFIG_DEFAULTS, EXPERIENCE_BUCKETS and 76 React Query keys across 18
 * feature groups.
 *
 * `QUERY_KEYS` is gone too: after the feature-flag system was removed its only
 * remaining entries were the flag keys, and every WhatsApp surface declares its
 * own inline key (`['wa-contacts', …]`, `['wa-segments']`) rather than routing
 * through a shared table.
 */

export const APP_CONFIG = {
  /** Display name. Falls back the same way Logo.tsx does, so the two agree. */
  name: process.env.NEXT_PUBLIC_BRAND_NAME || 'TechnoTaau',
  url: process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
  apiUrl: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api/v1',
  socketUrl: process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:5000',
  supportEmail: process.env.NEXT_PUBLIC_SUPPORT_EMAIL || '',
} as const;

/**
 * Largest body the BFF proxy can carry, in bytes.
 *
 * The browser does not talk to the backend directly: every request goes through
 * the Next.js BFF proxy, which buffers the whole body
 * (`await request.arrayBuffer()`) before forwarding it. Serverless platforms cap
 * that request body — Vercel at 4.5 MB — so anything larger dies inside the
 * proxy with a platform error that never reaches our error handling.
 *
 * This is NOT the upload limit any more. It is the threshold at which a file
 * stops riding through the proxy and is PUT straight to storage instead (see
 * `whatsappService.sendMedia`), which is what makes an ordinary 12 MB video or
 * 40 MB PDF sendable at all. Raise NEXT_PUBLIC_MAX_UPLOAD_MB on a self-hosted
 * deployment whose proxy has no such cap, to keep more sends on the simpler
 * one-request path.
 */
export const MAX_UPLOAD_BYTES =
  Math.round(parseFloat(process.env.NEXT_PUBLIC_MAX_UPLOAD_MB || '4') * 1024 * 1024) ||
  4 * 1024 * 1024;

/** Human-readable form of {@link MAX_UPLOAD_BYTES}, for error copy. */
export const MAX_UPLOAD_LABEL = `${(MAX_UPLOAD_BYTES / (1024 * 1024)).toFixed(1).replace(/\.0$/, '')} MB`;

/**
 * What WhatsApp itself accepts, per kind of attachment.
 *
 * Mirrors META_MEDIA_LIMITS in backend/src/controllers/whatsapp-inbox.controller.ts
 * — keep the two in step. The UI used to enforce a single flat 4 MB cap taken
 * from the proxy's body limit, so a 6 MB contract PDF, a 10 MB brochure and a
 * 12 MB product video were all refused as though WhatsApp could not carry them,
 * with a message ("The maximum upload size is 4 MB") that read like a product
 * decision rather than a hosting artefact.
 */
export const WA_MEDIA_LIMITS = {
  image: 5 * 1024 * 1024,
  video: 16 * 1024 * 1024,
  audio: 16 * 1024 * 1024,
  // Meta's STATIC sticker ceiling; an animated one may be five times as large.
  sticker: 100 * 1024,
  document: 100 * 1024 * 1024,
} as const;

export type WaMediaKind = keyof typeof WA_MEDIA_LIMITS;

/** Meta's ceiling for an ANIMATED WebP sticker. */
export const WA_ANIMATED_STICKER_LIMIT = 500 * 1024;

/**
 * The ceiling this gate applies to a kind.
 *
 * Telling a static WebP from an animated one means reading the file's RIFF
 * header, which the server does on the bytes it receives. The browser gate is a
 * courtesy check, so it uses the permissive figure: refusing a perfectly legal
 * 300 KB animated sticker in the picker would be worse than letting the server
 * be the one to say no to an oversized static one.
 */
export function waMediaLimit(kind: WaMediaKind): number {
  return kind === 'sticker' ? WA_ANIMATED_STICKER_LIMIT : WA_MEDIA_LIMITS[kind];
}

/**
 * Which limit applies to a file, by mime type (and, for WEBP, its size). Mirrors
 * `mediaKindForMime` on the backend: only jpeg/png ride as an `image` and only
 * mp4/3gpp as a `video`; everything else Meta will not take natively is sent as
 * a document.
 */
export function waMediaKind(mime: string, size?: number): WaMediaKind {
  if (mime === 'video/mp4' || mime === 'video/3gpp') return 'video';
  if (mime === 'image/jpeg' || mime === 'image/png') return 'image';
  // WEBP goes out as a STICKER, which is how Meta classifies it — the picker
  // used to call it a document, so a sticker arrived as a file card the customer
  // had to download, and the sticker ceiling was never applied to anything.
  // Over that ceiling it cannot be a sticker at all, so it keeps the old
  // document behaviour instead of becoming unsendable.
  if (mime === 'image/webp') {
    return size !== undefined && size > waMediaLimit('sticker') ? 'document' : 'sticker';
  }
  if (mime.startsWith('audio/')) return 'audio';
  return 'document';
}

/**
 * Throws an operator-readable error when a picked file exceeds WhatsApp's limit
 * for its kind. Call before building the FormData, not after.
 */
const KIND_LABEL: Record<WaMediaKind, string> = {
  image: 'an image',
  video: 'a video',
  audio: 'an audio file',
  sticker: 'a sticker',
  document: 'a document',
};

export function assertWaMediaSize(file: File): void {
  const kind = waMediaKind(file.type || 'application/octet-stream', file.size);
  const limit = waMediaLimit(kind);
  if (file.size > limit) {
    const limitLabel =
      limit < 1024 * 1024
        ? `${Math.round(limit / 1024)} KB`
        : `${Math.round(limit / (1024 * 1024))} MB`;
    throw new Error(
      `"${file.name}" is ${(file.size / (1024 * 1024)).toFixed(1)} MB. ` +
        `WhatsApp accepts at most ${limitLabel} for ${KIND_LABEL[kind]}.`,
    );
  }
}

/**
 * Size gate for uploads that still go THROUGH the proxy (template header
 * samples), where the platform body limit really is the ceiling.
 */
export function assertUploadSize(file: File): void {
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new Error(
      `"${file.name}" is ${(file.size / (1024 * 1024)).toFixed(1)} MB. ` +
        `Files sent this way must be under ${MAX_UPLOAD_LABEL} on this deployment.`,
    );
  }
}

/**
 * How many phone numbers a pasted/uploaded campaign audience may carry.
 *
 * Mirrors WA_UPLOAD_PHONE_MAX in backend/src/schemas/whatsapp.schema.ts — keep
 * the two in step. Stating it next to the textarea is the point: an over-large
 * paste used to be rejected by the body parser as a bare 413, which the wizard
 * surfaced as "Failed to create campaign" and which named no number the operator
 * could act on.
 */
export const WA_UPLOAD_PHONE_MAX = 20_000;

/**
 * How many BYTES of that audience may travel in the request body.
 *
 * Mirrors WA_UPLOAD_PAYLOAD_MAX_BYTES in backend/src/schemas/whatsapp.schema.ts —
 * keep the two in step. The row cap above does not bound a personalised list: the
 * same 20,000 rows are ~310 KB as bare numbers but ~2 MB once each carries a name
 * and two columns, so a fully in-spec upload could pass the row check here and
 * still be refused by the request parser — a 413 the wizard can only render as
 * "Failed to create campaign".
 */
export const WA_UPLOAD_PAYLOAD_MAX_BYTES = 6 * 1024 * 1024;
