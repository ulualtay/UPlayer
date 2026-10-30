import { Constants, Innertube, YTNodes } from 'youtubei.js';
import type { ArtistPage, ArtistRef, Card, Collection, HomeFeed, LyricLine, SearchResult, Shelf, Track, VideoSearch } from '../shared/types.ts';

// youtubei.js node classes are loosely typed for our purposes; we read
// documented fields defensively and normalise into our own shapes.
type Node = any;

let client: Promise<Innertube> | null = null;

export function yt(): Promise<Innertube> {
  if (!client) {
    client = Innertube.create({ lang: 'en', location: 'TR', retrieve_player: false }).catch((err) => {
      client = null;
      throw err;
    });
  }
  return client;
}

/** Drops the cached session so the next call starts fresh (used after unexpected failures). */
export function resetClient() {
  client = null;
}

// ---------- normalisers ----------

const text = (v: Node): string => (v == null ? '' : typeof v === 'string' ? v : (v.toString?.() ?? ''));

function bestThumb(list: Node[] | undefined | null): string {
  if (!list?.length) return '';
  const sorted = [...list].sort((a, b) => (b.width ?? 0) - (a.width ?? 0));
  return upscale(sorted[0].url ?? '');
}

/** Google image URLs carry their size in the suffix; ask for a crisp square. */
export function upscale(url: string, size = 544): string {
  if (!url) return url;
  if (/googleusercontent\.com|ggpht\.com/.test(url)) {
    return url.replace(/=w\d+-h\d+/, `=w${size}-h${size}`).replace(/=s\d+$/, `=s${size}`);
  }
  return url;
}

function artistsOf(x: Node): ArtistRef[] {
  const raw: Node[] = x.artists?.length ? x.artists : x.authors?.length ? x.authors : x.author ? [x.author] : [];
  const seen = new Set<string>();
  const out: ArtistRef[] = [];
  for (const a of raw) {
    const name = typeof a === 'string' ? a : a?.name;
    if (!name || seen.has(name)) continue;
    seen.add(name);
    out.push({ name, id: a?.channel_id || undefined });
  }
  return out;
}

function trackFromItem(x: Node, fallback?: { artists?: ArtistRef[]; thumb?: string; album?: Track['album'] }): Track | null {
  const id: string | undefined = x?.id ?? x?.video_id;
  if (!id || id.length !== 11) return null;
  const type = x.item_type;
  if (type && !['song', 'video', 'non_music_track'].includes(type)) return null;
  let artists = artistsOf(x);
  if (!artists.length && typeof x.author === 'string') artists = [{ name: x.author }];
  if (!artists.length && fallback?.artists) artists = fallback.artists;
  const thumb = bestThumb(x.thumbnails ?? x.thumbnail) || fallback?.thumb || `https://i.ytimg.com/vi/${id}/mqdefault.jpg`;
  const album = x.album?.name ? { id: x.album.id, name: x.album.name } : fallback?.album;
  return {
    id,
    title: text(x.title) || 'Unknown',
    artists: artists.length ? artists : [{ name: 'Unknown artist' }],
    album,
    duration: x.duration?.seconds ?? 0,
    thumb,
    kind: type === 'song' || /googleusercontent/.test(thumb) ? 'song' : 'video',
  };
}

function tracksFrom(items: Node[] | undefined, fallback?: Parameters<typeof trackFromItem>[1]): Track[] {
  const out: Track[] = [];
  const seen = new Set<string>();
  for (const x of items ?? []) {
    const t = trackFromItem(x, fallback);
    if (t && !seen.has(t.id)) {
      seen.add(t.id);
      out.push(t);
    }
  }
  return out;
}

function normaliseId(type: string, id: string): string {
  // Playlist browse ids come prefixed with "VL"; the playlist endpoint wants the bare id.
  if (type === 'playlist' && id.startsWith('VL')) return id.slice(2);
  return id;
}

function cardFromItem(x: Node): Card | null {
  const type = x?.item_type;
  if (!['album', 'playlist', 'artist'].includes(type) || !x.id) return null;
  const subtitle = text(x.subtitle) || [x.author?.name, x.year, x.item_count, x.subscribers].filter(Boolean).join(' • ');
  return {
    type,
    id: normaliseId(type, x.id),
    title: text(x.title) || text(x.name) || x.author?.name || '',
    subtitle: subtitle || (x.artists?.map((a: Node) => a.name).join(', ') ?? ''),
    thumb: bestThumb(x.thumbnails ?? x.thumbnail),
  };
}

