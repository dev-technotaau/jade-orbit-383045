/**
 * BigQuery sync of billing events.
 *
 *   - `streamBillingEvent({event, payload})` — append-only insert into a
 *     single `billing_events` table (event_type column drives downstream
 *     analytics queries).
 *   - Best-effort. Failures are logged but never block the calling service.
 *
 * Driven by:
 *   - `billing-notification.service.ts` mapKindToTopic emits Kafka events
 *     on the consolidated `ha.billing` topic; this service mirrors each one
 *     into BigQuery.
 *   - Direct calls from billing services that already publish to Kafka can
 *     also call this directly.
 *
 * Schema (auto-created if missing on first call):
 *   - event_id (STRING, REQUIRED)            UUID per row, dedup key
 *   - event_type (STRING, REQUIRED)          billing.payment.captured etc.
 *   - user_id (STRING)                       buyer
 *   - ref_type (STRING)                      ORDER | SUBSCRIPTION | …
 *   - ref_id (STRING)                        primary identifier
 *   - amount_paise (INT64)                   when applicable
 *   - currency (STRING)                      INR / USD / …
 *   - plan_code (STRING)
 *   - created_at (TIMESTAMP, REQUIRED)
 *   - payload (JSON)                         full event JSON for ad-hoc queries
 *
 * The dataset/table names are env-configurable for local vs prod.
 */
import crypto from 'crypto';
import { bigqueryClient } from '../config/bigquery';
import { env } from '../config/env';
import logger from '../config/logger';

const DATASET = env.BILLING_BQ_DATASET;
const TABLE = env.BILLING_BQ_TABLE;

let _tableEnsured = false;

async function ensureTable(): Promise<void> {
  if (_tableEnsured || !bigqueryClient) return;
  try {
    const dataset = bigqueryClient.dataset(DATASET);
    const [datasetExists] = await dataset.exists();
    if (!datasetExists) {
      await dataset.create({ location: env.GOOGLE_CLOUD_LOCATION_ID });
      logger.info(`BigQuery dataset created: ${DATASET}`);
    }
    const table = dataset.table(TABLE);
    const [tableExists] = await table.exists();
    if (!tableExists) {
      await table.create({
        schema: {
          fields: [
            { name: 'event_id', type: 'STRING', mode: 'REQUIRED' },
            { name: 'event_type', type: 'STRING', mode: 'REQUIRED' },
            { name: 'user_id', type: 'STRING' },
            { name: 'ref_type', type: 'STRING' },
            { name: 'ref_id', type: 'STRING' },
            { name: 'amount_paise', type: 'INT64' },
            { name: 'currency', type: 'STRING' },
            { name: 'plan_code', type: 'STRING' },
            { name: 'created_at', type: 'TIMESTAMP', mode: 'REQUIRED' },
            { name: 'payload', type: 'JSON' },
          ],
          // Time-partitioned for cheap day-range queries
        },
        timePartitioning: { type: 'DAY', field: 'created_at' },
        clustering: { fields: ['event_type', 'user_id'] },
      });
      logger.info(`BigQuery table created: ${DATASET}.${TABLE}`);
    }
    _tableEnsured = true;
  } catch (err) {
    logger.error('BigQuery ensureTable failed', err);
  }
}

export interface BillingEventRow {
  eventType: string;
  userId?: string;
  refType?: string;
  refId?: string;
  amountPaise?: number;
  currency?: string;
  planCode?: string;
  payload?: Record<string, unknown>;
}

export async function streamBillingEvent(event: BillingEventRow): Promise<void> {
  if (!env.BILLING_BIGQUERY_SYNC_ENABLED) return;
  if (!bigqueryClient) return;
  try {
    await ensureTable();
    const row = {
      event_id: crypto.randomUUID(),
      event_type: event.eventType,
      user_id: event.userId ?? null,
      ref_type: event.refType ?? null,
      ref_id: event.refId ?? null,
      amount_paise: event.amountPaise ?? null,
      currency: event.currency ?? null,
      plan_code: event.planCode ?? null,
      created_at: new Date().toISOString(),
      payload: event.payload ?? null,
    };
    await bigqueryClient.dataset(DATASET).table(TABLE).insert([row], {
      raw: false,
      ignoreUnknownValues: false,
      skipInvalidRows: false,
    });
  } catch (err) {
    // Never throw — analytics drains are non-critical
    logger.warn('streamBillingEvent failed (non-fatal)', {
      eventType: event.eventType,
      err: err instanceof Error ? err.message : err,
    });
  }
}

/**
 * Run an arbitrary SQL query — used by analytics dashboards.
 * Caller must trust input (super-admin only).
 */
export async function queryBigQuery<T = Record<string, unknown>>(sql: string): Promise<T[]> {
  if (!bigqueryClient) {
    throw new Error('BigQuery client not configured');
  }
  const [rows] = await bigqueryClient.query({
    query: sql,
    location: env.GOOGLE_CLOUD_LOCATION_ID,
  });
  return rows as T[];
}
