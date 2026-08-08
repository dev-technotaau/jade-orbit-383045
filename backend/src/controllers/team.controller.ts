import type { Request, Response, NextFunction } from 'express';
import { TeamRole } from '@prisma/client';
import * as teamService from '../services/team.service';
import { AppError, BadRequestError } from '../exceptions';

export const list = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.user) throw new AppError('Not authorized', 401);
    const result = await teamService.listTeamMembers(req.user.id);
    res.status(200).json({ status: 'success', data: result });
  } catch (err) {
    next(err);
  }
};

export const invite = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.user) throw new AppError('Not authorized', 401);
    const { email, role } = req.body as { email?: string; role?: string };
    if (!email) throw new BadRequestError('email is required');
    const normalisedRole = (role ?? 'RECRUITER').toUpperCase();
    if (!Object.values(TeamRole).includes(normalisedRole as TeamRole)) {
      throw new BadRequestError(
        `Invalid role. Must be one of ${Object.values(TeamRole).join(', ')}.`
      );
    }
    const member = await teamService.inviteMember({
      ownerUserId: req.user.id,
      email,
      role: normalisedRole as TeamRole,
    });
    res.status(201).json({ status: 'success', data: member });
  } catch (err) {
    next(err);
  }
};

export const accept = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.user) throw new AppError('Not authorized', 401);
    const token = String(req.params.token ?? '');
    if (!token) throw new BadRequestError('token is required');
    const member = await teamService.acceptInvite({ token, userId: req.user.id });
    res.status(200).json({ status: 'success', data: member });
  } catch (err) {
    next(err);
  }
};

export const remove = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.user) throw new AppError('Not authorized', 401);
    const memberId = String(req.params.id ?? '');
    await teamService.removeMember({ ownerUserId: req.user.id, memberId });
    res.status(200).json({ status: 'success' });
  } catch (err) {
    next(err);
  }
};

export const usage = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.user) throw new AppError('Not authorized', 401);
    const days = req.query.days ? Math.min(180, Math.max(1, Number(req.query.days))) : 30;
    const result = await teamService.getTeamUsage(req.user.id, days);
    res.status(200).json({ status: 'success', data: result });
  } catch (err) {
    next(err);
  }
};

export const transferOwnership = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user) throw new AppError('Not authorized', 401);
    const { targetUserId } = req.body as { targetUserId?: string };
    if (!targetUserId) throw new BadRequestError('targetUserId is required');
    const result = await teamService.transferOwnership({
      currentOwnerUserId: req.user.id,
      targetUserId,
    });
    res.status(200).json({ status: 'success', data: result });
  } catch (err) {
    next(err);
  }
};

export const changeRole = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user) throw new AppError('Not authorized', 401);
    const memberId = String(req.params.id ?? '');
    const { role } = req.body as { role?: string };
    if (!role) throw new BadRequestError('role is required');
    const normalisedRole = String(role).toUpperCase();
    if (!Object.values(TeamRole).includes(normalisedRole as TeamRole)) {
      throw new BadRequestError(
        `Invalid role. Must be one of ${Object.values(TeamRole).join(', ')}.`
      );
    }
    const member = await teamService.changeRole({
      ownerUserId: req.user.id,
      memberId,
      role: normalisedRole as TeamRole,
    });
    res.status(200).json({ status: 'success', data: member });
  } catch (err) {
    next(err);
  }
};
