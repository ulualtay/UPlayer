import { useEffect, useRef } from 'react';
import { Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { MotionConfig } from 'motion/react';
import { setNavigate, toggleLike } from './lib/actions';
import { artistsText } from './lib/format';
import { controls } from './player/controls';
import { mountEngine } from './player/engine';
// starts the spectrum loop that drives the visualizers and the --beat / --eq CSS variables
import './lib/audio';
import { useDownloads } from './store/downloads';
import { watchPendingAdds } from './store/pendingAdds';
import { usePlayback, usePlayer } from './store/player';
import { useSettings } from './store/settings';
import { useUI } from './store/ui';
import { Backdrop, ThemeController } from './components/ThemeController';
import { TopBar } from './components/TopBar';
import { Sidebar } from './components/Sidebar';
import { RightPanel } from './components/RightPanel';
import { PlayerBar } from './components/PlayerBar';
import { FullscreenPlayer } from './components/FullscreenPlayer';
import { ContextMenu, ShortcutsDialog, Toasts } from './components/Overlays';
import { CommandPalette } from './components/CommandPalette';
import { StyleOnboarding } from './components/StylePicker';
import { TooltipLayer } from './components/ui';
import { HomePage } from './pages/Home';
import { SearchPage } from './pages/Search';
import { AlbumPage, LikedPage, PlaylistPage, YtPlaylistPage } from './pages/Collection';
import { ArtistPage } from './pages/Artist';
import { QueuePage } from './pages/QueuePage';
import { SettingsPage } from './pages/Settings';
import { StatsPage } from './pages/Stats';
import { DownloadsPage } from './pages/Downloads';
import { WrappedPage } from './pages/Wrapped';

export function App() {
  const navigate = useNavigate();
  useEffect(() => setNavigate(navigate), [navigate]);
  useEffect(() => {
    mountEngine();
    // before connecting, so the first snapshot can restart downloads waiting for a playlist
    watchPendingAdds();
    useDownloads.getState().connect();
  }, []);
  useShortcuts();
  useDesktopBridge();
  const reduceMotion = useSettings((s) => s.reduceMotion);

  return (
    <MotionConfig reducedMotion={reduceMotion ? 'always' : 'user'}>
      <ThemeController />
      <Backdrop />
      <div className="relative z-[1] flex h-full flex-col gap-[var(--gap)] p-[var(--gap)] pt-1">
        <TopBar />
        <div className="flex min-h-0 flex-1 gap-[var(--gap)]">
          <Sidebar />
          <Main />
          <RightPanel />
        </div>
        <PlayerBar />
      </div>
      <FullscreenPlayer />
      <ContextMenu />
      <Toasts />
      <CommandPalette />
      <ShortcutsDialog />
      <StyleOnboarding />
      <TooltipLayer />
    </MotionConfig>
  );
}

/**
 * Desktop app only: the top bar doubles as the title bar, the tray menu and
 * taskbar buttons drive playback, and the main process learns what's playing
 * plus the close-to-tray / open-at-login preferences.
 */
function useDesktopBridge() {
  useEffect(() => {
    const bridge = window.uplayer;
    if (!bridge) return;
    document.documentElement.classList.add('desktop');
    const offCommand = bridge.onTrayCommand((cmd) => {
      if (cmd === 'toggle') controls.toggle();
      else if (cmd === 'next') void usePlayer.getState().next();
      else if (cmd === 'prev') usePlayer.getState().prev(usePlayback.getState().position);
    });
    const pushNowPlaying = () => {
      const cur = usePlayer.getState().current;
      bridge.nowPlaying({ title: cur?.track.title ?? '', artist: cur ? artistsText(cur.track) : '', playing: usePlayback.getState().playing });
    };
    const pushPrefs = () => {
      const s = useSettings.getState();
      bridge.setDesktopPrefs({ closeToTray: s.closeToTray, openAtLogin: s.openAtLogin });
    };
    pushNowPlaying();
    pushPrefs();
    const offs = [
      usePlayer.subscribe((s, p) => s.current?.uid !== p.current?.uid && pushNowPlaying()),
      usePlayback.subscribe((s, p) => s.playing !== p.playing && pushNowPlaying()),
      useSettings.subscribe((s, p) => (s.closeToTray !== p.closeToTray || s.openAtLogin !== p.openAtLogin) && pushPrefs()),
    ];
    return () => {
      offCommand();
      offs.forEach((off) => off());
    };
  }, []);
}

function Main() {
  const ref = useRef<HTMLDivElement>(null);
  const { pathname } = useLocation();
  const raf = useRef(0);

  useEffect(() => {
    ref.current?.scrollTo({ top: 0 });
    useUI.setState({ scrollY: 0 });
  }, [pathname]);

  return (
    <main className="panel relative min-w-0 flex-1 overflow-hidden">
      <div
        ref={ref}
        // grids size themselves to this panel (it changes with the sidebars), not to the window
        className="scroll-area @container h-full"
        onScroll={(e) => {
          const y = e.currentTarget.scrollTop;
          cancelAnimationFrame(raf.current);
          raf.current = requestAnimationFrame(() => useUI.setState({ scrollY: y }));
        }}
      >
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/search" element={<SearchPage />} />
          <Route path="/search/:q" element={<SearchPage />} />
          <Route path="/liked" element={<LikedPage />} />
          <Route path="/downloads" element={<DownloadsPage />} />
          <Route path="/wrapped" element={<WrappedPage />} />
          <Route path="/playlist/:id" element={<PlaylistPage />} />
          <Route path="/album/:id" element={<AlbumPage />} />
          <Route path="/yt/:id" element={<YtPlaylistPage />} />
          <Route path="/artist/:id" element={<ArtistPage />} />
          <Route path="/queue" element={<QueuePage />} />
          <Route path="/stats" element={<StatsPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="*" element={<HomePage />} />
        </Routes>
      </div>
    </main>
  );
}

function useShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const typing = target.closest('input, textarea, select, [contenteditable="true"]');
      const ui = useUI.getState();
      const ctrl = e.ctrlKey || e.metaKey;

      if (ctrl && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        ui.setPalette(!ui.palette);
        return;
      }
      if (typing || ui.palette || e.altKey) return;

      const p = usePlayer.getState();
      const pb = usePlayback.getState();
      const settings = useSettings.getState();
      const onControl = target.closest('button, [role="slider"], [role="row"], a');

      switch (e.key) {
        case ' ':
          if (onControl) return; // let buttons handle their own activation
          e.preventDefault();
          controls.toggle();
          break;
        case 'ArrowRight':
          if (target.closest('[role="slider"]')) return;
          e.preventDefault();
          if (ctrl) void p.next();
          else controls.seek(Math.min(pb.duration, pb.position + 5));
          break;
        case 'ArrowLeft':
          if (target.closest('[role="slider"]')) return;
          e.preventDefault();
          if (ctrl) p.prev(pb.position);
          else controls.seek(Math.max(0, pb.position - 5));
          break;
        case 'ArrowUp':
          if (!ctrl) return;
          e.preventDefault();
          p.setVolume(p.volume + 5);
          break;
        case 'ArrowDown':
          if (!ctrl) return;
          e.preventDefault();
          p.setVolume(p.volume - 5);
          break;
        default: {
          if (ctrl) return;
          const k = e.key.toLowerCase();
          if (k === 'm') p.toggleMute();
          else if (k === 's') p.toggleShuffle();
          else if (k === 'r') p.cycleRepeat();
          else if (k === 'l' && p.current) toggleLike(p.current.track);
          else if (k === 'f') ui.setFullscreen(!ui.fullscreen);
          else if (k === 'q') settings.toggleRight('queue');
          else if (k === 'y') settings.toggleRight('lyrics');
          else if (k === '?') ui.setShortcuts(!ui.shortcuts);
          else if (k === '/') {
            e.preventDefault();
            window.dispatchEvent(new Event('uplayer:focus-search'));
          } else return;
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}
