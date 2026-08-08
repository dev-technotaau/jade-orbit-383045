import type { Request, Response, NextFunction } from 'express';
import * as svc from '../services/assisted-hiring.service';
import { AppError, BadRequestError } from '../exceptions';

// ── Employer side ──

export const getMine = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.user) throw new AppError('Not authorized', 401);
    const result = await svc.getMyRequest(req.user.id);
    res.status(200).json({ status: 'success', data: result });
  } catch (err) {
    next(err);
  }
};

export const updateRequirement = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user) throw new AppError('Not authorized', 401);
    const requestId = String(req.params.id);
    const result = await svc.updateRequirement({
      employerUserId: req.user.id,
      requestId,
      input: req.body ?? {},
    });
    res.status(200).json({ status: 'success', data: result });
  } catch (err) {
    next(err);
  }
};

// ── Super-admin queue ──

export const queue = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const result = await svc.listQueue({
      status:
        typeof req.query.status === 'string'
          ? (req.query.status as svc.AssistedHiringStatus)
          : undefined,
      page: req.query.page ? Number(req.query.page) : 1,
      limit: req.query.limit ? Number(req.query.limit) : 25,
    });
    res.status(200).json({ status: 'success', data: result });
  } catch (err) {
    next(err);
  }
};

export const detail = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const result = await svc.getRequestDetail(String(req.params.id));
    res.status(200).json({ status: 'success', data: result });
  } catch (err) {
    next(err);
  }
};

export const claim = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.user) throw new AppError('Not authorized', 401);
    const result = await svc.claimRequest({
      adminUserId: req.user.id,
      requestId: String(req.params.id),
    });
    res.status(200).json({ status: 'success', data: result });
  } catch (err) {
    next(err);
  }
};

export const scheduleCall = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user) throw new AppError('Not authorized', 401);
    const callAtRaw = req.body?.callAt;
    if (!callAtRaw) throw new BadRequestError('callAt is required (ISO timestamp)');
    const callAt = new Date(callAtRaw);
    if (Number.isNaN(callAt.getTime())) throw new BadRequestError('Invalid callAt');
    const result = await svc.scheduleCall({
      adminUserId: req.user.id,
      requestId: String(req.params.id),
      callAt,
      internalNotes:
        typeof req.body?.internalNotes === 'string' ? req.body.internalNotes : undefined,
    });
    res.status(200).json({ status: 'success', data: result });
  } catch (err) {
    next(err);
  }
};

export const startSourcing = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user) throw new AppError('Not authorized', 401);
    const result = await svc.startSourcing({
      adminUserId: req.user.id,
      requestId: String(req.params.id),
    });
    res.status(200).json({ status: 'success', data: result });
  } catch (err) {
    next(err);
  }
};

export const addProfile = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user) throw new AppError('Not authorized', 401);
    const body = req.body ?? {};
    if (!body.candidateName) throw new BadRequestError('candidateName required');
    const result = await svc.addMatchedProfile({
      adminUserId: req.user.id,
      requestId: String(req.params.id),
      input: {
        candidateUserId:
          typeof body.candidateUserId === 'string' ? body.candidateUserId : undefined,
        candidateName: body.candidateName,
        candidateHeadline: body.candidateHeadline,
        candidateExperience: body.candidateExperience,
        candidateLocation: body.candidateLocation,
        resumeUrl: body.resumeUrl,
        notes: body.notes,
      },
    });
    res.status(201).json({ status: 'success', data: result });
  } catch (err) {
    next(err);
  }
};

export const removeProfile = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user) throw new AppError('Not authorized', 401);
    await svc.removeMatchedProfile({
      adminUserId: req.user.id,
      matchedProfileId: String(req.params.profileId),
    });
    res.status(200).json({ status: 'success' });
  } catch (err) {
    next(err);
  }
};

export const deliver = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.user) throw new AppError('Not authorized', 401);
    const result = await svc.deliverMatches({
      adminUserId: req.user.id,
      requestId: String(req.params.id),
      customMessage:
        typeof req.body?.customMessage === 'string' ? req.body.customMessage : undefined,
    });
    res.status(200).json({ status: 'success', data: result });
  } catch (err) {
    next(err);
  }
};

export const complete = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.user) throw new AppError('Not authorized', 401);
    const result = await svc.markCompleted({
      adminUserId: req.user.id,
      requestId: String(req.params.id),
    });
    res.status(200).json({ status: 'success', data: result });
  } catch (err) {
    next(err);
  }
};

export const cancel = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.user) throw new AppError('Not authorized', 401);
    const result = await svc.cancelRequest({
      adminUserId: req.user.id,
      requestId: String(req.params.id),
      reason: typeof req.body?.reason === 'string' ? req.body.reason : undefined,
    });
    res.status(200).json({ status: 'success', data: result });
  } catch (err) {
    next(err);
  }
};
