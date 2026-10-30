import { contextBridge, ipcRenderer } from 'electron';

type TrayCommand = 'toggle' | 'next' | 'prev';

contextBridge.exposeInMainWorld('uplayer', {
  desktop: true,
  setTitleBar: (bg: string, fg: string) => ipcRenderer.send('titlebar', bg, fg),
  nowPlaying: (info: { title: string; artist: string; playing: boolean }) => ipcRenderer.send('now-playing', info),
  setDesktopPrefs: (prefs: { closeToTray: boolean; openAtLogin: boolean }) => ipcRenderer.send('desktop-prefs', prefs),
  onTrayCommand: (cb: (cmd: TrayCommand) => void) => {
    const handler = (_e: unknown, cmd: TrayCommand) => cb(cmd);
    ipcRenderer.on('tray-command', handler);
    return () => {
      ipcRenderer.removeListener('tray-command', handler);
    };
  },
});
