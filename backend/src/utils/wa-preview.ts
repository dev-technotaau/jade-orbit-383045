/**
 * The one-line summary a conversation row shows for its last message.
 *
 * Previously `text ?? '[' + type.toLowerCase() + ']'`. Inbound stores only the
 * CAPTION in `text` and stashes the filename, the sha256 and the voice flag on
 * the payload, so a payment screenshot, a sticker and a signed contract PDF all
 * rendered as `[image]`, `[sticker]`, `[document]` — or, captionless, as nothing
 * that distinguished them at all. Scanning the inbox could not answer "what is
 * this thread about?" for anything that was not plain text.
 *
 * The notification path already phrased these properly ("New image message"),
 * so the list was the odd one out.
 */

export type WaPreviewType =
  | 'TEXT'
  | 'IMAGE'
  | 'VIDEO'
  | 'AUDIO'
  | 'DOCUMENT'
  | 'STICKER'
  | 'LOCATION'
  | 'CONTACTS'
  | 'INTERACTIVE'
  | 'BUTTON'
  | 'REACTION'
  | 'TEMPLATE'
  | 'SYSTEM'
  | 'ORDER'
  | 'UNSUPPORTED'
  | string;

/** What the payload carries that is worth naming in a one-line summary. */
interface PreviewPayload {
  /** Document header/attachment name — far more useful than the word "Document". */
  filename?: unknown;
  /** Meta marks a push-to-talk recording; a music file is not the same thing. */
  voice?: unknown;
  /** Sticker animation, when Meta reported it. */
  animated?: unknown;
}

const LABELS: Record<string, string> = {
  IMAGE: 'Photo',
  VIDEO: 'Video',
  AUDIO: 'Audio',
  DOCUMENT: 'Document',
  STICKER: 'Sticker',
  LOCATION: 'Location',
  CONTACTS: 'Contact card',
  ORDER: 'Order',
  INTERACTIVE: 'Interactive message',
  BUTTON: 'Button reply',
  UNSUPPORTED: 'Unsupported message',
};

/**
 * Build the preview.
 *
 * `text` wins for anything that has one — a caption IS the summary, and the type
 * word in front of it would only steal width. The label is the fallback, and for
 * a document the filename beats the label outright.
 */
export function previewForMessage(
  type: WaPreviewType,
  text: string | null | undefined,
  payload?: unknown
): string {
  const body = (text ?? '').trim();
  const p = (payload && typeof payload === 'object' ? payload : {}) as PreviewPayload;
  const kind = String(type ?? '').toUpperCase();

  if (kind === 'TEXT' || kind === 'TEMPLATE' || kind === 'SYSTEM') {
    return body;
  }

  if (kind === 'DOCUMENT') {
    const filename = typeof p.filename === 'string' ? p.filename.trim() : '';
    const label = filename || LABELS.DOCUMENT;
    return body ? `${label} · ${body}` : label;
  }

  if (kind === 'AUDIO') {
    // A voice note and an attached MP3 read very differently to an operator
    // deciding whether to open a thread.
    const label = p.voice ? 'Voice message' : LABELS.AUDIO;
    return body ? `${label} · ${body}` : label;
  }

  const label = LABELS[kind] ?? kind.toLowerCase();
  return body ? `${label} · ${body}` : label;
}
