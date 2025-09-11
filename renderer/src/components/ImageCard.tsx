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

type ImageCardProps = {
    item: ImageItem;
    onOpen?: (item: ImageItem) => void;
    onDeleted?: (path: string) => void; // 👈 new
};

const ImageCard: React.FC<ImageCardProps> = ({ item, onOpen, onDeleted }) => {
    // Thumbnails now come back as data: URLs; if absent, fall back to file://
    const src = item.thumb || toFileUrl(item.path);

    // Preserve original case (e.g., "jpeg", "Webp", "PNG")
    const fileLabel = React.useMemo(() => {
        const base = (item?.name || item?.path || '').split(/[\\/]/).pop() || '';
        const idx = base.lastIndexOf('.');
        return idx >= 0 ? base.slice(idx + 1) : '';
    }, [item?.name, item?.path]);

    const handleDeleteClick: React.MouseEventHandler<HTMLDivElement> = async (e) => {
        e.stopPropagation(); // prevent opening the modal
        e.preventDefault();

        if (!item?.path) return;

        const ok = confirm(`Delete this file (moves to Recycle Bin)?\n\n${item.path}`);
        if (!ok) return;

        try {
            const api = (window as any).api;
            const result = await api?.deleteFile?.(item.path);
            if (result?.ok) {
                onDeleted?.(item.path); // hide immediately in the grid
            } else {
                alert(result?.error || 'Failed to delete file.');
            }
        } catch (err: any) {
            alert(err?.message || 'Failed to delete file.');
        }
    };

    return (
        <button
            className="group relative block rounded-lg overflow-hidden border border-neutral-800 bg-neutral-900 hover:border-neutral-700 text-left"
            onClick={() => onOpen?.(item)}
            title={item.name}
            style={{ aspectRatio: '3 / 4' }}  // ✅ 3:4 tiles as before
        >
            {/* Image layer + overlays */}
            <div className="relative w-full h-full">
                <img
                    src={src}
                    alt={item.name}
                    className="absolute inset-0 w-full h-full object-cover"
                    draggable={false}
                    loading="lazy"
                    decoding="async"
                    onError={(e) => {
                        // Fallback to original file if the thumbnail data URL fails
                        const el = e.currentTarget as HTMLImageElement;
                        const fallback = toFileUrl(item.path);
                        if (el.src !== fallback) el.src = fallback;
                    }}
                />

                {/* Lower-right: file-type label */}
                <span
                    className="pointer-events-none absolute bottom-1 right-1 px-1.5 py-0.5 rounded text-[10px] leading-none
                               bg-black/60 text-white tracking-wide"
                    title={fileLabel ? `File type: ${fileLabel}` : undefined}
                >
                    {fileLabel || '—'}
                </span>

                {/* Lower-left: trash control (visible on hover) */}
                <div
                    role="button"
                    aria-label="Delete image"
                    title="Delete image"
                    onClick={handleDeleteClick}
                    className="absolute bottom-1 left-1 p-1 rounded bg-black/60 text-white
                               opacity-0 group-hover:opacity-100 transition-opacity"
                >
                    {/* trash icon */}
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                        <path d="M9 3h6a1 1 0 0 1 1 1v1h4v2h-1v13a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V7H4V5h4V4a1 1 0 0 1 1-1Zm1 2h4V5h-4Zm-2 4v11h8V9H8Zm2 2h2v7h-2v-7Zm4 0h2v7h-2v-7Z"/>
                    </svg>
                </div>
            </div>

            {/* Existing filename bar (unchanged) */}
            <div className="text-xs text-neutral-300 p-2 truncate bg-neutral-950/80">
                {item.name}
            </div>
        </button>
    );
};

export default ImageCard;
// END OF FILE: renderer/src/components/ImageCard.tsx
