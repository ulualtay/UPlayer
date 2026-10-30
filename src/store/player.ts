import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { durableJSON } from '../lib/durable';
import type { Track } from '../../shared/types';
import { api } from '../lib/api';
import { controls } from '../player/controls';
import { useLibrary } from './library';
import { useSettings } from './settings';
import { toast } from './ui';

export interface QItem {
  uid: string;
  track: Track;
  /** added by autoplay */
  radio?: boolean;
}

export interface PlayContext {
  type: 'playlist' | 'album' | 'artist' | 'liked' | 'search' | 'home' | 'radio' | 'history' | 'queue' | 'other';
  id?: string;
  name: string;
  /** route to navigate back to the context */
  path?: string;
}

export type Repeat = 'off' | 'all' | 'one';

interface PlayerState {
  context: PlayContext | null;
  items: QItem[];
  order: number[];
  /** position in `order` of the current context item */
  pos: number;
  manual: QItem[];
  current: QItem | null;
  fromManual: boolean;
  shuffle: boolean;
  repeat: Repeat;
  volume: number;
  muted: boolean;
  radioLoading: boolean;

  playList: (tracks: Track[], startIndex: number, context: PlayContext, opts?: { shuffle?: boolean }) => void;
  startRadio: (track: Track) => Promise<void>;
  next: (auto?: boolean) => Promise<void>;
  prev: (position: number) => void;
  jumpTo: (uid: string) => void;
  addToQueue: (tracks: Track[]) => void;
  playNext: (tracks: Track[]) => void;
  removeUpcoming: (uid: string) => void;
  setManual: (items: QItem[]) => void;
  clearQueue: () => void;
  toggleShuffle: () => void;
  cycleRepeat: () => void;
  setVolume: (v: number) => void;
  toggleMute: () => void;
}

let uidSeq = 0;
const mkItem = (track: Track, radio?: boolean): QItem => ({ uid: `${Date.now().toString(36)}-${(uidSeq++).toString(36)}`, track, radio });

function shuffled(n: number, first: number): number[] {
  const rest = [...Array(n).keys()].filter((i) => i !== first);
  for (let i = rest.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [rest[i], rest[j]] = [rest[j], rest[i]];
  }
  return first >= 0 ? [first, ...rest] : rest;
}

export function upcoming(s: Pick<PlayerState, 'manual' | 'order' | 'pos' | 'items'>): { manual: QItem[]; context: QItem[] } {
  return { manual: s.manual, context: s.order.slice(s.pos + 1).map((i) => s.items[i]).filter(Boolean) };
}

