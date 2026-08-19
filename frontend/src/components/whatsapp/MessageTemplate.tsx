'use client';

import type { ReactNode } from 'react';
import {
  Copy,
  ExternalLink,
  FileText,
  Image as ImageIcon,
  MapPin,
  Phone,
  PhoneCall,
  Reply,
  ShoppingBag,
  Timer,
  Video,
  Workflow,
  type LucideIcon,
} from 'lucide-react';
import MessageText from '@/components/whatsapp/MessageText';
import MessageAttachment from '@/components/whatsapp/MessageAttachment';
import MessageImage from '@/components/whatsapp/MessageImage';
import MessageLocation from '@/components/whatsapp/MessageLocation';
import MessageVideo from '@/components/whatsapp/MessageVideo';
import {
  storedTemplatePreview,
  type StoredTemplateMessage,
  type TemplatePreview,
  type TemplatePreviewCard,
} from '@/lib/whatsapp-template-vars';
import type { WaMessage } from '@/types/whatsapp';

/** Header formats that arrive as a file. */
const TEMPLATE_MEDIA_ICON: Record<string, LucideIcon | undefined> = {
  IMAGE: ImageIcon,
  VIDEO: Video,
  DOCUMENT: FileText,
};

/**
 * One icon per Meta button type.
 *
 * Every kind is mapped, not only the ones that take a send parameter. A quick
 * reply, a static URL, a phone number, a Flow entry point and a catalogue button
 * are all part of the APPROVED template and carry nothing in the send payload —
 * which is exactly why they were invisible in the thread. The customer taps them;
 * an agent reading the conversation back had no idea they existed, so a one-word
 * "Yes" arriving next answered a question nobody could see.
 */
const BUTTON_ICON: Record<string, LucideIcon | undefined> = {
  URL: ExternalLink,
  PHONE_NUMBER: Phone,
  VOICE_CALL: PhoneCall,
  COPY_CODE: Copy,
  OTP: Copy,
  QUICK_REPLY: Reply,
  FLOW: Workflow,
  CATALOG: ShoppingBag,
  MPM: ShoppingBag,
  SPM: ShoppingBag,
};

const CHIP =
  'flex items-center justify-center gap-1.5 rounded-lg border border-white/25 bg-white/15 px-3 py-1.5 text-center text-xs font-medium text-white';

/**
 * The contents of a WhatsApp template bubble — header, body, offer, footer and
 * button chips — rendered from an already-substituted `TemplatePreview`.
 *
 * Shared verbatim by the compose-time preview and the sent-message bubble. They
 * used to be two different things: the operator checked the full message in the
 * compose modal, pressed Send, and watched a bare paragraph appear in the thread.
 * The preview and the permanent record of the same message disagreed, and the one
 * that persisted was the wrong one — so both now come from this component and
 * cannot drift apart.
 *
 * Always drawn white-on-green: a template is an OUTBOUND message by definition.
 */
