import { defineConfig } from 'vitest/config';
import path from 'path';

const webRoot = path.resolve(__dirname, '../web');
const testsRoot = __dirname;

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(webRoot, 'src'),
      // Phase 2 Wave 1: web now imports types from shared/contracts/http/** via
      // the @shared/contracts/* path alias (see web/tsconfig.json). Vitest
      // resolves independently of Next.js's tsconfig paths, so mirror the
      // alias here so web source files importing @shared/... compile under
      // vitest + jsdom (e.g. unit/frontend/cta-subscribe.test.ts).
      '@shared/contracts': path.resolve(testsRoot, '../shared/contracts'),
      // Force single React from tests/ — imports inside web/src still walked up to web/node_modules otherwise
      react: path.resolve(testsRoot, 'node_modules/react'),
      'react-dom': path.resolve(testsRoot, 'node_modules/react-dom'),
      'lucide-react': path.resolve(testsRoot, 'node_modules/lucide-react'),
      zustand: path.resolve(testsRoot, 'node_modules/zustand'),
      'react-markdown': path.resolve(testsRoot, 'node_modules/react-markdown'),
      // web/src uses qrcode; CI runs Vitest from tests/ — pin resolution like react
      qrcode: path.resolve(testsRoot, 'node_modules/qrcode'),
      // shared/contracts/ws/protocol.ts imports zod; files under shared/ have
      // no node_modules on the lookup path, so alias to tests/node_modules/zod.
      zod: path.resolve(testsRoot, 'node_modules/zod'),
      // scripts/agent-sdk/ and plugins/openclaw/src/ import ws; same situation.
      ws: path.resolve(testsRoot, 'node_modules/ws'),
    },
  },
  test: {
    globals: true,
    env: {
      NODE_ENV: 'test',
      SUPABASE_URL: process.env.SUPABASE_URL || 'http://localhost:54321',
      SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY || 'test-anon-key',
      SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY || 'test-service-role-key',
      REDIS_URL: process.env.REDIS_URL || 'redis://localhost:6379',
      GATEWAY_PORT: process.env.GATEWAY_PORT || '8080',
      // Phase 2 Wave 2 T5: outbound WS Zod validation runs in strict mode
      // under tests so any regression (an emit site building a frame the
      // outbound schema rejects) surfaces as a red test instead of a silent
      // log-only warning. Production still defaults to 'log-only' for the
      // §3.4 7-day rollout safety window; the flip to prod strict is a
      // future deploy-env change not captured in this commit.
      QRCLAW_OUTBOUND_VALIDATION: 'strict',
    },
    environment: 'jsdom',
    environmentMatchGlobs: [
      ['unit/backend/**', 'node'],
      ['unit/database/**', 'node'],
      ['integration/**', 'node'],
      ['acceptance/**', 'node'],
    ],
    include: [
      'unit/**/*.test.ts',
      'unit/**/*.test.tsx',
      'integration/**/*.test.ts',
      'e2e/flows/**/*.spec.ts',
      'e2e/mobile/**/*.spec.ts',
      'e2e/web/**/*.spec.ts',
      // Static acceptance checks (grep-based iron-rule red lines). Runs in
      // node env; see tests/acceptance/iron-rules.spec.ts.
      'acceptance/iron-rules.spec.ts',
      'acceptance/plugin-indistinguishable.spec.ts',
    ],
    exclude: ['e2e/sample.spec.ts', 'e2e/pages/**', 'node_modules/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      reportsDirectory: './coverage',
      thresholds: {
        branches: 80,
        functions: 80,
        lines: 80,
        statements: 80,
      },
      exclude: ['node_modules/**', 'fixtures/**', 'helpers/**', 'mocks/**', '**/*.config.ts'],
    },
    setupFiles: ['./helpers/setup.ts'],
    testTimeout: 10000,
    // Narrow typecheck: only validate expectTypeOf assertions in the shared
    // contracts parity tests. Keeps blast radius tiny so unrelated pre-existing
    // source errors don't fail runs.
    typecheck: {
      enabled: true,
      include: ['unit/shared/contracts-ws-protocol.test.ts'],
      tsconfig: './tsconfig.shared-typecheck.json',
    },
  },
});