export const usePlayer = create<PlayerState>()(
  persist(
    (set, get) => {
      /** Fetch similar songs and append them when the queue is about to run dry. */
      async function topUpRadio() {
        const s = get();
        if (!useSettings.getState().autoplay || s.radioLoading || !s.current) return;
        const left = s.manual.length + (s.order.length - 1 - s.pos);
        if (left > 1 || s.repeat !== 'off') return;
        set({ radioLoading: true });
        try {
          const seed = s.current.track;
          const tracks = await api.upNext(seed.id);
          const have = new Set(get().items.map((i) => i.track.id));
          const fresh = tracks.filter((t) => !have.has(t.id)).slice(0, 25);
          if (!fresh.length) return;
          useLibrary.getState().remember(fresh);
          const st = get();
          const start = st.items.length;
          set({
            items: [...st.items, ...fresh.map((t) => mkItem(t, true))],
            order: [...st.order, ...fresh.map((_, i) => start + i)],
          });
        } catch {
          /* offline or rate limited: the queue simply ends */
        } finally {
          set({ radioLoading: false });
        }
      }

      function setCurrent(patch: Partial<PlayerState>) {
        const prevUid = get().current?.uid;
        set(patch);
        const cur = get().current;
        if (cur) useLibrary.getState().remember([cur.track]);
        // same queue item again (e.g. repeat-all over a single song): restart it
        if (cur && cur.uid === prevUid) {
          controls.seek(0);
          controls.play();
        }
        void topUpRadio();
      }

      return {
        context: null,
        items: [],
        order: [],
        pos: -1,
        manual: [],
        current: null,
        fromManual: false,
        shuffle: false,
        repeat: 'off',
        volume: 80,
        muted: false,
        radioLoading: false,

        playList: (tracks, startIndex, context, opts) => {
          if (!tracks.length) return;
          if (get().current) controls.beforeChange('skip');
          const shuffle = opts?.shuffle ?? get().shuffle;
          const items = tracks.map((t) => mkItem(t));
          const start = startIndex >= 0 ? startIndex : shuffle ? Math.floor(Math.random() * items.length) : 0;
          const order = shuffle ? shuffled(items.length, start) : items.map((_, i) => i);
          const pos = shuffle ? 0 : start;
          useLibrary.getState().remember(tracks);
          setCurrent({ context, items, order, pos, current: items[order[pos]], fromManual: false, shuffle });
        },

        startRadio: async (track) => {
          get().playList([track], 0, { type: 'radio', name: `${track.title} Radio`, id: track.id }, { shuffle: false });
          set({ radioLoading: true });
          try {
            const tracks = (await api.upNext(track.id)).slice(0, 40);
            useLibrary.getState().remember(tracks);
            const st = get();
            if (st.current?.track.id !== track.id) return;
            const start = st.items.length;
            set({ items: [...st.items, ...tracks.map((t) => mkItem(t, true))], order: [...st.order, ...tracks.map((_, i) => start + i)] });
          } catch {
            toast('Could not load similar songs for this radio', { tone: 'error' });
          } finally {
            set({ radioLoading: false });
          }
        },

        next: async (auto = false) => {
          const s = get();
          if (!s.current) return;
          controls.beforeChange(auto ? 'end' : 'skip');
          if (s.manual.length) {
            const [head, ...rest] = s.manual;
            setCurrent({ current: head, manual: rest, fromManual: true });
            return;
          }
          if (s.pos + 1 < s.order.length) {
            const pos = s.pos + 1;
            setCurrent({ pos, current: s.items[s.order[pos]], fromManual: false });
            return;
          }
          if (s.repeat === 'all' && s.order.length) {
            const order = s.shuffle ? shuffled(s.items.length, -1) : s.order;
            setCurrent({ order, pos: 0, current: s.items[order[0]], fromManual: false });
            return;
          }
          if (useSettings.getState().autoplay) {
            await topUpRadio();
            const st = get();
            if (st.pos + 1 < st.order.length) {
              const pos = st.pos + 1;
              setCurrent({ pos, current: st.items[st.order[pos]], fromManual: false });
              return;
            }
          }
          // End of the line: rewind and stop.
          controls.pause();
          controls.seek(0);
        },

        prev: (position) => {
          const s = get();
          if (!s.current) return;
          if (position > 3 || s.pos <= 0 || s.fromManual) {
            controls.seek(0);
            controls.play();
            return;
          }
          controls.beforeChange('skip');
          const pos = s.pos - 1;
          setCurrent({ pos, current: s.items[s.order[pos]], fromManual: false });
        },

        jumpTo: (uid) => {
          const s = get();
          const mi = s.manual.findIndex((m) => m.uid === uid);
          controls.beforeChange('skip');
          if (mi >= 0) {
            setCurrent({ current: s.manual[mi], manual: s.manual.slice(mi + 1), fromManual: true });
            return;
          }
          const oi = s.order.findIndex((i) => s.items[i]?.uid === uid);
          if (oi >= 0) setCurrent({ pos: oi, current: s.items[s.order[oi]], fromManual: false });
        },

        addToQueue: (tracks) => {
          useLibrary.getState().remember(tracks);
          const s = get();
          if (!s.current) {
            s.playList(tracks, 0, { type: 'queue', name: 'Queue' });
            return;
          }
          set({ manual: [...s.manual, ...tracks.map((t) => mkItem(t))] });
        },

        playNext: (tracks) => {
          useLibrary.getState().remember(tracks);
          const s = get();
          if (!s.current) {
            s.playList(tracks, 0, { type: 'queue', name: 'Queue' });
            return;
          }
          set({ manual: [...tracks.map((t) => mkItem(t)), ...s.manual] });
        },

        removeUpcoming: (uid) => {
          const s = get();
          if (s.manual.some((m) => m.uid === uid)) {
            set({ manual: s.manual.filter((m) => m.uid !== uid) });
            return;
          }
          const oi = s.order.findIndex((i) => s.items[i]?.uid === uid);
          if (oi > s.pos) set({ order: s.order.filter((_, i) => i !== oi) });
        },

        setManual: (manual) => set({ manual }),

        clearQueue: () => {
          const s = get();
          set({ manual: [], order: s.order.slice(0, s.pos + 1) });
        },

        toggleShuffle: () => {
          const s = get();
          const shuffle = !s.shuffle;
          if (!s.items.length) {
            set({ shuffle });
            return;
          }
          const curIdx = s.fromManual ? (s.order[s.pos] ?? -1) : (s.order[s.pos] ?? 0);
          if (shuffle) {
            set({ shuffle, order: shuffled(s.items.length, curIdx), pos: curIdx >= 0 ? 0 : -1 });
          } else {
            set({ shuffle, order: s.items.map((_, i) => i), pos: Math.max(curIdx, 0) });
          }
        },

        cycleRepeat: () => {
          const r = get().repeat;
          set({ repeat: r === 'off' ? 'all' : r === 'all' ? 'one' : 'off' });
        },

        setVolume: (v) => set({ volume: Math.max(0, Math.min(100, Math.round(v))), muted: false }),
        toggleMute: () => set({ muted: !get().muted }),
      };
    },
    {
      name: 'uplayer-player',
      version: 1,
      storage: durableJSON(),
      partialize: (s) => ({
        context: s.context,
        items: s.items,
        order: s.order,
        pos: s.pos,
        manual: s.manual,
        current: s.current,
        fromManual: s.fromManual,
        shuffle: s.shuffle,
        repeat: s.repeat,
        volume: s.volume,
        muted: s.muted,
      }),
    },
  ),
);

// ---------- transient playback state (not persisted, updates ~4x/sec) ----------

interface PlaybackState {
  ready: boolean;
  playing: boolean;
  buffering: boolean;
  position: number;
  duration: number;
}

export const usePlayback = create<PlaybackState>()(() => ({
  ready: false,
  playing: false,
  buffering: false,
  position: 0,
  duration: 0,
}));
