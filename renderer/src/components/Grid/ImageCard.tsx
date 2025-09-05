import React, { useEffect, useState } from 'react';

type Props = {
    filePath: string;
    name: string;
    folder: string;
    onClick: () => void;
};

const ImageCard: React.FC<Props> = ({ filePath, name, folder, onClick }) => {
    const [src, setSrc] = useState<string | null>(null);

    useEffect(() => {
        let mounted = true;
        (async () => {
            try {
                const url = await window.api.getThumbnail(filePath); // returns file:// URL
                if (mounted) setSrc(url);
            } catch {
                if (mounted) setSrc(null);
            }
        })();
        return () => { mounted = false; };
    }, [filePath]);

    return (
        <button
            className="group relative rounded-lg overflow-hidden border border-gray-800 bg-gray-900 hover:border-gray-700 focus:outline-none"
            onClick={onClick}
            title={name}
        >
            <div className="aspect-square w-full bg-gray-950 flex items-center justify-center">
                {src ? (
                    <img
                        src={src}
                        alt={name}
                        className="h-full w-full object-cover select-none"
                        draggable={false}
                        loading="lazy"
                    />
                ) : (
                    <div className="text-xs text-gray-500">image</div>
                )}
            </div>
            <div className="px-2 py-1 text-left">
                <div className="text-[11px] text-gray-300 truncate">{name}</div>
                <div className="text-[10px] text-gray-500 truncate">{folder}</div>
            </div>
        </button>
    );
};

export default ImageCard;
