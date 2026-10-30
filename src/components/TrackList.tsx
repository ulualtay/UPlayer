import { Fragment, memo, useState } from 'react';
import { Link } from 'react-router-dom';
import { CircleCheck, CirclePlus, Clock3, Ellipsis, Play } from 'lucide-react';
import type { ArtistRef, Track } from '../../shared/types';
import { usePlayback, usePlayer, type PlayContext } from '../store/player';
import { useLibrary } from '../store/library';
import { controls } from '../player/controls';
import { dragTracks, openTrackMenu, play, toggleLike } from '../lib/actions';
import { fmtDate, fmtTime, relTime } from '../lib/format';
import { Cover, Equalizer, cx } from './ui';
import { DownloadButton } from './DownloadButton';

const CheckIcon = () => (
  <svg viewBox="0 0 12 12" className="h-3 w-3" aria-hidden>
    <path d="M2.5 6.2 5 8.6l4.6-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export function ArtistLinks({ artists, className }: { artists: ArtistRef[]; className?: string }) {
  return (
    <span className={className}>
      {artists.map((a, i) => (
        <Fragment key={`${a.name}-${i}`}>
          {i > 0 && ', '}
          {a.id ? (
            <Link to={`/artist/${a.id}`} className="hover:text-fg hover:underline" onClick={(e) => e.stopPropagation()}>
              {a.name}
            </Link>
          ) : (
            a.name
          )}
        </Fragment>
      ))}
    </span>
  );
}

interface ListProps {
  tracks: Track[];
  context: PlayContext;
  showAlbum?: boolean;
  showCover?: boolean;
  /** epoch ms per row, shown as "Date added" */
  addedAt?: number[];
  numbered?: boolean;
  onRemove?: (index: number) => void;
  compact?: boolean;
  /** extra trailing info per row (e.g. play counts on stats) */
  aside?: (t: Track, i: number) => React.ReactNode;
  /** multi-select mode: checked song ids, toggled through `onToggle` */
  checked?: Set<string>;
  onToggle?: (id: string, index: number, range: boolean) => void;
}

export function TrackList({ tracks, context, showAlbum = true, showCover = true, addedAt, numbered = true, onRemove, compact, aside, checked, onToggle }: ListProps) {
  const [selected, setSelected] = useState<number | null>(null);
  const cols = cx(
    'grid items-center gap-4 px-4',
    showAlbum && addedAt
      ? 'grid-cols-[24px_minmax(0,4fr)_minmax(0,2fr)_minmax(0,1.4fr)_152px]'
      : showAlbum
        ? 'grid-cols-[24px_minmax(0,4fr)_minmax(0,2.4fr)_152px]'
        : addedAt
          ? 'grid-cols-[24px_minmax(0,4fr)_minmax(0,1.4fr)_152px]'
          : 'grid-cols-[24px_minmax(0,1fr)_152px]',
  );
  return (
    <div role="grid" aria-rowcount={tracks.length} className="select-none">
      {!compact && (
        <div className={cx(cols, 'mb-2 h-9 border-b border-line text-xs font-medium text-fg-2')}>
          <span className="text-center">#</span>
          <span>Title</span>
          {showAlbum && <span>Album</span>}
          {addedAt && <span>Date added</span>}
          <span className="flex justify-end pr-8">
            <Clock3 className="h-4 w-4" aria-label="Duration" />
          </span>
        </div>
      )}
      {tracks.map((t, i) => (
        <TrackRow
          key={`${t.id}-${i}`}
          track={t}
          index={i}
          cols={cols}
          showAlbum={showAlbum}
          showCover={showCover}
          added={addedAt?.[i]}
          showAdded={!!addedAt}
          numbered={numbered}
          selected={checked ? checked.has(t.id) : selected === i}
          onSelect={(e) => (onToggle ? onToggle(t.id, i, e.shiftKey) : setSelected(i))}
          checkable={!!onToggle}
          onPlay={() => play(tracks, i, context)}
          onRemove={onRemove ? () => onRemove(i) : undefined}
          aside={aside?.(t, i)}
        />
      ))}
    </div>
  );
}

interface RowProps {
  track: Track;
  index: number;
  cols: string;
  showAlbum: boolean;
  showCover: boolean;
  showAdded: boolean;
  added?: number;
  numbered: boolean;
  selected: boolean;
  onSelect: (e: React.MouseEvent) => void;
  checkable?: boolean;
  onPlay: () => void;
  onRemove?: () => void;
  aside?: React.ReactNode;
}

