import React, { useEffect, useState } from 'react';
import styles from './ImageCard.module.css';
import type { ImageItem } from '../types';

const ImageCard: React.FC<{ item: ImageItem; onOpen: (it: ImageItem) => void; }> = ({ item, onOpen }) => {
    const [thumb, setThumb] = useState<string>('');

    useEffect(() => {
        (async () => {
            const t = await window.api.getThumbnail(item.path);
            setThumb(`file://${t}`);
        })();
    }, [item.path]);

    return (
        <div className={styles.card} onClick={() => onOpen(item)}>
            <img src={thumb} alt={item.name} className="w-full h-48 object-cover" draggable={false} />
            <div className="p-2">
                <div className="text-sm truncate">{item.name}</div>
                <div className="text-xs text-gray-400 truncate">{item.folder}</div>
            </div>
            <div className={styles.badges}>
                {item.nsfw && <span className={styles.badge}>NSFW</span>}
            </div>
            <button
                className={styles.star}
                onClick={async (e) => {
                    e.stopPropagation();
                    await window.api.setFavorite(item.path, !item.favorite);
                    // images list updates via main event
                }}
                title={item.favorite ? 'Unfavorite' : 'Favorite'}
            >
                {item.favorite ? '★' : '☆'}
            </button>
        </div>
    );
};

export default ImageCard;
