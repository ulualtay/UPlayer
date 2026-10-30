// Lines up synced lyrics with the upload that is actually playing.
//
// Lyrics are usually timed for the album version. A music video of the same
// song often starts with an intro (or ends with an outro), so its timestamps
// run early. When the server finds an upload that matches the lyrics' timing
// (`reference`), both recordings are decoded at a low sample rate and their
// loudness onsets are cross-correlated: the best lag is how far the lyrics
// must move. Users can still nudge the result by hand; both are remembered per song.

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Lyrics } from '../../shared/types';

interface SyncEntry {
  /** seconds added to every lyric timestamp */
  offset: number;
  /** found by listening (true) or set by hand (false) */
  auto: boolean;
}

interface SyncState {
  byTrack: Record<string, SyncEntry>;
  set: (id: string, e: SyncEntry) => void;
  clear: (id: string) => void;
}

export const useLyricsSync = create<SyncState>()(
  persist(
    (set) => ({
      byTrack: {},
      set: (id, e) => set((s) => ({ byTrack: { ...s.byTrack, [id]: e } })),
      clear: (id) =>
        set((s) => {
          const next = { ...s.byTrack };
          delete next[id];
          return { byTrack: next };
        }),
    }),
    { name: 'uplayer-lyrics-sync', version: 1 },
  ),
);

const RATE = 8000; // Hz to decode at: plenty for loudness, light on memory
const FPS = 20; // envelope frames per second (50 ms resolution)
const MAX_LAG = 90; // seconds searched in each direction

const CHUNK = 1 << 20;

/**
 * The whole file in 1 MB range requests, four at a time. YouTube throttles a
 * single unbounded download to playback speed; ranged requests arrive at full speed.
 */
