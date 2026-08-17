'use client';

import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useSocket } from '@/hooks/use-socket';
import { showToast } from '@/components/ui/Toast';
import { stripWhatsAppFormatting } from '@/lib/wa-format';
import { getOpenConv } from '@/lib/wa-open-conv';
import type { WaMessage } from '@/types/whatsapp';
import { notifyCampaignComplete, notifyInbound } from './wa-notify';

/** The inbox route. Anywhere else in the module there is no thread on screen. */
const INBOX_PATH = '/whatsapp';

/**
 * The final `wa:campaign` frame, emitted by completeCampaign on the backend.
 * Progress frames carry the counters without `completed`, which is what tells
 * the two apart — the numbers alone cannot, since a run can pause on its last
 * batch and look identical.
 */
interface WaCampaignCompleted {
  id?: string;
  completed?: boolean;
  name?: string;
  totalRecipients?: number;
  sentCount?: number;
  failedCount?: number;
  failedRate?: number;
}

/**
 * Share of failed recipients above which a finished campaign is reported as a
 * problem rather than a result. A handful of failures across a large audience is
 * normal attrition (numbers that left WhatsApp); a fifth of them failing is a
 * rejected template, an exhausted tier or a dead token, and every later campaign
 * will fail the same way until someone looks.
 */
const CAMPAIGN_FAILURE_ALERT_RATE = 0.2;

/**
 * Inbound-message alerting for the whole WhatsApp module.
 *
 * This listener used to live inside the inbox page's own socket effect, so it
 * was mounted only while /whatsapp itself was open: an operator sitting on
 * /whatsapp/campaigns (or contacts, or settings) got no beep and no notification
 * for any inbound customer message — the one thing an inbox console exists to
 * tell you. Mounted from the section layout instead, it runs on every
 * /whatsapp/* page.
 *
 * `wa:message` arrives once per message (emitWa chains the inbox and
 * conversation rooms in a single emit), and the inbox page no longer notifies,
 * so there is exactly one alert per inbound message.
 *
 * It is also the module-wide host for `wa:settings`, for the same reason: the
 * settings singleton is read by the sidebar's Away toggle on every page — and
 * for `wa:campaign`, whose completion frame is the one campaign event an
 * operator has no way to sit and watch for.
 *
 * Renders nothing — it is a behaviour-only provider.
 */
export default function WaNotificationsProvider() {
  const { socket } = useSocket();
  const qc = useQueryClient();

  useEffect(() => {
    if (!socket) return;
    const onMessage = (data: { conversationId: string; message?: WaMessage }) => {
      const message = data.message;
      if (!message || message.direction !== 'INBOUND') return;
      // Stay quiet only when the operator is demonstrably reading this exact
      // thread: on the inbox, with it open, in a visible tab. `?c=` is read from
      // the URL on every event rather than subscribed to, so switching threads
      // does not re-register the socket listener.
      const watchingThread =
        window.location.pathname.replace(/\/+$/, '') === INBOX_PATH &&
        getOpenConv() === data.conversationId &&
        document.visibilityState === 'visible';
      if (watchingThread) return;
      const body =
        stripWhatsAppFormatting(message.text ?? '').trim() ||
        (message.type ? `New ${message.type.toLowerCase()} message` : 'New message');
      notifyInbound('New WhatsApp message', body, { conversationId: data.conversationId });
    };
    socket.on('wa:message', onMessage);
    return () => {
      socket.off('wa:message', onMessage);
    };
  }, [socket]);

  // Campaign completion. The backend fans the final frame out from
  // completeCampaign, so it arrives for a run the worker drained, one the
  // recovery cron finished and a retired drip sequence alike — and it arrives on
  // whichever /whatsapp/* page the operator is on, not only the campaigns list.
  const announced = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!socket) return;
    const onCampaign = (payload: WaCampaignCompleted) => {
      const id = payload?.id;
      if (!payload?.completed || !id) return;
      // completeCampaign can run twice for one campaign when the batch worker and
      // the recovery cron race to retire it, and the loser still emits a final
      // frame — key on the id so one finish is one alert. A recurring run is a
      // fresh clone with its own id, so it is still announced.
      if (announced.current.has(id)) return;
      announced.current.add(id);

      const name = payload.name?.trim() || 'Campaign';
      const sent = payload.sentCount ?? 0;
      const total = payload.totalRecipients ?? 0;
      const failed = payload.failedCount ?? 0;
      const rate = typeof payload.failedRate === 'number' ? payload.failedRate : 0;
      const detail =
        `${sent.toLocaleString()} of ${total.toLocaleString()} sent` +
        (failed > 0 ? ` · ${failed.toLocaleString()} failed` : '');

      // The toast is enough while the operator is actually looking at the tab;
      // the browser notification is for the case this exists to cover — a send
      // that takes hours, finishing long after they moved on.
      const backgrounded = document.visibilityState !== 'visible';

      if (rate >= CAMPAIGN_FAILURE_ALERT_RATE) {
        const pct = Math.round(rate * 100);
        showToast.warning(`${name} finished with ${pct}% failures`, detail);
        if (backgrounded) notifyCampaignComplete(`${name}: ${pct}% failed`, detail, id);
        return;
      }
      showToast.success(`${name} finished`, detail);
      if (backgrounded) notifyCampaignComplete(`${name} finished`, detail, id);
    };
    socket.on('wa:campaign', onCampaign);
    return () => {
      socket.off('wa:campaign', onCampaign);
    };
  }, [socket]);

  // The WhatsApp settings row is a singleton shared by every operator tab and
  // device, but each one only refetched it after its OWN save. So one operator
  // flipping Away left every other screen still showing Online — and the Settings
  // page still showing the old business hours and auto-reply state — with no way
  // to notice short of a manual reload. The backend now emits `wa:settings` on
  // every write; invalidating here refreshes whichever `wa-settings` consumers
  // are mounted (the sidebar Away toggle on every page, plus the Settings forms).
  useEffect(() => {
    if (!socket) return;
    const onSettings = () => {
      qc.invalidateQueries({ queryKey: ['wa-settings'] });
    };
    socket.on('wa:settings', onSettings);
    return () => {
      socket.off('wa:settings', onSettings);
    };
  }, [socket, qc]);

  return null;
}
