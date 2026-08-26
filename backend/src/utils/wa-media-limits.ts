/**
 * Meta Cloud API media rules — the kind a file goes out as and the size ceiling
 * that applies to it.
 *
 * Lifted out of the inbox controller because the template header-sample upload
 * reaches the same Meta upload API and must apply the same rules. While these
 * lived next to `sendMedia` only the message path enforced them, so a file
 * that was refused as an attachment sailed through as a template header sample
 * and came back as an opaque Graph error.
 */

/**
 * Every kind a file can go out as. Named because the ceilings, the limit lookup
 * and `mediaKindForMime` all have to agree on the set.
 */
export type MetaMediaKind = 'image' | 'video' | 'audio' | 'document' | 'sticker';

/**
 * Per-kind size ceilings Meta enforces on the Cloud API. Exceeding one is
 * rejected at upload with an opaque error, so check before spending the round
 * trip.
 */
export const META_MEDIA_LIMITS: Record<MetaMediaKind, number> = {
  image: 5 * 1024 * 1024,
  video: 16 * 1024 * 1024,
  audio: 16 * 1024 * 1024,
  // The STATIC WebP ceiling. Meta allows an animated sticker five times as much
  // (ANIMATED_STICKER_LIMIT), and the container itself says which is which — see
  // isAnimatedWebp. Declaring the animated figure for both, as this did, let a
  // 300 KB static sticker past our own gate to be refused by Meta with an opaque
  // error the operator could do nothing about.
  sticker: 100 * 1024,
  document: 100 * 1024 * 1024,
};

/** Meta's ceiling for an ANIMATED WebP sticker — five times the static one. */
export const ANIMATED_STICKER_LIMIT = 500 * 1024;

/** The three media formats a template HEADER can be authored as. */
export type WaHeaderMediaFormat = 'IMAGE' | 'VIDEO' | 'DOCUMENT';

/**
 * Exactly what Meta accepts for each template-header format.
 *
 * Deliberately NOT `image/*` / `video/*`. Meta's image rule is jpeg and png
 * ONLY — a WebP is a sticker to Meta, and pointing an IMAGE header at one is
 * refused with `(#131053) Media upload error`. That error arrives on the
 * DELIVERY webhook, long after the send was accepted, so nothing on the send
 * path could tell the operator what was wrong with the file they chose; on a
 * campaign it lands once per recipient for the whole audience.
 *
 * Document covers Meta's full office set rather than PDF alone, which is all
 * the upload control used to offer.
 */
export const HEADER_FORMAT_MIMES: Record<WaHeaderMediaFormat, readonly string[]> = {
  IMAGE: ['image/jpeg', 'image/png'],
  VIDEO: ['video/mp4', 'video/3gpp'],
  DOCUMENT: [
    'application/pdf',
    'text/plain',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  ],
};

/** Which size ceiling a header format is judged against. */
export const HEADER_FORMAT_KIND: Record<WaHeaderMediaFormat, MetaMediaKind> = {
  IMAGE: 'image',
  VIDEO: 'video',
  DOCUMENT: 'document',
};

/**
 * The header's kind carrying the article English wants — "an image", but "a
 * video" and "a document".
 *
 * Every one of these strings is built from the template's own header format, so
 * writing `a ${format.toLowerCase()}` produced "a image header" wherever an
 * image template was involved.
 */
export function headerNoun(format: string): string {
  const kind = format.toLowerCase();
  return `${kind === 'image' ? 'an' : 'a'} ${kind}`;
}

/**
 * A human list of what a header format takes, for the message shown when the
 * chosen file is the wrong type. `image/jpeg` means nothing to an operator
 * looking at a logo they exported as WebP.
 */
export function headerFormatHint(format: WaHeaderMediaFormat): string {
  switch (format) {
    case 'IMAGE':
      return 'JPG or PNG (WebP and GIF are not accepted for image headers)';
    case 'VIDEO':
      return 'MP4 or 3GPP';
    default:
      return 'PDF, Word, Excel, PowerPoint or plain text';
  }
}

