import prisma from '../config/prisma';
import logger from '../config/logger';
import type { Role } from '@prisma/client';

/**
 * Per-channel welcome sends, fired as each channel is verified.
 *
 * Why this exists: the registration-time welcome (`handleUserRegistered` in the
 * Kafka consumer) can only reach channels that are ALREADY verified at signup.
 * For an email/password signup that's *none* (email is verified via OTP
 * afterward), and WhatsApp is basically never verified at signup (it's verified
 * later from settings). So each channel's welcome is (re)sent the moment that
 * channel becomes verified. Every function is fire-and-forget: it swallows its
 * own errors and never throws into the verification flow.
 */

type WelcomeEmailUser = {
  firstName: string | null;
  role: Role;
  email: string | null;
  isEmailVerified: boolean;
  companyProfile: { companyName: string | null } | null;
};

async function buildWelcomeEmail(
  user: WelcomeEmailUser
): Promise<{ to: string; subject: string; html: string; text: string } | null> {
  if (!user.isEmailVerified || !user.email) return null;
  if (user.role === 'EMPLOYER' && user.companyProfile?.companyName) {
    const { onboardingWelcomeEmployer } = await import('../templates/email/onboarding');
    const t = onboardingWelcomeEmployer(
      user.firstName || 'Hiring Manager',
      user.companyProfile.companyName
    );
    return { to: user.email, subject: t.subject, html: t.html, text: t.text };
  }
  const { welcomeEmail } = await import('../templates/email/auth');
  const t = welcomeEmail(user.firstName || 'there');
  return { to: user.email, subject: t.subject, html: t.html, text: t.text };
}

/** Send the welcome EMAIL once the user's email is verified (email/password signups). */
export async function sendWelcomeEmail(userId: string): Promise<void> {
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        firstName: true,
        role: true,
        email: true,
        isEmailVerified: true,
        companyProfile: { select: { companyName: true } },
      },
    });
    if (!user) return;
    const opts = await buildWelcomeEmail(user);
    if (!opts) return;
    const { emailQueue } = await import('../jobs/email.queue');
    await emailQueue.add('send-email', opts);
  } catch (err) {
    logger.error('Failed to send welcome email', err);
  }
}

/** Send the WhatsApp welcome once the user's WhatsApp is verified. */
export async function sendWelcomeWhatsapp(userId: string): Promise<void> {
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        firstName: true,
        isWhatsappVerified: true,
        whatsappNumber: true,
        mobileNumber: true,
      },
    });
    if (!user?.isWhatsappVerified) return;
    const to = user.whatsappNumber || user.mobileNumber;
    if (!to) return;
    const { welcomeWhatsapp } = await import('../templates/whatsapp');
    const { whatsappQueue } = await import('../jobs/whatsapp.queue');
    const tmpl = welcomeWhatsapp(user.firstName || 'there');
    await whatsappQueue.add('send-whatsapp', {
      to,
      templateName: tmpl.templateName,
      components: tmpl.components,
    });
  } catch (err) {
    logger.error('Failed to send WhatsApp welcome', err);
  }
}

// No welcome SMS. SMS is reserved for OTP / mobile verification only — the
// welcome message already goes out over email, WhatsApp and in-app, none of
// which cost per message.
