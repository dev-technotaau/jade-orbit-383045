/**
 * /feed.xml — RSS 2.0 feed of the 100 most-recent public jobs.
 *
 * Per Phase 15 of the master plan: feed readers (Inoreader, Feedly,
 * NetNewsWire) probe this URL; we now ship a real feed with the latest
 * 100 public jobs (cached 30min server-side; long stale-while-revalidate
 * for CDN edges).
 *
 * Only public, sanitised job data is exposed — same wire shape as the
 * /api/v1/public/jobs endpoint. Private fields (contact email/phone,
 * walk-in contact details, internal moderation flags) are stripped by
 * the backend's sanitiser before they reach this code.
 *
 * @see https://www.rssboard.org/rss-specification
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

interface FeedItem {
  title: string;
  link: string;
  description: string;
  pubDate: Date;
  guid: string;
  author?: string;
  category?: string;
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

function jobToFeedItem(j: PublicJobItem): FeedItem {
  const pageUrl = j.slug ? `${BASE_URL}/jobs/${j.slug}` : `${BASE_URL}/jobs`;
  const company = j.company?.companyName ?? 'Hire Adda';
  const location = j.location ? ` · ${j.location}` : '';
  const description =
    stripHtml(j.description).slice(0, 400) ||
    `Apply for ${j.title} at ${company} on Hire Adda — verified employer, fast hiring.`;
  return {
    title: `${j.title} at ${company}${location}`,
    link: pageUrl,
    description,
    pubDate: new Date(j.createdAt),
    guid: pageUrl,
    author: 'jobs@hireadda.in',
    category: 'Jobs',
  };
}

function buildFeed(items: FeedItem[]): string {
  const now = new Date();
  const itemsXml = items
    .map(
      (item) => `    <item>
      <title>${escapeXml(item.title)}</title>
      <link>${escapeXml(item.link)}</link>
      <guid isPermaLink="true">${escapeXml(item.guid)}</guid>
      <description>${escapeXml(item.description)}</description>
      <pubDate>${item.pubDate.toUTCString()}</pubDate>
      ${item.author ? `<author>${escapeXml(item.author)}</author>` : ''}
      ${item.category ? `<category>${escapeXml(item.category)}</category>` : ''}
    </item>`,
    )
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"
     xmlns:atom="http://www.w3.org/2005/Atom"
     xmlns:content="http://purl.org/rss/1.0/modules/content/"
     xmlns:dc="http://purl.org/dc/elements/1.1/">
  <channel>
    <title>${escapeXml(SITE_NAME)} — Latest Jobs</title>
    <link>${escapeXml(BASE_URL)}/jobs</link>
    <atom:link href="${escapeXml(BASE_URL)}/feed.xml" rel="self" type="application/rss+xml" />
    <description>${escapeXml(SITE_DESCRIPTION)}</description>
    <language>en-IN</language>
    <copyright>© ${now.getFullYear()} ${escapeXml(SITE_NAME)}</copyright>
    <lastBuildDate>${now.toUTCString()}</lastBuildDate>
    <generator>Next.js</generator>
    <ttl>${Math.floor(REVALIDATE_SECONDS / 60)}</ttl>
    <image>
      <url>${escapeXml(BASE_URL)}/icons/logo.png</url>
      <title>${escapeXml(SITE_NAME)}</title>
      <link>${escapeXml(BASE_URL)}</link>
      <width>144</width>
      <height>144</height>
    </image>
${itemsXml}
  </channel>
</rss>`;
}

export async function GET() {
  const jobs = await fetchLatestPublicJobs();
  const items = jobs.map(jobToFeedItem);
  const body = buildFeed(items);
  return new Response(body, {
    headers: {
      'Content-Type': 'application/rss+xml; charset=utf-8',
      // Browser/CDN cache: 30min fresh + serve-stale for a day while
      // revalidating in the background.
      'Cache-Control': `public, max-age=${REVALIDATE_SECONDS}, stale-while-revalidate=86400`,
    },
  });
}

// ISR — Next.js re-builds this route every 30min on the server.
// Literal required (statically analyzed) — matches REVALIDATE_SECONDS above.
export const revalidate = 1800;
