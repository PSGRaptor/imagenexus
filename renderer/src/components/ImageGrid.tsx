// START OF FILE: renderer/src/components/ImageGrid.tsx
import React from 'react';
import { useImages } from '@/context/ImagesContext';
import ImageCard from '@/components/ImageCard';

const ImageGrid: React.FC<{ onOpenImage?: (path: string) => void }> = ({ onOpenImage }) => {
    const { filtered } = useImages();

    // Track items hidden right after delete (local-only, non-invasive)
    const [hidden, setHidden] = React.useState<Set<string>>(() => new Set());

    const openAt = (idx: number) => {
        const it = filtered[idx];
        if (it) onOpenImage?.(it.path);
    };

    // Apply local hide filter after deletion
    const visible = React.useMemo(
        () => filtered.filter((it) => !hidden.has(it.path)),
        [filtered, hidden]
    );

    const handleDeleted = (path: string) => {
        setHidden((prev) => {
            const next = new Set(prev);
            next.add(path);
            return next;
        });
    };

    return (
        <div
            className="grid gap-3"
            // Use slider-driven CSS var; default to 200px if not set.
            style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(var(--thumb-size, 200px), 1fr))' }}
        >
            {visible.map((it, i) => (
                <ImageCard
                    key={it.path}
                    item={it}
                    onOpen={() => openAt(i)}
                    onDeleted={handleDeleted} // 👈 wire deletion
                />
            ))}
        </div>
    );
};

export default ImageGrid;
// END OF FILE: renderer/src/components/ImageGrid.tsx
