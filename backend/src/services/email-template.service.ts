import { prisma } from '../config/prisma';
import { AppError } from '../middleware/error';
import type { EmailTemplateCategory, EmailTemplateStatus } from '@prisma/client';
import { Prisma } from '@prisma/client';
import { renderEmail } from './email-merge.service';
import { getEmailSettings } from './email-settings.service';
import { getDefaultSender } from './email-sender.service';
import { sendRawEmail } from './email.service';
import { normalizeEmail, isValidEmail } from './email-contact.service';

/** Pull `{{var}}` tokens out of subject + body so the builder can list them. */
export function extractTemplateVariables(...parts: (string | null | undefined)[]): string[] {
  const re = /\{\{\s*([\w.]+)\s*\}\}/g;
  const found = new Set<string>();
  for (const part of parts) {
    if (!part) continue;
    let m: RegExpExecArray | null;
    while ((m = re.exec(part)) !== null) found.add(m[1].toLowerCase());
  }
  // Built-ins the merge engine always provides — not authored variables.
  ['email', 'name', 'first_name', 'unsubscribe_url', 'brand_name', 'year'].forEach((b) =>
    found.delete(b)
  );
  return Array.from(found);
}

export async function listTemplates(opts: {
  q?: string;
  category?: EmailTemplateCategory;
  status?: EmailTemplateStatus;
}) {
  const where: Prisma.EmailTemplateWhereInput = {};
  if (opts.q) {
    where.OR = [
      { name: { contains: opts.q, mode: 'insensitive' } },
      { subject: { contains: opts.q, mode: 'insensitive' } },
    ];
  }
  if (opts.category) where.category = opts.category;
  if (opts.status) where.status = opts.status;
  return prisma.emailTemplate.findMany({ where, orderBy: { updatedAt: 'desc' } });
}

export async function getTemplate(id: string) {
  const tpl = await prisma.emailTemplate.findUnique({ where: { id } });
  if (!tpl) throw new AppError('Template not found', 404, 'EMAIL_TEMPLATE_NOT_FOUND');
  return tpl;
}

export async function createTemplate(input: {
  name: string;
  subject: string;
  htmlBody: string;
  textBody?: string | null;
  preheader?: string | null;
  category?: EmailTemplateCategory;
  status?: EmailTemplateStatus;
  variables?: Prisma.InputJsonValue;
  variableSample?: Prisma.InputJsonValue;
  footerSnippetId?: string | null;
  createdBy?: string | null;
}) {
  const detected = extractTemplateVariables(input.subject, input.htmlBody, input.textBody);
  return prisma.emailTemplate.create({
    data: {
      name: input.name,
      subject: input.subject,
      htmlBody: input.htmlBody,
      textBody: input.textBody ?? null,
      preheader: input.preheader ?? null,
      category: input.category ?? 'MARKETING',
      status: input.status ?? 'DRAFT',
      variables:
        input.variables ??
        (detected.map((key) => ({ key, label: key, required: false })) as Prisma.InputJsonValue),
      variableSample: input.variableSample,
      footerSnippetId: input.footerSnippetId ?? null,
      createdBy: input.createdBy ?? null,
    },
  });
}

/** Resolve a footer snippet's HTML (helper for preview/test render). */
async function footerHtmlFor(footerSnippetId?: string | null): Promise<string | null> {
  if (!footerSnippetId) return null;
  const snippet = await prisma.emailSnippet
    .findUnique({ where: { id: footerSnippetId }, select: { html: true } })
    .catch(() => null);
  return snippet?.html ?? null;
}

export async function updateTemplate(id: string, patch: Record<string, unknown>) {
  const current = await prisma.emailTemplate.findUnique({ where: { id } });
  if (!current) throw new AppError('Template not found', 404, 'EMAIL_TEMPLATE_NOT_FOUND');

  const data: Record<string, unknown> = { ...patch };
  const contentChanged =
    typeof patch.subject === 'string' ||
    typeof patch.htmlBody === 'string' ||
    typeof patch.textBody === 'string' ||
    typeof patch.preheader === 'string';

  if (
    (typeof patch.subject === 'string' || typeof patch.htmlBody === 'string') &&
    patch.variables === undefined
  ) {
    data.variables = extractTemplateVariables(
      (patch.subject as string) ?? current.subject,
      (patch.htmlBody as string) ?? current.htmlBody,
      (patch.textBody as string) ?? current.textBody
    ).map((key) => ({ key, label: key, required: false }));
  }

  // Snapshot the current content as a version before overwriting (revision history).
  if (contentChanged) {
    await prisma.emailTemplateVersion
      .create({
        data: {
          templateId: id,
          version: current.version,
          subject: current.subject,
          preheader: current.preheader,
          htmlBody: current.htmlBody,
          textBody: current.textBody,
          createdBy: (patch.updatedBy as string) ?? current.createdBy,
        },
      })
      .catch(() => {});
    data.version = current.version + 1;
    // Cap revision history at the most recent 20 snapshots per template.
    await prisma.emailTemplateVersion
      .deleteMany({ where: { templateId: id, version: { lt: current.version - 19 } } })
      .catch(() => {});
  }
  delete data.updatedBy;

  return prisma.emailTemplate.update({
    where: { id },
    data: data as Prisma.EmailTemplateUpdateInput,
  });
}

