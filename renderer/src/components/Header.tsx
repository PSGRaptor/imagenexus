import React from 'react';
import { useTheme } from '@/context/ThemeContext';
import { useSettings } from '@/context/SettingsContext';
import { useImages } from '@/context/ImagesContext';
import styles from './Header.module.css';
import btn from '@/styles/Buttons.module.css';
import appLogo from '@/assets/icons/icon-256.png';

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
                'sticky top-0 z-20 h-[56px] px-4',
                'bg-white dark:bg-gray-900',
                'border-b border-gray-200 dark:border-gray-800',
                'flex items-center',
                className || '',
            ].join(' ')}
        >
            {/* Left: brand/title */}
            <div className="flex items-center gap-3">
                <img
                    src={appLogo}
                    alt="Image Nexus logo"
                    className="w-8 h-8 rounded"
                />
                <div className={styles.title}>Image Nexus</div>
            </div>

            {/* Right: actions — aligned to window edge */}
            <div className="flex items-center gap-2 ml-auto whitespace-nowrap">
                <button className={btn.btnPrimary} onClick={toggleTheme}>
                    {settings?.theme === 'dark' ? 'Light' : 'Dark'}
                </button>
                <button className={btn.btnPrimary} onClick={rescan}>Activate</button>
                <button className={btn.btnPrimary} onClick={onOpenSettings}>Settings</button>
                <button className={btn.btnPrimary} onClick={onOpenAbout}>About</button>
            </div>
        </header>
    );
};

export default Header;
