import type { EmailTemplate } from '../../types/notification-templates';
import {
  emailLayout,
  heading,
  subtitle,
  paragraph,
  greeting,
  signature,
  smallText,
  iconCircle,
} from './_layout';

interface MatchedProfileRow {
  candidateName: string;
  candidateHeadline: string | null;
  candidateExperience: string | null;
  candidateLocation: string | null;
  resumeUrl: string | null;
  notes: string | null;
}

const profileCard = (p: MatchedProfileRow): string => {
  const meta = [p.candidateHeadline, p.candidateExperience, p.candidateLocation]
    .filter(Boolean)
    .join(' · ');
  const downloadLink = p.resumeUrl
    ? `<p style="margin:8px 0 0 0;"><a href="${p.resumeUrl}" style="color:#2563EB;text-decoration:none;font-weight:600;">→ Download CV</a></p>`
    : '';
  const notes = p.notes
    ? `<p style="margin:6px 0 0 0;font-size:13px;color:#4b5563;font-style:italic;">${p.notes}</p>`
    : '';
  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:14px 0;">
      <tr>
        <td style="padding:14px 18px;background-color:#f8fafc;border-radius:10px;border-left:4px solid #10B981;">
          <p style="margin:0;font-size:15px;color:#0F172A;font-weight:700;">${p.candidateName}</p>
          ${meta ? `<p style="margin:4px 0 0 0;font-size:13px;color:#475569;">${meta}</p>` : ''}
          ${notes}
          ${downloadLink}
        </td>
      </tr>
    </table>`;
};

/**
 * Assisted Hiring delivery email — sent to the employer when the admin
 * team has curated matched CVs and clicked "Deliver". Lists each profile
 * inline with a download link to the resume.
 */
export const assistedHiringDeliveryEmail = (args: {
  recipientName?: string;
  roleTitle: string;
  profiles: MatchedProfileRow[];
  customMessage?: string;
}): EmailTemplate => {
  const cards = args.profiles.map(profileCard).join('\n');
  return {
    subject: `${args.profiles.length} matching candidate${args.profiles.length === 1 ? '' : 's'} for ${args.roleTitle}`,
    html: emailLayout(`
      ${iconCircle('&#128279;', '#ecfdf5')}
      ${heading('Your matched candidates are ready')}
      ${subtitle(`${args.profiles.length} profile${args.profiles.length === 1 ? '' : 's'} sourced for ${args.roleTitle}.`)}
      ${greeting(args.recipientName ?? 'there')}
      ${args.customMessage ? paragraph(args.customMessage) : paragraph('Our team has reviewed your requirement and curated the following candidates. Reach out to them directly using the contact details on each CV.')}
      ${cards}
      ${smallText("Reply to this email if you'd like our team to source more profiles or refine the brief.")}
      ${signature()}
    `),
    text:
      `Your ${args.profiles.length} matching candidate(s) for ${args.roleTitle}:\n\n` +
      args.profiles
        .map(
          (p) =>
            `• ${p.candidateName}${p.candidateHeadline ? ` — ${p.candidateHeadline}` : ''}${p.resumeUrl ? `\n  CV: ${p.resumeUrl}` : ''}`
        )
        .join('\n\n'),
  };
};
