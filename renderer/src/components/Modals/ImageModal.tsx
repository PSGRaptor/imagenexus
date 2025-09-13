import React from 'react';
import { ImageItem, ImageMetadata } from '@/context/ImagesContext';
import { toFileUrl } from '@/lib/fileurl';

type Props = {
    open?: boolean;
    item?: ImageItem | null;
    onClose?: () => void;
    onNext?: () => void;
    onPrev?: () => void;
};

// layout helpers
const imxRightPaneStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    minWidth: 0,
    minHeight: 0,
    borderLeft: '1px solid rgba(255,255,255,0.08)',
    background: 'var(--nx-right-bg, #13151b)',
};
const imxRightHeaderStyle: React.CSSProperties = {
    position: 'sticky',
    top: 0,
    zIndex: 5,
    background: 'var(--nx-right-bg, #13151b)',
    boxShadow: '0 1px 0 rgba(255,255,255,0.06)',
};
const imxMetaScrollStyle: React.CSSProperties = {
    flex: '1 1 auto',
    overflowY: 'auto',
    minHeight: 0,
    WebkitOverflowScrolling: 'touch',
};

const Panel: React.FC<{
    title: string;
    defaultOpen?: boolean;
    children: React.ReactNode;
}> = ({ title, defaultOpen = true, children }) => {
    const [isOpen, setIsOpen] = React.useState(defaultOpen);
    return (
        <div className="border border-gray-200 dark:border-gray-800 rounded-lg overflow-hidden">
            <button
                type="button"
                className="w-full text-left px-3 py-2 bg-gray-100 hover:bg-gray-50 dark:bg-gray-900 dark:hover:bg-gray-800 flex items-center justify-between"
                onClick={() => setIsOpen((v) => !v)}
            >
                <span className="font-medium">{title}</span>
                <span className="text-gray-500 dark:text-gray-400">
          {isOpen ? '▾' : '▸'}
        </span>
            </button>
            {isOpen && <div className="p-3 text-sm">{children}</div>}
        </div>
    );
};

const emptyMeta: ImageMetadata = {};

