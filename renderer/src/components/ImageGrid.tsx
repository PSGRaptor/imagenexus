import React, { useEffect, useMemo, useState } from 'react';
import { useImages } from '../context/ImagesContext';
import ImageCard from './ImageCard';
import type { ImageItem } from '../types';
import ImageModal from './Modals/ImageModal';

const ImageGrid: React.FC = () => {
    const { filtered } = useImages();
    const [open, setOpen] = useState(false);
    const [current, setCurrent] = useState<ImageItem | null>(null);
    const [index, setIndex] = useState(0);

    const list = filtered;

    const openAt = (i: number) => {
        const it = list[i];
        if (!it) return;
        setIndex(i);
        setCurrent(it);
        setOpen(true);
    };

    const onNext = () => openAt(Math.min(list.length - 1, index + 1));
    const onPrev = () => openAt(Math.max(0, index - 1));

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (!open) return;
            if (e.key === 'ArrowRight') onNext();
            if (e.key === 'ArrowLeft') onPrev();
            if (e.key === 'Escape') setOpen(false);
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [open, index, list]);

    return (
        <div className="h-full overflow-auto p-4">
            <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))' }}>
                {list.map((it, i) => (
                    <ImageCard key={it.path} item={it} onOpen={() => openAt(i)} />
                ))}
            </div>
            <ImageModal open={open} item={current} onClose={() => setOpen(false)} onNext={onNext} onPrev={onPrev} />
        </div>
    );
};

export default ImageGrid;
