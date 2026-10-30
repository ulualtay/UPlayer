import {
  CircleArrowDown,
  CircleCheck,
  CirclePlus,
  Copy,
  Disc3,
  ExternalLink,
  ListEnd,
  ListPlus,
  ListStart,
  Mic2,
  Plus,
  Radio,
  Trash2,
} from 'lucide-react';
import type { Track } from '../../shared/types';
import { useDownloads } from '../store/downloads';
import { useLibrary, type Playlist } from '../store/library';
import { requestDownloads, usePendingAdds } from '../store/pendingAdds';
import { count } from './format';
import { usePlayer, type PlayContext } from '../store/player';
import { toast, useUI, type MenuItem } from '../store/ui';

// Router navigation for code that lives outside components (menus, palette).
let navigateFn: (to: string) => void = (to) => {
  window.location.hash = to;
};
export function setNavigate(fn: (to: string) => void) {
  navigateFn = fn;
}
export const go = (to: string) => navigateFn(to);

export function play(tracks: Track[], index: number, context: PlayContext, opts?: { shuffle?: boolean }) {
  usePlayer.getState().playList(tracks, index, context, opts);
}

export function toggleLike(track: Track) {
  const liked = useLibrary.getState().toggleLike(track);
  toast(liked ? 'Added to Liked Songs' : 'Removed from Liked Songs', {
    thumb: track.thumb,
    tone: 'ok',
  });
}

/**
 * Playlists only hold downloaded songs: those already on disk go in now, the
 * rest are downloaded first and join when their download finishes (see store/pendingAdds).
 */
export function addToPlaylist(playlistId: string, tracks: Track[], opts: { quiet?: boolean } = {}) {
  const lib = useLibrary.getState();
  const pl = lib.playlists.find((p) => p.id === playlistId);
  if (!pl) return;
  const inList = new Set(pl.entries.map((e) => e.id));
  const { entries } = useDownloads.getState();
  const ready = tracks.filter((t) => entries[t.id]);
  const waiting = tracks.filter((t) => !entries[t.id] && !inList.has(t.id));
  const added = ready.length ? lib.addToPlaylist(playlistId, ready) : 0;
  if (waiting.length) {
    lib.remember(waiting);
    usePendingAdds.getState().add(playlistId, waiting);
    requestDownloads(waiting);
  }
  if (opts.quiet) return;
  const name = `“${pl.name}”`;
  if (waiting.length && added) {
    toast(`Added ${count(added, 'song')} to ${name}. ${count(waiting.length, 'more song')} will follow once downloaded`, { tone: 'ok', thumb: tracks[0]?.thumb });
  } else if (waiting.length) {
    toast(
      waiting.length === 1 ? `Downloading “${waiting[0].title}”. It joins ${name} when it's done` : `Downloading ${waiting.length} songs. They join ${name} as they finish`,
      { tone: 'info', thumb: waiting[0].thumb },
    );
  } else if (added === 0) toast(`Already in ${name}`, { tone: 'info' });
  else toast(added === 1 ? `Added to ${name}` : `Added ${added} songs to ${name}`, { tone: 'ok', thumb: tracks[0]?.thumb });
}

export function newPlaylistWith(tracks: Track[], name?: string, extra?: { source?: Playlist['source']; description?: string }) {
  const id = useLibrary.getState().createPlaylist(name, [], extra?.source, extra?.description);
  addToPlaylist(id, tracks, { quiet: true });
  const waiting = tracks.filter((t) => !useDownloads.getState().entries[t.id]).length;
  toast(waiting ? `Playlist created. ${count(waiting, 'song')} will appear as ${waiting === 1 ? 'it downloads' : 'they download'}` : 'Playlist created', {
    tone: 'ok',
    action: { label: 'Open', run: () => go(`/playlist/${id}`) },
  });
  return id;
}

export function enqueue(tracks: Track[], next = false) {
  const p = usePlayer.getState();
  if (next) p.playNext(tracks);
  else p.addToQueue(tracks);
  toast(next ? 'Will play next' : tracks.length > 1 ? `Added ${tracks.length} songs to queue` : 'Added to queue', { tone: 'ok' });
}

