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

/**
 * Templates for the RECURRING digests.
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Kept apart from `job.ts` (event-driven, transactional) because these are
 * marketing-class: they are the ones a user opts out of, the ones subject to
 * quiet hours and the shared daily cap, and the ones whose copy has to earn
 * the send. Every one ends with a manage-preferences link — an unsubscribe
 * path is not optional for scheduled mail.
 */

const prefsLink = (role: 'candidate' | 'employer') =>
  smallText(
    `You're receiving this because these updates are on for your account. <a href="${BRAND.url}/${role}/settings" style="color:${BRAND.textSecondary};text-decoration:underline;">Manage or turn off</a>`
  );

/** Shared row renderer: title on the left, a small meta line, optional right chip. */
function rows(
  items: Array<{ primary: string; secondary?: string; link: string; chip?: string }>
): string {
  return items
    .map(
      (it) => `
        <tr>
          <td style="padding:14px 20px;border-bottom:1px solid ${BRAND.border};">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td>
                  <a href="${it.link}" style="text-decoration:none;">
                    <span style="display:block;font-size:15px;font-weight:600;color:${BRAND.text};margin-bottom:3px;">${it.primary}</span>
                    ${it.secondary ? `<span style="font-size:13px;color:${BRAND.textSecondary};">${it.secondary}</span>` : ''}
                  </a>
                </td>
                ${
                  it.chip
                    ? `<td width="110" align="right" valign="middle"><span style="display:inline-block;padding:4px 10px;background-color:#eef2ff;color:${BRAND.primary};font-size:12px;font-weight:700;border-radius:999px;">${it.chip}</span></td>`
                    : ''
                }
              </tr>
            </table>
          </td>
        </tr>`
    )
    .join('');
}

const table = (inner: string) =>
  `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:16px 0 24px 0;border:1px solid ${BRAND.border};border-radius:10px;overflow:hidden;">${inner}</table>`;

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

/* ══════════════════════ CANDIDATE ══════════════════════ */

/** "Companies you follow are hiring." */
export const followedCompanyJobs = (
  candidateName: string,
  jobs: Array<{ title: string; company: string; location?: string | null; jobId: string }>,
  total: number
): EmailTemplate => {
  const items = jobs.map((j) => ({
    primary: j.title,
    secondary: `${j.company}${j.location ? ` · ${j.location}` : ''}`,
    link: `${BRAND.url}/candidate/jobs/${j.jobId}`,
  }));
  const head = `${total} new ${plural(total, 'opening', 'openings')} at ${plural(jobs.length, 'a company', 'companies')} you follow`;
  return {
    subject:
      total === 1
        ? `${jobs[0]!.company} just posted a role`
        : `${total} new openings at companies you follow`,
    html: emailLayout(
      `
        ${iconCircle('&#127970;', '#eef2ff')}
        ${heading('Companies You Follow Are Hiring')}
        ${subtitle(head)}
        ${greeting(candidateName)}
        ${paragraph('You asked to hear when these companies post. Here is what is new:')}
        ${table(rows(items))}
        ${total > jobs.length ? paragraph(`<strong>+ ${total - jobs.length} more</strong> from companies you follow.`) : ''}
        ${button('View all openings', `${BRAND.url}/candidate/following`)}
        ${divider()}
        ${prefsLink('candidate')}
        ${signature()}
      `,
      head
    ),
    text: `Hi ${candidateName}, ${head}:\n${jobs.map((j) => `- ${j.title} at ${j.company}: ${BRAND.url}/candidate/jobs/${j.jobId}`).join('\n')}\n\nAll: ${BRAND.url}/candidate/following`,
  };
};

