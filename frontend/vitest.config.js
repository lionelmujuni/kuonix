import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: {
    alias: {
      gsap: fileURLToPath(new URL('./test/stubs/gsap.js', import.meta.url)),
    },
  },
  test: {
    environment: 'jsdom',
    globals: false,
    setupFiles: ['./test/setup.js'],
    include: ['src/**/*.test.js'],
    exclude: ['node_modules/**', 'e2e/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov', 'html'],
      include: ['src/**/*.js'],
      exclude: [
        'src/**/*.test.js',
        'src/views/**/index.js',
        'src/components/**/index.js',
      ],
    },
  },
});
