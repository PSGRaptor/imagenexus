// START OF FILE: src/main/services/watcher.ts
import chokidar, { FSWatcher } from "chokidar";
import path from "node:path";
import { BrowserWindow, ipcMain } from "electron";
import { statSync } from "node:fs";

let watcher: FSWatcher | null = null;
let currentRoot: string | null = null;

type ImageEventPayload = {
    path: string;
    name: string;
    mtimeMs?: number;
    sizeBytes?: number;
};

function buildPayload(filePath: string): ImageEventPayload | null {
    try {
        const st = statSync(filePath);
        if (!st.isFile()) return null;
        return {
            path: filePath,
            name: path.basename(filePath),
            mtimeMs: st.mtimeMs,
            sizeBytes: st.size,
        };
    } catch {
        return null;
    }
}

export function startWatching(win: BrowserWindow, root: string) {
    // If already watching same root, do nothing (prevents duplicates)
    if (watcher && currentRoot && path.resolve(currentRoot) === path.resolve(root)) {
        return;
    }

    stopWatching(); // stop any existing watcher first

    currentRoot = root;

    // Watch only images; adjust the globs as needed for your supported formats
    const globs = [
        path.join(root, "**/*.{png,PNG,jpg,JPG,jpeg,JPEG,webp,WEBP,bmp,BMP,gif,GIF}"),
    ];

    watcher = chokidar.watch(globs, {
        ignoreInitial: true, // we load initial listing via scan, not watcher
        awaitWriteFinish: { stabilityThreshold: 250, pollInterval: 100 },
        depth: 99,
        followSymlinks: true,
        persistent: true,
        alwaysStat: false,
        ignorePermissionErrors: true,
    });

    // Dedup guard: track paths we've emitted recently
    const recentlyEmitted = new Set<string>();
    const clearAfter = 1000;
    const remember = (p: string) => {
        recentlyEmitted.add(p);
        setTimeout(() => recentlyEmitted.delete(p), clearAfter);
    };

    const sendUpsert = (filePath: string) => {
        if (recentlyEmitted.has(filePath)) return;
        remember(filePath);
        const payload = buildPayload(filePath);
        if (!payload) return;
        win.webContents.send("watcher:upsert", [payload]);
    };

    const sendRemove = (filePath: string) => {
        if (recentlyEmitted.has(filePath)) return;
        remember(filePath);
        win.webContents.send("watcher:remove", [filePath]);
    };

    watcher
        .on("add", sendUpsert)
        .on("change", sendUpsert)
        .on("unlink", sendRemove)
        .on("error", (err) => {
            win.webContents.send("watcher:error", String(err));
        });
}

export function stopWatching() {
    if (watcher) {
        watcher.removeAllListeners();
        watcher.close().catch(() => void 0);
    }
    watcher = null;
    currentRoot = null;
}

// IPC handlers
ipcMain.handle("watcher:start", (e, root: string) => {
    const win = BrowserWindow.fromWebContents(e.sender);
    if (!win) return;
    startWatching(win, root);
});

ipcMain.handle("watcher:stop", () => {
    stopWatching();
});

// END OF FILE: src/main/services/watcher.ts
