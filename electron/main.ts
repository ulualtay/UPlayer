// Electron main process: runs the API + static server in-process and shows
// the UI in a frameless-looking window whose controls follow the theme.
// Closing the window hides it to the system tray so music keeps playing.

import { app, BrowserWindow, ipcMain, Menu, nativeImage, screen, session, shell, Tray, type NativeImage } from 'electron';
import path from 'node:path';
import fs from 'node:fs';

// localStorage is keyed by origin, so the port must stay the same between runs.
const PORT = 47821;
const HOST = '127.0.0.1';
const TITLEBAR_HEIGHT = 60;
/** launched by Windows at sign-in: start quietly in the tray */
const startHidden = process.argv.includes('--hidden');

// Plain Chrome UA: some Google endpoints treat Electron's UA differently.
app.userAgentFallback = app.userAgentFallback.replace(/ Electron\/\S+/, '').replace(/ uplayer\/\S+/i, '');
app.setAppUserModelId('com.uplayer.app');

let win: BrowserWindow | null = null;
let tray: Tray | null = null;
let quitting = false;

// ---------- diagnostics: a small log in the user-data folder ----------

function log(...parts: unknown[]) {
  try {
    const file = path.join(app.getPath('userData'), 'main.log');
    if (fs.existsSync(file) && fs.statSync(file).size > 512_000) fs.rmSync(file);
    fs.appendFileSync(file, `[${new Date().toISOString()}] ${parts.map((p) => (p instanceof Error ? p.stack : typeof p === 'string' ? p : JSON.stringify(p))).join(' ')}\n`);
  } catch {
    /* logging must never take the app down */
  }
}
// the in-process server reports problems (search, streaming, downloads) on console.warn/error
for (const level of ['warn', 'error'] as const) {
  const original = console[level].bind(console);
  console[level] = (...args: unknown[]) => {
    log(...args);
    original(...args);
  };
}
process.on('uncaughtException', (err) => log('uncaughtException', err));
process.on('unhandledRejection', (err) => log('unhandledRejection', err));
process.on('exit', (code) => log('exit', code));
// Chromium writes localStorage lazily; make sure nothing is left in memory
const flushStorage = () => {
  try {
    if (app.isReady()) session.defaultSession.flushStorageData();
  } catch {
    /* best effort */
  }
};
app.on('before-quit', () => {
  quitting = true;
  flushStorage();
  log('before-quit');
});
app.on('child-process-gone', (_e, d) => log('child-process-gone', d));
app.on('render-process-gone', (_e, _wc, d) => log('render-process-gone', d));

// ---------- desktop preferences (mirrored from the renderer's settings) ----------

interface Prefs {
  closeToTray: boolean;
  openAtLogin: boolean;
  trayHintShown: boolean;
  /** the theme's background and text colours last time, so the window opens in them */
  lastBg?: string;
  lastFg?: string;
}
const prefsFile = () => path.join(app.getPath('userData'), 'desktop.json');
let prefs: Prefs = { closeToTray: true, openAtLogin: false, trayHintShown: false };
function loadPrefs() {
  try {
    prefs = { ...prefs, ...(JSON.parse(fs.readFileSync(prefsFile(), 'utf8')) as Partial<Prefs>) };
  } catch {
    /* first run */
  }
}
function savePrefs() {
  try {
    fs.writeFileSync(prefsFile(), JSON.stringify(prefs));
  } catch {
    /* non-fatal */
  }
}

if (!app.requestSingleInstanceLock()) {
  log('another instance is running; quitting');
  app.quit();
} else {
  app.on('second-instance', () => showWindow());
  app.whenReady().then(boot).catch((err) => {
    log('boot failed', err);
    app.quit();
  });
}

// ---------- window state ----------

interface WinState {
  width: number;
  height: number;
  x?: number;
  y?: number;
  maximized?: boolean;
}
const stateFile = () => path.join(app.getPath('userData'), 'window-state.json');

function loadState(): WinState {
  try {
    const s = JSON.parse(fs.readFileSync(stateFile(), 'utf8')) as WinState;
    // ignore positions from a monitor that is no longer connected
    if (s.x !== undefined && s.y !== undefined) {
      const visible = screen.getAllDisplays().some((d) => {
        const b = d.workArea;
        return s.x! >= b.x - 50 && s.y! >= b.y - 50 && s.x! < b.x + b.width && s.y! < b.y + b.height;
      });
      if (!visible) {
        delete s.x;
        delete s.y;
      }
    }
    return s;
  } catch {
    return { width: 1440, height: 900 };
  }
}

