import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Only this project's tests: fixtures/ and examples/ may contain sample apps with their own test files.
    include: ['test/**/*.test.ts'],
  },
});
