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
