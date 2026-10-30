import { useMemo, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { Clock, Flame, Mic2, Music, Search } from 'lucide-react';
import type { Track } from '../../shared/types';
import { artistsText, count, fmtListen, relTime } from '../lib/format';
import { forgottenFavorites, onThisDay } from '../lib/memories';
import { aggregate } from '../lib/stats';
import { WrappedPromo } from './Wrapped';
import { play } from '../lib/actions';
import { controls } from '../player/controls';
import { useHistory } from '../store/history';
import { useLibrary, tracksFor } from '../store/library';
import { usePlayback, usePlayer, type PlayContext } from '../store/player';
import { useSettings } from '../store/settings';
import { downloadedTracks, useDownloads } from '../store/downloads';
import { useHeaderColor } from '../components/PageHeader';
import { Shelf, TrackCard } from '../components/Cards';
import { LikedCover } from '../components/Sidebar';
import { DownloadsCover } from './Downloads';
import { Cover, Mosaic, PlayFab, cx } from '../components/ui';

const homeCtx = (name: string): PlayContext => ({ type: 'home', id: `home-${name}`, name, path: '/' });

/** Only your own music: where you left off, your week, your library and what you played. No recommendations. */
export function HomePage() {
  const lib = useLibrary();
  const events = useHistory((s) => s.events);
  const showMemories = useSettings((s) => s.homeMemories);

  // most recent distinct tracks
  const recent = useMemo(() => {
    const seen = new Set<string>();
    const out: { track: Track; at: number }[] = [];
    for (let i = events.length - 1; i >= 0 && out.length < 16; i--) {
      const t = lib.tracks[events[i].t];
      if (t && !seen.has(t.id)) {
        seen.add(t.id);
        out.push({ track: t, at: events[i].s });
      }
    }
    return out;
  }, [events, lib.tracks]);
  const recentTracks = useMemo(() => recent.map((r) => r.track), [recent]);

  const week = useMemo(() => (events.length ? aggregate(events, lib.tracks, '7d') : null), [events, lib.tracks]);
  const memory = useMemo(() => (showMemories ? onThisDay(events, lib.tracks) : null), [showMemories, events, lib.tracks]);
  const forgotten = useMemo(() => (showMemories ? forgottenFavorites(events, lib.tracks) : null), [showMemories, events, lib.tracks]);

  const last = recent[0];
  // the wash at the top takes the colour of where you left off (and follows the "Page color" setting)
  const headColor = useHeaderColor(last?.track.thumb);

  return (
    <div className="relative">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[340px] transition-[background] duration-700" style={{ background: `linear-gradient(${headColor}, transparent)` }} />
      <div className="relative px-6 pb-10 pt-6">
        {last ? <PickUp track={last.track} at={last.at} list={recentTracks} /> : <StartCard />}

        {week && week.plays > 0 && <ThisWeek week={week} />}

        <YourLibrary />

        {recentTracks.length > 0 && (
          <Shelf title="Recently played" to="/stats">
            {recentTracks.map((t, i) => (
              <TrackCard key={t.id} track={t} list={recentTracks} index={i} context={homeCtx('Recently played')} />
            ))}
          </Shelf>
        )}

        {showMemories && events.length > 30 && <WrappedPromo />}

        {memory && (
          <Shelf title={memory.title} sub={memory.sub}>
            {memory.tracks.map((t, i) => (
              <TrackCard key={t.id} track={t} list={memory.tracks} index={i} context={homeCtx(memory.title)} />
            ))}
          </Shelf>
        )}

        {forgotten && (
          <Shelf title={forgotten.title} sub={forgotten.sub}>
            {forgotten.tracks.map((t, i) => (
              <TrackCard key={t.id} track={t} list={forgotten.tracks} index={i} context={homeCtx(forgotten.title)} />
            ))}
          </Shelf>
        )}
      </div>
    </div>
  );
}

/** The last song you played, big, one click away. */
function PickUp({ track, at, list }: { track: Track; at: number; list: Track[] }) {
  const isCurrent = usePlayer((s) => s.current?.track.id === track.id);
  const playing = usePlayback((s) => s.playing) && isCurrent;
  const start = () => (isCurrent ? controls.toggle() : play(list, 0, homeCtx('Recently played')));
  return (
    <section className="relative mb-6 overflow-hidden rounded-2xl ring-1 ring-line">
      <div className="absolute inset-0 scale-150 opacity-60 blur-3xl" aria-hidden>
        <Cover src={track.thumb} size={120} className="h-full w-full rounded-none" />
      </div>
      <div className="absolute inset-0 bg-gradient-to-r from-black/70 via-black/45 to-black/20" />
      <div className="relative flex items-center gap-6 p-5">
        <button type="button" onClick={start} className="shrink-0" aria-label={`Play ${track.title}`}>
          <Cover src={track.thumb} size={300} className="h-36 w-36 shadow-[0_16px_40px_rgb(0_0_0/0.5)] @3xl:h-44 @3xl:w-44" />
        </button>
        <div className="min-w-0 flex-1 text-white">
          <div className="text-xs font-bold uppercase tracking-[0.18em] text-white/70">{isCurrent ? 'Now playing' : 'Pick up where you left off'}</div>
          <h1 className="mt-1 line-clamp-2 text-3xl font-extrabold tracking-tight @3xl:text-4xl">{track.title}</h1>
          <div className="mt-1 truncate text-white/75">
            {artistsText(track)} • {relTime(at)}
          </div>
          <div className="mt-4 flex items-center gap-3">
            <PlayFab size={52} playing={playing} onClick={start} />
            <span className="text-sm font-semibold text-white/70">{isCurrent ? (playing ? 'Playing' : 'Paused') : 'Play it again'}</span>
          </div>
        </div>
      </div>
    </section>
  );
}

function StartCard() {
  return (
    <div className="mb-10 max-w-xl rounded-xl bg-surface-2/70 p-6 ring-1 ring-line">
      <h1 className="text-2xl font-bold">Start with a song</h1>
      <p className="mt-1 text-fg-2">Search for anything on YouTube, play it, download it and build your playlists. What you listen to shows up here.</p>
      <button
        type="button"
        onClick={() => window.dispatchEvent(new Event('uplayer:focus-search'))}
        className="mt-4 flex items-center gap-2 rounded-full bg-fg px-5 py-2 text-sm font-bold text-bg transition hover:scale-105"
      >
        <Search className="h-4 w-4" /> Search
      </button>
    </div>
  );
}

/** Your last 7 days at a glance; the whole story is on the Stats page. */
function ThisWeek({ week }: { week: NonNullable<ReturnType<typeof aggregate>> }) {
  const navigate = useNavigate();
  const top = week.topArtists[0];
  const tiles: { icon: typeof Clock; label: string; value: ReactNode }[] = [
    { icon: Clock, label: 'Listened', value: fmtListen(week.totalMs) },
    { icon: Music, label: 'Played', value: count(week.plays, 'song') },
    { icon: Mic2, label: 'Most played', value: top?.name ?? '—' },
    { icon: Flame, label: 'Streak', value: week.currentStreak ? count(week.currentStreak, 'day') : '—' },
  ];
  return (
    <section className="mb-8">
      <div className="mb-3 flex items-end justify-between px-1">
        <h2 className="text-2xl font-bold tracking-tight">Your week</h2>
        <button type="button" onClick={() => navigate('/stats')} className="text-sm font-bold text-fg-2 hover:text-fg hover:underline">
          See your stats
        </button>
      </div>
      <div className="grid grid-cols-2 gap-3 @3xl:grid-cols-4">
        {tiles.map((t) => (
          <button
            key={t.label}
            type="button"
            onClick={() => navigate('/stats')}
            className="rounded-xl bg-[color-mix(in_oklab,var(--text)_7%,transparent)] p-4 text-left transition-colors hover:bg-[color-mix(in_oklab,var(--text)_12%,transparent)]"
          >
            <div className="flex items-center gap-2 text-sm text-fg-2">
              <t.icon className="h-4 w-4 text-accent" /> {t.label}
            </div>
            <div className="mt-1 truncate text-xl font-extrabold tracking-tight">{t.value}</div>
          </button>
        ))}
      </div>
    </section>
  );
}

/** Liked Songs, Downloads and your playlists. */
function YourLibrary() {
  const navigate = useNavigate();
  const lib = useLibrary();
  const entries = useDownloads((s) => s.entries);
  const items = useMemo(() => {
    const out: { key: string; title: string; sub: string; art: ReactNode; tracks: Track[]; ctx: PlayContext; path: string }[] = [];
    const liked = tracksFor(lib.liked, lib.tracks);
    if (liked.length) {
      out.push({
        key: 'liked',
        title: 'Liked Songs',
        sub: count(liked.length, 'song'),
        art: <LikedCover className="aspect-square w-full" />,
        tracks: liked,
        ctx: { type: 'liked', id: 'liked', name: 'Liked Songs', path: '/liked' },
        path: '/liked',
      });
    }
    const downloads = downloadedTracks(entries).map((e) => e.track);
    if (downloads.length) {
      out.push({
        key: 'downloads',
        title: 'Downloads',
        sub: count(downloads.length, 'song'),
        art: <DownloadsCover className="aspect-square w-full" />,
        tracks: downloads,
        ctx: { type: 'playlist', id: 'downloads', name: 'Downloads', path: '/downloads' },
        path: '/downloads',
      });
    }
    for (const p of [...lib.playlists].sort((a, b) => b.updatedAt - a.updatedAt)) {
      const tracks = tracksFor(p.entries, lib.tracks);
      out.push({
        key: p.id,
        title: p.name,
        sub: count(tracks.length, 'song'),
        art: <Mosaic thumbs={tracks.slice(0, 8).map((t) => t.thumb)} className="aspect-square w-full" />,
        tracks,
        ctx: { type: 'playlist', id: p.id, name: p.name, path: `/playlist/${p.id}` },
        path: `/playlist/${p.id}`,
      });
    }
    return out;
  }, [lib.liked, lib.playlists, lib.tracks, entries]);

  if (!items.length) return null;
  return (
    <Shelf title="Your library">
      {items.map(({ key, ...it }) => (
        <LibraryCard key={key} {...it} onOpen={() => navigate(it.path)} />
      ))}
    </Shelf>
  );
}

function LibraryCard({ title, sub, art, tracks, ctx, onOpen }: { title: string; sub: string; art: ReactNode; tracks: Track[]; ctx: PlayContext; onOpen: () => void }) {
  const isCtx = usePlayer((s) => s.context?.id === ctx.id);
  const playing = usePlayback((s) => s.playing) && isCtx;
  return (
    <div
      role="link"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => e.key === 'Enter' && onOpen()}
      className="group cursor-pointer rounded-lg p-3 transition-colors hover:bg-surface-2"
    >
      <div className="relative mb-3 overflow-hidden rounded-md shadow-[0_8px_24px_rgb(0_0_0/0.35)]">
        {art}
        {tracks.length > 0 && (
          <PlayFab
            size={48}
            playing={playing}
            className={cx(
              'absolute bottom-2 right-2 transition-all duration-200',
              playing ? 'translate-y-0 opacity-100' : 'translate-y-2 opacity-0 group-hover:translate-y-0 group-hover:opacity-100',
            )}
            onClick={() => (isCtx ? controls.toggle() : play(tracks, 0, ctx))}
          />
        )}
      </div>
      <div className={cx('truncate font-semibold', isCtx && 'text-accent')}>{title}</div>
      <div className="mt-1 truncate text-sm text-fg-2">{sub}</div>
    </div>
  );
}
