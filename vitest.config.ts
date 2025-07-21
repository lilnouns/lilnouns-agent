import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Use standard Node.js environment for basic unit tests
    environment: 'node',
    // Include test files
    include: ['src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    // Exclude node_modules and dist
    exclude: ['node_modules', 'dist'],
    // Enable globals for easier testing
    globals: true,
  },
});
