// FILE: main/watcher.ts
import chokidar, { FSWatcher } from 'chokidar';
import path from 'node:path';

let watcher: FSWatcher | null = null;
const exts = new Set(['.png', '.jpg', '.jpeg', '.webp']);

export async function createImageWatcher(
    rootPath: string,
    onEvt: (evt: 'add' | 'unlink' | 'change', file: string) => void
) {
    if (watcher) {
        await watcher.close().catch(() => {});
        watcher = null;
    }

    watcher = chokidar.watch(rootPath, {
        ignoreInitial: true,
        ignored: [/[/\\]cache[/\\]/i, /\.tmp$/i],
        awaitWriteFinish: { stabilityThreshold: 200, pollInterval: 50 },
    });

    const ok = (file: string) => exts.has(path.extname(file).toLowerCase());

    watcher
        .on('add', (f) => ok(f) && onEvt('add', f))
        .on('unlink', (f) => ok(f) && onEvt('unlink', f))
        .on('change', (f) => ok(f) && onEvt('change', f));

    return true;
}

export async function stopImageWatcher() {
    if (watcher) {
        await watcher.close().catch(() => {});
        watcher = null;
    }
    return true;
}
