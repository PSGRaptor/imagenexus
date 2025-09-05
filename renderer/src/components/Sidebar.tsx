import React, { useEffect, useState } from 'react';
import styles from './Sidebar.module.css';
import { useSettings } from '../context/SettingsContext';
import { useImages } from '../context/ImagesContext';

const Sidebar: React.FC = () => {
    const { settings, setSettings } = useSettings();
    const { filters, setFilters, rescan } = useImages();
    const [pathInput, setPathInput] = useState('');

    useEffect(() => {
        setPathInput(settings?.activeRoot || '');
    }, [settings?.activeRoot]);

    return (
        <aside className={styles.root}>
            <div className={styles.sectionTitle}>Library</div>
            <div className="space-y-2 mb-4">
                <div className="flex gap-2">
                    <input className={styles.input} value={pathInput} onChange={e => setPathInput(e.target.value)} placeholder="Root folder..." />
                    <button className="px-2 rounded bg-gray-800 border border-gray-700" onClick={async () => {
                        const chosen = await window.api.pickFolder();
                        if (chosen) setPathInput(chosen);
                    }}>Pick</button>
                </div>
                <div className="flex gap-2">
                    <button className="px-2 rounded bg-gray-800 border border-gray-700" onClick={async () => {
                        if (!settings) return;
                        const roots = settings.roots.includes(pathInput) ? settings.roots : [...settings.roots, pathInput];
                        await setSettings({ ...settings, roots, activeRoot: pathInput });
                        await rescan();
                    }}>Set Active</button>
                    <button className="px-2 rounded bg-gray-800 border border-gray-700" onClick={() => setFilters({ favoritesOnly: !filters.favoritesOnly })}>
                        {filters.favoritesOnly ? 'All' : 'Favorites'}
                    </button>
                </div>
                <div className="flex items-center gap-2">
                    <input id="nsfw" type="checkbox" checked={settings?.showNSFW || false} onChange={async e => {
                        if (!settings) return;
                        await setSettings({ ...settings, showNSFW: e.target.checked });
                    }} />
                    <label htmlFor="nsfw">Show NSFW</label>
                </div>
                <div className="flex items-center gap-2">
                    <input id="watch" type="checkbox" checked={settings?.watch || false} onChange={async e => {
                        if (!settings) return;
                        await setSettings({ ...settings, watch: e.target.checked });
                    }} />
                    <label htmlFor="watch">Live Watch</label>
                </div>
            </div>

            <div className={styles.sectionTitle}>Search</div>
            <input className={styles.input} placeholder="Filename / folder..." value={filters.query} onChange={e => setFilters({ query: e.target.value })} />
        </aside>
    );
};

export default Sidebar;