export async function deleteTemplate(id: string) {
  try {
    return await prisma.emailTemplate.delete({ where: { id } });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
      throw new AppError('Template not found', 404, 'EMAIL_TEMPLATE_NOT_FOUND');
    }
    throw err;
  }
}

/** Deep-copy a template as a fresh DRAFT ("Clone"). */
export async function duplicateTemplate(id: string, createdBy?: string | null) {
  const src = await getTemplate(id);
  return prisma.emailTemplate.create({
    data: {
      name: `${src.name} (copy)`,
      subject: src.subject,
      preheader: src.preheader,
      htmlBody: src.htmlBody,
      textBody: src.textBody,
      category: src.category,
      status: 'DRAFT',
      variables: src.variables ?? undefined,
      variableSample: src.variableSample ?? undefined,
      footerSnippetId: src.footerSnippetId ?? null,
      createdBy: createdBy ?? null,
    },
  });
}

// ---- Bulk operations ---------------------------------------------------------

/** Bulk delete templates. Per-id so a template still referenced by a campaign
 * (FK) fails alone instead of aborting the whole batch. */
export async function bulkDeleteTemplates(
  ids: string[]
): Promise<{ deleted: number; errors: Array<{ id: string; error: string }> }> {
  const errors: Array<{ id: string; error: string }> = [];
  let deleted = 0;
  for (const id of [...new Set(ids)]) {
    try {
      await deleteTemplate(id);
      deleted++;
    } catch (e) {
      errors.push({ id, error: (e as Error).message });
    }
  }
  return { deleted, errors };
}

/** Bulk status change (DRAFT / ACTIVE / ARCHIVED) across selected templates. */
export async function bulkUpdateTemplateStatus(
  ids: string[],
  status: EmailTemplateStatus
): Promise<{ updated: number }> {
  const res = await prisma.emailTemplate.updateMany({
    where: { id: { in: ids } },
    data: { status },
  });
  return { updated: res.count };
}

/** Bulk clone the selected templates (each into a fresh DRAFT copy). */
export async function bulkDuplicateTemplates(
  ids: string[],
  createdBy?: string | null
): Promise<{ created: number; errors: Array<{ id: string; error: string }> }> {
  const errors: Array<{ id: string; error: string }> = [];
  let created = 0;
  for (const id of [...new Set(ids)]) {
    try {
      await duplicateTemplate(id, createdBy);
      created++;
    } catch (e) {
      errors.push({ id, error: (e as Error).message });
    }
  }
  return { created, errors };
}

/** List a template's revision history (newest first). */
export async function listTemplateVersions(templateId: string) {
  return prisma.emailTemplateVersion.findMany({
    where: { templateId },
    orderBy: { version: 'desc' },
    take: 50,
  });
}

/** Restore a prior version's content onto the live template (snapshots current first). */
export async function restoreTemplateVersion(
  templateId: string,
  version: number,
  createdBy?: string | null
) {
  const v = await prisma.emailTemplateVersion.findUnique({
    where: { templateId_version: { templateId, version } },
  });
  if (!v) throw new AppError('Version not found', 404, 'EMAIL_TEMPLATE_VERSION_NOT_FOUND');
  return updateTemplate(templateId, {
    subject: v.subject,
    preheader: v.preheader,
    htmlBody: v.htmlBody,
    textBody: v.textBody,
    updatedBy: createdBy,
  });
}

/** Naive HTML → plain-text (for the "generate plain-text" builder action). */
export function htmlToPlainText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<\/(p|div|tr|h[1-6]|li)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<a[^>]*href=["']([^"']+)["'][^>]*>(.*?)<\/a>/gi, '$2 ($1)')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

const SPAM_WORDS = [
  'free',
  'guarantee',
  'winner',
  'congratulations',
  'urgent',
  'act now',
  'limited time',
  'click here',
  'buy now',
  'cash',
  'cheap',
  'credit',
  'discount',
  'earn money',
  'no cost',
  'risk-free',
  'satisfaction',
  'viagra',
  '100%',
  '$$$',
  'increase sales',
  'double your',
];

