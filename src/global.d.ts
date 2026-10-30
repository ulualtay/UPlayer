interface Window {
  /** present only inside the Electron desktop app (see electron/preload.ts) */
  uplayer?: {
    desktop: true;
    setTitleBar: (bg: string, fg: string) => void;
    nowPlaying: (info: { title: string; artist: string; playing: boolean }) => void;
    setDesktopPrefs: (prefs: { closeToTray: boolean; openAtLogin: boolean }) => void;
    onTrayCommand: (cb: (cmd: 'toggle' | 'next' | 'prev') => void) => () => void;
  };
}
