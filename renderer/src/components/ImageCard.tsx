// START OF FILE: renderer/src/components/ImageCard.tsx
import React from 'react';
import type { ImageItem } from '@/context/ImagesContext';

function toFileUrl(p?: string): string {
    if (!p) return '';
    if (/^(data:|blob:|https?:|atom:|app:|file:)/i.test(p)) return p;
    let s = p.replace(/\\/g, '/');
    if (/^[A-Za-z]:/.test(s)) s = '/' + s;
    return encodeURI('file://' + s);
}

const ImageCard: React.FC<{ item: ImageItem; onOpen?: (item: ImageItem) => void }> = ({ item, onOpen }) => {
    // Thumbnails now come back as data: URLs from main; if absent, fall back to file://
    const src = item.thumb || toFileUrl(item.path);

    return (
        <button
            className="group block rounded-lg overflow-hidden border border-neutral-800 bg-neutral-900 hover:border-neutral-700 text-left"
            onClick={() => onOpen?.(item)}
            title={item.name}
            style={{ aspectRatio: '3 / 4' }}  // ✅ 3:4 tiles
        >
            <img
                src={src}
                alt={item.name}
                className="w-full h-full object-cover"
                draggable={false}
                loading="lazy"
                decoding="async"
                onError={(e) => {
                    // Fallback to original file if the thumbnail data URL fails for any reason
                    const el = e.currentTarget as HTMLImageElement;
                    const fallback = toFileUrl(item.path);
                    if (el.src !== fallback) el.src = fallback;
                }}
            />
            <div className="text-xs text-neutral-300 p-2 truncate bg-neutral-950/80">
                {item.name}
            </div>
        </button>
    );
};

export default ImageCard;
// END OF FILE: renderer/src/components/ImageCard.tsx
