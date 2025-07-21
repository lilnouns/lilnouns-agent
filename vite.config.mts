import { defineConfig } from 'vite';
import { cloudflare } from '@cloudflare/vite-plugin';

export default defineConfig({
  plugins: [
    cloudflare({
      // Configure the plugin for Cloudflare Workers
      configPath: './wrangler.toml',
    }),
  ],
  build: {
    // Output directory for the built worker
    outDir: 'dist',
    // Generate source maps for debugging
    sourcemap: true,
    // Minify the output
    minify: true,
    // Target ES2022 to match our TypeScript config
    target: 'es2022',
    // Rollup options for the build
    rollupOptions: {
      // Ensure we're building for the worker environment
      external: [],
    },
  },
  // Configure for testing with Vitest
  test: {
    // Use standard Node.js environment for basic tests
    environment: 'node',
    // Optionally use workers pool for integration tests
    // pool: '@cloudflare/vitest-pool-workers',
    // poolOptions: {
    //   workers: {
    //     wrangler: {
    //       configPath: './wrangler.toml',
    //     },
    //   },
    // },
  },
});
