import React, { useEffect, useState } from 'react';
import styles from './ImageModal.module.css';
import { useSettings } from '../../context/SettingsContext';

const SettingsModal: React.FC<{ open: boolean; onClose: () => void; }> = ({ open, onClose }) => {
    const { settings, setSettings } = useSettings();
    const [local, setLocal] = useState(settings);

    useEffect(() => setLocal(settings ?? null), [settings]);

    if (!open || !local) return null;

    return (
        <div className={styles.backdrop} onClick={onClose}>
            <div className="w-[680px] rounded-xl2 bg-gray-950 border border-gray-800 p-4" onClick={e => e.stopPropagation()}>
                <div className="text-lg font-semibold mb-3">Settings</div>

                <div className="space-y-3">
                    <div>
                        <div className="text-sm text-gray-400 mb-1">Active Root</div>
                        <div className="flex gap-2">
                            <input className="w-full px-2 py-1 rounded bg-gray-800 border border-gray-700" value={local.activeRoot} onChange={e => setLocal({ ...local, activeRoot: e.target.value })} />
                            <button className="px-2 rounded bg-gray-800 border border-gray-700" onClick={async () => {
                                const chosen = await window.api.pickFolder();
                                if (chosen) setLocal({ ...local, activeRoot: chosen, roots: local.roots.includes(chosen) ? local.roots : [...local.roots, chosen] });
                            }}>Pick</button>
                        </div>
                    </div>

                    <div className="flex items-center gap-3">
                        <label className="flex items-center gap-2">
                            <input type="checkbox" checked={local.watch} onChange={e => setLocal({ ...local, watch: e.target.checked })} />
                            Live Watch
                        </label>
                        <label className="flex items-center gap-2">
                            <input type="checkbox" checked={local.showNSFW} onChange={e => setLocal({ ...local, showNSFW: e.target.checked })} />
                            Show NSFW
                        </label>
                        <label className="flex items-center gap-2">
                            <span>Theme</span>
                            <select className="px-2 py-1 rounded bg-gray-800 border border-gray-700" value={local.theme} onChange={e => setLocal({ ...local, theme: e.target.value as any })}>
                                <option value="light">Light</option>
                                <option value="dark">Dark</option>
                            </select>
                        </label>
                    </div>

                    <div>
                        <div className="text-sm text-gray-400 mb-1">Ignore Patterns (glob)</div>
                        <textarea className="w-full h-20 px-2 py-1 rounded bg-gray-800 border border-gray-700" value={(local.ignorePatterns || []).join('\n')} onChange={e => setLocal({ ...local, ignorePatterns: e.target.value.split(/\r?\n/).filter(Boolean) })} />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <label className="flex items-center gap-2">
                            <span>Thumb width</span>
                            <input type="number" className="w-24 px-2 py-1 rounded bg-gray-800 border border-gray-700" value={local.thumbnail.width} onChange={e => setLocal({ ...local, thumbnail: { ...local.thumbnail, width: Number(e.target.value) } })} />
                        </label>
                        <label className="flex items-center gap-2">
                            <span>Thumb quality</span>
                            <input type="number" className="w-24 px-2 py-1 rounded bg-gray-800 border border-gray-700" value={local.thumbnail.quality} onChange={e => setLocal({ ...local, thumbnail: { ...local.thumbnail, quality: Number(e.target.value) } })} />
                        </label>
                    </div>
                </div>

                <div className="mt-4 flex justify-end gap-2">
                    <button className="px-3 py-1 rounded bg-gray-800 border border-gray-700 hover:bg-gray-700" onClick={onClose}>Cancel</button>
                    <button className="px-3 py-1 rounded bg-brand-600 hover:bg-brand-700" onClick={async () => {
                        await setSettings(local);
                        onClose();
                    }}>Save</button>
                </div>
            </div>
        </div>
    );
};

export default SettingsModal;
