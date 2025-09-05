import path from 'path';
import fs from 'fs-extra';
import crypto from 'crypto';
import { pathToFileURL } from 'url';

export async function ensureThumbnail(
    thumbDir: string,
    filePath: string,
    width: number,
    quality: number
): Promise<string> {
    const hash = crypto.createHash('md5').update(filePath).digest('hex');
    const outDir = path.join(thumbDir, hash.slice(0, 2));
    await fs.ensureDir(outDir);
    const out = path.join(outDir, `${hash}.webp`);

    if (!(await fs.pathExists(out))) {
        const sharp = (await import('sharp')).default;
        await sharp(filePath)
            .resize({ width, withoutEnlargement: true })
            .webp({ quality })
            .toFile(out);
    }

    // ✅ return a proper file URL (works everywhere, including Windows)
    return pathToFileURL(out).href;
}
