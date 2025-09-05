import { contextBridge, ipcRenderer, shell, clipboard } from 'electron';
import type { ImageItem, ImageMetadata, UserSettings, ScanResult } from './types';

contextBridge.exposeInMainWorld('api', {
    getSettings: (): Promise<UserSettings> => ipcRenderer.invoke('settings:get'),
    setSettings: (s: UserSettings): Promise<void> => ipcRenderer.invoke('settings:set', s),
    pickFolder: (): Promise<string | null> => ipcRenderer.invoke('settings:pick-folder'),

    scan: (): Promise<ScanResult> => ipcRenderer.invoke('scanner:scan'),
    startWatch: (): Promise<void> => ipcRenderer.invoke('watcher:start'),
    stopWatch: (): Promise<void> => ipcRenderer.invoke('watcher:stop'),
    onImagesChanged: (cb: () => void) => {
        ipcRenderer.removeAllListeners('images:changed');
        ipcRenderer.on('images:changed', cb);
    },

    getMetadata: (filePath: string): Promise<ImageMetadata> => ipcRenderer.invoke('image:metadata', filePath),
    getThumbnail: (filePath: string): Promise<string> => ipcRenderer.invoke('image:thumbnail', filePath),
    openInExplorer: (filePath: string) => ipcRenderer.invoke('image:open', filePath),
    copyPath: (filePath: string) => ipcRenderer.invoke('image:copy', filePath),
    exportMetadata: (filePath: string): Promise<string> => ipcRenderer.invoke('image:export-meta', filePath),
    setFavorite: (filePath: string, fav: boolean): Promise<void> => ipcRenderer.invoke('image:fav', filePath, fav),
    batchMove: (files: string[], dest: string): Promise<void> => ipcRenderer.invoke('image:move', files, dest),
    batchDelete: (files: string[]): Promise<void> => ipcRenderer.invoke('image:delete', files),

    // Clipboard helpers (renderer-safe fallbacks)
    writeText: (text: string) => clipboard.writeText(text),
    shellOpenExternal: (url: string) => shell.openExternal(url)
});
