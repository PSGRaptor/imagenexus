// START OF FILE: Sidebar.tsx
import React, { useEffect } from 'react';
import { useSettings } from '@/context/SettingsContext';
import { useImages } from '@/context/ImagesContext';
import btn from '@/styles/Buttons.module.css';

const Sidebar: React.FC = () => {
    const { settings, setSettings } = useSettings();
    const { setFilters, filters, rescan } = useImages();
    const [pathInput, setPathInput] = React.useState('');

    React.useEffect(() => {
        setPathInput(settings?.activeRoot || settings?.sources?.[0]?.path || '');
    }, [settings?.activeRoot, settings?.sources]);

    const chooseFolder = async () => {
        const chosen = await window.api.pickFolder();
        if (!chosen) return;

        const roots = Array.from(new Set([...(settings?.roots || []), chosen]));
        const sources = (() => {
            const prev = settings?.sources || [];
            return prev.some(s => s.path === chosen)
                ? prev
                : [...prev, { name: chosen.split(/[\\/]/).pop() || chosen, path: chosen, enabled: true }];
        })();

        await setSettings({ ...(settings as any), roots, activeRoot: chosen, sources });
        setPathInput(chosen);
        try { await rescan(); } catch {}
    };

    // Initialize thumbnail size slider and label from localStorage
    useEffect(() => {
        const saved = localStorage.getItem('imagenexus.thumbSize.v1') || '200px';
        document.documentElement.style.setProperty('--thumb-size', saved);
        const px = parseInt(saved, 10);
        const input = document.getElementById('thumb-size') as HTMLInputElement | null;
        const span  = document.getElementById('thumb-size-value');
        if (input) input.value = String(px);
        if (span)  span.textContent = saved;
    }, []);

    return (
        <aside className="row-start-2 col-start-1 p-3 bg-gray-50 dark:bg-gray-900 border-r border-gray-200 dark:border-gray-800">
            <div className="space-y-3">
                {/* Root picker */}
                <div>
                    <div className="text-xs text-gray-600 dark:text-gray-400 mb-1">Root</div>
                    <div className="flex gap-2">
                        <input
                            className="flex-1 px-2 py-1 rounded bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700"
                            value={pathInput}
                            onChange={e => setPathInput(e.target.value)}
                            placeholder="Select an image folder…"
                        />
                        <button className={btn.btnPrimary} onClick={chooseFolder}>Pick</button>
                    </div>
                </div>

                {/* Filters / toggles */}
                <div className="flex items-center gap-2">
                    <button
                        className={btn.btnPrimary}
                        onClick={() => setFilters({ favoritesOnly: !filters.favoritesOnly })}
                        title="Toggle favorites filter"
                    >
                        {filters.favoritesOnly ? '★ Favorites' : '☆ Favorites'}
                    </button>

                    <label className="flex items-center gap-2 text-sm">
                        <input
                            id="nsfw"
                            type="checkbox"
                            checked={!(settings?.nsfwHidden)}
                            onChange={async e => {
                                await setSettings({ ...(settings as any), showNSFW: e.target.checked });
                            }}
                        />
                        <span>Show NSFW</span>
                    </label>

                    <label className="flex items-center gap-2 text-sm">
                        <input
                            id="watch"
                            type="checkbox"
                            checked={settings?.watch ?? true}
                            onChange={async e => {
                                await setSettings({ ...(settings as any), watch: e.target.checked });
                            }}
                        />
                        <span>Watch</span>
                    </label>
                </div>

                {/* Search (filename only) */}
                <div>
                    <input
                        className="w-full px-2 py-1 rounded bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700"
                        placeholder="Filename filter…"
                        value={filters.query}
                        onChange={e => setFilters({ query: e.target.value })}
                    />
                </div>

                {/* Bottom controls: thumbnail size slider */}
                <div className="border-t border-neutral-800 p-3">
                    <label htmlFor="thumb-size" className="block text-xs text-neutral-300 mb-2">
                        Thumbnail size: <span id="thumb-size-value" className="font-mono"></span>
                    </label>
                    <input
                        id="thumb-size"
                        type="range"
                        min={60}
                        max={512}
                        step={2}
                        className="w-full"
                        onInput={(e) => {
                            const px = String((e.target as HTMLInputElement).value);
                            const v = `${px}px`;
                            document.documentElement.style.setProperty('--thumb-size', v);
                            localStorage.setItem('imagenexus.thumbSize.v1', v);
                            const span = document.getElementById('thumb-size-value');
                            if (span) span.textContent = v;
                        }}
                    />
                </div>
            </div>
        </aside>
    );
};

export default Sidebar;
// END OF FILE: Sidebar.tsx
