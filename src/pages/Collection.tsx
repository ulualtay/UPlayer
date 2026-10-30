import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowDownUp, CircleCheck, CirclePlus, Copy, Ellipsis, ListEnd, Pencil, Search, Shuffle, Trash2, X } from 'lucide-react';
import type { Track } from '../../shared/types';
import { api, useQuery } from '../lib/api';
import { useDebounced } from '../lib/hooks';
import { artistsText, count, fold, totalDuration } from '../lib/format';
import { addToPlaylist, enqueue, newPlaylistWith, play } from '../lib/actions';
import { usePendingAdds, usePendingFor } from '../store/pendingAdds';
import { useDownloadState } from '../store/downloads';
import { ProgressRing } from '../components/DownloadButton';
import { controls } from '../player/controls';
import { useLibrary, tracksFor } from '../store/library';
import { usePlayback, usePlayer, type PlayContext } from '../store/player';
import { toast, useUI } from '../store/ui';
import { ActionBar, PageHeader, StickyBar, useHeaderColor } from '../components/PageHeader';
import { TrackList } from '../components/TrackList';
import { DownloadAllButton } from '../components/DownloadButton';
import { LikedCover } from '../components/Sidebar';
import { Cover, ErrorBox, IconBtn, Mosaic, PlayFab, Skeleton, Spinner, cx } from '../components/ui';

type SortKey = 'custom' | 'title' | 'artist' | 'album' | 'added' | 'duration';
const SORTS: [SortKey, string][] = [
  ['custom', 'Custom order'],
  ['title', 'Title'],
  ['artist', 'Artist'],
  ['album', 'Album'],
  ['added', 'Date added'],
  ['duration', 'Duration'],
];

interface ViewProps {
  context: PlayContext;
  kind: string;
  title: string;
  art: ReactNode;
  thumb?: string;
  meta: ReactNode;
  tracks: Track[];
  addedAt?: number[];
  showAlbum?: boolean;
  numbered?: boolean;
  onRemove?: (index: number) => void;
  actions?: ReactNode;
  onTitleClick?: () => void;
  after?: ReactNode;
  colorFallback?: string;
}

