// CLI entry: `npm run dev` (Vite middleware) or `npm start` (serves dist/).
import os from 'node:os';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { startServer } from './app.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dev = process.env.NODE_ENV !== 'production';
const distDir = path.join(root, 'dist');

if (!dev && !existsSync(distDir)) {
  console.error('dist/ not found. Run `npm run build` first.');
  process.exit(1);
}

const { port } = await startServer({
  dev,
  root,
  distDir,
  port: Number(process.env.PORT ?? 5173),
  // development keeps its downloads apart from the desktop app's Music\UPlayer folder
  musicDir: process.env.UPLAYER_MUSIC_DIR ?? (dev ? path.join(root, '.data', 'music') : path.join(os.homedir(), 'Music', 'UPlayer')),
  // kept apart from the desktop app's backup so testing never touches real data
  dataDir: path.join(root, '.data', 'backup'),
  // yt-dlp lives in .tools/ during development; Node itself solves YouTube's JS challenges
  ytdlp: { binDir: path.join(root, '.tools'), jsRuntime: process.execPath },
});
console.log(`\n  UPlayer  →  http://localhost:${port}\n`);
