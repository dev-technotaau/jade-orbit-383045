/**
 * /sitemap-news.xml — Google News sitemap.
 *
 * Distinct from the main /sitemap.xml because Google News uses a
 * different XML namespace + only accepts URLs published in the last
 * 2 days. When real /news content ships, the backend `/public/news`
 * endpoint feeds this route. Until then, a hard-coded fallback entry
 * keeps the urlset non-empty so Google's News sitemap parser doesn't
 * reject it ("Couldn't fetch" on an empty urlset).
 *
 * @see https://developers.google.com/search/docs/crawling-indexing/sitemaps/news-sitemap
 */
const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://hireadda.in';
const PUBLICATION_NAME = 'Hire Adda';
const PUBLICATION_LANGUAGE = 'en';

interface NewsItem {
  /** Full URL (already includes BASE_URL prefix). */
  url: string;
  title: string;
  publicationDate: string; // ISO 8601
  keywords?: string[];
}

/**
 * Fallback news entry used when the backend has no fresh news items.
 * Points at the homepage (a real, always-200 URL) with a publication
 * date set to "now" so it stays within Google News's 48-hour window
 * on every revalidation tick. Acts as a placeholder until the /news
 * surface ships actual editorial content.
 */
function fallbackNewsItem(): NewsItem {
  return {
    url: `${BASE_URL}/`,
    title: "Hire Adda — India's verified jobs + hiring platform",
    publicationDate: new Date().toISOString(),
    keywords: ['jobs', 'hiring', 'careers', 'india', 'employment'],
  };
}

async function fetchRecentNews(): Promise<NewsItem[]> {
  const apiBase =
    process.env.BACKEND_INTERNAL_URL ||
    process.env.NEXT_PUBLIC_API_URL ||
    'http://localhost:5000/api/v1';
  let items: NewsItem[] = [];
  try {
    // Google News only accepts items <= 2 days old.
    const since = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
    const res = await fetch(
      `${apiBase}/public/news?limit=1000&since=${encodeURIComponent(since)}`,
      { next: { revalidate: 600 } },
    );
    if (res.ok) {
      const body = await res.json();
      const rows: Array<{
        slug?: string;
        title?: string;
        publishedAt?: string;
        createdAt?: string;
        keywords?: string[];
      }> = body?.data?.items ?? body?.data ?? [];
      items = rows
        .filter((r) => r.slug && r.title)
        .map((r) => ({
          url: `${BASE_URL}/news/${r.slug}`,
          title: r.title as string,
          publicationDate: r.publishedAt ?? r.createdAt ?? new Date().toISOString(),
          keywords: r.keywords,
        }));
    }
  } catch {
    /* fall through to fallback */
  }
  // Empty urlset is rejected by Google News' validator → always emit
  // at least the fallback so the sitemap remains "fetchable" in GSC.
  if (items.length === 0) items = [fallbackNewsItem()];
  return items;
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function buildNewsSitemap(items: NewsItem[]): string {
  const urls = items
    .map(
      (item) => `  <url>
    <loc>${escapeXml(item.url)}</loc>
    <news:news>
      <news:publication>
        <news:name>${escapeXml(PUBLICATION_NAME)}</news:name>
        <news:language>${PUBLICATION_LANGUAGE}</news:language>
      </news:publication>
      <news:publication_date>${escapeXml(item.publicationDate)}</news:publication_date>
      <news:title>${escapeXml(item.title)}</news:title>
      ${item.keywords && item.keywords.length > 0 ? `<news:keywords>${escapeXml(item.keywords.join(', '))}</news:keywords>` : ''}
    </news:news>
  </url>`,
    )
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:news="http://www.google.com/schemas/sitemap-news/0.9">
${urls}
</urlset>`;
}

export async function GET() {
  const items = await fetchRecentNews();
  const body = buildNewsSitemap(items);
  return new Response(body, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=300, stale-while-revalidate=3600',
    },
  });
}

// 5min ISR — news content turns over fast.
export const revalidate = 300;
