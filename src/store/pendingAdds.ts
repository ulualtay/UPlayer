// Playlists only hold downloaded songs. A song that isn't on disk yet is
// downloaded first and waits here; it joins its playlists once the download
// finishes, and is dropped if the download fails or is cancelled. Waiting
// songs survive a restart (the download is started again).

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Track } from '../../shared/types';
import { useDownloads } from './downloads';
import { useLibrary } from './library';
import { toast } from './ui';

interface Waiting {
  track: Track;
  /** playlist ids, in the order they were asked for */
  playlists: string[];
}

interface PendingState {
  byTrack: Record<string, Waiting>;
  add: (playlistId: string, tracks: Track[]) => void;
  drop: (trackId: string) => void;
}

export const usePendingAdds = create<PendingState>()(
  persist(
    (set) => ({
      byTrack: {},
      add: (playlistId, tracks) =>
        set((s) => {
          const byTrack = { ...s.byTrack };
          for (const t of tracks) {
            const w = byTrack[t.id];
            byTrack[t.id] = { track: t, playlists: w ? [...new Set([...w.playlists, playlistId])] : [playlistId] };
          }
          return { byTrack };
        }),
      drop: (trackId) =>
        set((s) => {
          const { [trackId]: _gone, ...byTrack } = s.byTrack;
          return { byTrack };
        }),
    }),
    { name: 'uplayer-pending-adds', version: 1 },
  ),
);

/** Songs waiting to join this playlist. */
export function usePendingFor(playlistId: string): Track[] {
  const byTrack = usePendingAdds((s) => s.byTrack);
  return Object.values(byTrack)
    .filter((w) => w.playlists.includes(playlistId))
    .map((w) => w.track);
}

const playlistName = (id: string) => useLibrary.getState().playlists.find((p) => p.id === id)?.name;

/** Start the downloads that aren't on disk or under way yet. */
export function requestDownloads(tracks: Track[]) {
  const { entries, jobs } = useDownloads.getState();
  const fresh = tracks.filter((t) => !entries[t.id] && (!jobs[t.id] || jobs[t.id].status === 'error'));
  if (fresh.length) useDownloads.getState().download(fresh);
}

function settle(prevJobs?: Record<string, unknown>) {
  const { byTrack, drop } = usePendingAdds.getState();
  const { entries, jobs } = useDownloads.getState();
  const lib = useLibrary.getState();
  for (const [id, w] of Object.entries(byTrack)) {
    const names = w.playlists.map(playlistName).filter(Boolean) as string[];
    if (entries[id]) {
      drop(id);
      const into = w.playlists.filter((p) => lib.playlists.some((x) => x.id === p));
      for (const p of into) lib.addToPlaylist(p, [entries[id].track]);
      if (into.length) toast(`Downloaded and added to “${names.join('”, “')}”`, { tone: 'ok', thumb: w.track.thumb });
    } else if (jobs[id]?.status === 'error') {
      drop(id);
      if (names.length) toast(`“${w.track.title}” wasn't added to “${names[0]}”: it couldn't be downloaded`, { tone: 'error' });
    } else if (!jobs[id] && prevJobs?.[id]) {
      drop(id); // download cancelled
    }
  }
}

let watching = false;

/** Call once at startup: keeps waiting songs moving as downloads finish. */
export function watchPendingAdds() {
  if (watching) return;
  watching = true;
  useDownloads.subscribe((s, prev) => {
    if (s.synced && !prev.synced) {
      // the download service's queue doesn't survive a restart: ask again for anything lost
      const lost = Object.values(usePendingAdds.getState().byTrack)
        .map((w) => w.track)
        .filter((t) => !s.entries[t.id] && !s.jobs[t.id]);
      if (lost.length) requestDownloads(lost);
      settle();
      return;
    }
    if (s.entries !== prev.entries || s.jobs !== prev.jobs) settle(prev.jobs);
  });
}
