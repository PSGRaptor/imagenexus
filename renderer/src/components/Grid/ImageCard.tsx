import React from 'react';
import { ImageItem } from '@/context/ImagesContext';
import { useSettings } from '@/context/SettingsContext';
import { toFileUrl } from '@/lib/fileurl';

const ImageCard: React.FC<{ item: ImageItem; onOpen: (it: ImageItem) => void }> = ({ item, onOpen }) => {
    const { settings } = useSettings();
    const [src, setSrc] = React.useState<string | null>(item.thumb ? toFileUrl(item.thumb) : null);

    React.useEffect(() => {
        let cancelled = false;

        if (item.thumb) {
            setSrc(toFileUrl(item.thumb));
            return;
        }

        (async () => {
            try {
                const max = settings?.thumbnail?.maxSize ?? 512;
                const pathOrUrl = await window.api.getThumbnail(item.path, max);
                if (!cancelled) setSrc(toFileUrl(pathOrUrl));
            } catch {
                if (!cancelled) setSrc(null);
            }
        })();

        return () => { cancelled = true; };
    }, [item.path, item.thumb, settings?.thumbnail?.maxSize]);

    return (
        <button
            className="rounded overflow-hidden bg-gray-900 border border-gray-800 text-left"
            onClick={() => onOpen(item)}
            title={item.name}
        >
            {src ? (
                <img src={src} alt={item.name} className="w-full h-[200px] object-cover" />
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
