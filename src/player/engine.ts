// Playback engine: two HTML5 audio "decks" fed by the local server
// (/api/stream/:id serves a downloaded file or proxies YouTube's audio),
// routed through Web Audio so we get crossfades, a master volume and an
// analyser for the visualizers. Also logs listening sessions for the stats
// page and publishes metadata to the OS media controls.

import type { Track } from '../../shared/types';
import { artistsText } from '../lib/format';
import { useHistory } from '../store/history';
import { upcoming, usePlayback, usePlayer, type QItem } from '../store/player';
import { useSettings } from '../store/settings';
import { toast } from '../store/ui';
import { controls } from './controls';

interface Deck {
  el: HTMLAudioElement;
  gain: GainNode | null;
  uid: string | null;
  track: Track | null;
}

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let analyser: AnalyserNode | null = null;
const decks: Deck[] = [];
let active = 0;
let mounted = false;
let consecutiveErrors = 0;
/** songs already given their second chance after a playback error (playing / paused) */
let retriedUid: string | null = null;
let reloadedUid: string | null = null;

const deck = () => decks[active];

// ---------- listening sessions ----------

interface Session {
  trackId: string;
  startedAt: number;
  listened: number;
  duration: number;
}
let session: Session | null = null;
let lastTick = 0;

function commit(reason: 'skip' | 'end') {
  if (!session) return;
  const s = session;
  session = null;
  if (s.listened < 5000) return;
  useHistory.getState().add({
    t: s.trackId,
    s: s.startedAt,
    l: Math.round(s.listened),
    d: Math.round(s.duration),
    k: reason === 'end' ? 0 : 1,
  });
}

function ensureSession(track: Track) {
  if (session?.trackId === track.id) return;
  session = { trackId: track.id, startedAt: Date.now(), listened: 0, duration: track.duration || deck().el.duration || 0 };
  lastTick = performance.now();
}

function accumulate() {
  const now = performance.now();
  if (session && !deck().el.paused) session.listened += Math.min(now - lastTick, 1000);
  lastTick = now;
}

// ---------- audio graph ----------

/** Lazily build the Web Audio graph (needs to happen before the first play). */
function graph() {
  if (ctx) return ctx;
  ctx = new AudioContext({ latencyHint: 'playback' });
  master = ctx.createGain();
  analyser = ctx.createAnalyser();
  analyser.fftSize = 2048;
  analyser.smoothingTimeConstant = 0.55;
  analyser.minDecibels = -88;
  analyser.maxDecibels = -18;
  master.connect(analyser);
  analyser.connect(ctx.destination);
  for (const d of decks) {
    const src = ctx.createMediaElementSource(d.el);
    d.gain = ctx.createGain();
    src.connect(d.gain);
    d.gain.connect(master);
  }
  applyVolume();
  return ctx;
}

export function getAnalyser(): AnalyserNode | null {
  return analyser;
}

function applyVolume() {
  if (!master || !ctx) return;
  const { volume, muted } = usePlayer.getState();
  // perceptual curve: the slider feels linear to the ear
  master.gain.setTargetAtTime(muted ? 0 : (volume / 100) ** 1.7, ctx.currentTime, 0.015);
}

async function playDeck(d: Deck) {
  const c = graph();
  if (c.state !== 'running') await c.resume().catch(() => {});
  try {
    await d.el.play();
  } catch (err) {
    if ((err as Error).name === 'NotAllowedError') usePlayback.setState({ playing: false, buffering: false });
    // other failures surface through the element's `error` event
  }
}

const streamUrl = (t: Track, start = 0) => `/api/stream/${t.id}${start > 0 ? `#t=${Math.floor(start)}` : ''}`;

function setSource(d: Deck, item: QItem, start = 0) {
  d.uid = item.uid;
  d.track = item.track;
  d.el.src = streamUrl(item.track, start);
}

function clearDeck(d: Deck) {
  d.el.pause();
  d.el.removeAttribute('src');
  d.el.load();
  d.uid = null;
  d.track = null;
}

// ---------- crossfade ----------

let pendingFade = 0;
let fadeTriggeredFor: string | null = null;
let fade: { from: Deck; to: Deck; timer: number } | null = null;

function curve(dir: 'in' | 'out', from = 1): Float32Array {
  const n = 64;
  const c = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * (Math.PI / 2);
    c[i] = dir === 'in' ? Math.sin(x) : Math.cos(x) * from;
  }
  return c;
}

function beginCrossfade(item: QItem, seconds: number) {
  const from = deck();
  active = 1 - active;
  const to = deck();
  setSource(to, item);
  if (to.gain) to.gain.gain.value = 0;
  void playDeck(to);
  // the ramp starts once the new song is actually audible
  to.el.addEventListener(
    'playing',
    () => {
      if (!ctx || !from.gain || !to.gain || deck() !== to) return;
      const now = ctx.currentTime;
      from.gain.gain.cancelScheduledValues(now);
      to.gain.gain.cancelScheduledValues(now);
      from.gain.gain.setValueCurveAtTime(curve('out', from.gain.gain.value || 1), now, seconds);
      to.gain.gain.setValueCurveAtTime(curve('in'), now, seconds);
      fade = { from, to, timer: window.setTimeout(finishFade, seconds * 1000 + 80) };
    },
    { once: true },
  );
  fade = { from, to, timer: 0 };
}

