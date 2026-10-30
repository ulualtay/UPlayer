import type { LyricLine, Lyrics } from '../shared/types.ts';
import { search, watchInfo, ytLyrics, ytTimedLyrics } from './youtube.ts';

const LRCLIB = 'https://lrclib.net/api';
const UA = 'UPlayer/0.1 (personal music player; https://lrclib.net)';

interface LrcLibEntry {
  trackName: string;
  artistName: string;
  duration: number;
  instrumental: boolean;
  plainLyrics: string | null;
  syncedLyrics: string | null;
}

/** "Song (Official Video) [HD]" -> "Song" ; also drops "feat." tails. */
export function cleanTitle(title: string): string {
  return (
    title
      // "Song | Official Music Video", "Song // Channel"
      .replace(/\s+(\||\/\/)\s+.*$/, '')
      .replace(/\((?:[^)]*?)(official|video|audio|lyrics?|klip|clip|visualizer|hd|4k|remaster(?:ed)?|music|müzik|sözleri|live|canlı)[^)]*\)/gi, '')
      .replace(/\[(?:[^\]]*?)\]/g, '')
      // the same tags without brackets: "Song - Official Video", "Song Official Audio"
      .replace(/\s+[-–—]?\s*(official\s+)?(music\s+)?(video|audio|lyric video|lyrics|visualizer|klip)\s*$/i, '')
      .replace(/\s+(feat\.?|ft\.?|featuring)\s+.*$/i, '')
      .replace(/\s{2,}/g, ' ')
      .trim()
  );
}

function splitArtistFromTitle(title: string, artist: string): { title: string; artist: string } {
  const m = title.match(/^(.+?)\s+[-–—]\s+(.+)$/);
  if (m) return { artist: m[1].trim(), title: m[2].trim() };
  return { title, artist };
}

export function parseLrc(lrc: string): LyricLine[] {
  const lines: LyricLine[] = [];
  for (const raw of lrc.split(/\r?\n/)) {
    const stamps = [...raw.matchAll(/\[(\d+):(\d+(?:\.\d+)?)\]/g)];
    if (!stamps.length) continue;
    const text = raw.replace(/\[[^\]]*\]/g, '').trim();
    for (const s of stamps) lines.push({ t: Number(s[1]) * 60 + Number(s[2]), text });
  }
  return lines.sort((a, b) => a.t - b.t);
}

async function get<T>(url: string): Promise<T | null> {
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) return null;
  return (await res.json()) as T;
}

/**
 * Synced lyrics beat plain ones even when they were timed for another cut of
 * the song: the client can shift them into place (see `reference`), while
 * plain lyrics can never follow along. Among synced entries the closest
 * duration wins.
 */
function pick(entries: LrcLibEntry[], duration: number): LrcLibEntry | undefined {
  const gap = (e: LrcLibEntry) => (duration ? Math.abs(e.duration - duration) : 0);
  const synced = entries.filter((e) => e.syncedLyrics).sort((a, b) => gap(a) - gap(b));
  if (synced.length) return synced[0];
  return entries.find((e) => e.plainLyrics && gap(e) <= 6) ?? entries.find((e) => e.plainLyrics) ?? entries.find((e) => e.instrumental);
}

/** Title spellings to try, most specific first: "Song (1. Yıl Özel)" also tries "Song". */
function titleVariants(raw: string, artist: string): { title: string; artist: string }[] {
  let title = cleanTitle(raw);
  let a = artist;
  if (/\s[-–—]\s/.test(title)) ({ title, artist: a } = splitArtistFromTitle(title, artist));
  const bare = title.replace(/\s*[([].*?[)\]]\s*/g, ' ').replace(/\s{2,}/g, ' ').trim();
  const out = [{ title, artist: a }];
  if (bare && bare !== title) out.push({ title: bare, artist: a });
  return out;
}

const qs = (o: Record<string, string | number>) => new URLSearchParams(Object.entries(o).map(([k, v]) => [k, String(v)])).toString();

async function lrclib(title: string, artist: string, duration: number): Promise<LrcLibEntry | undefined> {
  const exact = duration ? await get<LrcLibEntry>(`${LRCLIB}/get?${qs({ track_name: title, artist_name: artist, duration: Math.round(duration) })}`) : null;
  if (exact?.syncedLyrics || exact?.instrumental) return exact;
  // the exact match may be plain-only while another upload of the same song is synced
  const list = [
    ...(exact ? [exact] : []),
    ...((await get<LrcLibEntry[]>(`${LRCLIB}/search?${qs({ track_name: title, artist_name: artist })}`)) ?? []),
  ];
  if (!list.some((e) => e.syncedLyrics)) list.push(...((await get<LrcLibEntry[]>(`${LRCLIB}/search?${qs({ q: `${artist} ${title}` })}`)) ?? []));
  return pick(list, duration);
}

/** A YouTube Music song whose length matches the recording the lyrics were timed for. */
async function referenceFor(title: string, artist: string, seconds: number, playingId: string) {
  try {
    const res = await search(`${artist} ${title}`);
    const hit = [...res.songs, ...res.videos].find((t) => t.id !== playingId && t.duration && Math.abs(t.duration - seconds) <= 2);
    return hit ? { id: hit.id, duration: hit.duration } : undefined;
  } catch {
    return undefined;
  }
}