function saveState(w: BrowserWindow) {
  try {
    const b = w.getNormalBounds();
    fs.writeFileSync(stateFile(), JSON.stringify({ ...b, maximized: w.isMaximized() }));
  } catch {
    /* non-fatal */
  }
}

function showWindow() {
  if (!win) return;
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
  updateThumbar();
}

// ---------- tray & taskbar ----------

let nowPlaying = { title: '', artist: '', playing: false };
const asset = (name: string) => path.join(__dirname, name);
let glyphs: Record<'play' | 'pause' | 'next' | 'prev', NativeImage> | null = null;

const sendCommand = (cmd: 'toggle' | 'next' | 'prev') => win?.webContents.send('tray-command', cmd);

function quitApp() {
  quitting = true;
  app.quit();
}

function createTray() {
  const icon = nativeImage.createFromPath(asset('icon.png')).resize({ width: 32, height: 32, quality: 'best' });
  tray = new Tray(icon);
  tray.on('click', () => (win?.isVisible() && win.isFocused() ? win.hide() : showWindow()));
  updateTray();
}

function updateTray() {
  if (!tray) return;
  const label = nowPlaying.title ? `${nowPlaying.title} — ${nowPlaying.artist}` : 'Nothing playing';
  tray.setToolTip(nowPlaying.title ? `UPlayer\n${label}`.slice(0, 127) : 'UPlayer');
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: label.length > 60 ? `${label.slice(0, 59)}…` : label, enabled: false },
      { type: 'separator' },
      { label: nowPlaying.playing ? 'Pause' : 'Play', click: () => sendCommand('toggle'), enabled: !!nowPlaying.title },
      { label: 'Next', click: () => sendCommand('next'), enabled: !!nowPlaying.title },
      { label: 'Previous', click: () => sendCommand('prev'), enabled: !!nowPlaying.title },
      { type: 'separator' },
      { label: 'Show UPlayer', click: showWindow },
      { label: 'Quit UPlayer', click: quitApp },
    ]),
  );
}

/** Previous / play-pause / next buttons on the taskbar thumbnail. */
function updateThumbar() {
  if (!win || process.platform !== 'win32' || !win.isVisible()) return;
  glyphs ??= {
    play: nativeImage.createFromPath(asset('thumb-play.png')),
    pause: nativeImage.createFromPath(asset('thumb-pause.png')),
    next: nativeImage.createFromPath(asset('thumb-next.png')),
    prev: nativeImage.createFromPath(asset('thumb-prev.png')),
  };
  const off = nowPlaying.title ? [] : (['disabled'] as const);
  win.setThumbarButtons([
    { tooltip: 'Previous', icon: glyphs.prev, flags: [...off], click: () => sendCommand('prev') },
    { tooltip: nowPlaying.playing ? 'Pause' : 'Play', icon: nowPlaying.playing ? glyphs.pause : glyphs.play, flags: [...off], click: () => sendCommand('toggle') },
    { tooltip: 'Next', icon: glyphs.next, flags: [...off], click: () => sendCommand('next') },
  ]);
}

function applyLoginItem() {
  // the portable build runs from a temp folder; register the real exe instead
  const exe = process.env.PORTABLE_EXECUTABLE_FILE || process.execPath;
  app.setLoginItemSettings({ openAtLogin: prefs.openAtLogin, path: exe, args: ['--hidden'] });
}

// ---------- boot ----------

const isColor = (c: unknown): c is string => typeof c === 'string' && /^#[0-9a-f]{3,8}$/i.test(c);

/** Shown the moment the window opens, in the theme's colours, while the app itself loads. */
function splashUrl(bg: string, fg: string): string {
  let icon = '';
  try {
    icon = fs.readFileSync(asset('icon.png')).toString('base64');
  } catch {
    /* text only */
  }
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>
html,body{margin:0;height:100%;background:${bg};color:${fg};font:600 15px "Segoe UI",system-ui,sans-serif;-webkit-app-region:drag;user-select:none}
body{display:grid;place-items:center}
.b{display:flex;flex-direction:column;align-items:center;gap:14px;opacity:.85}
img{width:72px;height:72px;border-radius:18px;animation:p 1.4s ease-in-out infinite}
@keyframes p{50%{transform:scale(.94);opacity:.65}}
</style></head><body><div class="b">${icon ? `<img alt="" src="data:image/png;base64,${icon}">` : ''}<div>UPlayer</div></div></body></html>`;
  return `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;
}

