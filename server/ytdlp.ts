// Thin wrapper around the yt-dlp executable: keeps a private, self-updating
// copy, resolves direct audio URLs for streaming, and runs downloads.

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

export interface YtDlpConfig {
  /** writable folder that holds our copy of yt-dlp */
  binDir: string;
  /** a copy shipped with the app, used to seed binDir without a network fetch */
  bundled?: string;
  /** JavaScript runtime yt-dlp uses to solve YouTube's player challenges */
  jsRuntime: string;
  /** extra env for that runtime (Electron needs ELECTRON_RUN_AS_NODE=1) */
  env?: Record<string, string>;
}

let cfg: YtDlpConfig | null = null;
let ensuring: Promise<string> | null = null;
const RELEASE_URL = 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe';
const DAY = 86_400_000;

export function configure(c: YtDlpConfig) {
  cfg = c;
}

const exe = () => path.join(cfg!.binDir, process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp');

/** Path to a ready yt-dlp binary, seeding or downloading it on first use. */
export function ensureBinary(): Promise<string> {
  if (!cfg) return Promise.reject(new Error('yt-dlp is not configured'));
  if (ensuring) return ensuring;
  ensuring = (async () => {
    const bin = exe();
    if (!fs.existsSync(bin)) {
      fs.mkdirSync(cfg!.binDir, { recursive: true });
      if (cfg!.bundled && fs.existsSync(cfg!.bundled)) {
        fs.copyFileSync(cfg!.bundled, bin);
      } else {
        console.log('[yt-dlp] downloading the latest release…');
        const res = await fetch(RELEASE_URL);
        if (!res.ok) throw new Error(`Could not download yt-dlp (${res.status})`);
        fs.writeFileSync(bin, Buffer.from(await res.arrayBuffer()));
      }
    }
    void maybeSelfUpdate(bin);
    return bin;
  })().catch((err) => {
    ensuring = null;
    throw err;
  });
  return ensuring;
}

/** YouTube changes often; let yt-dlp update itself at most once a day. */
async function maybeSelfUpdate(bin: string) {
  const stamp = path.join(cfg!.binDir, '.last-update');
  try {
    if (Date.now() - fs.statSync(stamp).mtimeMs < DAY) return;
  } catch {
    /* never updated */
  }
  fs.writeFileSync(stamp, new Date().toISOString());
  const child = spawn(bin, ['-U'], { windowsHide: true, stdio: 'ignore' });
  child.on('error', () => {});
}

export interface RunResult {
  code: number;
  stdout: string;
  stderr: string;
}

export interface RunHandle {
  done: Promise<RunResult>;
  kill: () => void;
}

/** Run yt-dlp; `onLine` receives stdout lines as they arrive. */
export function run(args: string[], onLine?: (line: string) => void): RunHandle {
  let child: ReturnType<typeof spawn> | null = null;
  let killed = false;
  const done = ensureBinary().then(
    (bin) =>
      new Promise<RunResult>((resolve, reject) => {
        if (killed) return reject(new Error('cancelled'));
        child = spawn(bin, ['--js-runtimes', `node:${cfg!.jsRuntime}`, '--no-warnings', ...args], {
          windowsHide: true,
          env: { ...process.env, ...cfg!.env, PYTHONIOENCODING: 'utf-8' },
        });
        let stdout = '';
        let stderr = '';
        let buf = '';
        child.stdout!.setEncoding('utf8');
        child.stderr!.setEncoding('utf8');
        child.stdout!.on('data', (d: string) => {
          stdout += d;
          if (!onLine) return;
          buf += d;
          const lines = buf.split(/\r?\n/);
          buf = lines.pop() ?? '';
          for (const l of lines) if (l) onLine(l);
        });
        child.stderr!.on('data', (d: string) => (stderr += d));
        child.on('error', reject);
        child.on('close', (code) => resolve({ code: code ?? 1, stdout, stderr }));
      }),
  );
  return {
    done,
    kill: () => {
      killed = true;
      child?.kill();
    },
  };
}

export const watchUrl = (id: string) => `https://www.youtube.com/watch?v=${id}`;
export const isVideoId = (id: string) => /^[\w-]{11}$/.test(id);

/** Last meaningful line of yt-dlp's stderr, for user-facing errors. */
export function errorText(stderr: string): string {
  const line = stderr
    .split(/\r?\n/)
    .reverse()
    .find((l) => l.trim());
  return (line ?? 'yt-dlp failed').replace(/^ERROR:\s*(\[[^\]]+\]\s*[\w-]+:\s*)?/, '').trim();
}

// ---------- streaming URLs ----------

interface Resolved {
  url: string;
  expires: number;
}
const cache = new Map<string, Resolved>();
const inflight = new Map<string, Promise<Resolved>>();

/** Direct googlevideo URL for the best audio-only format (m4a preferred). */
export function resolveAudio(id: string, fresh = false): Promise<Resolved> {
  const hit = cache.get(id);
  if (!fresh && hit && hit.expires - Date.now() > 10 * 60_000) return Promise.resolve(hit);
  const pending = inflight.get(id);
  if (pending && !fresh) return pending;
  const p = run(['-f', 'bestaudio[ext=m4a]/bestaudio', '--no-playlist', '--print', 'urls', watchUrl(id)])
    .done.then(({ code, stdout, stderr }) => {
      const url = stdout.split(/\r?\n/).find((l) => l.startsWith('http'));
      if (code !== 0 || !url) throw new Error(errorText(stderr));
      const exp = Number(new URL(url).searchParams.get('expire'));
      const resolved = { url, expires: exp ? exp * 1000 : Date.now() + 5 * 3_600_000 };
      cache.set(id, resolved);
      if (cache.size > 300) cache.delete(cache.keys().next().value!);
      return resolved;
    })
    .finally(() => inflight.delete(id));
  inflight.set(id, p);
  return p;
}
