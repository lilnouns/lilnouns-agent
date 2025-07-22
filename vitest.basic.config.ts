import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    // Exclude the main integration test that requires cloudflare:test
    exclude: ['**/node_modules/**', '**/test/index.test.ts'],
    // Only run service unit tests
    include: ['**/test/services/**/*.test.ts'],
  },
});
