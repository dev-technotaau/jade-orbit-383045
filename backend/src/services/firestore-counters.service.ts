import { firestore } from '../config/firebase';
import logger from '../config/logger';
import { isFeatureEnabled } from '../config/feature-flags';

const COUNTERS_COLLECTION = 'counters';
const COUNTERS_DOC = 'platform';

export type CounterMetric =
  | 'activeUsers'
  | 'jobsPostedToday'
  | 'applicationsToday'
  | 'newUsersToday';

export const firestoreCountersService = {
  async incrementCounter(metric: CounterMetric, amount: number = 1): Promise<void> {
    if (!(await isFeatureEnabled('enableFirestoreCounters'))) return;
    if (!firestore) return;
    try {
      const { FieldValue } = await import('firebase-admin/firestore');
      const docRef = firestore.collection(COUNTERS_COLLECTION).doc(COUNTERS_DOC);
      await docRef.set(
        { [metric]: FieldValue.increment(amount), updatedAt: new Date().toISOString() },
        { merge: true }
      );
    } catch (error) {
      logger.debug(`Firestore counter increment failed: ${(error as Error).message}`);
    }
  },

  async getCounters(): Promise<Record<string, number>> {
    if (!(await isFeatureEnabled('enableFirestoreCounters'))) return {};
    if (!firestore) return {};
    try {
      const docRef = firestore.collection(COUNTERS_COLLECTION).doc(COUNTERS_DOC);
      const snapshot = await docRef.get();
      if (!snapshot.exists) return {};
      const data = snapshot.data() || {};
      return {
        activeUsers: data.activeUsers || 0,
        jobsPostedToday: data.jobsPostedToday || 0,
        applicationsToday: data.applicationsToday || 0,
        newUsersToday: data.newUsersToday || 0,
      };
    } catch (error) {
      logger.debug(`Firestore getCounters failed: ${(error as Error).message}`);
      return {};
    }
  },

  async resetDailyCounters(): Promise<void> {
    if (!(await isFeatureEnabled('enableFirestoreCounters'))) return;
    if (!firestore) return;
    try {
      const docRef = firestore.collection(COUNTERS_COLLECTION).doc(COUNTERS_DOC);
      await docRef.set(
        {
          jobsPostedToday: 0,
          applicationsToday: 0,
          newUsersToday: 0,
          updatedAt: new Date().toISOString(),
        },
        { merge: true }
      );
      logger.info('Daily Firestore counters reset');
    } catch (error) {
      logger.debug(`Firestore resetDailyCounters failed: ${(error as Error).message}`);
    }
  },
};
