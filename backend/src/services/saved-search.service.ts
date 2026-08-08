import { prisma } from '../config/prisma';
import { AppError } from '../middleware/error';

const MAX_SAVED_SEARCHES = 20;

class SavedSearchService {
  /**
   * Save a new search with a max limit per user.
   */
  async saveSearch(userId: string, name: string, searchType: string, filters: Record<string, any>) {
    const existingCount = await prisma.savedSearch.count({
      where: { userId },
    });

    if (existingCount >= MAX_SAVED_SEARCHES) {
      throw new AppError(
        `Maximum of ${MAX_SAVED_SEARCHES} saved searches allowed. Please delete an existing saved search first.`,
        400
      );
    }

    const savedSearch = await prisma.savedSearch.create({
      data: {
        userId,
        name,
        searchType,
        filters,
      },
    });

    return savedSearch;
  }

  /**
   * List all saved searches for a user, optionally filtered by search type.
   */
  async getSavedSearches(userId: string, searchType?: string) {
    const where: any = { userId };

    if (searchType) {
      where.searchType = searchType;
    }

    return prisma.savedSearch.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
    });
  }

  /**
   * Delete a saved search with ownership verification.
   */
  async deleteSavedSearch(userId: string, searchId: string) {
    const savedSearch = await prisma.savedSearch.findUnique({
      where: { id: searchId },
    });

    if (!savedSearch || savedSearch.userId !== userId) {
      throw new AppError('Saved search not found', 404);
    }

    await prisma.savedSearch.delete({
      where: { id: searchId },
    });
  }

  /**
   * Update a saved search (name and/or filters) with ownership verification.
   */
  async updateSavedSearch(
    userId: string,
    searchId: string,
    data: { name?: string; filters?: Record<string, any> }
  ) {
    const savedSearch = await prisma.savedSearch.findUnique({
      where: { id: searchId },
    });

    if (!savedSearch || savedSearch.userId !== userId) {
      throw new AppError('Saved search not found', 404);
    }

    const updated = await prisma.savedSearch.update({
      where: { id: searchId },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.filters !== undefined && { filters: data.filters }),
      },
    });

    return updated;
  }
}

export const savedSearchService = new SavedSearchService();
