import { Link } from 'react-router-dom';
import { AnimatePresence, motion } from 'motion/react';
import { CircleCheck, CirclePlus, Ellipsis, Maximize2, X } from 'lucide-react';
import { usePlayer, upcoming } from '../store/player';
import { useSettings, type RightPanel as Panel } from '../store/settings';
import { useLibrary } from '../store/library';
import { useUI } from '../store/ui';
import { api, useQuery } from '../lib/api';
import { compact } from '../lib/format';
import { openTrackMenu, toggleLike } from '../lib/actions';
import { QueueView } from './Queue';
import { LyricsPreview, LyricsView } from './Lyrics';
import { ArtistLinks } from './TrackList';
import { Cover, IconBtn, cx } from './ui';
import { Visualizer } from './Visualizer';
import { DownloadButton } from './DownloadButton';
import { useArtwork } from '../lib/artwork';

const TABS: { id: Exclude<Panel, null>; label: string }[] = [
  { id: 'now', label: 'Now playing' },
  { id: 'queue', label: 'Queue' },
  { id: 'lyrics', label: 'Lyrics' },
];

export function RightPanel() {
  const panel = useSettings((s) => s.rightPanel);
  const set = useSettings((s) => s.set);
  return (
    <AnimatePresence initial={false}>
      {panel && (
        <motion.aside
          key="right"
          initial={{ width: 0, opacity: 0 }}
          animate={{ width: 340, opacity: 1 }}
          exit={{ width: 0, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 420, damping: 40 }}
          className="panel flex min-h-0 shrink-0 flex-col overflow-hidden"
          aria-label="Side panel"
        >
          <div className="flex w-[340px] items-center gap-1 px-3 pb-1 pt-3">
            <div className="flex flex-1 gap-1">
              {TABS.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => set({ rightPanel: t.id })}
                  className={cx('rounded-full px-3 py-1.5 text-sm font-semibold transition', panel === t.id ? 'bg-fg text-bg' : 'text-fg-2 hover:bg-surface-2 hover:text-fg')}
                >
                  {t.label}
                </button>
              ))}
            </div>
            <IconBtn tip="Close panel" onClick={() => set({ rightPanel: null })} className="h-8 w-8 hover:bg-surface-2">
              <X className="h-[18px] w-[18px]" />
            </IconBtn>
          </div>
          <div className="scroll-area w-[340px] flex-1 px-3 pb-3">
            {panel === 'now' && <NowPlaying />}
            {panel === 'queue' && <QueueView />}
            {panel === 'lyrics' && <LyricsPanel />}
          </div>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}

function LyricsPanel() {
  const current = usePlayer((s) => s.current);
  if (!current) return <p className="p-6 text-center text-sm text-fg-2">Play a song to see its lyrics.</p>;
  return (
    <div className="h-full rounded-xl bg-[color-mix(in_oklab,var(--cover-deep)_70%,transparent)] px-4">
      <LyricsView track={current.track} variant="panel" />
    </div>
  );
}

/** A dark, heavily blurred copy of the artwork for the visualizer to glow on. */
function StageBackdrop({ thumb }: { thumb?: string }) {
  return (
    <>
      <div className="absolute inset-0 scale-150 opacity-80 blur-2xl">
        <Cover src={thumb} size={120} className="h-full w-full rounded-none" />
      </div>
      <div className="absolute inset-0 bg-black/60" />
    </>
  );
}

