// Shared between the API server and the web client.

export interface ArtistRef {
  id?: string;
  name: string;
}

export interface Track {
  /** YouTube video id */
  id: string;
  title: string;
  artists: ArtistRef[];
  album?: { id?: string; name: string };
  /** seconds */
  duration: number;
  thumb: string;
  kind?: 'song' | 'video';
}

export type CardType = 'album' | 'playlist' | 'artist';

export interface Card {
  type: CardType;
  id: string;
  title: string;
  subtitle?: string;
  thumb: string;
}

export interface Shelf {
  title: string;
  tracks?: Track[];
  cards?: Card[];
}

/** One page of plain YouTube results (the Search page). */
export interface VideoSearch {
  videos: Track[];
  /** another page can be fetched */
  more: boolean;
}

export interface SearchResult {
  top?: { kind: 'artist'; card: Card } | { kind: 'track'; track: Track };
  songs: Track[];
  videos: Track[];
  artists: Card[];
  albums: Card[];
  playlists: Card[];
  /** YouTube's spelling suggestion, when it has one */
  didYouMean?: string;
}

export interface Collection {
  id: string;
  type: 'album' | 'playlist';
  title: string;
  subtitle?: string;
  author?: ArtistRef;
  description?: string;
  thumb: string;
  tracks: Track[];
}

export interface ArtistPage {
  id: string;
  name: string;
  thumb?: string;
  banner?: string;
  description?: string;
  audience?: string;
  top: Track[];
  shelves: Shelf[];
}

export interface HomeFeed {
  quickPicks: Track[];
  trending: Track[];
  shelves: Shelf[];
}

export interface DownloadEntry {
  track: Track;
  /** file name inside the music folder */
  file: string;
  /** bytes */
  size: number;
  /** downloaded at (epoch ms) */
  at: number;
}

export interface DownloadJob {
  id: string;
  track: Track;
  status: 'queued' | 'downloading' | 'error';
  /** 0..1 */
  progress: number;
  speed?: string;
  error?: string;
}

export type DownloadEvent =
  | { type: 'snapshot'; entries: DownloadEntry[]; jobs: DownloadJob[]; folder: string }
  | { type: 'job'; job: DownloadJob }
  | { type: 'done'; entry: DownloadEntry }
  | { type: 'removed'; id: string };

export interface LyricLine {
  /** seconds */
  t: number;
  text: string;
}

export interface Lyrics {
  synced?: LyricLine[];
  plain?: string;
  source: string;
  /** length of the recording the synced timestamps were made for (seconds) */
  syncedFor?: number;
  /**
   * When the playing upload is a different cut (a music video with an intro,
   * say), a YouTube upload that matches the lyrics' timing, so the client can
   * line the two up by ear.
   */
  reference?: { id: string; duration: number };
}