const TrackRow = memo(function TrackRow({ track: t, index, cols, showAlbum, showCover, showAdded, added, numbered, selected, onSelect, checkable, onPlay, onRemove, aside }: RowProps) {
  const isCurrent = usePlayer((s) => s.current?.track.id === t.id);
  const playing = usePlayback((s) => s.playing) && isCurrent;
  const liked = useLibrary((s) => s.liked.some((e) => e.id === t.id));

  return (
    <div
      role="row"
      tabIndex={0}
      draggable
      onDragStart={(e) => dragTracks(e, [t])}
      onClick={onSelect}
      onDoubleClick={onPlay}
      onKeyDown={(e) => {
        if (e.key === 'Enter') onPlay();
        if ((e.key === 'Delete' || e.key === 'Backspace') && onRemove) onRemove();
      }}
      onContextMenu={(e) => openTrackMenu(e, t, { removeFromPlaylist: onRemove })}
      className={cx(cols, 'group h-[var(--row-h)] rounded-md outline-none transition-colors', selected ? 'bg-surface-3' : 'hover:bg-surface-2 focus-visible:bg-surface-2')}
    >
      <div className="relative grid h-full place-items-center text-sm tabular-nums text-fg-2">
        {checkable ? (
          <span
            role="checkbox"
            aria-checked={selected}
            aria-label={`Select ${t.title}`}
            className={cx(
              'grid h-[18px] w-[18px] place-items-center rounded-[5px] border-2 transition',
              selected ? 'border-accent bg-accent text-accent-ink' : 'border-fg-3 group-hover:border-fg-2',
            )}
          >
            {selected && <CheckIcon />}
          </span>
        ) : (
          <>
        <span className={cx('group-hover:invisible', isCurrent && 'text-accent')}>{playing ? <Equalizer /> : numbered ? index + 1 : null}</span>
        <button
          type="button"
          aria-label={playing ? `Pause ${t.title}` : `Play ${t.title}`}
          onClick={(e) => {
            e.stopPropagation();
            if (isCurrent) controls.toggle();
            else onPlay();
          }}
          className="invisible absolute inset-0 grid place-items-center text-fg group-hover:visible"
        >
          {playing ? <span className="block h-3.5 w-3.5 border-x-[4px] border-fg" /> : <Play className="h-4 w-4" fill="currentColor" strokeWidth={0} />}
        </button>
          </>
        )}
      </div>

      <div className="flex min-w-0 items-center gap-3">
        {showCover && <Cover src={t.thumb} size={80} className="h-10 w-10" />}
        <div className="min-w-0">
          <div className={cx('truncate text-[15px]', isCurrent ? 'text-accent' : 'text-fg')}>{t.title}</div>
          <div className="truncate text-sm text-fg-2">
            {t.kind === 'video' && (
              <span className="mr-1.5 rounded-sm bg-fg-2 px-1 py-px align-[1px] text-[9px] font-bold uppercase leading-none tracking-wide text-bg">Video</span>
            )}
            <ArtistLinks artists={t.artists} />
          </div>
        </div>
      </div>

      {showAlbum && (
        <div className="truncate text-sm text-fg-2">
          {t.album?.id ? (
            <Link to={`/album/${t.album.id}`} className="hover:text-fg hover:underline" onClick={(e) => e.stopPropagation()}>
              {t.album.name}
            </Link>
          ) : (
            (t.album?.name ?? '')
          )}
        </div>
      )}
      {showAdded && <div className="truncate text-sm text-fg-2">{added ? (Date.now() - added < 7 * 86400000 ? relTime(added) : fmtDate(added)) : ''}</div>}

      <div className="flex items-center justify-end gap-1.5 text-sm tabular-nums text-fg-2">
        {aside}
        <DownloadButton track={t} size={16} />
        <button
          type="button"
          aria-label={liked ? 'Remove from Liked Songs' : 'Save to Liked Songs'}
          data-tip={liked ? 'Remove from Liked Songs' : 'Save to Liked Songs'}
          onClick={(e) => {
            e.stopPropagation();
            toggleLike(t);
          }}
          className={cx('grid h-6 w-6 place-items-center', liked ? 'text-accent' : 'invisible text-fg-2 hover:text-fg group-hover:visible')}
        >
          {liked ? <CircleCheck className="h-4 w-4" fill="currentColor" stroke="var(--surface)" /> : <CirclePlus className="h-4 w-4" />}
        </button>
        <span className="w-10 text-right">{t.duration ? fmtTime(t.duration) : '–'}</span>
        <button
          type="button"
          aria-label="More options"
          data-tip={`More options for ${t.title}`}
          onClick={(e) => openTrackMenu(e, t, { removeFromPlaylist: onRemove })}
          className="invisible grid h-6 w-6 place-items-center text-fg-2 hover:text-fg group-hover:visible"
        >
          <Ellipsis className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
});