/** "N recruiters viewed your profile." */
export const profileViewsDigest = (
  candidateName: string,
  viewCount: number,
  companies: string[],
  periodLabel: string
): EmailTemplate => {
  const head = `${viewCount} ${plural(viewCount, 'recruiter', 'recruiters')} viewed your profile ${periodLabel}`;
  return {
    subject: head,
    html: emailLayout(
      `
        ${iconCircle('&#128064;', '#ecfdf5')}
        ${heading('Your Profile Is Getting Noticed')}
        ${subtitle(head)}
        ${greeting(candidateName)}
        ${paragraph(
          `Your profile was viewed <strong>${viewCount} ${plural(viewCount, 'time', 'times')}</strong> ${periodLabel}.`
        )}
        ${
          companies.length
            ? paragraph(
                `Including recruiters from: <strong>${companies.slice(0, 5).join(', ')}</strong>.`
              )
            : ''
        }
        ${paragraph('Profiles that are complete and up to date get viewed significantly more often. A quick refresh keeps you near the top of recruiter searches.')}
        ${button('View who viewed you', `${BRAND.url}/candidate/profile-views`)}
        ${divider()}
        ${prefsLink('candidate')}
        ${signature()}
      `,
      head
    ),
    text: `Hi ${candidateName}, ${head}.${companies.length ? ` Including: ${companies.slice(0, 5).join(', ')}.` : ''}\nSee more: ${BRAND.url}/candidate/profile-views`,
  };
};

/** "Saved jobs closing soon." */
export const savedJobsClosing = (
  candidateName: string,
  jobs: Array<{ title: string; company: string; jobId: string; daysLeft: number }>
): EmailTemplate => {
  const items = jobs.map((j) => ({
    primary: j.title,
    secondary: j.company,
    link: `${BRAND.url}/candidate/jobs/${j.jobId}`,
    chip: j.daysLeft <= 0 ? 'Closes today' : `${j.daysLeft}d left`,
  }));
  const head = `${jobs.length} saved ${plural(jobs.length, 'job is', 'jobs are')} closing soon`;
  return {
    subject: head,
    html: emailLayout(
      `
        ${iconCircle('&#9203;', '#fef3c7')}
        ${heading('Saved Jobs Closing Soon')}
        ${subtitle(head)}
        ${greeting(candidateName)}
        ${paragraph("You saved these but haven't applied yet. They stop accepting applications shortly:")}
        ${table(rows(items))}
        ${button('Review saved jobs', `${BRAND.url}/candidate/saved-jobs`)}
        ${divider()}
        ${prefsLink('candidate')}
        ${signature()}
      `,
      head
    ),
    text: `Hi ${candidateName}, ${head}:\n${jobs.map((j) => `- ${j.title} at ${j.company} (${j.daysLeft <= 0 ? 'closes today' : `${j.daysLeft}d left`}): ${BRAND.url}/candidate/jobs/${j.jobId}`).join('\n')}`,
  };
};

/* ══════════════════════ EMPLOYER ══════════════════════ */

/** "New candidates matching your open roles." */
export const candidateRecommendations = (
  employerName: string,
  groups: Array<{ jobTitle: string; jobId: string; count: number; topNames: string[] }>,
  total: number
): EmailTemplate => {
  const items = groups.map((g) => ({
    primary: g.jobTitle,
    secondary:
      g.topNames.length > 0
        ? `${g.count} new ${plural(g.count, 'match', 'matches')} · ${g.topNames.slice(0, 3).join(', ')}`
        : `${g.count} new ${plural(g.count, 'match', 'matches')}`,
    link: `${BRAND.url}/employer/jobs/${g.jobId}/matches`,
    chip: `${g.count}`,
  }));
  const head = `${total} new ${plural(total, 'candidate matches', 'candidates match')} your open ${plural(groups.length, 'role', 'roles')}`;
  return {
    subject: `${total} new ${plural(total, 'candidate matches', 'candidates match')} your open roles`,
    html: emailLayout(
      `
        ${iconCircle('&#128101;', '#eef2ff')}
        ${heading('New Candidate Matches')}
        ${subtitle(head)}
        ${greeting(employerName)}
        ${paragraph('Candidates who match your open roles since your last update:')}
        ${table(rows(items))}
        ${button('Review candidates', `${BRAND.url}/employer/jobs`)}
        ${divider()}
        ${prefsLink('employer')}
        ${signature()}
      `,
      head
    ),
    text: `Hi ${employerName}, ${head}:\n${groups.map((g) => `- ${g.jobTitle}: ${g.count} new`).join('\n')}\n\nReview: ${BRAND.url}/employer/jobs`,
  };
};

