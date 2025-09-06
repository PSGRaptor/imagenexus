import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useSettings } from './SettingsContext';

export type ImageItem = {
    path: string;
    name: string;
    folder: string;
    ext: string;
    mtimeMs: number;
    size: number;
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
export type Filters = { favoritesOnly: boolean; query: string; model: string; sampler: string };

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

const exts = new Set(['.png', '.jpg', '.jpeg', '.webp']);
const NSFW_HINTS = ['nsfw', 'lewd', 'explicit', 'r18', 'uncensored'];

export const ImagesProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const { settings } = useSettings();
    const [items, setItems] = useState<ImageItem[]>([]);
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const [filters, _setFilters] = useState<Filters>({ favoritesOnly: false, query: '', model: '', sampler: '' });
    const promptCache = useRef<Map<string, ImageMetadata>>(new Map());
    const api = (window as any).api || {};

    const setFilters = (f: Partial<Filters>) => {
        _setFilters(prev => ({ ...prev, ...f }));
    };

    // apply saved filters once settings arrive
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

    // initial scan + watch
    useEffect(() => {
        let unsubbed = false;

        const run = async () => {
            if (!settings || (!settings.sources?.length && !settings.activeRoot)) return;

            const srcPath =
                settings.activeRoot ||
                settings.sources.find((s) => s.enabled && s.path)?.path;

            if (!srcPath || typeof api.scanImages !== 'function') return;

            try {
                const scanned = (await api.scanImages(srcPath)) as ImageItem[];
                const maxSize = settings.thumbnail?.maxSize ?? 512;

                const withThumbs: ImageItem[] = await Promise.all(
                    scanned.map(async (it) => {
                        const [thumb, favorite] = await Promise.all([
                            typeof api.getThumbnail === 'function' ? api.getThumbnail(it.path, maxSize) : Promise.resolve(undefined),
                            typeof api.isFavorite === 'function' ? api.isFavorite(it.path) : Promise.resolve(false),
                        ]);
                        return {
                            ...it,
                            thumb,
                            favorite,
                            nsfw: NSFW_HINTS.some((h) => it.name.toLowerCase().includes(h)),
                        };
                    }),
                );

                if (!unsubbed) setItems(withThumbs);

                if (typeof api.startWatch === 'function' && typeof api.onWatchEvent === 'function') {
                    await api.startWatch(srcPath);
                    api.onWatchEvent((payload: { evt: 'add' | 'unlink' | 'change'; file: string }) => {
                        const { evt, file } = payload || ({} as any);
                        if (!file || !exts.has(file.slice(file.lastIndexOf('.')).toLowerCase())) return;

                        if (evt === 'add') {
                            const max = settings.thumbnail?.maxSize ?? 512;
                            Promise.all([
                                typeof api.getThumbnail === 'function' ? api.getThumbnail(file, max) : Promise.resolve(undefined),
                                typeof api.isFavorite === 'function' ? api.isFavorite(file) : Promise.resolve(false),
                            ]).then(([thumb, favorite]) => {
                                setItems((prev) => [
                                    {
                                        path: file,
                                        name: file.split(/[/\\]/).pop() || file,
                                        folder: file.split(/[/\\]/).slice(-2)[0] || '',
                                        ext: file.slice(file.lastIndexOf('.')).toLowerCase(),
                                        mtimeMs: Date.now(),
                                        size: 0,
                                        thumb,
                                        favorite,
                                        nsfw: NSFW_HINTS.some((h) => file.toLowerCase().includes(h)),
                                    },
                                    ...prev,
                                ]);
                            });
                        } else if (evt === 'unlink') {
                            promptCache.current.delete(file);
                            setItems((prev) => prev.filter((x) => x.path !== file));
                        } else if (evt === 'change') {
                            const max = settings.thumbnail?.maxSize ?? 512;
                            if (typeof api.getThumbnail === 'function') {
                                api.getThumbnail(file, max).then((thumb: string) => {
                                    setItems((prev) => prev.map((x) => (x.path === file ? { ...x, thumb } : x)));
                                });
                            }
                        }
                    });
                }
            } catch (e) {
                console.error('initial scan failed', e);
            }
        };

        void run();

        return () => {
            unsubbed = true;
            if (typeof api.stopWatch === 'function') api.stopWatch();
        };
    }, [settings?.sources, settings?.activeRoot, settings?.thumbnail?.maxSize]);

    const rescan = async () => {
        const srcPath =
            settings?.activeRoot ||
            settings?.sources?.find((s) => s.enabled && s.path)?.path;
        if (!srcPath || typeof api.scanImages !== 'function') return;

        promptCache.current.clear();
        const scanned = (await api.scanImages(srcPath)) as ImageItem[];
        const maxSize = settings?.thumbnail?.maxSize ?? 512;

        const withThumbs: ImageItem[] = await Promise.all(
            scanned.map(async (it) => {
                const [thumb, favorite] = await Promise.all([
                    typeof api.getThumbnail === 'function' ? api.getThumbnail(it.path, maxSize) : Promise.resolve(undefined),
                    typeof api.isFavorite === 'function' ? api.isFavorite(it.path) : Promise.resolve(false),
                ]);
                return {
                    ...it,
                    thumb,
                    favorite,
                    nsfw: NSFW_HINTS.some((h) => it.name.toLowerCase().includes(h)),
                };
            }),
        );

        setItems(withThumbs);
    };

    const toggleFavorite = async (p: string) => {
        if (typeof api.toggleFavorite !== 'function') return;
        const isFav = await api.toggleFavorite(p);
        setItems((prev) => prev.map((x) => (x.path === p ? { ...x, favorite: isFav } : x)));
    };

    const filtered = useMemo(() => {
        const q = (filters.query || '').toLowerCase();
        const enforceNSFW = !!settings?.nsfwHidden;

        return items.filter((i) => {
            if (filters.favoritesOnly && !i.favorite) return false;
            if (enforceNSFW && i.nsfw) return false;

            if (q) {
                if (i.name.toLowerCase().includes(q)) return true;
                const meta = promptCache.current.get(i.path);
                if (meta) {
                    const hay = JSON.stringify(meta).toLowerCase();
                    if (hay.includes(q)) return true;
                } else if (typeof api.getMetadata === 'function') {
                    api.getMetadata(i.path).then((m: ImageMetadata) => {
                        promptCache.current.set(i.path, m || {});
                        setItems((prev) => [...prev]);
                    });
                }
                return false;
            }

            return true;
        });
    }, [items, filters, settings?.nsfwHidden]);

    const getIndexOfPath = (p: string) => filtered.findIndex((i) => i.path === p);
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

export function useImages() {
    const ctx = useContext(ImagesCtx);
    if (!ctx) throw new Error('useImages must be used within ImagesProvider');
    return ctx;
}
