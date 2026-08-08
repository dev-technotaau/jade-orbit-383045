import { Router } from 'express';
import multer from 'multer';
import { protect } from '../middleware/auth';
import { restrictTo } from '../middleware/rbac';
import { requireMfaEnabled } from '../middleware/require-mfa';
import {
  denyAdminRoleBody,
  denyAdminTargets,
  requireAnyPermission,
  requirePermission,
  requireSubjectPermission,
  superAdminOnly,
} from '../middleware/require-permission';
import { trackAdminActivity } from '../middleware/admin-activity';
import { validate } from '../validators/validate';
import { audit } from '../middleware/audit';
import { Role } from '@prisma/client';
import * as superAdminController from '../controllers/super-admin.controller';
import * as adminController from '../controllers/admin.controller';
import * as superAdminJobsController from '../controllers/super-admin-jobs.controller';
import { superAdminCreateJobSchema, superAdminUpdateJobSchema } from '../schemas/job.schema';
import {
  createAdminSchema,
  updateConfigSchema,
  createUserSchema,
  updateUserProfileSchema,
  adminResetPasswordSchema,
  adminEmailInitiateSchema,
  adminEmailConfirmSchema,
  adminMobileInitiateSchema,
  adminMobileConfirmSchema,
  adminWhatsappVerifySchema,
  adminWhatsappChangeSchema,
  adminWhatsappConfirmSchema,
  adminPasswordInitiateSchema,
  adminPasswordConfirmSchema,
  updateCandidateProfileSchema,
  updateCompanyProfileSchema,
  bulkExportUsersSchema,
  bulkNotifyUsersSchema,
  bulkSuspendUsersSchema,
  bulkActivateUsersSchema,
} from '../schemas/super-admin.schema';

const router = Router();
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_IMAGE_TYPES.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`Invalid file type. Allowed: ${ALLOWED_IMAGE_TYPES.join(', ')}`));
    }
  },
});

/**
 * ── Role gate widened, permission gate added ───────────────────────────
 *
 * This router used to be `restrictTo(SUPER_ADMIN)` wholesale. It now admits
 * ADMIN too, with every individual route carrying the permission it needs.
 *
 * That is the deliberate shape of this feature: rather than duplicating
 * ~95 super-admin pages under `/admin`, the SAME surface becomes reachable
 * the moment a super-admin grants the matching permission. One codebase,
 * one set of handlers, no drift between an "admin copy" and a "super-admin
 * copy" of the same screen.
 *
 * Routes that must never be delegated keep `superAdminOnly`, and every
 * route whose `:id` is a User carries `denyAdminTargets` so a granted admin
 * cannot turn a user-management power against a colleague's account.
 */
router.use(protect);
router.use(restrictTo(Role.ADMIN, Role.SUPER_ADMIN));
router.use(requireMfaEnabled);
router.use(trackAdminActivity);

// ── Admin management: SUPER_ADMIN only, never delegable ────────────────
// Creating, listing or removing admins is how you would escalate; the
// registry marks `users.admins.*` superAdminOnly so no grant can reach it,
// and this is the matching route-level lock.
router.post(
  '/admins',
  superAdminOnly,
  validate(createAdminSchema),
  audit('CREATE_ADMIN', 'User'),
  superAdminController.createAdmin
);
router.get('/admins', superAdminOnly, superAdminController.listAdmins);
router.delete(
  '/admins/:id',
  superAdminOnly,
  audit('REMOVE_ADMIN', 'User'),
  superAdminController.removeAdmin
);

// System config
router.get(
  '/config',
  requirePermission('platform.system_config.view'),
  superAdminController.getSystemConfig
);
router.patch(
  '/config',
  requirePermission('platform.system_config.edit'),
  validate(updateConfigSchema),
  audit('UPDATE_SYSTEM_CONFIG', 'SystemConfig'),
  superAdminController.updateSystemConfig
);

