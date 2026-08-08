/**
 * One-off script to recreate all Elasticsearch indices and backfill from DB.
 *
 * Usage:
 *   cd backend
 *   npx tsx src/scripts/reindex-all.ts
 *
 * Requires: ELASTICSEARCH_URL, DATABASE_URL, REDIS_URL in .env
 */
import 'dotenv/config';
import { searchService } from '../services/search.service';

async function main() {
  console.log('Starting full reindex of all Elasticsearch indices...');
  console.log('This will DELETE existing indices and recreate them with updated mappings.\n');

  await searchService.reindexAll();

  console.log('\nReindex complete. Exiting.');
  process.exit(0);
}

main().catch((err) => {
  console.error('Reindex failed:', err);
  process.exit(1);
});
