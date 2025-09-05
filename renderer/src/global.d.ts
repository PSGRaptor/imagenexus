import type { ImageItem, ImageMetadata, ScanResult, UserSettings } from './types';

declare global {
    interface Window {
        api: {
            getSettings(): Promise<UserSettings>;
            setSettings(s: UserSettings): Promise<void>;
            pickFolder(): Promise<string | null>;
            scan(): Promise<ScanResult>;
            startWatch(): Promise<void>;
            stopWatch(): Promise<void>;
            onImagesChanged(cb: () => void): void;

            getMetadata(filePath: string): Promise<ImageMetadata>;
            getThumbnail(filePath: string): Promise<string>;
            openInExplorer(filePath: string): Promise<void>;
            copyPath(filePath: string): Promise<void>;
            exportMetadata(filePath: string): Promise<string>;
            setFavorite(filePath: string, fav: boolean): Promise<void>;
            batchMove(files: string[], dest: string): Promise<void>;
            batchDelete(files: string[]): Promise<void>;

            writeText(text: string): void;
            shellOpenExternal(url: string): void;
        };
    }
}
export {};
