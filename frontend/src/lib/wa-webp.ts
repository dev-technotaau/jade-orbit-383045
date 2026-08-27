/**
 * Is this WebP animated?
 *
 * Mirrors `isAnimatedWebp` in the backend's `utils/wa-media-limits.ts`, byte for
 * byte, because the two have to agree: Meta caps a STATIC sticker at 100 KB and
 * an animated one at 500 KB, and the client used the permissive figure for both.
 *
 * The result was a promise the send could not keep. A 300 KB static WebP passed
 * the browser's 500 KB check and was announced as a sticker — with the caption
 * box hidden on that basis, since stickers carry no caption — while the server,
 * reading the actual bytes, resolved it to `document` and delivered a file card
 * the customer had to download, minus the context the operator would have typed.
 *
 * RIFF lists its chunks in the clear, so the extended (VP8X) header's ANIM flag
 * is the whole test: 21 bytes and no image library. A plain VP8/VP8L file has no
 * extended header at all and is therefore static.
 */
export function isAnimatedWebpBytes(bytes: Uint8Array): boolean {
  if (bytes.length < 21) return false;
  const ascii = (from: number, to: number) =>
    String.fromCharCode(...Array.from(bytes.slice(from, to)));
  if (ascii(0, 4) !== 'RIFF') return false;
  if (ascii(8, 12) !== 'WEBP') return false;
  if (ascii(12, 16) !== 'VP8X') return false;
  return (bytes[20] & 0x02) !== 0;
}

/**
 * Read just enough of the file to answer it.
 *
 * Only the first 32 bytes are sliced — reading a whole 500 KB sticker into
 * memory to look at byte 20 would be silly, and the picker runs this on every
 * selection.
 *
 * Returns false on any failure: an unreadable file is the server's problem to
 * report, and guessing "animated" here would re-introduce the permissive
 * ceiling this exists to remove.
 */
export async function isAnimatedWebpFile(file: File): Promise<boolean> {
  try {
    const head = await file.slice(0, 32).arrayBuffer();
    return isAnimatedWebpBytes(new Uint8Array(head));
  } catch {
    return false;
  }
}