async function download(url: string, signal: AbortSignal): Promise<ArrayBuffer> {
  // one quiet retry per request: YouTube occasionally drops a single range
  const get = async (range: string) => {
    for (let attempt = 0; ; attempt++) {
      const r = await fetch(url, { signal, headers: { Range: range } });
      if (r.ok || attempt >= 1) return r;
      await new Promise((ok) => setTimeout(ok, 600));
    }
  };
  const first = await get(`bytes=0-${CHUNK - 1}`);
  if (!first.ok) throw new Error(`HTTP ${first.status}`);
  const head = await first.arrayBuffer();
  const total = Number(first.headers.get('content-range')?.split('/')[1]);
  if (first.status !== 206 || !Number.isFinite(total) || total <= head.byteLength) return head;
  const out = new Uint8Array(total);
  out.set(new Uint8Array(head), 0);
  const starts: number[] = [];
  for (let s = head.byteLength; s < total; s += CHUNK) starts.push(s);
  const worker = async () => {
    for (let s = starts.shift(); s !== undefined; s = starts.shift()) {
      const r = await get(`bytes=${s}-${Math.min(total, s + CHUNK) - 1}`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      out.set(new Uint8Array(await r.arrayBuffer()), s);
    }
  };
  await Promise.all([worker(), worker(), worker(), worker()]);
  return out.buffer;
}

/** Onset strength: how sharply the loudness rises in each 50 ms frame. */
async function onsets(url: string, signal: AbortSignal): Promise<Float32Array> {
  const audio = await new OfflineAudioContext(1, 1, RATE).decodeAudioData(await download(url, signal));
  const a = audio.getChannelData(0);
  const b = audio.numberOfChannels > 1 ? audio.getChannelData(1) : a;
  const hop = Math.round(audio.sampleRate / FPS);
  const frames = Math.floor(a.length / hop);
  const out = new Float32Array(frames);
  let prev = 0;
  for (let f = 0; f < frames; f++) {
    let sum = 0;
    for (let i = f * hop; i < (f + 1) * hop; i++) {
      const v = (a[i] + b[i]) / 2;
      sum += v * v;
    }
    const level = Math.log(1e-6 + Math.sqrt(sum / hop));
    out[f] = Math.max(0, level - prev);
    prev = level;
  }
  // zero mean, unit variance so loud and quiet masters compare fairly
  let mean = 0;
  for (const v of out) mean += v;
  mean /= frames || 1;
  let sd = 0;
  for (let i = 0; i < frames; i++) {
    out[i] -= mean;
    sd += out[i] * out[i];
  }
  sd = Math.sqrt(sd / (frames || 1)) || 1;
  for (let i = 0; i < frames; i++) out[i] /= sd;
  return out;
}

interface Match {
  /** seconds to add to the reference's timestamps to land on the playing upload */
  lag: number;
  best: number;
  runnerUp: number;
  confident: boolean;
}

function bestLag(ref: Float32Array, play: Float32Array): Match {
  const maxLag = MAX_LAG * FPS;
  const scores: number[] = [];
  let best = -Infinity;
  let bestLagFrames = 0;
  for (let lag = -maxLag; lag <= maxLag; lag++) {
    // play[t + lag] ≈ ref[t]
    const start = Math.max(0, -lag);
    const end = Math.min(ref.length, play.length - lag);
    const n = end - start;
    if (n < FPS * 30) {
      scores.push(-Infinity);
      continue; // need at least 30 s of overlap to trust a match
    }
    let sum = 0;
    for (let t = start; t < end; t++) sum += ref[t] * play[t + lag];
    const score = sum / n;
    scores.push(score);
    if (score > best) {
      best = score;
      bestLagFrames = lag;
    }
  }
  // the winner has to stand out from everything more than a second away
  let runnerUp = -Infinity;
  for (let i = 0; i < scores.length; i++) {
    const lag = i - maxLag;
    if (Math.abs(lag - bestLagFrames) > FPS && scores[i] > runnerUp) runnerUp = scores[i];
  }
  const confident = best > 0.2 && best >= runnerUp * 1.5;
  // refine between frames with a parabola through the peak and its neighbours
  const i = bestLagFrames + maxLag;
  const l = scores[i - 1];
  const r = scores[i + 1];
  const shift = Number.isFinite(l) && Number.isFinite(r) && l - 2 * best + r !== 0 ? (0.5 * (l - r)) / (l - 2 * best + r) : 0;
  return { lag: (bestLagFrames + Math.max(-0.5, Math.min(0.5, shift))) / FPS, best, runnerUp, confident };
}

/** How far `playId` is shifted against `refId` (both YouTube ids). Exposed for diagnostics. */
export async function measureOffset(refId: string, playId: string, signal = new AbortController().signal): Promise<Match> {
  const [refEnv, playEnv] = await Promise.all([onsets(`/api/stream/${refId}`, signal), onsets(`/api/stream/${playId}`, signal)]);
  return bestLag(refEnv, playEnv);
}

const running = new Map<string, Promise<number | null>>();

/** Work out (once per song) how far this upload's lyrics are shifted; stores it when confident. */
export function autoAlign(trackId: string, lyrics: Lyrics): Promise<number | null> {
  const ref = lyrics.reference;
  if (!ref || !lyrics.synced?.length || ref.id === trackId) return Promise.resolve(null);
  if (useLyricsSync.getState().byTrack[trackId]) return Promise.resolve(useLyricsSync.getState().byTrack[trackId].offset);
  const existing = running.get(trackId);
  if (existing) return existing;
  const job = (async () => {
    try {
      const m = await measureOffset(ref.id, trackId);
      if (!m.confident) return null;
      if (!useLyricsSync.getState().byTrack[trackId]) useLyricsSync.getState().set(trackId, { offset: Math.round(m.lag * 100) / 100, auto: true });
      return m.lag;
    } catch (err) {
      console.warn('[lyrics] could not line up lyrics', err);
      return null;
    } finally {
      running.delete(trackId);
    }
  })();
  running.set(trackId, job);
  return job;
}
