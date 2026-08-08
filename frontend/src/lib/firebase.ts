import { initializeApp, getApps, type FirebaseApp } from 'firebase/app';
import { getAuth, signInWithCustomToken, signOut, type Auth } from 'firebase/auth';
import { getMessaging, getToken, onMessage, type Messaging } from 'firebase/messaging';
import { getDatabase, type Database } from 'firebase/database';
import { getFirestore, type Firestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || '',
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || '',
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || '',
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || '',
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || '',
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || '',
  databaseURL: process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL || '',
};

let app: FirebaseApp | null = null;
let messaging: Messaging | null = null;
let database: Database | null = null;
let firestoreInstance: Firestore | null = null;

export function getFirebaseApp(): FirebaseApp {
  if (!app) {
    app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
  }
  return app;
}

export function getFirebaseMessaging(): Messaging | null {
  if (typeof window === 'undefined') return null;
  if (!messaging) {
    try {
      messaging = getMessaging(getFirebaseApp());
    } catch {
      console.warn('[Firebase] Messaging not supported');
      return null;
    }
  }
  return messaging;
}

export async function requestFCMToken(): Promise<string | null> {
  try {
    const msg = getFirebaseMessaging();
    if (!msg) return null;

    const vapidKey = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY || '';
    const token = await getToken(msg, { vapidKey });
    return token;
  } catch (error) {
    console.warn('[Firebase] Failed to get FCM token:', error);
    return null;
  }
}

export function onFCMMessage(
  callback: (payload: { title?: string; body?: string }) => void,
): (() => void) | null {
  const msg = getFirebaseMessaging();
  if (!msg) return null;

  return onMessage(msg, (payload) => {
    callback({
      title: payload.notification?.title,
      body: payload.notification?.body,
    });
  });
}

export function getFirebaseDatabase(): Database | null {
  if (typeof window === 'undefined') return null;
  if (!firebaseConfig.databaseURL) return null;
  if (!database) {
    try {
      database = getDatabase(getFirebaseApp());
    } catch {
      console.warn('[Firebase] Realtime Database not supported');
      return null;
    }
  }
  return database;
}

export function getFirebaseFirestore(): Firestore | null {
  if (typeof window === 'undefined') return null;
  if (!firebaseConfig.projectId) return null;
  if (!firestoreInstance) {
    try {
      firestoreInstance = getFirestore(getFirebaseApp());
    } catch {
      console.warn('[Firebase] Firestore not supported');
      return null;
    }
  }
  return firestoreInstance;
}

// ── Firebase Auth for RTDB (presence) ──

let firebaseAuth: Auth | null = null;
let firebaseSignInPromise: Promise<void> | null = null;

function getFirebaseAuth(): Auth | null {
  if (typeof window === 'undefined') return null;
  if (!firebaseAuth) {
    try {
      firebaseAuth = getAuth(getFirebaseApp());
    } catch {
      console.warn('[Firebase] Auth not supported');
      return null;
    }
  }
  return firebaseAuth;
}

/**
 * Sign into Firebase Auth using a custom token from our backend.
 * Idempotent — skips if already signed in. Called once after app login.
 * Firebase SDK auto-refreshes the session, so this only runs once per tab.
 */
export async function signInToFirebase(): Promise<void> {
  const auth = getFirebaseAuth();
  if (!auth) return;

  // Already signed in
  if (auth.currentUser) return;

  // Deduplicate concurrent calls
  if (firebaseSignInPromise) return firebaseSignInPromise;

  firebaseSignInPromise = (async () => {
    try {
      const res = await fetch('/api/auth/firebase-token', { credentials: 'include' });
      if (!res.ok) return;
      const json = await res.json();
      const token = json.data?.token;
      if (!token) return;
      await signInWithCustomToken(auth, token);
    } catch (error) {
      console.warn('[Firebase] Auth sign-in failed:', error);
    } finally {
      firebaseSignInPromise = null;
    }
  })();

  return firebaseSignInPromise;
}

/** Sign out of Firebase Auth (call on app logout). */
export async function signOutFirebase(): Promise<void> {
  const auth = getFirebaseAuth();
  if (!auth) return;
  try {
    await signOut(auth);
  } catch {
    // Silent — logout cleanup is best-effort
  }
}
