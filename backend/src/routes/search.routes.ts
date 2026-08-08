import { Router } from 'express';
import { protect } from '../middleware/auth';
import { searchLimiter } from '../middleware/rate-limit';
import { cache } from '../middleware/cache';
import { etagCache } from '../middleware/etag';
import { validate } from '../validators/validate';
import {
  autocompleteQuery,
  suggestQuery,
  didYouMeanQuery,
  popularQuery,
  unifiedSuggestQuery,
  fieldHistoryParams,
  fieldHistoryQuery,
  fieldHistoryBody,
} from '../validators/search.validators';
import * as searchController from '../controllers/search.controller';

const router = Router();

// Apply search-specific rate limiter (60 req/min)
router.use(searchLimiter);

// Public routes (no auth required) — with query param validation
router.get(
  '/autocomplete',
  validate({ query: autocompleteQuery }),
  etagCache({ ttl: 300 }),
  cache({ ttl: 300 }),
  searchController.autocomplete
);
router.get(
  '/suggest',
  validate({ query: unifiedSuggestQuery }),
  cache({ ttl: 600 }),
  searchController.suggest
);
router.get(
  '/suggest/skills',
  validate({ query: suggestQuery }),
  cache({ ttl: 600 }),
  searchController.suggestSkills
);
router.get(
  '/suggest/locations',
  validate({ query: suggestQuery }),
  cache({ ttl: 600 }),
  searchController.suggestLocations
);
router.get(
  '/suggest/companies',
  validate({ query: suggestQuery }),
  cache({ ttl: 600 }),
  searchController.suggestCompanies
);
router.get(
  '/suggest/titles',
  validate({ query: suggestQuery }),
  cache({ ttl: 600 }),
  searchController.suggestJobTitles
);
router.get(
  '/did-you-mean',
  validate({ query: didYouMeanQuery }),
  cache({ ttl: 300 }),
  searchController.didYouMean
);
router.get(
  '/popular',
  validate({ query: popularQuery }),
  etagCache({ ttl: 600 }),
  cache({ ttl: 600 }),
  searchController.getPopularSearches
);

// Protected routes (auth required)
router.get('/history', protect, searchController.getSearchHistory);
router.post('/history', protect, searchController.addToSearchHistory);
router.delete('/history', protect, searchController.clearSearchHistory);

// Field-specific history (generic: location, skill, company)
router.get(
  '/field-history/:field',
  protect,
  validate({ params: fieldHistoryParams, query: fieldHistoryQuery }),
  searchController.getFieldHistory
);
router.post(
  '/field-history/:field',
  protect,
  validate({ params: fieldHistoryParams, body: fieldHistoryBody }),
  searchController.addToFieldHistory
);
router.delete(
  '/field-history/:field',
  protect,
  validate({ params: fieldHistoryParams }),
  searchController.clearFieldHistory
);

export default router;
