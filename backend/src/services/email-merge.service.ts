import * as cheerio from 'cheerio';
import { emailLayout, BRAND } from '../templates/email/_layout';
import { openPixelUrl, clickUrl, unsubscribeUrl, preferencesUrl } from '../utils/email-token';

/**
 * Per-recipient render engine: variable substitution + open/click tracking
 * injection + CAN-SPAM/DPDP footer. Pure (no DB) so it's cheap to call per
 * recipient in the campaign worker and identically in preview.
 */

export interface MergeRecipient {
  id: string;
  trackingToken: string;
  email: string;
}

export interface MergeContext {
  recipient: MergeRecipient;
  campaignId?: string | null;
  variables?: Record<string, unknown> | null;
  contactName?: string | null;
  preheader?: string | null;
  isMarketing: boolean;
  trackOpens: boolean;
  trackClicks: boolean;
  footerAddress?: string | null;
  footerHtml?: string | null;
  /** UTM params appended to every outbound link before click-wrapping. */
  utm?: Record<string, string> | null;
}

/** Append UTM params to an http(s) URL (skips if none set or on parse error). */
function appendUtm(url: string, utm?: Record<string, string> | null): string {
  if (!utm) return url;
  const entries = Object.entries(utm).filter(([, v]) => v);
  if (!entries.length) return url;
  try {
    const u = new URL(url);
    for (const [k, v] of entries) if (!u.searchParams.has(k)) u.searchParams.set(k, v);
    return u.toString();
  } catch {
    return url;
  }
}

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
  unsubscribeUrl: string;
}

const VAR_RE = /\{\{\s*([\w.]+)\s*\}\}/g;

/** Build a lowercased flat variable map: built-ins < attributes < explicit vars. */
function buildVars(ctx: MergeContext): Record<string, string> {
  const name = (ctx.contactName || '').trim();
  const firstName = name.split(/\s+/)[0] || '';
  const unsubUrl = unsubscribeUrl({
    e: ctx.recipient.email,
    r: ctx.recipient.id,
    c: ctx.campaignId ?? null,
  });
  const base: Record<string, string> = {
    email: ctx.recipient.email,
    name: name || firstName || 'there',
    first_name: firstName || 'there',
    unsubscribe_url: unsubUrl,
    preferences_url: preferencesUrl({
      e: ctx.recipient.email,
      r: ctx.recipient.id,
      c: ctx.campaignId ?? null,
    }),
    brand_name: BRAND.name,
    year: String(BRAND.year),
  };
  const out: Record<string, string> = { ...base };
  for (const [k, v] of Object.entries(ctx.variables ?? {})) {
    if (v !== undefined && v !== null) out[k.toLowerCase()] = String(v);
  }
  return out;
}

function substitute(input: string, vars: Record<string, string>): string {
  return input.replace(VAR_RE, (_m, key: string) => {
    const v = vars[key.toLowerCase()];
    return v !== undefined ? v : '';
  });
}

const isFullDoc = (html: string): boolean => /<html[\s>]/i.test(html) || /<!doctype/i.test(html);

const stripHtml = (html: string): string =>
  html
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/\s+/g, ' ')
    .trim();

/** Hosts we allow a tracked link to redirect to (open-redirect guard at click time). */
function shouldRewriteHref(href: string): boolean {
  if (!href) return false;
  const h = href.trim();
  if (h.startsWith('#') || h.startsWith('mailto:') || h.startsWith('tel:')) return false;
  return /^https?:\/\//i.test(h);
}

/** Compliance footer (visible unsubscribe + physical address) — marketing only. */
function complianceFooterHtml(unsubUrl: string, ctx: MergeContext): string {
  const address = (ctx.footerAddress || '').trim();
  const custom = (ctx.footerHtml || '').trim();
  return `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:24px;border-top:1px solid ${BRAND.border};">
  <tr>
    <td style="padding:20px 0 0 0;text-align:center;">
      ${custom ? `<div style="margin:0 0 10px 0;font-size:12px;color:${BRAND.textMuted};line-height:1.6;">${custom}</div>` : ''}
      <p style="margin:0 0 6px 0;font-size:12px;color:${BRAND.textMuted};line-height:1.6;">
        You received this email as a ${BRAND.name} member.
        <a href="${unsubUrl}" style="color:${BRAND.textSecondary};text-decoration:underline;">Unsubscribe</a>
        &nbsp;&middot;&nbsp;
        <a href="${preferencesUrl({ e: ctx.recipient.email, r: ctx.recipient.id, c: ctx.campaignId ?? null })}" style="color:${BRAND.textSecondary};text-decoration:underline;">Manage preferences</a>
      </p>
      ${address ? `<p style="margin:0;font-size:12px;color:${BRAND.textMuted};line-height:1.6;">${address}</p>` : ''}
    </td>
  </tr>
</table>`;
}