function NowPlaying() {
  const current = usePlayer((s) => s.current);
  const context = usePlayer((s) => s.context);
  const st = usePlayer();
  const set = useSettings((s) => s.set);
  const viz = useSettings((s) => (s.visualizer ? s.vizStyle : null));
  const beat = useSettings((s) => s.beatPulse);
  const setFullscreen = useUI((s) => s.setFullscreen);
  const liked = useLibrary((s) => (current ? s.liked.some((e) => e.id === current.track.id) : false));
  const t = current?.track;
  const art = useArtwork(t);

  const artistId = t?.artists.find((a) => a.id)?.id;
  const artist = useQuery(artistId ? `artist:${artistId}` : null, () => api.artist(artistId!), 30 * 60_000);

  if (!t) {
    return (
      <div className="grid h-full place-items-center p-6 text-center text-sm text-fg-2">
        Nothing is playing yet. Search and pick a song.
      </div>
    );
  }

  const { manual, context: next } = upcoming(st);
  const nextUp = [...manual, ...next].slice(0, 3);

  return (
    <div className="pt-1">
      {context && (
        <div className="mb-3 truncate px-1 text-sm font-bold">
          {context.path ? (
            <Link to={context.path} className="hover:underline">
              {context.name}
            </Link>
          ) : (
            context.name
          )}
        </div>
      )}

      <div className="group relative overflow-hidden rounded-[10px] bg-black shadow-[0_12px_40px_rgb(0_0_0/0.45)]">
        {viz === 'halo' ? (
          // the cover sits on a dark, blurred copy of itself with the ring of light around it
          <div className="relative aspect-square w-full overflow-hidden">
            <StageBackdrop thumb={art} />
            <Visualizer variant="halo" core={0.7} boost />
            <div className="absolute inset-[15%]" style={beat ? { transform: 'scale(calc(1 + var(--beat, 0) * 0.025))' } : undefined}>
              <Cover src={art} size={544} className="h-full w-full rounded-[8px] shadow-[0_10px_30px_rgb(0_0_0/0.6)]" />
            </div>
          </div>
        ) : (
          <>
            <Cover src={art} size={544} className="aspect-square w-full rounded-none" />
            {viz && (
              // its own dark stage under the cover, so it reads on any artwork
              <div className="relative h-[88px] overflow-hidden">
                <StageBackdrop thumb={art} />
                <div className="absolute inset-x-3 inset-y-2.5">
                  <Visualizer variant={viz} boost />
                </div>
              </div>
            )}
          </>
        )}
        <div className="absolute right-2 top-2 flex gap-1 opacity-0 transition group-hover:opacity-100">
          <IconBtn tip="Fullscreen" onClick={() => setFullscreen(true)} className="h-8 w-8 bg-black/60 !text-white">
            <Maximize2 className="h-4 w-4" />
          </IconBtn>
        </div>
      </div>

      <div className="mt-4 flex items-start gap-2 px-1">
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-2xl font-bold tracking-tight">
            {t.album?.id ? (
              <Link to={`/album/${t.album.id}`} className="hover:underline">
                {t.title}
              </Link>
            ) : (
              t.title
            )}
          </h2>
          <div className="truncate text-fg-2">
            <ArtistLinks artists={t.artists} />
          </div>
        </div>
        <IconBtn tip="More options" onClick={(e) => openTrackMenu(e, t)} className="mt-1 h-8 w-8">
          <Ellipsis className="h-5 w-5" />
        </IconBtn>
        <DownloadButton track={t} size={20} alwaysVisible className="mt-1" />
        <IconBtn tip={liked ? 'Remove from Liked Songs' : 'Save to Liked Songs'} active={liked} onClick={() => toggleLike(t)} className="mt-1 h-8 w-8">
          {liked ? <CircleCheck className="h-5 w-5" fill="currentColor" stroke="var(--surface)" /> : <CirclePlus className="h-5 w-5" />}
        </IconBtn>
      </div>

      <LyricsPreview track={t} onOpen={() => set({ rightPanel: 'lyrics' })} />

      {artist.data && (
        <Link to={`/artist/${artist.data.id}`} className="mt-4 block overflow-hidden rounded-xl bg-surface-2 transition hover:bg-surface-3">
          {artist.data.banner && (
            <div className="relative aspect-[16/10]">
              <img src={artist.data.banner} alt="" className="absolute inset-0 h-full w-full object-cover" loading="lazy" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent" />
              <span className="absolute left-4 top-3 text-sm font-bold text-white drop-shadow">About the artist</span>
            </div>
          )}
          <div className="p-4">
            <div className="font-bold">{artist.data.name}</div>
            {artist.data.audience && <div className="text-sm text-fg-2">{artist.data.audience}</div>}
            {artist.data.description && <p className="mt-2 line-clamp-3 text-sm text-fg-2">{artist.data.description}</p>}
            {!artist.data.audience && artist.data.top.length > 0 && <div className="text-sm text-fg-2">{compact(artist.data.top.length)} popular songs</div>}
          </div>
        </Link>
      )}

      {nextUp.length > 0 && (
        <div className="mt-4 rounded-xl bg-surface-2 p-3">
          <div className="mb-2 flex items-center justify-between px-1">
            <span className="text-sm font-bold">Next in queue</span>
            <button type="button" onClick={() => set({ rightPanel: 'queue' })} className="text-xs font-semibold text-fg-2 hover:text-fg hover:underline">
              Open queue
            </button>
          </div>
          {nextUp.map((it) => (
            <button
              key={it.uid}
              type="button"
              onClick={() => st.jumpTo(it.uid)}
              className="flex w-full items-center gap-3 rounded-md p-1.5 text-left hover:bg-surface-3"
            >
              <Cover src={it.track.thumb} size={80} className="h-10 w-10" />
              <div className="min-w-0">
                <div className="truncate text-sm">{it.track.title}</div>
                <div className="truncate text-xs text-fg-2">{it.track.artists.map((a) => a.name).join(', ')}</div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
