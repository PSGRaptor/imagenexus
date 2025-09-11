import { app, BrowserWindow, ipcMain, shell, dialog, Menu, nativeTheme } from 'electron';
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

/* -------------------------
   Helpers for renderer load
-------------------------- */
async function loadRenderer(win: BrowserWindow) {
    const devUrl =
        process.env.ELECTRON_RENDERER_URL ||
        process.env.VITE_DEV_SERVER_URL ||
        'http://localhost:5173/';

    if (!app.isPackaged) {
        await win.loadURL(devUrl);
    } else {
        // We are running from: app.asar/.vite/build/main/main.cjs
        // Renderer is at:      app.asar/.vite/build/renderer/index.html
        const indexPath = path.join(__dirname, '../renderer/index.html');
        await win.loadFile(indexPath);
    }
}

/* -------------------------
   Create the window
-------------------------- */
async function createWindow() {
    await ensureSettings();

    mainWindow = new BrowserWindow({
        width: 1280,
        height: 800,
        backgroundColor: '#111827',
        show: true,
        autoHideMenuBar: true,          // 💡 hides native menu bar (Win/Linux)
        // NOTE: macOS always shows a minimal app menu; we remove custom menus below.
        webPreferences: {
            preload: path.resolve(__dirname, '../preload/preload.cjs'),
            nodeIntegration: false,
            contextIsolation: true,
            sandbox: false,
            devTools: isDev,              // ✅ DevTools only in dev
        },
    });

    // Remove any app menu (Win/Linux); macOS will keep a minimal system menu.
    Menu.setApplicationMenu(null);

    // In production, block DevTools openings from any source
    if (!isDev) {
        // Block keyboard shortcuts (F12, Ctrl+Shift+I, Cmd+Alt+I, etc.)
        mainWindow.webContents.on('before-input-event', (event, input) => {
            const isOpenDevtoolsCombo =
                input.key === 'F12' ||
                ((input.control || input.meta) && input.shift && input.key.toUpperCase() === 'I') ||
                (process.platform === 'darwin' && input.meta && input.alt && input.key.toUpperCase() === 'I');
            if (isOpenDevtoolsCombo) event.preventDefault();
        });

        // Block programmatic opens just in case
        mainWindow.webContents.on('devtools-opened', () => {
            mainWindow?.webContents.closeDevTools();
        });

        // Disable right-click “Inspect” in prod
        mainWindow.webContents.on('context-menu', (e) => {
            e.preventDefault();
        });
    }

    // Make sure window is visible and focused
    mainWindow.once('ready-to-show', () => {
        if (!mainWindow?.isVisible()) mainWindow?.show();
        mainWindow?.focus();
    });
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

    // Do NOT auto-open DevTools; allow manual only in dev via shortcuts/menu
    if (isDev && process.env.DEBUG_DEVTOOLS === '1') {
        mainWindow.webContents.openDevTools({ mode: 'detach' });
    }

    mainWindow.on('closed', () => {
        mainWindow = null;
        stopImageWatcher();
    });
}

/* -------------------------
   App lifecycle
-------------------------- */
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
   IPC: Settings
-------------------------- */
ipcMain.handle('settings:get', async () => getSettings());
ipcMain.handle('settings:save', async (_e, s) => saveSettings(s));
ipcMain.handle('dialog:pickFolder', async () => {
    const res = await dialog.showOpenDialog({ properties: ['openDirectory'] });
    return res.canceled || !res.filePaths.length ? '' : res.filePaths[0];
});
ipcMain.handle('settings:set', async (_e, s) => saveSettings(s));
ipcMain.handle('settings:pick-folder', async () => {
    const res = await dialog.showOpenDialog({ properties: ['openDirectory'] });
    return res.canceled || !res.filePaths.length ? '' : res.filePaths[0];
});

/* -------------------------
   IPC: Scan & Watch
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
ipcMain.handle('scanner:scan', async (_e, rootPath: string) => scanImages(rootPath));

/* -------------------------
   IPC: Metadata & Thumbnails
-------------------------- */
ipcMain.handle('image:metadata', async (_e, filePath: string) => getMetadataForFile(filePath));
ipcMain.handle('image:thumbnail', async (_e, filePath: string, maxSize: number) => {
    // Your existing generator returns a thumbnail *file path*
    const thumbPath = await makeThumbnail(filePath, maxSize);

    // Read the file and convert to a data URL (works in dev/prod without file:// issues)
    const buf = await fse.readFile(thumbPath);
    const ext = path.extname(thumbPath).toLowerCase();

    // Pick a MIME type based on the thumbnail extension
    const mime =
        ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' :
            ext === '.webp' ? 'image/webp' :
                ext === '.gif'  ? 'image/gif'  :
                    ext === '.bmp'  ? 'image/bmp'  :
                        /* default */     'image/png';

    return `data:${mime};base64,${buf.toString('base64')}`;
});

ipcMain.handle('image:readAsDataUrl', async (_e, filePath: string) => {
    // Read the original file and return a data URL (works in dev/prod)
    const buf = await fse.readFile(filePath);
    const ext = path.extname(filePath).toLowerCase();
    const mime =
        ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' :
            ext === '.webp' ? 'image/webp' :
                ext === '.gif'  ? 'image/gif'  :
                    ext === '.bmp'  ? 'image/bmp'  :
                        /* default */     'image/png';

    return `data:${mime};base64,${buf.toString('base64')}`;
});

/* -------------------------
   IPC: Favorites
-------------------------- */
ipcMain.handle('favorites:toggle', async (_e, filePath: string) => toggleFavorite(filePath));
ipcMain.handle('favorites:is', async (_e, filePath: string) => isFavorite(filePath));
ipcMain.handle('favorites:list', async () => getFavorites());

/* -------------------------
   IPC: File operations
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

// --- IPC: move file to OS trash (Recycle Bin) ---
ipcMain.handle('fs:delete', async (_evt, filePath: string) => {
    if (typeof filePath !== 'string' || !filePath.trim()) {
        throw new Error('Invalid path');
    }

    const resolved = path.resolve(filePath);
    // Use fs-extra's promise-based stat (NOT node:fs)
    const stat = await fse.stat(resolved);
    if (!stat.isFile()) throw new Error('Refusing to delete non-file');

    // Safer than unlink: moves to Recycle Bin on Windows (Trash on macOS/Linux)
    await shell.trashItem(resolved);
    return true;
});
