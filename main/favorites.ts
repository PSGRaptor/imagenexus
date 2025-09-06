// FILE: main/favorites.ts
import path from 'node:path';
import fse from 'fs-extra';
import { app } from 'electron';

const STORE = path.join(app.getPath('userData'), 'favorites.json');

async function readStore(): Promise<Record<string, boolean>> {
    try {
        return (await fse.readJSON(STORE)) as Record<string, boolean>;
    } catch {
        return {};
    }
}
async function writeStore(data: Record<string, boolean>) {
    await fse.writeJSON(STORE, data, { spaces: 2 });
}

export async function toggleFavorite(filePath: string): Promise<boolean> {
    const data = await readStore();
    const next = !data[filePath];
    data[filePath] = next;
    await writeStore(data);
    return next;
}

export async function isFavorite(filePath: string): Promise<boolean> {
    const data = await readStore();
    return !!data[filePath];
}

export async function getFavorites(): Promise<string[]> {
    const data = await readStore();
    return Object.entries(data)
        .filter(([_, v]) => !!v)
        .map(([k]) => k);
}
