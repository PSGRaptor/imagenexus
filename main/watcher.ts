// START OF FILE: main/watcher.ts
import chokidar, { FSWatcher } from 'chokidar';
import path from 'node:path';

type WatchEvt = 'add' | 'change' | 'unlink';
type WatchCallback = (evt: WatchEvt, file: string) => void;

// Singleton watcher + currently watched root
let watcher: FSWatcher | null = null;
let watchedRoot: string | null = null;

/**
 * Create (or switch) the singleton image watcher for a given root folder.
 * If already watching the same resolved root, this is a no-op.
 *
 * Matches common image extensions. Emits only 'add' | 'change' | 'unlink'.
 * Uses ignoreInitial + awaitWriteFinish to avoid duplicate "add+change" spam.
 */
export async function createImageWatcher(rootPath: string, onEvent: WatchCallback): Promise<void> {
    if (!rootPath || typeof onEvent !== 'function') return;

    const resolvedRoot = path.resolve(rootPath);

    // If the existing watcher is already on this root, do nothing.
    if (watcher && watchedRoot && path.resolve(watchedRoot) === resolvedRoot) {
        return;
    }

    // Stop any previous watcher before creating a new one
    await stopImageWatcher();

    watchedRoot = resolvedRoot;

    // Include upper/lower case extensions to keep matching case-sensitive on some FS/glob setups
    const glob = path.join(
        resolvedRoot,
        '**/*.{png,PNG,jpg,JPG,jpeg,JPEG,webp,WEBP,bmp,BMP,gif,GIF}'
    );

    watcher = chokidar.watch(glob, {
        // We do initial listing via your scan — don't emit a flood here
        ignoreInitial: true,
        // Helps avoid duplicate add/change bursts while a file is still being written
        awaitWriteFinish: { stabilityThreshold: 250, pollInterval: 100 },
        depth: 99,
        persistent: true,
        followSymlinks: true,
        alwaysStat: false,
        ignorePermissionErrors: true,
    });

    // Forward events to the provided callback
    watcher
        .on('add',    (p) => safeEmit(onEvent, 'add', p))
        .on('change', (p) => safeEmit(onEvent, 'change', p))
        .on('unlink', (p) => safeEmit(onEvent, 'unlink', p))
        .on('error',  (err) => {
            // Non-fatal: log locally. Your main.ts already collapses/relays events to renderer.
            // eslint-disable-next-line no-console
            console.error('[watcher] error:', err);
        });
}

/**
 * Stop and dispose the singleton watcher (if any).
 */
export async function stopImageWatcher(): Promise<void> {
    if (!watcher) {
        watchedRoot = null;
        return;
    }
    try {
        watcher.removeAllListeners();
        await watcher.close();
    } catch {
        // ignore
    } finally {
        watcher = null;
        watchedRoot = null;
    }
}

// ---- helpers ----
function safeEmit(cb: WatchCallback, evt: WatchEvt, file: string) {
    try {
        cb(evt, file);
    } catch (e) {
        // eslint-disable-next-line no-console
        console.error('[watcher] callback error:', e);
    }
}
// END OF FILE: main/watcher.ts
