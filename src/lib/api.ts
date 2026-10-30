import { useEffect, useState } from 'react';
import type { ArtistPage, Collection, HomeFeed, Lyrics, Track, VideoSearch } from '../../shared/types';

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`/api${path}`);
  if (!res.ok) {
    let msg = `${res.status}`;
    try {
      msg = ((await res.json()) as { error?: string }).error ?? msg;
    } catch {
      /* not json */
    }
    throw new Error(msg);
  }
  return res.json() as Promise<T>;
}

const enc = encodeURIComponent;

export const api = {
  artwork: (t: Track) => get<{ thumb?: string; songId?: string }>(`/artwork/${enc(t.id)}?title=${enc(t.title)}&artist=${enc(t.artists[0]?.name ?? '')}`),
  search: (q: string, page = 0) => get<VideoSearch>(`/search?q=${enc(q)}${page ? `&page=${page}` : ''}`),
  suggest: (q: string) => get<string[]>(`/suggest?q=${enc(q)}`),
  home: () => get<HomeFeed>('/home'),
  upNext: (id: string) => get<Track[]>(`/upnext/${enc(id)}`),
  track: (id: string) => get<Track>(`/track/${enc(id)}`),
  artist: (id: string) => get<ArtistPage>(`/artist/${enc(id)}`),
  album: (id: string) => get<Collection>(`/album/${enc(id)}`),
  playlist: (id: string) => get<Collection>(`/playlist/${enc(id)}`),
  lyrics: (t: Track) =>
    get<Lyrics | null>(
      `/lyrics?id=${enc(t.id)}&title=${enc(t.title)}&artist=${enc(t.artists[0]?.name ?? '')}&duration=${t.duration}`,
    ),
};

// ---------- tiny query cache (stale-while-revalidate-ish) ----------

interface Entry<T> {
  data?: T;
  error?: Error;
  promise?: Promise<void>;
  at: number;
}
const store = new Map<string, Entry<unknown>>();
const listeners = new Map<string, Set<() => void>>();

function notify(key: string) {
  listeners.get(key)?.forEach((fn) => fn());
}

function load<T>(key: string, fn: () => Promise<T>, maxAge: number) {
  const e = (store.get(key) as Entry<T> | undefined) ?? { at: 0 };
  if (e.promise || (e.data !== undefined && Date.now() - e.at < maxAge)) return;
  e.promise = fn()
    .then((data) => {
      e.data = data;
      e.error = undefined;
      e.at = Date.now();
    })
    .catch((err: Error) => {
      e.error = err;
    })
    .finally(() => {
      e.promise = undefined;
      notify(key);
    });
  store.set(key, e as Entry<unknown>);
}

export function prefetch<T>(key: string, fn: () => Promise<T>, maxAge = 5 * 60_000) {
  load(key, fn, maxAge);
}

export function useQuery<T>(key: string | null, fn: () => Promise<T>, maxAge = 5 * 60_000) {
  const [, force] = useState(0);
  useEffect(() => {
    if (!key) return;
    const set = listeners.get(key) ?? new Set();
    const cb = () => force((n) => n + 1);
    set.add(cb);
    listeners.set(key, set);
    load(key, fn, maxAge);
    force((n) => n + 1);
    return () => {
      set.delete(cb);
    };
    // fn is intentionally keyed by `key`
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, maxAge]);
  const e = key ? (store.get(key) as Entry<T> | undefined) : undefined;
  return {
    data: e?.data,
    error: e?.data === undefined ? e?.error : undefined,
    loading: !!key && e?.data === undefined && !e?.error,
    refetch: () => {
      if (!key) return;
      const entry = store.get(key);
      if (entry) entry.at = 0;
      load(key, fn, 0);
    },
  };
}
