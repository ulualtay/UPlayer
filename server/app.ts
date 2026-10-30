import express, { type Request, type Response } from 'express';
import path from 'node:path';
import { Readable } from 'node:stream';
import type { Server } from 'node:http';
import type { Track } from '../shared/types.ts';
import * as ytm from './youtube.ts';
import { findLyrics, songUploadFor } from './lyrics.ts';
import { configure as configureYtDlp, ensureBinary, isVideoId, resolveAudio, type YtDlpConfig } from './ytdlp.ts';
import * as downloads from './downloads.ts';
import * as backup from './backup.ts';

// ---------- tiny TTL cache ----------
const cache = new Map<string, { at: number; value: unknown }>();
async function cached<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < ttlMs) return hit.value as T;
  const value = await fn();
  cache.set(key, { at: Date.now(), value });
  if (cache.size > 800) cache.delete(cache.keys().next().value!);
  return value;
}

const MIN = 60_000;

function handler<T>(fn: (req: Request) => Promise<T>) {
  return async (req: Request, res: Response) => {
    try {
      res.json(await fn(req));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[api] ${req.method} ${req.originalUrl} -> ${message}`);
      if (/session|context|innertube/i.test(message)) ytm.resetClient();
      res.status(502).json({ error: message });
    }
  };
}

const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');

function apiRouter() {
  const api = express.Router();

  api.get('/search', handler((req) => {
    const q = str(req.query.q);
    if (!q) throw new Error('q is required');
    const page = Math.max(0, Math.min(20, Number(req.query.page) || 0));
    return ytm.youtubeSearch(q, page);
  }));

  api.get('/suggest', handler((req) => {
    const q = str(req.query.q);
    if (!q) return Promise.resolve([]);
    return cached(`suggest:${q.toLowerCase()}`, 30 * MIN, () => ytm.suggestions(q));
  }));

  api.get('/home', handler(() => cached('home', 30 * MIN, () => ytm.home())));
  api.get('/upnext/:id', handler((req) => cached(`up:${req.params.id}`, 30 * MIN, () => ytm.upNext(String(req.params.id)))));
  api.get('/track/:id', handler((req) => cached(`track:${req.params.id}`, 60 * MIN, () => ytm.track(String(req.params.id)))));
  api.get('/artist/:id', handler((req) => cached(`artist:${req.params.id}`, 30 * MIN, () => ytm.artist(String(req.params.id)))));
  api.get('/album/:id', handler((req) => cached(`album:${req.params.id}`, 60 * MIN, () => ytm.album(String(req.params.id)))));
  api.get('/playlist/:id', handler((req) => cached(`pl:${req.params.id}`, 15 * MIN, () => ytm.playlist(String(req.params.id)))));

  // Square album art for an upload, when the same song exists on YouTube Music.
  api.get('/artwork/:id', handler((req) => {
    const id = String(req.params.id);
    const title = str(req.query.title);
    const artist = str(req.query.artist);
    if (!isVideoId(id) || !title) throw new Error('id and title are required');
    return cached(`art:${id}`, 24 * 60 * MIN, async () => {
      const song = await songUploadFor(title, artist);
      return song ? { thumb: song.thumb, songId: song.id } : {};
    });
  }));

  api.get('/lyrics', handler((req) => {
    const id = str(req.query.id);
    const title = str(req.query.title);
    const artist = str(req.query.artist);
    const duration = Number(req.query.duration) || 0;
    if (!id || !title) throw new Error('id and title are required');
    return cached(`lyrics:${id}`, 24 * 60 * MIN, () => findLyrics({ id, title, artist, duration }));
  }));

  // Same-origin image proxy so the client can read cover pixels for adaptive colours.
  const IMG_HOSTS = /^(i\.ytimg\.com|i\d\.ytimg\.com|yt3\.googleusercontent\.com|lh3\.googleusercontent\.com|yt3\.ggpht\.com)$/;
  api.get('/img', async (req, res) => {
    try {
      const url = new URL(str(req.query.u));
      if (url.protocol !== 'https:' || !IMG_HOSTS.test(url.hostname)) {
        res.status(400).end();
        return;
      }
      const upstream = await fetch(url);
      if (!upstream.ok) {
        res.status(upstream.status).end();
        return;
      }
      res.setHeader('Content-Type', upstream.headers.get('content-type') ?? 'image/jpeg');
      res.setHeader('Cache-Control', 'public, max-age=604800, immutable');
      res.end(Buffer.from(await upstream.arrayBuffer()));
    } catch {
      res.status(400).end();
    }
  });

  // ---------- audio: local file if downloaded, otherwise proxied from YouTube ----------

  api.get('/stream/:id', async (req, res) => {
    const id = String(req.params.id);
    if (!isVideoId(id)) {
      res.status(400).end();
      return;
    }
    const local = downloads.filePath(id);
    if (local) {
      res.sendFile(local, { headers: { 'Cache-Control': 'no-store' } });
      return;
    }
    const abort = new AbortController();
    res.on('close', () => abort.abort());
    try {
      const pull = (url: string) =>
        fetch(url, { headers: req.headers.range ? { Range: req.headers.range } : {}, signal: abort.signal });
      let upstream = await pull((await resolveAudio(id)).url);
      if (upstream.status === 403 || upstream.status === 410) {
        // signed URL expired or was rejected: resolve a fresh one once
        upstream = await pull((await resolveAudio(id, true)).url);
      }
      if (!upstream.ok || !upstream.body) {
        res.status(502).json({ error: `YouTube returned ${upstream.status}` });
        return;
      }
      res.status(upstream.status);
      for (const h of ['content-type', 'content-length', 'content-range', 'accept-ranges']) {
        const v = upstream.headers.get(h);
        if (v) res.setHeader(h, v);
      }
      if (!upstream.headers.get('accept-ranges')) res.setHeader('accept-ranges', 'bytes');
      res.setHeader('Cache-Control', 'no-store');
      Readable.fromWeb(upstream.body as import('node:stream/web').ReadableStream).on('error', () => res.destroy()).pipe(res);
    } catch (err) {
      if (abort.signal.aborted) return;
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[stream] ${id} -> ${message}`);
      if (!res.headersSent) res.status(502).json({ error: message });
      else res.destroy();
    }
  });

  /** Resolve ahead of time so the next song starts instantly. */
  api.post('/stream/:id/prefetch', handler(async (req) => {
    const id = String(req.params.id);
    if (isVideoId(id) && !downloads.filePath(id)) await resolveAudio(id);
    return { ok: true };
  }));

  // ---------- downloads ----------

  api.get('/downloads', (_req, res) => {
    res.json(downloads.snapshot());
  });

  api.post('/downloads', (req, res) => {
    const tracks = (Array.isArray(req.body) ? req.body : [req.body]) as Track[];
    downloads.enqueue(tracks.filter((t) => t && typeof t.id === 'string' && typeof t.title === 'string'));
    res.json({ ok: true });
  });

  api.delete('/downloads/:id', (req, res) => {
    downloads.remove(String(req.params.id));
    res.json({ ok: true });
  });

  api.post('/downloads/:id/cancel', (req, res) => {
    downloads.cancel(String(req.params.id));
    res.json({ ok: true });
  });

  api.post('/downloads/open-folder', (_req, res) => {
    downloads.openFolder();
    res.json({ ok: true });
  });

  /** Server-sent events: a snapshot, then every job / completion / removal. */
  api.get('/downloads/events', (req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive' });
    const send = (e: unknown) => res.write(`data: ${JSON.stringify(e)}\n\n`);
    send(downloads.snapshot());
    const off = downloads.subscribe(send);
    const ping = setInterval(() => res.write(': ping\n\n'), 25_000);
    req.on('close', () => {
      off();
      clearInterval(ping);
    });
  });

  // ---------- plain-file backup of the client's saved state ----------
  // Only the app itself may write: a custom header makes any cross-site request
  // need a CORS preflight, which this server never grants.
  const sameApp = (req: Request) => req.get('x-uplayer') === '1' && (!req.get('origin') || new URL(req.get('origin')!).host === req.get('host'));

  api.get('/backup', (req, res) => {
    if (!sameApp(req)) return void res.status(403).end();
    res.set('Cache-Control', 'no-store').json(backup.readAll());
  });

  api.put('/backup/:key', express.text({ limit: '64mb', type: 'text/plain' }), (req, res) => {
    const key = String(req.params.key);
    const at = Number(req.query.at);
    if (!sameApp(req) || !backup.isBackupKey(key) || !Number.isFinite(at) || typeof req.body !== 'string') return void res.status(400).end();
    try {
      res.json({ ok: true, written: backup.write(key, { at, value: req.body }) });
    } catch (err) {
      console.error(`[backup] ${key}: ${(err as Error).message}`);
      res.status(500).json({ error: (err as Error).message });
    }
  });

  return api;
}

