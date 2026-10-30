// Spectrum data for the visualizers, read from the playback engine's
// AnalyserNode. One requestAnimationFrame loop samples it and fans the data
// out to every registered visualizer, plus a few CSS variables (--beat,
// --eq1..4) so plain CSS can react to the music too.

import { getAnalyser } from '../player/engine';
import { usePlayback } from '../store/player';
import { useSettings } from '../store/settings';

export interface Frame {
  /** 0..1 per log-spaced band */
  bands: Float32Array;
  /** time-domain samples, -1..1 */
  wave: Float32Array;
  /** smoothed overall loudness 0..1 */
  level: number;
  /** smoothed bass energy 0..1 */
  bass: number;
  /** decays from 1 after each detected kick */
  beat: number;
  /** true when no audio is flowing */
  silent: boolean;
  t: number;
}

const BANDS = 96;
const frame: Frame = {
  bands: new Float32Array(BANDS),
  wave: new Float32Array(512),
  level: 0,
  bass: 0,
  beat: 0,
  silent: true,
  t: 0,
};

let freqBuf: Uint8Array<ArrayBuffer> | null = null;
let timeBuf: Float32Array<ArrayBuffer> | null = null;
let edges: number[] = [];
let raf = 0;
let bassAvg = 0;
let lastBeat = 0;

type Listener = (f: Frame) => void;
const listeners = new Set<Listener>();

/** Register a per-frame draw callback; returns an unsubscribe function. */
export function onFrame(fn: Listener): () => void {
  listeners.add(fn);
  ensureLoop();
  return () => {
    listeners.delete(fn);
  };
}

// Log-spaced band edges between ~30 Hz and ~16 kHz.
function buildEdges(a: AnalyserNode) {
  const binHz = a.context.sampleRate / a.fftSize;
  const lo = Math.log(30);
  const hi = Math.log(16000);
  edges = Array.from({ length: BANDS + 1 }, (_, i) => Math.max(1, Math.round(Math.exp(lo + ((hi - lo) * i) / BANDS) / binHz)));
}

function sample(now: number) {
  const a = useSettings.getState().visualizer && usePlayback.getState().playing ? getAnalyser() : null;
  const gain = useSettings.getState().vizGain;
  if (a) {
    if (!freqBuf || freqBuf.length !== a.frequencyBinCount) {
      freqBuf = new Uint8Array(a.frequencyBinCount);
      timeBuf = new Float32Array(a.fftSize);
      buildEdges(a);
    }
    a.getByteFrequencyData(freqBuf);
    a.getFloatTimeDomainData(timeBuf!);
    let total = 0;
    for (let b = 0; b < BANDS; b++) {
      const lo = edges[b];
      const hi = Math.max(lo + 1, edges[b + 1]);
      let peak = 0;
      for (let i = lo; i < hi && i < freqBuf.length; i++) if (freqBuf[i] > peak) peak = freqBuf[i];
      // gently lift the highs, which carry less energy
      const tilt = 0.85 + 0.45 * (b / BANDS);
      const v = Math.min(1, ((peak / 255) * tilt * gain) ** 1.4);
      // fast attack, slow release
      frame.bands[b] = v > frame.bands[b] ? v : frame.bands[b] * 0.86 + v * 0.14;
      total += v;
    }
    const step = Math.floor(timeBuf!.length / frame.wave.length);
    for (let i = 0; i < frame.wave.length; i++) frame.wave[i] = Math.max(-1, Math.min(1, timeBuf![i * step] * gain * 1.6));
    const level = total / BANDS;
    let bass = 0;
    for (let b = 0; b < 14; b++) bass += frame.bands[b];
    bass /= 14;
    frame.level = frame.level * 0.8 + level * 0.2;
    frame.bass = frame.bass * 0.6 + bass * 0.4;
    bassAvg = bassAvg * 0.97 + bass * 0.03;
    if (bass > bassAvg * 1.35 && bass > 0.18 && now - lastBeat > 240) {
      lastBeat = now;
      frame.beat = 1;
    }
    frame.silent = level < 0.004;
  } else {
    // paused or disabled: let everything settle
    for (let b = 0; b < BANDS; b++) frame.bands[b] *= 0.88;
    for (let i = 0; i < frame.wave.length; i++) frame.wave[i] *= 0.8;
    frame.level *= 0.9;
    frame.bass *= 0.9;
    frame.silent = true;
  }
  frame.beat *= 0.9;
  frame.t = now;
}

let cssTick = 0;
function writeCss() {
  const root = document.documentElement.style;
  const pulse = useSettings.getState().beatPulse;
  root.setProperty('--beat', pulse ? Math.max(frame.beat * 0.8, frame.bass * 0.6).toFixed(3) : '0');
  // four-bar equaliser for "now playing" rows
  const pick = (a: number, b: number) => {
    let m = 0;
    for (let i = a; i < b; i++) m = Math.max(m, frame.bands[i]);
    return Math.max(0.15, m).toFixed(2);
  };
  root.setProperty('--eq1', pick(2, 10));
  root.setProperty('--eq2', pick(14, 30));
  root.setProperty('--eq3', pick(34, 56));
  root.setProperty('--eq4', pick(60, 84));
}

function loop(now: number) {
  sample(now);
  // CSS variables at ~30 fps is plenty and keeps style recalcs cheap
  if (++cssTick % 2 === 0) writeCss();
  for (const fn of listeners) fn(frame);
  const idle = frame.silent && frame.level < 0.001 && frame.beat < 0.01;
  // keep running while anything is listening or there is energy to decay
  raf = idle && !usePlayback.getState().playing && listeners.size === 0 ? 0 : requestAnimationFrame(loop);
}

export function ensureLoop() {
  if (!raf) raf = requestAnimationFrame(loop);
}

// wake the loop whenever playback starts
usePlayback.subscribe((s, prev) => {
  if (s.playing && !prev.playing) ensureLoop();
});
