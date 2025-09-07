import path from 'node:path';
import fse from 'fs-extra';
import sharp from 'sharp';
import crypto from 'node:crypto';
import { app } from 'electron';

const CACHE_DIR = path.join(app.getPath('userData'), 'thumbnails');

export function getThumbPath(filePath: string, max: number) {
    const hash = crypto.createHash('md5').update(`${filePath}:${max}`).digest('hex');
    return path.join(CACHE_DIR, `${hash}.jpg`);
}

export async function makeThumbnail(filePath: string, max: number) {
    await fse.ensureDir(CACHE_DIR);
    const target = getThumbPath(filePath, max);
    if (await fse.pathExists(target)) return target;

    await sharp(filePath)
        .resize({ width: max, height: max, fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 85 })
        .toFile(target);

    return target; // absolute path (renderer will convert to file:/// URL)
}
