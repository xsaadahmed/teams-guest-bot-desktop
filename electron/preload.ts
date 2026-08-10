import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: true,
  revealRecordingsFolder: (): Promise<void> => ipcRenderer.invoke('reveal-recordings-folder'),
  pickOutputDirectory: (): Promise<string | null> => ipcRenderer.invoke('pick-output-directory'),
  setOverlayMode: (opts: {
    width: number;
    height: number;
    left: number;
    top: number;
    topmost?: boolean;
  }): Promise<{ ok: boolean }> => ipcRenderer.invoke('window-set-overlay', opts),
  restoreWindow: (opts: {
    width: number;
    height: number;
    left: number;
    top: number;
  }): Promise<{ ok: boolean }> => ipcRenderer.invoke('window-restore', opts),
});
