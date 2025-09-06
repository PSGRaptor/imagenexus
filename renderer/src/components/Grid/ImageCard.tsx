import React, { useEffect, useRef, useState } from 'react';

type Props = {
    filePath: string;
    name: string;
    folder: string;
    onClick: () => void;
};

const ImageCard: React.FC<Props> = ({ filePath, name, folder, onClick }) => {
    const [src, setSrc] = useState<string | null>(null);
    const [isVisible, setVisible] = useState(false);
    const ref = useRef<HTMLDivElement | null>(null);

    // Observe visibility to lazy request thumbnails
    useEffect(() => {
        const el = ref.current;
        if (!el) return;
        const io = new IntersectionObserver(
            (entries) => {
                const e = entries[0];
                if (e && e.isIntersecting) {
                    setVisible(true);
                } else {
                    setVisible(false);
                }
            },
            { root: null, rootMargin: '300px 0px', threshold: 0.01 }
        );
        io.observe(el);
        return () => io.disconnect();
    }, []);

    // Request thumbnail only when visible (and when filePath changes)
    useEffect(() => {
        if (!isVisible) return;
        let cancelled = false;
        (async () => {
            try {
                const url = await window.api.getThumbnail(filePath); // returns file:// URL
                if (!cancelled) setSrc(url);
            } catch {
                if (!cancelled) setSrc(null);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [isVisible, filePath]);

    return (
        <div
            ref={ref}
            className="group relative rounded-lg overflow-hidden border border-gray-800 bg-gray-900 hover:border-gray-700"
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
                        onError={() => setSrc(null)}
                    />
                ) : (
                    <div className="text-[10px] text-gray-500">loading…</div>
                )}
            </div>
            <div className="px-2 py-1 text-left">
                <div className="text-[11px] text-gray-300 truncate">{name}</div>
                <div className="text-[10px] text-gray-500 truncate">{folder}</div>
            </div>
        </div>
    );
};

export default ImageCard;
