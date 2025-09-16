// FILE: renderer/src/components/ImageGrid.tsx
import React from 'react';
import { useImages } from '@/context/ImagesContext';
import ImageCard from '@/components/ImageCard';

const ImageGrid: React.FC<{ onOpenImage?: (path: string) => void }> = ({ onOpenImage }) => {
    const { filtered } = useImages();

    // items hidden immediately after delete
    const [hidden, setHidden] = React.useState<Set<string>>(() => new Set());

    // favorites-only toggle (can be controlled via global helper or CustomEvent)
    const [favoritesOnly, setFavoritesOnly] = React.useState<boolean>(false);

    // cache of path -> isFavorite
    const [favMap, setFavMap] = React.useState<Map<string, boolean>>(() => new Map());

    // expose a safe global helper the sidebar can call
    React.useEffect(() => {
        (window as any).ImageNexus = Object.assign((window as any).ImageNexus || {}, {
            setFavoritesOnly: (v: boolean) => setFavoritesOnly(!!v),
            toggleFavoritesOnly: () => setFavoritesOnly(v => !v),
            getFavoritesOnly: () => favoritesOnly,
        });
    }, [favoritesOnly]);

    // also listen to a CustomEvent for wiring without imports:
    // window.dispatchEvent(new CustomEvent('imagenexus:favoritesOnly', { detail: true|false }))
    React.useEffect(() => {
        const onEvt = (e: Event) => {
            const v = (e as CustomEvent<boolean>).detail;
            if (typeof v === 'boolean') setFavoritesOnly(v);
        };
        window.addEventListener('imagenexus:favoritesOnly', onEvt as EventListener);
        return () => window.removeEventListener('imagenexus:favoritesOnly', onEvt as EventListener);
    }, []);

    // keep favMap up to date (lazy: only for visible set or when filtering)
    React.useEffect(() => {
        let cancelled = false;
        (async () => {
            const api = (window as any).api;
            if (!api?.isFavorite) return;

            // Small batch so we don't hammer IPC
            const paths = filtered.map(it => it.path);
            const toCheck = favoritesOnly ? paths : paths.slice(0, 500); // cap when not filtering

            const results = await Promise.allSettled(toCheck.map(p => api.isFavorite(p)));
            if (cancelled) return;

            setFavMap(prev => {
                const next = new Map(prev);
                results.forEach((res, idx) => {
                    if (res.status === 'fulfilled') next.set(toCheck[idx], !!res.value);
                });
                return next;
            });
        })();
        return () => { cancelled = true; };
    }, [filtered, favoritesOnly]);

    // update map promptly when a single card toggles a star
    React.useEffect(() => {
        const onChanged = (e: Event) => {
            const { path, value } = (e as CustomEvent<{ path: string; value: boolean }>).detail || {};
            if (!path) return;
            setFavMap(prev => {
                const next = new Map(prev);
                next.set(path, !!value);
                return next;
            });
        };
        window.addEventListener('imagenexus:favoritesChanged', onChanged as EventListener);
        return () => window.removeEventListener('imagenexus:favoritesChanged', onChanged as EventListener);
    }, []);

    // compose final list
    const visible = React.useMemo(() => {
        const base = filtered.filter(it => !hidden.has(it.path));
        if (!favoritesOnly) return base;
        return base.filter(it => favMap.get(it.path));
    }, [filtered, hidden, favoritesOnly, favMap]);

    const openAt = (idx: number) => {
        const it = visible[idx];
        if (it) onOpenImage?.(it.path);
    };

    const handleDeleted = (path: string) => {
        setHidden(prev => {
            const next = new Set(prev);
            next.add(path);
            return next;
        });
    };

    return (
        <div
            className="grid gap-3"
            style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(var(--thumb-size, 200px), 1fr))' }}
        >
            {visible.map((it, i) => (
                <ImageCard
                    key={it.path}
                    item={it}
                    onOpen={() => openAt(i)}
                    onDeleted={handleDeleted}
                />
            ))}
        </div>
    );
};

export default ImageGrid;
