import React, { useEffect, useState } from 'react';
import type { ImageItem } from '../types';

const ImageCard: React.FC<{ item: ImageItem; onOpen: (it: ImageItem) => void; }> = ({ item, onOpen }) => {
    const [src, setSrc] = useState<string | null>(null);

    useEffect(() => {
        let mounted = true;
        (async () => {
            try {
                const url = await window.api.getThumbnail(item.path); // already file://
                if (mounted) setSrc(url);
            } catch {
                if (mounted) setSrc(null);
            }
        })();
        return () => { mounted = false; };
    }, [item.path]);

    return (
        <div className="relative rounded-xl2 border border-gray-800 overflow-hidden bg-gray-900 hover:border-brand-600 cursor-pointer" onClick={() => onOpen(item)}>
            <div className="w-full h-48 bg-gray-950 flex items-center justify-center">
                {src ? (
                    <img
                        src={src}
                        alt={item.name}
                        className="w-full h-full object-cover"
                        draggable={false}
                        onError={() => setSrc(null)}
                    />
                ) : (
                    <div className="text-xs text-gray-500">image</div>
                )}
            </div>
            <div className="p-2">
                <div className="text-sm truncate">{item.name}</div>
                <div className="text-xs text-gray-400 truncate">{item.folder}</div>
            </div>
            {item.nsfw && <span className="absolute top-1 left-1 text-[10px] px-1.5 py-0.5 rounded bg-gray-800/90">NSFW</span>}
            <button
                className="absolute top-1 right-1 px-1 py-0.5 rounded bg-gray-800 hover:bg-gray-700"
                onClick={async (e) => { e.stopPropagation(); await window.api.setFavorite(item.path, !item.favorite); }}
                title={item.favorite ? 'Unfavorite' : 'Favorite'}
            >
                {item.favorite ? '★' : '☆'}
            </button>
        </div>
    );
};

export default ImageCard;
