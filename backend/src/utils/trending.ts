import redis from '../config/redis';

const TRENDING_JOBS_KEY = 'trending:jobs:daily';
const TRENDING_SEARCHES_KEY = 'trending:searches:daily';
const TRENDING_TTL = 86400; // 24 hours

/**
 * Track a job view in the trending sorted set.
 */
export async function trackJobView(jobId: string): Promise<void> {
  await redis.zincrby(TRENDING_JOBS_KEY, 1, jobId);
  await redis.expire(TRENDING_JOBS_KEY, TRENDING_TTL);
}

/**
 * Get trending jobs (most viewed in last 24h).
 * Returns array of { jobId, score } sorted by score desc.
 */
export async function getTrendingJobs(
  limit = 10
): Promise<Array<{ jobId: string; score: number }>> {
  const results = await redis.zrevrange(TRENDING_JOBS_KEY, 0, limit - 1, 'WITHSCORES');
  const items: Array<{ jobId: string; score: number }> = [];
  for (let i = 0; i < results.length; i += 2) {
    items.push({ jobId: results[i], score: parseFloat(results[i + 1]) });
  }
  return items;
}

/**
 * Track a search query in the trending sorted set.
 */
export async function trackSearch(query: string): Promise<void> {
  if (!query || query.trim().length < 2) return;
  await redis.zincrby(TRENDING_SEARCHES_KEY, 1, query.toLowerCase().trim());
  await redis.expire(TRENDING_SEARCHES_KEY, TRENDING_TTL);
}

/**
 * Get trending searches (most popular in last 24h).
 * Returns array of { query, score } sorted by score desc.
 */
export async function getTrendingSearches(
  limit = 10
): Promise<Array<{ query: string; score: number }>> {
  const results = await redis.zrevrange(TRENDING_SEARCHES_KEY, 0, limit - 1, 'WITHSCORES');
  const items: Array<{ query: string; score: number }> = [];
  for (let i = 0; i < results.length; i += 2) {
    items.push({ query: results[i], score: parseFloat(results[i + 1]) });
  }
  return items;
}
