import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Ellipsis, Link2, Play, Search as SearchIcon, X } from 'lucide-react';
import type { Track } from '../../shared/types';
import { api, useQuery } from '../lib/api';
import { parseYouTubeUrl } from '../lib/youtube-url';
import { artistsText, fmtTime } from '../lib/format';
import { dragTracks, openTrackMenu, play } from '../lib/actions';
import { controls } from '../player/controls';
import { usePlayback, usePlayer, type PlayContext } from '../store/player';
import { DownloadButton } from '../components/DownloadButton';
import { Cover, Equalizer, ErrorBox, IconBtn, PlayFab, Skeleton, Spinner, cx } from '../components/ui';

export function SearchPage() {
  const { q: raw } = useParams();
  const q = raw ? decodeURIComponent(raw) : '';
  if (!q) return <Browse />;
  const link = parseYouTubeUrl(q);
  if (link) return <LinkResult link={link} />;
  return <Results key={q} q={q} />;
}

/** Before you type: nothing to browse, just what the box can do. */
function Browse() {
  return (
    <div className="grid min-h-[60vh] place-items-center px-6 pb-10 pt-6 text-center">
      <div className="max-w-md">
        <SearchIcon className="mx-auto mb-4 h-14 w-14 text-fg-3" strokeWidth={1.5} />
        <h1 className="text-2xl font-bold">Search YouTube</h1>
        <p className="mt-2 text-fg-2">Any song, live recording, cover or sped-up version, straight from YouTube.</p>
        <p className="mt-6 flex items-center justify-center gap-2 text-sm text-fg-3">
          <Link2 className="h-4 w-4" /> You can also paste a YouTube video or playlist link.
        </p>
      </div>
    </div>
  );
}

/** YouTube's own results, as a list of videos, one page at a time. */
function Results({ q }: { q: string }) {
  const { data, error, loading, refetch } = useQuery(`search:${q}`, () => api.search(q), 10 * 60_000);
  const [extra, setExtra] = useState<{ videos: Track[]; page: number; more: boolean; busy: boolean }>({ videos: [], page: 0, more: true, busy: false });
  const ctx: PlayContext = { type: 'search', id: `search:${q}`, name: `Search: “${q}”`, path: `/search/${encodeURIComponent(q)}` };

  const seen = new Set<string>();
  const videos = [...(data?.videos ?? []), ...extra.videos].filter((v) => !seen.has(v.id) && seen.add(v.id));
  const more = extra.page === 0 ? !!data?.more : extra.more;

  const loadMore = async () => {
    setExtra((s) => ({ ...s, busy: true }));
    try {
      const next = await api.search(q, extra.page + 1);
      setExtra((s) => ({ videos: [...s.videos, ...next.videos], page: s.page + 1, more: next.more, busy: false }));
    } catch {
      setExtra((s) => ({ ...s, busy: false }));
    }
  };

  return (
    <div className="px-4 pb-10 pt-4">
      {loading && !data && <ResultsSkeleton />}
      {error && <ErrorBox error={error} retry={refetch} />}
      {data && !videos.length && (
        <div className="py-16 text-center">
          <h3 className="text-2xl font-bold">No results for “{q}”</h3>
          <p className="mt-2 text-fg-2">Check the spelling, try fewer words, or paste a YouTube link.</p>
        </div>
      )}
      <div className="space-y-1">
        {videos.map((v, i) => (
          <VideoRow key={v.id} video={v} onPlay={() => play(videos, i, ctx)} />
        ))}
      </div>
      {data && videos.length > 0 && more && (
        <div className="mt-6 flex justify-center">
          <button
            type="button"
            disabled={extra.busy}
            onClick={() => void loadMore()}
            className="flex items-center gap-2 rounded-full px-5 py-2 text-sm font-bold text-fg-2 ring-1 ring-line transition hover:text-fg hover:ring-fg-3 disabled:opacity-60"
          >
            {extra.busy && <Spinner className="h-4 w-4" />} Show more
          </button>
        </div>
      )}
    </div>
  );
}

