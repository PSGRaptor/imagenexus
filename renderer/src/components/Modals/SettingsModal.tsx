import React from 'react';
import { useSettings, Settings } from '@/context/SettingsContext';

const SettingsModal: React.FC<{ open: boolean; onClose: () => void }> = ({ open, onClose }) => {
    const { settings, setSettings, save } = useSettings();
    const [local, setLocal] = React.useState<Settings | null>(null);

    React.useEffect(() => setLocal(settings), [settings]);

    if (!open) return null;
    if (!local) return null;

    const onSave = async () => {
        await setSettings(local);
        await save();
        onClose();
    };

    return (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center">
            <div className="w-[720px] max-w-[90vw] rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 space-y-4">
                <div className="text-lg font-semibold">Settings</div>
                <div className="space-y-3">
                    <div className="flex items-center gap-2">
                        <span className="w-36 text-sm text-gray-600 dark:text-gray-400">Theme</span>
                        <select
                            className="px-2 py-1 rounded bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700"
                            value={local.theme}
                            onChange={(e) => setLocal({ ...local, theme: e.target.value as any })}
                        >
                            <option value="dark">Dark</option>
                            <option value="light">Light</option>
                        </select>
                    </div>

                    <div className="flex items-center gap-2">
                        <span className="w-36 text-sm text-gray-600 dark:text-gray-400">Show NSFW</span>
                        <input
                            type="checkbox"
                            checked={local.showNSFW ?? !local.nsfwHidden}
                            onChange={(e) => setLocal({ ...local, showNSFW: e.target.checked })}
                        />
                    </div>

                    <div className="flex items-center gap-2">
                        <span className="w-36 text-sm text-gray-600 dark:text-gray-400">Watch folder</span>
                        <input
                            type="checkbox"
                            checked={local.watch ?? true}
                            onChange={(e) => setLocal({ ...local, watch: e.target.checked })}
                        />
                    </div>

                    <div className="flex items-center gap-2">
                        <span className="w-36 text-sm text-gray-600 dark:text-gray-400">Thumbnail max</span>
                        <input
                            type="number"
                            className="w-28 px-2 py-1 rounded bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700"
                            value={local.thumbnail.maxSize}
                            onChange={(e) => setLocal({ ...local, thumbnail: { ...local.thumbnail, maxSize: Number(e.target.value) } })}
                        />
                    </div>

                    <div>
                        <span className="block text-sm text-gray-600 dark:text-gray-400 mb-1">Ignore patterns (one per line)</span>
                        <textarea
                            className="w-full h-20 px-2 py-1 rounded bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700"
                            value={(local.ignorePatterns || []).join('\n')}
                            onChange={(e) => setLocal({ ...local, ignorePatterns: e.target.value.split(/\r?\n/).filter(Boolean) })}
                        />
                    </div>
                </div>

                <div className="flex justify-end gap-2">
                    <button className="px-3 py-1 rounded bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700" onClick={onClose}>Cancel</button>
                    <button className="px-3 py-1 rounded bg-blue-600 text-white" onClick={onSave}>Save</button>
                </div>
            </div>
        </div>
    );
};

export default SettingsModal;
