import { useRef, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { Card, Track } from '../../shared/types';
import { api } from '../lib/api';
import { dragTracks, openTrackMenu, play } from '../lib/actions';
import { artistsText } from '../lib/format';
import { controls } from '../player/controls';
import { usePlayback, usePlayer, type PlayContext } from '../store/player';
import { toast } from '../store/ui';
import { Cover, PlayFab, cx } from './ui';

export function cardPath(c: Pick<Card, 'type' | 'id'>): string {
  return c.type === 'artist' ? `/artist/${c.id}` : c.type === 'album' ? `/album/${c.id}` : `/yt/${c.id}`;
}

/** Play an album / playlist / artist straight from its card. */
export async function playCard(c: Card) {
  try {
    if (c.type === 'artist') {
      const a = await api.artist(c.id);
      play(a.top, 0, { type: 'artist', id: c.id, name: a.name, path: cardPath(c) });
    } else {
      const col = c.type === 'album' ? await api.album(c.id) : await api.playlist(c.id);
      play(col.tracks, 0, { type: c.type, id: c.id, name: col.title, path: cardPath(c) });
    }
  } catch (err) {
    toast(`Could not play: ${(err as Error).message}`, { tone: 'error' });
  }
}

function useContextPlaying(id: string) {
  const isCtx = usePlayer((s) => s.context?.id === id);
  const playing = usePlayback((s) => s.playing);
  return { isCtx, playing: isCtx && playing };
}

export function MediaCard({ card }: { card: Card }) {
  const navigate = useNavigate();
  const { isCtx, playing } = useContextPlaying(card.id);
  const [busy, setBusy] = useState(false);
  const round = card.type === 'artist';
  return (
    <div
      role="link"
      tabIndex={0}
      onClick={() => navigate(cardPath(card))}
      onKeyDown={(e) => e.key === 'Enter' && navigate(cardPath(card))}
      className="group cursor-pointer rounded-lg p-3 transition-colors hover:bg-surface-2"
    >
      <div className="relative mb-3">
        <Cover src={card.thumb} size={300} round={round} className="aspect-square w-full shadow-[0_8px_24px_rgb(0_0_0/0.35)]" />
        <PlayFab
          size={48}
          playing={playing}
          className={cx(
            'absolute bottom-2 right-2 transition-all duration-200',
            playing ? 'translate-y-0 opacity-100' : 'translate-y-2 opacity-0 group-hover:translate-y-0 group-hover:opacity-100',
            busy && 'animate-pulse',
          )}
          onClick={async () => {
            if (isCtx) return controls.toggle();
            setBusy(true);
            await playCard(card);
            setBusy(false);
          }}
        />
      </div>
      <div className="truncate font-semibold">{card.title}</div>
      <div className="mt-1 line-clamp-2 text-sm text-fg-2">{card.subtitle || (round ? 'Artist' : '')}</div>
    </div>
  );
}

export function TrackCard({ track, list, index, context }: { track: Track; list: Track[]; index: number; context: PlayContext }) {
  const isCurrent = usePlayer((s) => s.current?.track.id === track.id);
  const playing = usePlayback((s) => s.playing) && isCurrent;
  return (
    <div
      role="button"
      tabIndex={0}
      draggable
      onDragStart={(e) => dragTracks(e, [track])}
      onClick={() => (isCurrent ? controls.toggle() : play(list, index, context))}
      onKeyDown={(e) => e.key === 'Enter' && play(list, index, context)}
      onContextMenu={(e) => openTrackMenu(e, track)}
      className="group cursor-pointer rounded-lg p-3 transition-colors hover:bg-surface-2"
    >
      <div className="relative mb-3">
        <Cover src={track.thumb} size={300} className="aspect-square w-full shadow-[0_8px_24px_rgb(0_0_0/0.35)]" />
        <PlayFab
          size={48}
          playing={playing}
          className={cx(
            'absolute bottom-2 right-2 transition-all duration-200',
            playing ? 'translate-y-0 opacity-100' : 'translate-y-2 opacity-0 group-hover:translate-y-0 group-hover:opacity-100',
          )}
          onClick={() => (isCurrent ? controls.toggle() : play(list, index, context))}
        />
      </div>
      <div className={cx('truncate font-semibold', isCurrent && 'text-accent')}>{track.title}</div>
      <div className="mt-1 truncate text-sm text-fg-2">{artistsText(track)}</div>
    </div>
  );
}

/** Horizontal shelf with paging arrows, like Spotify's home rows. */
export function Shelf({ title, to, children, sub }: { title: string; to?: string; sub?: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const page = (dir: 1 | -1) => ref.current?.scrollBy({ left: dir * ref.current.clientWidth * 0.8, behavior: 'smooth' });
  return (
    <section className="group/shelf mb-8">
      <div className="mb-1 flex items-end justify-between gap-4 px-3">
        <div>
          {sub && <div className="text-xs font-medium text-fg-2">{sub}</div>}
          <h2 className="text-2xl font-bold tracking-tight">{to ? <Link to={to} className="hover:underline">{title}</Link> : title}</h2>
        </div>
        <div className="flex items-center gap-2 opacity-0 transition group-hover/shelf:opacity-100">
          <button type="button" aria-label="Scroll back" onClick={() => page(-1)} className="grid h-8 w-8 place-items-center rounded-full bg-surface-2 hover:bg-surface-3">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button type="button" aria-label="Scroll forward" onClick={() => page(1)} className="grid h-8 w-8 place-items-center rounded-full bg-surface-2 hover:bg-surface-3">
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>
      <div ref={ref} className="no-scrollbar grid snap-x auto-cols-[minmax(170px,200px)] grid-flow-col overflow-x-auto scroll-smooth [&>*]:snap-start">
        {children}
      </div>
    </section>
  );
}
