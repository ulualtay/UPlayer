import { useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ArrowDownAZ, Clock, EyeOff, Heart, Library, PanelLeftClose, PanelLeftOpen, Play, Plus, Search, Trash2, Volume2, X } from 'lucide-react';
import { useLibrary, tracksFor } from '../store/library';
import { usePlayback, usePlayer } from '../store/player';
import { useSettings } from '../store/settings';
import { toast, useUI } from '../store/ui';
import { addToPlaylist, droppedTracks, play, toggleLike } from '../lib/actions';
import { count, fold } from '../lib/format';
import { Cover, IconBtn, Mosaic, Pill, cx } from './ui';
import { cardPath, playCard } from './Cards';
import { DownloadsCover } from '../pages/Downloads';
import { downloadedTracks, useDownloads } from '../store/downloads';

/** Liked Songs and Downloads stay on top, in this order. */
const PINNED: Record<string, number> = { liked: 0, downloads: 1 };

type Filter = 'all' | 'playlist' | 'album' | 'artist';

interface Row {
  key: string;
  path: string;
  title: string;
  subtitle: string;
  kind: Filter;
  at: number;
  cover: React.ReactNode;
  round?: boolean;
  /** the context id the player would report while playing this */
  contextId: string;
  onPlay: () => void;
  onDrop?: (e: React.DragEvent) => void;
}

export function LikedCover({ className }: { className?: string }) {
  return (
    <div className={cx('grid shrink-0 place-items-center rounded-md bg-[linear-gradient(135deg,#4f2dd8,#8e8ee5_60%,#c4efd9)]', className)}>
      <Heart className="h-[40%] w-[40%] text-white" fill="currentColor" />
    </div>
  );
}