export function playlistSubmenu(tracks: Track[]): MenuItem[] {
  const { playlists } = useLibrary.getState();
  return [
    { label: 'New playlist', icon: Plus, onSelect: () => newPlaylistWith(tracks) },
    ...(playlists.length ? [{ divider: true } as MenuItem] : []),
    ...playlists.slice(0, 20).map((p) => ({ label: p.name, onSelect: () => addToPlaylist(p.id, tracks) })),
  ];
}

export function trackMenuItems(track: Track, extra?: { removeFromPlaylist?: () => void; removeFromQueue?: () => void }): MenuItem[] {
  const liked = useLibrary.getState().isLiked(track.id);
  const artist = track.artists.find((a) => a.id);
  const dl = useDownloads.getState();
  const downloaded = !!dl.entries[track.id];
  const downloading = !!dl.jobs[track.id] && dl.jobs[track.id].status !== 'error';
  const items: MenuItem[] = [
    { label: 'Add to playlist', icon: ListPlus, submenu: playlistSubmenu([track]) },
    { label: liked ? 'Remove from Liked Songs' : 'Save to Liked Songs', icon: liked ? CircleCheck : CirclePlus, onSelect: () => toggleLike(track) },
    downloaded
      ? { label: 'Remove download', icon: Trash2, onSelect: () => dl.remove([track.id]) }
      : downloading
        ? { label: 'Cancel download', icon: CircleArrowDown, onSelect: () => dl.cancel(track.id) }
        : { label: 'Download', icon: CircleArrowDown, onSelect: () => dl.download([track]) },
    { divider: true },
    { label: 'Play next', icon: ListStart, onSelect: () => enqueue([track], true) },
    { label: 'Add to queue', icon: ListEnd, onSelect: () => enqueue([track]) },
    { label: 'Go to song radio', icon: Radio, onSelect: () => void usePlayer.getState().startRadio(track) },
    { divider: true },
  ];
  if (artist?.id) items.push({ label: 'Go to artist', icon: Mic2, onSelect: () => go(`/artist/${artist.id}`) });
  if (track.album?.id) items.push({ label: 'Go to album', icon: Disc3, onSelect: () => go(`/album/${track.album!.id}`) });
  if (extra?.removeFromPlaylist) items.push({ label: 'Remove from this playlist', icon: Trash2, danger: true, onSelect: extra.removeFromPlaylist });
  if (extra?.removeFromQueue) items.push({ label: 'Remove from queue', icon: Trash2, danger: true, onSelect: extra.removeFromQueue });
  items.push(
    { divider: true },
    { label: 'Open on YouTube', icon: ExternalLink, onSelect: () => window.open(`https://music.youtube.com/watch?v=${track.id}`, '_blank', 'noopener') },
    {
      label: 'Copy song link',
      icon: Copy,
      onSelect: () => {
        void navigator.clipboard.writeText(`https://youtu.be/${track.id}`);
        toast('Link copied to clipboard', { tone: 'ok' });
      },
    },
  );
  return items;
}

export function openTrackMenu(e: React.MouseEvent, track: Track, extra?: Parameters<typeof trackMenuItems>[1]) {
  e.preventDefault();
  e.stopPropagation();
  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
  const fromButton = e.type === 'click';
  useUI.getState().openMenu(fromButton ? rect.right : e.clientX, fromButton ? rect.bottom + 4 : e.clientY, trackMenuItems(track, extra));
}

// ---------- drag & drop of tracks onto playlists / queue ----------

export const DRAG_MIME = 'application/x-uplayer-tracks';

export function dragTracks(e: React.DragEvent, tracks: Track[]) {
  e.dataTransfer.effectAllowed = 'copy';
  e.dataTransfer.setData(DRAG_MIME, JSON.stringify(tracks));
  e.dataTransfer.setData('text/plain', tracks.map((t) => `https://youtu.be/${t.id}`).join('\n'));
  const ghost = document.createElement('div');
  ghost.textContent = tracks.length > 1 ? `${tracks.length} songs` : tracks[0].title;
  ghost.style.cssText =
    'position:fixed;top:-100px;left:-100px;padding:6px 12px;border-radius:6px;background:var(--surface-3);color:var(--text);font:600 13px var(--font-sans);';
  document.body.appendChild(ghost);
  e.dataTransfer.setDragImage(ghost, 10, 10);
  window.setTimeout(() => ghost.remove(), 0);
}

export function droppedTracks(e: React.DragEvent): Track[] | null {
  const raw = e.dataTransfer.getData(DRAG_MIME);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Track[];
  } catch {
    return null;
  }
}
