import { useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CircleArrowDown, FolderOpen, ListChecks, ListPlus, Plus, RotateCw, Search, Shuffle, Trash2, X } from 'lucide-react';
import type { Track } from '../../shared/types';
import { downloadedTracks, fmtBytes, useDownloads } from '../store/downloads';
import { useLibrary } from '../store/library';
import { usePlayback, usePlayer, type PlayContext } from '../store/player';
import { useUI } from '../store/ui';
import { addToPlaylist, play } from '../lib/actions';
import { artistsText, count, fold } from '../lib/format';
import { controls } from '../player/controls';
import { TrackList } from '../components/TrackList';
import { useHeaderColor } from '../components/PageHeader';
import { ProgressRing } from '../components/DownloadButton';
import { Cover, IconBtn, PlayFab, cx } from '../components/ui';

const CTX: PlayContext = { type: 'playlist', id: 'downloads', name: 'Downloads', path: '/downloads' };

export function DownloadsCover({ className }: { className?: string }) {
  return (
    <div className={cx('grid shrink-0 place-items-center rounded-md bg-[linear-gradient(135deg,#0f766e,#1ed760_55%,#bef264)]', className)}>
      <CircleArrowDown className="h-[42%] w-[42%] text-white" strokeWidth={2.2} />
    </div>
  );
}

