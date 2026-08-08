import type { Request, Response } from 'express';
import { Router } from 'express';
import logger from '../config/logger';

const router = Router();

interface AlertManagerAlert {
  status: 'firing' | 'resolved';
  labels: Record<string, string>;
  annotations: Record<string, string>;
  startsAt: string;
  endsAt: string;
  generatorURL: string;
  fingerprint: string;
}

interface AlertManagerPayload {
  version: string;
  groupKey: string;
  status: 'firing' | 'resolved';
  receiver: string;
  alerts: AlertManagerAlert[];
  commonLabels: Record<string, string>;
  commonAnnotations: Record<string, string>;
  externalURL: string;
}

// POST /api/v1/internal/alertmanager — receives AlertManager webhook payloads
// No authentication — only accessible from within the cluster (K8s internal service URL)
router.post('/', (req: Request, res: Response) => {
  const payload = req.body as AlertManagerPayload;

  for (const alert of payload.alerts) {
    const severity = alert.labels.severity || 'unknown';
    const alertname = alert.labels.alertname || 'unnamed';
    const summary = alert.annotations.summary || alert.annotations.description || '';

    if (alert.status === 'firing') {
      logger.warn(`[AlertManager] FIRING ${severity}/${alertname}: ${summary}`, {
        alertname,
        severity,
        status: alert.status,
        labels: alert.labels,
        startsAt: alert.startsAt,
      });
    } else {
      logger.info(`[AlertManager] RESOLVED ${alertname}: ${summary}`, {
        alertname,
        severity,
        status: alert.status,
        labels: alert.labels,
        endsAt: alert.endsAt,
      });
    }
  }

  // Acknowledge receipt — AlertManager expects 2xx
  res.status(200).json({ status: 'ok', received: payload.alerts.length });
});

export default router;
