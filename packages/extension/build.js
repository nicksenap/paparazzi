import * as esbuild from 'esbuild';

const watch = process.argv.includes('--watch');

/** @type {esbuild.BuildOptions} */
const commonOptions = {
  bundle: true,
  format: 'esm',
  target: 'chrome120',
  sourcemap: true,
  logLevel: 'info',
};

// Build service worker (background script)
const serviceWorkerBuild = esbuild.build({
  ...commonOptions,
  entryPoints: ['src/background/service-worker.ts'],
  outfile: 'dist/service-worker.js',
});

if (watch) {
  console.log('Watching for changes...');

  const serviceWorkerCtx = await esbuild.context({
    ...commonOptions,
    entryPoints: ['src/background/service-worker.ts'],
    outfile: 'dist/service-worker.js',
  });

  await serviceWorkerCtx.watch();
} else {
  await serviceWorkerBuild;
  console.log('Build complete!');
}
