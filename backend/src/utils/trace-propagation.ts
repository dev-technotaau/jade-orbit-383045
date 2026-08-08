import type { SpanKind } from '@opentelemetry/api';
import { context, trace, propagation, type SpanStatusCode } from '@opentelemetry/api';

const TRACER_NAME = 'hire-adda-api';

/**
 * Inject current trace context into a plain object.
 * Used for Kafka message headers and BullMQ job data.
 * Returns { traceparent: '...', tracestate: '...' } if a trace is active,
 * or an empty object if OTEL is not initialized.
 */
export function injectTraceContext(): Record<string, string> {
  const carrier: Record<string, string> = {};
  propagation.inject(context.active(), carrier);
  return carrier;
}

/**
 * Extract trace context from a carrier object and execute a callback
 * within that context, creating a new child span.
 *
 * @param carrier - Object containing traceparent/tracestate (from Kafka headers or BullMQ job data)
 * @param name - Span name (e.g., 'kafka.process user.registered', 'bullmq.process send-email')
 * @param kind - SpanKind.CONSUMER for message processing
 * @param fn - Async function to execute within the extracted context
 */
export function withExtractedContext<T>(
  carrier: Record<string, string>,
  name: string,
  kind: SpanKind,
  fn: () => Promise<T>
): Promise<T> {
  const extractedContext = propagation.extract(context.active(), carrier);
  const tracer = trace.getTracer(TRACER_NAME);

  return context.with(extractedContext, () => {
    return tracer.startActiveSpan(name, { kind }, async (span) => {
      try {
        const result = await fn();
        return result;
      } catch (err) {
        span.recordException(err as Error);
        span.setStatus({ code: 2 as SpanStatusCode });
        throw err;
      } finally {
        span.end();
      }
    });
  });
}

export { SpanKind } from '@opentelemetry/api';
