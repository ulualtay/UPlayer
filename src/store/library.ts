import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { durableJSON } from '../lib/durable';
import type { CardType, Track } from '../../shared/types';

export interface PlaylistEntry {
  id: string;
  at: number;
}

export interface Playlist {
  id: string;
  name: string;
  description?: string;
  entries: PlaylistEntry[];
  createdAt: number;
  updatedAt: number;
  /** set when imported from YouTube */
  source?: { type: 'youtube'; id: string };
}

export interface SavedItem {
  type: CardType;
  id: string;
  title: string;
  subtitle?: string;
  thumb: string;
  at: number;
}

interface LibraryState {
  /** metadata for every track we have seen in the library, queue or history */
  tracks: Record<string, Track>;
  liked: PlaylistEntry[];
  playlists: Playlist[];
  saved: SavedItem[];
  recentSearches: string[];

  remember: (tracks: Track[]) => void;
  isLiked: (id: string) => boolean;
  toggleLike: (track: Track) => boolean;
  createPlaylist: (name?: string, tracks?: Track[], source?: Playlist['source'], description?: string) => string;
  updatePlaylist: (id: string, patch: Partial<Pick<Playlist, 'name' | 'description'>>) => void;
  deletePlaylist: (id: string) => void;
  addToPlaylist: (id: string, tracks: Track[]) => number;
  removeFromPlaylist: (id: string, index: number) => void;
  movePlaylistEntry: (id: string, from: number, to: number) => void;
  toggleSaved: (item: Omit<SavedItem, 'at'>) => boolean;
  isSaved: (id: string) => boolean;
  addRecentSearch: (q: string) => void;
  clearRecentSearches: () => void;
  replaceAll: (data: Partial<Pick<LibraryState, 'tracks' | 'liked' | 'playlists' | 'saved'>>) => void;
}

const uid = () => Math.random().toString(36).slice(2, 10);

export const useLibrary = create<LibraryState>()(
  persist(
    (set, get) => ({
      tracks: {},
      liked: [],
      playlists: [],
      saved: [],
      recentSearches: [],

      remember: (tracks) => {
        const cur = get().tracks;
        let changed = false;
        const next = { ...cur };
        for (const t of tracks) {
          if (!t?.id) continue;
          const old = cur[t.id];
          if (!old || old.title !== t.title || old.thumb !== t.thumb || (!old.duration && t.duration)) {
            next[t.id] = { ...old, ...t, duration: t.duration || old?.duration || 0 };
            changed = true;
          }
        }
        if (changed) set({ tracks: next });
      },

      isLiked: (id) => get().liked.some((e) => e.id === id),

      toggleLike: (track) => {
        const liked = get().liked;
        if (liked.some((e) => e.id === track.id)) {
          set({ liked: liked.filter((e) => e.id !== track.id) });
          return false;
        }
        get().remember([track]);
        set({ liked: [{ id: track.id, at: Date.now() }, ...liked] });
        return true;
      },

      createPlaylist: (name, tracks = [], source, description) => {
        const id = uid();
        const now = Date.now();
        get().remember(tracks);
        const n = get().playlists.length + 1;
        set({
          playlists: [
            {
              id,
              name: name?.trim() || `My Playlist #${n}`,
              description,
              entries: tracks.map((t) => ({ id: t.id, at: now })),
              createdAt: now,
              updatedAt: now,
              source,
            },
            ...get().playlists,
          ],
        });
        return id;
      },

      updatePlaylist: (id, patch) =>
        set({ playlists: get().playlists.map((p) => (p.id === id ? { ...p, ...patch, updatedAt: Date.now() } : p)) }),

      deletePlaylist: (id) => set({ playlists: get().playlists.filter((p) => p.id !== id) }),

      addToPlaylist: (id, tracks) => {
        get().remember(tracks);
        let added = 0;
        set({
          playlists: get().playlists.map((p) => {
            if (p.id !== id) return p;
            const have = new Set(p.entries.map((e) => e.id));
            const fresh = tracks.filter((t) => !have.has(t.id));
            added = fresh.length;
            return { ...p, entries: [...p.entries, ...fresh.map((t) => ({ id: t.id, at: Date.now() }))], updatedAt: Date.now() };
          }),
        });
        return added;
      },

      removeFromPlaylist: (id, index) =>
        set({
          playlists: get().playlists.map((p) =>
            p.id === id ? { ...p, entries: p.entries.filter((_, i) => i !== index), updatedAt: Date.now() } : p,
          ),
        }),

      movePlaylistEntry: (id, from, to) =>
        set({
          playlists: get().playlists.map((p) => {
            if (p.id !== id) return p;
            const entries = [...p.entries];
            const [e] = entries.splice(from, 1);
            entries.splice(to, 0, e);
            return { ...p, entries, updatedAt: Date.now() };
          }),
        }),

      toggleSaved: (item) => {
        const saved = get().saved;
        if (saved.some((s) => s.id === item.id)) {
          set({ saved: saved.filter((s) => s.id !== item.id) });
          return false;
        }
        set({ saved: [{ ...item, at: Date.now() }, ...saved] });
        return true;
      },

      isSaved: (id) => get().saved.some((s) => s.id === id),

      addRecentSearch: (q) => {
        const s = q.trim();
        if (!s) return;
        set({ recentSearches: [s, ...get().recentSearches.filter((x) => x.toLowerCase() !== s.toLowerCase())].slice(0, 12) });
      },
      clearRecentSearches: () => set({ recentSearches: [] }),

      replaceAll: (data) => set(data),
    }),
    { name: 'uplayer-library', version: 1, storage: durableJSON() },
  ),
);

export function tracksFor(entries: PlaylistEntry[], tracks: Record<string, Track>): Track[] {
  return entries.map((e) => tracks[e.id]).filter((t): t is Track => !!t);
}
