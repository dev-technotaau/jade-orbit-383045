'use client';

import { useEffect } from 'react';
import { useSocket } from '@/hooks/use-socket';
import { showToast } from '@/components/ui/Toast';

interface EmailAlert {
  type: 'circuit_breaker' | 'dns';
  campaignId?: string;
  reason?: string;
  fromEmail?: string;
  dkim?: boolean;
  spf?: boolean;
  dmarc?: boolean;
}

/**
 * Surfaces backend `email:alert` events (campaign auto-pause circuit-breaker,
 * sender DNS regression) as toasts anywhere inside the email section. Renders
 * nothing — mounted once by the email section layout.
 */
export default function EmailAlertListener() {
  const { socket } = useSocket();

  useEffect(() => {
    if (!socket) return;
    const onAlert = (a: EmailAlert) => {
      if (a?.type === 'circuit_breaker') {
        showToast.error(
          `Campaign auto-paused — ${a.reason === 'complaint_rate' ? 'complaint' : 'bounce'} rate exceeded the safety threshold.`,
        );
      } else if (a?.type === 'dns') {
        const broken = [!a.spf && 'SPF', !a.dkim && 'DKIM', !a.dmarc && 'DMARC']
          .filter(Boolean)
          .join(', ');
        showToast.warning(
          `Deliverability alert: ${broken} not verifying for ${a.fromEmail ?? 'sender'}.`,
        );
      }
    };
    socket.on('email:alert', onAlert);
    return () => {
      socket.off('email:alert', onAlert);
    };
  }, [socket]);

  return null;
}
