import React from 'react';
import { useImages, ImageItem } from '@/context/ImagesContext';
import ImageCard from '@/components/ImageCard';

const ImageGrid: React.FC<{ onOpenImage: (path: string) => void }> = ({ onOpenImage }) => {
    const { filtered } = useImages();

    const openAt = (idx: number) => {
        const it = filtered[idx];
        if (it) onOpenImage(it.path);
    };

    return (
        <div className="grid gap-3"
             style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))' }}>
            {filtered.map((it, i) => (
                <ImageCard
                    key={it.path}
                    item={it}
                    onOpen={(item: ImageItem) => openAt(i)}
                />
            ))}
        </div>
    );
};

export default ImageGrid;