/**
 * Rewrite in-content links → click tracker, and append the open pixel. Operates
 * on a document or a fragment depending on the source template shape.
 */
function injectTracking(html: string, ctx: MergeContext, asDocument: boolean): string {
  const $ = cheerio.load(html, null, asDocument);

  if (ctx.trackClicks) {
    $('a[href]').each((_i, el) => {
      const href = $(el).attr('href') || '';
      if ($(el).attr('data-ha-notrack') !== undefined) return;
      if (!shouldRewriteHref(href)) return;
      const withUtm = appendUtm(href, ctx.utm);
      $(el).attr('href', clickUrl({ r: ctx.recipient.id, c: ctx.campaignId ?? null, u: withUtm }));
    });
  } else if (ctx.utm) {
    // Even without click tracking, still stamp UTM params on links.
    $('a[href]').each((_i, el) => {
      const href = $(el).attr('href') || '';
      if (!shouldRewriteHref(href)) return;
      $(el).attr('href', appendUtm(href, ctx.utm));
    });
  }

  if (ctx.trackOpens) {
    const pixel = `<img src="${openPixelUrl(ctx.recipient.trackingToken)}" width="1" height="1" alt="" style="display:none;width:1px;height:1px;opacity:0;" />`;
    if (asDocument && $('body').length) {
      $('body').append(pixel);
    } else {
      $.root().append(pixel);
    }
  }

  return asDocument ? $.html() : $.root().html() || html;
}

/** Render a fully-merged, tracked, compliant email for one recipient. */
export function renderEmail(
  template: {
    subject: string;
    htmlBody: string;
    textBody?: string | null;
    preheader?: string | null;
    /** Reusable footer snippet attached to the template — rendered above the compliance footer. */
    footerSnippetHtml?: string | null;
  },
  ctx: MergeContext
): RenderedEmail {
  const vars = buildVars(ctx);
  const unsubUrl = vars['unsubscribe_url'];

  const subject = substitute(template.subject, vars);
  const preheader = substitute(ctx.preheader ?? template.preheader ?? '', vars) || undefined;
  let content = substitute(template.htmlBody, vars);

  const full = isFullDoc(content);

  // Template-attached reusable footer ({{tokens}} merge here too).
  const snippetFooter = template.footerSnippetHtml
    ? substitute(template.footerSnippetHtml, vars)
    : '';
  // Marketing mail must carry a visible unsubscribe + physical address.
  const footer = snippetFooter + (ctx.isMarketing ? complianceFooterHtml(unsubUrl, ctx) : '');

  let html: string;
  if (full) {
    // Full document: inject footer before </body>, then tracking on the doc.
    if (footer) {
      content = /<\/body>/i.test(content)
        ? content.replace(/<\/body>/i, `${footer}</body>`)
        : content + footer;
    }
    html = injectTracking(content, ctx, true);
  } else {
    // Content fragment: append footer, wrap in the branded layout, then track.
    const wrapped = emailLayout(content + footer, preheader);
    html = injectTracking(wrapped, ctx, true);
  }

  // Plain-text alternative (always present for deliverability).
  let text = template.textBody ? substitute(template.textBody, vars) : stripHtml(content);
  if (snippetFooter) text += `\n\n${stripHtml(snippetFooter)}`;
  if (ctx.isMarketing) {
    const addr = (ctx.footerAddress || '').trim();
    text += `\n\n—\nUnsubscribe: ${unsubUrl}${addr ? `\n${addr}` : ''}`;
  }

  return { subject, html, text, unsubscribeUrl: unsubUrl };
}
