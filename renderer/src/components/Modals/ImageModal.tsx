import React from 'react';
import { ImageItem, ImageMetadata } from '@/context/ImagesContext';

type Props = {
    open?: boolean;
    item?: ImageItem | null;
    onClose?: () => void;
    onNext?: () => void;
    onPrev?: () => void;
};

const Panel: React.FC<{ title: string; children: React.ReactNode; defaultOpen?: boolean }> = ({
                                                                                                  title,
                                                                                                  children,
                                                                                                  defaultOpen = true,
                                                                                              }) => {
    const [open, setOpen] = React.useState(defaultOpen);
    return (
        <div className="border border-gray-800 rounded-lg overflow-hidden">
            <button
                className="w-full text-left px-3 py-2 bg-gray-900 hover:bg-gray-800 flex items-center justify-between"
                onClick={() => setOpen((v) => !v)}
            >
                <span className="font-medium">{title}</span>
                <span className="text-gray-400">{open ? '▾' : '▸'}</span>
            </button>
            {open && <div className="p-3 text-sm">{children}</div>}
        </div>
    );
};

const ImageModal: React.FC<Props> = ({ open = false, item, onClose, onNext, onPrev }) => {
    const [meta, setMeta] = React.useState<ImageMetadata | null>(null);

    // Load metadata when item changes
    React.useEffect(() => {
        let ignore = false;
        (async () => {
            if (!item?.path) {
                setMeta(null);
                return;
            }
            try {
                const m = await (window as any).api?.getMetadata?.(item.path);
                if (!ignore) setMeta(m || null);
            } catch {
                if (!ignore) setMeta(null);
            }
        })();
        return () => {
            ignore = true;
        };
    }, [item?.path]);

    // Keyboard shortcuts: Esc, ←, →
    React.useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (!open) return;
            if (e.key === 'Escape') onClose?.();
            if (e.key === 'ArrowRight') onNext?.();
            if (e.key === 'ArrowLeft') onPrev?.();
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [open, onClose, onNext, onPrev]);

    if (!open) return null;

    const copy = (text: string) => {
        try {
            navigator.clipboard?.writeText(text);
        } catch {
            // ignore
        }
    };

    const prompt = meta?.prompt ?? '';
    const negative = meta?.negative ?? '';
    const gen = meta?.generator ?? '';
    const settings: Record<string, any> = {
        Model: meta?.model,
        Sampler: meta?.sampler,
        Steps: meta?.steps,
        CFG: meta?.cfg,
        Seed: meta?.seed,
        Size: meta?.size,
        Generator: gen,
    };

    return (
        <div className="fixed inset-0 bg-black/75 flex items-center justify-center z-50">
            <div className="w-[92vw] h-[92vh] bg-gray-950 border border-gray-800 rounded-xl grid grid-cols-[1fr_420px] overflow-hidden">
                {/* Image side */}
                <div className="bg-black flex items-center justify-center p-3">
                    {item?.path ? (
                        <img
                            src={`file://${item.path}`}
                            alt={item.name}
                            className="max-w-full max-h-full object-contain"
                        />
                    ) : (
                        <div className="text-gray-400">No image</div>
                    )}
                </div>

                {/* Metadata side */}
                <div className="bg-gray-950 p-3 space-y-3 overflow-auto">
                    <div className="flex items-center justify-between">
                        <div>
                            <div className="font-medium">{item?.name}</div>
                            <div className="text-xs text-gray-400">{item?.folder}</div>
                        </div>
                        <div className="flex gap-2">
                            <button className="px-2 py-1 rounded bg-gray-800 border border-gray-700" onClick={() => onPrev?.()}>
                                ←
                            </button>
                            <button className="px-2 py-1 rounded bg-gray-800 border border-gray-700" onClick={() => onNext?.()}>
                                →
                            </button>
                            <button className="px-2 py-1 rounded bg-gray-800 border border-gray-700" onClick={() => onClose?.()}>
                                Close
                            </button>
                        </div>
                    </div>

                    <div className="flex gap-2">
                        <button
                            className="px-2 py-1 rounded bg-gray-800 border border-gray-700"
                            onClick={() => copy([prompt, negative && `Negative: ${negative}`].filter(Boolean).join('\n\n'))}
                            title="Copy Prompt"
                        >
                            Copy Prompt
                        </button>
                        <button
                            className="px-2 py-1 rounded bg-gray-800 border border-gray-700"
                            onClick={() => copy(JSON.stringify(meta ?? {}, null, 2))}
                            title="Copy All"
                        >
                            Copy All
                        </button>
                        <button
                            className="px-2 py-1 rounded bg-gray-800 border border-gray-700"
                            onClick={() => (window as any).api?.openInExplorer?.(item?.path)}
                            title="Show in Explorer"
                        >
                            Show in Explorer
                        </button>
                        <button
                            className="px-2 py-1 rounded bg-gray-800 border border-gray-700"
                            onClick={() => (window as any).api?.copyPath?.(item?.path)}
                            title="Copy Path"
                        >
                            Copy Path
                        </button>
                    </div>

                    <Panel title="Prompt" defaultOpen>
                        <pre className="whitespace-pre-wrap text-sm">{prompt || <span className="text-gray-500">—</span>}</pre>
                    </Panel>

                    <Panel title="Negative Prompt">
                        <pre className="whitespace-pre-wrap text-sm">{negative || <span className="text-gray-500">—</span>}</pre>
                    </Panel>

                    <Panel title="Generation Settings">
                        <table className="w-full text-sm">
                            <tbody>
                            {Object.entries(settings).map(([k, v]) => (
                                <tr key={k} className="border-b border-gray-800 last:border-none">
                                    <td className="py-1 pr-3 text-gray-400">{k}</td>
                                    <td className="py-1">{v ?? <span className="text-gray-500">—</span>}</td>
                                </tr>
                            ))}
                            </tbody>
                        </table>
                    </Panel>

                    <Panel title="Raw JSON">
            <pre className="whitespace-pre-wrap text-xs">
              {meta?.raw ? JSON.stringify(meta.raw, null, 2) : <span className="text-gray-500">—</span>}
            </pre>
                    </Panel>
                </div>
            </div>
        </div>
    );
};

export default ImageModal;
