/**
 * /feed.atom — Atom 1.0 feed of the 100 most-recent public jobs.
 *
 * Same content as /feed.xml (RSS 2.0) but in Atom 1.0 wire format.
 * Some readers (older clients, federation tooling) prefer Atom; root
 * layout already advertises both via `alternates.types`.
 *
 * @see https://datatracker.ietf.org/doc/html/rfc4287
 */

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://hireadda.in';
const SITE_NAME = 'Hire Adda';
const SITE_DESCRIPTION =
  "India's leading job portal — the latest verified job openings from across India.";

const FEED_LIMIT = 100;
const REVALIDATE_SECONDS = 30 * 60;

interface PublicJobItem {
  id: string;
  slug?: string | null;
  title: string;
  description?: string | null;
  location?: string | null;
  createdAt: string;
  company?: { companyName?: string | null } | null;
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function stripHtml(html: string | null | undefined): string {
  if (!html) return '';
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

async function fetchLatestPublicJobs(): Promise<PublicJobItem[]> {
  const apiBase =
    process.env.BACKEND_INTERNAL_URL ||
    process.env.NEXT_PUBLIC_API_URL ||
    'http://localhost:5000/api/v1';
  try {
    const res = await fetch(`${apiBase}/public/jobs?limit=${FEED_LIMIT}&page=1&sort=recent`, {
      next: { revalidate: REVALIDATE_SECONDS },
    });
    if (!res.ok) return [];
    const body = await res.json();
    return (body?.data?.items ?? []) as PublicJobItem[];
  } catch {
    return [];
  }
}

function buildAtom(jobs: PublicJobItem[]): string {
  const updated = new Date().toISOString();
  const entries = jobs
    .map((j) => {
      const url = j.slug ? `${BASE_URL}/jobs/${j.slug}` : `${BASE_URL}/jobs`;
      const company = j.company?.companyName ?? 'Hire Adda';
      const title = `${j.title} at ${company}${j.location ? ` · ${j.location}` : ''}`;
      const summary =
        stripHtml(j.description).slice(0, 400) ||
        `Apply for ${j.title} at ${company} on Hire Adda.`;
      const published = new Date(j.createdAt).toISOString();
      return `  <entry>
    <title>${escapeXml(title)}</title>
    <id>${escapeXml(url)}</id>
    <link href="${escapeXml(url)}" rel="alternate" type="text/html"/>
    <updated>${published}</updated>
    <published>${published}</published>
    <author>
      <name>${escapeXml(company)}</name>
    </author>
    <category term="Jobs"/>
    <summary type="text">${escapeXml(summary)}</summary>
  </entry>`;
    })
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom" xml:lang="en-IN">
  <title>${escapeXml(SITE_NAME)} — Latest Jobs</title>
  <subtitle>${escapeXml(SITE_DESCRIPTION)}</subtitle>
  <link href="${escapeXml(BASE_URL)}/feed.atom" rel="self" type="application/atom+xml"/>
  <link href="${escapeXml(BASE_URL)}/jobs" rel="alternate" type="text/html"/>
  <id>${escapeXml(BASE_URL)}/feed.atom</id>
  <updated>${updated}</updated>
  <generator uri="https://nextjs.org/" version="16">Next.js</generator>
  <icon>${escapeXml(BASE_URL)}/favicon-32x32.png</icon>
  <logo>${escapeXml(BASE_URL)}/icons/logo.png</logo>
  <rights>© ${new Date().getFullYear()} ${escapeXml(SITE_NAME)}</rights>
${entries}
</feed>`;
}

export async function GET() {
  const jobs = await fetchLatestPublicJobs();
  return new Response(buildAtom(jobs), {
    headers: {
      'Content-Type': 'application/atom+xml; charset=utf-8',
      'Cache-Control': `public, max-age=${REVALIDATE_SECONDS}, stale-while-revalidate=86400`,
    },
  });
}

// Next.js requires a literal here (statically analyzed) — value matches REVALIDATE_SECONDS.
export const revalidate = 1800;
