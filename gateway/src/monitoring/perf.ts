/**
 * Lightweight performance span tracer.
 * Enabled via ENABLE_PERF_LOG=true env var — zero overhead when disabled.
 * Supports runtime toggle via setPerfEnabled().
 */
import { performance } from 'node:perf_hooks';
import { recordMetric } from './metrics.js';

let enabled = process.env.ENABLE_PERF_LOG === 'true';

export const isEnabled = (): boolean => enabled;

/**
 * Toggle perf tracing at runtime (no restart needed).
 */
export const setPerfEnabled = (value: boolean): void => {
  enabled = value;
};

export interface PerfSpan {
  traceId: string;
  type: string;
  steps: Map<string, number>;
  t0: number;
}

/**
 * Start a performance trace span.
 */
export const startSpan = (traceId: string, type: string): PerfSpan => ({
  traceId,
  type,
  steps: new Map(),
  t0: enabled ? performance.now() : 0,
});

/**
 * Record the completion of a pipeline step.
 * No-op when perf tracing is disabled.
 */
export const markStep = (span: PerfSpan | null, step: string): void => {
  if (!enabled || !span) return;
  span.steps.set(step, performance.now() - span.t0);
};

/**
 * End a span: output structured log and record aggregate metrics.
 */
export const endSpan = (span: PerfSpan | null): void => {
  if (!enabled || !span) return;

  const elapsed = performance.now() - span.t0;

  const steps: Record<string, number> = {};
  const deltas: Record<string, number> = {};

  let prev = 0;
  const sorted = [...span.steps.entries()].sort((a, b) => a[1] - b[1]);
  for (const [name, ms] of sorted) {
    const rounded = Math.round(ms * 100) / 100;
    steps[name] = rounded;
    deltas[name] = Math.round((ms - prev) * 100) / 100;
    prev = ms;
  }

  console.log(
    JSON.stringify({
      ts: new Date().toISOString(),
      level: 'info',
      msg: 'perf_span',
      traceId: span.traceId,
      type: span.type,
      totalMs: Math.round(elapsed * 100) / 100,
      steps,
      deltas,
    })
  );

  recordMetric(span.type, elapsed, deltas);
};

// ─── re-export for metrics endpoint ────────────────────────────────
export { getMetrics, resetMetrics } from './metrics.js';
