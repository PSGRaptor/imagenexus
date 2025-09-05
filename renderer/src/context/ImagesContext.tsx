import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { ImageItem, ScanResult } from '../types';
import { useSettings } from './SettingsContext';

type Filters = {
    query: string;
    byModel: string;
    bySampler: string;
    favoritesOnly: boolean;
    hideNSFW: boolean;
};

type Ctx = {
    images: ImageItem[];
    filtered: ImageItem[];
    filters: Filters;
    setFilters: (f: Partial<Filters>) => void;
    rescan: () => Promise<void>;
};

const ImagesContext = createContext<Ctx | null>(null);

const defaultFilters: Filters = {
    query: '',
    byModel: '',
    bySampler: '',
    favoritesOnly: false,
    hideNSFW: true
};

export const ImagesProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const { settings } = useSettings();
    const [images, setImages] = useState<ImageItem[]>([]);
    const [filters, setFiltersState] = useState<Filters>(defaultFilters);

    const apply = (f: Partial<Filters>) => setFiltersState(prev => ({ ...prev, ...f }));

    const rescan = async () => {
        const res: ScanResult = await window.api.scan();
        setImages(res.images);
    };

    useEffect(() => {
        const unsub = window.api.onImagesChanged(() => rescan());
        rescan();
        return () => { /* ipc cleaned in preload */ };
    }, [settings?.activeRoot]);

    const filtered = useMemo(() => {
        const q = filters.query.trim().toLowerCase();
        return images.filter(im => {
            if (filters.hideNSFW && im.nsfw) return false;
            if (filters.favoritesOnly && !im.favorite) return false;
            const matchQ = !q || im.name.toLowerCase().includes(q) || im.folder.toLowerCase().includes(q);
            return matchQ;
        });
    }, [images, filters]);

    useEffect(() => {
        if (settings) apply({ hideNSFW: !settings.showNSFW });
    }, [settings?.showNSFW]);

    return (
        <ImagesContext.Provider value={{ images, filtered, filters, setFilters: apply, rescan }}>
            {children}
        </ImagesContext.Provider>
    );
};

export function useImages() {
    const ctx = useContext(ImagesContext);
    if (!ctx) throw new Error('useImages must be used within ImagesProvider');
    return ctx;
}
