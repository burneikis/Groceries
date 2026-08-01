import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.js'],
    restoreMocks: true,
    coverage: {
      include: ['src/**/*.js'],
      exclude: ['src/**/*.test.js', 'src/test/**', 'src/server.js'],
    },
  },
});
