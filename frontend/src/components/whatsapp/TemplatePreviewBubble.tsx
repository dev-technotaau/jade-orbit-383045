'use client';

import { AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { TemplateBubbleBody, TemplateCards } from '@/components/whatsapp/MessageTemplate';
import { renderTemplatePreview, type TemplatePreviewValues } from '@/lib/whatsapp-template-vars';
import type { WaTemplate } from '@/types/whatsapp';

/**
 * Live WhatsApp-style preview of the message a template send will produce.
 *
 * The send modal and the campaign wizard both collected `{{1}}`, `{{2}}` values
 * against nothing but their index, so the operator had no way to check the
 * order before the message reached a real customer (or an entire broadcast
 * audience). This renders the template exactly as it will land — header, body
 * with WhatsApp formatting applied, footer and buttons — and keeps any
 * still-empty placeholder visible instead of silently collapsing it.
 *
 * The bubble itself is `TemplateBubbleBody`, shared with the SENT message in the
 * inbox: the preview and the permanent record of the same message have to agree,
 * and they only can if there is one renderer.
 */
export default function TemplatePreviewBubble({
  template,
  values,
  note,
  className,
}: {
  /** The selected template — nothing is rendered until one is picked. */
  template: WaTemplate | null | undefined;
  values?: TemplatePreviewValues;
  /** Caption under the preview, e.g. to flag that the values are samples. */
  note?: string;
  className?: string;
}) {
  if (!template) return null;

  const p = renderTemplatePreview(template, values);

  return (
    <div
      className={cn(
        'rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] p-3',
        className,
      )}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-xs font-semibold text-[var(--text-muted)]">Preview</p>
        <p className="truncate text-[11px] text-[var(--text-muted)]">
          {template.name} · {template.language}
        </p>
      </div>

      <div className="rounded-lg bg-[#ece5dd] p-3">
        <div className="ml-auto w-fit max-w-[22rem] min-w-[12rem] rounded-xl rounded-br-sm bg-emerald-600 px-3 py-2 text-sm text-white shadow-sm">
          <TemplateBubbleBody preview={p} />
        </div>

        {p.cards.length > 0 && (
          <div className="mt-1.5 ml-auto max-w-[22rem] overflow-x-auto pb-1">
            <TemplateCards cards={p.cards} />
          </div>
        )}
      </div>

      {p.unfilled.length > 0 && (
        <p className="mt-2 flex items-start gap-1.5 text-[11px] text-amber-700">
          <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" />
          <span>
            Still empty: {p.unfilled.join(', ')} — shown above exactly where each value will land.
          </span>
        </p>
      )}
      {note && <p className="mt-2 text-[11px] text-[var(--text-muted)]">{note}</p>}
    </div>
  );
}
