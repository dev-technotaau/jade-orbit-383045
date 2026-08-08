import { Client } from '@opensearch-project/opensearch';
import { env } from './env';
import logger from './logger';

// OpenSearch Client (drop-in replacement for Elasticsearch)
const rawClient = new Client({
  node: env.ELASTICSEARCH_URL,
  auth: env.ELASTICSEARCH_USERNAME
    ? {
        username: env.ELASTICSEARCH_USERNAME,
        password: env.ELASTICSEARCH_PASSWORD || '',
      }
    : undefined,
  ssl: env.NODE_ENV === 'production' ? { rejectUnauthorized: true } : { rejectUnauthorized: false },
});

// ─── ES v8+ → OpenSearch request param adapter ─────────────────────────
// ES v8+ flattened body params to top-level: { index, query, size, ... }
// OpenSearch client expects them inside body: { index, body: { query, size, ... } }
// This adapter auto-wraps non-meta params into body so existing code works as-is.

const META_PARAMS = new Set([
  'index',
  'id',
  'type',
  'routing',
  'refresh',
  'timeout',
  'pipeline',
  'scroll',
  'preference',
  'wait_for_active_shards',
  '_source_includes',
  '_source_excludes',
  'scroll_id',
  'expand_wildcards',
  'ignore_unavailable',
  'allow_no_indices',
  'master_timeout',
  'cluster_manager_timeout',
  'wait_for_completion',
  'slices',
  'conflicts',
  'requests_per_second',
  'max_num_segments',
  'only_expunge_deletes',
  'require_alias',
  'if_seq_no',
  'if_primary_term',
  'version',
  'version_type',
  'op_type',
  'format',
  'pretty',
  'human',
  'error_trace',
  'filter_path',
  'flat_settings',
  'include_defaults',
  'body',
]);

function wrapBodyParams(args: any[]): any[] {
  if (!args.length || typeof args[0] !== 'object' || args[0] === null) return args;
  const params = args[0];

  // Already has body — no wrapping needed
  if ('body' in params) return args;

  const meta: Record<string, any> = {};
  const body: Record<string, any> = {};

  for (const [key, value] of Object.entries(params)) {
    if (META_PARAMS.has(key)) {
      meta[key] = value;
    } else {
      body[key] = value;
    }
  }

  // ES v8 .index() uses { document }, OpenSearch uses { body: <doc> }
  if ('document' in body) {
    const doc = body.document;
    return [{ ...meta, body: doc }, ...args.slice(1)];
  }

  // ES v8 .bulk() uses { operations }, OpenSearch uses { body: [...] }
  if ('operations' in body) {
    const ops = body.operations;
    return [{ ...meta, body: ops }, ...args.slice(1)];
  }

  // No body params extracted — pass through unchanged
  if (Object.keys(body).length === 0) return args;

  return [{ ...meta, body }, ...args.slice(1)];
}

// ─── Response unwrapper ─────────────────────────────────────────────────
// The OpenSearch client wraps all responses in { body, statusCode, headers }.
// The Elasticsearch v8+ client returns the body directly.
// This proxy auto-unwraps .body so existing code works without modification.

function unwrapNamespace(ns: any): any {
  return new Proxy(ns, {
    get(target: any, prop: string | symbol) {
      const val = target[prop];
      if (typeof val !== 'function') return val;
      return async (...args: any[]) => {
        const res = await val.apply(target, wrapBodyParams(args));
        return res?.body !== undefined ? res.body : res;
      };
    },
  });
}

const elasticClient: any = new Proxy(rawClient, {
  get(target: any, prop: string | symbol) {
    const value = target[prop];
    if (value === null || value === undefined) return value;
    if (typeof value === 'function') {
      return async (...args: any[]) => {
        const res = await value.apply(target, wrapBodyParams(args));
        return res?.body !== undefined ? res.body : res;
      };
    }
    if (typeof value === 'object') {
      return unwrapNamespace(value);
    }
    return value;
  },
});

export const checkElasticConnection = async () => {
  try {
    const health = await elasticClient.cluster.health();
    logger.info(`✅ Elasticsearch connected: ${health.status}`);
  } catch (error) {
    logger.error('❌ Elasticsearch connection failed:', error as Error);
    // Don't crash app if search is optional, but log it
  }
};

export default elasticClient;
