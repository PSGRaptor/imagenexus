import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';

export type Source = { name: string; path: string; enabled: boolean };

export type Settings = {
    theme: 'light' | 'dark';
    nsfwHidden: boolean;                 // new model
    sources: Source[];                   // new model (replaces roots/activeRoot)
    thumbnail: { maxSize: number } & {   // we also tolerate legacy props below
        width?: number; quality?: number;
    };
    filters: { favoritesOnly: boolean; query: string; model: string; sampler: string };

    // -------- legacy/compat fields used by current UI (optional) ----------
    activeRoot?: string;
    roots?: string[];
    watch?: boolean;
    showNSFW?: boolean;
    ignorePatterns?: string[];
};

const DEFAULTS: Settings = {
    theme: 'dark',
    nsfwHidden: false,
    sources: [],
    thumbnail: { maxSize: 512 },
    filters: { favoritesOnly: false, query: '', model: '', sampler: '' },
};

type Ctx = {
    settings: Settings | null;
    setSettings: (s: Settings) => Promise<void>;
    save: () => Promise<void>;
    toggleTheme: () => void;
};

const SettingsCtx = createContext<Ctx | null>(null);

export const SettingsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [settings, setSettingsState] = useState<Settings | null>(null);

    useEffect(() => {
        (async () => {
            try {
                const api = (window as any).api;
                const s = await api?.getSettings?.();

                // derive compat fields from new model if missing
                const roots = Array.isArray(s?.sources) ? (s.sources as Source[]).map(x => x.path) : [];
                const activeRoot = roots[0] || '';

                const merged: Settings = {
                    ...DEFAULTS,
                    ...(s || {}),
                    thumbnail: {
                        maxSize: s?.thumbnail?.maxSize ?? 512,
                        width: s?.thumbnail?.width,
                        quality: s?.thumbnail?.quality,
                    },
                    nsfwHidden: !!s?.nsfwHidden,
                    filters: {
                        favoritesOnly: !!s?.filters?.favoritesOnly,
                        query: s?.filters?.query ?? '',
                        model: s?.filters?.model ?? '',
                        sampler: s?.filters?.sampler ?? '',
                    },
                    // compat
                    roots: s?.roots ?? roots,
                    activeRoot: s?.activeRoot ?? activeRoot,
                    showNSFW: s?.showNSFW ?? !s?.nsfwHidden,
                    watch: s?.watch ?? true,
                    ignorePatterns: s?.ignorePatterns ?? [],
                };
                setSettingsState(merged);
            } catch {
                setSettingsState(DEFAULTS);
            }
        })();
    }, []);

    // Persist and keep compat fields synced
    const setSettings = async (s: Settings) => {
        // If legacy fields are set, reflect them into new-model `sources/nsfwHidden`
        const sources: Source[] =
            s.sources && s.sources.length
                ? s.sources
                : (s.roots || []).map((p) => ({ name: p.split(/[\\/]/).pop() || p, path: p, enabled: true }));

        const normalized: Settings = {
            ...DEFAULTS,
            ...s,
            sources,
            nsfwHidden: s.showNSFW === undefined ? s.nsfwHidden : !s.showNSFW,
            thumbnail: { maxSize: s.thumbnail?.maxSize ?? 512, width: s.thumbnail?.width, quality: s.thumbnail?.quality },
            filters: {
                favoritesOnly: !!s.filters?.favoritesOnly,
                query: s.filters?.query || '',
                model: s.filters?.model || '',
                sampler: s.filters?.sampler || '',
            },
            roots: s.roots ?? sources.map(x => x.path),
            activeRoot: s.activeRoot ?? sources[0]?.path,
            showNSFW: s.showNSFW ?? !s.nsfwHidden,
            watch: s.watch ?? true,
            ignorePatterns: s.ignorePatterns ?? [],
        };

        setSettingsState(normalized);
        try { await (window as any).api?.saveSettings?.(normalized); } catch {}
    };

    const save = async () => {
        if (!settings) return;
        try { await (window as any).api?.saveSettings?.(settings); } catch {}
    };

    const toggleTheme = () => {
        setSettingsState((prev) => {
            const next: Settings = { ...(prev || DEFAULTS), theme: (prev?.theme === 'dark' ? 'light' : 'dark') as any };
            void (window as any).api?.saveSettings?.(next);
            return next;
        });
    };

    const value = useMemo(() => ({ settings, setSettings, save, toggleTheme }), [settings]);

    return <SettingsCtx.Provider value={value}>{children}</SettingsCtx.Provider>;
};

export function useSettings() {
    const ctx = useContext(SettingsCtx);
    if (!ctx) throw new Error('useSettings must be used within SettingsProvider');
    return ctx;
}
