import { afterAll } from 'vitest';
import '@testing-library/jest-dom/vitest';

// Test env defaults live in vitest.config.ts `test.env` so they apply before any module import in the worker.

afterAll(() => {
  // Global teardown
});