/**
 * True when a WebP buffer carries an animation.
 *
 * RIFF lists its chunks in the clear, so the extended (VP8X) header's ANIM flag
 * is the entire test: 21 bytes and no image library, which is what makes the
 * static/animated distinction affordable on the send path. A plain VP8/VP8L
 * file has no extended header at all and is therefore static.
 */
export function isAnimatedWebp(buffer: Buffer): boolean {
  if (buffer.length < 21) return false;
  if (buffer.toString('ascii', 0, 4) !== 'RIFF') return false;
  if (buffer.toString('ascii', 8, 12) !== 'WEBP') return false;
  if (buffer.toString('ascii', 12, 16) !== 'VP8X') return false;
  return (buffer[20] & 0x02) !== 0;
}

/**
 * The ceiling that applies to a resolved kind. Only stickers have two of them,
 * and `animated` is left undefined wherever the bytes are not in hand yet.
 */
export function metaLimitFor(kind: MetaMediaKind, animated?: boolean): number {
  return kind === 'sticker' && animated !== false
    ? ANIMATED_STICKER_LIMIT
    : META_MEDIA_LIMITS[kind];
}

/**
 * A byte count in the unit that reads. The sticker ceiling printed in MB rounds
 * to "must be under 0 MB", which tells an operator nothing about the file they
 * just picked.
 */
export function byteLabel(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  const mb = bytes / (1024 * 1024);
  return `${Number.isInteger(mb) ? mb : mb.toFixed(1)} MB`;
}

/**
 * Which Cloud API message type a file goes out as.
 *
 * `size` and `animated` are optional and only matter for WEBP: over Meta's
 * sticker ceiling a WEBP has to ride as a document — which is what every WEBP
 * did before stickers were supported — rather than be refused outright. Losing
 * the ability to send a large WEBP at all would be a worse outcome than sending
 * it as a file card. With no size to go on it is treated as a sticker and the
 * per-kind ceiling at each call site catches it.
 */
export function mediaKindForMime(mime: string, size?: number, animated?: boolean): MetaMediaKind {
  // Only mp4/3gpp ride as native WhatsApp video; every other video container
  // (mkv/webm/mov/…) falls back to a downloadable document so it still sends,
  // just like the WhatsApp app does.
  if (mime === 'video/mp4' || mime === 'video/3gpp') return 'video';
  // The Cloud API accepts ONLY jpeg and png as an `image` message. This branch
  // used to take every `image/*`, so a GIF, WEBP or BMP — all completely
  // ordinary things to attach — was sent as an image, rejected by Meta, and
  // surfaced to the operator as a raw 500 with no message row. The rest ride as
  // documents, which is exactly what the doc-comment below already promised.
  if (mime === 'image/jpeg' || mime === 'image/png') return 'image';
  // WEBP is a STICKER to Meta, not an image. This used to fall through to
  // 'document', so sending a sticker delivered a .webp file card the customer
  // had to download — and the 500 KB `sticker` ceiling below was unreachable
  // dead code, since nothing ever resolved to that kind.
  if (mime === 'image/webp') {
    // `animated === undefined` means the bytes are not in hand yet (the signing
    // pre-flight sees only a declared size): assume the permissive animated
    // ceiling there, so pre-flight never refuses what the authoritative,
    // byte-level check a moment later would have accepted.
    return size !== undefined && size > metaLimitFor('sticker', animated) ? 'document' : 'sticker';
  }
  if (mime.startsWith('audio/')) return 'audio';
  return 'document';
}

/**
 * The largest thing any kind may be. Used as the security scan's ceiling so a
 * legitimate 40 MB document is not rejected by a scan limit BEFORE the per-kind
 * check gets to say anything useful about it; the real limit is still enforced
 * per kind immediately after.
 */
export const MAX_MEDIA_BYTES = Math.max(...Object.values(META_MEDIA_LIMITS));
