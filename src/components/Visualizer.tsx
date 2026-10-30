import { useEffect, useRef } from 'react';
import { onFrame, type Frame } from '../lib/audio';
import { hexToRgb } from '../lib/color';
import type { VizStyle } from '../store/settings';
import { cx } from './ui';

interface Palette {
  accent: [number, number, number];
  cover: [number, number, number];
  text: [number, number, number];
  dark: boolean;
}

function readPalette(): Palette {
  const css = getComputedStyle(document.documentElement);
  const get = (name: string, fallback: string) => {
    const v = css.getPropertyValue(name).trim();
    return /^#[0-9a-f]{3,8}$/i.test(v) ? hexToRgb(v) : hexToRgb(fallback);
  };
  return {
    accent: get('--accent', '#1ed760'),
    cover: get('--cover', '#535353'),
    text: get('--text', '#ffffff'),
    dark: document.documentElement.dataset.dark !== 'false',
  };
}

const rgba = (c: [number, number, number], a: number) => `rgba(${c[0]},${c[1]},${c[2]},${Math.max(0, Math.min(1, a))})`;
const mixRgb = (a: [number, number, number], b: [number, number, number], t: number): [number, number, number] => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];

/** Point and outward normal on a circle or a squircle (rounded square) at angle θ. */
function boundary(theta: number, r: number, shape: 'circle' | 'square'): [number, number, number, number] {
  const c = Math.cos(theta);
  const s = Math.sin(theta);
  if (shape === 'circle') return [c * r, s * r, c, s];
  const n = 7;
  const x = Math.sign(c) * Math.abs(c) ** (2 / n) * r;
  const y = Math.sign(s) * Math.abs(s) ** (2 / n) * r;
  const gx = Math.sign(x) * Math.abs(x / r) ** (n - 1);
  const gy = Math.sign(y) * Math.abs(y / r) ** (n - 1);
  const len = Math.hypot(gx, gy) || 1;
  return [x, y, gx / len, gy / len];
}

function drawHalo(g: CanvasRenderingContext2D, w: number, h: number, f: Frame, p: Palette, shape: 'circle' | 'square', core: number, boost: boolean) {
  const cx0 = w / 2;
  const cy0 = h / 2;
  const R = (Math.min(w, h) / 2) * core + (boost ? 3 : 6);
  const L = (Math.min(w, h) / 2) * (1 - core) * 0.92;
  // soft glow that swells with the bass
  const glow = g.createRadialGradient(cx0, cy0, R * 0.9, cx0, cy0, R + L);
  glow.addColorStop(0, rgba(p.accent, 0.1 + f.bass * 0.35 + f.beat * 0.15));
  glow.addColorStop(1, rgba(p.accent, 0));
  g.fillStyle = glow;
  g.fillRect(0, 0, w, h);

  const N = boost ? 96 : 132;
  const usable = Math.floor(f.bands.length * 0.78);
  g.lineCap = 'round';
  g.lineWidth = Math.max(2, ((2 * Math.PI * R) / N) * (boost ? 0.55 : 0.46));
  for (let i = 0; i < N; i++) {
    const theta = (i / N) * Math.PI * 2 - Math.PI / 2;
    const k = i <= N / 2 ? i : N - i; // mirror left/right
    const v = f.bands[Math.min(usable - 1, Math.floor((k / (N / 2)) * usable))];
    const [x, y, nx, ny] = boundary(theta, R, shape);
    const len = (boost ? 4 : 2) + v * L;
    g.strokeStyle = rgba(mixRgb(p.accent, p.cover, Math.min(1, v * 1.2)), (boost ? 0.55 : 0.35) + v * 0.65);
    g.beginPath();
    g.moveTo(cx0 + x + nx * 3, cy0 + y + ny * 3);
    g.lineTo(cx0 + x + nx * (3 + len), cy0 + y + ny * (3 + len));
    g.stroke();
  }
}

function drawBars(g: CanvasRenderingContext2D, w: number, h: number, f: Frame, p: Palette, boost: boolean) {
  const n = Math.max(16, Math.min(72, Math.floor(w / (boost ? 10 : 14))));
  const usable = Math.floor(f.bands.length * 0.82);
  const slot = w / n;
  const bw = Math.max(2, slot * (boost ? 0.68 : 0.6));
  const grad = g.createLinearGradient(0, h, 0, 0);
  grad.addColorStop(0, rgba(p.accent, 0.95));
  grad.addColorStop(1, rgba(p.cover, boost ? 1 : 0.85));
  g.fillStyle = grad;
  for (let i = 0; i < n; i++) {
    const v = f.bands[Math.floor((i / n) * usable)];
    const bh = Math.max(boost ? 3 : 2, v * h * 0.92);
    const x = i * slot + (slot - bw) / 2;
    const r = Math.min(bw / 2, 4, bh / 2);
    g.beginPath();
    g.roundRect(x, h - bh, bw, bh, [r, r, 0, 0]);
    g.fill();
  }
}

