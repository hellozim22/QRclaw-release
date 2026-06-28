/**
 * In-memory runtime metric aggregation.
 * Keeps the last MAX_SAMPLES samples per type for percentile calculation.
 * Exposed via GET /metrics HTTP endpoint.
 */

interface MetricSummary {
  count: number;
  totalMs: number;
  minMs: number;
  maxMs: number;
  avgMs: number;
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
  stepDeltas: Record<string, number>;
}

const MAX_SAMPLES = 1000;
const samples = new Map<string, number[]>();
const summaries = new Map<string, MetricSummary>();

/**
 * Record a completed span into aggregate metrics.
 * Called automatically by perf.endSpan().
 */
export const recordMetric = (
  type: string,
  totalMs: number,
  deltas: Record<string, number>
): void => {
  const pool = samples.get(type) || [];
  pool.push(totalMs);
  if (pool.length > MAX_SAMPLES) pool.shift();
  samples.set(type, pool);

  // Defensive: empty pool guard (should never happen but satisfies static analysis)
  if (pool.length === 0) return;

  const sorted = [...pool].sort((a, b) => a - b);
  const sum = pool.reduce((a, b) => a + b, 0);

  const pIdx = (p: number): number => Math.min(Math.floor(sorted.length * p), sorted.length - 1);

  // Fix: stepDeltas stores the *latest* span's step deltas (not cumulative)
  const stepDeltas: Record<string, number> = {};
  for (const [step, ms] of Object.entries(deltas)) {
    stepDeltas[step] = Math.round(ms * 100) / 100;
  }

  const summary: MetricSummary = {
    count: pool.length,
    totalMs: Math.round(sum * 100) / 100,
    minMs: Math.round(sorted[0] * 100) / 100,
    maxMs: Math.round(sorted[sorted.length - 1] * 100) / 100,
    avgMs: Math.round((sum / pool.length) * 100) / 100,
    p50Ms: Math.round(sorted[pIdx(0.5)] * 100) / 100,
    p95Ms: Math.round(sorted[pIdx(0.95)] * 100) / 100,
    p99Ms: Math.round(sorted[pIdx(0.99)] * 100) / 100,
    stepDeltas,
  };

  summaries.set(type, summary);
};

/**
 * Return all aggregated metrics (for /metrics endpoint).
 */
export const getMetrics = (): Record<string, MetricSummary> => {
  const result: Record<string, MetricSummary> = {};
  for (const [key, val] of summaries) {
    result[key] = val;
  }
  return result;
};

/**
 * Reset all metric state. Used in tests or graceful shutdown.
 */
export const resetMetrics = (): void => {
  samples.clear();
  summaries.clear();
};

// ─── Named counters (Phase 2 Wave 2 T2) ────────────────────────────
//
// Lightweight in-memory counter infrastructure. We deliberately do NOT pull
// in prom-client (drift note in the execution log): gateway already runs its
// own in-memory perf aggregator, and adding a Prometheus dependency would
// expand the supply-chain surface area for a 10-bucket counter.
//
// Cardinality contract: callers MUST encode any label inline in the counter
// name (e.g. `outbound_validation_failures_total:ack`). Never stuff
// connection-scoped identifiers (connectionId, sessionToken, userId) into
// the key — the map is unbounded and a per-connection counter would OOM
// the node. Keep keys to a small, enumerable set.

const counters = new Map<string, number>();

/**
 * Increment a named counter by `n` (default 1). Thread-safe only in the
 * sense that Node.js is single-threaded; do not call from worker threads.
 */
export const incrCounter = (name: string, n = 1): void => {
  counters.set(name, (counters.get(name) ?? 0) + n);
};

/**
 * Snapshot all counters for the /metrics endpoint. Returns a fresh object;
 * callers may freely mutate it.
 */
export const getCounters = (): Record<string, number> => Object.fromEntries(counters);

/**
 * Reset counter state. Used in tests; not wired into graceful shutdown
 * (counter values carry across the perf reset boundary on purpose —
 * failure counts should accumulate over the process lifetime).
 */
export const resetCounters = (): void => {
  counters.clear();
};
