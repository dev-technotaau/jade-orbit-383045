export interface FeatureFlags {
  // Core
  maintenanceMode: boolean;
  enableBetaFeatures: boolean;

  // Search & Matching
  enableElasticsearch: boolean;
  enableAIMatching: boolean;
  enableCloudTalent: boolean;

  // Notifications
  enableEmailNotifications: boolean;
  enableSMS: boolean;
  enableWhatsApp: boolean;
  enableFCM: boolean;
  enableWebhooks: boolean;

  // AI & Analytics
  enableDocumentAI: boolean;
  enableBigQuery: boolean;

  // Infrastructure
  enableKafka: boolean;
  enablePresence: boolean;
  enableFirestoreCounters: boolean;

  // Config values
  maxUploadSizeMB: number;

  [key: string]: boolean | string | number;
}