export interface ServerOptions {
  /** serve the client through Vite middleware (development) instead of a built dist/ */
  dev: boolean;
  /** project root, used by Vite in dev */
  root: string;
  /** built client, used in production */
  distDir: string;
  port: number;
  host?: string;
  /** where downloaded songs are stored */
  musicDir: string;
  /** where the backup of the library, history and settings is kept */
  dataDir: string;
  ytdlp: YtDlpConfig;
}

export async function startServer(opts: ServerOptions): Promise<{ port: number; server: Server }> {
  configureYtDlp(opts.ytdlp);
  downloads.initDownloads(opts.musicDir);
  backup.initBackup(opts.dataDir);
  // fetch / seed yt-dlp in the background so the first play is quick
  ensureBinary().catch((err) => console.error('[yt-dlp]', err.message));

  const app = express();
  app.disable('x-powered-by');
  app.use('/api', express.json({ limit: '2mb' }), apiRouter());

  if (opts.dev) {
    const { createServer } = await import('vite');
    const vite = await createServer({ root: opts.root, server: { middlewareMode: true }, appType: 'spa' });
    app.use(vite.middlewares);
  } else {
    // hashed bundles can be cached forever; index.html must always be fresh so a
    // new build is picked up immediately (a stale one points at old bundles)
    app.use('/assets', express.static(path.join(opts.distDir, 'assets'), { maxAge: '1y', immutable: true }));
    app.use(express.static(opts.distDir, { index: false, maxAge: '1d' }));
    app.use((_req, res) => res.sendFile(path.join(opts.distDir, 'index.html'), { headers: { 'Cache-Control': 'no-cache' } }));
  }

  return new Promise((resolve, reject) => {
    const server = app.listen(opts.port, opts.host ?? 'localhost');
    server.once('listening', () => {
      const addr = server.address();
      resolve({ port: typeof addr === 'object' && addr ? addr.port : opts.port, server });
    });
    server.once('error', reject);
  });
}
