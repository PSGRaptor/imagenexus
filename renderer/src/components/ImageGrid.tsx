import React from 'react';
import { useImages, ImageItem } from '@/context/ImagesContext';
import ImageCard from '@/components/ImageCard';

const ImageGrid: React.FC<{ onOpenImage: (path: string) => void }> = ({ onOpenImage }) => {
    const { filtered, setSelected, selected } = useImages();

    const openAt = (idx: number) => {
        const it = filtered[idx];
        if (it) onOpenImage(it.path);
    };

    return (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3">
            {filtered.map((it, i) => (
                <ImageCard key={it.path} item={it} onOpen={() => openAt(i)} />
            ))}
        </div>
    );
};

export default ImageGrid;
