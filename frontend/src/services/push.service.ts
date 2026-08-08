import api from '@/lib/api';
import { API } from '@/constants/api';
import type { ApiResponse } from '@/types/api';

export const pushService = {
  /** Register an FCM device token with the backend */
  async registerFCMToken(token: string, platform: string = 'WEB'): Promise<ApiResponse<null>> {
    const res = await api.post(API.DEVICES.FCM, { token, platform });
    return res.data;
  },

  /** Unregister an FCM device token */
  async unregisterFCMToken(tokenId: string): Promise<ApiResponse<null>> {
    const res = await api.delete(API.DEVICES.FCM_DELETE(tokenId));
    return res.data;
  },

  /** Subscribe to web push notifications (VAPID) */
  async subscribeWebPush(subscription: PushSubscriptionJSON): Promise<ApiResponse<null>> {
    const res = await api.post(API.DEVICES.PUSH_SUBSCRIPTIONS, subscription);
    return res.data;
  },

  /** Unsubscribe from web push */
  async unsubscribeWebPush(subscriptionId: string): Promise<ApiResponse<null>> {
    const res = await api.delete(API.DEVICES.PUSH_SUBSCRIPTION_DELETE(subscriptionId));
    return res.data;
  },

  /** Request browser notification permission and subscribe */
  async requestPermissionAndSubscribe(): Promise<boolean> {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      return false;
    }

    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      return false;
    }

    // Try Web Push via service worker
    try {
      const registration = await navigator.serviceWorker?.ready;
      if (registration) {
        const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
        if (vapidKey) {
          const subscription = await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: vapidKey,
          });
          await this.subscribeWebPush(subscription.toJSON());
          return true;
        }
      }
    } catch (error) {
      console.warn('[Push] Web push subscription failed:', error);
    }

    // Try FCM fallback
    try {
      const { requestFCMToken } = await import('@/lib/firebase');
      const fcmToken = await requestFCMToken();
      if (fcmToken) {
        await this.registerFCMToken(fcmToken);
        return true;
      }
    } catch (error) {
      console.warn('[Push] FCM registration failed:', error);
    }

    return false;
  },
};