export function DownloadsPage() {
  const navigate = useNavigate();
  const entries = useDownloads((s) => s.entries);
  const jobs = useDownloads((s) => s.jobs);
  const folder = useDownloads((s) => s.folder);
  const { openFolder, remove, cancel, download } = useDownloads.getState();
  const openMenu = useUI((s) => s.openMenu);
  const playlists = useLibrary((s) => s.playlists);
  const isCtx = usePlayer((s) => s.context?.id === 'downloads');
  const playing = usePlayback((s) => s.playing) && isCtx;
  const [filter, setFilter] = useState('');
  const [selecting, setSelecting] = useState(false);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const anchor = useRef<number | null>(null);
  // follows the Page color setting; in cover mode it is the Downloads green
  const tint = useHeaderColor(undefined, '#178a4a');

  const all = useMemo(() => downloadedTracks(entries), [entries]);
  const shown = useMemo(() => {
    const f = fold(filter.trim());
    return f ? all.filter((e) => fold(`${e.track.title} ${artistsText(e.track)} ${e.track.album?.name ?? ''}`).includes(f)) : all;
  }, [all, filter]);
  const tracks = shown.map((e) => e.track);
  const totalBytes = all.reduce((s, e) => s + e.size, 0);
  const active = Object.values(jobs);
  const selectedTracks: Track[] = tracks.filter((t) => checked.has(t.id));

  const toggle = (id: string, index: number, range: boolean) => {
    const next = new Set(checked);
    if (range && anchor.current !== null) {
      const [a, b] = [Math.min(anchor.current, index), Math.max(anchor.current, index)];
      const on = !checked.has(id);
      for (let i = a; i <= b; i++) on ? next.add(tracks[i].id) : next.delete(tracks[i].id);
    } else if (next.has(id)) next.delete(id);
    else next.add(id);
    anchor.current = index;
    setChecked(next);
  };

  const stopSelecting = () => {
    setSelecting(false);
    setChecked(new Set());
  };

  const newPlaylistFromSelection = () => {
    const id = useLibrary.getState().createPlaylist(undefined, selectedTracks);
    stopSelecting();
    navigate(`/playlist/${id}?edit=1`);
  };

  return (
    <div>
      <div className="px-6 pb-6 pt-16" style={{ background: `linear-gradient(${tint}, color-mix(in oklab, ${tint} 45%, transparent))` }}>
        <div className="flex items-end gap-6">
          <DownloadsCover className="aspect-square w-[min(232px,22vw)] shadow-[0_8px_48px_rgb(0_0_0/0.5)]" />
          <div className="min-w-0 flex-1 pb-1">
            <div className="text-sm font-semibold">Offline library</div>
            <h1 className="my-2 font-extrabold leading-[1.05] tracking-tight" style={{ fontSize: 'clamp(2rem, 5.6vw, 5.5rem)' }}>
              Downloads
            </h1>
            <div className="flex flex-wrap items-center gap-x-1 text-sm text-fg/80">
              <span>{count(all.length, 'song')}</span>
              <span>• {fmtBytes(totalBytes)}</span>
              {folder && (
                <button onClick={openFolder} className="ml-1 inline-flex items-center gap-1 truncate rounded-full px-2 py-0.5 text-fg/70 hover:bg-fg/10 hover:text-fg" data-tip="Open in File Explorer">
                  <FolderOpen className="h-3.5 w-3.5 shrink-0" /> <span className="truncate">{folder}</span>
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="relative px-6 py-5" style={{ background: `linear-gradient(color-mix(in oklab, ${tint} 45%, transparent), transparent 220px)` }}>
        <div className="flex flex-wrap items-center gap-4">
          <PlayFab size={56} playing={playing} onClick={() => (isCtx ? controls.toggle() : tracks.length && play(tracks, 0, CTX, { shuffle: false }))} label="Play downloads" />
          <IconBtn tip="Shuffle downloads" onClick={() => tracks.length && play(tracks, -1, CTX, { shuffle: true })} className="h-10 w-10">
            <Shuffle className="h-7 w-7" />
          </IconBtn>
          <button
            type="button"
            onClick={() => (selecting ? stopSelecting() : setSelecting(true))}
            className={cx('flex h-9 items-center gap-2 rounded-full px-4 text-sm font-bold ring-1 transition', selecting ? 'bg-fg text-bg ring-fg' : 'ring-fg-3 hover:ring-fg')}
          >
            <ListChecks className="h-4 w-4" /> {selecting ? 'Done' : 'Select songs'}
          </button>
          <div className="ml-auto flex h-8 items-center gap-2 rounded bg-surface-3/70 px-2">
            <Search className="h-4 w-4 text-fg-2" />
            <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Search downloads" className="w-44 bg-transparent text-sm outline-none placeholder:text-fg-3" />
            {filter && (
              <button aria-label="Clear" onClick={() => setFilter('')}>
                <X className="h-4 w-4 text-fg-2" />
              </button>
            )}
          </div>
        </div>

        {selecting && (
          <div className="sticky top-2 z-10 mt-4 flex flex-wrap items-center gap-2 rounded-xl bg-surface-2/90 p-2 pl-4 shadow-xl ring-1 ring-line backdrop-blur">
            <span className="mr-2 text-sm font-semibold">{checked.size ? `${checked.size} selected` : 'Pick songs to make a playlist'}</span>
            <button onClick={() => setChecked(new Set(tracks.map((t) => t.id)))} className="rounded-full px-3 py-1.5 text-sm font-semibold text-fg-2 hover:bg-surface-3 hover:text-fg">
              Select all
            </button>
            {checked.size > 0 && (
              <>
                <button onClick={newPlaylistFromSelection} className="flex items-center gap-1.5 rounded-full bg-accent px-4 py-1.5 text-sm font-bold text-accent-ink transition hover:brightness-110">
                  <Plus className="h-4 w-4" /> New playlist
                </button>
                <button
                  onClick={(e) => {
                    const r = e.currentTarget.getBoundingClientRect();
                    openMenu(
                      r.left,
                      r.bottom + 4,
                      playlists.length
                        ? playlists.map((p) => ({ label: p.name, onSelect: () => (addToPlaylist(p.id, selectedTracks), stopSelecting()) }))
                        : [{ label: 'No playlists yet', disabled: true }],
                    );
                  }}
                  className="flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-bold ring-1 ring-fg-3 hover:ring-fg"
                >
                  <ListPlus className="h-4 w-4" /> Add to playlist
                </button>
                <button
                  onClick={() => {
                    if (confirm(`Delete ${checked.size} downloaded file${checked.size > 1 ? 's' : ''} from your computer?`)) {
                      remove([...checked]);
                      stopSelecting();
                    }
                  }}
                  className="flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-bold text-red-400 ring-1 ring-red-400/40 hover:bg-red-500/10"
                >
                  <Trash2 className="h-4 w-4" /> Delete
                </button>
              </>
            )}
            <button onClick={stopSelecting} aria-label="Stop selecting" className="ml-auto grid h-8 w-8 place-items-center rounded-full hover:bg-surface-3">
              <X className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>

      <div className="px-6 pb-10">
        {active.length > 0 && (
          <section className="mb-8 rounded-xl bg-surface-2/60 p-4 ring-1 ring-line">
            <h2 className="mb-2 font-bold">
              Downloading <span className="font-normal text-fg-2">({active.filter((j) => j.status !== 'error').length} left)</span>
            </h2>
            {active.map((j) => (
              <div key={j.id} className="flex items-center gap-3 rounded-md p-2 hover:bg-surface-3/60">
                <Cover src={j.track.thumb} size={80} className="h-10 w-10" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm">{j.track.title}</div>
                  <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-fg/10">
                    <div className={cx('h-full rounded-full transition-[width] duration-300', j.status === 'error' ? 'bg-red-400' : 'bg-accent')} style={{ width: `${j.status === 'queued' ? 0 : Math.round(j.progress * 100)}%` }} />
                  </div>
                </div>
                <span className="w-28 truncate text-right text-xs tabular-nums text-fg-2">
                  {j.status === 'queued' ? 'Waiting…' : j.status === 'error' ? 'Failed' : `${Math.round(j.progress * 100)}%${j.speed && j.speed !== 'Unknown B/s' ? ` · ${j.speed}` : ''}`}
                </span>
                {j.status === 'downloading' && <ProgressRing value={j.progress} size={18} />}
                {j.status === 'error' ? (
                  <IconBtn tip={j.error ?? 'Retry'} onClick={() => download([j.track])} className="h-8 w-8">
                    <RotateCw className="h-4 w-4" />
                  </IconBtn>
                ) : null}
                <IconBtn tip="Cancel" onClick={() => cancel(j.id)} className="h-8 w-8">
                  <X className="h-4 w-4" />
                </IconBtn>
              </div>
            ))}
          </section>
        )}

        {all.length === 0 ? (
          <div className="py-14 text-center">
            <DownloadsCover className="mx-auto mb-6 h-20 w-20 rounded-2xl" />
            <h3 className="text-2xl font-bold">Download songs to keep them</h3>
            <p className="mx-auto mt-2 max-w-md text-fg-2">
              Every song has a <CircleArrowDown className="inline h-4 w-4 align-[-2px]" /> download button. Downloaded songs play offline, start instantly, and you can turn
              them into playlists right here.
            </p>
            <button onClick={() => navigate('/search')} className="mt-6 rounded-full bg-fg px-6 py-3 font-bold text-bg transition hover:scale-105">
              Search for music
            </button>
          </div>
        ) : shown.length === 0 ? (
          <p className="py-10 text-center text-fg-2">No downloads match “{filter}”.</p>
        ) : (
          <TrackList
            tracks={tracks}
            context={CTX}
            addedAt={shown.map((e) => e.at)}
            checked={selecting ? checked : undefined}
            onToggle={selecting ? toggle : undefined}
            onRemove={(i) => {
              const t = tracks[i];
              if (t && confirm(`Delete the downloaded file of “${t.title}”?`)) remove([t.id]);
            }}
          />
        )}
      </div>
    </div>
  );
}