// ── User management ────────────────────────────────────────────────────
// The `/users/:id/*` family serves BOTH candidates and employers, so each
// route uses `requireSubjectPermission`, which loads the target and picks
// `users.candidates.*` or `users.employers.*` from ITS role.
//
// The earlier `requireAnyPermission(candidateKey, employerKey)` shape was
// wrong here: being OR-of-keys, an admin granted only the candidate side
// passed it and could then act on an employer — silently collapsing the
// subject split the registry exists to express. Routes that are inherently
// single-subject (applications = candidates, jobs = employers) keep a plain
// `requirePermission` plus `denyAdminTargets`.
router.post(
  '/users',
  requirePermission('users.create'),
  validate(createUserSchema),
  // Defence in depth: the service also refuses `role: 'ADMIN'` from a
  // non-super-admin. Both locks exist because this is a privilege-
  // escalation path — `users.create` is an ordinary grantable permission,
  // so without this an admin could mint a peer.
  denyAdminRoleBody,
  audit('CREATE_USER', 'User'),
  superAdminController.createUser
);
router.patch(
  '/users/:id/profile',
  requireSubjectPermission('', {
    candidates: 'users.candidates.profile.edit',
    employers: 'users.employers.company.edit',
  }),
  validate(updateUserProfileSchema),
  audit('UPDATE_USER_PROFILE', 'User'),
  superAdminController.updateUserProfile
);
router.post(
  '/users/:id/password-otp',
  requireSubjectPermission('credentials.password'),
  audit('SEND_PASSWORD_RESET_OTP', 'User'),
  superAdminController.sendAdminPasswordResetOtp
);
router.patch(
  '/users/:id/password',
  requireSubjectPermission('credentials.password'),
  validate(adminResetPasswordSchema),
  audit('ADMIN_RESET_PASSWORD', 'User'),
  superAdminController.adminResetPassword
);
router.patch(
  '/users/:id/deactivate',
  requireSubjectPermission('account.deactivate'),
  audit('DEACTIVATE_USER', 'User'),
  superAdminController.deactivateUser
);
router.post(
  '/users/:id/avatar',
  requireSubjectPermission('', {
    candidates: 'users.candidates.profile.avatar',
    employers: 'users.employers.company.logo',
  }),
  upload.single('avatar'),
  audit('UPLOAD_USER_AVATAR', 'User'),
  superAdminController.uploadUserAvatar
);
router.delete(
  '/users/:id/avatar',
  requireSubjectPermission('', {
    candidates: 'users.candidates.profile.avatar',
    employers: 'users.employers.company.logo',
  }),
  audit('REMOVE_USER_AVATAR', 'User'),
  superAdminController.removeUserAvatar
);
router.get(
  '/users/:id/sessions',
  requireSubjectPermission('sessions.view'),
  superAdminController.getUserSessions
);
router.delete(
  '/users/:id/sessions',
  requireSubjectPermission('sessions.revoke'),
  audit('REVOKE_USER_SESSIONS', 'User'),
  superAdminController.revokeUserSessions
);
router.delete(
  '/users/:id/sessions/:sessionId',
  requireSubjectPermission('sessions.revoke'),
  audit('REVOKE_USER_SESSION', 'User'),
  superAdminController.revokeUserSession
);

// Job posting on behalf of a company (admin override — bypasses plan-gating).
// Company picker + edit fetch are reads; create/update reuse jobService.
router.get(
  '/companies',
  requirePermission('jobs.authoring.create'),
  superAdminJobsController.listCompanies
);
router.get('/jobs/:id', requirePermission('jobs.listing.view'), superAdminJobsController.getJob);
router.post(
  '/jobs',
  requirePermission('jobs.authoring.create'),
  validate(superAdminCreateJobSchema),
  audit('SUPER_ADMIN_JOB_CREATE', 'JobPost'),
  superAdminJobsController.createJob
);
router.put(
  '/jobs/:id',
  requirePermission('jobs.authoring.edit'),
  validate(superAdminUpdateJobSchema),
  audit('SUPER_ADMIN_JOB_UPDATE', 'JobPost'),
  superAdminJobsController.updateJob
);

