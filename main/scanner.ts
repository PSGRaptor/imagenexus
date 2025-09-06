// FILE: main/scanner.ts
import path from 'node:path';
import fs from 'node:fs';
import fse from 'fs-extra';

const exts = new Set(['.png', '.jpg', '.jpeg', '.webp']);

export type ScannedImage = {
    path: string;
    name: string;
    folder: string;
    ext: string;
    mtimeMs: number;
    size: number;
};

export async function scanImages(root: string, ignore: string[] = ['*.tmp', '/cache/']): Promise<ScannedImage[]> {
    const results: ScannedImage[] = [];
    if (!root || !fs.existsSync(root)) return results;

    const shouldIgnore = (p: string) => {
        // Use regex replace to support ES2020
        const lc = p.replace(/\\/g, '/').toLowerCase();
        if (lc.includes('/cache/')) return true;
        if (lc.endsWith('.tmp')) return true;
        for (const pat of ignore) {
            if (!pat) continue;
            const star = pat.replace(/\./g, '\\.').replace(/\*/g, '.*');
            const re = new RegExp(star, 'i');
            if (re.test(lc)) return true;
        }
        return false;
    };

    const walk = async (dir: string) => {
        let entries: fs.Dirent[];
        try {
            entries = await fse.readdir(dir, { withFileTypes: true });
        } catch {
            return;
        }

        for (const e of entries) {
            const full = path.join(dir, e.name);
            if (shouldIgnore(full)) continue;

            if (e.isDirectory()) {
                await walk(full);
            } else {
                const ext = path.extname(e.name).toLowerCase();
                if (!exts.has(ext)) continue;

                let stat: fs.Stats;
                try {
                    stat = await fse.stat(full);
                } catch {
                    continue;
                }

                results.push({
                    path: full,
                    name: e.name,
                    folder: path.basename(path.dirname(full)),
                    ext,
                    mtimeMs: stat.mtimeMs,
                    size: stat.size,
                });
            }
        }
    };

    await walk(root);

    // newest first
    results.sort((a, b) => b.mtimeMs - a.mtimeMs);
    return results;
}
