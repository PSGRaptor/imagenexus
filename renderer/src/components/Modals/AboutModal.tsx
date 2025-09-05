import React from 'react';
import styles from './Modals/ImageModal.module.css';

const AboutModal: React.FC<{ open: boolean; onClose: () => void; }> = ({ open, onClose }) => {
    if (!open) return null;
    return (
        <div className={styles.backdrop} onClick={onClose}>
            <div className="w-[520px] rounded-xl2 bg-gray-950 border border-gray-800 p-4" onClick={e => e.stopPropagation()}>
                <div className="flex items-center gap-3 mb-3">
                    <div className="w-10 h-10 rounded-full bg-brand-600" />
                    <div className="text-lg font-semibold">Image Nexus</div>
                </div>
                <div className="text-sm text-gray-300 mb-4">
                    Prompt & metadata viewer for AI image output folders.<br />
                    Mirrors ModelsNexus layout, theming, and modals.
                </div>
                <div className="text-xs text-gray-400">Version 0.1.0</div>
                <div className="mt-3">
                    <button className="px-3 py-1 rounded bg-gray-800 border border-gray-700 hover:bg-gray-700" onClick={() => window.api.shellOpenExternal('https://github.com/PSGRaptor/ModelsNexus')}>Repo</button>
                    <button className="ml-2 px-3 py-1 rounded bg-gray-800 border border-gray-700 hover:bg-gray-700" onClick={onClose}>Close</button>
                </div>
            </div>
        </div>
    );
};
export default AboutModal;
