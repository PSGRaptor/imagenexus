import React, { useEffect, useMemo, useState } from 'react';
import styles from './ImageModal.module.css';
import type { ImageItem, ImageMetadata } from '../../types';

const Collapsible: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => {
    const [open, setOpen] = useState(true);
    return (
        <div className={styles.section}>
            <div className="flex items-center justify-between">
                <div className={styles.sectionTitle}>{title}</div>
                <button className={styles.btn} onClick={() => setOpen(o => !o)}>{open ? 'Hide' : 'Show'}</button>
            </div>
            {open && <div className="text-sm">{children}</div>}
        </div>
    );
};

const ImageModal: React.FC<{
    open?: boolean;
    item?: ImageItem | null;
    onClose?: () => void;
    onNext?: () => void;
    onPrev?: () => void;
}> = ({ open = false, item = null, onClose = () => {}, onNext = () => {}, onPrev = () => {} }) => {
    const [thumbUrl, setThumbUrl] = useState<string | null>(null);
    const [meta, setMeta] = useState<ImageMetadata | null>(null);

    useEffect(() => {
        if (!open || !item) return;
        let mounted = true;
        (async () => {
            try {
                const t = await window.api.getThumbnail(item.path); // file://
                const m = await window.api.getMetadata(item.path);
                if (!mounted) return;
                setThumbUrl(t);
                setMeta(m);
            } catch {
                if (!mounted) return;
                setThumbUrl(null);
                setMeta(null);
            }
        })();
        return () => { mounted = false; };
    }, [open, item?.path]);

    const copyAll = useMemo(() => {
        if (!meta) return '';
        return [
            meta.prompt ? `Prompt: ${meta.prompt}` : '',
            meta.negative ? `Negative: ${meta.negative}` : '',
            meta.model ? `Model: ${meta.model}` : '',
            meta.sampler ? `Sampler: ${meta.sampler}` : '',
            meta.steps !== undefined ? `Steps: ${meta.steps}` : '',
            meta.cfgScale !== undefined ? `CFG: ${meta.cfgScale}` : '',
            meta.seed !== undefined ? `Seed: ${meta.seed}` : '',
            meta.size ? `Size: ${meta.size}` : '',
        ].filter(Boolean).join('\n');
    }, [meta]);

    if (!open || !item) return null;

    return (
        <div className={styles.backdrop} onClick={onClose}>
            <div className={styles.panel} onClick={e => e.stopPropagation()}>
                <div className={styles.left}>
                    {thumbUrl ? (
                        <img src={thumbUrl} alt={item.name} className="max-h-full max-w-full object-contain" />
                    ) : (
                        <div className="text-xs text-gray-500">preview</div>
                    )}
                </div>
                <div className={styles.right}>
                    <div className="flex items-center gap-2 mb-3">
                        <button className={styles.btn} onClick={onPrev}>&larr;</button>
                        <button className={styles.btn} onClick={onNext}>&rarr;</button>
                        <button className={styles.btn} onClick={() => window.api.openInExplorer(item.path)}>Open in Explorer</button>
                        <button className={styles.btn} onClick={() => window.api.copyPath(item.path)}>Copy path</button>
                        <button className={styles.btn} onClick={async () => {
                            const p = await window.api.exportMetadata(item.path);
                            window.api.writeText(p);
                        }}>Export metadata</button>
                        <button className={styles.btn} onClick={onClose}>Close (Esc)</button>
                    </div>

                    <Collapsible title="Prompt">
                        {meta?.prompt || <span className="text-gray-500">—</span>}
                        <div className="mt-2">
                            <button className={styles.btn} disabled={!meta?.prompt} onClick={() => meta?.prompt && window.api.writeText(meta.prompt!)}>Copy Prompt</button>
                            <button className={styles.btn} disabled={!copyAll} onClick={() => copyAll && window.api.writeText(copyAll)}>Copy All</button>
                        </div>
                    </Collapsible>

                    <Collapsible title="Negative">
                        {meta?.negative || <span className="text-gray-500">—</span>}
                    </Collapsible>

                    <Collapsible title="Generation Settings">
                        <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
                            <div>Model</div><div className="text-gray-300">{meta?.model || '—'}</div>
                            <div>Sampler</div><div className="text-gray-300">{meta?.sampler || '—'}</div>
                            <div>Steps</div><div className="text-gray-300">{meta?.steps ?? '—'}</div>
                            <div>CFG</div><div className="text-gray-300">{meta?.cfgScale ?? '—'}</div>
                            <div>Seed</div><div className="text-gray-300">{meta?.seed ?? '—'}</div>
                            <div>Size</div><div className="text-gray-300">{meta?.size || '—'}</div>
                            <div>Generator</div><div className="text-gray-300">{meta?.generator || '—'}</div>
                            <div>Source</div><div className="text-gray-300">{meta?.source || '—'}</div>
                        </div>
                    </Collapsible>

                    <Collapsible title="Raw JSON">
            <pre className="text-xs overflow-auto bg-gray-900 p-2 rounded">
              {typeof meta?.raw === 'string'
                  ? meta.raw
                  : JSON.stringify(meta?.raw ?? meta?.other ?? {}, null, 2)}
            </pre>
                    </Collapsible>
                </div>
            </div>
        </div>
    );
};

export default ImageModal;
