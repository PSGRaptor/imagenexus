import React from 'react';
import { useSettings } from '@/context/SettingsContext';
import { useImages } from '@/context/ImagesContext';

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

        // Auto-activate: scan immediately
        try { await rescan(); } catch {}
    };

    const activate = async () => { await rescan(); };

    return (
        <aside className="row-start-2 col-start-1 p-3 border-r border-gray-800 bg-gray-900">
            <div className="space-y-3">
                <div>
                    <div className="text-xs text-gray-400 mb-1">Root</div>
                    <div className="flex gap-2">
                        <input
                            className="flex-1 px-2 py-1 rounded bg-gray-800 border border-gray-700"
                            value={pathInput}
                            onChange={e => setPathInput(e.target.value)}
                            placeholder="Select an image folder…"
                        />
                        <button className="px-2 rounded bg-gray-800 border border-gray-700" onClick={chooseFolder}>Pick</button>
                        <button className="px-2 rounded bg-blue-600 text-white border border-blue-500" onClick={activate}>Activate</button>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    <button
                        className="px-2 rounded bg-gray-800 border border-gray-700"
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
                                // ImagesContext restarts watch automatically when settings change
                            }}
                        />
                        <span>Watch</span>
                    </label>
                </div>

                <div>
                    <input
                        className="w-full px-2 py-1 rounded bg-gray-800 border border-gray-700"
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
