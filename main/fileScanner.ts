import fg from 'fast-glob';
import path from 'path';
import fs from 'fs-extra';
import { ImageItem, UserSettings } from './types';
import { heuristicNSFW } from './nsfw';

const SUPPORTED = ['.png', '.jpg', '.jpeg', '.webp'];

export async function scanImages(settings: UserSettings): Promise<ImageItem[]> {
    const root = settings.activeRoot || settings.roots[0] || '';
    if (!root || !(await fs.pathExists(root))) return [];

    const patterns = [`${path.posix.join(root.replace(/\\/g, '/'), '**/*.{png,jpg,jpeg,webp}')}`];
    const ignore = settings.ignorePatterns || [];

    const entries = await fg(patterns, { caseSensitiveMatch: false, dot: false, ignore });
    const items: ImageItem[] = [];
    for (const p of entries) {
        const stat = await fs.stat(p);
        const ext = path.extname(p).toLowerCase() as any;
        const name = path.basename(p);
        const folder = path.basename(path.dirname(p));
        items.push({
            path: p,
            name,
            folder,
            ext: ext.replace('.', ''),
            mtimeMs: stat.mtimeMs,
            nsfw: heuristicNSFW(name)
        });
    }
    return items.sort((a, b) => b.mtimeMs - a.mtimeMs);
}