export function TemplateBubbleBody({
  preview,
  headerMedia,
  highlight,
}: {
  preview: TemplatePreview;
  /**
   * The real header, for a message that has actually been sent — the uploaded
   * image/video/document, or the location pin. The compose preview has no
   * delivered media to show and falls back to the placeholder chip below, which
   * doubles as the "add a URL" prompt.
   */
  headerMedia?: ReactNode;
  /** Search term to mark inside the body, when opened from a message search. */
  highlight?: string;
}) {
  const p = preview;
  const MediaIcon = TEMPLATE_MEDIA_ICON[p.headerFormat];
  const expiry = p.offerExpiresAt !== null ? new Date(p.offerExpiresAt) : null;

  return (
    <>
      {headerMedia ? (
        <div className="mb-1.5">{headerMedia}</div>
      ) : (
        <>
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
        </>
      )}
      {p.headerText && <p className="mb-0.5 font-semibold">{p.headerText}</p>}

      {p.body ? (
        <MessageText text={p.body} highlight={highlight} />
      ) : (
        <p className="text-[11px] text-white/80 italic">This template has no body text.</p>
      )}

      {/* LIMITED_TIME_OFFER. The customer sees a live countdown; without this the
          operator saw a plain paragraph and could not answer "has my offer
          expired?" from the thread at all. */}
      {(p.offerText || expiry) && (
        <div className="mt-1.5 flex items-center gap-1.5 rounded-lg bg-white/15 px-2 py-1 text-[11px] text-white/90">
          <Timer className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">
            {p.offerText ?? 'Limited-time offer'}
            {expiry && ` · expires ${expiry.toLocaleString()}`}
          </span>
        </div>
      )}

      {/* The footer is where the opt-out line lives ("Reply STOP to
          unsubscribe"), so an operator answering a complaint about unsolicited
          marketing could not see from the thread that it had been included. */}
      {p.footer && <p className="mt-1.5 text-[11px] text-white/70">{p.footer}</p>}

      {p.buttons.length > 0 && (
        <div className="mt-2 space-y-1 border-t border-white/20 pt-2">
          {p.buttons.map((b, i) => {
            const Icon = BUTTON_ICON[b.type];
            // The full label on hover: a chip is one line and the thing an
            // operator needs off it — the exact link, the coupon that was issued,
            // the number the customer was told to ring — is the part that gets
            // truncated away.
            const label = b.detail ? `${b.text || b.type} · ${b.detail}` : b.text || b.type;
            return (
              <div key={`${b.text}-${i}`} className={CHIP} title={label}>
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
    </>
  );
}

/**
 * A carousel's cards, as the horizontal strip WhatsApp draws beside the bubble.
 *
 * Kept out of `TemplateBubbleBody` because the two callers place it differently:
 * the compose preview sits it on the chat backdrop next to the bubble, the inbox
 * inside the bubble it belongs to.
 */
export function TemplateCards({ cards }: { cards: TemplatePreviewCard[] }) {
  if (cards.length === 0) return null;
  return (
    <div className="flex gap-2">
      {cards.map((card, i) => {
        const CardIcon = TEMPLATE_MEDIA_ICON[card.headerFormat];
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
  );
}

/**
 * One SENT template message, drawn from what the send actually emitted.
 *
 * Everything here comes off the message row: the approved components and the
 * per-send values are persisted on `WaMessage.payload`, and an uploaded header's
 * media id on `WaMessage.mediaId`. Nothing is fetched, so a template that has
 * since been edited, re-approved or deleted at Meta still renders as the message
 * the customer received rather than as whatever it says today.
 */
export default function MessageTemplate({
  message,
  stored,
  highlight,
}: {
  message: WaMessage;
  /** The parsed payload — see `parseStoredTemplate`. */
  stored: StoredTemplateMessage;
  highlight?: string;
}) {
  const preview = storedTemplatePreview(stored);
  const { headerMediaId, headerMediaFilename, headerLocation } = stored.values;

  // The media renderers show `message.text` as a caption, and on a template row
  // that text IS the rendered body — which `TemplateBubbleBody` draws just below.
  // Handing them the row unchanged printed the message twice.
  const mediaRow: WaMessage = { ...message, text: null };

  let headerMedia: ReactNode = null;
  if (headerMediaId && message.mediaId) {
    // Routed off the TEMPLATE's own header format, not off `message.type`:
    // MessageAttachment dispatches on the row type, and every one of these rows
    // is a TEMPLATE, so an image header would otherwise land on the generic
    // file-download card.
    if (preview.headerFormat === 'IMAGE') {
      headerMedia = <MessageImage message={mediaRow} outbound />;
    } else if (preview.headerFormat === 'VIDEO') {
      headerMedia = <MessageVideo message={mediaRow} outbound />;
    } else if (preview.headerFormat === 'DOCUMENT') {
      headerMedia = (
        <MessageAttachment message={mediaRow} outbound filename={headerMediaFilename} />
      );
    }
  } else if (
    preview.headerFormat === 'LOCATION' &&
    typeof headerLocation?.latitude === 'number' &&
    typeof headerLocation?.longitude === 'number'
  ) {
    // The real pin, with its map link — the same card an ordinary location
    // message gets. `MessageLocation` keys on `message.type === 'LOCATION'`
    // upstream, which a template row never is, so it was unreachable.
    headerMedia = <MessageLocation payload={headerLocation} />;
  }

  return (
    <div className="min-w-[12rem]">
      <TemplateBubbleBody preview={preview} headerMedia={headerMedia} highlight={highlight} />
      {preview.cards.length > 0 && (
        <div className="mt-2 max-w-[20rem] overflow-x-auto pb-1">
          <TemplateCards cards={preview.cards} />
        </div>
      )}
    </div>
  );
}
