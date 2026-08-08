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
  successBox,
  divider,
  iconCircle,
  smallText,
  BRAND,
} from './_layout';

export const jobApplicationReceived = (
  candidateName: string,
  jobTitle: string,
  companyName: string
): EmailTemplate => ({
  subject: `Application Confirmed: ${jobTitle} at ${companyName}`,
  html: emailLayout(
    `
        ${iconCircle('&#9989;', BRAND.successLight)}
        ${heading('Application Submitted')}
        ${subtitle(`Your application for ${jobTitle} has been received.`)}
        ${greeting(candidateName)}
        ${paragraph(`We're pleased to confirm that your application for the <strong>${jobTitle}</strong> position at <strong>${companyName}</strong> has been successfully submitted.`)}
        ${infoBox([
          { label: 'Position', value: jobTitle },
          { label: 'Company', value: companyName },
          { label: 'Status', value: 'Under Review' },
        ])}
        ${paragraph('The hiring team will review your profile and get back to you. In the meantime, you can track your application status from your dashboard.')}
        ${button('Track Application', `${BRAND.url}/candidate/applications`)}
        ${divider()}
        ${smallText('Tip: Keep your profile updated to increase your chances. Candidates with complete profiles are 3x more likely to get shortlisted.')}
        ${signature()}
    `,
    `Your application for ${jobTitle} at ${companyName} has been received.`
  ),
  text: `Hi ${candidateName}, your application for ${jobTitle} at ${companyName} has been received. Track your application at ${BRAND.url}/candidate/applications`,
});

export const newApplicationForEmployer = (
  employerName: string,
  candidateName: string,
  jobTitle: string,
  applicationLink: string
): EmailTemplate => ({
  subject: `New Application: ${candidateName} applied for ${jobTitle}`,
  html: emailLayout(
    `
        ${iconCircle('&#128196;', '#eef2ff')}
        ${heading('New Application Received')}
        ${subtitle(`${candidateName} has applied for your open position.`)}
        ${greeting(employerName)}
        ${paragraph(`You've received a new application for the <strong>${jobTitle}</strong> position.`)}
        ${infoBox([
          { label: 'Candidate', value: candidateName },
          { label: 'Position', value: jobTitle },
          {
            label: 'Applied',
            value: new Date().toLocaleDateString('en-US', {
              year: 'numeric',
              month: 'long',
              day: 'numeric',
            }),
          },
        ])}
        ${paragraph("Review the candidate's profile and resume to determine the next steps.")}
        ${button('Review Application', applicationLink)}
        ${signature()}
    `,
    `New application from ${candidateName} for ${jobTitle}`
  ),
  text: `Hi ${employerName}, ${candidateName} has applied for ${jobTitle}. Review the application: ${applicationLink}`,
});

export const interviewScheduled = (
  candidateName: string,
  jobTitle: string,
  date: string,
  meetLink: string
): EmailTemplate => ({
  subject: `Interview Scheduled: ${jobTitle}`,
  html: emailLayout(
    `
        ${iconCircle('&#128197;', '#eef2ff')}
        ${heading('Interview Scheduled')}
        ${subtitle("You've been invited to an interview!")}
        ${greeting(candidateName)}
        ${paragraph(`Congratulations! The hiring team for the <strong>${jobTitle}</strong> role would like to schedule an interview with you.`)}
        ${infoBox([
          { label: 'Position', value: jobTitle },
          { label: 'Date & Time', value: date },
          { label: 'Format', value: 'Video Call' },
        ])}
        ${successBox('Please join the meeting 5 minutes before the scheduled time. Ensure your camera and microphone are working properly.')}
        ${button('Join Interview', meetLink)}
        ${divider()}
        ${smallText("If the button above doesn't work, copy and paste this link into your browser:")}
        ${smallText(`<a href="${meetLink}" style="color:${BRAND.primary};word-break:break-all;">${meetLink}</a>`)}
        ${paragraph('Need to reschedule? Please respond to this email as soon as possible.')}
        ${signature()}
    `,
    `Interview scheduled for ${jobTitle} on ${date}`
  ),
  text: `Hi ${candidateName}, your interview for ${jobTitle} is scheduled on ${date}. Join here: ${meetLink}. Please be ready 5 minutes early.`,
});

export const jobOfferReceived = (
  candidateName: string,
  jobTitle: string,
  companyName: string,
  offerLink: string
): EmailTemplate => ({
  subject: `Congratulations! Job Offer from ${companyName}`,
  html: emailLayout(
    `
        ${iconCircle('&#127881;', '#ecfdf5')}
        ${heading("You've Received a Job Offer!")}
        ${subtitle(`${companyName} wants you on their team.`)}
        ${greeting(candidateName)}
        ${paragraph(`We're excited to let you know that <strong>${companyName}</strong> has extended an offer for the <strong>${jobTitle}</strong> position!`)}
        ${infoBox([
          { label: 'Position', value: jobTitle },
          { label: 'Company', value: companyName },
          { label: 'Status', value: 'Offer Extended' },
        ])}
        ${paragraph('Please review the offer details carefully. You can accept, negotiate, or discuss the offer through the platform.')}
        ${button('View Offer Details', offerLink, BRAND.success)}
        ${divider()}
        ${smallText('This is a significant milestone in your career journey. Take the time you need to make the right decision.')}
        ${signature()}
    `,
    `Congratulations! ${companyName} has extended a job offer for ${jobTitle}.`
  ),
  text: `Congratulations ${candidateName}! You've received a job offer for ${jobTitle} at ${companyName}. View the offer: ${offerLink}`,
});

export const jobRejection = (
  candidateName: string,
  jobTitle: string,
  companyName: string
): EmailTemplate => ({
  subject: `Application Update: ${jobTitle} at ${companyName}`,
  html: emailLayout(
    `
        ${heading('Application Update')}
        ${greeting(candidateName)}
        ${paragraph(`Thank you for your interest in the <strong>${jobTitle}</strong> position at <strong>${companyName}</strong> and for the time you invested in the application process.`)}
        ${paragraph('After careful review, the hiring team has decided to move forward with other candidates whose experience more closely aligns with their current requirements.')}
        ${paragraph('This decision does not diminish the value of your skills and experience. The right opportunity is out there, and we encourage you to keep exploring.')}
        ${divider()}
        ${paragraph('Here are some ways to strengthen your next application:')}
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 16px 0;">
          <tr>
            <td style="padding:8px 0;font-size:15px;color:#374151;line-height:1.7;">
              &bull;&nbsp;&nbsp;Update your profile with recent achievements<br>
              &bull;&nbsp;&nbsp;Tailor your resume for each position<br>
              &bull;&nbsp;&nbsp;Build relevant skills through certifications
            </td>
          </tr>
        </table>
        ${button('Explore More Jobs', `${BRAND.url}/jobs`)}
        ${signature()}
    `,
    `Update on your application for ${jobTitle} at ${companyName}`
  ),
  text: `Hi ${candidateName}, thank you for applying to ${jobTitle} at ${companyName}. Unfortunately, they've decided to move forward with other candidates. Keep exploring new opportunities at ${BRAND.url}/jobs`,
});

export const applicationStatusUpdate = (
  candidateName: string,
  jobTitle: string,
  companyName: string,
  status: string
): EmailTemplate => {
  const statusConfig: Record<string, { emoji: string; bg: string; message: string }> = {
    shortlisted: {
      emoji: '&#11088;',
      bg: '#fffbeb',
      message:
        'Your application has been shortlisted! The hiring team is impressed with your profile.',
    },
    selected: {
      emoji: '&#127942;',
      bg: '#ecfdf5',
      message: 'You have been selected! The hiring team wants to move forward with your candidacy.',
    },
    reviewing: {
      emoji: '&#128269;',
      bg: '#eef2ff',
      message: 'Your application is currently being reviewed by the hiring team.',
    },
    interview: {
      emoji: '&#128197;',
      bg: '#ecfdf5',
      message: "You've been selected for an interview. Details will follow shortly.",
    },
    offered: {
      emoji: '&#127881;',
      bg: '#ecfdf5',
      message: 'An offer has been extended to you. Check your dashboard for details.',
    },
    rejected: {
      emoji: '&#128220;',
      bg: '#f9fafb',
      message: 'The hiring team has decided to proceed with other candidates.',
    },
    withdrawn: {
      emoji: '&#128221;',
      bg: '#f9fafb',
      message: 'Your application has been withdrawn as requested.',
    },
  };

  const config = statusConfig[status.toLowerCase()] || {
    emoji: '&#128220;',
    bg: '#f9fafb',
    message: `Your application status has been updated to: ${status}`,
  };

  return {
    subject: `Application Update: ${jobTitle} — ${status.charAt(0).toUpperCase() + status.slice(1)}`,
    html: emailLayout(
      `
            ${iconCircle(config.emoji, config.bg)}
            ${heading('Application Status Update')}
            ${subtitle(`${jobTitle} at ${companyName}`)}
            ${greeting(candidateName)}
            ${paragraph(config.message)}
            ${infoBox([
              { label: 'Position', value: jobTitle },
              { label: 'Company', value: companyName },
              { label: 'New Status', value: status.charAt(0).toUpperCase() + status.slice(1) },
            ])}
            ${button('View Application', `${BRAND.url}/candidate/applications`)}
            ${signature()}
        `,
      `Your application for ${jobTitle} at ${companyName} has been updated to ${status}.`
    ),
    text: `Hi ${candidateName}, your application for ${jobTitle} at ${companyName} has been updated to: ${status}. View details at ${BRAND.url}/candidate/applications`,
  };
};

export const jobPostedConfirmation = (
  employerName: string,
  jobTitle: string,
  jobId: string
): EmailTemplate => ({
  subject: `Job Posted: ${jobTitle} — Hire Adda`,
  html: emailLayout(
    `
        ${iconCircle('&#9989;', BRAND.successLight)}
        ${heading('Job Posted Successfully')}
        ${greeting(employerName)}
        ${paragraph(`Your job posting <strong>${jobTitle}</strong> is now live on Hire Adda.`)}
        ${successBox('Candidates can now discover and apply for this position.')}
        ${paragraph("You'll receive notifications when candidates apply. You can manage your listing at any time from your dashboard.")}
        ${button('View Job Listing', `${BRAND.url}/employer/jobs/${jobId}`)}
        ${signature()}
    `,
    `Your job posting "${jobTitle}" is now live on Hire Adda.`
  ),
  text: `Hi ${employerName}, your job posting "${jobTitle}" is now live on Hire Adda. You'll receive notifications when candidates apply. View it at ${BRAND.url}/employer/jobs/${jobId}`,
});

export const jobClosedNotification = (
  candidateName: string,
  jobTitle: string,
  companyName: string
): EmailTemplate => ({
  subject: `Position Closed: ${jobTitle} at ${companyName}`,
  html: emailLayout(
    `
        ${iconCircle('&#128276;', BRAND.warningLight)}
        ${heading('Position Closed')}
        ${greeting(candidateName)}
        ${paragraph(`The <strong>${jobTitle}</strong> position at <strong>${companyName}</strong> that you applied for has been closed by the employer.`)}
        ${paragraph("Don't worry — we're constantly finding new opportunities that match your profile. Keep your profile updated to receive the best matches.")}
        ${button('Browse Similar Jobs', `${BRAND.url}/candidate/jobs`)}
        ${divider()}
        ${smallText("You're receiving this because you applied for this position.")}
        ${signature()}
    `,
    `The ${jobTitle} position at ${companyName} has been closed.`
  ),
  text: `Hi ${candidateName}, the ${jobTitle} position at ${companyName} that you applied for has been closed. Browse similar jobs at ${BRAND.url}/candidate/jobs`,
});

export const jobMatchFound = (
  candidateName: string,
  jobTitle: string,
  companyName: string,
  jobId: string,
  matchScore: number
): EmailTemplate => {
  const scorePercent = Math.round(matchScore * 100);
  return {
    subject: `New Job Match: ${jobTitle} at ${companyName}`,
    html: emailLayout(
      `
            ${iconCircle('&#127919;', '#eef2ff')}
            ${heading('New Job Match')}
            ${subtitle(`We found a role that fits your profile.`)}
            ${greeting(candidateName)}
            ${paragraph(`The position <strong>${jobTitle}</strong> at <strong>${companyName}</strong> matches your profile.`)}
            ${infoBox([
              { label: 'Position', value: jobTitle },
              { label: 'Company', value: companyName },
              { label: 'Match Score', value: `${scorePercent}%` },
            ])}
            ${paragraph("This match is based on your skills, experience, and preferences. Review the job details to see if it's right for you.")}
            ${button('View Job Details', `${BRAND.url}/candidate/jobs/${jobId}`)}
            ${divider()}
            ${smallText('You\'re receiving this because your profile matches this job. <a href="' + BRAND.url + '/candidate/settings" style="color:' + BRAND.textSecondary + ';text-decoration:underline;">Manage notifications</a>')}
            ${signature()}
        `,
      `New job match: ${jobTitle} at ${companyName} (${scorePercent}% match)`
    ),
    text: `Hi ${candidateName}, ${jobTitle} at ${companyName} matches your profile (${scorePercent}% match). View details: ${BRAND.url}/candidate/jobs/${jobId}`,
  };
};

export const jobAlert = (
  candidateName: string,
  jobs: Array<{ title: string; company: string; location?: string; link: string }>
): EmailTemplate => {
  const jobCards = jobs
    .map(
      (job) => `
        <tr>
          <td style="padding:16px 20px;border-bottom:1px solid ${BRAND.border};">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td>
                  <a href="${job.link}" style="text-decoration:none;">
                    <span style="display:block;font-size:16px;font-weight:600;color:${BRAND.text};margin-bottom:4px;">${job.title}</span>
                    <span style="font-size:14px;color:${BRAND.textSecondary};">${job.company}${job.location ? ` &middot; ${job.location}` : ''}</span>
                  </a>
                </td>
                <td width="100" align="right" valign="middle">
                  <a href="${job.link}" style="display:inline-block;padding:8px 16px;background-color:#eef2ff;color:${BRAND.primary};font-size:13px;font-weight:600;text-decoration:none;border-radius:6px;">Apply</a>
                </td>
              </tr>
            </table>
          </td>
        </tr>`
    )
    .join('');

  const jobsText = jobs
    .map(
      (job) =>
        `- ${job.title} at ${job.company}${job.location ? ` (${job.location})` : ''}: ${job.link}`
    )
    .join('\n');

  return {
    subject: `${jobs.length} New Jobs Match Your Profile`,
    html: emailLayout(
      `
            ${iconCircle('&#128188;', '#eef2ff')}
            ${heading('New Job Matches')}
            ${subtitle(`We found ${jobs.length} new ${jobs.length === 1 ? 'opportunity' : 'opportunities'} for you.`)}
            ${greeting(candidateName)}
            ${paragraph('Based on your profile and preferences, here are your latest job matches:')}
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:16px 0 24px 0;border:1px solid ${BRAND.border};border-radius:10px;overflow:hidden;">
              ${jobCards}
            </table>
            ${button('View All Jobs', `${BRAND.url}/jobs`)}
            ${divider()}
            ${smallText('You\'re receiving this because you have job alerts enabled. <a href="' + BRAND.url + '/settings/notifications" style="color:' + BRAND.textSecondary + ';text-decoration:underline;">Manage preferences</a>')}
            ${signature()}
        `,
      `${jobs.length} new jobs match your profile on Hire Adda.`
    ),
    text: `Hi ${candidateName}, here are new jobs for you:\n${jobsText}\n\nView all jobs: ${BRAND.url}/jobs`,
  };
};

/**
 * Batched job-match digest — ONE email covering every new match.
 *
 * The per-job `jobMatchFound` template is still used where a single job is
 * genuinely the subject (an employer posting one role). This one exists
 * because the candidate-side matcher produces N matches at once: a candidate
 * matching 100 open roles used to receive 100 copies of `jobMatchFound` in a
 * burst. Shows the top few with their match scores and sends the rest behind
 * a single "view all" link.
 */
export const jobMatchDigest = (
  candidateName: string,
  jobs: Array<{ title: string; company: string; location?: string; link: string; score: number }>,
  totalCount: number
): EmailTemplate => {
  const viewAllUrl = `${BRAND.url}/candidate/recommendations`;
  const remaining = Math.max(0, totalCount - jobs.length);

  const jobCards = jobs
    .map(
      (job) => `
        <tr>
          <td style="padding:16px 20px;border-bottom:1px solid ${BRAND.border};">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td>
                  <a href="${job.link}" style="text-decoration:none;">
                    <span style="display:block;font-size:16px;font-weight:600;color:${BRAND.text};margin-bottom:4px;">${job.title}</span>
                    <span style="font-size:14px;color:${BRAND.textSecondary};">${job.company}${job.location ? ` &middot; ${job.location}` : ''}</span>
                  </a>
                </td>
                <td width="120" align="right" valign="middle">
                  <span style="display:inline-block;padding:4px 10px;background-color:#ecfdf5;color:#047857;font-size:12px;font-weight:700;border-radius:999px;margin-bottom:6px;">${Math.round(job.score * 100)}% match</span><br/>
                  <a href="${job.link}" style="display:inline-block;padding:6px 14px;background-color:#eef2ff;color:${BRAND.primary};font-size:13px;font-weight:600;text-decoration:none;border-radius:6px;">View</a>
                </td>
              </tr>
            </table>
          </td>
        </tr>`
    )
    .join('');

  const jobsText = jobs
    .map(
      (job) =>
        `- ${job.title} at ${job.company}${job.location ? ` (${job.location})` : ''} — ${Math.round(job.score * 100)}% match: ${job.link}`
    )
    .join('\n');

  const headline =
    totalCount === 1
      ? '1 new job matches your profile'
      : `${totalCount} new jobs match your profile`;

  return {
    subject:
      totalCount === 1
        ? `New job match: ${jobs[0]?.title ?? ''}`
        : `${totalCount} new jobs match your profile`,
    html: emailLayout(
      `
            ${iconCircle('&#127919;', '#eef2ff')}
            ${heading('Your New Job Matches')}
            ${subtitle(headline)}
            ${greeting(candidateName)}
            ${paragraph(
              `Based on your skills, experience and preferences, here ${jobs.length === 1 ? 'is your top match' : `are your top ${jobs.length} matches`}:`
            )}
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:16px 0 24px 0;border:1px solid ${BRAND.border};border-radius:10px;overflow:hidden;">
              ${jobCards}
            </table>
            ${
              remaining > 0
                ? paragraph(
                    `<strong>+ ${remaining} more ${remaining === 1 ? 'match' : 'matches'}</strong> waiting for you.`
                  )
                : ''
            }
            ${button(remaining > 0 ? `View all ${totalCount} matches` : 'View all matches', viewAllUrl)}
            ${divider()}
            ${smallText('You\'re receiving this because your profile matches these jobs. <a href="' + BRAND.url + '/candidate/settings" style="color:' + BRAND.textSecondary + ';text-decoration:underline;">Manage notifications</a>')}
            ${signature()}
        `,
      headline
    ),
    text: `Hi ${candidateName}, ${headline}:\n${jobsText}\n${remaining > 0 ? `\n+ ${remaining} more.` : ''}\n\nView all: ${viewAllUrl}`,
  };
};

export const matchingCandidatesFound = (
  employerName: string,
  jobTitle: string,
  matchCount: number,
  jobId: string
): EmailTemplate => ({
  subject: `${matchCount} Matching Candidate${matchCount === 1 ? '' : 's'} Found for ${jobTitle}`,
  html: emailLayout(
    `
        ${iconCircle('&#127919;', BRAND.successLight)}
        ${heading('Matching Candidates Found')}
        ${subtitle('We found candidates for your open position.')}
        ${greeting(employerName)}
        ${paragraph(`Great news! We've identified <strong>${matchCount} candidate${matchCount === 1 ? '' : 's'}</strong> whose profile${matchCount === 1 ? '' : 's'} match${matchCount === 1 ? 'es' : ''} your <strong>${jobTitle}</strong> position.`)}
        ${infoBox([
          { label: 'Position', value: jobTitle },
          { label: 'Matching Candidates', value: matchCount.toString() },
          { label: 'Status', value: 'Ready to Review' },
        ])}
        ${paragraph('Review these candidates to find the best fit for your team.')}
        ${button('Review Candidates', `${BRAND.url}/employer/jobs/${jobId}/applications`)}
        ${divider()}
        ${smallText('Candidates match based on skills, experience, and location preferences in your job posting.')}
        ${signature()}
    `,
    `${matchCount} matching candidate${matchCount === 1 ? '' : 's'} found for ${jobTitle}`
  ),
  text: `Hi ${employerName}, we found ${matchCount} candidate${matchCount === 1 ? '' : 's'} for your ${jobTitle} position. Review them at ${BRAND.url}/employer/jobs/${jobId}/applications`,
});

/**
 * Application withdrawn notification sent to the employer.
 */
export const applicationWithdrawn = (
  employerName: string,
  candidateName: string,
  jobTitle: string
): EmailTemplate => ({
  subject: `Application Withdrawn: ${candidateName} — ${jobTitle}`,
  html: emailLayout(
    `
        ${iconCircle('&#128221;', BRAND.warningLight)}
        ${heading('Application Withdrawn')}
        ${greeting(employerName)}
        ${paragraph(`<strong>${candidateName}</strong> has withdrawn their application for the <strong>${jobTitle}</strong> position.`)}
        ${infoBox([
          { label: 'Candidate', value: candidateName },
          { label: 'Position', value: jobTitle },
          { label: 'Status', value: 'Withdrawn' },
        ])}
        ${paragraph('You can view other applicants in your dashboard.')}
        ${button('View Applicants', `${BRAND.url}/employer/applications`)}
        ${signature()}
    `,
    `${candidateName} has withdrawn their application for ${jobTitle}.`
  ),
  text: `Hi ${employerName}, ${candidateName} has withdrawn their application for ${jobTitle}. View other applicants at ${BRAND.url}/employer/applications`,
});