function drawDots(g: CanvasRenderingContext2D, w: number, h: number, f: Frame, p: Palette, boost: boolean) {
  const gap = boost ? Math.max(9, Math.min(12, w / 30)) : Math.max(10, Math.min(18, w / 40));
  const cols = Math.floor(w / gap);
  const rows = Math.max(3, Math.floor(h / gap));
  const usable = Math.floor(f.bands.length * 0.82);
  const ox = (w - (cols - 1) * gap) / 2;
  const oy = (h - (rows - 1) * gap) / 2;
  for (let c = 0; c < cols; c++) {
    const v = f.bands[Math.floor((c / cols) * usable)];
    const lit = v * rows;
    for (let r = 0; r < rows; r++) {
      const fromBottom = rows - 1 - r;
      const on = fromBottom < lit;
      const peak = on && fromBottom >= lit - 1;
      const x = ox + c * gap;
      const y = oy + r * gap;
      g.fillStyle = on ? rgba(peak ? p.cover : mixRgb(p.accent, p.cover, fromBottom / rows), peak ? 1 : 0.55 + 0.45 * (fromBottom / rows)) : rgba(p.text, boost ? 0.1 : 0.07);
      g.beginPath();
      g.arc(x, y, on ? gap * (boost ? 0.3 : 0.22) : gap * 0.12, 0, Math.PI * 2);
      g.fill();
    }
  }
}

function drawWave(g: CanvasRenderingContext2D, w: number, h: number, f: Frame, p: Palette, boost: boolean) {
  const mid = h / 2;
  const amp = h * (boost ? 0.46 : 0.42);
  const line = (scale: number, color: string, width: number) => {
    g.strokeStyle = color;
    g.lineWidth = width;
    g.beginPath();
    const n = f.wave.length;
    for (let i = 0; i < n; i++) {
      const x = (i / (n - 1)) * w;
      // taper the ends so the line meets the edges calmly
      const taper = Math.sin((i / (n - 1)) * Math.PI);
      const y = mid + f.wave[i] * amp * scale * taper;
      if (i === 0) g.moveTo(x, y);
      else g.lineTo(x, y);
    }
    g.stroke();
  };
  g.lineJoin = 'round';
  if (p.dark) {
    g.shadowColor = rgba(p.accent, 0.8);
    g.shadowBlur = 14 + f.bass * 20;
  }
  line(0.55, rgba(p.cover, 0.55), boost ? 2.5 : 2);
  line(1, rgba(p.accent, 0.95), boost ? 3.5 : 2.5);
  g.shadowBlur = 0;
}

/**
 * A canvas that fills its parent and draws the live spectrum in the chosen
 * style using the active theme's colours.
 */
export function Visualizer({
  variant,
  shape = 'square',
  core = 0.66,
  boost = false,
  className,
}: {
  variant: VizStyle;
  /** halo only: outline of the artwork the ring wraps around */
  shape?: 'circle' | 'square';
  /** halo only: artwork size as a fraction of the canvas */
  core?: number;
  /**
   * Drawn on a dark stage at a small size: bolder shapes, colours lifted
   * towards white so even a dark cover's colour stays visible, and a glow.
   */
  boost?: boolean;
  className?: string;
}) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const g = canvas.getContext('2d');
    if (!g) return;
    const read = (): Palette => {
      const p = readPalette();
      if (!boost) return p;
      const white: [number, number, number] = [255, 255, 255];
      return { ...p, accent: mixRgb(p.accent, white, 0.15), cover: mixRgb(p.cover, white, 0.4), dark: true };
    };
    let palette = read();
    let frames = 0;
    let w = 0;
    let h = 0;
    const resize = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const r = canvas.getBoundingClientRect();
      w = r.width;
      h = r.height;
      canvas.width = Math.max(1, Math.round(w * dpr));
      canvas.height = Math.max(1, Math.round(h * dpr));
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    const off = onFrame((f) => {
      if (++frames % 30 === 0) palette = read();
      g.clearRect(0, 0, w, h);
      g.globalCompositeOperation = palette.dark ? 'lighter' : 'source-over';
      if (variant === 'halo') drawHalo(g, w, h, f, palette, shape, core, boost);
      else if (variant === 'bars') drawBars(g, w, h, f, palette, boost);
      else if (variant === 'dots') drawDots(g, w, h, f, palette, boost);
      else drawWave(g, w, h, f, palette, boost);
      g.globalCompositeOperation = 'source-over';
    });
    return () => {
      off();
      ro.disconnect();
    };
  }, [variant, shape, core, boost]);

  return (
    <canvas
      ref={ref}
      aria-hidden
      className={cx('pointer-events-none absolute inset-0 h-full w-full', boost && '[filter:drop-shadow(0_0_6px_color-mix(in_oklab,var(--accent)_70%,transparent))]', className)}
    />
  );
}
