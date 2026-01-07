import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  target: 'node20',
  sourcemap: true,
  clean: true,
  outDir: 'dist',
  // Don't bundle node_modules for server
  external: [/^[^./]/],
});
