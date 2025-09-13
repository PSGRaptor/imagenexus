// FILE: main/preload.ts
import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('api', {
    // Settings
    getSettings: () => ipcRenderer.invoke('settings:get'),
    saveSettings: (s: unknown) => ipcRenderer.invoke('settings:save', s),
    setSettings: (s: unknown) => ipcRenderer.invoke('settings:save', s), // alias

    // Folders
    pickFolder: () => ipcRenderer.invoke('dialog:pickFolder'),
    pickFolderLegacy: () => ipcRenderer.invoke('settings:pick-folder'),

    // Scan & Watch
    scanImages: (rootPath: string) => ipcRenderer.invoke('images:scan', rootPath),
    startWatch: (rootPath: string) => ipcRenderer.invoke('images:watch:start', rootPath),
    stopWatch: () => ipcRenderer.invoke('images:watch:stop'),
    onWatchEvent: (cb: (payload: { evt: 'add' | 'unlink' | 'change'; file: string }) => void) => {
        const channel = 'images:watch:event';
        const handler = (_: unknown, payload: any) => cb(payload);
        ipcRenderer.on(channel, handler);
        return () => ipcRenderer.removeListener(channel, handler);
    },

    // Metadata & Thumbnails
    getMetadata: (filePath: string) => ipcRenderer.invoke('image:metadata', filePath),
    // NEW: write metadata back to the image (atomic)
    setMetadata: (filePath: string, patch: Record<string, unknown>) =>
        ipcRenderer.invoke('image:metadata:set', filePath, patch),

    getThumbnail: (filePath: string, maxSize: number) =>
        ipcRenderer.invoke('image:thumbnail', filePath, maxSize),
    getImageDataUrl: (filePath: string) =>
        ipcRenderer.invoke('image:readAsDataUrl', filePath),

    // Favorites
    toggleFavorite: (filePath: string) => ipcRenderer.invoke('favorites:toggle', filePath),
    isFavorite: (filePath: string) => ipcRenderer.invoke('favorites:is', filePath),
    listFavorites: () => ipcRenderer.invoke('favorites:list'),

    // File ops
    openInExplorer: (filePath: string) => ipcRenderer.invoke('file:openInExplorer', filePath),
    copyPath: (filePath: string) => ipcRenderer.invoke('file:copyPath', filePath),
    exportMetadata: (filePath: string, text: string) =>
        ipcRenderer.invoke('file:exportMetadata', filePath, text),
    deleteFiles: (paths: string[]) => ipcRenderer.invoke('file:delete', paths),
    moveFiles: (paths: string[], targetDir: string) =>
        ipcRenderer.invoke('file:move', paths, targetDir),

    // Utility
    shellOpenExternal: (url: string) => ipcRenderer.invoke('shell:openExternal', url),

    deleteFile: async (path: string) => {
        try {
            const ok = await ipcRenderer.invoke('fs:delete', path);
            return { ok: !!ok };
        } catch (e: any) {
            return { ok: false, error: e?.message || String(e) };
        }
    },
});