const ImageModal: React.FC<Props> = ({
                                         open = false,
                                         item,
                                         onClose,
                                         onNext,
                                         onPrev,
                                     }) => {
    const [meta, setMeta] = React.useState<ImageMetadata | null>(null);
    const [dataUrl, setDataUrl] = React.useState<string>('');

    // edit mode state
    const [isEditing, setIsEditing] = React.useState(false);
    const [isSaving, setIsSaving] = React.useState(false);
    const [form, setForm] = React.useState<{
        prompt: string;
        negative: string;
        model: string;
        sampler: string;
        steps?: number | string;
        cfg?: number | string;
        seed: string;
        size: string;
        generator: string;
    }>({
        prompt: '',
        negative: '',
        model: '',
        sampler: '',
        steps: '',
        cfg: '',
        seed: '',
        size: '',
        generator: '',
    });

    // load metadata
    React.useEffect(() => {
        let ignore = false;
        (async () => {
            if (!item?.path) {
                setMeta(null);
                setIsEditing(false);
                return;
            }
            try {
                const m = await (window as any).api?.getMetadata?.(item.path);
                if (!ignore) setMeta(m || null);
            } catch {
                if (!ignore) setMeta(null);
            } finally {
                if (!ignore) setIsEditing(false);
            }
        })();
        return () => { ignore = true; };
    }, [item?.path]);

    // load full image as data url
    React.useEffect(() => {
        let alive = true;
        if (!open || !item?.path) {
            setDataUrl('');
            return;
        }

        const fileUrl = toFileUrl(item.path);
        setDataUrl(fileUrl || '');

        const api = (window as any).api;
        if (typeof api?.getImageDataUrl === 'function') {
            api.getImageDataUrl(item.path)
                .then((url: string) => {
                    if (!alive) return;
                    setDataUrl(url || fileUrl || '');
                })
                .catch(() => {
                    if (!alive) return;
                    setDataUrl(fileUrl || '');
                });
        }
        return () => { alive = false; };
    }, [open, item?.path]);

    // keyboard shortcuts
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

    // hydrate form when editing
    React.useEffect(() => {
        if (!isEditing || !meta) return;
        setForm({
            prompt: meta.prompt ?? '',
            negative: meta.negative ?? '',
            model: meta.model ?? '',
            sampler: meta.sampler ?? '',
            steps: meta.steps ?? '',
            cfg: meta.cfg ?? '',
            seed: (meta.seed as any) ?? '',
            size: meta.size ?? '',
            generator: meta.generator ?? '',
        });
    }, [isEditing, meta]);

    if (!open) return null;

    const src = dataUrl || toFileUrl(item?.path);
    const mergedMeta = meta ?? emptyMeta;

    const prompt = mergedMeta.prompt ?? '';
    const negative = mergedMeta.negative ?? '';
    const gen = mergedMeta.generator ?? '';
    const settings: Record<string, any> = {
        Model: mergedMeta.model,
        Sampler: mergedMeta.sampler,
        Steps: mergedMeta.steps,
        CFG: mergedMeta.cfg,
        Seed: mergedMeta.seed,
        Size: mergedMeta.size,
        Generator: gen,
    };

    const copyText = (text: string) => {
        try { navigator.clipboard?.writeText(text); } catch {}
    };

    const setField = <K extends keyof typeof form>(key: K, val: any) => {
        setForm((f) => ({ ...f, [key]: val }));
    };

    const onEdit = () => {
        if (!meta) return;
        setIsEditing(true);
    };

    const onCancel = () => {
        setIsEditing(false);
        if (meta) {
            setForm({
                prompt: meta.prompt ?? '',
                negative: meta.negative ?? '',
                model: meta.model ?? '',
                sampler: meta.sampler ?? '',
                steps: meta.steps ?? '',
                cfg: meta.cfg ?? '',
                seed: (meta.seed as any) ?? '',
                size: meta.size ?? '',
                generator: meta.generator ?? '',
            });
        }
    };

    const onSave = async () => {
        if (!item?.path) return;
        setIsSaving(true);
        try {
            const patch: Record<string, unknown> = {
                prompt: form.prompt ?? '',
                negative: form.negative ?? '',
                model: form.model ?? '',
                sampler: form.sampler ?? '',
                steps: form.steps === '' || form.steps == null ? undefined : Number(form.steps),
                cfg: form.cfg === '' || form.cfg == null ? undefined : Number(form.cfg),
                seed: form.seed ?? '',
                size: form.size ?? '',
                generator: form.generator ?? '',
            };

            await (window as any).api?.setMetadata?.(item.path, patch);
            const updated = await (window as any).api?.getMetadata?.(item.path);
            setMeta(updated || null);
            setIsEditing(false);
        } catch (e) {
            console.error('Failed to save metadata:', e);
        } finally {
            setIsSaving(false);
        }
    };

    const renderEditor = () => (
        <div className="space-y-3">
            <Panel title="Prompt" defaultOpen>
        <textarea
            className="w-full min-h-[120px] p-2 rounded border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900"
            value={form.prompt}
            onChange={(e) => setField('prompt', e.target.value)}
            placeholder="Prompt…"
        />
            </Panel>

            <Panel title="Negative Prompt">
        <textarea
            className="w-full min-h-[80px] p-2 rounded border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900"
            value={form.negative}
            onChange={(e) => setField('negative', e.target.value)}
            placeholder="Negative prompt…"
        />
            </Panel>

            <Panel title="Generation Settings">
                <div className="grid grid-cols-2 gap-3">
                    <div>
                        <label className="block text-xs mb-1 text-gray-600 dark:text-gray-400">Model</label>
                        <input
                            className="w-full p-2 rounded border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900"
                            value={form.model}
                            onChange={(e) => setField('model', e.target.value)}
                            placeholder="sd_xl_base_1.0.safetensors"
                        />
                    </div>
                    <div>
                        <label className="block text-xs mb-1 text-gray-600 dark:text-gray-400">Sampler</label>
                        <input
                            className="w-full p-2 rounded border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900"
                            value={form.sampler}
                            onChange={(e) => setField('sampler', e.target.value)}
                            placeholder="Euler a / DPM++ SDE Karras…"
                        />
                    </div>
                    <div>
                        <label className="block text-xs mb-1 text-gray-600 dark:text-gray-400">Steps</label>
                        <input
                            type="number"
                            className="w-full p-2 rounded border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900"
                            value={form.steps ?? ''}
                            onChange={(e) =>
                                setField('steps', e.target.value === '' ? '' : Number(e.target.value))
                            }
                            placeholder="30"
                        />
                    </div>
                    <div>
                        <label className="block text-xs mb-1 text-gray-600 dark:text-gray-400">CFG</label>
                        <input
                            type="number"
                            step="0.1"
                            className="w-full p-2 rounded border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900"
                            value={form.cfg ?? ''}
                            onChange={(e) =>
                                setField('cfg', e.target.value === '' ? '' : Number(e.target.value))
                            }
                            placeholder="7"
                        />
                    </div>
                    <div>
                        <label className="block text-xs mb-1 text-gray-600 dark:text-gray-400">Seed</label>
                        <input
                            className="w-full p-2 rounded border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900"
                            value={form.seed ?? ''}
                            onChange={(e) => setField('seed', e.target.value)}
                            placeholder="123456789"
                        />
                    </div>
                    <div>
                        <label className="block text-xs mb-1 text-gray-600 dark:text-gray-400">Size</label>
                        <input
                            className="w-full p-2 rounded border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900"
                            value={form.size ?? ''}
                            onChange={(e) => setField('size', e.target.value)}
                            placeholder="1024x1024"
                        />
                    </div>
                    <div>
                        <label className="block text-xs mb-1 text-gray-600 dark:text-gray-400">Generator</label>
                        <input
                            className="w-full p-2 rounded border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900"
                            value={form.generator ?? ''}
                            onChange={(e) => setField('generator', e.target.value)}
                            placeholder="A1111 / ComfyUI / InvokeAI / …"
                        />
                    </div>
                </div>
            </Panel>

            <div className="flex gap-2">
                <button
                    className="px-3 py-1.5 rounded bg-green-600 text-white disabled:opacity-60"
                    onClick={onSave}
                    disabled={isSaving}
                    title="Save changes"
                >
                    {isSaving ? 'Saving…' : 'Save'}
                </button>
                <button
                    className="px-3 py-1.5 rounded bg-gray-200 dark:bg-gray-800 border border-gray-300 dark:border-gray-700"
                    onClick={onCancel}
                    disabled={isSaving}
                    title="Discard changes"
                >
                    Cancel
                </button>
            </div>
        </div>
    );

    return (
        <div
            className="fixed inset-0 bg-black/75 flex items-center justify-center z-50"
            role="dialog"
            aria-modal="true"
            aria-label="Image details"
        >
            <div className="w-[92vw] h-[92vh] bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl grid grid-cols-[1fr_420px] overflow-hidden min-h-0">
                {/* LEFT: image */}
                <div className="bg-gray-100 dark:bg-black flex items-center justify-center p-3">
                    {src ? (
                        <img
                            src={src}
                            alt={item?.name || ''}
                            className="max-w-full max-h-[calc(92vh-24px)] object-contain"
                            draggable={false}
                            onError={(e) => {
                                const el = e.currentTarget as HTMLImageElement;
                                const fallback = toFileUrl(item?.path);
                                if (fallback && el.src !== fallback) {
                                    el.src = fallback;
                                }
                            }}
                        />
                    ) : (
                        <div className="text-gray-500 dark:text-gray-400">No image</div>
                    )}
                </div>

                {/* RIGHT PANE */}
                <aside style={imxRightPaneStyle} className="min-h-0">
                    {/* Header (two rows) */}
                    <div style={imxRightHeaderStyle} className="bg-white dark:bg-gray-900 p-3">
                        {/* Row 1: Name + folder */}
                        <div className="flex items-center justify-between gap-3">
                            <div className="min-w-0">
                                <div className="font-medium truncate" title={item?.name}>
                                    {item?.name}
                                </div>
                                <div
                                    className="text-xs text-gray-600 dark:text-gray-400 truncate"
                                    title={item?.folder}
                                >
                                    {item?.folder}
                                </div>
                            </div>
                        </div>
                        {/* Row 2: Buttons (wrap as needed) */}
                        <div className="mt-2 flex flex-wrap gap-2">
                            {!isEditing && (
                                <button
                                    className="px-2 py-1 rounded bg-blue-600 text-white"
                                    onClick={onEdit}
                                    title="Edit metadata"
                                    disabled={!meta}
                                >
                                    Edit
                                </button>
                            )}
                            {isEditing && (
                                <>
                                    <button
                                        className="px-2 py-1 rounded bg-green-600 text-white disabled:opacity-60"
                                        onClick={onSave}
                                        title="Save metadata"
                                        disabled={isSaving}
                                    >
                                        {isSaving ? 'Saving…' : 'Save'}
                                    </button>
                                    <button
                                        className="px-2 py-1 rounded bg-gray-200 dark:bg-gray-800 border border-gray-300 dark:border-gray-700"
                                        onClick={onCancel}
                                        title="Cancel editing"
                                        disabled={isSaving}
                                    >
                                        Cancel
                                    </button>
                                </>
                            )}
                            <button
                                className="px-2 py-1 rounded bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700"
                                onClick={() => onPrev?.()}
                                title="Previous (←)"
                            >
                                ←
                            </button>
                            <button
                                className="px-2 py-1 rounded bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700"
                                onClick={() => onNext?.()}
                                title="Next (→)"
                            >
                                →
                            </button>
                            <button
                                className="px-2 py-1 rounded bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700"
                                onClick={() => onClose?.()}
                                title="Close (Esc)"
                            >
                                Close
                            </button>
                        </div>
                    </div>

                    {/* Scrolling content */}
                    <div style={imxMetaScrollStyle} className="bg-white dark:bg-gray-900 p-3 space-y-3">
                        {/* Quick actions */}
                        {!isEditing && (
                            <div className="flex flex-wrap gap-2">
                                <button
                                    className="px-2 py-1 rounded bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700"
                                    onClick={() =>
                                        copyText(
                                            [prompt, negative && `Negative: ${negative}`]
                                                .filter(Boolean)
                                                .join('\n\n')
                                        )
                                    }
                                    title="Copy Prompt"
                                >
                                    Copy Prompt
                                </button>
                                <button
                                    className="px-2 py-1 rounded bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700"
                                    onClick={() => copyText(JSON.stringify(meta ?? {}, null, 2))}
                                    title="Copy All Metadata (JSON)"
                                >
                                    Copy All
                                </button>
                                <button
                                    className="px-2 py-1 rounded bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700"
                                    onClick={() => (window as any).api?.openInExplorer?.(item?.path)}
                                    title="Open in Explorer"
                                >
                                    Show in Explorer
                                </button>
                                <button
                                    className="px-2 py-1 rounded bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700"
                                    onClick={() => (window as any).api?.copyPath?.(item?.path)}
                                    title="Copy File Path"
                                >
                                    Copy Path
                                </button>
                            </div>
                        )}

                        {/* Editor vs viewer */}
                        {isEditing ? (
                            renderEditor()
                        ) : (
                            <>
                                <Panel title="Prompt" defaultOpen>
                  <pre className="whitespace-pre-wrap text-sm">
                    {prompt || (
                        <span className="text-gray-500 dark:text-gray-400">—</span>
                    )}
                  </pre>
                                </Panel>

                                <Panel title="Negative Prompt">
                  <pre className="whitespace-pre-wrap text-sm">
                    {negative || (
                        <span className="text-gray-500 dark:text-gray-400">—</span>
                    )}
                  </pre>
                                </Panel>

                                <Panel title="Generation Settings">
                                    <table className="w-full text-sm">
                                        <tbody>
                                        {Object.entries(settings).map(([k, v]) => (
                                            <tr
                                                key={k}
                                                className="border-b border-gray-200 dark:border-gray-800 last:border-none"
                                            >
                                                <td className="py-1 pr-3 text-gray-600 dark:text-gray-400 align-top">
                                                    {k}
                                                </td>
                                                <td className="py-1 break-all">
                                                    {v ?? (
                                                        <span className="text-gray-500 dark:text-gray-400">—</span>
                                                    )}
                                                </td>
                                            </tr>
                                        ))}
                                        </tbody>
                                    </table>
                                </Panel>

                                <Panel title="Raw JSON">
                  <pre className="whitespace-pre-wrap text-xs">
                    {mergedMeta?.raw ? (
                        JSON.stringify(mergedMeta.raw, null, 2)
                    ) : (
                        <span className="text-gray-500 dark:text-gray-400">—</span>
                    )}
                  </pre>
                                </Panel>
                            </>
                        )}
                    </div>
                </aside>
            </div>
        </div>
    );
};

export default ImageModal;
