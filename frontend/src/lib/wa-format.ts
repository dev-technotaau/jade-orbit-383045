import { Bold, Italic, Strikethrough, Code } from 'lucide-react';

// WhatsApp text-formatting helpers (plain-string utilities). The rich renderer
// lives in components/whatsapp/MessageText.tsx; these are for places
// that need a plain string — compact previews and detection.
//
//   *bold*  _italic_  ~strikethrough~  ```monospace```  `inline code`
//   > quote   - / * bullet list   1. numbered list

/** Remove WhatsApp formatting markers, leaving clean readable text — for the
 *  conversation-list snippet and quoted-reply previews (single-line, truncated). */
export function stripWhatsAppFormatting(text: string): string {
  if (!text) return text;
  return text
    .replace(/```([\s\S]+?)```/g, '$1')
    .replace(/`([^`\n]+?)`/g, '$1')
    .replace(/\*(\S(?:[^*\n]*?\S)?)\*/g, '$1')
    .replace(/_(\S(?:[^_\n]*?\S)?)_/g, '$1')
    .replace(/~(\S(?:[^~\n]*?\S)?)~/g, '$1')
    .replace(/^[ \t]*>[ \t]?/gm, '')
    .replace(/^[ \t]*[-*][ \t]+/gm, '')
    .replace(/^[ \t]*(\d+)\.[ \t]+/gm, '$1. ');
}

/** Whether the text likely contains any WhatsApp formatting (gates the live
 *  composer preview so plain messages stay clutter-free). */
export function hasWaFormatting(text: string): boolean {
  return /[*_~`]/.test(text) || /^[ \t]*(?:>|[-*][ \t]|\d+\.[ \t])/m.test(text);
}

// ── Editing side: the toolbar definition and the marker toggle ──
/**
 * The icon rides along with the marker so the toolbar is described in ONE place.
 * Both consumers are client components; nothing here is imported on the server.
 */
export const WA_FORMATS = [
  { label: 'Bold', marker: '*', shortcut: 'b', icon: Bold },
  { label: 'Italic', marker: '_', shortcut: 'i', icon: Italic },
  { label: 'Strikethrough', marker: '~', shortcut: null, icon: Strikethrough },
  { label: 'Monospace', marker: '```', shortcut: null, icon: Code },
] as const;

export interface FormatResult {
  /** The whole field's new value. */
  value: string;
  /** Where the selection should sit afterwards — INSIDE the markers. */
  selectionStart: number;
  selectionEnd: number;
}

/**
 * Wrap the current selection in `marker`, or unwrap it when it is already
 * wrapped.
 *
 * The toggle is the part `FormattedTextarea` never had: pressing Bold twice on
 * the same selection there produced `**text**`, which WhatsApp renders as a
 * literal asterisk either side of bold text rather than as plain text. With an
 * empty selection the markers are inserted and the caret is parked between them,
 * so the operator can simply type.
 */
export function applyWaFormat(
  value: string,
  start: number,
  end: number,
  marker: string,
): FormatResult {
  const selected = value.slice(start, end);
  const before = value.slice(0, start);
  const after = value.slice(end);

  // Already wrapped, either inside the selection or immediately around it.
  const wrappedInside =
    selected.length >= marker.length * 2 &&
    selected.startsWith(marker) &&
    selected.endsWith(marker);
  if (wrappedInside) {
    const inner = selected.slice(marker.length, selected.length - marker.length);
    return {
      value: before + inner + after,
      selectionStart: start,
      selectionEnd: start + inner.length,
    };
  }
  if (before.endsWith(marker) && after.startsWith(marker)) {
    const nextBefore = before.slice(0, before.length - marker.length);
    const nextAfter = after.slice(marker.length);
    return {
      value: nextBefore + selected + nextAfter,
      selectionStart: start - marker.length,
      selectionEnd: start - marker.length + selected.length,
    };
  }

  const inner = start + marker.length;
  return {
    value: before + marker + selected + marker + after,
    selectionStart: inner,
    selectionEnd: inner + selected.length,
  };
}
