// FILE: renderer/src/global.d.ts
import type { Settings } from '@/context/SettingsContext';

declare global {
    interface Window {
        api: {
            // Settings
            getSettings: () => Promise<Settings>;
            saveSettings: (s: Settings) => Promise<void>;
            setSettings: (s: Settings) => Promise<void>; // legacy alias
            pickFolder: () => Promise<string | null>;
            pickFolderLegacy: () => Promise<string | null>;

            // Scan & Watch
            scanImages: (rootPath: string) => Promise<any[]>;
            startWatch: (rootPath: string) => Promise<void>;
            stopWatch: () => Promise<void>;
            onWatchEvent: (
                cb: (payload: { evt: 'add' | 'unlink' | 'change'; file: string }) => void
            ) => () => void;

            // Metadata & Thumbnails
            getMetadata: (filePath: string) => Promise<any>;
            getThumbnail: (filePath: string, maxSize: number) => Promise<string | undefined>;
            /** Exposed by preload.ts; used by ImageModal for single-image viewer */
            getImageDataUrl: (filePath: string) => Promise<string>;

            // Favorites
            toggleFavorite: (filePath: string) => Promise<boolean>;
            isFavorite: (filePath: string) => Promise<boolean>;
            listFavorites: () => Promise<string[]>;

            // File ops
            openInExplorer: (filePath: string) => Promise<boolean>;
            copyPath: (filePath: string) => Promise<boolean>;
            exportMetadata: (filePath: string, text: string) => Promise<string>;
            deleteFiles: (paths: string[]) => Promise<boolean>;
            moveFiles: (paths: string[], targetDir: string) => Promise<boolean>;

            // Utils
            shellOpenExternal: (url: string) => void;
        };
    }
}

export {};
