import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    'service-worker': 'src/background/service-worker.ts',
  },
  format: ['esm'],
  target: 'chrome120',
  sourcemap: true,
  clean: true,
  outDir: 'dist',
  // Bundle all dependencies (Chrome extension needs self-contained files)
  noExternal: [/.*/],
});