function cardsFrom(items: Node[] | undefined): Card[] {
  return (items ?? []).map(cardFromItem).filter((c): c is Card => !!c && !!c.title);
}

function shelfFrom(section: Node): Shelf | null {
  const title = text(section?.header?.title) || text(section?.title);
  const items: Node[] = section?.contents ?? [];
  if (!title || !items.length) return null;
  const tracks = tracksFrom(items);
  const cards = cardsFrom(items);
  if (tracks.length >= cards.length && tracks.length) return { title, tracks };
  if (cards.length) return { title, cards };
  return null;
}

/** A result from regular YouTube search (not YouTube Music). */
function trackFromVideo(v: Node): Track | null {
  const id: string | undefined = v?.id ?? v?.video_id;
  const duration: number = v?.duration?.seconds ?? 0;
  // live streams and upcoming premieres can't be played as songs
  if (!id || id.length !== 11 || !duration || v.is_live || v.is_upcoming) return null;
  // auto-generated "Artist - Topic" channels carry the plain artist name
  const channel = v.author?.name && v.author.name !== 'N/A' ? String(v.author.name).replace(/\s*-\s*Topic$/i, '') : '';
  return {
    id,
    title: text(v.title) || 'Unknown',
    // uploader channels usually aren't YouTube Music artists, so no artist page link
    artists: [{ name: channel || 'YouTube' }],
    duration,
    thumb: bestThumb(v.thumbnails) || `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
    kind: 'video',
  };
}

// ---------- API ----------

const videosOf = (page: Node): Track[] => ((page?.videos ?? []) as Node[]).map(trackFromVideo).filter((t): t is Track => !!t);

/** Fetched result pages per query, so "Show more" can continue where the last page ended. */
const youtubeSearches = new Map<string, { at: number; pages: Node[] }>();

/**
 * What the Search page shows: plain YouTube video results, in YouTube's own
 * order, one page (about 20) at a time.
 */
export async function youtubeSearch(q: string, page = 0): Promise<VideoSearch> {
  const c = await yt();
  const key = q.toLowerCase();
  let entry = youtubeSearches.get(key);
  if (!entry || Date.now() - entry.at > 10 * 60_000) {
    entry = { at: Date.now(), pages: [await c.search(q, { type: 'video' })] };
    youtubeSearches.set(key, entry);
    if (youtubeSearches.size > 50) youtubeSearches.delete(youtubeSearches.keys().next().value!);
  }
  while (entry.pages.length <= page) {
    const last: Node = entry.pages[entry.pages.length - 1];
    if (!last?.has_continuation) break;
    entry.pages.push(await last.getContinuation());
  }
  const p: Node = entry.pages[page];
  return p ? { videos: videosOf(p), more: !!p.has_continuation } : { videos: [], more: false };
}

/** YouTube Music search: songs, videos, artists, albums, playlists. Used to match uploads to songs (lyrics, artwork). */
export async function search(q: string): Promise<SearchResult> {
  const c = await yt();
  let didYouMean: string | undefined;
  const run = (type: 'song' | 'video' | 'artist' | 'album' | 'playlist') =>
    c.music
      .search(q, { type })
      .then((r) => {
        const sections = (r.contents ?? []) as Node[];
        // A spelling hint ("Did you mean …") can come first; the results are in the MusicShelf.
        for (const s of sections) {
          for (const item of s.type === 'ItemSection' ? (s.contents ?? []) : []) {
            const corrected = text(item.corrected_query);
            if (corrected && corrected.toLowerCase() !== q.toLowerCase()) didYouMean ??= corrected;
          }
        }
        return (sections.find((s) => s.type === 'MusicShelf')?.contents ?? []) as Node[];
      })
      .catch((err: Error) => {
        console.error(`[search] ${type} "${q}" -> ${err.message}`);
        return [] as Node[];
      });
  const [songs, videos, artists, albums, playlists] = await Promise.all([run('song'), run('video'), run('artist'), run('album'), run('playlist')]);
  const res: SearchResult = {
    songs: tracksFrom(songs),
    videos: tracksFrom(videos),
    artists: cardsFrom(artists),
    albums: cardsFrom(albums),
    playlists: cardsFrom(playlists),
    didYouMean,
  };
  const norm =(s: string) => s.toLocaleLowerCase('tr').replace(/\s+/g, ' ').trim();
  const firstArtist = res.artists[0];
  // "tarkan" -> the artist; "tarkan kuzu kuzu" -> the song
  if (firstArtist && norm(q) === norm(firstArtist.title)) res.top = { kind: 'artist', card: firstArtist };
  else if (res.songs[0]) res.top = { kind: 'track', track: res.songs[0] };
  else if (res.videos[0]) res.top = { kind: 'track', track: res.videos[0] };
  return res;
}

export async function suggestions(q: string): Promise<string[]> {
  const c = await yt();
  const sections = await c.music.getSearchSuggestions(q);
  const out: string[] = [];
  for (const sec of sections as Node[]) {
    for (const item of sec.contents ?? []) {
      const s = text(item.suggestion);
      if (s) out.push(s);
    }
  }
  return out.slice(0, 8);
}

export async function upNext(videoId: string): Promise<Track[]> {
  const c = await yt();
  const panel = await c.music.getUpNext(videoId, true);
  return tracksFrom(panel.contents as Node[]).filter((t) => t.id !== videoId);
}

export async function track(videoId: string): Promise<Track> {
  const c = await yt();
  const info = await c.music.getInfo(videoId);
  const b: Node = info.basic_info;
  return {
    id: videoId,
    title: b.title ?? 'Unknown',
    artists: [{ name: (b.author ?? 'Unknown artist').replace(/ - Topic$/, ''), id: b.channel_id }],
    duration: b.duration ?? 0,
    thumb: bestThumb(b.thumbnail),
    kind: 'video',
  };
}

export async function home(): Promise<HomeFeed> {
  const c = await yt();
  const [feed, explore] = await Promise.all([
    c.music.getHomeFeed().catch(() => null),
    c.music.getExplore().catch(() => null),
  ]);
  const feedSections: Node[] = (feed?.sections as Node[]) ?? [];
  const exploreSections: Node[] = (explore?.sections as Node[]) ?? [];
  const quick = feedSections.find((s) => tracksFrom(s.contents).length > 4);
  const trendingSec = exploreSections.find((s) => (s.contents?.[0] as Node)?.type === 'MusicResponsiveListItem');
  const shelves: Shelf[] = [];
  for (const s of [...feedSections, ...exploreSections]) {
    if (s === quick || s === trendingSec) continue;
    const shelf = shelfFrom(s);
    if (shelf) shelves.push(shelf);
  }
  return {
    quickPicks: quick ? tracksFrom(quick.contents) : [],
    trending: trendingSec ? tracksFrom(trendingSec.contents) : [],
    shelves,
  };
}

export async function artist(id: string): Promise<ArtistPage> {
  const c = await yt();
  const page: Node = await c.music.getArtist(id);
  const h: Node = page.header;
  const name = text(h?.title);
  const banner = bestThumb(h?.thumbnail?.contents);
  const self: ArtistRef = { id, name };
  let top: Track[] = [];
  const shelves: Shelf[] = [];
  for (const s of page.sections ?? []) {
    if (s.type === 'MusicShelf' && !top.length) {
      top = tracksFrom(s.contents, { artists: [self] });
      continue;
    }
    const shelf = shelfFrom(s);
    if (shelf) shelves.push(shelf);
  }
  return {
    id,
    name,
    banner: banner ? banner.replace(/=w\d+-h\d+/, '=w1440-h600') : undefined,
    thumb: banner ? banner.replace(/=w\d+-h\d+(-p)?/, '=w544-h544-p') : top[0]?.thumb,
    description: text(h?.description) || undefined,
    audience: text(h?.subscription_button?.subscriber_count) || text(h?.monthly_listener_count) || undefined,
    top,
    shelves,
  };
}

function headerInfo(h: Node) {
  const strap = h?.strapline_text_one;
  const authorRun = strap?.runs?.find((r: Node) => r.endpoint?.payload?.browseId);
  return {
    title: text(h?.title),
    subtitle: text(h?.subtitle),
    description: text(h?.description?.description ?? h?.description) || undefined,
    thumb: bestThumb(h?.thumbnail?.contents ?? h?.thumbnails),
    author: text(strap) ? { name: text(strap), id: authorRun?.endpoint?.payload?.browseId } : undefined,
  };
}

export async function album(id: string): Promise<Collection> {
  const c = await yt();
  const page: Node = await c.music.getAlbum(id);
  const h = headerInfo(page.header);
  const fallback = { artists: h.author ? [h.author] : undefined, thumb: h.thumb, album: { id, name: h.title } };
  return {
    id,
    type: 'album',
    title: h.title,
    subtitle: h.subtitle,
    author: h.author,
    description: h.description,
    thumb: h.thumb,
    tracks: tracksFrom(page.contents, fallback),
  };
}

export async function playlist(id: string, limit = 500): Promise<Collection> {
  const c = await yt();
  let page: Node = await c.music.getPlaylist(normaliseId('playlist', id));
  const h = headerInfo(page.header);
  const tracks = tracksFrom(page.contents);
  while (page.has_continuation && tracks.length < limit) {
    try {
      page = await page.getContinuation();
      const seen = new Set(tracks.map((t) => t.id));
      for (const t of tracksFrom(page.contents)) if (!seen.has(t.id)) tracks.push(t);
    } catch {
      break;
    }
  }
  return {
    id,
    type: 'playlist',
    title: h.title,
    subtitle: h.subtitle,
    author: h.author,
    description: h.description,
    thumb: h.thumb || tracks[0]?.thumb || '',
    tracks,
  };
}

export async function ytLyrics(videoId: string): Promise<string | undefined> {
  const c = await yt();
  const shelf: Node = await c.music.getLyrics(videoId).catch(() => undefined);
  const body = text(shelf?.description);
  return body || undefined;
}

// The YouTube Music Android app gets line-timed lyrics (LyricFind / Musixmatch)
// where the web player only shows plain text. Older app versions are refused,
// so the one youtubei.js ships is raised to a version that is served.
(Constants.CLIENTS.YTMUSIC_ANDROID as { VERSION: string }).VERSION = '7.21.50';

export interface TimedLyrics {
  /** for music videos YouTube Music sends the words with every timestamp at 0 */
  lines: LyricLine[];
  source: string;
}

export interface WatchInfo {
  /** MUSIC_VIDEO_TYPE_ATV for album / single uploads ("songs"); OMV, UGC… for videos */
  type?: string;
  lyricsBrowseId?: string;
}

/** What YouTube Music knows about an upload: is it the song itself, and where are its lyrics. */
export async function watchInfo(videoId: string): Promise<WatchInfo> {
  const c = await yt();
  const next: Node = await c.actions.execute('/next', { videoId, client: 'YTMUSIC', parse: true });
  const memo = next.contents_memo;
  const tab: Node = memo
    ?.getType(YTNodes.Tab)
    ?.find((t: Node) => t.endpoint?.payload?.browseEndpointContextSupportedConfigs?.browseEndpointContextMusicConfig?.pageType === 'MUSIC_PAGE_TYPE_TRACK_LYRICS');
  const self: Node = memo?.getType(YTNodes.PlaylistPanelVideo)?.find((v: Node) => v.video_id === videoId);
  return {
    type: self?.endpoint?.payload?.watchEndpointMusicSupportedConfigs?.watchEndpointMusicConfig?.musicVideoType,
    lyricsBrowseId: tab?.endpoint?.payload?.browseId,
  };
}

export async function ytTimedLyrics(videoId: string, browseId?: string): Promise<TimedLyrics | undefined> {
  const c = await yt();
  browseId ??= (await watchInfo(videoId)).lyricsBrowseId;
  if (!browseId) return undefined;

  const raw: Node = await c.actions.execute('/browse', { browseId, client: 'YTMUSIC_ANDROID', parse: false });
  const data = raw?.data?.contents?.elementRenderer?.newElement?.type?.componentType?.model?.timedLyricsModel?.lyricsData;
  const timed: Node[] | undefined = data?.timedLyricsData;
  if (!timed?.length) return undefined;
  const lines: LyricLine[] = timed
    .map((l) => ({ t: Number(l.cueRange?.startTimeMilliseconds ?? 0) / 1000, text: String(l.lyricLine ?? '').replace(/^♪$/, '').trim() }))
    .filter((l) => Number.isFinite(l.t))
    .sort((a, b) => a.t - b.t);
  return { lines, source: String(data.sourceMessage ?? 'YouTube Music').replace(/^Source:\s*/i, '') };
}
