import { useEffect, useMemo, useRef, useState } from 'react';
import { Minus, MicVocal, Plus, RotateCcw } from 'lucide-react';
import type { LyricLine, Track } from '../../shared/types';
import { api, useQuery } from '../lib/api';
import { autoAlign, useLyricsSync } from '../lib/lyricsSync';
import { controls } from '../player/controls';
import { usePlayback, usePlayer } from '../store/player';
import { Spinner, cx } from './ui';

export function useLyrics(track: Track | undefined) {
  return useQuery(track ? `lyrics:${track.id}` : null, () => api.lyrics(track!), Infinity);
}

/**
 * Lyrics with timestamps moved onto the upload that is playing: lined up by
 * ear when the lyrics were timed for another cut, or nudged by hand.
 */
export function useTimedLyrics(track: Track | undefined) {
  const q = useLyrics(track);
  const id = track?.id;
  const isCurrent = usePlayer((s) => !!id && s.current?.track.id === id);
  const sync = useLyricsSync((s) => (id ? s.byTrack[id] : undefined));
  const [aligning, setAligning] = useState(false);
  const [alignFailed, setAlignFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const data = q.data;
  const needsAlign = !!(data?.synced?.length && data.reference && id && data.reference.id !== id);

  useEffect(() => {
    setAlignFailed(false);
    // only the song that is playing: lining up means fetching both recordings
    if (!id || !data || !needsAlign || sync || !isCurrent) return;
    let live = true;
    setAligning(true);
    void autoAlign(id, data).then((lag) => {
      if (!live) return;
      setAligning(false);
      setAlignFailed(lag === null);
    });
    return () => {
      live = false;
      setAligning(false);
    };
  }, [id, data, needsAlign, sync, isCurrent, attempt]);

  const offset = sync?.offset ?? 0;
  const lines = useMemo<LyricLine[] | undefined>(() => (offset ? data?.synced?.map((l) => ({ ...l, t: l.t + offset })) : data?.synced), [data, offset]);
  // timed for a cut of different length and nobody has lined it up yet
  const mayDrift = needsAlign && !sync && !aligning;
  return { ...q, lines, offset, sync, aligning, alignFailed, mayDrift, needsAlign, retryAlign: () => setAttempt((n) => n + 1) };
}

function activeIndex(lines: LyricLine[] | undefined, position: number) {
  if (!lines?.length) return -1;
  let lo = 0;
  let hi = lines.length - 1;
  let ans = -1;
  const p = position + 0.3;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (lines[mid].t <= p) {
      ans = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return ans;
}

export function LyricsView({ track, variant }: { track: Track; variant: 'panel' | 'full' }) {
  const timed = useTimedLyrics(track);
  const { data, loading, lines } = timed;
  const isCurrent = usePlayer((s) => s.current?.track.id === track.id);
  const position = usePlayback((s) => (isCurrent ? s.position : 0));
  const box = useRef<HTMLDivElement>(null);
  const userScrolledAt = useRef(0);

  const active = useMemo(() => activeIndex(lines, position), [lines, position]);

  useEffect(() => {
    if (active < 0 || !box.current || Date.now() - userScrolledAt.current < 3500) return;
    const el = box.current.querySelector<HTMLElement>(`[data-line="${active}"]`);
    if (!el) return;
    const parent = box.current;
    const target = el.offsetTop - parent.clientHeight * (variant === 'full' ? 0.38 : 0.32);
    parent.scrollTo({ top: target, behavior: 'smooth' });
  }, [active, variant]);

  const big = variant === 'full';

  if (loading) {
    return (
      <div className="grid h-full place-items-center">
        <Spinner />
      </div>
    );
  }

  if (!data || (!data.synced?.length && !data.plain)) {
    return (
      <div className="grid h-full place-items-center px-6 text-center">
        <div>
          <MicVocal className="mx-auto mb-3 h-10 w-10 text-fg-3" />
          <div className={cx('font-bold', big ? 'text-3xl' : 'text-lg')}>No lyrics found</div>
          <p className="mt-2 text-sm text-fg-2">We couldn't find lyrics for this song. Maybe it's an instrumental.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative h-full">
      <div
        ref={box}
        onWheel={() => (userScrolledAt.current = Date.now())}
        onTouchMove={() => (userScrolledAt.current = Date.now())}
        className={cx('scroll-area relative h-full', big ? 'px-2 py-[30vh]' : 'px-1 py-6')}
        style={{ maskImage: 'linear-gradient(transparent, #000 12%, #000 85%, transparent)' }}
      >
        {lines?.length ? (
          lines.map((l, i) => {
            const state = i === active ? 'now' : i < active ? 'past' : 'next';
            return (
              <button
                key={i}
                type="button"
                data-line={i}
                onClick={() => isCurrent && controls.seek(Math.max(0, l.t))}
                className={cx(
                  'lyric-line block w-full text-left font-extrabold tracking-tight',
                  big ? 'py-2 text-4xl leading-tight' : 'py-1.5 text-2xl leading-snug',
                  state === 'now' && 'text-fg',
                  state === 'past' && 'text-fg/45 hover:text-fg/80',
                  state === 'next' && 'text-fg/25 hover:text-fg/60',
                  big && state !== 'now' && 'blur-[0.6px]',
                )}
              >
                {l.text || '♪'}
              </button>
            );
          })
        ) : (
          <p className={cx('whitespace-pre-line font-bold', big ? 'text-3xl leading-snug' : 'text-xl leading-relaxed')}>{data.plain}</p>
        )}
        <p className="mt-10 text-xs text-fg-3">Lyrics provided by {data.source}</p>
      </div>
      {lines?.length ? <SyncControl track={track} timed={timed} /> : null}
    </div>
  );
}

/** Small timing control: shows when lyrics were lined up automatically and lets you nudge them. */
function SyncControl({ track, timed }: { track: Track; timed: ReturnType<typeof useTimedLyrics> }) {
  const { offset, sync, aligning, alignFailed, mayDrift } = timed;
  const nudge = (d: number) => useLyricsSync.getState().set(track.id, { offset: Math.round((offset + d) * 10) / 10, auto: false });
  const [label, tip] = aligning
    ? ['Syncing…', 'Listening to this version to line the lyrics up']
    : sync?.auto
      ? ['Auto-synced', 'Lined up by ear with this version of the song']
      : sync
        ? ['Adjusted', 'Timing nudged by hand']
        : alignFailed || mayDrift
          ? ['May be off', 'These lyrics were timed for another version of the song. Nudge them with − and +']
          : ['Timing', 'Show lyrics earlier or later'];
  const loud = aligning || alignFailed || mayDrift;
  return (
    <div
      data-tip={tip}
      className={cx(
        'group/sync absolute bottom-2 right-2 flex items-center gap-1 rounded-full bg-surface-3/85 py-1 pl-3 pr-1 text-xs shadow-lg ring-1 ring-line backdrop-blur transition-opacity',
        loud ? 'opacity-100' : 'opacity-40 hover:opacity-100 focus-within:opacity-100',
      )}
    >
      {aligning && <Spinner className="mr-1 h-3 w-3 border" />}
      <span className="mr-1 whitespace-nowrap font-semibold text-fg-2">{label}</span>
      <span className="w-12 text-center font-bold tabular-nums">{`${offset > 0 ? '+' : ''}${offset.toFixed(1)} s`}</span>
      <button type="button" aria-label="Lyrics earlier" data-tip="Show lyrics earlier" onClick={() => nudge(-0.5)} className="grid h-6 w-6 place-items-center rounded-full hover:bg-surface-2">
        <Minus className="h-3.5 w-3.5" />
      </button>
      <button type="button" aria-label="Lyrics later" data-tip="Show lyrics later" onClick={() => nudge(0.5)} className="grid h-6 w-6 place-items-center rounded-full hover:bg-surface-2">
        <Plus className="h-3.5 w-3.5" />
      </button>
      {!sync && !aligning && timed.needsAlign && (
        <button
          type="button"
          aria-label="Line up again"
          data-tip="Try lining the lyrics up with this version again"
          onClick={timed.retryAlign}
          className="grid h-6 w-6 place-items-center rounded-full hover:bg-surface-2"
        >
          <RotateCcw className="h-3.5 w-3.5" />
        </button>
      )}
      {sync && (
        <button
          type="button"
          aria-label="Reset lyrics timing"
          data-tip={timed.needsAlign ? 'Reset and line up again' : 'Reset timing'}
          onClick={() => useLyricsSync.getState().clear(track.id)}
          className="grid h-6 w-6 place-items-center rounded-full hover:bg-surface-2"
        >
          <RotateCcw className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

/** A few lines that follow the song, for the Now playing panel. */
export function LyricsPreview({ track, onOpen }: { track: Track; onOpen: () => void }) {
  const { data, lines } = useTimedLyrics(track);
  const isCurrent = usePlayer((s) => s.current?.track.id === track.id);
  const position = usePlayback((s) => (isCurrent ? s.position : 0));
  const active = useMemo(() => activeIndex(lines, position), [lines, position]);
  const shown = useMemo(() => {
    if (lines?.length) {
      const sung = lines.filter((l) => l.text);
      const at = Math.max(0, sung.findIndex((l) => l.t > position + 0.3) - 1);
      return sung.slice(at, at + 4).map((l, i) => ({ text: l.text, now: active >= 0 && i === 0 && l.t <= position + 0.3 }));
    }
    return data?.plain
      ?.split('\n')
      .filter(Boolean)
      .slice(0, 4)
      .map((text) => ({ text, now: false }));
  }, [lines, data, position, active]);
  if (!shown?.length) return null;
  return (
    <button
      type="button"
      onClick={onOpen}
      className="mt-5 block w-full overflow-hidden rounded-xl bg-[color-mix(in_oklab,var(--cover-deep)_80%,transparent)] p-4 text-left transition hover:brightness-110"
    >
      <div className="mb-2 text-sm font-bold">Lyrics</div>
      <div className="space-y-1 text-lg font-bold leading-snug">
        {shown.map((l, i) => (
          <p key={`${i}-${l.text}`} className={cx('truncate transition-colors', l.now ? 'text-fg' : 'text-fg/55')}>
            {l.text}
          </p>
        ))}
      </div>
    </button>
  );
}