/** "Applications awaiting your review." */
export const applicationsAwaiting = (
  employerName: string,
  groups: Array<{ jobTitle: string; jobId: string; count: number; oldestDays: number }>,
  total: number
): EmailTemplate => {
  const items = groups.map((g) => ({
    primary: g.jobTitle,
    secondary: `${g.count} awaiting review · oldest ${g.oldestDays}d`,
    link: `${BRAND.url}/employer/jobs/${g.jobId}/applications`,
    chip: `${g.count}`,
  }));
  const head = `${total} ${plural(total, 'application is', 'applications are')} waiting for review`;
  return {
    subject: head,
    html: emailLayout(
      `
        ${iconCircle('&#128203;', '#fef3c7')}
        ${heading('Applications Awaiting Review')}
        ${subtitle(head)}
        ${greeting(employerName)}
        ${paragraph('Candidates are waiting to hear from you. Reviewing promptly keeps strong applicants from accepting elsewhere:')}
        ${table(rows(items))}
        ${button('Review applications', `${BRAND.url}/employer/applications`)}
        ${divider()}
        ${prefsLink('employer')}
        ${signature()}
      `,
      head
    ),
    text: `Hi ${employerName}, ${head}:\n${groups.map((g) => `- ${g.jobTitle}: ${g.count} waiting (oldest ${g.oldestDays}d)`).join('\n')}\n\nReview: ${BRAND.url}/employer/applications`,
  };
};

/** "Your saved candidate searches have new results." */
export const cvSearchAlerts = (
  employerName: string,
  searches: Array<{ name: string; count: number }>,
  total: number
): EmailTemplate => {
  const items = searches.map((s) => ({
    primary: s.name,
    secondary: `${s.count} new ${plural(s.count, 'candidate', 'candidates')}`,
    link: `${BRAND.url}/employer/candidates`,
    chip: `${s.count}`,
  }));
  const head = `${total} new ${plural(total, 'candidate matches', 'candidates match')} your saved ${plural(searches.length, 'search', 'searches')}`;
  return {
    subject: head,
    html: emailLayout(
      `
        ${iconCircle('&#128269;', '#eef2ff')}
        ${heading('New Candidates In Your Saved Searches')}
        ${subtitle(head)}
        ${greeting(employerName)}
        ${paragraph('Candidates matching searches you saved have joined or updated their profiles:')}
        ${table(rows(items))}
        ${button('Open CV database', `${BRAND.url}/employer/candidates`)}
        ${divider()}
        ${prefsLink('employer')}
        ${signature()}
      `,
      head
    ),
    text: `Hi ${employerName}, ${head}:\n${searches.map((s) => `- ${s.name}: ${s.count} new`).join('\n')}\n\nOpen: ${BRAND.url}/employer/candidates`,
  };
};

/** "More roles like the one you applied to." */
export const similarJobs = (
  candidateName: string,
  appliedTitle: string,
  jobs: Array<{ title: string; company: string; location?: string | null; jobId: string }>,
  /**
   * Why we are writing. After a REJECTION the "apply to more roles and you'll
   * hear back more often" line lands as a rebuke, so the framing changes —
   * same list, different sentence.
   */
  reason: 'applied' | 'rejected' = 'applied'
): EmailTemplate => {
  const items = jobs.map((j) => ({
    primary: j.title,
    secondary: `${j.company}${j.location ? ` · ${j.location}` : ''}`,
    link: `${BRAND.url}/candidate/jobs/${j.jobId}`,
  }));
  const rejected = reason === 'rejected';
  const head = rejected ? `Other roles like ${appliedTitle}` : `More roles like ${appliedTitle}`;
  const lead = rejected
    ? `That one didn't work out this time — it happens, and it is rarely about you. These similar roles are open right now:`
    : `You applied for <strong>${appliedTitle}</strong>. Candidates who apply to several similar roles hear back far more often — here are others open right now:`;
  return {
    subject: head,
    html: emailLayout(
      `
        ${iconCircle(rejected ? '&#128170;' : '&#128269;', '#eef2ff')}
        ${heading(rejected ? 'Keep Going — Other Roles Fit You' : 'More Roles Like That One')}
        ${subtitle(head)}
        ${greeting(candidateName)}
        ${paragraph(lead)}
        ${table(rows(items))}
        ${button('Browse more jobs', `${BRAND.url}/candidate/jobs`)}
        ${divider()}
        ${prefsLink('candidate')}
        ${signature()}
      `,
      head
    ),
    text: `Hi ${candidateName}, ${rejected ? 'other' : 'more'} roles like ${appliedTitle}:\n${jobs.map((j) => `- ${j.title} at ${j.company}: ${BRAND.url}/candidate/jobs/${j.jobId}`).join('\n')}`,
  };
};