function VideoRow({ video: v, onPlay }: { video: Track; onPlay: () => void }) {
  const isCurrent = usePlayer((s) => s.current?.track.id === v.id);
  const playing = usePlayback((s) => s.playing) && isCurrent;
  const start = () => (isCurrent ? controls.toggle() : onPlay());
  return (
    <div
      role="button"
      tabIndex={0}
      draggable
      onDragStart={(e) => dragTracks(e, [v])}
      onClick={start}
      onKeyDown={(e) => e.key === 'Enter' && start()}
      onContextMenu={(e) => openTrackMenu(e, v)}
      className={cx('group flex cursor-pointer gap-4 rounded-xl p-2 transition-colors hover:bg-surface-2', isCurrent && 'bg-surface-2/70')}
    >
      <div className="relative aspect-video w-48 shrink-0 overflow-hidden rounded-lg bg-surface-3 @3xl:w-64">
        <img src={v.thumb} alt="" loading="lazy" draggable={false} className="h-full w-full object-cover transition duration-300 group-hover:scale-105" />
        <span className="absolute bottom-1.5 right-1.5 rounded bg-black/80 px-1.5 py-0.5 text-xs font-semibold text-white">{fmtTime(v.duration)}</span>
        <span className={cx('absolute inset-0 grid place-items-center bg-black/35 transition', isCurrent ? 'opacity-100' : 'opacity-0 group-hover:opacity-100')}>
          {isCurrent && playing ? (
            <span className="scale-150">
              <Equalizer />
            </span>
          ) : (
            <Play className="h-10 w-10 text-white" fill="currentColor" strokeWidth={0} />
          )}
        </span>
      </div>
      <div className="min-w-0 flex-1 py-1">
        <div className={cx('line-clamp-2 text-base font-semibold leading-snug @3xl:text-lg', isCurrent && 'text-accent')}>{v.title}</div>
        <div className="mt-1 truncate text-sm text-fg-2">{artistsText(v)}</div>
      </div>
      <div className="flex shrink-0 items-center gap-1 self-center">
        <DownloadButton track={v} size={20} />
        <IconBtn tip="More options" onClick={(e) => openTrackMenu(e, v)} className="h-8 w-8 opacity-0 group-hover:opacity-100 focus-visible:opacity-100">
          <Ellipsis className="h-5 w-5" />
        </IconBtn>
      </div>
    </div>
  );
}

function LinkResult({ link }: { link: { videoId?: string; playlistId?: string } }) {
  const navigate = useNavigate();
  const track = useQuery(link.videoId ? `track:${link.videoId}` : null, () => api.track(link.videoId!), 60 * 60_000);
  return (
    <div className="px-6 py-8">
      <h2 className="mb-4 flex items-center gap-2 text-2xl font-bold">
        <Link2 className="h-6 w-6" /> YouTube link
      </h2>
      <div className="grid max-w-3xl gap-4">
        {link.videoId && (
          <div className="flex items-center gap-4 rounded-lg bg-surface-2 p-4">
            {track.loading && <Spinner />}
            {track.error && <span className="text-fg-2">Could not load video info: {track.error.message}</span>}
            {track.data && (
              <>
                <Cover src={track.data.thumb} size={200} className="h-20 w-20" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-lg font-bold">{track.data.title}</div>
                  <div className="truncate text-fg-2">{artistsText(track.data)}</div>
                </div>
                <PlayFab size={48} onClick={() => play([track.data!], 0, { type: 'other', name: track.data!.title })} />
              </>
            )}
          </div>
        )}
        {link.playlistId && (
          <button
            type="button"
            onClick={() => navigate(`/yt/${link.playlistId}`)}
            className="flex items-center justify-between rounded-lg bg-surface-2 p-4 text-left transition hover:bg-surface-3"
          >
            <div>
              <div className="text-lg font-bold">Open playlist</div>
              <div className="text-sm text-fg-2">Play it, save it, or import a copy to Your Library</div>
            </div>
            <span className="rounded-full bg-fg px-5 py-2 text-sm font-bold text-bg">Open</span>
          </button>
        )}
      </div>
      <button onClick={() => navigate('/search')} className="mt-6 flex items-center gap-1 text-sm text-fg-2 hover:text-fg">
        <X className="h-4 w-4" /> Clear search
      </button>
    </div>
  );
}

function ResultsSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 6 }, (_, i) => (
        <div key={i} className="flex gap-4 p-2">
          <Skeleton className="aspect-video w-48 shrink-0 @3xl:w-64" />
          <div className="flex-1 space-y-2 py-1">
            <Skeleton className="h-5 w-3/4" />
            <Skeleton className="h-4 w-1/3" />
          </div>
        </div>
      ))}
    </div>
  );
}
