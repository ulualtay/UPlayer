import { Reorder, useDragControls } from 'motion/react';
import { GripVertical, Play, Radio, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import { upcoming, usePlayback, usePlayer, type QItem } from '../store/player';
import { useHistory } from '../store/history';
import { useLibrary } from '../store/library';
import { controls } from '../player/controls';
import { artistsText, fmtTime, relTime } from '../lib/format';
import { droppedTracks, openTrackMenu, play } from '../lib/actions';
import { Cover, Equalizer, Spinner, cx } from './ui';

function QRow({ item, onPlay, onRemove, current, dragHandle, meta }: { item: QItem; onPlay: () => void; onRemove?: () => void; current?: boolean; dragHandle?: React.ReactNode; meta?: string }) {
  const playing = usePlayback((s) => s.playing) && !!current;
  const t = item.track;
  return (
    <div
      tabIndex={0}
      onDoubleClick={onPlay}
      onKeyDown={(e) => {
        if (e.key === 'Enter') onPlay();
        if ((e.key === 'Delete' || e.key === 'Backspace') && onRemove) onRemove();
      }}
      onContextMenu={(e) => openTrackMenu(e, t, { removeFromQueue: onRemove })}
      className="group flex items-center gap-3 rounded-md p-2 outline-none hover:bg-surface-2 focus-visible:bg-surface-2"
    >
      {dragHandle}
      <div className="relative">
        <Cover src={t.thumb} size={80} className="h-10 w-10" />
        <button
          type="button"
          aria-label={`Play ${t.title}`}
          onClick={current ? () => controls.toggle() : onPlay}
          className="absolute inset-0 grid place-items-center rounded-md bg-black/50 text-white opacity-0 transition group-hover:opacity-100"
        >
          <Play className="h-4 w-4" fill="currentColor" strokeWidth={0} />
        </button>
      </div>
      <div className="min-w-0 flex-1">
        <div className={cx('flex items-center gap-2 truncate', current && 'text-accent')}>
          {playing && <Equalizer />}
          <span className="truncate">{t.title}</span>
        </div>
        <div className="truncate text-sm text-fg-2">{meta ?? artistsText(t)}</div>
      </div>
      <span className="text-sm tabular-nums text-fg-2 group-hover:hidden">{t.duration ? fmtTime(t.duration) : ''}</span>
      {onRemove && (
        <button
          type="button"
          aria-label="Remove from queue"
          data-tip="Remove from queue"
          onClick={onRemove}
          className="hidden h-7 w-7 place-items-center rounded-full text-fg-2 hover:bg-surface-3 hover:text-fg group-hover:grid"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}

function ManualRow({ item }: { item: QItem }) {
  const drag = useDragControls();
  const { jumpTo, removeUpcoming } = usePlayer.getState();
  return (
    <Reorder.Item value={item} dragListener={false} dragControls={drag} className="list-none">
      <QRow
        item={item}
        onPlay={() => jumpTo(item.uid)}
        onRemove={() => removeUpcoming(item.uid)}
        dragHandle={
          <span
            onPointerDown={(e) => drag.start(e)}
            className="-ml-1 cursor-grab touch-none text-fg-3 opacity-0 transition group-hover:opacity-100 active:cursor-grabbing"
            aria-label="Drag to reorder"
          >
            <GripVertical className="h-4 w-4" />
          </span>
        }
      />
    </Reorder.Item>
  );
}

export function QueueView({ full }: { full?: boolean }) {
  const s = usePlayer();
  const radioLoading = usePlayer((x) => x.radioLoading);
  const { manual, context } = upcoming(s);
  const ctxItems = context.filter((i) => !i.radio);
  const radioItems = context.filter((i) => i.radio);
  const events = useHistory((h) => h.events);
  const tracks = useLibrary((l) => l.tracks);
  const limit = full ? 500 : 40;

  const recent = full
    ? events
        .slice(-30)
        .reverse()
        .map((e) => ({ e, t: tracks[e.t] }))
        .filter((x) => !!x.t)
    : [];

  if (!s.current) {
    return (
      <div className="p-6 text-center text-fg-2">
        <p className="font-bold text-fg">Your queue is empty</p>
        <p className="mt-1 text-sm">Play a song and what's coming up will show here.</p>
      </div>
    );
  }

  const heading = (text: React.ReactNode, action?: React.ReactNode) => (
    <div className="mb-1 mt-5 flex items-center justify-between px-2">
      <h3 className="font-bold">{text}</h3>
      {action}
    </div>
  );

  return (
    <div
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        const t = droppedTracks(e);
        if (t) s.addToQueue(t);
      }}
    >
      {full && recent.length > 0 && (
        <details className="mb-2 rounded-lg px-2">
          <summary className="cursor-pointer select-none py-2 text-sm font-semibold text-fg-2 hover:text-fg">Recently played ({recent.length})</summary>
          {recent.map(({ e, t }, i) => (
            <QRow
              key={`${e.s}-${i}`}
              item={{ uid: `h${i}`, track: t! }}
              meta={`${artistsText(t!)} • ${relTime(e.s)}`}
              onPlay={() => play([t!], 0, { type: 'history', name: 'History' })}
            />
          ))}
        </details>
      )}

      {heading('Now playing')}
      <QRow item={s.current} current onPlay={() => controls.play()} />

      {manual.length > 0 && (
        <>
          {heading(
            'Next in queue',
            <button onClick={() => s.setManual([])} className="text-sm font-semibold text-fg-2 hover:text-fg hover:underline">
              Clear queue
            </button>,
          )}
          <Reorder.Group axis="y" values={manual} onReorder={(v) => s.setManual(v)} className="m-0 p-0">
            {manual.map((m) => (
              <ManualRow key={m.uid} item={m} />
            ))}
          </Reorder.Group>
        </>
      )}

      {ctxItems.length > 0 && (
        <>
          {heading(
            <span>
              Next from:{' '}
              {s.context?.path ? (
                <Link to={s.context.path} className="hover:underline">
                  {s.context.name}
                </Link>
              ) : (
                s.context?.name
              )}
            </span>,
          )}
          {ctxItems.slice(0, limit).map((it) => (
            <QRow key={it.uid} item={it} onPlay={() => s.jumpTo(it.uid)} onRemove={() => s.removeUpcoming(it.uid)} />
          ))}
          {ctxItems.length > limit && (
            <Link to="/queue" className="block px-2 py-2 text-sm font-semibold text-fg-2 hover:text-fg hover:underline">
              +{ctxItems.length - limit} more — open the full queue
            </Link>
          )}
        </>
      )}

      {(radioItems.length > 0 || radioLoading) && (
        <>
          {heading(
            <span className="flex items-center gap-2">
              <Radio className="h-4 w-4 text-accent" /> Autoplay
            </span>,
          )}
          <p className="-mt-1 mb-1 px-2 text-xs text-fg-2">When your queue ends, similar songs keep playing.</p>
          {radioLoading && !radioItems.length && (
            <div className="grid place-items-center py-4">
              <Spinner />
            </div>
          )}
          {radioItems.slice(0, limit).map((it) => (
            <QRow key={it.uid} item={it} onPlay={() => s.jumpTo(it.uid)} onRemove={() => s.removeUpcoming(it.uid)} />
          ))}
        </>
      )}
    </div>
  );
}
