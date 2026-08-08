'use client';

import { ExternalLink, List as ListIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import MessageText from '@/components/whatsapp/MessageText';
import type { WaMessage } from '@/types/whatsapp';

interface MessageInteractiveProps {
  message: WaMessage;
  outbound: boolean;
}

interface ParsedInteractive {
  body: string | null;
  buttons: string[]; // reply-button titles
  listButton: string | null;
  sections: Array<{ title: string | null; rows: Array<{ title: string; description?: string }> }>;
  cta: { text: string; url?: string } | null;
}

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === 'object' ? (v as Record<string, unknown>) : null;
}
function asString(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v : null;
}

/**
 * Parse the Cloud API interactive structure we persisted on an OUTBOUND message
 * into the options we want to display. Inbound replies (button_reply/list_reply)
 * have no `action.buttons|sections`, so they parse to no options and the caller
 * falls back to the reply text.
 */
function parseInteractive(payload: unknown): ParsedInteractive {
  const empty: ParsedInteractive = {
    body: null,
    buttons: [],
    listButton: null,
    sections: [],
    cta: null,
  };
  const root = asRecord(payload);
  if (!root) return empty;

  const body = asString(asRecord(root.body)?.text ?? null);
  const action = asRecord(root.action);
  if (!action) return { ...empty, body };

  // Reply buttons: action.buttons[].reply.title
  const buttons: string[] = [];
  if (Array.isArray(action.buttons)) {
    for (const b of action.buttons) {
      const title = asString(asRecord(asRecord(b)?.reply)?.title ?? null);
      if (title) buttons.push(title);
    }
  }

  // List: action.button + action.sections[].rows[]
  const sections: ParsedInteractive['sections'] = [];
  if (Array.isArray(action.sections)) {
    for (const s of action.sections) {
      const sec = asRecord(s);
      if (!sec) continue;
      const rows: Array<{ title: string; description?: string }> = [];
      if (Array.isArray(sec.rows)) {
        for (const r of sec.rows) {
          const row = asRecord(r);
          const title = asString(row?.title ?? null);
          if (title) {
            const description = asString(row?.description ?? null);
            rows.push({ title, ...(description ? { description } : {}) });
          }
        }
      }
      sections.push({ title: asString(sec.title ?? null), rows });
    }
  }
  const listButton = sections.length ? asString(action.button ?? null) || 'Menu' : null;

  // CTA URL: action.parameters.{display_text,url}
  let cta: ParsedInteractive['cta'] = null;
  const params = asRecord(action.parameters);
  if (params) {
    const text = asString(params.display_text ?? null);
    const url = asString(params.url ?? null);
    const flowCta = asString(params.flow_cta ?? null);
    if (text) cta = { text, ...(url ? { url } : {}) };
    else if (flowCta) cta = { text: flowCta };
  }

  return { body, buttons, listButton, sections, cta };
}

/**
 * Renders an interactive message. For the messages WE sent (rating buttons,
 * lists, CTAs) it shows the body plus the option chips — display-only, since the
 * customer is the one who taps them. Inbound replies (which carry no options)
 * fall back to their reply text.
 */
export default function MessageInteractive({ message, outbound }: MessageInteractiveProps) {
  const p = parseInteractive(message.payload);
  const body = p.body || message.text || '';
  const hasOptions = p.buttons.length > 0 || p.sections.length > 0 || p.cta !== null;

  if (!hasOptions) {
    return body ? <MessageText text={body} /> : null;
  }

  // Option chip styling: translucent on the emerald outbound bubble, neutral on
  // the white inbound bubble.
  const chip = cn(
    'w-full rounded-lg border px-3 py-1.5 text-center text-sm font-medium',
    outbound
      ? 'border-white/25 bg-white/15 text-white'
      : 'border-[var(--border)] bg-[var(--bg-secondary)] text-[var(--text)]',
  );
  const subtle = outbound ? 'text-white/70' : 'text-[var(--text-muted)]';

  return (
    <div className="min-w-[14rem]">
      {body && <MessageText text={body} />}

      {/* Reply buttons */}
      {p.buttons.length > 0 && (
        <div className="mt-2 space-y-1">
          {p.buttons.map((t, i) => (
            <div key={`${t}-${i}`} className={chip}>
              {t}
            </div>
          ))}
        </div>
      )}

      {/* List */}
      {p.sections.length > 0 && (
        <div className="mt-2 space-y-1.5">
          <div className={cn(chip, 'flex items-center justify-center gap-1.5')}>
            <ListIcon className="h-4 w-4" /> {p.listButton}
          </div>
          {p.sections.map((s, si) => (
            <div key={si} className="space-y-1">
              {s.title && (
                <p className={cn('px-1 text-[11px] font-semibold uppercase', subtle)}>{s.title}</p>
              )}
              {s.rows.map((r, ri) => (
                <div
                  key={ri}
                  className={cn(
                    'rounded-md border px-2.5 py-1.5 text-sm',
                    outbound ? 'border-white/20 bg-white/10 text-white' : 'border-[var(--border)]',
                  )}
                >
                  <span className="font-medium">{r.title}</span>
                  {r.description && <p className={cn('text-xs', subtle)}>{r.description}</p>}
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      {/* CTA / flow button */}
      {p.cta && (
        <div className={cn(chip, 'mt-2 flex items-center justify-center gap-1.5')}>
          <ExternalLink className="h-4 w-4" /> {p.cta.text}
        </div>
      )}
    </div>
  );
}
