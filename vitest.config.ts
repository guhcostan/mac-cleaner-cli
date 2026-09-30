import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
    testTimeout: 10000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'json-summary', 'lcov'],
      exclude: [
        'node_modules/**',
        'dist/**',
        '**/*.test.ts',
        '**/index.ts',
        'src/scanners/duplicates.ts',
        'src/scanners/node-modules.ts',
        // src/utils/backup.ts left this list: it is no longer dead code and now
        // runs on the deletion path. A module that can lose a user's file does
        // not sit outside the coverage count.
        'src/utils/checkbox.ts',
      ],
      thresholds: {
        lines: 90,
        functions: 90,
        branches: 80,
        statements: 90,
      },
    },
  },
});