export function Sidebar() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { libraryCollapsed: collapsed, libraryWidth, set, pinLiked, pinDownloads, libraryFilters } = useSettings();
  const lib = useLibrary();
  const ctxId = usePlayer((s) => s.context?.id);
  const playing = usePlayback((s) => s.playing);
  const openMenu = useUI((s) => s.openMenu);
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [sort, setSort] = useState<'recent' | 'alpha'>('recent');
  const [dropKey, setDropKey] = useState<string | null>(null);

  const dlEntries = useDownloads((s) => s.entries);
  const activeJobs = useDownloads((s) => Object.values(s.jobs).filter((j) => j.status !== 'error').length);
  const downloaded = useMemo(() => downloadedTracks(dlEntries).map((e) => e.track), [dlEntries]);

  const rows = useMemo<Row[]>(() => {
    const likedTracks = tracksFor(lib.liked, lib.tracks);
    const pinned: Row[] = [
      {
        key: 'liked',
        path: '/liked',
        title: 'Liked Songs',
        subtitle: `Playlist • ${count(lib.liked.length, 'song')}`,
        kind: 'playlist',
        at: Number.MAX_SAFE_INTEGER,
        cover: <LikedCover className="h-full w-full" />,
        contextId: 'liked',
        onPlay: () => play(likedTracks, 0, { type: 'liked', id: 'liked', name: 'Liked Songs', path: '/liked' }),
        onDrop: (e) => droppedTracks(e)?.forEach((t) => !useLibrary.getState().isLiked(t.id) && toggleLike(t)),
      },
      {
        key: 'downloads',
        path: '/downloads',
        title: 'Downloads',
        subtitle: `Offline • ${count(downloaded.length, 'song')}${activeJobs ? ` • ${activeJobs} downloading` : ''}`,
        kind: 'playlist',
        at: Number.MAX_SAFE_INTEGER,
        cover: <DownloadsCover className="h-full w-full" />,
        contextId: 'downloads',
        onPlay: () => play(downloaded, 0, { type: 'playlist', id: 'downloads', name: 'Downloads', path: '/downloads' }),
        onDrop: (e) => {
          const t = droppedTracks(e);
          if (t) useDownloads.getState().download(t);
        },
      },
    ];
    // both can be hidden (right-click → Hide, or Settings → Style); the top bar menu always has them
    const out = pinned.filter((r) => (r.key === 'liked' ? pinLiked : pinDownloads));
    for (const p of lib.playlists) {
      const tracks = tracksFor(p.entries, lib.tracks);
      out.push({
        key: p.id,
        path: `/playlist/${p.id}`,
        title: p.name,
        subtitle: `Playlist • ${count(p.entries.length, 'song')}`,
        kind: 'playlist',
        at: p.updatedAt,
        cover: <Mosaic thumbs={tracks.slice(0, 8).map((t) => t.thumb)} className="h-full w-full" />,
        contextId: p.id,
        onPlay: () => play(tracks, 0, { type: 'playlist', id: p.id, name: p.name, path: `/playlist/${p.id}` }),
        onDrop: (e) => {
          const t = droppedTracks(e);
          if (t) addToPlaylist(p.id, t);
        },
      });
    }
    for (const s of lib.saved) {
      out.push({
        key: s.id,
        path: cardPath(s),
        title: s.title,
        subtitle: `${s.type === 'artist' ? 'Artist' : s.type === 'album' ? 'Album' : 'Playlist'}${s.subtitle ? ` • ${s.subtitle}` : ''}`,
        kind: s.type,
        at: s.at,
        round: s.type === 'artist',
        cover: <Cover src={s.thumb} size={120} round={s.type === 'artist'} className="h-full w-full" />,
        contextId: s.id,
        onPlay: () => void playCard(s),
      });
    }
    return out;
  }, [lib.liked, lib.playlists, lib.saved, lib.tracks, downloaded, activeJobs, pinLiked, pinDownloads]);

  // hidden filters must not keep filtering
  const kind = libraryFilters ? filter : 'all';
  const q = libraryFilters ? query : '';
  const visible = rows
    .filter((r) => kind === 'all' || r.kind === kind)
    .filter((r) => !q || fold(r.title).includes(fold(q)))
    .sort((a, b) => {
      const pa = PINNED[a.key] ?? 9;
      const pb = PINNED[b.key] ?? 9;
      if (pa !== pb) return pa - pb;
      return sort === 'alpha' ? a.title.localeCompare(b.title) : b.at - a.at;
    });

  const createPlaylist = () => navigate(`/playlist/${useLibrary.getState().createPlaylist()}?edit=1`);

  const rowMenu = (e: React.MouseEvent, r: Row) => {
    e.preventDefault();
    const items = [{ label: 'Play', icon: Play, onSelect: r.onPlay }];
    if (lib.playlists.some((p) => p.id === r.key)) {
      items.push({
        label: 'Delete playlist',
        icon: Trash2,
        onSelect: () => {
          if (confirm(`Delete “${r.title}”?`)) {
            lib.deletePlaylist(r.key);
            if (pathname === r.path) navigate('/');
          }
        },
      } as (typeof items)[number]);
    } else if (r.key in PINNED) {
      const key = r.key === 'liked' ? 'pinLiked' : 'pinDownloads';
      items.push({
        label: 'Hide from Your Library',
        icon: EyeOff,
        onSelect: () => {
          set({ [key]: false });
          toast(`${r.title} hidden. It's still in the menu at the top right.`, { action: { label: 'Undo', run: () => set({ [key]: true }) } });
        },
      });
    } else {
      items.push({ label: 'Remove from Your Library', icon: X, onSelect: () => lib.toggleSaved({ ...lib.saved.find((s) => s.id === r.key)! }) });
    }
    openMenu(e.clientX, e.clientY, items);
  };

  const startResize = (e: React.PointerEvent) => {
    const startX = e.clientX;
    const startW = collapsed ? 72 : libraryWidth;
    const move = (ev: PointerEvent) => {
      const w = startW + ev.clientX - startX;
      if (w < 200) set({ libraryCollapsed: true });
      else set({ libraryCollapsed: false, libraryWidth: Math.min(480, Math.max(240, w)) });
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      document.body.style.cursor = '';
    };
    document.body.style.cursor = 'col-resize';
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  return (
    <aside className="panel relative flex min-h-0 shrink-0 flex-col" style={{ width: collapsed ? 72 : libraryWidth }} aria-label="Your Library">
      <div className={cx('flex items-center px-4 pt-3', collapsed ? 'flex-col gap-3' : 'justify-between pb-1')}>
        <button
          type="button"
          onClick={() => set({ libraryCollapsed: !collapsed })}
          data-tip={collapsed ? 'Expand Your Library' : 'Collapse Your Library'}
          className="flex items-center gap-3 font-bold text-fg-2 transition hover:text-fg"
        >
          {collapsed ? <PanelLeftOpen className="h-6 w-6" /> : <Library className="h-6 w-6" />}
          {!collapsed && 'Your Library'}
        </button>
        <div className="flex items-center gap-1">
          <IconBtn tip="Create playlist" onClick={createPlaylist} className="h-8 w-8 hover:bg-surface-2">
            <Plus className="h-5 w-5" />
          </IconBtn>
          {!collapsed && (
            <IconBtn tip="Collapse Your Library" onClick={() => set({ libraryCollapsed: true })} className="h-8 w-8 hover:bg-surface-2">
              <PanelLeftClose className="h-[18px] w-[18px]" />
            </IconBtn>
          )}
        </div>
      </div>

      {!collapsed && libraryFilters && (
        <>
          <div className="no-scrollbar flex gap-2 overflow-x-auto px-4 py-2">
            {(
              [
                ['playlist', 'Playlists'],
                ['album', 'Albums'],
                ['artist', 'Artists'],
              ] as const
            ).map(([k, label]) => (
              <Pill key={k} active={filter === k} onClick={() => setFilter(filter === k ? 'all' : k)}>
                {label}
              </Pill>
            ))}
          </div>
          <div className="flex items-center justify-between px-3 pb-1">
            {searching ? (
              <div className="flex h-8 flex-1 items-center gap-2 rounded bg-surface-3 px-2">
                <Search className="h-4 w-4 text-fg-2" />
                <input
                  autoFocus
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onBlur={() => !query && setSearching(false)}
                  onKeyDown={(e) => e.key === 'Escape' && (setQuery(''), setSearching(false))}
                  placeholder="Search in Your Library"
                  className="w-full bg-transparent text-sm outline-none placeholder:text-fg-3"
                />
              </div>
            ) : (
              <IconBtn tip="Search in Your Library" onClick={() => setSearching(true)} className="h-8 w-8 hover:bg-surface-2">
                <Search className="h-4 w-4" />
              </IconBtn>
            )}
            <button
              type="button"
              onClick={() => setSort(sort === 'recent' ? 'alpha' : 'recent')}
              className="ml-2 flex items-center gap-1.5 text-sm text-fg-2 hover:text-fg"
            >
              {sort === 'recent' ? 'Recents' : 'Alphabetical'}
              {sort === 'recent' ? <Clock className="h-4 w-4" /> : <ArrowDownAZ className="h-4 w-4" />}
            </button>
          </div>
        </>
      )}

      <div className="scroll-area flex-1 px-2 pb-2">
        {visible.map((r) => {
          const active = pathname === r.path;
          const isPlaying = ctxId === r.contextId;
          return (
            <div
              key={r.key}
              role="link"
              tabIndex={0}
              data-tip={collapsed ? r.title : undefined}
              onClick={() => navigate(r.path)}
              onKeyDown={(e) => e.key === 'Enter' && navigate(r.path)}
              onContextMenu={(e) => rowMenu(e, r)}
              onDragOver={(e) => {
                if (!r.onDrop) return;
                e.preventDefault();
                e.dataTransfer.dropEffect = 'copy';
                setDropKey(r.key);
              }}
              onDragLeave={() => setDropKey(null)}
              onDrop={(e) => {
                e.preventDefault();
                setDropKey(null);
                r.onDrop?.(e);
              }}
              className={cx(
                'group flex cursor-pointer items-center gap-3 rounded-md p-2 transition-colors',
                active ? 'bg-surface-3' : 'hover:bg-surface-2',
                dropKey === r.key && 'ring-2 ring-accent',
                collapsed && 'justify-center',
              )}
            >
              <div className="relative h-12 w-12 shrink-0">
                {r.cover}
                <button
                  type="button"
                  aria-label={`Play ${r.title}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    r.onPlay();
                  }}
                  className={cx(
                    'absolute inset-0 grid place-items-center bg-black/50 text-white opacity-0 transition group-hover:opacity-100',
                    r.round ? 'rounded-full' : 'rounded-md',
                  )}
                >
                  <Play className="h-5 w-5" fill="currentColor" strokeWidth={0} />
                </button>
              </div>
              {!collapsed && (
                <div className="min-w-0 flex-1">
                  <div className={cx('truncate text-[15px]', isPlaying ? 'text-accent' : 'text-fg')}>{r.title}</div>
                  <div className="truncate text-sm text-fg-2">{r.subtitle}</div>
                </div>
              )}
              {!collapsed && isPlaying && playing && <Volume2 className="h-4 w-4 shrink-0 text-accent" />}
            </div>
          );
        })}
        {!collapsed && lib.playlists.length === 0 && kind !== 'album' && kind !== 'artist' && (
          <div className="m-2 rounded-lg bg-surface-2 p-4">
            <div className="font-bold">Create your first playlist</div>
            <p className="mt-1 text-sm text-fg-2">It's easy, we'll help you. You can also drag songs here.</p>
            <button onClick={createPlaylist} className="mt-4 rounded-full bg-fg px-4 py-1.5 text-sm font-bold text-bg transition hover:scale-105">
              Create playlist
            </button>
          </div>
        )}
      </div>

      <div onPointerDown={startResize} className="absolute -right-1.5 top-0 z-10 h-full w-2 cursor-col-resize opacity-0 transition hover:opacity-100" aria-hidden>
        <div className="mx-auto h-full w-px bg-fg-3" />
      </div>
    </aside>
  );
}
