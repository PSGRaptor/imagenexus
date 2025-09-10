// START OF FILE: renderer/src/context/ImagesContext.tsx
import React, {
    createContext,
    useContext,
    useEffect,
    useMemo,
    useRef,
    useState,
} from 'react';
import { useSettings } from './SettingsContext';

/* ============================
   Utilities
============================ */
function dedupeByPath<T extends { path: string }>(items: T[]): T[] {
    const m = new Map<string, T>();
    for (const it of items) m.set(it.path, it);
    return Array.from(m.values());
}

/**
 * Convert an absolute filesystem path to a proper URL that <img> can load.
 * - Leaves data:, blob:, http(s):, atom:, and app: URLs untouched.
 * - Converts raw FS paths to file:// URLs.
 * - Normalizes backslashes and ensures /C:/ prefix on Windows.
 */
function toImgUrl(p?: string): string | undefined {
    if (!p) return undefined;
    if (/^(data:|blob:|https?:|atom:|app:)/i.test(p)) return p;
    if (p.startsWith('file://')) return p;
    let s = p.replace(/\\/g, '/');
    if (/^[A-Za-z]:/.test(s)) s = '/' + s;
    return encodeURI('file://' + s);
}

const exts = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp']);
const NSFW_HINTS = ['nsfw', 'lewd', 'explicit', 'r18', 'uncensored'];

/* ============================
   Types
============================ */
export type ImageItem = {
    path: string;
    name: string;
    folder: string;
    ext: string;
    mtimeMs: number;
    size: number;
    /** thumbnail/path URL for <img>. Always a URL (file:// or data:) when present. */
    thumb?: string;
    favorite?: boolean;
    nsfw?: boolean;
};

export type ImageMetadata = {
    generator?: string;
    prompt?: string;
    negative?: string;
    model?: string;
    sampler?: string;
    steps?: number;
    cfg?: number;
    seed?: string | number;
    size?: string;
    raw?: any;
};

export type Filters = {
    favoritesOnly: boolean;
    /** filename-only search text */
    query: string;
    model: string;
    sampler: string;
};

/* ============================
   Context
============================ */
const ImagesCtx = createContext<{
    items: ImageItem[];
    filtered: ImageItem[];
    selected: Set<string>;
    setSelected: React.Dispatch<React.SetStateAction<Set<string>>>;
    filters: Filters;
    setFilters: (f: Partial<Filters>) => void;
    rescan: () => Promise<void>;
    toggleFavorite: (p: string) => Promise<void>;
    getIndexOfPath: (p: string) => number;
    getNextPath: (p: string) => string | null;
    getPrevPath: (p: string) => string | null;
} | null>(null);

