import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/types.ts'],
  format: ['esm'],
  target: 'es2022',
  sourcemap: true,
  clean: true,
  outDir: 'dist',
  dts: true, // Generate .d.ts declarations
});