function CollectionView({ context, kind, title, art, thumb, meta, tracks, addedAt, showAlbum = true, numbered = true, onRemove, actions, onTitleClick, after, colorFallback }: ViewProps) {
  const color = useHeaderColor(thumb, colorFallback);
  const isCtx = usePlayer((s) => s.context?.id === context.id);
  const playing = usePlayback((s) => s.playing) && isCtx;
  const shuffle = usePlayer((s) => s.shuffle);
  const openMenu = useUI((s) => s.openMenu);
  const [filter, setFilter] = useState('');
  const [filterOpen, setFilterOpen] = useState(false);
  const [sort, setSort] = useState<SortKey>('custom');

  const view = useMemo(() => {
    let rows = tracks.map((t, i) => ({ t, i, at: addedAt?.[i] ?? 0 }));
    const f = fold(filter.trim());
    if (f) rows = rows.filter(({ t }) => fold(`${t.title} ${artistsText(t)} ${t.album?.name ?? ''}`).includes(f));
    const by: Record<SortKey, ((a: (typeof rows)[number], b: (typeof rows)[number]) => number) | null> = {
      custom: null,
      title: (a, b) => a.t.title.localeCompare(b.t.title),
      artist: (a, b) => artistsText(a.t).localeCompare(artistsText(b.t)),
      album: (a, b) => (a.t.album?.name ?? '').localeCompare(b.t.album?.name ?? ''),
      added: (a, b) => b.at - a.at,
      duration: (a, b) => a.t.duration - b.t.duration,
    };
    const cmp = by[sort];
    if (cmp) rows = [...rows].sort(cmp);
    return rows;
  }, [tracks, addedAt, filter, sort]);

  const visibleTracks = view.map((r) => r.t);
  const start = () => (isCtx ? controls.toggle() : play(visibleTracks, -1, context, { shuffle }));

  return (
    <div>
      <StickyBar color={color} title={title} playing={playing} onPlay={start} />
      <PageHeader color={color} art={art} kind={kind} title={title} meta={meta} onTitleClick={onTitleClick} />
      <ActionBar color={color}>
        <PlayFab size={56} playing={playing} onClick={start} label={playing ? 'Pause' : `Play ${title}`} />
        <IconBtn
          tip={shuffle ? `Disable shuffle for ${title}` : `Shuffle ${title}`}
          active={shuffle}
          onClick={() => {
            const st = usePlayer.getState();
            if (!isCtx) play(visibleTracks, -1, context, { shuffle: true });
            else st.toggleShuffle();
          }}
          className="h-10 w-10"
        >
          <Shuffle className="h-7 w-7" />
        </IconBtn>
        <DownloadAllButton tracks={tracks} />
        {actions}
        <IconBtn
          tip="More options"
          onClick={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            openMenu(r.left, r.bottom + 4, [
              { label: 'Add to queue', icon: ListEnd, onSelect: () => enqueue(visibleTracks) },
              {
                label: 'Save a copy as a playlist',
                icon: Copy,
                onSelect: () => newPlaylistWith(visibleTracks, title),
              },
            ]);
          }}
          className="h-10 w-10"
        >
          <Ellipsis className="h-7 w-7" />
        </IconBtn>
        <div className="ml-auto flex items-center gap-2">
          {filterOpen || filter ? (
            <div className="flex h-8 items-center gap-2 rounded bg-surface-3 px-2">
              <Search className="h-4 w-4 text-fg-2" />
              <input
                autoFocus
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                onBlur={() => !filter && setFilterOpen(false)}
                placeholder="Search in playlist"
                className="w-44 bg-transparent text-sm outline-none placeholder:text-fg-3"
              />
              {filter && (
                <button aria-label="Clear" onClick={() => setFilter('')}>
                  <X className="h-4 w-4 text-fg-2" />
                </button>
              )}
            </div>
          ) : (
            <IconBtn tip="Search in playlist" onClick={() => setFilterOpen(true)} className="h-8 w-8 hover:bg-surface-2">
              <Search className="h-[18px] w-[18px]" />
            </IconBtn>
          )}
          <button
            type="button"
            onClick={(e) => {
              const r = e.currentTarget.getBoundingClientRect();
              openMenu(
                r.left,
                r.bottom + 4,
                SORTS.filter(([k]) => k !== 'added' || addedAt).map(([k, label]) => ({ label: `${sort === k ? '✓ ' : ''}${label}`, onSelect: () => setSort(k) })),
              );
            }}
            className="flex items-center gap-2 text-sm text-fg-2 hover:text-fg"
          >
            {SORTS.find(([k]) => k === sort)![1]}
            <ArrowDownUp className="h-4 w-4" />
          </button>
        </div>
      </ActionBar>
      <div className="px-6 pb-10">
        {tracks.length > 0 ? (
          <TrackList
            tracks={visibleTracks}
            context={context}
            showAlbum={showAlbum}
            numbered={numbered}
            addedAt={addedAt ? view.map((r) => r.at) : undefined}
            onRemove={onRemove && sort === 'custom' && !filter ? onRemove : undefined}
          />
        ) : null}
        {after}
      </div>
    </div>
  );
}

// ---------- Liked songs ----------

export function LikedPage() {
  const liked = useLibrary((s) => s.liked);
  const tracksMap = useLibrary((s) => s.tracks);
  const tracks = tracksFor(liked, tracksMap);
  return (
    <CollectionView
      context={{ type: 'liked', id: 'liked', name: 'Liked Songs', path: '/liked' }}
      kind="Playlist"
      title="Liked Songs"
      art={<LikedCover className="aspect-square w-full" />}
      colorFallback="#5038a0"
      meta={<span>{count(tracks.length, 'song')}</span>}
      tracks={tracks}
      addedAt={liked.map((e) => e.at)}
      after={
        tracks.length === 0 && (
          <div className="py-12 text-center">
            <h3 className="text-2xl font-bold">Songs you like will appear here</h3>
            <p className="mt-2 text-fg-2">Save songs by tapping the plus icon.</p>
            <Link to="/search" className="mt-6 inline-block rounded-full bg-fg px-6 py-3 font-bold text-bg transition hover:scale-105">
              Find songs
            </Link>
          </div>
        )
      }
    />
  );
}

// ---------- Local playlist ----------

