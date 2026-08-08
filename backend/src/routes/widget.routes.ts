/**
 * Widget data endpoints — public, anonymous, CDN-friendly. Feeds the
 * Windows 11 Widgets Board (Microsoft Edge Adaptive Card host) declared
 * in the frontend `manifest.ts`.
 *
 * No auth — the data is the same data we already expose at
 * /api/v1/public/jobs (sanitised, public-searchable only).
 */
import { Router } from 'express';
import { publicLimiter } from '../middleware/rate-limit';
import { etagCache } from '../middleware/etag';
import { cache } from '../middleware/cache';
import * as widgetCtrl from '../controllers/widget.controller';

const router = Router();

router.get(
  '/recent-jobs',
  publicLimiter,
  etagCache({ ttl: 30 * 60, publicCdnCache: true }),
  cache({ ttl: 30 * 60 }),
  widgetCtrl.recentJobs
);

export default router;
