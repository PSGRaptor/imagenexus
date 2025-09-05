export type ImageFormat = 'png' | 'jpg' | 'jpeg' | 'webp';

export interface UserSettings {
    roots: string[];
    activeRoot: string;
    watch: boolean;
    theme: 'light' | 'dark';
    showNSFW: boolean;
    ignorePatterns: string[];
    thumbnail: { width: number; quality: number };
}

export interface ImageItem {
    path: string;
    name: string;
    folder: string;
    ext: ImageFormat;
    mtimeMs: number;
    width?: number;
    height?: number;
    nsfw?: boolean;
    favorite?: boolean;
}

export type MetaKV = Record<string, unknown>;

export interface ImageMetadata {
    source: 'embedded' | 'sidecar' | 'none';
    generator?: 'automatic1111' | 'comfyui' | 'invokeai' | 'sdnext' | 'fooocus' | 'novelai' | 'unknown';
    prompt?: string;
    negative?: string;
    model?: string;
    sampler?: string;
    seed?: string | number;
    steps?: number;
    cfgScale?: number;
    size?: string;
    other?: MetaKV;
    raw?: any;
}

export interface ScanResult {
    images: ImageItem[];
    total: number;
}