function finishFade() {
  if (!fade) return;
  const { from, to, timer } = fade;
  window.clearTimeout(timer);
  fade = null;
  clearDeck(from);
  if (ctx && from.gain && to.gain) {
    from.gain.gain.cancelScheduledValues(ctx.currentTime);
    from.gain.gain.value = 0;
    to.gain.gain.cancelScheduledValues(ctx.currentTime);
    to.gain.gain.value = 1;
  }
}

function hasNext(): boolean {
  const s = usePlayer.getState();
  const up = upcoming(s);
  return up.manual.length > 0 || up.context.length > 0 || s.repeat === 'all';
}

function maybeCrossfade(d: Deck) {
  const seconds = useSettings.getState().crossfade;
  const dur = d.el.duration;
  if (!seconds || fade || !d.uid || !Number.isFinite(dur) || dur < seconds * 2 + 4) return;
  if (dur - d.el.currentTime > seconds || fadeTriggeredFor === d.uid) return;
  if (usePlayer.getState().repeat === 'one' || !hasNext()) return;
  fadeTriggeredFor = d.uid;
  pendingFade = seconds;
  void usePlayer
    .getState()
    .next(true)
    .finally(() => (pendingFade = 0));
}

// ---------- loading ----------

function load(item: QItem, autoplay: boolean, startSeconds = 0) {
  usePlayback.setState({ position: startSeconds, duration: item.track.duration, buffering: autoplay });
  updateMediaSession(item.track);
  if (pendingFade > 0 && autoplay && deck().uid && !deck().el.paused) {
    const seconds = pendingFade;
    pendingFade = 0;
    beginCrossfade(item, seconds);
    prefetchNext();
    return;
  }
  finishFade();
  const d = deck();
  setSource(d, item, startSeconds);
  if (d.gain) d.gain.gain.value = 1;
  if (autoplay) void playDeck(d);
}

/** Warm the server's URL cache for the next song so skips and crossfades start instantly. */
function prefetchNext() {
  const s = usePlayer.getState();
  const up = upcoming(s);
  const next = up.manual[0] ?? up.context[0];
  if (next) void fetch(`/api/stream/${next.track.id}/prefetch`, { method: 'POST' }).catch(() => {});
}

// ---------- element events ----------

function bind(index: number) {
  const d = decks[index];
  const isActive = () => index === active;
  const el = d.el;

  el.addEventListener('playing', () => {
    if (!isActive()) return;
    consecutiveErrors = 0;
    if (d.track) ensureSession(d.track);
    lastTick = performance.now();
    usePlayback.setState({ playing: true, buffering: false });
    syncOs();
    prefetchNext();
  });
  el.addEventListener('pause', () => {
    if (!isActive() || el.ended) return;
    accumulate();
    usePlayback.setState({ playing: false, buffering: false });
    syncOs();
  });
  el.addEventListener('waiting', () => isActive() && usePlayback.setState({ buffering: true }));
  el.addEventListener('canplay', () => isActive() && usePlayback.setState({ buffering: false }));
  el.addEventListener('durationchange', () => {
    if (isActive() && Number.isFinite(el.duration)) usePlayback.setState({ duration: el.duration });
  });
  el.addEventListener('timeupdate', () => {
    if (!isActive()) return;
    accumulate();
    if (session && Number.isFinite(el.duration) && !session.duration) session.duration = el.duration;
    usePlayback.setState({ position: el.currentTime });
    saveResume();
    maybeCrossfade(d);
  });
  el.addEventListener('ended', () => {
    if (!isActive()) {
      // the outgoing song of a crossfade ran out early
      if (fade?.from === d) finishFade();
      return;
    }
    accumulate();
    usePlayback.setState({ playing: false });
    if (usePlayer.getState().repeat === 'one') {
      commit('end');
      el.currentTime = 0;
      void playDeck(d);
    } else {
      void usePlayer.getState().next(true);
    }
  });
  el.addEventListener('error', () => {
    if (!isActive() || !d.track || !d.uid || !el.getAttribute('src')) return;
    const item: QItem = { uid: d.uid, track: d.track };
    const at = Number.isFinite(el.currentTime) ? el.currentTime : 0;
    // `paused` is false once play() was asked for, even before any sound; a paused
    // song that is merely preloading also looks "buffering", so that flag is no guide
    const wanted = !el.paused || usePlayback.getState().playing;
    usePlayback.setState({ playing: false, buffering: false });
    if (!wanted) {
      // A paused (or not yet started) song lost its stream, e.g. the address expired
      // while it sat there. Nothing was cut off, so don't skip: reload it once, quietly.
      if (reloadedUid !== d.uid) {
        reloadedUid = d.uid;
        setSource(d, item, at);
      }
      return;
    }
    if (retriedUid !== d.uid) {
      // usually a network hiccup or an expired address: one fresh try from the same spot
      retriedUid = d.uid;
      usePlayback.setState({ buffering: true });
      setSource(d, item, at);
      void playDeck(d);
      return;
    }
    consecutiveErrors++;
    toast(`Can't play “${item.track.title}” right now. Skipping.`, { tone: 'error' });
    if (consecutiveErrors < 4) window.setTimeout(() => usePlayer.getState().current?.uid === d.uid && void usePlayer.getState().next(true), 700);
  });
}

