// START OF FILE: renderer/src/components/ImageGrid.tsx
import React from 'react';
import { useImages } from '@/context/ImagesContext';
import ImageCard from '@/components/ImageCard';

const ImageGrid: React.FC<{ onOpenImage?: (path: string) => void }> = ({ onOpenImage }) => {
    const { filtered } = useImages();

    const openAt = (idx: number) => {
        const it = filtered[idx];
        if (it) onOpenImage?.(it.path);
    };

    return (
        <div
            className="grid gap-3"
            // Use slider-driven CSS var; default to 200px if not set.
            style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(var(--thumb-size, 200px), 1fr))' }}
        >
            {filtered.map((it, i) => (
                <ImageCard key={it.path} item={it} onOpen={() => openAt(i)} />
            ))}
        </div>
    );
};

export default ImageGrid;
// END OF FILE: renderer/src/components/ImageGrid.tsx
