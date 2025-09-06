// FILE: main/settings.ts
import path from 'node:path';
import fse from 'fs-extra';
import { app } from 'electron';

export type UserSettings = {
    theme?: 'light' | 'dark';
    nsfwHidden?: boolean;
    sources?: { name: string; path: string; enabled: boolean }[];
    // legacy compat
    activeRoot?: string;
    roots?: string[];
    watch?: boolean;
    showNSFW?: boolean;
    ignorePatterns?: string[];
    thumbnail?: { maxSize: number; width?: number; quality?: number };
    filters?: { favoritesOnly?: boolean; query?: string; model?: string; sampler?: string };
};

const CONFIG_DIR = path.join(app.getPath('userData'), 'config');
const CONFIG_FILE = path.join(CONFIG_DIR, 'user-settings.json');

const DEFAULTS: UserSettings = {
    theme: 'dark',
    nsfwHidden: false,
    sources: [],
    watch: true,
    showNSFW: true,
    ignorePatterns: [],
    thumbnail: { maxSize: 512 },
    filters: { favoritesOnly: false, query: '', model: '', sampler: '' },
};

export async function ensureSettings() {
    await fse.ensureDir(CONFIG_DIR);
    if (!(await fse.pathExists(CONFIG_FILE))) {
        await fse.writeJSON(CONFIG_FILE, DEFAULTS, { spaces: 2 });
    }
}

export async function getSettings(): Promise<UserSettings> {
    await ensureSettings();
    try {
        const s = await fse.readJSON(CONFIG_FILE);
        return { ...DEFAULTS, ...s };
    } catch {
        return { ...DEFAULTS };
    }
}

export async function saveSettings(s: UserSettings) {
    await ensureSettings();
    // keep compat in file
    const saved: UserSettings = { ...DEFAULTS, ...s };
    await fse.writeJSON(CONFIG_FILE, saved, { spaces: 2 });
    return saved;
}