async function boot() {
  loadPrefs();
  const appPath = app.getAppPath();
  // The API server (with youtubei.js, most of this bundle) loads while the window is already up.
  const server = import('../server/app.ts').then(({ startServer }) =>
    startServer({
      dev: false,
      root: appPath,
      distDir: path.join(appPath, 'dist'),
      port: PORT,
      host: HOST,
      musicDir: path.join(app.getPath('music'), 'UPlayer'),
      // %APPDATA%\uplayer\backup: library, history and settings as plain files
      dataDir: path.join(app.getPath('userData'), 'backup'),
      ytdlp: {
        // a writable copy so yt-dlp can update itself
        binDir: path.join(app.getPath('userData'), 'bin'),
        bundled: app.isPackaged ? path.join(process.resourcesPath, 'bin', 'yt-dlp.exe') : path.join(appPath, '.tools', 'yt-dlp.exe'),
        // Electron doubles as the Node runtime yt-dlp needs for YouTube's JS challenges
        jsRuntime: process.execPath,
        env: { ELECTRON_RUN_AS_NODE: '1' },
      },
    }),
  );

  const bg = isColor(prefs.lastBg) ? prefs.lastBg : '#000000';
  const fg = isColor(prefs.lastFg) ? prefs.lastFg : '#ffffff';
  const state = loadState();
  win = new BrowserWindow({
    width: state.width,
    height: state.height,
    x: state.x,
    y: state.y,
    minWidth: 980,
    minHeight: 640,
    title: 'UPlayer',
    backgroundColor: bg,
    icon: asset('icon.png'),
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: '#00000000', symbolColor: fg, height: TITLEBAR_HEIGHT },
    show: false,
    webPreferences: {
      preload: asset('preload.cjs'),
      contextIsolation: true,
      sandbox: true,
      // keep playback, crossfades and the queue moving while hidden in the tray
      backgroundThrottling: false,
    },
  });
  if (state.maximized) win.maximize();
  win.once('ready-to-show', () => {
    if (!startHidden) showWindow();
  });
  win.on('show', updateThumbar);
  win.on('close', (e) => {
    if (win) saveState(win);
    if (quitting || !prefs.closeToTray) {
      log('window close');
      return;
    }
    // keep the music going: hide to the tray instead of quitting
    e.preventDefault();
    win?.hide();
    flushStorage();
    if (!prefs.trayHintShown && tray) {
      tray.displayBalloon({
        iconType: 'info',
        title: 'UPlayer keeps playing',
        content: 'The close button hides UPlayer to the tray. Right-click the tray icon to quit, or change this in Settings → Desktop.',
      });
      prefs.trayHintShown = true;
      savePrefs();
    }
  });
  win.on('closed', () => (win = null));

  const origin = `http://${HOST}:${PORT}`;
  // Links leave the app for the default browser; the app itself never navigates away.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith(origin)) {
      e.preventDefault();
      void shell.openExternal(url);
    }
  });

  createTray();
  // the splash paints at once; the window shows on its first frame (ready-to-show)
  void win.loadURL(splashUrl(bg, fg)).catch(() => undefined);
  try {
    await server;
  } catch (err) {
    const { dialog } = await import('electron');
    dialog.showErrorBox('UPlayer could not start', `Port ${PORT} may already be in use.\n\n${(err as Error).message}`);
    app.quit();
    return;
  }
  await win?.loadURL(`${origin}/`);
  log('started', app.getVersion(), startHidden ? '(hidden)' : '');
}

// ---------- IPC ----------

ipcMain.on('titlebar', (_e, bg: string, fg: string) => {
  if (!win || !isColor(bg) || !isColor(fg)) return;
  try {
    win.setTitleBarOverlay({ color: '#00000000', symbolColor: fg, height: TITLEBAR_HEIGHT });
    win.setBackgroundColor(bg);
  } catch {
    /* overlay not supported on this platform */
  }
  // next launch opens straight in these colours
  if (prefs.lastBg !== bg || prefs.lastFg !== fg) {
    prefs.lastBg = bg;
    prefs.lastFg = fg;
    savePrefs();
  }
});

ipcMain.on('now-playing', (_e, info: typeof nowPlaying) => {
  if (!info || typeof info.title !== 'string') return;
  nowPlaying = { title: info.title, artist: String(info.artist ?? ''), playing: !!info.playing };
  updateTray();
  updateThumbar();
});

ipcMain.on('desktop-prefs', (_e, p: Partial<Prefs>) => {
  const before = prefs.openAtLogin;
  if (typeof p?.closeToTray === 'boolean') prefs.closeToTray = p.closeToTray;
  if (typeof p?.openAtLogin === 'boolean') prefs.openAtLogin = p.openAtLogin;
  savePrefs();
  if (before !== prefs.openAtLogin || prefs.openAtLogin) applyLoginItem();
});

// The window only really closes when quitting; with close-to-tray off this ends the app.
app.on('window-all-closed', () => app.quit());
