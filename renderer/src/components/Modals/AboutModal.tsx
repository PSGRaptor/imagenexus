import React from 'react';
import { APP_VERSION, BUILD_DATE, COMMIT_HASH } from '@/buildInfo';

type Props = {
    open: boolean;
    onClose: () => void;
    logoSrc?: string;
};

const AboutModal: React.FC<Props> = ({ open, onClose, logoSrc }) => {
    if (!open) return null;

    let lastUpdateStr = 'Unknown';
    try {
        if (BUILD_DATE) {
            const d = new Date(BUILD_DATE);
            if (!Number.isNaN(d.getTime())) lastUpdateStr = d.toLocaleString();
        }
    } catch { /* noop */ }

    return (
        <div className="fixed inset-0 flex items-center justify-center z-50" role="dialog" aria-modal="true">
            <div className="absolute inset-0 bg-black/50" onClick={onClose} />
            <div className="relative bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-lg shadow-lg max-w-lg w-full mx-4 p-6 border border-gray-200 dark:border-gray-800">
                {/* Close */}
                <button
                    onClick={onClose}
                    className="absolute top-4 right-4 p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700"
                    aria-label="Close"
                >
                    ✕
                </button>

                {/* Header */}
                <div className="flex items-center gap-4 mb-4">
                    {logoSrc ? (
                        <img src={logoSrc} alt="Image Nexus logo" className="h-[72px] w-[72px] rounded shadow" />
                    ) : (
                        <div className="h-[72px] w-[72px] rounded bg-blue-600" />
                    )}
                    <h2 className="text-2xl font-semibold">Image Nexus</h2>
                </div>

                {/* Description */}
                <p className="mb-4 text-gray-700 dark:text-gray-300">
                    Image & Prompt metadata viewer for AI image output folders.
                </p>
                <textarea
                    readOnly
                    value="Image Nexus lets you browse Stable Diffusion, ComfyUI, InvokeAI, and other AI image outputs with embedded or sidecar metadata. It provides prompt/negative separation, generator settings, filters, favorites, and more — mirroring the ModelsNexus UI experience."
                    className="w-full h-28 p-2 border border-gray-300 dark:border-gray-600 rounded bg-gray-100 dark:bg-gray-700 text-sm text-gray-900 dark:text-gray-100 resize-none mb-4"
                />

                {/* Build info */}
                <div className="space-y-1 text-sm mb-4">
                    <p><strong>Author:</strong> PSGRaptor</p>
                    <p><strong>Last Update:</strong> {lastUpdateStr}</p>
                    <p><strong>Version:</strong> {APP_VERSION || 'Unknown'}</p>
                    {COMMIT_HASH ? <p><strong>Commit:</strong> {COMMIT_HASH.slice(0, 7)}</p> : null}
                </div>

                {/* Links */}
                <div className="text-right">
                    <button
                        className="px-3 py-1 rounded bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 hover:bg-gray-200 dark:hover:bg-gray-700 transition"
                        onClick={() => window.api?.shellOpenExternal?.('https://github.com/PSGRaptor/imagenexus')}
                    >
                        GitHub
                    </button>
                </div>
            </div>
        </div>
    );
};

export default AboutModal;
