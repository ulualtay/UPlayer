# UPlayer

A Spotify-style desktop music player: search YouTube / YouTube Music, listen instantly, download songs to your computer and build playlists from them. Switchable themes, live visualizers, crossfade, deep listening stats and a Wrapped-style recap any time.

## Status

Personal project, version 0.3.6. Built for Windows x64: the installer, the bundled yt-dlp download and the taskbar / media-control integration are Windows-specific. There are no automated tests yet; the type-check below is the check to run before committing.

## Run it

| What | Command |
| --- | --- |
| Desktop app from source | `npm run app` |
| Windows installer + portable `.exe` | `npm run dist` → `release/` |
| Browser dev server (hot reload) | `npm run dev` → http://localhost:5173 |
| Type-check | `npm run typecheck` |

Requires Node.js 22+ (`winget install OpenJS.NodeJS.LTS`). Get the code with `git clone https://github.com/ulualtay/UPlayer.git`. After `npm install`, run `node node_modules/electron/install.js` once if npm skipped Electron's download script, and put [yt-dlp](https://github.com/yt-dlp/yt-dlp/releases) at `.tools/yt-dlp.exe` (the app downloads it there itself on first run if it's missing).

## How it works

- **Catalog**: `server/youtube.ts` uses [youtubei.js](https://github.com/LuanRT/YouTube.js) (no API key) for search, suggestions, artist / album / playlist pages, home and explore feeds, and "up next" radio.
- **Audio**: `server/ytdlp.ts` keeps a private, self-updating copy of yt-dlp. `/api/stream/:id` serves the downloaded file when there is one, otherwise resolves YouTube's best audio stream and proxies it with range support, so any video plays, including ones whose uploader disabled embedding.
- **Downloads**: `server/downloads.ts` queues yt-dlp jobs (two at a time) into `Music\UPlayer`, keeps an index next to the files, and streams progress to the UI over server-sent events.
- **Playback engine** (`src/player/engine.ts`): two HTML5 audio decks routed through Web Audio for equal-power crossfades, a master volume and an analyser that feeds the visualizers. Listening sessions are logged for the stats page; metadata goes to the Windows media controls.
- **Lyrics**: synced lyrics from [LRCLIB](https://lrclib.net) or YouTube Music's own timed lyrics (LyricFind / Musixmatch, via the Android Music client), plain text as a last resort. For a music video the lyrics of the song upload are used and the video is lined up against that song by ear: both recordings are decoded at 8 kHz in the browser and their loudness onsets cross-correlated (`src/lib/lyricsSync.ts`). The result, or a manual nudge, is remembered per song.
- **Backup** (`server/backup.ts`, `src/lib/durable.ts`): library, history, settings and queue are also written as plain JSON (`%APPDATA%\uplayer\backup`, with 14 daily snapshots). If browser storage comes back empty or older, the newer file copy is restored before the app reads it.
- **Desktop shell** (`electron/`): runs the same server in-process on `127.0.0.1:47821` (fixed so local data survives restarts), draws a theme-coloured title bar, and doubles as the JavaScript runtime yt-dlp needs. A diagnostic log is written to `%APPDATA%\UPlayer\main.log`.

Significant decisions, with their reasons and the alternatives considered, are logged in [docs/decisions.md](docs/decisions.md).

## Features

- Search works like YouTube: plain YouTube video results in YouTube's order, a page at a time ("Show more"); paste YouTube video / playlist links. While a video plays, the now-playing views borrow the square album art of the same song on YouTube Music when there is one, and otherwise crop the video's own still square.
- The desktop window opens at once in the last theme's colours with a small splash while the server (loaded lazily) starts.
- Download buttons on every song, "download all" on albums and playlists, a Downloads page with multi-select to turn downloads into playlists; downloaded songs play offline and start instantly.
- Playlists only hold downloaded songs: adding one that isn't on disk downloads it first, and it joins the playlist when the download finishes (`src/store/pendingAdds.ts`; waiting songs survive a restart).
- Home shows only your own music: pick up where you left off, your week at a glance, your library (Liked Songs, Downloads, playlists), recently played and optional memories. No recommendations, and Search starts empty.
- Styles: starts calm (Minimal) and asks once how much you want on screen; Classic, Vibes and Power user presets, plus single switches in Settings → Style for the top bar shortcuts, player bar extras, Liked Songs / Downloads in Your Library, library filters and the Home shelves. Everything hidden stays in the top-right menu.
- Spotify-like layout: resizable library sidebar, album / artist / playlist pages with colour-washed headers, right panel (now playing, queue, lyrics), fullscreen player with cover / vinyl modes.
- 10 themes (8 dark, 2 light) plus your own 4-colour custom theme (with presets like OLED black and a shareable theme code), custom accent colour, accent from cover art, aurora / blurred-cover / solid backgrounds, film grain.
- Customize studio: page-header colour (cover / accent / black / custom / off, with strength), corner style, density, interface size, six fonts, floating player bar, glass opacity and blur, aurora intensity, white or accent play buttons, high-contrast text, reduced motion.
- Desktop: the close button hides UPlayer to the system tray and music keeps playing (tray menu and taskbar thumbnail buttons for play / pause / next / previous), optional start with Windows (quietly in the tray).
- Live visualizers drawn in the theme's colours: Halo (ring around the artwork), Bars, Dots and Wave, shown on a dark stage made from the cover in the Now playing panel so they read on any artwork; real-time equalizer bars on the playing row; the aurora background pulses with the bass.
- Crossfade (0–12 s), autoplay radio when the queue runs out, drag-to-reorder queue with a full-page view.
- Stats: 12-month calendar, totals with period-over-period change, listening-time chart, top songs and artists, weekday × hour heatmap, streaks, sessions, skips, discoveries, listener profile, history.
- Wrapped any time: animated story slides for this month, last month, this year, the last 12 months or all time, plus a shareable PNG.
- Home: "On this day last year" (falling back to 6 / 3 / 1 months ago for young histories) and "Forgotten favorites".
- Command palette (`Ctrl+K`), keyboard shortcuts (`?`), JSON backup / restore.

Downloading from YouTube may conflict with YouTube's Terms of Service; keep it to personal use.

## License

[MIT](LICENSE) for UPlayer's own code. Dependencies keep their own licenses: youtubei.js and Electron are MIT, the bundled fonts are OFL-1.1, and yt-dlp (downloaded on first run and bundled into the installer) is Unlicense.
