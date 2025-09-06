import path from 'path';
import fs from 'fs-extra';
import crypto from 'crypto';
import { pathToFileURL } from 'url';

// Simple in-process queue with de-duplication.
// - At most CONCURRENCY jobs run at a time.
// - Additional requests for the same file share the same promise.
const CONCURRENCY = 2;

type JobKey = string;
type Run = () => Promise<void>;

const running = new Set<JobKey>();
const pending: Array<{ key: JobKey; run: Run; resolve: (v: string) => void; reject: (e: any) => void; outPath: string }> = [];
const inFlight = new Map<JobKey, Promise<string>>();

function next() {
    if (running.size >= CONCURRENCY) return;
    const item = pending.shift();
    if (!item) return;
    running.add(item.key);
    item.run()
        .then(() => {
            item.resolve(item.outPath);
        })
        .catch(item.reject)
        .finally(() => {
            running.delete(item.key);
            inFlight.delete(item.key);
            next();
        });
}

async function schedule(key: JobKey, run: Run, outPath: string): Promise<string> {
    // coalesce duplicate work
    const existing = inFlight.get(key);
    if (existing) return existing;

    const p = new Promise<string>((resolve, reject) => {
        pending.push({ key, run, resolve, reject, outPath });
        next();
    });
    inFlight.set(key, p);
    return p;
}

function stableThumbPath(thumbDir: string, filePath: string) {
    const hash = crypto.createHash('md5').update(filePath).digest('hex');
    const outDir = path.join(thumbDir, hash.slice(0, 2));
    const out = path.join(outDir, `${hash}.webp`);
    return { outDir, out };
}

/**
 * Ensure a thumbnail exists for filePath and return a file:// URL.
 * Uses a low-concurrency queue to avoid UI stalls.
 */
export async function ensureThumbnail(
    thumbDir: string,
    filePath: string,
    width: number,
    quality: number
): Promise<string> {
    const { outDir, out } = stableThumbPath(thumbDir, filePath);
    await fs.ensureDir(outDir);

    // If it already exists, return immediately (no queue).
    if (await fs.pathExists(out)) {
        return pathToFileURL(out).href;
    }

    const key = out;

    return schedule(
        key,
        async () => {
            // Re-check inside the job in case another process produced it
            if (await fs.pathExists(out)) return;

            const sharp = (await import('sharp')).default;
            await sharp(filePath)
                .resize({ width, withoutEnlargement: true })
                .webp({ quality })
                .toFile(out);
        },
        out
    ).then((p) => pathToFileURL(p).href);
}
