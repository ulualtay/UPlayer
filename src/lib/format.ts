import type { Track } from '../../shared/types';

export const LOCALE = 'en-US';
export const nf = new Intl.NumberFormat(LOCALE);
export const nf1 = new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 1 });

/** "1 song", "12 songs" */
export const count = (n: number, one: string, many = `${one}s`) => `${nf.format(n)} ${n === 1 ? one : many}`;

export function fmtTime(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) sec = 0;
  const s = Math.floor(sec % 60);
  const m = Math.floor((sec / 60) % 60);
  const h = Math.floor(sec / 3600);
  const ss = String(s).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

/** "2 hr 15 min", "45 min", "30 sec" */
export function fmtListen(ms: number): string {
  const totalMin = Math.round(ms / 60000);
  if (ms < 60000) return `${Math.round(ms / 1000)} sec`;
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (!h) return `${m} min`;
  if (h >= 100) return `${nf.format(h)} hr`;
  return m ? `${h} hr ${m} min` : `${h} hr`;
}

/** Compact for axis ticks / tiles: 12.9K; 1.2M */
export function compact(n: number): string {
  return new Intl.NumberFormat(LOCALE, { notation: 'compact', maximumFractionDigits: 1 }).format(n);
}

export function artistsText(t: Pick<Track, 'artists'>): string {
  return t.artists.map((a) => a.name).join(', ');
}

/** Case- and accent-insensitive form for matching ("İstanbul" ~ "istanbul", "Ğ" ~ "g"). */
export function fold(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '').replace(/ı/g, 'i');
}

const rtf = new Intl.RelativeTimeFormat(LOCALE, { numeric: 'auto' });
export function relTime(ts: number): string {
  const diff = (ts - Date.now()) / 1000;
  const abs = Math.abs(diff);
  if (abs < 45) return 'just now';
  if (abs < 3600) return rtf.format(Math.round(diff / 60), 'minute');
  if (abs < 86400) return rtf.format(Math.round(diff / 3600), 'hour');
  if (abs < 86400 * 7) return rtf.format(Math.round(diff / 86400), 'day');
  return fmtDate(ts);
}

export function fmtDate(ts: number, opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric' }): string {
  return new Date(ts).toLocaleDateString(LOCALE, opts);
}

export const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
export const WEEKDAYS_LONG = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
/** Monday-first weekday index 0..6 */
export const weekday = (d: Date) => (d.getDay() + 6) % 7;

export function greeting(d = new Date()): string {
  const h = d.getHours();
  if (h >= 5 && h < 12) return 'Good morning';
  if (h >= 12 && h < 18) return 'Good afternoon';
  if (h >= 18 && h < 23) return 'Good evening';
  return 'Good night';
}

export function totalDuration(tracks: Track[]): string {
  const sec = tracks.reduce((s, t) => s + (t.duration || 0), 0);
  const h = Math.floor(sec / 3600);
  const m = Math.round((sec % 3600) / 60);
  return h ? `${h} hr ${m} min` : `${m} min`;
}

/**
 * Ask Google's image CDN for a smaller rendition. Only the sizes YouTube Music
 * itself requests are reliably served, so snap to those; callers still fall
 * back to the original URL if a rendition fails.
 */
export function img(url: string | undefined, size = 300): string {
  if (!url) return '';
  if (/googleusercontent\.com|ggpht\.com/.test(url)) {
    const s = size <= 60 ? 60 : size <= 120 ? 120 : size <= 226 ? 226 : 544;
    return url.replace(/=w\d+-h\d+/, `=w${s}-h${s}`).replace(/=s\d+$/, `=s${s}`);
  }
  return url;
}

const VIDEO_STILL = /^https?:\/\/i\d?\.ytimg\.com\/vi(?:_webp)?\/([\w-]{11})\//;
const GOOGLE_ART = /googleusercontent\.com|ggpht\.com/;

/** A frame from a YouTube video (16:9) rather than square album art. */
export const isVideoStill = (url: string | undefined) => !!url && VIDEO_STILL.test(url);

/** YouTube's 4:3 stills put a 16:9 frame between black bars. */
export const isLetterboxed = (url: string) => /ytimg\.com\/vi(?:_webp)?\/[\w-]{11}\/(?:sd|hq)default\.jpg$/.test(url);

/**
 * Every source worth trying for an image, best first; callers move down the
 * list when one fails.
 *
 * - Album art comes from Google's image CDN, which renders any size: big
 *   covers ask for 1200 px.
 * - Video thumbnails come as a 400×225 frame, mush once cropped square and
 *   enlarged. Big covers try YouTube's larger stills first: 1280×720, then the
 *   640×480 one (letterboxed: `Cover` zooms past its bars).
 */
export function imageSources(url: string | undefined, size = 300): string[] {
  if (!url) return [];
  const video = url.match(VIDEO_STILL);
  if (video && size > 160) {
    const base = `https://i.ytimg.com/vi/${video[1]}/`;
    return [`${base}maxresdefault.jpg`, `${base}hq720.jpg`, `${base}sddefault.jpg`, url];
  }
  if (GOOGLE_ART.test(url) && size > 544) {
    const big = url.replace(/=w\d+-h\d+/, '=w1200-h1200').replace(/=s\d+$/, '=s1200');
    return [...new Set([big, img(url, 544), url])];
  }
  const resized = img(url, size);
  return resized === url ? [url] : [resized, url];
}