// ---------- resume position ----------

let resumeSaved = 0;
function saveResume() {
  const cur = usePlayer.getState().current;
  if (!cur || Date.now() - resumeSaved < 4000) return;
  resumeSaved = Date.now();
  try {
    localStorage.setItem('uplayer-resume', JSON.stringify({ uid: cur.uid, t: deck().el.currentTime }));
  } catch {
    /* ignore */
  }
}

// ---------- OS media controls & title ----------

function updateMediaSession(track: Track) {
  if (!('mediaSession' in navigator)) return;
  navigator.mediaSession.metadata = new MediaMetadata({
    title: track.title,
    artist: artistsText(track),
    album: track.album?.name ?? '',
    artwork: [{ src: track.thumb, sizes: '544x544', type: 'image/jpeg' }],
  });
}

function syncOs() {
  const cur = usePlayer.getState().current;
  const playing = usePlayback.getState().playing;
  document.title = cur && playing ? `${cur.track.title} • ${artistsText(cur.track)}` : 'UPlayer';
  if (!('mediaSession' in navigator)) return;
  navigator.mediaSession.playbackState = playing ? 'playing' : 'paused';
  const el = deck().el;
  if (Number.isFinite(el.duration) && el.duration > 0) {
    try {
      navigator.mediaSession.setPositionState({ duration: el.duration, position: Math.min(el.currentTime, el.duration), playbackRate: 1 });
    } catch {
      /* ignore */
    }
  }
}

function bindMediaKeys() {
  if (!('mediaSession' in navigator)) return;
  const ms = navigator.mediaSession;
  ms.setActionHandler('play', () => controls.play());
  ms.setActionHandler('pause', () => controls.pause());
  ms.setActionHandler('stop', () => controls.pause());
  ms.setActionHandler('nexttrack', () => void usePlayer.getState().next());
  ms.setActionHandler('previoustrack', () => usePlayer.getState().prev(deck().el.currentTime));
  ms.setActionHandler('seekto', (d) => d.seekTime != null && controls.seek(d.seekTime));
}

// ---------- public ----------

export function mountEngine() {
  if (mounted) return;
  mounted = true;
  for (let i = 0; i < 2; i++) {
    const el = new Audio();
    el.preload = 'auto';
    decks.push({ el, gain: null, uid: null, track: null });
    bind(i);
  }
  usePlayback.setState({ ready: true });
  // devtools handle for poking at the decks while developing
  if (import.meta.env.DEV) (window as unknown as { __decks: Deck[] }).__decks = decks;

  // restore the last song where it was left, paused
  const cur = usePlayer.getState().current;
  if (cur) {
    let t = 0;
    try {
      const r = JSON.parse(localStorage.getItem('uplayer-resume') ?? 'null') as { uid: string; t: number } | null;
      if (r?.uid === cur.uid) t = Math.max(0, Math.floor(r.t));
    } catch {
      /* ignore */
    }
    load(cur, false, t);
  }

  controls.play = () => {
    const cur = usePlayer.getState().current;
    if (cur && deck().uid !== cur.uid) load(cur, true);
    else void playDeck(deck());
  };
  controls.pause = () => {
    finishFade();
    deck().el.pause();
  };
  controls.toggle = () => (usePlayback.getState().playing ? controls.pause() : controls.play());
  controls.seek = (sec) => {
    finishFade();
    const d = deck();
    const el = d.el;
    el.currentTime = Math.max(0, sec);
    // Jumping into the last seconds on purpose means "play the ending", so
    // don't let the crossfade cut straight to the next song; seeking back re-arms it.
    const fadeWindow = useSettings.getState().crossfade + 1;
    fadeTriggeredFor = Number.isFinite(el.duration) && el.duration - sec <= fadeWindow ? d.uid : null;
    usePlayback.setState({ position: sec });
    lastTick = performance.now();
    syncOs();
  };
  controls.beforeChange = (reason) => {
    accumulate();
    commit(reason);
  };

  usePlayer.subscribe((s, prev) => {
    if (s.current && s.current.uid !== prev.current?.uid) load(s.current, true);
    if (s.volume !== prev.volume || s.muted !== prev.muted) applyVolume();
  });

  bindMediaKeys();
  window.addEventListener('pagehide', () => {
    accumulate();
    commit('skip');
  });
}
