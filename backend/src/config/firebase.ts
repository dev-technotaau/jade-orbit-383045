import * as admin from 'firebase-admin';
import { env } from './env';
import logger from './logger';

try {
  if (env.FIREBASE_SERVICE_ACCOUNT) {
    // Parse the JSON string from environment variable
    const serviceAccount = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT);

    const firebaseConfig: admin.AppOptions = {
      credential: admin.credential.cert(serviceAccount),
    };

    // Only set databaseURL if provided (prevents "Can't determine Firebase Database URL" error)
    if (env.FIREBASE_DATABASE_URL) {
      firebaseConfig.databaseURL = env.FIREBASE_DATABASE_URL;
    }

    admin.initializeApp(firebaseConfig);

    logger.info('🔥 Firebase Admin initialized successfully');
  } else {
    logger.warn('⚠️ Firebase credentials missing - FCM disabled');
  }
} catch (error) {
  logger.error('❌ Firebase initialization failed:', error);
}

export const messaging = admin.apps.length ? admin.messaging() : null;
export const firestore = admin.apps.length ? admin.firestore() : null;
export const realtimeDb = admin.apps.length && env.FIREBASE_DATABASE_URL ? admin.database() : null;
export const auth = admin.apps.length ? admin.auth() : null;

export default admin;
