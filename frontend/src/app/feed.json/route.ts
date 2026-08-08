/**
 * /feed.json — JSON Feed v1.1 of the 100 most-recent public jobs.
 *
 * JSON Feed is a modern alternative to RSS/Atom that's machine-friendly
 * for AI agents and Node-side aggregators. Some readers (NetNewsWire,
 * Feedbin) ship JSON Feed-only support.
 *
 * @see https://www.jsonfeed.org/version/1.1/
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
  company?: { companyName?: string | null; logo?: string | null } | null;
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

export async function GET() {
  const jobs = await fetchLatestPublicJobs();
  const items = jobs.map((j) => {
    const url = j.slug ? `${BASE_URL}/jobs/${j.slug}` : `${BASE_URL}/jobs`;
    const company = j.company?.companyName ?? 'Hire Adda';
    const title = `${j.title} at ${company}${j.location ? ` · ${j.location}` : ''}`;
    const summary =
      stripHtml(j.description).slice(0, 400) ||
      `Apply for ${j.title} at ${company} on Hire Adda — verified employer, fast hiring.`;
    return {
      id: url,
      url,
      title,
      content_text: summary,
      summary,
      date_published: new Date(j.createdAt).toISOString(),
      author: { name: company },
      tags: ['jobs'],
      ...(j.company?.logo ? { image: j.company.logo } : {}),
    };
  });

  const body = {
    version: 'https://jsonfeed.org/version/1.1',
    title: `${SITE_NAME} — Latest Jobs`,
    home_page_url: `${BASE_URL}/jobs`,
    feed_url: `${BASE_URL}/feed.json`,
    description: SITE_DESCRIPTION,
    language: 'en-IN',
    icon: `${BASE_URL}/icons/logo.png`,
    favicon: `${BASE_URL}/favicon-32x32.png`,
    authors: [{ name: SITE_NAME, url: BASE_URL }],
    items,
  };

  return new Response(JSON.stringify(body), {
    headers: {
      'Content-Type': 'application/feed+json; charset=utf-8',
      'Cache-Control': `public, max-age=${REVALIDATE_SECONDS}, stale-while-revalidate=86400`,
    },
  });
}

// Next.js requires a literal here (statically analyzed) — value matches REVALIDATE_SECONDS.
export const revalidate = 1800;