// User applications & jobs
router.get(
  '/users/:id/applications',
  requirePermission('users.candidates.activity.applications'),
  denyAdminTargets,
  adminController.getUserApplications
);
router.get(
  '/users/:id/jobs',
  requirePermission('users.employers.activity.jobs'),
  denyAdminTargets,
  adminController.getUserJobs
);
router.get(
  '/users/:id/verifications',
  requireSubjectPermission('activity.verifications'),
  adminController.getUserVerifications
);
router.patch(
  '/verifications/:id/status',
  requireAnyPermission('verifications.candidate.approve', 'verifications.employer.approve'),
  audit('UPDATE_VERIFICATION', 'VerificationRequest'),
  adminController.updateVerificationStatus
);

// Profile updates
router.patch(
  '/users/:id/candidate-profile',
  requirePermission('users.candidates.profile.edit'),
  denyAdminTargets,
  validate(updateCandidateProfileSchema),
  audit('UPDATE_CANDIDATE_PROFILE', 'CandidateProfile'),
  adminController.updateCandidateProfile
);
router.patch(
  '/users/:id/company-profile',
  requirePermission('users.employers.company.edit'),
  denyAdminTargets,
  validate(updateCompanyProfileSchema),
  audit('UPDATE_COMPANY_PROFILE', 'CompanyProfile'),
  adminController.updateCompanyProfile
);

// Bulk operations
router.post(
  '/users/bulk/export',
  requirePermission('users.bulk.export'),
  validate(bulkExportUsersSchema),
  audit('BULK_EXPORT_USERS', 'User'),
  adminController.bulkExportUsers
);
router.post(
  '/users/bulk/notify',
  requirePermission('users.bulk.notify'),
  validate(bulkNotifyUsersSchema),
  audit('BULK_NOTIFY_USERS', 'User'),
  adminController.bulkNotifyUsers
);
router.post(
  '/users/bulk/suspend',
  requirePermission('users.bulk.suspend'),
  validate(bulkSuspendUsersSchema),
  audit('BULK_SUSPEND_USERS', 'User'),
  adminController.bulkSuspendUsers
);
router.post(
  '/users/bulk/activate',
  requirePermission('users.bulk.activate'),
  validate(bulkActivateUsersSchema),
  audit('BULK_ACTIVATE_USERS', 'User'),
  adminController.bulkActivateUsers
);

// ── Managed MFA ────────────────────────────────────────────────────────
// These specifically exist so a super-admin can bootstrap or recover an
// ADMIN's MFA — i.e. their whole purpose is acting on admin accounts, which
// `denyAdminTargets` would block. They therefore stay super-admin-only
// rather than being permission-gated.
router.post(
  '/users/:id/mfa/setup',
  superAdminOnly,
  audit('ADMIN_MFA_SETUP', 'User'),
  superAdminController.setupAdminMfa
);
router.post(
  '/users/:id/mfa/enable',
  superAdminOnly,
  audit('ADMIN_MFA_ENABLE', 'User'),
  superAdminController.enableAdminMfa
);
router.post(
  '/users/:id/mfa/disable',
  superAdminOnly,
  audit('ADMIN_MFA_DISABLE', 'User'),
  superAdminController.disableAdminMfa
);
router.get('/users/:id/mfa/status', superAdminOnly, superAdminController.getAdminMfaStatus);
router.post(
  '/users/:id/mfa/backup-codes',
  superAdminOnly,
  audit('ADMIN_MFA_BACKUP_REGEN', 'User'),
  superAdminController.regenerateAdminBackupCodes
);

