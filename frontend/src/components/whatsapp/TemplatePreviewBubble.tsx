'use client';

import {
  AlertTriangle,
  Copy,
  ExternalLink,
  FileText,
  Image as ImageIcon,
  MapPin,
  Phone,
  Reply,
  Video,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import MessageText from '@/components/whatsapp/MessageText';
import { renderTemplatePreview, type TemplatePreviewValues } from '@/lib/whatsapp-template-vars';
import type { WaTemplate } from '@/types/whatsapp';

const MEDIA_ICON: Record<string, LucideIcon | undefined> = {
  IMAGE: ImageIcon,
  VIDEO: Video,
  DOCUMENT: FileText,
};

const BUTTON_ICON: Record<string, LucideIcon | undefined> = {
  URL: ExternalLink,
  PHONE_NUMBER: Phone,
  COPY_CODE: Copy,
  OTP: Copy,
  QUICK_REPLY: Reply,
};

/**
 * Live WhatsApp-style preview of the message a template send will produce.
 *
 * The send modal and the campaign wizard both collected `{{1}}`, `{{2}}` values
 * against nothing but their index, so the operator had no way to check the
 * order before the message reached a real customer (or an entire broadcast
 * audience). This renders the template exactly as it will land — header, body
 * with WhatsApp formatting applied, footer and buttons — and keeps any
 * still-empty placeholder visible instead of silently collapsing it.
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
  const MediaIcon = MEDIA_ICON[p.headerFormat];
  const chip =
    'flex items-center justify-center gap-1.5 rounded-lg border border-white/25 bg-white/15 px-3 py-1.5 text-center text-xs font-medium text-white';

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
          {MediaIcon && (
            <div className="mb-1.5 flex items-center gap-1.5 rounded-lg bg-white/15 px-2 py-3 text-[11px] text-white/90">
              <MediaIcon className="h-4 w-4 shrink-0" />
              <span className="truncate">
                {p.headerMediaUrl ?? `${p.headerFormat.toLowerCase()} header — add a URL`}
              </span>
            </div>
          )}
          {p.headerFormat === 'LOCATION' && (
            <div className="mb-1.5 flex items-center gap-1.5 rounded-lg bg-white/15 px-2 py-3 text-[11px] text-white/90">
              <MapPin className="h-4 w-4 shrink-0" />
              <span className="truncate">
                {p.headerLocation ?? 'Location pin — add coordinates'}
              </span>
            </div>
          )}
          {p.headerText && <p className="mb-0.5 font-semibold">{p.headerText}</p>}

          {p.body ? (
            <MessageText text={p.body} />
          ) : (
            <p className="text-[11px] text-white/80 italic">This template has no body text.</p>
          )}

          {p.footer && <p className="mt-1.5 text-[11px] text-white/70">{p.footer}</p>}

          {p.buttons.length > 0 && (
            <div className="mt-2 space-y-1 border-t border-white/20 pt-2">
              {p.buttons.map((b, i) => {
                const Icon = BUTTON_ICON[b.type];
                return (
                  <div key={`${b.text}-${i}`} className={chip}>
                    {Icon && <Icon className="h-3.5 w-3.5 shrink-0" />}
                    <span className="truncate">
                      {b.text || b.type}
                      {b.detail && <span className="text-white/70"> · {b.detail}</span>}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {p.cards.length > 0 && (
          <div className="mt-1.5 ml-auto max-w-[22rem] overflow-x-auto pb-1">
            <div className="flex gap-2">
              {p.cards.map((card, i) => {
                const CardIcon = MEDIA_ICON[card.headerFormat];
                return (
                  <div
                    key={i}
                    className="w-40 shrink-0 rounded-xl bg-white p-2 text-[var(--text)] shadow-sm"
                  >
                    <div className="mb-1.5 flex h-16 items-center justify-center gap-1 rounded-lg bg-black/5 px-1.5 text-[10px] text-[var(--text-muted)]">
                      {CardIcon && <CardIcon className="h-3.5 w-3.5 shrink-0" />}
                      <span className="truncate">
                        {card.mediaUrl ??
                          `card ${i + 1} — add ${card.headerFormat === 'VIDEO' ? 'a video' : 'an image'}`}
                      </span>
                    </div>
                    {card.body ? (
                      <MessageText text={card.body} className="text-[11px]" />
                    ) : (
                      <p className="text-[10px] text-[var(--text-muted)] italic">
                        Card {i + 1} has no body text.
                      </p>
                    )}
                    {card.buttons.length > 0 && (
                      <div className="mt-1.5 space-y-1 border-t border-black/10 pt-1.5">
                        {card.buttons.map((b, j) => {
                          const Icon = BUTTON_ICON[b.type];
                          return (
                            <div
                              key={`${b.text}-${j}`}
                              className="flex items-center justify-center gap-1 rounded-lg bg-black/5 px-1.5 py-1 text-center text-[10px] font-medium text-[#00a5f4]"
                            >
                              {Icon && <Icon className="h-3 w-3 shrink-0" />}
                              <span className="truncate">
                                {b.text || b.type}
                                {b.detail && (
                                  <span className="text-[var(--text-muted)]"> · {b.detail}</span>
                                )}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
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
