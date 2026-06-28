/**
 * Gateway feature flags (decoded once at module load).
 *
 * Phase 2 Wave 2 §3.4: outbound WS validation can run in one of two modes:
 *   - 'strict'   → invalid frames are dropped (default in non-production)
 *   - 'log-only' → invalid frames are still sent (default in production, so
 *                  the Zod rollout cannot regress behavior on day one)
 *
 * The mode is read from the `QRCLAW_OUTBOUND_VALIDATION` env var; when
 * unset the default depends on `NODE_ENV`. There is no hot-reload — the
 * value is captured at module load time and cached.
 *
 * Test-only resetters (`setOutboundValidationModeForTest`,
 * `resetOutboundValidationMode`) let vitest subtests exercise both branches
 * without shelling out to env mutation. They are NOT part of the runtime
 * contract; production code must never call them.
 */

export type OutboundValidationMode = 'strict' | 'log-only';

const VALID_MODES: readonly OutboundValidationMode[] = ['strict', 'log-only'];

const computeDefaultMode = (): OutboundValidationMode => {
  const envValue = process.env.QRCLAW_OUTBOUND_VALIDATION;
  if (envValue && VALID_MODES.includes(envValue as OutboundValidationMode)) {
    return envValue as OutboundValidationMode;
  }
  // Intentionally read NODE_ENV on each reset rather than caching it, so that
  // vitest (which pins NODE_ENV='test') follows the non-production branch.
  return process.env.NODE_ENV === 'production' ? 'log-only' : 'strict';
};

let currentMode: OutboundValidationMode = computeDefaultMode();

export const getOutboundValidationMode = (): OutboundValidationMode => currentMode;

/**
 * Test-only override. Lets a subtest force 'strict' or 'log-only' without
 * mutating `process.env`. Do not call from production code paths.
 */
export const setOutboundValidationModeForTest = (mode: OutboundValidationMode): void => {
  currentMode = mode;
};

/**
 * Test-only reset. Recomputes the default from the current env so a later
 * subtest starts from a clean slate. Do not call from production code paths.
 */
export const resetOutboundValidationMode = (): void => {
  currentMode = computeDefaultMode();
};
