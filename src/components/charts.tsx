// Hand-rolled SVG/CSS charts. One series colour (the theme accent),
// hairline solid grid, 2px lines, <=24px bars with 4px rounded data-ends,
// a crosshair on the time chart and per-mark tooltips everywhere else.

import { useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { cx } from './ui';

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [w, setW] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setW(el.clientWidth);
    const ro = new ResizeObserver(([e]) => setW(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

function niceStep(max: number, count: number) {
  const raw = max / count;
  const mag = 10 ** Math.floor(Math.log10(raw || 1));
  const n = raw / mag;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * mag;
}

function monotonePath(pts: [number, number][]): string {
  const n = pts.length;
  if (!n) return '';
  if (n === 1) return `M${pts[0][0]},${pts[0][1]}`;
  const m: number[] = [];
  const dx: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    dx[i] = pts[i + 1][0] - pts[i][0];
    m[i] = (pts[i + 1][1] - pts[i][1]) / (dx[i] || 1);
  }
  const t: number[] = [m[0]];
  for (let i = 1; i < n - 1; i++) t[i] = m[i - 1] * m[i] <= 0 ? 0 : (m[i - 1] + m[i]) / 2;
  t[n - 1] = m[n - 2];
  for (let i = 0; i < n - 1; i++) {
    if (m[i] === 0) {
      t[i] = 0;
      t[i + 1] = 0;
      continue;
    }
    const a = t[i] / m[i];
    const b = t[i + 1] / m[i];
    const s = a * a + b * b;
    if (s > 9) {
      const k = 3 / Math.sqrt(s);
      t[i] = k * a * m[i];
      t[i + 1] = k * b * m[i];
    }
  }
  let d = `M${pts[0][0]},${pts[0][1]}`;
  for (let i = 0; i < n - 1; i++) {
    const [x0, y0] = pts[i];
    const [x1, y1] = pts[i + 1];
    const h = dx[i] / 3;
    d += `C${x0 + h},${y0 + t[i] * h},${x1 - h},${y1 - t[i + 1] * h},${x1},${y1}`;
  }
  return d;
}

export function Tip({ x, y, children, below }: { x: number; y: number; children: ReactNode; below?: boolean }) {
  return (
    <div
      role="tooltip"
      className="pointer-events-none absolute z-20 whitespace-nowrap rounded-md bg-surface-3 px-2.5 py-1.5 text-xs shadow-xl ring-1 ring-line"
      style={{ left: x, top: y, transform: `translate(-50%, ${below ? '12px' : 'calc(-100% - 10px)'})` }}
    >
      {children}
    </div>
  );
}

// ---------- area over time ----------

export function AreaChart({
  data,
  height = 240,
  format,
  label,
  tick,
  stepFor,
}: {
  data: { ts: number; v: number }[];
  height?: number;
  format: (v: number) => string;
  label: (ts: number) => string;
  tick: (ts: number) => string;
  /** pick a tick step for the data maximum (defaults to 1-2-2.5-5 nicing) */
  stepFor?: (max: number) => number;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hi, setHi] = useState<number | null>(null);
  const pad = { l: 44, r: 12, t: 14, b: 28 };
  const iw = Math.max(10, width - pad.l - pad.r);
  const ih = height - pad.t - pad.b;
  const max = Math.max(1, ...data.map((d) => d.v));
  const step = stepFor ? stepFor(max) : niceStep(max, 4);
  const yMax = Math.ceil(max / step) * step;
  const ticks = Array.from({ length: Math.round(yMax / step) + 1 }, (_, i) => i * step);
  const x = (i: number) => pad.l + (data.length <= 1 ? iw / 2 : (i / (data.length - 1)) * iw);
  const y = (v: number) => pad.t + ih - (v / yMax) * ih;
  const pts = data.map((d, i) => [x(i), y(d.v)] as [number, number]);
  const line = monotonePath(pts);
  const area = pts.length ? `${line}L${x(data.length - 1)},${pad.t + ih}L${x(0)},${pad.t + ih}Z` : '';
  const xTicks = useMemo(() => {
    const count = Math.min(data.length, Math.max(2, Math.floor(iw / 90)));
    return Array.from({ length: count }, (_, i) => Math.round((i / Math.max(1, count - 1)) * (data.length - 1)));
  }, [data.length, iw]);
  const gid = useMemo(() => `g${Math.random().toString(36).slice(2, 8)}`, []);

  const pick = (clientX: number, rect: DOMRect) => {
    const px = clientX - rect.left - pad.l;
    const i = data.length <= 1 ? 0 : Math.round((px / iw) * (data.length - 1));
    setHi(Math.max(0, Math.min(data.length - 1, i)));
  };

  return (
    <div ref={ref} className="relative w-full" style={{ height }}>
      {width > 0 && (
        <svg
          width={width}
          height={height}
          tabIndex={0}
          role="img"
          aria-label="Listening time over time"
          className="outline-none"
          onPointerMove={(e) => pick(e.clientX, e.currentTarget.getBoundingClientRect())}
          onPointerLeave={() => setHi(null)}
          onFocus={() => setHi(data.length - 1)}
          onBlur={() => setHi(null)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowLeft') setHi((h) => Math.max(0, (h ?? data.length) - 1));
            if (e.key === 'ArrowRight') setHi((h) => Math.min(data.length - 1, (h ?? -1) + 1));
          }}
        >
          <defs>
            <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="var(--accent)" stopOpacity="0.22" />
              <stop offset="1" stopColor="var(--accent)" stopOpacity="0" />
            </linearGradient>
          </defs>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={pad.l} x2={pad.l + iw} y1={y(t)} y2={y(t)} stroke="var(--line)" strokeWidth={1} />
              <text x={pad.l - 8} y={y(t)} dy="0.32em" textAnchor="end" className="fill-fg-3 text-[11px] tabular-nums">
                {format(t)}
              </text>
            </g>
          ))}
          {xTicks.map((i) => (
            <text key={i} x={x(i)} y={height - 8} textAnchor={i === 0 ? 'start' : i === data.length - 1 ? 'end' : 'middle'} className="fill-fg-3 text-[11px]">
              {tick(data[i].ts)}
            </text>
          ))}
          <path d={area} fill={`url(#${gid})`} />
          <path d={line} fill="none" stroke="var(--accent)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          {hi !== null && data[hi] && (
            <g>
              <line x1={x(hi)} x2={x(hi)} y1={pad.t} y2={pad.t + ih} stroke="var(--text-3)" strokeWidth={1} />
              <circle cx={x(hi)} cy={y(data[hi].v)} r={5} fill="var(--accent)" stroke="var(--surface)" strokeWidth={2} />
            </g>
          )}
        </svg>
      )}
      {hi !== null && data[hi] && (
        <Tip x={Math.min(Math.max(x(hi), 70), width - 70)} y={y(data[hi].v)}>
          <div className="text-sm font-bold text-fg">{format(data[hi].v)}</div>
          <div className="text-fg-2">{label(data[hi].ts)}</div>
        </Tip>
      )}
    </div>
  );
}

