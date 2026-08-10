export interface ElectronShellAPI {
  isElectron: true;
  revealRecordingsFolder: () => Promise<void>;
  pickOutputDirectory: () => Promise<string | null>;
  setOverlayMode: (opts: {
    width: number;
    height: number;
    left: number;
    top: number;
    topmost?: boolean;
  }) => Promise<{ ok: boolean }>;
  restoreWindow: (opts: {
    width: number;
    height: number;
    left: number;
    top: number;
  }) => Promise<{ ok: boolean }>;
}

export function getElectronShell(): ElectronShellAPI | null {
  const api = (window as unknown as { electronAPI?: ElectronShellAPI }).electronAPI;
  return api?.isElectron ? api : null;
}

export function isElectronShell(): boolean {
  return getElectronShell() != null;
}
