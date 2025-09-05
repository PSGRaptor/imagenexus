import fs from 'fs-extra';
import path from 'path';
import { app } from 'electron';
import { UserSettings } from './types';

const CONFIG_DIR = path.join(process.cwd(), 'config');
const USER_CFG = path.join(CONFIG_DIR, 'user-settings.json');
const DEFAULT_CFG = path.join(CONFIG_DIR, 'default-config.json');
const FAVORITES = path.join(CONFIG_DIR, 'favorites.json');

export async function readSettings(): Promise<UserSettings> {
    if (!(await fs.pathExists(USER_CFG))) {
        const def = await fs.readJSON(DEFAULT_CFG);
        await fs.ensureDir(CONFIG_DIR);
        await fs.writeJSON(USER_CFG, def, { spaces: 2 });
        return def;
    }
    return fs.readJSON(USER_CFG);
}

export async function writeSettings(s: UserSettings) {
    await fs.writeJSON(USER_CFG, s, { spaces: 2 });
}

export async function getFavorites(): Promise<Record<string, boolean>> {
    if (!(await fs.pathExists(FAVORITES))) {
        await fs.writeJSON(FAVORITES, { favorites: {} }, { spaces: 2 });
        return {};
    }
    const json = await fs.readJSON(FAVORITES);
    return json.favorites || {};
}

export async function setFavorite(filePath: string, fav: boolean) {
    const json = (await fs.pathExists(FAVORITES))
        ? await fs.readJSON(FAVORITES)
        : { favorites: {} as Record<string, boolean> };
    json.favorites[filePath] = fav;
    await fs.writeJSON(FAVORITES, json, { spaces: 2 });
}

export function getThumbDir() {
    const dir = path.join(app.getPath('userData'), 'thumbnails');
    fs.ensureDirSync(dir);
    return dir;
}
