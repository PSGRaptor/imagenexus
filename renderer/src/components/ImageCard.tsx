// FILE: renderer/src/components/ImageCard.tsx
import React from 'react';
import { ImageItem } from '@/context/ImagesContext';
import { useSettings } from '@/context/SettingsContext';
import { toFileUrl } from '@/lib/fileurl';

type Props = {
    item: ImageItem;
    onOpen: (it: ImageItem) => void;
};

const ImageCard: React.FC<Props> = ({ item, onOpen }) => {
    const { settings } = useSettings();

    // Normalize any initial thumb path into a file:/// URL
    const [src, setSrc] = React.useState<string | null>(item.thumb ? toFileUrl(item.thumb) : null);

    React.useEffect(() => {
        let cancelled = false;

        // If the scanner already supplied a thumb path, just use it.
        if (item.thumb) {
            setSrc(toFileUrl(item.thumb));
            return () => {
                cancelled = true;
            };
        }

        (async () => {
            try {
                const max = settings?.thumbnail?.maxSize ?? 512;
                const thumbPath = await window.api.getThumbnail(item.path, max);
                if (!cancelled) setSrc(toFileUrl(thumbPath));
            } catch {
                if (!cancelled) setSrc(null);
            }
        })();

        return () => {
            cancelled = true;
        };
    }, [item.path, item.thumb, settings?.thumbnail?.maxSize]);

    return (
        <button
            type="button"
            className="rounded overflow-hidden bg-gray-900 border border-gray-800 text-left focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-600"
            onClick={() => onOpen(item)}
            title={item.name}
        >
            {src ? (
                <img
                    src={src}
                    alt={item.name}
                    className="w-full h-[200px] object-cover bg-gray-800"
                    draggable={false}
                />
            ) : (
                <div className="w-full h-[200px] bg-gray-800" />
            )}
            <div className="p-2">
                <div className="text-sm truncate">{item.name}</div>
                <div className="text-xs text-gray-400 truncate">{item.folder}</div>
            </div>
        </button>
    );
};

export default ImageCard;