/* ============================
   Provider
============================ */
export const ImagesProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const { settings } = useSettings();
    const [items, setItems] = useState<ImageItem[]>([]);
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const [filters, _setFilters] = useState<Filters>({
        favoritesOnly: false,
        query: '',
        model: '',
        sampler: '',
    });

    const promptCache = useRef<Map<string, ImageMetadata>>(new Map());
    const api = (window as any).api || {};

    const setFilters = (f: Partial<Filters>) => _setFilters(prev => ({ ...prev, ...f }));

    // Apply saved filters once settings arrive
    useEffect(() => {
        if (!settings) return;
        const f = settings.filters || { favoritesOnly: false, query: '', model: '', sampler: '' };
        _setFilters({
            favoritesOnly: !!f.favoritesOnly,
            query: f.query || '',
            model: f.model || '',
            sampler: f.sampler || '',
        });
    }, [settings?.filters]);

    // Initial scan + watcher wiring
    useEffect(() => {
        let unsubbed = false;
        let unbindWatch: (() => void) | null = null;

        const run = async () => {
            if (!settings || (!settings.sources?.length && !settings.activeRoot)) return;

            const srcPath =
                settings.activeRoot ||
                settings.sources.find((s: any) => s.enabled && s.path)?.path;

            if (!srcPath || typeof api.scanImages !== 'function') return;

            try {
                // Ensure a single watcher in main
                if (typeof api.stopWatch === 'function') {
                    try { await api.stopWatch(); } catch { /* ignore */ }
                }

                // -------- Initial scan --------
                const scanned = (await api.scanImages(srcPath)) as ImageItem[];
                const maxThumb = settings.thumbnail?.maxSize ?? 512;

                const withThumbs: ImageItem[] = await Promise.all(
                    scanned.map(async (it: ImageItem) => {
                        const [thumb, favorite] = await Promise.all([
                            typeof api.getThumbnail === 'function' ? api.getThumbnail(it.path, maxThumb) : Promise.resolve(undefined),
                            typeof api.isFavorite === 'function' ? api.isFavorite(it.path) : Promise.resolve(false),
                        ]);
                        return {
                            ...it,
                            thumb: toImgUrl(thumb),
                            favorite,
                            nsfw: NSFW_HINTS.some(h => it.name.toLowerCase().includes(h)),
                        };
                    })
                );

                if (!unsubbed) setItems(dedupeByPath(withThumbs));

                // -------- Watch events --------
                if (typeof api.startWatch === 'function' && typeof api.onWatchEvent === 'function') {
                    await api.startWatch(srcPath);

                    // Rapid-duplicate guard (prevents add/change double-fires)
                    const recently = new Set<string>();
                    const remember = (p: string) => { recently.add(p); setTimeout(() => recently.delete(p), 1000); };

                    const handler = (payload:
                                         | { evt: 'add' | 'unlink' | 'change'; file: string }
                                         | { evt: 'upsert'; files: string[] }
                                         | { evt: 'error'; message: string }) => {

                        // Batched upserts
                        if ((payload as any).evt === 'upsert' && Array.isArray((payload as any).files)) {
                            const upserts = (payload as any).files as string[];
                            upserts.forEach((file: string) => {
                                if (!file) return;
                                const ext = file.slice(file.lastIndexOf('.')).toLowerCase();
                                if (!exts.has(ext)) return;
                                if (recently.has(file)) return;
                                remember(file);

                                const max = settings.thumbnail?.maxSize ?? 512;
                                Promise.all([
                                    typeof api.getThumbnail === 'function' ? api.getThumbnail(file, max) : Promise.resolve(undefined),
                                    typeof api.isFavorite === 'function' ? api.isFavorite(file) : Promise.resolve(false),
                                ]).then(([thumb, favorite]) => {
                                    setItems(prev =>
                                        dedupeByPath<ImageItem>([{
                                            path: file,
                                            name: file.split(/[/\\]/).pop() || file,
                                            folder: file.split(/[/\\]/).slice(-2)[0] || '',
                                            ext,
                                            mtimeMs: Date.now(),
                                            size: 0,
                                            thumb: toImgUrl(thumb),
                                            favorite,
                                            nsfw: NSFW_HINTS.some(h => file.toLowerCase().includes(h)),
                                        }, ...prev])
                                    );
                                });
                            });
                            return;
                        }

                        // Single event
                        const { evt } = payload as any;
                        if (evt === 'error') {
                            // optional: surface watcher errors
                            // eslint-disable-next-line no-console
                            console.error('[watch:error]', (payload as any).message);
                            return;
                        }

                        const { file } = payload as { evt: 'add' | 'unlink' | 'change'; file: string };
                        if (!file) return;
                        const ext = file.slice(file.lastIndexOf('.')).toLowerCase();
                        if (!exts.has(ext)) return;

                        if (evt === 'add') {
                            if (recently.has(file)) return;
                            remember(file);
                            const max = settings.thumbnail?.maxSize ?? 512;
                            Promise.all([
                                typeof api.getThumbnail === 'function' ? api.getThumbnail(file, max) : Promise.resolve(undefined),
                                typeof api.isFavorite === 'function' ? api.isFavorite(file) : Promise.resolve(false),
                            ]).then(([thumb, favorite]) => {
                                setItems(prev =>
                                    dedupeByPath<ImageItem>([{
                                        path: file,
                                        name: file.split(/[/\\]/).pop() || file,
                                        folder: file.split(/[/\\]/).slice(-2)[0] || '',
                                        ext,
                                        mtimeMs: Date.now(),
                                        size: 0,
                                        thumb: toImgUrl(thumb),
                                        favorite,
                                        nsfw: NSFW_HINTS.some(h => file.toLowerCase().includes(h)),
                                    }, ...prev])
                                );
                            });
                        } else if (evt === 'unlink') {
                            promptCache.current.delete(file);
                            setItems(prev => prev.filter((x: ImageItem) => x.path !== file));
                        } else if (evt === 'change') {
                            if (recently.has(file)) return;
                            remember(file);
                            const max = settings.thumbnail?.maxSize ?? 512;
                            if (typeof api.getThumbnail === 'function') {
                                api.getThumbnail(file, max).then((thumb: string) => {
                                    const url = toImgUrl(thumb);
                                    setItems(prev => prev.map((x: ImageItem) => (x.path === file ? { ...x, thumb: url } : x)));
                                });
                            }
                        }
                    };

                    // Bind and remember unbind (preload should return a disposer)
                    unbindWatch = api.onWatchEvent(handler);
                }
            } catch (e) {
                // eslint-disable-next-line no-console
                console.error('initial scan failed', e);
            }
        };

        void run();

        return () => {
            unsubbed = true;
            if (unbindWatch) {
                try { unbindWatch(); } catch { /* ignore */ }
            }
            if (typeof api.stopWatch === 'function') api.stopWatch();
        };
    }, [settings?.sources, settings?.activeRoot, settings?.thumbnail?.maxSize]);

    // Manual rescan (dedupe + URL normalization)
    const rescan = async () => {
        const srcPath =
            settings?.activeRoot ||
            settings?.sources?.find((s: any) => s.enabled && s.path)?.path;
        if (!srcPath || typeof api.scanImages !== 'function') return;

        promptCache.current.clear();
        const scanned = (await api.scanImages(srcPath)) as ImageItem[];
        const maxThumb = settings?.thumbnail?.maxSize ?? 512;

        const withThumbs: ImageItem[] = await Promise.all(
            scanned.map(async (it: ImageItem) => {
                const [thumb, favorite] = await Promise.all([
                    typeof api.getThumbnail === 'function' ? api.getThumbnail(it.path, maxThumb) : Promise.resolve(undefined),
                    typeof api.isFavorite === 'function' ? api.isFavorite(it.path) : Promise.resolve(false),
                ]);
                return {
                    ...it,
                    thumb: toImgUrl(thumb),
                    favorite,
                    nsfw: NSFW_HINTS.some(h => it.name.toLowerCase().includes(h)),
                };
            })
        );

        setItems(dedupeByPath(withThumbs));
    };

    const toggleFavorite = async (p: string) => {
        if (typeof api.toggleFavorite !== 'function') return;
        const isFav = await api.toggleFavorite(p);
        setItems(prev => prev.map((x: ImageItem) => (x.path === p ? { ...x, favorite: isFav } : x)));
    };

    /* ============================
       Filtering: filename-only & folder-scoped
    ============================ */
    const filtered = useMemo(() => {
        const activeRoot =
            settings?.activeRoot ||
            settings?.sources?.[0]?.path ||
            '';

        const rootLC = activeRoot.toLowerCase();
        const q = (filters?.query || '').trim().toLowerCase();
        const favoritesOnly = !!filters?.favoritesOnly;

        const getName = (p: string, n?: string) =>
            (n && n.length ? n : (p.split(/[\\/]/).pop() || p)).toLowerCase();

        return items.filter((img: ImageItem) => {
            // 1) enforce folder scope (case-insensitive; tolerant of / or \)
            if (rootLC) {
                const p = (img.path || '').toLowerCase();
                const startsInRoot =
                    p.startsWith(rootLC.endsWith('\\') ? rootLC : rootLC + '\\') ||
                    p.startsWith(rootLC.endsWith('/') ? rootLC : rootLC + '/') ||
                    p === rootLC;
                if (!startsInRoot) return false;
            }

            // 2) favorites filter
            if (favoritesOnly && !img.favorite) return false;

            // 3) filename-only match
            if (!q) return true;
            const nameLC = getName(img.path, (img as any).name);
            return nameLC.includes(q);
        });
    }, [items, filters?.query, filters?.favoritesOnly, settings?.activeRoot, settings?.sources]);

    const getIndexOfPath = (p: string) => filtered.findIndex((i: ImageItem) => i.path === p);
    const getNextPath = (p: string) => {
        const idx = getIndexOfPath(p);
        if (idx < 0) return null;
        return filtered[idx + 1]?.path || null;
    };
    const getPrevPath = (p: string) => {
        const idx = getIndexOfPath(p);
        if (idx < 0) return null;
        return filtered[idx - 1]?.path || null;
    };

    return (
        <ImagesCtx.Provider
            value={{
                items,
                filtered,
                selected,
                setSelected,
                filters,
                setFilters,
                rescan,
                toggleFavorite,
                getIndexOfPath,
                getNextPath,
                getPrevPath,
            }}
        >
            {children}
        </ImagesCtx.Provider>
    );
};

/* ============================
   Hook
============================ */
export function useImages() {
    const ctx = useContext(ImagesCtx);
    if (!ctx) throw new Error('useImages must be used within ImagesProvider');
    return ctx;
}
// END OF FILE: renderer/src/context/ImagesContext.tsx
