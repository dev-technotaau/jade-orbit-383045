import type { Request, Response, NextFunction } from 'express';
import * as PlanService from '../services/plan.service';
import { success, created, noContent } from '../utils/response';
import prisma from '../config/prisma';
import { assertUnmodified } from '../utils/optimistic-lock';
import { NotFoundError } from '../exceptions';
import type { CreatePlanInput, UpdatePlanInput } from '../types/billing.types';
import type {
  PlanCategory as PlanCategoryEnum,
  PlanStatus as PlanStatusEnum,
} from '@prisma/client';

interface PlanCatalogQS {
  category?: PlanCategoryEnum;
  status?: PlanStatusEnum;
  isPublic?: boolean;
  includeArchived?: boolean;
}

// =====================================================
// Public catalog
// =====================================================

export const listPublicPlans = async (
  req: Request<unknown, unknown, unknown, PlanCatalogQS>,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const plans = await PlanService.listPublicPlans({
      category: req.query.category,
      status: req.query.status,
    });
    success(res, plans, 'Plans fetched');
  } catch (err) {
    next(err);
  }
};

export const getPublicPlanByCode = async (
  req: Request<{ code: string }>,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const plan = await PlanService.getPublicPlanByCode(req.params.code);
    if (!plan) throw new NotFoundError('Plan not found');
    success(res, plan, 'Plan fetched');
  } catch (err) {
    next(err);
  }
};

export const getPublicPlanBySlug = async (
  req: Request<{ slug: string }>,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const plan = await PlanService.getPublicPlanBySlug(req.params.slug);
    if (!plan) throw new NotFoundError('Plan not found');
    success(res, plan, 'Plan fetched');
  } catch (err) {
    next(err);
  }
};

// =====================================================
// Super-admin CRUD
// =====================================================

export const listPlansAdmin = async (
  req: Request<unknown, unknown, unknown, PlanCatalogQS>,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const plans = await PlanService.listPlansAdmin({
      category: req.query.category,
      status: req.query.status,
      isPublic: req.query.isPublic,
      includeArchived: req.query.includeArchived,
    });
    success(res, plans, 'Plans fetched');
  } catch (err) {
    next(err);
  }
};

export const getPlanByIdAdmin = async (
  req: Request<{ id: string }>,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const plan = await PlanService.getPlanByIdAdmin(req.params.id);
    success(res, plan, 'Plan fetched');
  } catch (err) {
    next(err);
  }
};

export const createPlan = async (
  req: Request<unknown, unknown, CreatePlanInput>,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const plan = await PlanService.createPlan(req.body, req.user?.id);
    created(res, plan, 'Plan created');
  } catch (err) {
    next(err);
  }
};

export const updatePlan = async (
  req: Request<{ id: string }, unknown, UpdatePlanInput & { expectedUpdatedAt?: string }>,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { expectedUpdatedAt, ...payload } = req.body;

    // The plan editor posts the WHOLE form, so a concurrent edit is a silent
    // revert of someone else's pricing change — the highest-blast-radius
    // collision in the admin console. Refuse rather than overwrite.
    const current = await prisma.plan.findUnique({
      where: { id: req.params.id },
      select: { updatedAt: true },
    });
    assertUnmodified(current, expectedUpdatedAt, 'Plan');

    const plan = await PlanService.updatePlan(
      req.params.id,
      payload as UpdatePlanInput,
      req.user?.id
    );
    success(res, plan, 'Plan updated');
  } catch (err) {
    next(err);
  }
};

export const archivePlan = async (
  req: Request<{ id: string }>,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    await PlanService.archivePlan(req.params.id);
    noContent(res);
  } catch (err) {
    next(err);
  }
};

export const publishPlan = async (
  req: Request<{ id: string }>,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const plan = await PlanService.publishPlan(req.params.id);
    success(res, plan, 'Plan published');
  } catch (err) {
    next(err);
  }
};