/** "Şımarık (Official Video)" and "Sımarık" compare equal. */
const norm = (s: string) =>
  cleanTitle(s)
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .replace(/ı/g, 'i')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();

/** Channel names dressed up as artists: "ManifestVEVO", "manifest - Topic", "Manifest Official". */
const normArtist = (s: string) =>
  norm(
    s
      .replace(/\s*-\s*topic$/i, '')
      .replace(/vevo$/i, '')
      .replace(/\s+official$/i, ''),
  );

const sameArtist = (a: string, b: string) => a === b || (Math.min(a.length, b.length) >= 3 && (a.includes(b) || b.includes(a)));

/**
 * The album / single upload ("song" on YouTube Music) of what may be a music
 * video or any other upload: same title, same artist. Used to borrow its timed
 * lyrics and its square album art.
 */
export async function songUploadFor(rawTitle: string, rawArtist: string, exceptId = '') {
  for (const { title, artist } of titleVariants(rawTitle, rawArtist)) {
    try {
      const want = norm(title);
      const by = normArtist(artist);
      const res = await search(`${artist} ${title}`);
      const hit = res.songs.find((t) => t.id !== exceptId && t.duration && norm(t.title) === want && (!by || t.artists.some((a) => sameArtist(normArtist(a.name), by))));
      if (hit) return hit;
    } catch {
      /* try the next spelling */
    }
  }
  return undefined;
}

/** At least a few distinct timestamps: YouTube sends a music video's lyrics all stamped 0:00. */
const isTimed = (lines: { t: number }[]) => new Set(lines.map((l) => Math.round(l.t))).size > Math.min(5, lines.length / 2);

type Query = { id: string; title: string; artist: string; duration: number };

/**
 * Best lyrics for a YouTube upload, preferring ones that can follow along.
 *
 * Music videos often add an intro or outro, and lyric sites label their
 * timings unreliably, so for a video the lyrics are looked up for the song
 * upload instead and that song is returned as `reference`: the client then
 * measures by ear how far the video is shifted.
 */
export async function findLyrics(opts: Query): Promise<Lyrics | null> {
  const info = await watchInfo(opts.id).catch(() => undefined);
  const isVideo = !!info?.type && info.type !== 'MUSIC_VIDEO_TYPE_ATV';
  if (isVideo) {
    const song = await songUploadFor(opts.title, opts.artist, opts.id);
    if (song) {
      const lyrics = await lyricsFor({ id: song.id, title: song.title, artist: song.artists[0]?.name ?? opts.artist, duration: song.duration });
      if (lyrics?.synced?.length && !lyrics.reference) return { ...lyrics, syncedFor: song.duration, reference: { id: song.id, duration: song.duration } };
      if (lyrics) return lyrics.synced?.length ? lyrics : { plain: lyrics.plain, source: lyrics.source };
    }
  }
  return lyricsFor(opts, info?.lyricsBrowseId);
}

/**
 * Lyrics for this exact upload:
 * 1. LRCLIB timed for a recording of this length,
 * 2. YouTube Music's own timed lyrics (LyricFind / Musixmatch),
 * 3. LRCLIB timed for another cut, with a matching upload for the client to line up against,
 * 4. plain text from either.
 */
async function lyricsFor(opts: Query, lyricsBrowseId?: string): Promise<Lyrics | null> {
  let timedElsewhere: { entry: LrcLibEntry; title: string; artist: string } | undefined;
  let plain: string | undefined;
  try {
    for (const v of titleVariants(opts.title, opts.artist)) {
      const entry = await lrclib(v.title, v.artist, opts.duration);
      if (!entry) continue;
      if (entry.instrumental) return { plain: '♪ Instrumental ♪', source: 'LRCLIB' };
      if (entry.syncedLyrics) {
        if (!opts.duration || !entry.duration || Math.abs(opts.duration - entry.duration) <= 2.5) {
          return { synced: parseLrc(entry.syncedLyrics), plain: entry.plainLyrics ?? undefined, source: 'LRCLIB', syncedFor: entry.duration };
        }
        timedElsewhere ??= { entry, ...v };
      }
      plain ??= entry.plainLyrics ?? undefined;
    }
  } catch {
    // LRCLIB unreachable: YouTube Music may still have them
  }

  const yt = await ytTimedLyrics(opts.id, lyricsBrowseId).catch((err) => {
    console.warn(`[lyrics] timed lyrics for ${opts.id}: ${(err as Error).message}`);
    return undefined;
  });
  if (yt?.lines.length && isTimed(yt.lines)) return { synced: yt.lines, source: yt.source, syncedFor: opts.duration || undefined };
  // words without timing (how YouTube sends them for videos) still beat nothing
  if (yt?.lines.length) plain ??= yt.lines.map((l) => l.text).join('\n');

  if (timedElsewhere) {
    const { entry, title, artist } = timedElsewhere;
    return {
      synced: parseLrc(entry.syncedLyrics!),
      plain: entry.plainLyrics ?? undefined,
      source: 'LRCLIB',
      syncedFor: entry.duration,
      // a different cut (music video intro, radio edit…): an upload that matches the timing
      reference: await referenceFor(title, artist, entry.duration, opts.id),
    };
  }

  if (plain) return { plain, source: 'LRCLIB' };
  const ytPlain = await ytLyrics(opts.id).catch(() => undefined);
  return ytPlain ? { plain: ytPlain, source: 'YouTube Music' } : null;
}
