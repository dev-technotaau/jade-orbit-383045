/**
 * Safe custom job IDs for BullMQ.
 * ═══════════════════════════════════════════════════════════════════════
 *
 * BullMQ rejects a custom `jobId` at enqueue time in two cases
 * (bullmq/dist/cjs/classes/job.js — `Job.addJob`):
 *
 *   1. the id parses as an integer  → `Custom Id cannot be integers`
 *   2. the id contains `:` AND does NOT split into exactly 3 parts
 *                                   → `Custom Id cannot contain :`
 *
 * Rule 2 is the trap. Redis keys are colon-delimited, so BullMQ reserves the
 * character — but it grandfathers ids with exactly two colons for legacy
 * repeatable jobs. That means `agg:<id>:<window>` is accepted while
 * `invoice:<id>` and `reindex:job:<id>:index` both throw, so the same
 * "namespace:value" habit works in some queues and blows up in others. The
 * failure is at ENQUEUE time and is easy to miss: several call sites wrap the
 * add in `.catch()` and log it as non-fatal, so the work simply never
 * happened. One of them (ES reindex, reached from the Kafka `ha.jobs`
 * consumer) surfaced only as dead-letter-queue alerts.
 *
 * Building ids through this helper removes the whole class: `-` is not
 * reserved, and the prefix guarantees the result can never parse as an
 * integer.
 */
export function safeJobId(...parts: Array<string | number>): string {
  return parts
    .map((p) => String(p).replace(/:/g, '-'))
    .filter((p) => p.length > 0)
    .join('-');
}