export function PlaylistPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const pl = useLibrary((s) => s.playlists.find((p) => p.id === id));
  const tracksMap = useLibrary((s) => s.tracks);
  const lib = useLibrary.getState();
  const editing = params.get('edit') === '1';
  const tracks = pl ? tracksFor(pl.entries, tracksMap) : [];

  if (!pl) {
    return (
      <div className="p-10 text-center">
        <h2 className="text-2xl font-bold">Playlist not found</h2>
        <Link to="/" className="mt-4 inline-block text-fg-2 underline">
          Back to Home
        </Link>
      </div>
    );
  }

  return (
    <>
      <CollectionView
        context={{ type: 'playlist', id: pl.id, name: pl.name, path: `/playlist/${pl.id}` }}
        kind={pl.source ? 'Imported from YouTube' : 'Playlist'}
        title={pl.name}
        thumb={tracks[0]?.thumb}
        art={<Mosaic thumbs={tracks.slice(0, 12).map((t) => t.thumb)} className="aspect-square w-full" />}
        meta={
          <>
            {pl.description && <p className="mb-2 w-full text-fg-2">{pl.description}</p>}
            <span className="font-semibold text-fg">You</span>
            <span>• {count(tracks.length, 'song')}{tracks.length ? `, ${totalDuration(tracks)}` : ''}</span>
          </>
        }
        tracks={tracks}
        addedAt={pl.entries.map((e) => e.at)}
        onRemove={(i) => lib.removeFromPlaylist(pl.id, i)}
        onTitleClick={() => setParams({ edit: '1' })}
        actions={
          <>
            <IconBtn tip="Edit details" onClick={() => setParams({ edit: '1' })} className="h-10 w-10">
              <Pencil className="h-6 w-6" />
            </IconBtn>
            <IconBtn
              tip="Delete playlist"
              onClick={() => {
                if (confirm(`Delete “${pl.name}”?`)) {
                  lib.deletePlaylist(pl.id);
                  navigate('/');
                }
              }}
              className="h-10 w-10"
            >
              <Trash2 className="h-6 w-6" />
            </IconBtn>
          </>
        }
        after={
          <>
            <WaitingForDownload playlistId={pl.id} />
            <PlaylistFinder playlistId={pl.id} existing={new Set(tracks.map((t) => t.id))} empty={!tracks.length} />
          </>
        }
      />
      {editing && <EditDialog id={pl.id} onClose={() => setParams({})} />}
    </>
  );
}

/** Songs added to this playlist that are still downloading; they move up into the list when done. */
function WaitingForDownload({ playlistId }: { playlistId: string }) {
  const waiting = usePendingFor(playlistId);
  if (!waiting.length) return null;
  return (
    <section className="mt-6">
      <h3 className="mb-1 px-2 text-sm font-bold text-fg-2">Downloading. These join the playlist when they're done</h3>
      {waiting.map((t) => (
        <WaitingRow key={t.id} track={t} />
      ))}
    </section>
  );
}

function WaitingRow({ track }: { track: Track }) {
  const dl = useDownloadState(track.id);
  return (
    <div className="flex items-center gap-3 rounded-md px-2 py-1.5 hover:bg-surface-2">
      <Cover src={track.thumb} size={80} className="h-10 w-10 opacity-70" />
      <div className="min-w-0 flex-1 opacity-80">
        <div className="truncate">{track.title}</div>
        <div className="truncate text-sm text-fg-2">{artistsText(track)}</div>
      </div>
      {dl.state === 'downloading' ? <ProgressRing value={Math.max(0.04, dl.progress)} size={20} /> : <Spinner className="h-4 w-4" />}
      <IconBtn tip="Don't add it" onClick={() => usePendingAdds.getState().drop(track.id)} className="h-8 w-8">
        <X className="h-4 w-4" />
      </IconBtn>
    </div>
  );
}

