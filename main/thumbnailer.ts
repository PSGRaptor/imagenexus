import path from 'path';
import crypto from 'crypto';
import fs from 'fs-extra';

export async function getThumbPath(thumbDir: string, filePath: string) {
    const hash = crypto.createHash('md5').update(filePath).digest('hex');
    const sub = path.join(thumbDir, hash.slice(0, 2));
    await fs.ensureDir(sub);
    return path.join(sub, `${hash}.webp`);
}

export async function ensureThumbnail(thumbDir: string, filePath: string, width: number, quality: number) {
    const out = await getThumbPath(thumbDir, filePath);
    if (await fs.pathExists(out)) return out;
    const sharp = await import('sharp');
    await sharp.default(filePath).resize({ width, withoutEnlargement: true }).webp({ quality }).toFile(out);
    return out;
}
