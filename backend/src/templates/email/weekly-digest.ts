import type { EmailTemplate } from '../../types/notification-templates';
import {
  emailLayout,
  heading,
  subtitle,
  paragraph,
  greeting,
  signature,
  button,
  divider,
  iconCircle,
  smallText,
  BRAND,
} from './_layout';

// ===============================
// Weekly Digest Email Template
// ===============================

export interface WeeklyDigestStats {
  newApplications: number;
  activeJobs: number;
  interviewsScheduled: number;
  hires: number;
}

/**
 * Weekly hiring digest sent to employers.
 */
export const weeklyHiringDigest = (
  name: string,
  company: string,
  stats: WeeklyDigestStats
): EmailTemplate => {
  const rows = [
    { label: 'New Applications', value: stats.newApplications },
    { label: 'Active Job Postings', value: stats.activeJobs },
    { label: 'Interviews Scheduled', value: stats.interviewsScheduled },
    { label: 'New Hires', value: stats.hires },
  ];

  const statsTable = `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:20px 0;border-radius:10px;border:1px solid ${BRAND.border};overflow:hidden;">
      ${rows
        .map(
          (row, i) => `<tr>
        <td style="padding:14px 20px;${i < rows.length - 1 ? `border-bottom:1px solid ${BRAND.border};` : ''}background-color:${BRAND.bgMuted};">
          <span style="font-size:15px;font-weight:500;color:${BRAND.text};">${row.label}</span>
        </td>
        <td style="padding:14px 20px;text-align:right;${i < rows.length - 1 ? `border-bottom:1px solid ${BRAND.border};` : ''}background-color:${BRAND.bgMuted};">
          <span style="font-size:18px;font-weight:700;color:${BRAND.primary};">${row.value}</span>
        </td>
      </tr>`
        )
        .join('\n      ')}
    </table>`;

  const statsText = rows.map((r) => `${r.label}: ${r.value}`).join('\n');

  return {
    subject: `Your Weekly Hiring Digest — ${company}`,
    html: emailLayout(
      `
          ${iconCircle('&#128200;', '#eef2ff')}
          ${heading('Weekly Hiring Digest')}
          ${subtitle(`Here's your weekly summary for ${company}.`)}
          ${greeting(name)}
          ${paragraph("Here's a summary of your hiring activity for the past week:")}
          ${statsTable}
          ${button('View Full Analytics', `${BRAND.url}/employer/analytics`)}
          ${divider()}
          ${smallText('You can disable this digest in your <a href="' + BRAND.url + '/employer/settings" style="color:' + BRAND.textSecondary + ';text-decoration:underline;">notification settings</a>.')}
          ${signature()}
      `,
      `Weekly hiring digest for ${company}`
    ),
    text: `Weekly Hiring Digest — ${company}\n\nHi ${name}, here's your weekly summary:\n\n${statsText}\n\nView analytics: ${BRAND.url}/employer/analytics`,
  };
};
