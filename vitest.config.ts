import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: [
      'src/**/*.test.ts',
      'server/**/*.test.ts',
      'scripts/**/*.test.ts',
      '*.test.ts',
    ],
    exclude: [
      'node_modules/**',
      'dist/**',
      '.omnirush/**',
      'leish-studio-google/**',
    ],
    // Server integration suites intentionally configure process.env before
    // importing the singleton app. Run files serially so their isolated store
    // paths cannot race in the same worker.
    fileParallelism: false,
    maxWorkers: 1,
    // The suite boots the Express app and bcrypt seed hashes; give it room.
    testTimeout: 20000,
    hookTimeout: 60000,
  },
});
