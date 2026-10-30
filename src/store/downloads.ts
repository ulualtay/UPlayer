import { create } from 'zustand';
import type { DownloadEntry, DownloadEvent, DownloadJob, Track } from '../../shared/types';
import { useLibrary } from './library';
import { toast } from './ui';

interface DownloadsState {
  entries: Record<string, DownloadEntry>;
  jobs: Record<string, DownloadJob>;
  folder: string;
  connected: boolean;
  /** the first snapshot from the download service has arrived */
  synced: boolean;
  connect: () => void;
  download: (tracks: Track[]) => void;
  remove: (ids: string[]) => void;
  cancel: (id: string) => void;
  openFolder: () => void;
}

let source: EventSource | null = null;
/** songs finished since the queue was last empty, for one summary toast */
let batchDone = 0;

const post = (url: string, body?: unknown) =>
  fetch(url, {
    method: 'POST',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });

export const useDownloads = create<DownloadsState>()((set, get) => {
  function apply(e: DownloadEvent) {
    const s = get();
    switch (e.type) {
      case 'snapshot':
        set({
          entries: Object.fromEntries(e.entries.map((x) => [x.track.id, x])),
          jobs: Object.fromEntries(e.jobs.map((j) => [j.id, j])),
          folder: e.folder,
          synced: true,
        });
        useLibrary.getState().remember(e.entries.map((x) => x.track));
        break;
      case 'job': {
        const prev = s.jobs[e.job.id];
        set({ jobs: { ...s.jobs, [e.job.id]: e.job } });
        if (e.job.status === 'error' && prev?.status !== 'error') {
          toast(`Couldn't download “${e.job.track.title}”: ${e.job.error ?? 'unknown error'}`, { tone: 'error' });
        }
        break;
      }
      case 'done': {
        const { [e.entry.track.id]: _gone, ...jobs } = s.jobs;
        set({ entries: { ...s.entries, [e.entry.track.id]: e.entry }, jobs });
        useLibrary.getState().remember([e.entry.track]);
        batchDone++;
        const pending = Object.values(jobs).filter((j) => j.status !== 'error').length;
        if (!pending) {
          toast(batchDone > 1 ? `Downloaded ${batchDone} songs` : `Downloaded “${e.entry.track.title}”`, { tone: 'ok', thumb: e.entry.track.thumb });
          batchDone = 0;
        }
        break;
      }
      case 'removed': {
        const { [e.id]: _e, ...entries } = s.entries;
        const { [e.id]: _j, ...jobs } = s.jobs;
        set({ entries, jobs });
        break;
      }
    }
  }

  return {
    entries: {},
    jobs: {},
    folder: '',
    connected: false,
    synced: false,

    connect: () => {
      if (source) return;
      source = new EventSource('/api/downloads/events');
      source.onopen = () => set({ connected: true });
      source.onerror = () => set({ connected: false });
      source.onmessage = (m) => {
        try {
          apply(JSON.parse(m.data) as DownloadEvent);
        } catch {
          /* malformed event */
        }
      };
    },

    download: (tracks) => {
      const { entries, jobs } = get();
      const todo = tracks.filter((t) => !entries[t.id] && (!jobs[t.id] || jobs[t.id].status === 'error'));
      if (!todo.length) {
        toast(tracks.length > 1 ? 'Already downloaded' : `“${tracks[0]?.title}” is already downloaded`, { tone: 'info' });
        return;
      }
      useLibrary.getState().remember(todo);
      void post('/api/downloads', todo).catch(() => toast('The download service is not reachable', { tone: 'error' }));
      if (todo.length > 1) toast(`Downloading ${todo.length} songs…`, { tone: 'info' });
    },

    remove: (ids) => {
      for (const id of ids) void fetch(`/api/downloads/${id}`, { method: 'DELETE' });
    },

    cancel: (id) => void post(`/api/downloads/${id}/cancel`),

    openFolder: () => void post('/api/downloads/open-folder'),
  };
});

export type DownloadState = { state: 'none' | 'queued' | 'downloading' | 'done' | 'error'; progress: number };

export function useDownloadState(id: string): DownloadState {
  return useDownloads((s) => {
    if (s.entries[id]) return DONE;
    const j = s.jobs[id];
    if (!j) return NONE;
    if (j.status === 'error') return ERROR;
    if (j.status === 'queued') return QUEUED;
    // round so the selector result stays stable between tiny updates
    return progressState(Math.round(j.progress * 50) / 50);
  });
}

const DONE: DownloadState = { state: 'done', progress: 1 };
const NONE: DownloadState = { state: 'none', progress: 0 };
const ERROR: DownloadState = { state: 'error', progress: 0 };
const QUEUED: DownloadState = { state: 'queued', progress: 0 };
const progressCache = new Map<number, DownloadState>();
function progressState(p: number): DownloadState {
  let v = progressCache.get(p);
  if (!v) progressCache.set(p, (v = { state: 'downloading', progress: p }));
  return v;
}

export function downloadedTracks(entries: Record<string, DownloadEntry>): DownloadEntry[] {
  return Object.values(entries).sort((a, b) => b.at - a.at);
}

export function fmtBytes(n: number): string {
  if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 ** 3).toFixed(2)} GB`;
}
