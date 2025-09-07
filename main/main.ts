import { app, BrowserWindow, ipcMain, shell, dialog } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import fse from 'fs-extra';
import { debounce } from 'lodash';
import { createImageWatcher, stopImageWatcher } from './watcher';
import { scanImages } from './scanner';
import { getMetadataForFile } from './metadata';
import { ensureSettings, getSettings, saveSettings } from './settings';
import { makeThumbnail } from './thumbnails';
import { getFavorites, isFavorite, toggleFavorite } from './favorites';

let mainWindow: BrowserWindow | null = null;

const isDev = !app.isPackaged;

async function loadRenderer(win: BrowserWindow) {
    const devUrl =
        process.env.ELECTRON_RENDERER_URL ||
        process.env.VITE_DEV_SERVER_URL ||
        'http://localhost:5173/';
    if (isDev) {
        await win.loadURL(devUrl);
    } else {
        const indexPath = path.join(__dirname, '../../.vite/build/renderer/index.html');
        await win.loadFile(indexPath);
    }
}

async function createWindow() {
    await ensureSettings();

    mainWindow = new BrowserWindow({
        width: 1280,
        height: 900,
        backgroundColor: '#111827',
        show: true, // show immediately
        webPreferences: {
            preload: path.resolve(__dirname, '../preload/preload.cjs'),
            nodeIntegration: false,
            contextIsolation: true,
            sandbox: false,
            devTools: true, // allow manual open
            webSecurity: false,
        },
    });

    // safety: if ready-to-show fires, ensure visible
    mainWindow.once('ready-to-show', () => {
        if (!mainWindow?.isVisible()) mainWindow?.show();
        mainWindow?.focus();
    });

    // fallback: force-show after 1s
    setTimeout(() => {
        if (mainWindow && !mainWindow.isVisible()) {
            mainWindow.show();
            mainWindow.focus();
        }
    }, 1000);

    try {
        await loadRenderer(mainWindow);
    } catch (err) {
        const msg = (err as Error)?.message || String(err);
        const html = `<html><body style="font-family:system-ui;background:#111;color:#eee;padding:20px">
      <h2>Failed to load renderer</h2>
      <pre>${msg.replace(/[<>&]/g, s => ({'<':'&lt;','>':'&gt;','&':'&amp;'} as any)[s])}</pre>
      <p>Dev server should be at: <code>${process.env.ELECTRON_RENDERER_URL || process.env.VITE_DEV_SERVER_URL || 'http://localhost:5173/'}</code></p>
    </body></html>`;
        await mainWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
    }

    // ⛔ Don’t auto-open DevTools unless explicitly requested
    if (isDev && process.env.DEBUG_DEVTOOLS === '1') {
        mainWindow.webContents.openDevTools({ mode: 'detach' });
    }

    mainWindow.on('closed', () => {
        mainWindow = null;
        stopImageWatcher();
    });
}

app.whenReady().then(async () => {
    await createWindow();
    app.on('activate', async () => {
        if (BrowserWindow.getAllWindows().length === 0) await createWindow();
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});

/* -------------------------
   Settings (new + aliases)
-------------------------- */
ipcMain.handle('settings:get', async () => getSettings());
ipcMain.handle('settings:save', async (_e, s) => saveSettings(s));
ipcMain.handle('dialog:pickFolder', async () => {
    const res = await dialog.showOpenDialog({ properties: ['openDirectory'] });
    return res.canceled || !res.filePaths.length ? '' : res.filePaths[0];
});
ipcMain.handle('settings:set', async (_e, s) => saveSettings(s)); // alias
ipcMain.handle('settings:pick-folder', async () => {              // alias
    const res = await dialog.showOpenDialog({ properties: ['openDirectory'] });
    return res.canceled || !res.filePaths.length ? '' : res.filePaths[0];
});

/* -------------------------
   Scan & Watch (new + alias)
-------------------------- */
ipcMain.handle('images:scan', async (_e, rootPath: string) => scanImages(rootPath));
ipcMain.handle('images:watch:start', async (_e, rootPath: string) => {
    const sendEvent = debounce((payload: any) => {
        mainWindow?.webContents.send('images:watch:event', payload);
    }, 50);
    return createImageWatcher(
        rootPath,
        (evt: 'add' | 'unlink' | 'change', file: string) => sendEvent({ evt, file })
    );
});
ipcMain.handle('images:watch:stop', async () => stopImageWatcher());
ipcMain.handle('scanner:scan', async (_e, rootPath: string) => scanImages(rootPath)); // alias

/* -------------------------
   Metadata & Thumbnails
-------------------------- */
ipcMain.handle('image:metadata', async (_e, filePath: string) => getMetadataForFile(filePath));
ipcMain.handle('image:thumbnail', async (_e, filePath: string, maxSize: number) => {
    const thumbPath = await makeThumbnail(filePath, maxSize);
    return thumbPath;
});

/* -------------------------
   Favorites
-------------------------- */
ipcMain.handle('favorites:toggle', async (_e, filePath: string) => toggleFavorite(filePath));
ipcMain.handle('favorites:is', async (_e, filePath: string) => isFavorite(filePath));
ipcMain.handle('favorites:list', async () => getFavorites());

/* -------------------------
   File operations
-------------------------- */
ipcMain.handle('file:openInExplorer', async (_e, filePath: string) => {
    shell.showItemInFolder(filePath);
    return true;
});
ipcMain.handle('file:copyPath', async (_e, filePath: string) => {
    const { clipboard } = require('electron');
    clipboard.writeText(filePath);
    return true;
});
ipcMain.handle('file:exportMetadata', async (_e, filePath: string, metaText: string) => {
    const dir = path.dirname(filePath);
    const base = path.basename(filePath, path.extname(filePath));
    const target = path.join(dir, `${base}.metadata.txt`);
    await fse.writeFile(target, metaText, 'utf8');
    return target;
});
ipcMain.handle('file:delete', async (_e, filePaths: string[]) => {
    for (const p of filePaths) {
        try {
            await shell.trashItem(p);
        } catch {
            if (fs.existsSync(p)) await fse.remove(p);
        }
    }
    return true;
});
ipcMain.handle('file:move', async (_e, filePaths: string[], targetDir: string) => {
    await fse.ensureDir(targetDir);
    for (const p of filePaths) {
        const base = path.basename(p);
        await fse.move(p, path.join(targetDir, base), { overwrite: false });
    }
    return true;
});
