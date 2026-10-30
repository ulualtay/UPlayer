// Colour helpers: OKLCH conversions for perceptually even accent tuning,
// and cover-art colour extraction through the same-origin image proxy.

type RGB = [number, number, number];

export function hexToRgb(hex: string): RGB {
  let h = hex.replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const n = parseInt(h.slice(0, 6), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgbToHex([r, g, b]: RGB): string {
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`;
}

const toLinear = (c: number) => {
  c /= 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};
const fromLinear = (c: number) => 255 * (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);

export function rgbToOklch([r, g, b]: RGB): [number, number, number] {
  const lr = toLinear(r), lg = toLinear(g), lb = toLinear(b);
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  const C = Math.hypot(A, B);
  const H = ((Math.atan2(B, A) * 180) / Math.PI + 360) % 360;
  return [L, C, H];
}

export function oklchToRgb(L: number, C: number, H: number): RGB {
  const h = (H * Math.PI) / 180;
  const A = C * Math.cos(h), B = C * Math.sin(h);
  const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3;
  const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3;
  const s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3;
  return [
    fromLinear(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    fromLinear(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    fromLinear(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
  ];
}

/** OKLCH -> hex, reducing chroma until the colour fits in sRGB. */
export function oklchHex(L: number, C: number, H: number): string {
  let c = C;
  for (let i = 0; i < 24; i++) {
    const rgb = oklchToRgb(L, c, H);
    if (rgb.every((v) => v >= -0.5 && v <= 255.5)) return rgbToHex(rgb);
    c *= 0.9;
  }
  return rgbToHex(oklchToRgb(L, 0, H));
}

/** Perceptual blend of two colours (OKLab), t = 0 → a, 1 → b. */
export function mixHex(a: string, b: string, t: number): string {
  const toLab = (h: string) => {
    const [L, C, H] = rgbToOklch(hexToRgb(h));
    const r = (H * Math.PI) / 180;
    return [L, C * Math.cos(r), C * Math.sin(r)];
  };
  const [l1, a1, b1] = toLab(a);
  const [l2, a2, b2] = toLab(b);
  const L = l1 + (l2 - l1) * t;
  const A = a1 + (a2 - a1) * t;
  const B = b1 + (b2 - b1) * t;
  return oklchHex(L, Math.hypot(A, B), ((Math.atan2(B, A) * 180) / Math.PI + 360) % 360);
}

export function isDark(hex: string): boolean {
  return luminance(hexToRgb(hex)) < 0.2;
}

function luminance([r, g, b]: RGB) {
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}

export function contrast(a: string, b: string): number {
  const la = luminance(hexToRgb(a)), lb = luminance(hexToRgb(b));
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** Black or white, whichever reads better on the given fill. */
export function inkFor(fill: string): string {
  return contrast(fill, '#000000') >= contrast(fill, '#ffffff') ? '#000000' : '#ffffff';
}

/** Turn an arbitrary cover colour into a usable accent for the theme. */
export function tuneAccent(hex: string, dark: boolean): string {
  const [, C, H] = rgbToOklch(hexToRgb(hex));
  if (C < 0.04) return dark ? '#e5e5e5' : '#262626';
  return oklchHex(dark ? 0.78 : 0.52, Math.min(Math.max(C, 0.13), 0.2), H);
}

/** Deep tint for page header gradients (Spotify-style). */
export function tuneHeader(hex: string, dark: boolean): string {
  const [, C, H] = rgbToOklch(hexToRgb(hex));
  return oklchHex(dark ? 0.42 : 0.82, Math.min(C, dark ? 0.14 : 0.09), H);
}

// ---------- cover extraction ----------

const memory = new Map<string, string>();
const pending = new Map<string, Promise<string | null>>();
const STORE_KEY = 'uplayer-colors';

try {
  const saved = JSON.parse(localStorage.getItem(STORE_KEY) ?? '{}') as Record<string, string>;
  for (const [k, v] of Object.entries(saved)) memory.set(k, v);
} catch {
  /* storage unavailable */
}

let saveTimer: number | undefined;
function persist() {
  clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => {
    try {
      const entries = [...memory.entries()].slice(-400);
      localStorage.setItem(STORE_KEY, JSON.stringify(Object.fromEntries(entries)));
    } catch {
      /* ignore quota errors */
    }
  }, 1500);
}

export function proxied(url: string): string {
  return `/api/img?u=${encodeURIComponent(url)}`;
}

/** Most characterful colour of an image: buckets by hue, weights by chroma. */
function analyse(data: Uint8ClampedArray): string {
  const buckets = new Map<number, { w: number; r: number; g: number; b: number }>();
  let ar = 0, ag = 0, ab = 0, n = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 200) continue;
    const rgb: RGB = [data[i], data[i + 1], data[i + 2]];
    ar += rgb[0]; ag += rgb[1]; ab += rgb[2]; n++;
    const [L, C, H] = rgbToOklch(rgb);
    if (L < 0.18 || L > 0.95 || C < 0.035) continue;
    const key = Math.round(H / 24);
    const w = C * C * (1 - Math.abs(L - 0.6));
    const b = buckets.get(key) ?? { w: 0, r: 0, g: 0, b: 0 };
    b.w += w; b.r += rgb[0] * w; b.g += rgb[1] * w; b.b += rgb[2] * w;
    buckets.set(key, b);
  }
  let best: { w: number; r: number; g: number; b: number } | null = null;
  for (const b of buckets.values()) if (!best || b.w > best.w) best = b;
  if (best && best.w > 0.02) return rgbToHex([best.r / best.w, best.g / best.w, best.b / best.w]);
  return n ? rgbToHex([ar / n, ag / n, ab / n]) : '#535353';
}

export function extractColor(url: string): Promise<string | null> {
  if (!url) return Promise.resolve(null);
  const hit = memory.get(url);
  if (hit) return Promise.resolve(hit);
  const inflight = pending.get(url);
  if (inflight) return inflight;
  const p = new Promise<string | null>((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.decoding = 'async';
    img.onload = () => {
      try {
        const size = 36;
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = size;
        const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
        ctx.drawImage(img, 0, 0, size, size);
        const color = analyse(ctx.getImageData(0, 0, size, size).data);
        memory.set(url, color);
        persist();
        resolve(color);
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = proxied(url);
  }).finally(() => pending.delete(url));
  pending.set(url, p);
  return p;
}

export function cachedColor(url: string | undefined): string | undefined {
  return url ? memory.get(url) : undefined;
}
