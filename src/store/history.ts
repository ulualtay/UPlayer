import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { durableJSON } from '../lib/durable';

/**
 * One listening session of a track. Kept compact because a year of
 * listening is tens of thousands of these.
 */
export interface PlayEvent {
  /** track id */
  t: string;
  /** started at (epoch ms) */
  s: number;
  /** listened time in ms (actual playback, seeks excluded) */
  l: number;
  /** track duration in seconds */
  d: number;
  /** 1 = moved on before the end (skip), 0 = played through */
  k: 0 | 1;
  /** synthetic demo data */
  demo?: 1;
}

/** A listen counts as a "play" (like Last.fm scrobbles) after 30s or half the track. */
export const countsAsPlay = (e: PlayEvent) => e.l >= 30_000 || (e.d > 0 && e.l >= (e.d * 1000) / 2);

interface HistoryState {
  events: PlayEvent[];
  add: (e: PlayEvent) => void;
  addMany: (e: PlayEvent[]) => void;
  clear: () => void;
  clearDemo: () => void;
}

export const useHistory = create<HistoryState>()(
  persist(
    (set, get) => ({
      events: [],
      add: (e) => set({ events: [...get().events, e] }),
      addMany: (list) => set({ events: [...get().events, ...list].sort((a, b) => a.s - b.s) }),
      clear: () => set({ events: [] }),
      clearDemo: () => set({ events: get().events.filter((e) => !e.demo) }),
    }),
    { name: 'uplayer-history', version: 1, storage: durableJSON() },
  ),
);
