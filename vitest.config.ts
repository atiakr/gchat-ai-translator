import { defineConfig } from 'vitest/config';
import { WxtVitest } from 'wxt/testing/vitest-plugin';

export default defineConfig({
  plugins: [WxtVitest()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['tests/setup.ts'],
    // '?inline' CSS 가 빈 문자열로 치환되지 않도록(shadow.ts 가 토큰 CSS 를 주입한다).
    css: true,
    include: [
      'src/**/*.test.{ts,tsx}',
      'entrypoints/**/*.test.{ts,tsx}',
      'tests/**/*.test.{ts,tsx}',
    ],
  },
});
