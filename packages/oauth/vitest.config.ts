import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'miki-oauth',
    include: ['test/**/*.test.ts'],
  },
});
