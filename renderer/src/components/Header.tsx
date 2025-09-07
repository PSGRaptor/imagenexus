import React from 'react';
import { useTheme } from '@/context/ThemeContext';
import { useSettings } from '@/context/SettingsContext';
import { useImages } from '@/context/ImagesContext';
import styles from './Header.module.css';

type Props = {
    onOpenSettings: () => void;
    onOpenAbout: () => void;
    className?: string;
};

const Header: React.FC<Props> = ({ onOpenSettings, onOpenAbout, className }) => {
    const { toggleTheme } = useTheme();
    const { settings } = useSettings();
    const { rescan } = useImages();

    return (
        <header
            className={[
                // base
                'sticky top-0 z-20 h-[56px] px-4 bg-gray-900 border-b border-gray-800',
                // layout: flex so ml-auto works
                'flex items-center',
                // allow parent to extend placement (e.g., col-span-2)
                className || '',
            ].join(' ')}
        >
            {/* Left: brand/title */}
            <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-blue-600" />
                <div className={styles.title}>Image Nexus</div>
            </div>

            {/* Right: actions — pushed to far right */}
            <div className="flex items-center gap-2 ml-auto whitespace-nowrap">
                <button className={styles.btn} onClick={toggleTheme}>
                    {settings?.theme === 'dark' ? 'Light' : 'Dark'}
                </button>
                <button className={styles.btn} onClick={rescan}>Activate</button>
                <button className={styles.btn} onClick={onOpenSettings}>Settings</button>
                <button className={styles.btn} onClick={onOpenAbout}>About</button>
            </div>
        </header>
    );
};

export default Header;
