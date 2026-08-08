import type { Request, Response, NextFunction } from 'express';
import { searchService } from '../services/search.service';
import { AppError } from '../middleware/error';
import { ELASTIC_INDICES } from '../constants';

/**
 * Autocomplete — returns categorized suggestions (titles, skills, companies, locations)
 * GET /api/v1/search/autocomplete?q=react&type=jobs&limit=10
 */
export const autocomplete = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const q = (req.query.q as string) || '';
    const type = (req.query.type as 'jobs' | 'candidates' | 'all') || 'all';
    const limit = Math.min(Number(req.query.limit) || 10, 20);

    const results = await searchService.autocomplete(q, type, limit);

    res.status(200).json({ status: 'success', data: { suggestions: results } });
  } catch (error) {
    next(error);
  }
};

/**
 * Suggest Skills — for form fields (skills input)
 * GET /api/v1/search/suggest/skills?q=reac&limit=15
 */
export const suggestSkills = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const q = (req.query.q as string) || '';
    const limit = Math.min(Number(req.query.limit) || 15, 30);

    const results = await searchService.suggestSkills(q, limit);

    res.status(200).json({ status: 'success', data: { suggestions: results } });
  } catch (error) {
    next(error);
  }
};

/**
 * Suggest Locations — for form fields (location input)
 * GET /api/v1/search/suggest/locations?q=mum&limit=10
 */
export const suggestLocations = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const q = (req.query.q as string) || '';
    const limit = Math.min(Number(req.query.limit) || 10, 20);

    const results = await searchService.suggestLocations(q, limit);

    res.status(200).json({ status: 'success', data: { suggestions: results } });
  } catch (error) {
    next(error);
  }
};

/**
 * Suggest Companies — for form fields
 * GET /api/v1/search/suggest/companies?q=goo&limit=10
 */
export const suggestCompanies = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const q = (req.query.q as string) || '';
    const limit = Math.min(Number(req.query.limit) || 10, 20);

    const results = await searchService.suggestCompanies(q, limit);

    res.status(200).json({ status: 'success', data: { suggestions: results } });
  } catch (error) {
    next(error);
  }
};

/**
 * Suggest Job Titles — for form fields
 * GET /api/v1/search/suggest/titles?q=senior&limit=10
 */
export const suggestJobTitles = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const q = (req.query.q as string) || '';
    const limit = Math.min(Number(req.query.limit) || 10, 20);

    const results = await searchService.suggestJobTitles(q, limit);

    res.status(200).json({ status: 'success', data: { suggestions: results } });
  } catch (error) {
    next(error);
  }
};

/**
 * "Did you mean?" spell correction
 * GET /api/v1/search/did-you-mean?q=javasrcipt&index=jobs
 */
export const didYouMean = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const q = (req.query.q as string) || '';
    const index =
      req.query.index === 'candidates' ? ELASTIC_INDICES.CANDIDATES : ELASTIC_INDICES.JOBS;

    const suggestion = await searchService.didYouMean(q, index);

    res.status(200).json({ status: 'success', data: { suggestion } });
  } catch (error) {
    next(error);
  }
};

/**
 * Search History — get user's recent searches
 * GET /api/v1/search/history?limit=10
 */
export const getSearchHistory = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user) throw new AppError('Not authorized', 401);
    const limit = Math.min(Number(req.query.limit) || 10, 20);

    const history = await searchService.getSearchHistory(req.user.id, limit);

    res.status(200).json({ status: 'success', data: { history } });
  } catch (error) {
    next(error);
  }
};

/**
 * Clear search history
 * DELETE /api/v1/search/history
 */
export const clearSearchHistory = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user) throw new AppError('Not authorized', 401);

    await searchService.clearSearchHistory(req.user.id);

    res.status(200).json({ status: 'success', message: 'Search history cleared' });
  } catch (error) {
    next(error);
  }
};

/**
 * Add to search history
 * POST /api/v1/search/history { query, type }
 */
export const addToSearchHistory = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user) throw new AppError('Not authorized', 401);
    const { query, type } = req.body;

    if (!query || !type) throw new AppError('query and type are required', 400);

    await searchService.addToSearchHistory(req.user.id, query, type);

    res.status(200).json({ status: 'success', message: 'Added to search history' });
  } catch (error) {
    next(error);
  }
};

// ─── Field History (generic per-field, per-user) ────────────────────

/**
 * Get field history
 * GET /api/v1/search/field-history/:field?limit=10
 */
export const getFieldHistory = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user) throw new AppError('Not authorized', 401);
    const { field } = req.params;
    const limit = Math.min(Number(req.query.limit) || 10, 20);

    const history = await searchService.getFieldHistory(req.user.id, field as string, limit);

    res.status(200).json({ status: 'success', data: { history } });
  } catch (error) {
    next(error);
  }
};

/**
 * Add to field history
 * POST /api/v1/search/field-history/:field  { value }
 */
export const addToFieldHistory = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user) throw new AppError('Not authorized', 401);
    const { field } = req.params;
    const { value } = req.body;

    await searchService.addToFieldHistory(req.user.id, field as string, value);

    res.status(200).json({ status: 'success', message: 'Added to field history' });
  } catch (error) {
    next(error);
  }
};

/**
 * Clear field history
 * DELETE /api/v1/search/field-history/:field
 */
export const clearFieldHistory = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user) throw new AppError('Not authorized', 401);
    const { field } = req.params;

    await searchService.clearFieldHistory(req.user.id, field as string);

    res.status(200).json({ status: 'success', message: 'Field history cleared' });
  } catch (error) {
    next(error);
  }
};

/**
 * Unified suggestions — serves all 29 suggestion categories from the suggestions index
 * GET /api/v1/search/suggest?q=reac&category=skill&limit=15
 * GET /api/v1/search/suggest?q=mum&category=location&region=IN&limit=10
 * GET /api/v1/search/suggest?q=&category=revenue_range&limit=50
 */
export const suggest = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const q = (req.query.q as string) || '';
    const category = req.query.category as string;
    const limit = Math.min(Number(req.query.limit) || 15, 100);
    const region = req.query.region as string | undefined;

    const results = await searchService.suggest(q, category, limit, region);

    res.status(200).json({ status: 'success', data: { suggestions: results } });
  } catch (error) {
    next(error);
  }
};

/**
 * Popular searches (trending)
 * GET /api/v1/search/popular?limit=10
 */
export const getPopularSearches = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const limit = Math.min(Number(req.query.limit) || 10, 30);

    const searches = await searchService.getPopularSearches(limit);

    res.status(200).json({ status: 'success', data: { searches } });
  } catch (error) {
    next(error);
  }
};
