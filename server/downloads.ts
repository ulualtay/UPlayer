// Download manager: a small queue of yt-dlp jobs writing audio files into the
// user's music folder, plus an index (JSON next to the files) of what's there.

import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import type { DownloadEntry, DownloadJob, DownloadEvent, Track } from '../shared/types.ts';
import { errorText, isVideoId, run, watchUrl, type RunHandle } from './ytdlp.ts';

const CONCURRENCY = 2;
const INDEX_FILE = '.uplayer-downloads.json';

let dir = '';
const entries = new Map<string, DownloadEntry>();
const jobs = new Map<string, DownloadJob & { handle?: RunHandle }>();
const events = new EventEmitter();
events.setMaxListeners(50);

export function initDownloads(musicDir: string) {
  dir = musicDir;
  fs.mkdirSync(dir, { recursive: true });
  try {
    const saved = JSON.parse(fs.readFileSync(path.join(dir, INDEX_FILE), 'utf8')) as DownloadEntry[];
    for (const e of saved) if (fs.existsSync(path.join(dir, e.file))) entries.set(e.track.id, e);
  } catch {
    /* first run */
  }
}

export const musicDir = () => dir;

let saveTimer: NodeJS.Timeout | undefined;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      fs.writeFileSync(path.join(dir, INDEX_FILE), JSON.stringify([...entries.values()], null, 1));
    } catch (err) {
      console.error('[downloads] could not save index', err);
    }
  }, 300);
}

function emit(e: DownloadEvent) {
  events.emit('event', e);
}

export function subscribe(fn: (e: DownloadEvent) => void): () => void {
  events.on('event', fn);
  return () => events.off('event', fn);
}

export function snapshot(): DownloadEvent {
  return {
    type: 'snapshot',
    entries: [...entries.values()],
    jobs: [...jobs.values()].map(publicJob),
    folder: dir,
  };
}

const publicJob = ({ handle: _h, ...j }: DownloadJob & { handle?: RunHandle }): DownloadJob => j;

export function filePath(id: string): string | null {
  const e = entries.get(id);
  return e ? path.join(dir, e.file) : null;
}

const safe = (s: string) =>
  s
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 110) || 'Unknown';

export function enqueue(tracks: Track[]) {
  for (const t of tracks) {
    if (!t?.id || !isVideoId(t.id) || entries.has(t.id)) continue;
    const existing = jobs.get(t.id);
    if (existing && existing.status !== 'error') continue;
    const job: DownloadJob = { id: t.id, track: t, status: 'queued', progress: 0 };
    jobs.set(t.id, job);
    emit({ type: 'job', job });
  }
  pump();
}

function pump() {
  const active = [...jobs.values()].filter((j) => j.status === 'downloading').length;
  const next = [...jobs.values()].filter((j) => j.status === 'queued').slice(0, Math.max(0, CONCURRENCY - active));
  for (const j of next) start(j);
}

/**
 * The finished file for a video id. Matching on the "[id]." part of the name is
 * immune to how yt-dlp encodes non-ASCII paths on stdout (Windows code pages).
 */
function findFile(id: string): string | null {
  const f = fs.readdirSync(dir).find((n) => n.includes(`[${id}].`) && !/\.(part|ytdl|temp)(\.|$)|\.part-Frag/.test(n));
  return f ? path.join(dir, f) : null;
}

function finish(t: Track, file: string) {
  const entry: DownloadEntry = { track: t, file: path.basename(file), size: fs.statSync(file).size, at: Date.now() };
  entries.set(t.id, entry);
  jobs.delete(t.id);
  save();
  emit({ type: 'done', entry });
}

function start(job: DownloadJob & { handle?: RunHandle }) {
  const t = job.track;
  // already on disk (e.g. downloaded before the index was written): just register it
  const existing = findFile(t.id);
  if (existing) {
    finish(t, existing);
    queueMicrotask(pump);
    return;
  }
  job.status = 'downloading';
  emit({ type: 'job', job: publicJob(job) });
  const base = `${safe(t.artists.map((a) => a.name).join(', '))} - ${safe(t.title)} [${t.id}]`;
  let lastEmit = 0;
  job.handle = run(
    [
      '-f',
      'bestaudio[ext=m4a]/bestaudio',
      '--no-playlist',
      '--encoding',
      'utf-8',
      '--newline',
      '--progress-template',
      'download:PROG %(progress._percent_str)s|%(progress._speed_str)s',
      '-o',
      path.join(dir, `${base.replace(/%/g, '%%')}.%(ext)s`),
      watchUrl(t.id),
    ],
    (line) => {
      if (line.startsWith('PROG ')) {
        const [pct, speed] = line.slice(5).split('|');
        const p = parseFloat(pct);
        if (Number.isFinite(p)) job.progress = Math.min(0.99, p / 100);
        job.speed = speed?.trim();
        if (Date.now() - lastEmit > 250) {
          lastEmit = Date.now();
          emit({ type: 'job', job: publicJob(job) });
        }
      }
    },
  );
  job.handle.done
    .then(({ code, stderr }) => {
      if (!jobs.has(t.id)) return; // cancelled meanwhile
      const file = code === 0 ? findFile(t.id) : null;
      if (!file) throw new Error(code === 0 ? 'The downloaded file could not be found' : errorText(stderr));
      finish(t, file);
    })
    .catch((err: Error) => {
      if (!jobs.has(t.id)) return;
      console.error(`[downloads] ${t.id} "${t.title}" failed: ${err.message}`);
      job.status = 'error';
      job.error = err.message;
      emit({ type: 'job', job: publicJob(job) });
    })
    .finally(pump);
}

export function cancel(id: string) {
  const job = jobs.get(id);
  if (!job) return;
  jobs.delete(id);
  job.handle?.kill();
  // yt-dlp leaves partial files behind when killed
  setTimeout(() => {
    for (const f of fs.readdirSync(dir)) if (f.includes(`[${id}]`) && /\.(part|ytdl|temp)/.test(f)) fs.rmSync(path.join(dir, f), { force: true });
  }, 500);
  emit({ type: 'removed', id });
  pump();
}

export function remove(id: string) {
  cancel(id);
  const e = entries.get(id);
  if (!e) return;
  entries.delete(id);
  fs.rmSync(path.join(dir, e.file), { force: true });
  console.warn(`[downloads] removed ${e.file} (requested by the app)`);
  save();
  emit({ type: 'removed', id });
}

export function openFolder() {
  const cmd = process.platform === 'win32' ? 'explorer.exe' : process.platform === 'darwin' ? 'open' : 'xdg-open';
  spawn(cmd, [dir], { detached: true, stdio: 'ignore', windowsHide: false }).unref();
}