function EditDialog({ id, onClose }: { id: string; onClose: () => void }) {
  const pl = useLibrary((s) => s.playlists.find((p) => p.id === id))!;
  const [name, setName] = useState(pl.name);
  const [desc, setDesc] = useState(pl.description ?? '');
  const save = () => {
    useLibrary.getState().updatePlaylist(id, { name: name.trim() || pl.name, description: desc.trim() || undefined });
    onClose();
  };
  return (
    <div className="fixed inset-0 z-[85] grid place-items-center bg-black/60" onMouseDown={onClose}>
      <form
        onMouseDown={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
        className="w-[520px] max-w-[92vw] rounded-xl bg-surface-2 p-6 shadow-2xl ring-1 ring-line"
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-2xl font-bold">Edit details</h2>
          <button type="button" aria-label="Close" onClick={onClose} className="grid h-8 w-8 place-items-center rounded-full hover:bg-surface-3">
            <X className="h-5 w-5" />
          </button>
        </div>
        <label className="mb-1 block text-xs font-semibold text-fg-2">Name</label>
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onFocus={(e) => e.target.select()}
          className="mb-3 h-10 w-full rounded bg-surface-3 px-3 outline-none ring-line focus:ring-2"
        />
        <label className="mb-1 block text-xs font-semibold text-fg-2">Description</label>
        <textarea
          value={desc}
          onChange={(e) => setDesc(e.target.value)}
          placeholder="Add an optional description"
          rows={4}
          className="w-full resize-none rounded bg-surface-3 p-3 outline-none ring-line focus:ring-2"
        />
        <div className="mt-4 flex justify-end">
          <button type="submit" className="rounded-full bg-fg px-8 py-3 font-bold text-bg transition hover:scale-105">
            Save
          </button>
        </div>
      </form>
    </div>
  );
}

/** "Let's find something for your playlist": search and add (which downloads the song first). */
function PlaylistFinder({ playlistId, existing, empty }: { playlistId: string; existing: Set<string>; empty: boolean }) {
  const [q, setQ] = useState('');
  const debounced = useDebounced(q.trim(), 400);
  const search = useQuery(debounced ? `search:${debounced}` : null, () => api.search(debounced));
  const waiting = new Set(usePendingFor(playlistId).map((t) => t.id));
  const [open, setOpen] = useState(empty);
  useEffect(() => {
    if (empty) setOpen(true);
  }, [empty]);

  const rows = (list: Track[]) =>
    list
      .filter((t) => !existing.has(t.id))
      .slice(0, 10)
      .map((t) => (
        <div key={t.id} className="group flex items-center gap-3 rounded-md px-2 py-1.5 hover:bg-surface-2">
          <Cover src={t.thumb} size={80} className="h-10 w-10" />
          <button className="min-w-0 flex-1 text-left" onDoubleClick={() => play([t], 0, { type: 'other', name: t.title })}>
            <div className="truncate">{t.title}</div>
            <div className="truncate text-sm text-fg-2">{artistsText(t)}</div>
          </button>
          <span className="hidden truncate text-sm text-fg-2 lg:block lg:w-1/4">{t.album?.name}</span>
          {waiting.has(t.id) ? (
            <span className="flex items-center gap-2 px-2 text-sm font-semibold text-fg-2">
              <Spinner className="h-3.5 w-3.5" /> Downloading
            </span>
          ) : (
            <button
              type="button"
              onClick={() => addToPlaylist(playlistId, [t])}
              className="rounded-full border border-fg-3 px-4 py-1 text-sm font-bold transition hover:scale-105 hover:border-fg"
            >
              Add
            </button>
          )}
        </div>
      ));

  return (
    <div className="mt-8">
      <div className="border-t border-line pt-6">
        {open ? (
          <>
            <div className="mb-4 flex items-start justify-between">
              <h2 className="text-2xl font-bold">Let's find something for your playlist</h2>
              {!empty && (
                <IconBtn tip="Close" onClick={() => setOpen(false)} className="h-8 w-8">
                  <X className="h-5 w-5" />
                </IconBtn>
              )}
            </div>
            <div className="mb-4 flex h-10 w-full max-w-md items-center gap-2 rounded bg-surface-3 px-3">
              <Search className="h-5 w-5 text-fg-2" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search for songs" className="flex-1 bg-transparent outline-none placeholder:text-fg-3" />
              {search.loading && <Spinner className="h-4 w-4" />}
            </div>
            {search.data && rows(search.data.videos)}
          </>
        ) : (
          <button onClick={() => setOpen(true)} className="text-sm font-bold text-fg-2 hover:text-fg">
            Find more
          </button>
        )}
      </div>
    </div>
  );
}

// ---------- Remote album / YouTube playlist ----------

function RemoteSkeleton() {
  return (
    <div className="p-6">
      <div className="flex items-end gap-6 pt-10">
        <Skeleton className="h-[232px] w-[232px]" />
        <div className="flex-1 space-y-3">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-16 w-2/3" />
          <Skeleton className="h-4 w-1/3" />
        </div>
      </div>
      <div className="mt-10 space-y-2">
        {Array.from({ length: 8 }, (_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    </div>
  );
}

function SaveButton({ item }: { item: { type: 'album' | 'playlist'; id: string; title: string; subtitle?: string; thumb: string } }) {
  const saved = useLibrary((s) => s.saved.some((x) => x.id === item.id));
  return (
    <IconBtn
      tip={saved ? 'Remove from Your Library' : 'Save to Your Library'}
      active={saved}
      onClick={() => {
        const now = useLibrary.getState().toggleSaved(item);
        toast(now ? 'Saved to Your Library' : 'Removed from Your Library', { tone: 'ok', thumb: item.thumb });
      }}
      className="h-10 w-10"
    >
      {saved ? <CircleCheck className="h-8 w-8" fill="currentColor" stroke="var(--bg)" /> : <CirclePlus className="h-8 w-8" />}
    </IconBtn>
  );
}

export function AlbumPage() {
  const { id = '' } = useParams();
  const { data, error, loading, refetch } = useQuery(`album:${id}`, () => api.album(id), 60 * 60_000);
  if (loading) return <RemoteSkeleton />;
  if (error || !data) return <ErrorBox error={error ?? new Error('Album not found')} retry={refetch} />;
  const kind = data.subtitle?.split('•')[0]?.trim() || 'Album';
  return (
    <CollectionView
      context={{ type: 'album', id, name: data.title, path: `/album/${id}` }}
      kind={kind}
      title={data.title}
      thumb={data.thumb}
      art={<Cover src={data.thumb} size={544} className="aspect-square w-full" />}
      showAlbum={false}
      meta={
        <>
          {data.author && (
            <span className="font-bold text-fg">
              {data.author.id ? (
                <Link to={`/artist/${data.author.id}`} className="hover:underline">
                  {data.author.name}
                </Link>
              ) : (
                data.author.name
              )}
            </span>
          )}
          {data.subtitle?.split('•').slice(1).map((s, i) => <span key={i}>• {s.trim()}</span>)}
          <span>
            • {count(data.tracks.length, 'song')}, {totalDuration(data.tracks)}
          </span>
        </>
      }
      tracks={data.tracks}
      actions={<SaveButton item={{ type: 'album', id, title: data.title, subtitle: data.author?.name, thumb: data.thumb }} />}
      after={data.description && <p className="mt-8 max-w-3xl text-sm leading-relaxed text-fg-2 line-clamp-6">{data.description}</p>}
    />
  );
}

export function YtPlaylistPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { data, error, loading, refetch } = useQuery(`playlist:${id}`, () => api.playlist(id), 15 * 60_000);
  if (loading) return <RemoteSkeleton />;
  if (error || !data) return <ErrorBox error={error ?? new Error('Playlist not found')} retry={refetch} />;
  const importIt = () => {
    // playlists only hold downloaded songs: importing downloads them, and they fill in as they finish
    const pid = newPlaylistWith(data.tracks, data.title, { source: { type: 'youtube', id }, description: data.description });
    navigate(`/playlist/${pid}`);
  };
  return (
    <CollectionView
      context={{ type: 'playlist', id, name: data.title, path: `/yt/${id}` }}
      kind="YouTube playlist"
      title={data.title}
      thumb={data.thumb}
      art={<Cover src={data.thumb} size={544} className="aspect-square w-full" />}
      meta={
        <>
          {data.description && <p className="mb-2 line-clamp-2 w-full text-fg-2">{data.description}</p>}
          {data.author && <span className="font-bold text-fg">{data.author.name}</span>}
          <span>
            • {count(data.tracks.length, 'song')}{data.tracks.length ? `, ${totalDuration(data.tracks)}` : ''}
          </span>
          {data.subtitle && <span className="text-fg-2">• {data.subtitle}</span>}
        </>
      }
      tracks={data.tracks}
      actions={
        <>
          <SaveButton item={{ type: 'playlist', id, title: data.title, subtitle: data.author?.name, thumb: data.thumb }} />
          <button
            type="button"
            onClick={importIt}
            className={cx('rounded-full border border-fg-3 px-4 py-1.5 text-sm font-bold transition hover:scale-105 hover:border-fg')}
          >
            Import a copy to Your Library
          </button>
        </>
      }
    />
  );
}

