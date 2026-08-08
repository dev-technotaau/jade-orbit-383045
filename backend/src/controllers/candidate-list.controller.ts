import type { Request, Response, NextFunction } from 'express';
import { prisma } from '../config/prisma';
import { AppError } from '../middleware/error';
import type {
  CreateListInput,
  UpdateListInput,
  AddCandidatesToListInput,
} from '../schemas/candidate-list.schema';

/**
 * Create a new candidate list
 */
export const createList = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user) throw new AppError('Not authorized', 401);

    const data: CreateListInput = req.body;

    const list = await prisma.candidateList.create({
      data: {
        ...data,
        employerId: req.user.id,
      },
      include: {
        _count: {
          select: { members: true },
        },
      },
    });

    res.status(201).json({ status: 'success', data: list });
  } catch (error) {
    next(error);
  }
};

/**
 * Get all lists for the employer
 */
export const getLists = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.user) throw new AppError('Not authorized', 401);

    const lists = await prisma.candidateList.findMany({
      where: { employerId: req.user.id },
      include: {
        _count: {
          select: { members: true },
        },
      },
      orderBy: [{ isDefault: 'desc' }, { updatedAt: 'desc' }],
    });

    res.json({ status: 'success', data: lists });
  } catch (error) {
    next(error);
  }
};

/**
 * Get a single list with members
 */
export const getList = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.user) throw new AppError('Not authorized', 401);
    const listId = req.params.listId as string;
    const page = Number(req.query.page) || 1;
    const limit = Math.min(Number(req.query.limit) || 20, 100);

    const list = await prisma.candidateList.findFirst({
      where: {
        id: listId,
        employerId: req.user.id,
      },
      include: {
        members: {
          take: limit,
          skip: (page - 1) * limit,
          orderBy: { addedAt: 'desc' },
          include: {
            candidate: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
                avatar: true,
                candidateProfile: {
                  select: {
                    headline: true,
                    currentRole: true,
                    currentCompany: true,
                    currentLocation: true,
                    experienceYears: true,
                    skills: true,
                    expectedSalaryMin: true,
                    expectedSalaryMax: true,
                    salaryCurrency: true,
                    noticePeriod: true,
                  },
                },
              },
            },
            addedBy: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
              },
            },
          },
        },
        _count: {
          select: { members: true },
        },
      },
    });

    if (!list) {
      throw new AppError('List not found', 404, 'LIST_NOT_FOUND');
    }

    const totalMembers = list._count.members;
    const totalPages = Math.ceil(totalMembers / limit);

    res.json({
      status: 'success',
      data: {
        ...list,
        pagination: {
          page,
          limit,
          total: totalMembers,
          totalPages,
          hasMore: page < totalPages,
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Update a list
 */
export const updateList = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user) throw new AppError('Not authorized', 401);
    const listId = req.params.listId as string;
    const data: UpdateListInput = req.body;

    const list = await prisma.candidateList.findFirst({
      where: {
        id: listId,
        employerId: req.user.id,
      },
    });

    if (!list) {
      throw new AppError('List not found', 404, 'LIST_NOT_FOUND');
    }

    const updated = await prisma.candidateList.update({
      where: { id: listId },
      data,
      include: {
        _count: {
          select: { members: true },
        },
      },
    });

    res.json({ status: 'success', data: updated });
  } catch (error) {
    next(error);
  }
};

/**
 * Delete a list
 */
export const deleteList = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user) throw new AppError('Not authorized', 401);
    const listId = req.params.listId as string;

    const list = await prisma.candidateList.findFirst({
      where: {
        id: listId,
        employerId: req.user.id,
      },
    });

    if (!list) {
      throw new AppError('List not found', 404, 'LIST_NOT_FOUND');
    }

    if (list.isDefault) {
      throw new AppError('Cannot delete default list', 400, 'CANNOT_DELETE_DEFAULT');
    }

    await prisma.candidateList.delete({
      where: { id: listId },
    });

    res.json({ status: 'success', message: 'List deleted successfully' });
  } catch (error) {
    next(error);
  }
};

/**
 * Add candidates to a list
 */
export const addCandidatesToList = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user) throw new AppError('Not authorized', 401);
    const listId = req.params.listId as string;
    const { candidateIds, notes }: AddCandidatesToListInput = req.body;

    const list = await prisma.candidateList.findFirst({
      where: {
        id: listId,
        employerId: req.user.id,
      },
    });

    if (!list) {
      throw new AppError('List not found', 404, 'LIST_NOT_FOUND');
    }

    // Add candidates (skipDuplicates handles already-added candidates)
    await prisma.candidateListMember.createMany({
      data: candidateIds.map((candidateId) => ({
        listId,
        candidateId,
        addedByUserId: req.user!.id,
        notes,
      })),
      skipDuplicates: true,
    });

    // Get updated count
    const count = await prisma.candidateListMember.count({
      where: { listId },
    });

    res.json({
      status: 'success',
      message: `${candidateIds.length} candidate(s) added to list`,
      data: { totalMembers: count },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Remove a candidate from a list
 */
export const removeCandidateFromList = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user) throw new AppError('Not authorized', 401);
    const listId = req.params.listId as string;
    const candidateId = req.params.candidateId as string;

    const list = await prisma.candidateList.findFirst({
      where: {
        id: listId,
        employerId: req.user.id,
      },
    });

    if (!list) {
      throw new AppError('List not found', 404, 'LIST_NOT_FOUND');
    }

    const member = await prisma.candidateListMember.findFirst({
      where: {
        listId,
        candidateId,
      },
    });

    if (!member) {
      throw new AppError('Candidate not in this list', 404, 'MEMBER_NOT_FOUND');
    }

    await prisma.candidateListMember.delete({
      where: { id: member.id },
    });

    res.json({ status: 'success', message: 'Candidate removed from list' });
  } catch (error) {
    next(error);
  }
};

/**
 * Update member notes
 */
export const updateMemberNotes = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user) throw new AppError('Not authorized', 401);
    const listId = req.params.listId as string;
    const candidateId = req.params.candidateId as string;
    const { notes } = req.body;

    const list = await prisma.candidateList.findFirst({
      where: {
        id: listId,
        employerId: req.user.id,
      },
    });

    if (!list) {
      throw new AppError('List not found', 404, 'LIST_NOT_FOUND');
    }

    const member = await prisma.candidateListMember.findFirst({
      where: {
        listId,
        candidateId,
      },
    });

    if (!member) {
      throw new AppError('Candidate not in this list', 404, 'MEMBER_NOT_FOUND');
    }

    const updated = await prisma.candidateListMember.update({
      where: { id: member.id },
      data: { notes },
    });

    res.json({ status: 'success', data: updated });
  } catch (error) {
    next(error);
  }
};
