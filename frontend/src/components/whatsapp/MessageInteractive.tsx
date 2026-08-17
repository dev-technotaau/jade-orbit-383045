'use client';

import {
  ExternalLink,
  List as ListIcon,
  ClipboardCheck,
  MapPin,
  Home,
  ShoppingBag,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import MessageText from '@/components/whatsapp/MessageText';
import type { WaMessage } from '@/types/whatsapp';

interface MessageInteractiveProps {
  message: WaMessage;
  outbound: boolean;
}

interface ParsedInteractive {
  body: string | null;
  /** Title above the prompt, or the kind of media that sits there. */
  header: { type: string; text: string | null } | null;
  footer: string | null;
  /** Meta's collection prompts, which carry no options of their own. */
  prompt: 'location' | 'address' | null;
  buttons: string[]; // reply-button titles
  listButton: string | null;
  sections: Array<{ title: string | null; rows: Array<{ title: string; description?: string }> }>;
  cta: { text: string; url?: string } | null;
  /** A completed WhatsApp Flow: the fields the customer actually submitted. */
  submission: { name: string | null; fields: Array<{ label: string; value: string }> } | null;
  /** A catalog send: the products we asked WhatsApp to show, grouped as sent. */
  products: Array<{ title: string | null; retailerIds: string[] }> | null;
}

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === 'object' ? (v as Record<string, unknown>) : null;
}
function asString(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v : null;
}

/**
 * Turn a Flow's raw response key into something an operator can read.
 *
 * Flow Builder names its fields after the screen they sit on
 * (`screen_0_Full_Name_1`), which is meaningless in a chat bubble. Strip the
 * generated screen prefix and trailing index, then unescape the underscores.
 */
function humanizeFlowKey(key: string): string {
  const stripped = key
    .replace(/^screen_\d+_/i, '')
    .replace(/_\d+$/, '')
    .replace(/_/g, ' ')
    .trim();
  const label = stripped || key;
  return label.charAt(0).toUpperCase() + label.slice(1);
}

/** Render a submitted Flow value (string, number, boolean or a list) as text. */
function flowValueToString(value: unknown): string {
  if (value === null || value === undefined) return '—';
  if (Array.isArray(value)) return value.map(flowValueToString).join(', ');
  // A nested object used to print as raw JSON, which is exactly the shape an
  // address_message reply arrives in — braces and quoted keys in a chat bubble
  // instead of the street and pin code an agent has to read.
  if (typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>)
      .map(([k, v]) => `${humanizeFlowKey(k)}: ${flowValueToString(v)}`)
      .join(', ');
  }
  return String(value);
}

/**
 * The retailer ids in a catalog send.
 *
 * A `product` message carries one id straight on the action; a `product_list`
 * groups them into sections of `product_items` — NOT `rows`, which is why the
 * list parser below found sections with nothing in them.
 */
