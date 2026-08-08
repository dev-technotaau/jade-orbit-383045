import type { Request, Response, NextFunction } from 'express';
import { savedSearchService } from '../services/saved-search.service';
import { AppError } from '../middleware/error';

// ===============================
// Save Search
// ===============================
export const saveSearch = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user) {
      throw new AppError('Not authorized', 401);
    }

    const { name, searchType, filters } = req.body;

    const savedSearch = await savedSearchService.saveSearch(req.user.id, name, searchType, filters);

    res.status(201).json({
      status: 'success',
      message: 'Search saved successfully',
      data: { savedSearch },
    });
  } catch (error) {
    next(error);
  }
};

// ===============================
// List Saved Searches
// ===============================
export const listSavedSearches = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user) {
      throw new AppError('Not authorized', 401);
    }

    const searchType = typeof req.query.searchType === 'string' ? req.query.searchType : undefined;

    const savedSearches = await savedSearchService.getSavedSearches(req.user.id, searchType);

    res.status(200).json({
      status: 'success',
      data: { savedSearches },
    });
  } catch (error) {
    next(error);
  }
};

// ===============================
// Update Saved Search
// ===============================
export const updateSavedSearch = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user) {
      throw new AppError('Not authorized', 401);
    }

    const searchId = req.params.id as string;
    const { name, filters } = req.body;

    const updated = await savedSearchService.updateSavedSearch(req.user.id, searchId, {
      name,
      filters,
    });

    res.status(200).json({
      status: 'success',
      message: 'Saved search updated successfully',
      data: { savedSearch: updated },
    });
  } catch (error) {
    next(error);
  }
};

// ===============================
// Delete Saved Search
// ===============================
export const deleteSavedSearch = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user) {
      throw new AppError('Not authorized', 401);
    }

    const searchId = req.params.id as string;

    await savedSearchService.deleteSavedSearch(req.user.id, searchId);

    res.status(200).json({
      status: 'success',
      message: 'Saved search deleted successfully',
    });
  } catch (error) {
    next(error);
  }
};
