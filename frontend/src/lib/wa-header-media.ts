/**
 * What a template HEADER accepts, per format.
 *
 * Mirrors `HEADER_FORMAT_MIMES` in the backend's `utils/wa-media-limits.ts`, and
 * the two must not drift: the backend refuses anything outside its list, so a
 * wider `accept` here only lets an operator pick a file that is then rejected.
 *
 * Deliberately NOT `image/*` or `video/*`. Meta takes jpeg and png ONLY for an
 * image header — a WebP is a sticker to Meta, and pointing an image header at
 * one is refused with the opaque `(#131053) Media upload error`, which arrives
 * on the delivery webhook rather than at send time.
 *
 * DOCUMENT covers Meta's whole office set. This used to offer PDF alone, so a
 * perfectly valid .docx or .xlsx header could not be picked at all.
 */
export const HEADER_ACCEPT: Record<string, string> = {
  IMAGE: 'image/jpeg,image/png',
  VIDEO: 'video/mp4,video/3gpp',
  DOCUMENT: [
    '.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt',
    'application/pdf',
    'text/plain',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  ].join(','),
};

/** Plain-language version of the same rule, for helper text under an input. */
export const HEADER_ACCEPT_HINT: Record<string, string> = {
  IMAGE: 'JPG or PNG — WebP and GIF are not accepted by WhatsApp for image headers.',
  VIDEO: 'MP4 or 3GPP.',
  DOCUMENT: 'PDF, Word, Excel, PowerPoint or plain text.',
};
