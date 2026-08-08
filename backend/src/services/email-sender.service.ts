import dns from 'dns/promises';
import { prisma } from '../config/prisma';
import { AppError } from '../middleware/error';
import { Prisma } from '@prisma/client';
import { env } from '../config/env';
import logger from '../config/logger';

/**
 * A from-address / sending identity plus its deliverability posture
 * (SPF/DKIM/DMARC) and per-sender send caps. Analog of WaChannel. On a
 * self-hosted MTA these DNS records are the whole game — a campaign is blocked
 * when the sender's DKIM is unverified.
 */
export async function listSenders() {
  return prisma.emailSender.findMany({ orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }] });
}

export async function getSender(id: string) {
  const sender = await prisma.emailSender.findUnique({ where: { id } });
  if (!sender) throw new AppError('Sender not found', 404, 'EMAIL_SENDER_NOT_FOUND');
  return sender;
}

/**
 * The default sender for campaigns. Falls back to the first active sender, and
 * — if none exist — seeds one from the platform SMTP env so the system is
 * usable out of the box.
 */
export async function getDefaultSender() {
  const existing = await prisma.emailSender.findFirst({
    where: { isDefault: true, isActive: true },
  });
  if (existing) return existing;
  const anyActive = await prisma.emailSender.findFirst({ where: { isActive: true } });
  if (anyActive) return anyActive;

  const fromEmail = (env.EMAIL_FROM || '').toLowerCase().trim();
  if (!fromEmail) return null;
  const domain = fromEmail.split('@')[1] || 'hireadda.in';
  return prisma.emailSender.upsert({
    where: { fromEmail },
    update: {},
    create: {
      fromEmail,
      fromName: env.SMTP_FROM_NAME || 'Hire Adda',
      replyTo: env.EMAIL_REPLY_TO || null,
      domain,
      isDefault: true,
      isActive: true,
    },
  });
}

export async function createSender(input: {
  fromEmail: string;
  fromName: string;
  replyTo?: string | null;
  dkimSelector?: string | null;
  hourlyCap?: number | null;
  dailyCap?: number | null;
  isDefault?: boolean;
  createdBy?: string | null;
}) {
  const fromEmail = input.fromEmail.toLowerCase().trim();
  const domain = fromEmail.split('@')[1];
  if (!domain) throw new AppError('A valid from-address is required', 400, 'EMAIL_SENDER_INVALID');

  return prisma.$transaction(async (tx) => {
    if (input.isDefault) {
      await tx.emailSender.updateMany({ data: { isDefault: false } });
    }
    return tx.emailSender.create({
      data: {
        fromEmail,
        fromName: input.fromName,
        domain,
        replyTo: input.replyTo ?? null,
        dkimSelector: input.dkimSelector ?? null,
        hourlyCap: input.hourlyCap ?? null,
        dailyCap: input.dailyCap ?? null,
        isDefault: input.isDefault ?? false,
        createdBy: input.createdBy ?? null,
      },
    });
  });
}

export async function updateSender(
  id: string,
  patch: {
    fromName?: string;
    replyTo?: string | null;
    dkimSelector?: string | null;
    hourlyCap?: number | null;
    dailyCap?: number | null;
    warmupDay?: number;
    isDefault?: boolean;
    isActive?: boolean;
  }
) {
  return prisma.$transaction(async (tx) => {
    if (patch.isDefault) {
      await tx.emailSender.updateMany({ where: { NOT: { id } }, data: { isDefault: false } });
    }
    try {
      return await tx.emailSender.update({
        where: { id },
        data: patch as Prisma.EmailSenderUpdateInput,
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
        throw new AppError('Sender not found', 404, 'EMAIL_SENDER_NOT_FOUND');
      }
      throw err;
    }
  });
}

export async function deleteSender(id: string) {
  try {
    return await prisma.emailSender.delete({ where: { id } });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
      throw new AppError('Sender not found', 404, 'EMAIL_SENDER_NOT_FOUND');
    }
    throw err;
  }
}

const flatTxt = async (name: string): Promise<string[]> => {
  try {
    const records = await dns.resolveTxt(name);
    return records.map((chunks) => chunks.join(''));
  } catch {
    return [];
  }
};

/**
 * Verify SPF / DKIM / DMARC for a sender's domain by resolving TXT records.
 * Best-effort (any resolver failure => that check is `false`). Persists the
 * flags + a coarse reputation score and returns the detail for the dashboard.
 */
export async function verifySenderDns(id: string) {
  const sender = await getSender(id);
  const domain = sender.domain;

  const [spfTxt, dmarcTxt, mtaStsTxt, tlsRptTxt] = await Promise.all([
    flatTxt(domain),
    flatTxt(`_dmarc.${domain}`),
    flatTxt(`_mta-sts.${domain}`),
    flatTxt(`_smtp._tls.${domain}`),
  ]);

  const spfVerified = spfTxt.some((t) => /v=spf1/i.test(t));
  const dmarcRecord = dmarcTxt.find((t) => /v=DMARC1/i.test(t)) || null;
  const dmarcVerified = !!dmarcRecord;
  const mtaStsVerified = mtaStsTxt.some((t) => /v=STSv1/i.test(t));
  const tlsRptVerified = tlsRptTxt.some((t) => /v=TLSRPTv1/i.test(t));

  let dkimVerified = false;
  let dkimDetail: string | null = null;
  if (sender.dkimSelector) {
    const dkimTxt = await flatTxt(`${sender.dkimSelector}._domainkey.${domain}`);
    dkimVerified = dkimTxt.some((t) => /(v=DKIM1|k=rsa|p=)/i.test(t));
    dkimDetail = dkimTxt[0] || null;
  }

  const score = (spfVerified ? 34 : 0) + (dkimVerified ? 40 : 0) + (dmarcVerified ? 26 : 0);

  const updated = await prisma.emailSender.update({
    where: { id },
    data: {
      spfVerified,
      dkimVerified,
      dmarcVerified,
      mtaStsVerified,
      tlsRptVerified,
      reputationScore: score,
      lastVerifiedAt: new Date(),
    },
  });

  logger.info(
    `Email sender DNS verify ${domain}: spf=${spfVerified} dkim=${dkimVerified} dmarc=${dmarcVerified} mta-sts=${mtaStsVerified} tls-rpt=${tlsRptVerified}`
  );

  return {
    sender: updated,
    detail: {
      spf: { verified: spfVerified, records: spfTxt },
      dkim: { verified: dkimVerified, selector: sender.dkimSelector, record: dkimDetail },
      dmarc: { verified: dmarcVerified, record: dmarcRecord },
      mtaSts: { verified: mtaStsVerified, record: mtaStsTxt[0] ?? null },
      tlsRpt: { verified: tlsRptVerified, record: tlsRptTxt[0] ?? null },
      score,
    },
  };
}

/**
 * A campaign can only launch from a sender whose DKIM is verified (self-hosted
 * MTA reputation guard). Returns a human-readable blocker or null when clear.
 */
export function senderSendBlocker(sender: {
  dkimVerified: boolean;
  isActive: boolean;
}): string | null {
  if (!sender.isActive) return 'Sender is inactive';
  if (!sender.dkimVerified) {
    return 'Sender DKIM is not verified — verify DNS before sending a campaign';
  }
  return null;
}
