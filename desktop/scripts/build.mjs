// Bundles the main process, preload script and renderer into dist/.
// The CLI's scanners (../src) are bundled into main.cjs, so the packaged
// app ships no node_modules at all.
import { build } from 'esbuild';
import { cp, mkdir, rm } from 'fs/promises';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');
const dev = process.argv.includes('--dev');

await rm(dist, { recursive: true, force: true });
await mkdir(join(dist, 'renderer'), { recursive: true });

const common = {
  bundle: true,
  sourcemap: dev ? 'inline' : false,
  minify: !dev,
  logLevel: 'info',
  legalComments: 'none',
};

await Promise.all([
  build({
    ...common,
    entryPoints: [join(root, 'src/main/main.ts')],
    outfile: join(dist, 'main.cjs'),
    platform: 'node',
    format: 'cjs',
    target: 'node22',
    external: ['electron'],
  }),
  build({
    ...common,
    entryPoints: [join(root, 'src/preload/preload.ts')],
    outfile: join(dist, 'preload.cjs'),
    platform: 'node',
    format: 'cjs',
    target: 'node22',
    external: ['electron'],
  }),
  build({
    ...common,
    entryPoints: [join(root, 'src/renderer/app.ts')],
    outfile: join(dist, 'renderer/app.js'),
    platform: 'browser',
    format: 'iife',
    target: 'chrome130',
  }),
]);

await cp(join(root, 'src/renderer/index.html'), join(dist, 'renderer/index.html'));
await cp(join(root, 'src/renderer/styles.css'), join(dist, 'renderer/styles.css'));
await cp(join(root, 'src/renderer/logo.png'), join(dist, 'renderer/logo.png'));