/**
 * Lint a template for common deliverability/spam issues → warnings surfaced in
 * the builder before save/test. Heuristic, non-blocking.
 */
export function lintTemplate(input: {
  subject: string;
  htmlBody: string;
  textBody?: string | null;
}): {
  warnings: string[];
  score: number;
} {
  const warnings: string[] = [];
  const subject = input.subject || '';
  const html = input.htmlBody || '';
  const text = html.replace(/<[^>]+>/g, ' ');

  if (!subject.trim()) warnings.push('Subject is empty.');
  if (subject.length > 90)
    warnings.push(`Subject is long (${subject.length} chars) — aim for < 60.`);
  if (/[A-Z]{6,}/.test(subject)) warnings.push('Subject contains ALL-CAPS words — a spam trigger.');
  if ((subject.match(/!/g) || []).length > 1)
    warnings.push('Subject has multiple exclamation marks.');

  const hay = `${subject} ${text}`.toLowerCase();
  const hits = SPAM_WORDS.filter((w) => hay.includes(w));
  if (hits.length) warnings.push(`Possible spam-trigger words: ${hits.slice(0, 8).join(', ')}.`);

  const imgs = (html.match(/<img/gi) || []).length;
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  if (imgs > 0 && words < imgs * 20)
    warnings.push('High image-to-text ratio — add more body text.');
  if (imgs > 0 && !/<img[^>]*alt=/i.test(html)) warnings.push('Some images are missing alt text.');
  if (html.length > 102_400) warnings.push('HTML is over 100KB — Gmail will clip it.');
  if (!/unsubscribe|\{\{\s*unsubscribe_url\s*\}\}/i.test(html)) {
    warnings.push(
      'No visible unsubscribe reference (the footer adds one for marketing, but consider a top link).'
    );
  }
  const shorteners = /\b(bit\.ly|tinyurl\.com|goo\.gl|t\.co|ow\.ly)\b/i;
  if (shorteners.test(html)) warnings.push('URL shorteners hurt deliverability — use full links.');

  const score = Math.max(0, 100 - warnings.length * 12);
  return { warnings, score };
}

/**
 * Render a template with sample variables for the live preview. Tracking is
 * disabled (no pixel/link rewrite) so a preview never fires analytics events.
 */
export async function previewTemplate(
  source: {
    subject: string;
    htmlBody: string;
    textBody?: string | null;
    preheader?: string | null;
    footerSnippetId?: string | null;
  },
  sampleVars: Record<string, unknown> = {},
  opts: { category?: EmailTemplateCategory; to?: string } = {}
) {
  const settings = await getEmailSettings();
  const isMarketing = (opts.category ?? 'MARKETING') !== 'TRANSACTIONAL';
  const footerSnippetHtml = await footerHtmlFor(source.footerSnippetId);
  const rendered = renderEmail(
    { ...source, footerSnippetHtml },
    {
      recipient: {
        id: 'preview',
        trackingToken: 'preview',
        email: normalizeEmail(opts.to || 'preview@hireadda.in'),
      },
      variables: sampleVars,
      contactName: (sampleVars.name as string) || 'Alex Sharma',
      isMarketing,
      trackOpens: false,
      trackClicks: false,
      footerAddress: settings.footerAddress,
      footerHtml: settings.footerHtml,
    }
  );
  return rendered;
}

/** Send a one-off test of a template to an admin address (no campaign, no tracking). */
export async function testSendTemplate(
  source: {
    subject: string;
    htmlBody: string;
    textBody?: string | null;
    preheader?: string | null;
    category?: EmailTemplateCategory;
    footerSnippetId?: string | null;
  },
  to: string,
  sampleVars: Record<string, unknown> = {}
) {
  const target = normalizeEmail(to);
  if (!isValidEmail(target))
    throw new AppError('A valid test email is required', 400, 'EMAIL_INVALID');
  const sender = await getDefaultSender();
  if (!sender) throw new AppError('No sending identity configured', 400, 'EMAIL_NO_SENDER');

  const rendered = await previewTemplate(source, sampleVars, {
    category: source.category,
    to: target,
  });
  await sendRawEmail({
    fromName: sender.fromName,
    fromEmail: sender.fromEmail,
    replyTo: sender.replyTo || undefined,
    to: target,
    subject: `[TEST] ${rendered.subject}`,
    html: rendered.html,
    text: rendered.text,
    headers: { 'X-HA-Test': '1', Precedence: 'bulk' },
  });
  return { sent: true, to: target };
}