function parseProducts(action: Record<string, unknown>): ParsedInteractive['products'] {
  const single = asString(action.product_retailer_id ?? null);
  if (single) return [{ title: null, retailerIds: [single] }];
  if (!Array.isArray(action.sections)) return null;

  const out: NonNullable<ParsedInteractive['products']> = [];
  for (const s of action.sections) {
    const sec = asRecord(s);
    if (!sec || !Array.isArray(sec.product_items)) continue;
    const retailerIds: string[] = [];
    for (const item of sec.product_items) {
      const id = asString(asRecord(item)?.product_retailer_id ?? null);
      if (id) retailerIds.push(id);
    }
    if (retailerIds.length > 0) out.push({ title: asString(sec.title ?? null), retailerIds });
  }
  return out.length > 0 ? out : null;
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
    header: null,
    footer: null,
    prompt: null,
    buttons: [],
    listButton: null,
    sections: [],
    cta: null,
    submission: null,
    products: null,
  };
  const root = asRecord(payload);
  if (!root) return empty;

  const body = asString(asRecord(root.body)?.text ?? null);
  const rawHeader = asRecord(root.header);
  const header = rawHeader
    ? { type: asString(rawHeader.type) ?? 'text', text: asString(rawHeader.text) }
    : null;
  const footer = asString(asRecord(root.footer)?.text ?? null);
  // The two collection prompts carry a body and an action name and nothing else,
  // so without this they parsed to 'no options' and rendered as a bare sentence —
  // with no sign that WhatsApp had actually shown a Send location / address form.
  const actionName = asString(asRecord(root.action)?.name ?? null);
  const type = asString(root.type);
  const prompt: ParsedInteractive['prompt'] =
    type === 'location_request_message' || actionName === 'send_location'
      ? 'location'
      : type === 'address_message' || actionName === 'address_message'
        ? 'address'
        : null;

  // A completed WhatsApp Flow arrives as `nfm_reply.response_json` — the inbound
  // worker already parses the JSON string onto the payload. It carries no
  // `action`, so it used to fall straight through to the placeholder text
  // ('[flow response]') and the submitted lead/appointment fields were visible
  // nowhere in the product.
  const nfm = asRecord(root.nfm_reply);
  if (nfm) {
    const parsed =
      asRecord(nfm.response_json) ??
      (() => {
        // Defensive: an event ingested before the worker learned to parse it
        // still holds the raw JSON string.
        const raw = asString(nfm.response_json);
        if (!raw) return null;
        try {
          return asRecord(JSON.parse(raw));
        } catch {
          return null;
        }
      })();
    if (parsed) {
      // An address_message submission nests every field under `values`, so
      // rendering the top level showed one row reading 'Values' with the whole
      // address stuffed into it. A Flow submission is already flat and is
      // unaffected.
      const source = asRecord(parsed.values) ?? parsed;
      const fields = Object.entries(source)
        // `flow_token` is our own correlation id echoed back, not something the
        // customer typed.
        .filter(([key]) => key !== 'flow_token')
        .map(([key, value]) => ({ label: humanizeFlowKey(key), value: flowValueToString(value) }));
      if (fields.length > 0) {
        return { ...empty, body, header, footer, submission: { name: asString(nfm.name), fields } };
      }
    }
  }

  const action = asRecord(root.action);
  if (!action) return { ...empty, body, header, footer, prompt };

  // Catalog sends. Neither shape has buttons, rows or parameters, so a single
  // product parsed to 'no options' and rendered as a bare sentence, and a product
  // list rendered its section headings above nothing — the agent was shown a
  // message that never says which product they had just sent to the customer.
  const products = parseProducts(action);
  if (products) return { ...empty, body, header, footer, products };

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

  return {
    body,
    header,
    footer,
    prompt,
    buttons,
    listButton,
    sections,
    cta,
    submission: null,
    products: null,
  };
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
  const hasOptions =
    p.buttons.length > 0 ||
    p.sections.length > 0 ||
    p.products !== null ||
    p.cta !== null ||
    p.submission !== null ||
    p.prompt !== null ||
    p.header !== null ||
    p.footer !== null;

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

  // A completed Flow is a filled-in form, not a set of options — render the
  // labelled answers instead of the '[flow response]' placeholder the worker
  // stored as the message text.
  if (p.submission) {
    return (
      <div className="min-w-[14rem]">
        <div className={cn('flex items-center gap-1.5 text-xs font-semibold', subtle)}>
          <ClipboardCheck className="h-3.5 w-3.5" />
          {p.submission.name || 'Form response'}
        </div>
        <dl className="mt-1.5 space-y-1">
          {p.submission.fields.map((f, i) => (
            <div
              key={`${f.label}-${i}`}
              className={cn(
                'rounded-md border px-2.5 py-1.5 text-sm',
                outbound ? 'border-white/20 bg-white/10 text-white' : 'border-[var(--border)]',
              )}
            >
              <dt className={cn('text-[11px] font-semibold uppercase', subtle)}>{f.label}</dt>
              <dd className="break-words">{f.value}</dd>
            </div>
          ))}
        </dl>
      </div>
    );
  }

  return (
    <div className="min-w-[14rem]">
      {p.header && (
        <p
          className={cn(
            'mb-1 text-sm font-semibold',
            outbound ? 'text-white' : 'text-[var(--text)]',
          )}
        >
          {p.header.text ?? `[${p.header.type}]`}
        </p>
      )}
      {body && <MessageText text={body} />}

      {/* Meta's collection prompts. WhatsApp draws the real control on the
          customer's phone; this is what we sent, shown as what they saw. */}
      {p.prompt && (
        <div className={cn(chip, 'mt-2 flex items-center justify-center gap-1.5')}>
          {p.prompt === 'location' ? (
            <>
              <MapPin className="h-4 w-4" /> Send location
            </>
          ) : (
            <>
              <Home className="h-4 w-4" /> Provide address
            </>
          )}
        </div>
      )}

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

      {/* Catalog products. All we hold is the retailer ids we sent — WhatsApp
          draws the real product cards on the customer's phone — but naming them
          is the difference between a record of the send and a blank bubble. */}
      {p.products && (
        <div className="mt-2 space-y-1.5">
          {p.products.map((s, si) => (
            <div key={si} className="space-y-1">
              {s.title && (
                <p className={cn('px-1 text-[11px] font-semibold uppercase', subtle)}>{s.title}</p>
              )}
              {s.retailerIds.map((id, ri) => (
                <div
                  key={`${id}-${ri}`}
                  className={cn(
                    'flex items-center gap-1.5 rounded-md border px-2.5 py-1.5',
                    outbound ? 'border-white/20 bg-white/10 text-white' : 'border-[var(--border)]',
                  )}
                >
                  <ShoppingBag className="h-3.5 w-3.5 shrink-0" />
                  <span className="min-w-0 truncate font-mono text-xs">{id}</span>
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

      {p.footer && <p className={cn('mt-1.5 text-xs', subtle)}>{p.footer}</p>}
    </div>
  );
}
