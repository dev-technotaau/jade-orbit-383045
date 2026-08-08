import { Router } from 'express';
import * as ctrl from '../controllers/email-tracking.controller';

/**
 * Public email tracking + unsubscribe endpoints. Mounted on the app at
 * `/api/v1/webhooks/email` (BEFORE CSRF + the API rate limiter, and covered by
 * the ingress ModSecurity `/api/v1/webhooks/` exemption). No auth — these are
 * the pixel/link/unsub URLs embedded in outbound campaign mail.
 */
const router = Router();

router.get('/o/:token', ctrl.open); // open pixel
router.get('/c/:token', ctrl.click); // click redirect
router.post('/u/:token', ctrl.unsubscribeOneClick); // RFC 8058 one-click
router.get('/u/:token', ctrl.unsubscribeLanding); // human landing
router.get('/confirm/:token', ctrl.confirm); // double opt-in confirmation
router.get('/preferences/:token', ctrl.preferences); // preference center (manage/resubscribe)

// Notification DIGEST opt-out — separate from the campaign unsubscribe above:
// this flips a per-category preference, not an EmailContact subscribe status.
router.post('/n/u/:token', ctrl.notificationUnsubscribeOneClick); // RFC 8058 one-click
router.get('/n/u/:token', ctrl.notificationUnsubscribeLanding); // human landing

export default router;
