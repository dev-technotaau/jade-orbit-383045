/* eslint-disable no-undef */
importScripts('https://www.gstatic.com/firebasejs/11.4.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/11.4.0/firebase-messaging-compat.js');

// Config is passed from the main app via postMessage, or falls back to injected config
let firebaseConfig = self.__FIREBASE_CONFIG__ || null;

function handleBackgroundMessage(payload) {
    const title = payload.notification?.title || 'Hire Adda';
    const options = {
        body: payload.notification?.body || '',
        icon: '/icon-192x192.png',
        badge: '/icon-72x72.png',
        data: payload.data,
        tag: payload.data?.tag || 'default',
    };

    self.registration.showNotification(title, options);
}

function initFirebase() {
    if (!firebaseConfig || firebase.apps.length > 0) return;
    firebase.initializeApp(firebaseConfig);
    const messaging = firebase.messaging();
    messaging.onBackgroundMessage(handleBackgroundMessage);
}

self.addEventListener('message', (event) => {
    if (event.data?.type === 'FIREBASE_CONFIG' && event.data.config) {
        firebaseConfig = event.data.config;
        initFirebase();
    }
});

// Initialize immediately if config is available at load time
if (firebaseConfig) {
    initFirebase();
}

self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    const url = event.notification.data?.url || '/';
    event.waitUntil(
        self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
            for (const client of clients) {
                if (client.url === url && 'focus' in client) {
                    return client.focus();
                }
            }
            return self.clients.openWindow(url);
        })
    );
});
