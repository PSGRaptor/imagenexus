import { app, BrowserWindow, ipcMain, dialog, shell, nativeTheme } from 'electron';
import path from 'path';
import fs from 'fs-extra';
import debounce from 'lodash.debounce';
import chokidar from 'chokidar';
import { readSettings, writeSettings, getFavorites, setFavorite, getThumbDir } from './userSettings';
import { scanImages } from './fileScanner';
import { ensureThumbnail } from './thumbnailer';
import { readMetadata } from './metadata';
import type { ImageItem, UserSettings, ScanResult } from './types';

let win: BrowserWindow | null = null;
let settings: UserSettings;
let images: ImageItem[] = [];
let watcher: chokidar.FSWatcher | null = null;

// Use Electron's built-in flag; no electron-is-dev needed
function isDev() {
    return !app.isPackaged;
}

async function createWindow() {
    settings = await readSettings();
    win = new BrowserWindow({
        width: 1300,
        height: 900,
        backgroundColor: '#111827',
        webPreferences: {
            preload: path.join(__dirname, '../preload/preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true
        },
        show: false
    });

    nativeTheme.themeSource = settings.theme === 'dark' ? 'dark' : 'light';

    const url = isDev()
        ? 'http://localhost:5173'
        : `file://${path.join(process.cwd(), 'dist', 'renderer', 'index.html')}`;

    await win.loadURL(url);
    win.once('ready-to-show', () => win?.show());

    if (isDev()) win.webContents.openDevTools({ mode: 'detach' });
}

app.whenReady().then(async () => {
    await createWindow();

    // Initial scan
    images = await scanImages(await readSettings());
    injectFavorites(images, await getFavorites());
    win?.webContents.send('images:changed');

    if (settings.watch) startWatcher();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});

function injectFavorites(list: ImageItem[], favs: Record<string, boolean>) {
    for (const im of list) im.favorite = !!favs[im.path];
}

async function startWatcher() {
    if (!settings.activeRoot) return;
    if (watcher) await watcher.close();

    watcher = chokidar.watch(settings.activeRoot, {
        ignored: settings.ignorePatterns,
        ignoreInitial: true,
        awaitWriteFinish: { stabilityThreshold: 400, pollInterval: 100 }
    });

    const refresh = debounce(async () => {
        images = await scanImages(settings);
        injectFavorites(images, await getFavorites());
        win?.webContents.send('images:changed');
    }, 500);

    watcher.on('add', refresh).on('unlink', refresh).on('change', refresh);
}

async function stopWatcher() {
    if (watcher) {
        await watcher.close();
        watcher = null;
    }
}

/** IPC Handlers */

ipcMain.handle('settings:get', async () => {
    settings = await readSettings();
    return settings;
});

ipcMain.handle('settings:set', async (_e, s: UserSettings) => {
    settings = s;
    await writeSettings(s);
    if (s.watch) await startWatcher();
    else await stopWatcher();
    return;
});

ipcMain.handle('settings:pick-folder', async () => {
    if (!win) return null;
    const res = await dialog.showOpenDialog(win, { properties: ['openDirectory'] });
    if (res.canceled || res.filePaths.length === 0) return null;
    return res.filePaths[0];
});

ipcMain.handle('scanner:scan', async (): Promise<ScanResult> => {
    settings = await readSettings();
    images = await scanImages(settings);
    injectFavorites(images, await getFavorites());
    return { images, total: images.length };
});

ipcMain.handle('watcher:start', async () => startWatcher());
ipcMain.handle('watcher:stop', async () => stopWatcher());

ipcMain.handle('image:metadata', async (_e, filePath: string) => {
    return readMetadata(filePath);
});

ipcMain.handle('image:thumbnail', async (_e, filePath: string) => {
    const thDir = getThumbDir();
    const out = await ensureThumbnail(thDir, filePath, settings.thumbnail.width, settings.thumbnail.quality);
    return out;
});

ipcMain.handle('image:open', async (_e, filePath: string) => {
    shell.showItemInFolder(filePath);
});

ipcMain.handle('image:copy', async (_e, _filePath: string) => {
    return;
});

ipcMain.handle('image:export-meta', async (_e, filePath: string) => {
    const meta = await readMetadata(filePath);
    const out = filePath + '.metadata.txt';
    const lines: string[] = [];
    if (meta.prompt) lines.push(`Prompt: ${meta.prompt}`);
    if (meta.negative) lines.push(`Negative: ${meta.negative}`);
    if (meta.model) lines.push(`Model: ${meta.model}`);
    if (meta.sampler) lines.push(`Sampler: ${meta.sampler}`);
    if (meta.steps !== undefined) lines.push(`Steps: ${meta.steps}`);
    if (meta.cfgScale !== undefined) lines.push(`CFG: ${meta.cfgScale}`);
    if (meta.seed !== undefined) lines.push(`Seed: ${meta.seed}`);
    if (meta.size) lines.push(`Size: ${meta.size}`);
    lines.push('');
    lines.push('--- RAW ---');
    lines.push(typeof meta.raw === 'string' ? meta.raw : JSON.stringify(meta.raw ?? meta.other ?? {}, null, 2));
    await fs.writeFile(out, lines.join('\n'), 'utf8');
    return out;
});

ipcMain.handle('image:fav', async (_e, filePath: string, fav: boolean) => {
    await setFavorite(filePath, fav);
    const f = await getFavorites();
    injectFavorites(images, f);
    win?.webContents.send('images:changed');
});

ipcMain.handle('image:move', async (_e, files: string[], dest: string) => {
    await fs.ensureDir(dest);
    for (const f of files) {
        const base = path.basename(f);
        await fs.move(f, path.join(dest, base), { overwrite: false });
    }
    const fMapPath = path.join(process.cwd(), 'config', 'favorites.json');
    const json = await fs.readJSON(fMapPath).catch(() => ({ favorites: {} as Record<string, boolean> }));
    for (const k of files) delete json.favorites[k];
    await fs.writeJSON(fMapPath, json, { spaces: 2 });
    win?.webContents.send('images:changed');
});

ipcMain.handle('image:delete', async (_e, files: string[]) => {
    try {
        const trashMod = await import('trash');
        await (trashMod as any).default(files);
    } catch {
        const bin = path.join(settings.activeRoot || process.cwd(), '.nexus-trash');
        await fs.ensureDir(bin);
        for (const f of files) {
            const base = path.basename(f);
            await fs.move(f, path.join(bin, base), { overwrite: true });
        }
    }
    const fMapPath = path.join(process.cwd(), 'config', 'favorites.json');
    const json = await fs.readJSON(fMapPath).catch(() => ({ favorites: {} as Record<string, boolean> }));
    for (const k of files) delete json.favorites[k];
    await fs.writeJSON(fMapPath, json, { spaces: 2 });
    win?.webContents.send('images:changed');
});
