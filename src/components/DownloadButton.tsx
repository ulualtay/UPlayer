import { ArrowDown, CircleArrowDown, RotateCw, Square, Trash2 } from 'lucide-react';
import type { Track } from '../../shared/types';
import { count } from '../lib/format';
import { useDownloadState, useDownloads } from '../store/downloads';
import { useUI } from '../store/ui';
import { cx } from './ui';

/** Collection-level control: download every song, showing combined progress. */
export function DownloadAllButton({ tracks }: { tracks: Track[] }) {
  const entries = useDownloads((s) => s.entries);
  const jobs = useDownloads((s) => s.jobs);
  if (!tracks.length) return null;
  const done = tracks.filter((t) => entries[t.id]).length;
  const active = tracks.filter((t) => jobs[t.id] && jobs[t.id].status !== 'error');
  const all = done === tracks.length;
  const progress = (done + active.reduce((s, t) => s + (jobs[t.id]?.progress ?? 0), 0)) / tracks.length;
  const tip = all ? (tracks.length === 1 ? 'Downloaded' : `All ${tracks.length} songs downloaded`) : active.length ? `Downloading… ${done} of ${tracks.length}` : `Download ${count(tracks.length - done, 'song')}`;
  return (
    <button
      type="button"
      aria-label={tip}
      data-tip={tip}
      onClick={() => {
        if (active.length) active.forEach((t) => useDownloads.getState().cancel(t.id));
        else if (!all) useDownloads.getState().download(tracks);
      }}
      className={cx('relative grid h-10 w-10 place-items-center rounded-full transition', all ? 'text-accent' : 'text-fg-2 hover:scale-105 hover:text-fg')}
    >
      {active.length ? (
        <>
          <ProgressRing value={Math.max(0.04, progress)} size={32} stroke={3} />
          <ArrowDown className="absolute h-4 w-4" />
        </>
      ) : (
        <CircleArrowDown className="h-8 w-8" fill={all ? 'currentColor' : 'none'} stroke={all ? 'var(--bg)' : 'currentColor'} />
      )}
    </button>
  );
}

/** Ring that fills as a download progresses. */
export function ProgressRing({ value, size = 20, stroke = 2.5, className }: { value: number; size?: number; stroke?: number; className?: string }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className={cx('-rotate-90', className)} aria-hidden>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="color-mix(in oklab, var(--text) 22%, transparent)" strokeWidth={stroke} />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="var(--accent)"
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - value)}
        className="transition-[stroke-dashoffset] duration-300"
      />
    </svg>
  );
}

/**
 * Download control for one song: outline arrow → spinner/ring while
 * downloading (click to cancel) → filled accent arrow once saved
 * (click for "Remove download").
 */
export function DownloadButton({ track, size = 18, className, alwaysVisible }: { track: Track; size?: number; className?: string; alwaysVisible?: boolean }) {
  const { state, progress } = useDownloadState(track.id);
  const { download, cancel, remove } = useDownloads.getState();
  const openMenu = useUI((s) => s.openMenu);
  const tip =
    state === 'done'
      ? 'Downloaded'
      : state === 'downloading'
        ? `Downloading ${Math.round(progress * 100)}%: click to cancel`
        : state === 'queued'
          ? 'Waiting to download: click to cancel'
          : state === 'error'
            ? 'Download failed: click to retry'
            : 'Download';
  return (
    <button
      type="button"
      aria-label={tip}
      data-tip={tip}
      onClick={(e) => {
        e.stopPropagation();
        if (state === 'none' || state === 'error') download([track]);
        else if (state === 'queued' || state === 'downloading') cancel(track.id);
        else {
          const r = e.currentTarget.getBoundingClientRect();
          openMenu(r.left, r.bottom + 4, [{ label: 'Remove download', icon: Trash2, danger: true, onSelect: () => remove([track.id]) }]);
        }
      }}
      className={cx(
        'group/dl relative grid shrink-0 place-items-center rounded-full transition',
        state === 'done' ? 'text-accent' : state === 'error' ? 'text-red-400' : 'text-fg-2 hover:text-fg',
        state === 'none' && !alwaysVisible && 'invisible group-hover:visible',
        className,
      )}
      style={{ width: size + 8, height: size + 8 }}
    >
      {state === 'done' && <CircleArrowDown style={{ width: size, height: size }} fill="currentColor" stroke="var(--surface)" />}
      {state === 'none' && <CircleArrowDown style={{ width: size, height: size }} />}
      {state === 'error' && <RotateCw style={{ width: size - 2, height: size - 2 }} />}
      {state === 'queued' && <span className="animate-spin rounded-full border-2 border-fg-3 border-t-accent" style={{ width: size - 2, height: size - 2 }} />}
      {state === 'downloading' && (
        <>
          <ProgressRing value={Math.max(0.04, progress)} size={size + 2} />
          <span className="absolute inset-0 grid place-items-center">
            <ArrowDown className="group-hover/dl:hidden" style={{ width: size * 0.5, height: size * 0.5 }} />
            <Square className="hidden group-hover/dl:block" fill="currentColor" style={{ width: size * 0.36, height: size * 0.36 }} />
          </span>
        </>
      )}
    </button>
  );
}