// ── Managed email / mobile / WhatsApp verification ─────────────────────
// Delegable for candidate/employer targets; `denyAdminTargets` keeps them
// off admin accounts.
router.post(
  '/users/:id/email/initiate',
  requireSubjectPermission('credentials.email'),
  validate(adminEmailInitiateSchema),
  audit('ADMIN_EMAIL_CHANGE_INITIATED', 'User'),
  superAdminController.initiateAdminEmailChange
);
router.post(
  '/users/:id/email/confirm',
  requireSubjectPermission('credentials.email'),
  validate(adminEmailConfirmSchema),
  audit('ADMIN_EMAIL_CHANGED', 'User'),
  superAdminController.confirmAdminEmailChange
);
router.post(
  '/users/:id/email/resend',
  requireSubjectPermission('credentials.email'),
  audit('ADMIN_EMAIL_OTP_RESENT', 'User'),
  superAdminController.resendAdminEmailOtp
);

router.post(
  '/users/:id/mobile/initiate',
  requireSubjectPermission('credentials.mobile'),
  validate(adminMobileInitiateSchema),
  audit('ADMIN_MOBILE_CHANGE_INITIATED', 'User'),
  superAdminController.initiateAdminMobileChange
);
router.post(
  '/users/:id/mobile/confirm',
  requireSubjectPermission('credentials.mobile'),
  validate(adminMobileConfirmSchema),
  audit('ADMIN_MOBILE_CHANGED', 'User'),
  superAdminController.confirmAdminMobileChange
);
router.post(
  '/users/:id/mobile/resend',
  requireSubjectPermission('credentials.mobile'),
  audit('ADMIN_MOBILE_OTP_RESENT', 'User'),
  superAdminController.resendAdminMobileOtp
);
router.delete(
  '/users/:id/mobile',
  requireSubjectPermission('credentials.mobile'),
  audit('ADMIN_MOBILE_REMOVED', 'User'),
  superAdminController.removeAdminMobile
);

router.post(
  '/users/:id/whatsapp/verify',
  requireSubjectPermission('credentials.whatsapp'),
  validate(adminWhatsappVerifySchema),
  audit('ADMIN_WHATSAPP_VERIFY_INITIATED', 'User'),
  superAdminController.initiateAdminWhatsappVerify
);
router.post(
  '/users/:id/whatsapp/change',
  requireSubjectPermission('credentials.whatsapp'),
  validate(adminWhatsappChangeSchema),
  audit('ADMIN_WHATSAPP_CHANGE_INITIATED', 'User'),
  superAdminController.initiateAdminWhatsappChange
);
router.post(
  '/users/:id/whatsapp/confirm',
  requireSubjectPermission('credentials.whatsapp'),
  validate(adminWhatsappConfirmSchema),
  audit('ADMIN_WHATSAPP_VERIFIED', 'User'),
  superAdminController.confirmAdminWhatsappOtp
);
router.delete(
  '/users/:id/whatsapp',
  requireSubjectPermission('credentials.whatsapp'),
  audit('ADMIN_WHATSAPP_REMOVED', 'User'),
  superAdminController.removeAdminWhatsappNumber
);

// Managed password change (verified with the acting super-admin's own
// password + OTP). The confirmation step re-authenticates the CALLER, so
// this flow is only meaningful for a super-admin and stays locked to them.
router.post(
  '/users/:id/password/initiate',
  superAdminOnly,
  validate(adminPasswordInitiateSchema),
  audit('ADMIN_PASSWORD_CHANGE_INITIATED', 'User'),
  superAdminController.initiateAdminPasswordChange
);
router.post(
  '/users/:id/password/confirm',
  superAdminOnly,
  validate(adminPasswordConfirmSchema),
  audit('ADMIN_PASSWORD_CHANGED', 'User'),
  superAdminController.confirmAdminPasswordChange
);
router.post(
  '/users/:id/password/resend',
  superAdminOnly,
  audit('ADMIN_PASSWORD_OTP_RESENT', 'User'),
  superAdminController.resendAdminPasswordOtp
);

export default router;
