import React from 'react';
import styles from './Header.module.css';
import { useTheme } from '@/context/ThemeContext';
import { useSettings } from '@/context/SettingsContext';
import { useImages } from '@/context/ImagesContext';

const Header: React.FC<{ onOpenSettings: () => void; onOpenAbout: () => void }> = ({
                                                                                       onOpenSettings,
                                                                                       onOpenAbout,
                                                                                   }) => {
    const { toggleTheme } = useTheme();
    const { settings } = useSettings();
    const { rescan } = useImages();

    return (
        <header className="h-[var(--header-h)] flex items-center justify-between px-4 bg-gray-900 border-b border-gray-800">
            <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-blue-600" />
                <div className={styles.title}>Image Nexus</div>
            </div>
            <div className="flex items-center gap-2">
                <button className={styles.btn} onClick={() => toggleTheme()}>
                    {settings?.theme === 'dark' ? 'Light' : 'Dark'}
                </button>
                <button className={styles.btn} onClick={async () => { try { await rescan(); } catch {} }}>
                    Activate
                </button>
                <button className={styles.btn} onClick={onOpenSettings}>Settings</button>
                <button className={styles.btn} onClick={onOpenAbout}>About</button>
            </div>
        </header>
    );
};

export default Header;
