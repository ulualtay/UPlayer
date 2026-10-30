// Bundles the Electron main process (with the whole API server and its
// dependencies) and the preload script into build/electron/.
import { build } from 'esbuild';

const common = {
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node22',
  minify: true,
  legalComments: 'none',
  logLevel: 'warning',
  // vite is only used by the dev server path, electron is provided at runtime
  external: ['electron', 'vite'],
};

await build({ ...common, entryPoints: ['electron/main.ts'], outfile: 'build/electron/main.cjs' });
await build({ ...common, entryPoints: ['electron/preload.ts'], outfile: 'build/electron/preload.cjs' });
console.log('electron bundles written to build/electron/');