// ---------- columns ----------

export function Columns({
  values,
  labels,
  tickEvery = 1,
  format,
  tipLabel,
  height = 170,
  emphasise = 'max',
}: {
  values: number[];
  labels: string[];
  tickEvery?: number;
  format: (v: number) => string;
  tipLabel: (i: number) => string;
  height?: number;
  emphasise?: 'max' | 'none';
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hi, setHi] = useState<number | null>(null);
  const pad = { t: 22, b: 22 };
  const ih = height - pad.t - pad.b;
  const max = Math.max(1, ...values);
  const band = width / values.length;
  const bw = Math.min(24, band - 2);
  const peak = values.indexOf(Math.max(...values));
  const barPath = (i: number) => {
    const h = Math.max(values[i] > 0 ? 2 : 0, (values[i] / max) * ih);
    const x0 = i * band + (band - bw) / 2;
    const y0 = pad.t + ih - h;
    const r = Math.min(4, h, bw / 2);
    return `M${x0},${pad.t + ih}V${y0 + r}Q${x0},${y0} ${x0 + r},${y0}H${x0 + bw - r}Q${x0 + bw},${y0} ${x0 + bw},${y0 + r}V${pad.t + ih}Z`;
  };
  return (
    <div ref={ref} className="relative w-full" style={{ height }}>
      {width > 0 && (
        <svg width={width} height={height} role="img" aria-label="Distribution" onPointerLeave={() => setHi(null)}>
          <line x1={0} x2={width} y1={pad.t + ih + 0.5} y2={pad.t + ih + 0.5} stroke="var(--line)" />
          {values.map((v, i) => {
            const strong = emphasise === 'none' || i === peak;
            return (
              <g key={i}>
                <path
                  d={barPath(i)}
                  fill={strong ? 'var(--accent)' : 'color-mix(in oklab, var(--text) 26%, transparent)'}
                  opacity={hi === null || hi === i ? 1 : 0.55}
                  className="transition-opacity"
                />
                {/* the whole band is the hit target, not just the painted bar */}
                <rect
                  x={i * band}
                  y={0}
                  width={band}
                  height={height}
                  fill="transparent"
                  tabIndex={0}
                  aria-label={`${tipLabel(i)}: ${format(v)}`}
                  onPointerEnter={() => setHi(i)}
                  onFocus={() => setHi(i)}
                  onBlur={() => setHi(null)}
                  className="outline-none"
                />
                {i % tickEvery === 0 && (
                  <text x={i * band + band / 2} y={height - 6} textAnchor="middle" className="pointer-events-none fill-fg-3 text-[11px]">
                    {labels[i]}
                  </text>
                )}
                {emphasise === 'max' && i === peak && v > 0 && hi === null && (
                  <text
                    x={i * band + band / 2}
                    y={pad.t + ih - (v / max) * ih - 6}
                    // keep the label inside the plot at either edge
                    textAnchor={i * band < 40 ? 'start' : width - (i + 1) * band < 40 ? 'end' : 'middle'}
                    dx={i * band < 40 ? -bw / 2 : width - (i + 1) * band < 40 ? bw / 2 : 0}
                    className="pointer-events-none fill-fg text-[11px] font-semibold"
                  >
                    {format(v)}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      )}
      {hi !== null && (
        <Tip x={Math.min(Math.max(hi * band + band / 2, 60), width - 60)} y={pad.t + ih - (values[hi] / max) * ih}>
          <div className="text-sm font-bold text-fg">{format(values[hi])}</div>
          <div className="text-fg-2">{tipLabel(hi)}</div>
        </Tip>
      )}
    </div>
  );
}

// ---------- intensity cells ----------

export const LEVEL_FILL = [
  'color-mix(in oklab, var(--text) 7%, transparent)',
  'color-mix(in oklab, var(--accent) 28%, var(--surface))',
  'color-mix(in oklab, var(--accent) 52%, var(--surface))',
  'color-mix(in oklab, var(--accent) 76%, var(--surface))',
  'var(--accent)',
];

export function LevelLegend() {
  return (
    <div className="flex items-center gap-1.5 text-xs text-fg-3">
      Less
      {LEVEL_FILL.map((f, i) => (
        <span key={i} className="h-3 w-3 rounded-[3px]" style={{ background: f }} />
      ))}
      More
    </div>
  );
}

/** GitHub-style grid of square cells with clear gaps, sized to fit the card. */
export function HeatGrid({
  rows,
  rowLabels,
  colLabels,
  level,
  tip,
}: {
  rows: number[][];
  rowLabels: string[];
  colLabels: (string | null)[];
  level: (v: number) => number;
  tip: (r: number, c: number) => ReactNode;
}) {
  const [box, width] = useWidth<HTMLDivElement>();
  const [hi, setHi] = useState<{ r: number; c: number; x: number; y: number } | null>(null);
  const cols = rows[0]?.length ?? 0;
  const labelW = 36;
  const fit = (g: number) => Math.floor((width - labelW + g) / Math.max(1, cols)) - g;
  // 4px gaps, tightening only when the card is too narrow for that
  const gap = fit(4) >= 10 ? 4 : 2;
  const cell = Math.max(5, Math.min(26, fit(gap)));
  const show = (e: React.SyntheticEvent<HTMLElement>, r: number, c: number) => {
    const b = box.current!.getBoundingClientRect();
    const cr = e.currentTarget.getBoundingClientRect();
    setHi({ r, c, x: cr.left - b.left + cr.width / 2, y: cr.top - b.top });
  };
  return (
    <div ref={box} className="relative" onPointerLeave={() => setHi(null)}>
      {width > 0 && (
        <div className="grid w-max" style={{ gridTemplateColumns: `${labelW}px repeat(${cols}, ${cell}px)`, gap }}>
          {rows.map((row, r) => (
            <div key={r} className="contents">
              <div className="overflow-visible whitespace-nowrap pr-2 text-right text-[11px] text-fg-3" style={{ height: cell, lineHeight: `${cell}px` }}>
                {/* small cells: every other day, like GitHub */}
                {cell >= 12 || r % 2 === 0 ? rowLabels[r] : ''}
              </div>
              {row.map((v, c) => (
                <div
                  key={c}
                  tabIndex={0}
                  onPointerEnter={(e) => show(e, r, c)}
                  onFocus={(e) => show(e, r, c)}
                  onBlur={() => setHi(null)}
                  className={cx('outline-none transition-transform', hi?.r === r && hi?.c === c && 'scale-110 ring-2 ring-fg')}
                  style={{ width: cell, height: cell, borderRadius: Math.max(2, Math.round(cell * 0.2)), background: LEVEL_FILL[level(v)] }}
                />
              ))}
            </div>
          ))}
          <div />
          {colLabels.map((l, c) => (
            <div key={c} className="overflow-visible whitespace-nowrap pt-0.5 text-[11px] text-fg-3">
              {l ?? ''}
            </div>
          ))}
        </div>
      )}
      {hi && (
        <Tip x={Math.min(Math.max(hi.x, 80), width - 80)} y={hi.y}>
          {tip(hi.r, hi.c)}
        </Tip>
      )}
    </div>
  );
}

/** GitHub-style year calendar: columns are weeks, rows are weekdays. */
export function CalendarGrid({
  weeks,
  level,
  tip,
  monthLabel,
}: {
  weeks: { ts: number; ms: number; future: boolean }[][];
  level: (v: number) => number;
  tip: (d: { ts: number; ms: number }) => ReactNode;
  monthLabel: (ts: number) => string;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hi, setHi] = useState<{ d: { ts: number; ms: number }; x: number; y: number } | null>(null);
  const labelW = 28;
  const gap = 3;
  const cell = Math.max(6, Math.min(15, Math.floor((width - labelW) / weeks.length) - gap));
  const months = weeks.map((w, i) => {
    const m = new Date(w[0].ts).getMonth();
    const prev = i > 0 ? new Date(weeks[i - 1][0].ts).getMonth() : -1;
    return m !== prev && i < weeks.length - 2 ? monthLabel(w[0].ts) : null;
  });
  return (
    <div ref={ref} className="relative" onPointerLeave={() => setHi(null)}>
      {width > 0 && (
        <div className="flex">
          <div className="flex flex-col pt-[18px] text-[10px] text-fg-3" style={{ width: labelW, gap }}>
            {['Mon', '', 'Wed', '', 'Fri', '', ''].map((l, i) => (
              <div key={i} style={{ height: cell, lineHeight: `${cell}px` }}>
                {l}
              </div>
            ))}
          </div>
          <div className="flex" style={{ gap }}>
            {weeks.map((w, wi) => (
              <div key={wi} className="flex flex-col" style={{ gap }}>
                <div className="h-[15px] overflow-visible whitespace-nowrap text-[10px] text-fg-3" style={{ width: cell }}>
                  {months[wi]}
                </div>
                {w.map((d, di) => (
                  <div
                    key={di}
                    onPointerEnter={(e) => {
                      if (d.future) return;
                      const b = ref.current!.getBoundingClientRect();
                      const r = e.currentTarget.getBoundingClientRect();
                      setHi({ d, x: r.left - b.left + r.width / 2, y: r.top - b.top });
                    }}
                    className={cx('rounded-[3px]', d.future && 'opacity-0', hi?.d === d && 'ring-2 ring-fg')}
                    style={{ width: cell, height: cell, background: LEVEL_FILL[level(d.ms)] }}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>
      )}
      {hi && (
        <Tip x={Math.min(Math.max(hi.x, 80), width - 80)} y={hi.y}>
          {tip(hi.d)}
        </Tip>
      )}
    </div>
  );
}
