/**
 * Company follow routes.
 *
 * Mounted at /api/v1 — three groupings:
 *   1. Public-ish (auth optional)  — get follow status
 *   2. Candidate                  — follow / unfollow + own following
 *      lists
 *   3. Employer                   — list of followers
 */
import { Router } from 'express';
import { protect, optionalAuth } from '../middleware/auth';
import { restrictTo } from '../middleware/rbac';
import { Role } from '@prisma/client';
import * as ctrl from '../controllers/company-follow.controller';

const router = Router();

// ── Get follow status ─────────────────────────────────────────────
// `optionalAuth` lets guests read followersCount; auth users get
// `isFollowing` populated too.
router.get('/companies/:idOrSlug/follow-status', optionalAuth, ctrl.getFollowStatus);

// ── Follow / unfollow ─────────────────────────────────────────────
// Candidate-only routes — protected + role-restricted. Employer
// self-follow is blocked at the service layer.
router.post('/companies/:idOrSlug/follow', protect, restrictTo(Role.CANDIDATE), ctrl.followCompany);
router.delete(
  '/companies/:idOrSlug/follow',
  protect,
  restrictTo(Role.CANDIDATE),
  ctrl.unfollowCompany
);

// ── Candidate-side: own following lists ───────────────────────────
router.get(
  '/candidate/following/companies',
  protect,
  restrictTo(Role.CANDIDATE),
  ctrl.listFollowedCompanies
);
router.get('/candidate/following/jobs', protect, restrictTo(Role.CANDIDATE), ctrl.listFollowedJobs);

// ── Employer-side: list followers ─────────────────────────────────
router.get('/employer/followers', protect, restrictTo(Role.EMPLOYER), ctrl.listEmployerFollowers);

export default router;
