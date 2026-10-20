import { defineConfig } from 'tsdown';

import { rawTextPlugin } from '../../build/raw-text-plugin.mjs';

export default defineConfig({
  entry: ['./src/index.ts'],
  format: ['esm'],
  dts: true,
  outDir: 'dist',
  clean: true,
  plugins: [rawTextPlugin()],
  deps: {
    neverBundle: [
      '@mymoon-ai/miki-code-oauth',
      '@mymoon-ai/miki-telemetry',
    ],
  },
});
