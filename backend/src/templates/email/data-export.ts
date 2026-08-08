import type { EmailTemplate } from '../../types/notification-templates';
import {
  emailLayout,
  heading,
  subtitle,
  paragraph,
  greeting,
  signature,
  button,
  infoBox,
  warningBox,
  divider,
  iconCircle,
  smallText,
  BRAND,
} from './_layout';

// ===============================
// Data Export Email Templates
// ===============================

/**
 * User data (GDPR) export ready — sent with JSON attachment.
 */
export const userDataExportReady = (exportedAt: string): EmailTemplate => ({
  subject: 'Your Data Export — Hire Adda',
  html: emailLayout(
    `
        ${iconCircle('&#128230;', '#eef2ff')}
        ${heading('Your Data Export is Ready')}
        ${subtitle('All your personal data has been compiled.')}
        ${paragraph('Hi,')}
        ${paragraph("As requested, we've compiled all your personal data from Hire Adda. Your exported data is attached below as a JSON file.")}
        ${infoBox([
          { label: 'Export Type', value: 'Full Personal Data' },
          { label: 'Format', value: 'JSON' },
          { label: 'Exported At', value: exportedAt },
        ])}
        ${paragraph('This includes your profile information, saved jobs, notifications, consent records, devices, and activity logs.')}
        ${warningBox('If you did not request this export, please <a href="mailto:' + BRAND.supportEmail + '" style="color:#92400e;font-weight:600;">contact support</a> immediately.')}
        ${divider()}
        ${smallText('This export was generated in compliance with data portability regulations.')}
        ${signature()}
    `,
    'Your Hire Adda data export is ready.'
  ),
  text: `Your Data Export is Ready\n\nAs requested, we've compiled all your personal data from Hire Adda. The data is attached as a JSON file.\n\nExported at: ${exportedAt}\n\nIf you did not request this export, please contact support at ${BRAND.supportEmail}.`,
});

/**
 * Candidate export (employer-requested XLSX/CSV) ready for download.
 */
export const candidateExportReady = (
  firstName: string | null,
  candidateCount: number,
  format: string,
  downloadUrl: string,
  filename: string
): EmailTemplate => {
  const name = firstName || 'there';
  const formatLabel = format.toUpperCase();

  return {
    subject: 'Your Candidate Export is Ready',
    html: emailLayout(
      `
          ${iconCircle('&#128202;', '#ecfdf5')}
          ${heading('Your Candidate Export is Ready')}
          ${greeting(name)}
          ${paragraph(`Your export of <strong>${candidateCount} candidate${candidateCount === 1 ? '' : 's'}</strong> is now ready for download.`)}
          ${infoBox([
            { label: 'Candidates', value: candidateCount.toString() },
            { label: 'Format', value: formatLabel },
            { label: 'File', value: filename },
          ])}
          ${button(`Download ${formatLabel} File`, downloadUrl)}
          ${divider()}
          ${smallText('This link will expire in 7 days.')}
          ${signature()}
      `,
      `Your candidate export of ${candidateCount} candidates is ready.`
    ),
    text: `Hi ${name}, your export of ${candidateCount} candidate(s) is ready. Download the ${formatLabel} file: ${downloadUrl}\n\nThis link expires in 7 days. File: ${filename}`,
  };
};

/**
 * Resume ZIP export (employer-requested) ready for download.
 */
export const resumeExportReady = (
  firstName: string | null,
  resumeCount: number,
  skippedCount: number,
  downloadUrl: string,
  filename: string
): EmailTemplate => {
  const name = firstName || 'there';
  const skippedNote =
    skippedCount > 0
      ? `<br/>${skippedCount} candidate${skippedCount === 1 ? '' : 's'} had no resume on file and ${skippedCount === 1 ? 'was' : 'were'} skipped.`
      : '';

  return {
    subject: 'Your Resume Export is Ready',
    html: emailLayout(
      `
          ${iconCircle('&#128196;', '#ecfdf5')}
          ${heading('Your Resume Export is Ready')}
          ${greeting(name)}
          ${paragraph(`Your ZIP archive containing <strong>${resumeCount} resume${resumeCount === 1 ? '' : 's'}</strong> is ready for download.${skippedNote}`)}
          ${infoBox([
            { label: 'Resumes', value: resumeCount.toString() },
            ...(skippedCount > 0
              ? [{ label: 'Skipped (no resume)', value: skippedCount.toString() }]
              : []),
            { label: 'Format', value: 'ZIP' },
            { label: 'File', value: filename },
          ])}
          ${button('Download ZIP File', downloadUrl)}
          ${divider()}
          ${smallText('This link will expire in 7 days.')}
          ${signature()}
      `,
      `Your resume export of ${resumeCount} resumes is ready.`
    ),
    text: `Hi ${name}, your ZIP archive of ${resumeCount} resume(s) is ready. Download: ${downloadUrl}\n\n${skippedCount > 0 ? `${skippedCount} candidate(s) had no resume and were skipped.\n\n` : ''}This link expires in 7 days. File: ${filename}`,
  };
};
