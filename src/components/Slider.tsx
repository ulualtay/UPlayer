import { useRef, useState } from 'react';
import { cx } from './ui';

interface Props {
  value: number;
  max: number;
  label: string;
  step?: number;
  /** live updates while dragging */
  onInput?: (v: number) => void;
  /** final value on release / key press */
  onCommit: (v: number) => void;
  /** human readable value for screen readers */
  valueText?: (v: number) => string;
  /** when set, a bubble shows the value under the pointer (e.g. the time you'd jump to) */
  hoverLabel?: (v: number) => string;
  className?: string;
}

export function Slider({ value, max, label, step = 1, onInput, onCommit, valueText, hoverLabel, className }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<number | null>(null);
  const [hover, setHover] = useState<{ x: number; v: number } | null>(null);
  const v = drag ?? value;
  const pct = max > 0 ? Math.min(100, Math.max(0, (v / max) * 100)) : 0;

  const at = (clientX: number) => {
    const r = ref.current!.getBoundingClientRect();
    const f = Math.min(1, Math.max(0, (clientX - r.left) / r.width));
    return { v: f * max, x: f * r.width };
  };

  return (
    <div
      ref={ref}
      role="slider"
      tabIndex={0}
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={Math.round(v)}
      aria-valuetext={valueText?.(v)}
      data-dragging={drag !== null}
      className={cx('slider', className)}
      style={{ '--pct': `${pct}%` } as React.CSSProperties}
      onPointerDown={(e) => {
        if (e.button !== 0 || !max) return;
        e.currentTarget.setPointerCapture(e.pointerId);
        const p = at(e.clientX);
        setDrag(p.v);
        onInput?.(p.v);
      }}
      onPointerMove={(e) => {
        if (!max) return;
        const p = at(e.clientX);
        if (hoverLabel) setHover(p);
        if (drag === null) return;
        setDrag(p.v);
        onInput?.(p.v);
      }}
      onPointerLeave={() => drag === null && setHover(null)}
      onPointerUp={(e) => {
        if (drag === null) return;
        e.currentTarget.releasePointerCapture(e.pointerId);
        onCommit(at(e.clientX).v);
        setDrag(null);
      }}
      onPointerCancel={() => {
        setDrag(null);
        setHover(null);
      }}
      onKeyDown={(e) => {
        const d = e.key === 'ArrowRight' || e.key === 'ArrowUp' ? step : e.key === 'ArrowLeft' || e.key === 'ArrowDown' ? -step : 0;
        if (!d) return;
        e.preventDefault();
        e.stopPropagation();
        onCommit(Math.min(max, Math.max(0, value + d)));
      }}
    >
      <div className="track">
        {hover && hoverLabel && drag === null && <div className="pointer-events-none absolute inset-y-0 left-0 rounded-full bg-fg/25" style={{ width: hover.x }} />}
        <div className="fill" />
      </div>
      <div className="thumb" />
      {hover && hoverLabel && (
        <div
          className="pointer-events-none absolute bottom-full z-20 mb-2 -translate-x-1/2 rounded-md bg-surface-3 px-2 py-1 text-xs font-semibold tabular-nums text-fg shadow-lg ring-1 ring-line"
          style={{ left: hover.x }}
        >
          {hoverLabel(drag ?? hover.v)}
        </div>
      )}
    </div>
  );
}
