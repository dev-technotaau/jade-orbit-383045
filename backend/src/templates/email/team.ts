import type { EmailTemplate } from '../../types/notification-templates';
import {
  emailLayout,
  heading,
  subtitle,
  paragraph,
  greeting,
  signature,
  button,
  smallText,
  iconCircle,
} from './_layout';

/**
 * Ownership-transfer notification — sent to the new owner when the
 * previous owner hands over the company. The recipient is told their
 * privileges expanded so they don't get a surprise on next login.
 */
export const teamOwnershipTransferredEmail = (args: {
  recipientName?: string;
  companyName: string;
  previousOwnerName?: string;
  dashboardUrl: string;
}): EmailTemplate => ({
  subject: `You're now the owner of ${args.companyName} on Hire Adda`,
  html: emailLayout(`
    ${iconCircle('&#128081;', '#fef3c7')}
    ${heading(`You now own ${args.companyName}`)}
    ${subtitle('Ownership has been transferred to your account.')}
    ${greeting(args.recipientName ?? 'there')}
    ${paragraph(
      args.previousOwnerName
        ? `<strong>${args.previousOwnerName}</strong> has transferred ownership of <strong>${args.companyName}</strong> to you. You now control the company plan, billing and team membership.`
        : `Ownership of <strong>${args.companyName}</strong> has been transferred to you. You now control the company plan, billing and team membership.`
    )}
    ${paragraph('Your previous Admin seat (if any) is preserved — the previous owner has been demoted to Admin and keeps platform access. Plan benefits, quotas and invoices now bill to your account.')}
    ${button('Open dashboard', args.dashboardUrl)}
    ${smallText("If you didn't expect this transfer, contact our support team immediately.")}
    ${signature()}
  `),
  text: `You're now the owner of ${args.companyName} on Hire Adda. ${args.previousOwnerName ? `Transferred from ${args.previousOwnerName}.` : ''} Manage your team: ${args.dashboardUrl}`,
});

/**
 * Team-invite email — sent when a company owner adds a recruiter to
 * their EmployerTeamMember roster. Recipient clicks the button to
 * accept and is added to the company's plan pool.
 */
export const teamInviteEmail = (args: {
  recipientName?: string;
  companyName: string;
  inviterName?: string;
  role: 'OWNER' | 'ADMIN' | 'RECRUITER';
  acceptUrl: string;
  expiresInDays: number;
}): EmailTemplate => {
  const roleLabel = args.role === 'ADMIN' ? 'an Admin' : 'a Recruiter';
  const roleDesc =
    args.role === 'ADMIN'
      ? 'Admins can post jobs, manage applications, search candidates and invite teammates.'
      : 'Recruiters can post jobs, manage applications and search candidates.';

  return {
    subject: `You're invited to join ${args.companyName} on Hire Adda`,
    html: emailLayout(`
      ${iconCircle('&#128101;', '#eff6ff')}
      ${heading(`Join ${args.companyName} on Hire Adda`)}
      ${subtitle(`You've been invited as ${roleLabel}.`)}
      ${greeting(args.recipientName ?? 'there')}
      ${paragraph(
        args.inviterName
          ? `<strong>${args.inviterName}</strong> from <strong>${args.companyName}</strong> has invited you to join their recruiting team on Hire Adda.`
          : `<strong>${args.companyName}</strong> has invited you to join their recruiting team on Hire Adda.`
      )}
      ${paragraph(roleDesc)}
      ${button('Accept invitation', args.acceptUrl)}
      ${smallText(`This invitation expires in ${args.expiresInDays} days. If you didn't expect this email, you can safely ignore it.`)}
      ${signature()}
    `),
    text: `${args.companyName} has invited you to join their recruiting team on Hire Adda as ${roleLabel}. Accept: ${args.acceptUrl} (expires in ${args.expiresInDays} days)`,
  };
};
