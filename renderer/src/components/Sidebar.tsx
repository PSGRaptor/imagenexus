import React from 'react';
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

                {/* Search */}
                <div>
                    <input
                        className="w-full px-2 py-1 rounded bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700"
                        placeholder="Filename / prompt search…"
                        value={filters.query}
                        onChange={e => setFilters({ query: e.target.value })}
                    />
                </div>
            </div>
        </aside>
    );
};

export default Sidebar;
