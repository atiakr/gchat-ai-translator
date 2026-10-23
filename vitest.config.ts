import { defineConfig } from 'vitest/config';
import { WxtVitest } from 'wxt/testing/vitest-plugin';

export default defineConfig({
  plugins: [WxtVitest()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['tests/setup.ts'],
    include: [
      'src/**/*.test.{ts,tsx}',
      'entrypoints/**/*.test.{ts,tsx}',
      'tests/**/*.test.{ts,tsx}',
    ],
  },
});
