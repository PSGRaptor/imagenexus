import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import ExifReader from 'exifreader';
import fse from 'fs-extra';

// ───────────────────────────────────────────────────────────────
// Public shape for Image Nexus
// ───────────────────────────────────────────────────────────────
export type ImageMetadata = {
    generator?: string;            // A1111 / ComfyUI / InvokeAI / NovelAI / Unknown
    prompt?: string;               // positive prompt
    negative?: string;             // negative prompt
    model?: string;
    sampler?: string;
    steps?: number;
    cfg?: number;
    seed?: string | number;
    size?: string;                 // "832x1216"
    raw?: any;                     // raw chunks/exif/graph/etc. for debug
};

// ───────────────────────────────────────────────────────────────
// Utilities
// ───────────────────────────────────────────────────────────────
type SDSettings = Record<string, string | number | boolean>;

function cleanText(s?: string): string | undefined {
    if (!s) return s;
    let t = s.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
    t = t.replace(/\u0000/g, '');
    t = t.replace(/[ \t]{2,}/g, ' ').replace(/\n{3,}/g, '\n\n');
    return t.trim();
}

function isPNG(buf: Buffer): boolean {
    if (buf.length < 8) return false;
    const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
    for (let i = 0; i < 8; i++) if (buf[i] !== sig[i]) return false;
    return true;
}

type PngChunk = { type: string; data: Buffer };
function readPngChunks(buf: Buffer): PngChunk[] {
    const chunks: PngChunk[] = [];
    let off = 8;
    while (off + 8 <= buf.length) {
        const len = buf.readUInt32BE(off); off += 4;
        const type = buf.slice(off, off + 4).toString('ascii'); off += 4;
        const data = buf.slice(off, off + len); off += len;
        off += 4; // CRC
        chunks.push({ type, data });
        if (type === 'IEND') break;
    }
    return chunks;
}
function decode_tEXt(data: Buffer): { key: string; value: string } | null {
    const nullIdx = data.indexOf(0);
    if (nullIdx < 0) return null;
    const key = data.slice(0, nullIdx).toString('utf8');
    const value = data.slice(nullIdx + 1).toString('utf8');
    return { key, value };
}
function decode_zTXt(data: Buffer): { key: string; value: string } | null {
    const nullIdx = data.indexOf(0);
    if (nullIdx < 0 || nullIdx + 2 >= data.length) return null;
    const key = data.slice(0, nullIdx).toString('utf8');
    const compData = data.slice(nullIdx + 2);
    try {
        const inflated = zlib.inflateSync(compData);
        return { key, value: inflated.toString('utf8') };
    } catch {
        return { key, value: '' };
    }
}
function decode_iTXt(data: Buffer): { key: string; value: string } | null {
    let off = 0;
    const readNullTerm = () => {
        const idx = data.indexOf(0, off);
        const s = data.slice(off, idx < 0 ? data.length : idx).toString('utf8');
        off = idx < 0 ? data.length : idx + 1;
        return s;
    };
    const key = readNullTerm();
    if (!key) return null;
    const compressionFlag = data[off++] || 0;
    off++; // compressionMethod
    readNullTerm(); // language
    readNullTerm(); // translated
    const text = data.slice(off);
    try {
        const value = compressionFlag ? zlib.inflateSync(text).toString('utf8') : text.toString('utf8');
        return { key, value };
    } catch {
        return { key, value: text.toString('utf8') };
    }
}
function extractPngTextBlocks(buf: Buffer): Record<string, string[]> {
    const out: Record<string, string[]> = {};
    for (const ch of readPngChunks(buf)) {
        if (ch.type === 'tEXt') {
            const kv = decode_tEXt(ch.data);
            if (kv) (out[kv.key] ??= []).push(kv.value);
        } else if (ch.type === 'zTXt') {
            const kv = decode_zTXt(ch.data);
            if (kv) (out[kv.key] ??= []).push(kv.value);
        } else if (ch.type === 'iTXt') {
            const kv = decode_iTXt(ch.data);
            if (kv) (out[kv.key] ??= []).push(kv.value);
        }
    }
    return out;
}
function tryParseJSON(s?: string | null): any | null {
    if (!s) return null;
    try { return JSON.parse(s); } catch { return null; }
}

const toNum = (v?: string | number | null) => {
    if (v == null) return undefined;
    const n = Number(String(v).trim());
    return Number.isFinite(n) ? n : undefined;
};

// ───────────────────────────────────────────────────────────────
// A1111 / SD.Next parser (for PNG "parameters" or EXIF/COM tails)
// ───────────────────────────────────────────────────────────────
function parseA1111Parameters(params: string): { positive?: string; negative?: string; settings?: SDSettings } {
    const joined = params.replace(/\r/g, '');
    const negIdx = joined.indexOf('Negative prompt:');

    let positive = joined;
    let negative = '';
    let tail = '';

    if (negIdx >= 0) {
        positive = joined.slice(0, negIdx).trim();
        const afterNeg = joined.slice(negIdx + 'Negative prompt:'.length);
        const idxSteps = afterNeg.search(/\b(Steps|Sampler|CFG|Seed|Size|Model|Model hash)\b/i);
        if (idxSteps >= 0) {
            negative = afterNeg.slice(0, idxSteps).trim();
            tail = afterNeg.slice(idxSteps).trim();
        } else {
            negative = afterNeg.trim();
        }
    }

    const settings: SDSettings = {};
    const tailLine = tail.split('\n').pop() || tail;

    let token = '';
    let depth = 0;
    const tokens: string[] = [];
    for (const ch of tailLine) {
        if (ch === '(') depth++;
        if (ch === ')') depth = Math.max(0, depth - 1);
        if (ch === ',' && depth === 0) {
            if (token.trim()) tokens.push(token.trim());
            token = '';
        } else token += ch;
    }
    if (token.trim()) tokens.push(token.trim());
    for (const t of tokens) {
        const kv = t.split(':');
        if (kv.length >= 2) {
            const k = kv[0].trim();
            const v = kv.slice(1).join(':').trim();
            settings[k] = v;
        }
    }

    return {
        positive: cleanText(positive) || '',
        negative: cleanText(negative) || '',
        settings
    };
}

// ───────────────────────────────────────────────────────────────
// EXIF / XMP helper (for JPG/WEBP)
// ───────────────────────────────────────────────────────────────
async function readExifLike(buf: Buffer): Promise<Record<string, any>> {
    try {
        const tags = ExifReader.load(buf);
        const out: Record<string, any> = {};
        for (const [k, v] of Object.entries(tags)) {
            // @ts-ignore
            out[k] = (v && typeof v === 'object' && 'description' in v) ? (v as any).description : v;
        }
        return out;
    } catch {
        return {};
    }
}

function readJpegComments(buf: Buffer): string[] {
    const out: string[] = [];
    let i = 0;
    const len = buf.length;
    if (!(len > 2 && buf[i] === 0xFF && buf[i + 1] === 0xD8)) return out;
    i += 2;
    while (i + 4 <= len) {
        if (buf[i] !== 0xFF) break;
        const marker = buf[i + 1];
        i += 2;
        if (marker === 0xDA || marker === 0xD9) break; // SOS/EOI
        if (i + 2 > len) break;
        const segLen = buf.readUInt16BE(i);
        i += 2;
        if (segLen < 2 || i + segLen - 2 > len) break;
        const segEnd = i + segLen - 2;
        if (marker === 0xFE) {
            const data = buf.slice(i, segEnd);
            const text = data.toString('utf8').replace(/\u0000/g, '').trim();
            if (text) out.push(text);
        }
        i = segEnd;
    }
    return out;
}

// ───────────────────────────────────────────────────────────────
// Mapping and helpers
// ───────────────────────────────────────────────────────────────
function mapToImageMetadata(tool: string, positive?: string, negative?: string, settings?: SDSettings, raw?: any): ImageMetadata {
    const meta: ImageMetadata = { generator: tool as any, raw: raw ?? {} };
    meta.prompt = positive || undefined;
    meta.negative = negative || undefined;

    const get = (k: string) => {
        if (!settings) return undefined;
        const key = Object.keys(settings).find(s => s.toLowerCase() === k.toLowerCase());
        return key ? String(settings[key]) : undefined;
    };

    const steps = get('Steps');
    const cfg = get('CFG scale') || get('CFG') || get('CFG Scale') || get('cfg_scale');
    const sampler = get('Sampler') || get('Sampler name') || get('scheduler'); // scheduler → sampler (Invoke)
    const seed = get('Seed') || get('seed');
    const size = get('Size') || get('Resolution') || get('Dims');
    const model = get('Model') || get('Model hash') || get('Model name') || get('model_name');

    if (steps) meta.steps = Number(steps);
    if (cfg) meta.cfg = Number(cfg);
    if (sampler) meta.sampler = sampler;
    if (seed) meta.seed = seed;
    if (size) {
        const m = size.match(/(\d+)\s*[xX]\s*(\d+)/);
        if (m) meta.size = `${m[1]}x${m[2]}`;
    }
    if (model) meta.model = model;

    return meta;
}

// ───────────────────────────────────────────────────────────────
// NEW: InvokeAI parser (PNG keys: invokeai_metadata / invokeai_graph)
// ───────────────────────────────────────────────────────────────
type InvokeCoreMeta = {
    generation_mode?: string;
    positive_prompt?: string;
    negative_prompt?: string;
    width?: number;
    height?: number;
    seed?: number | string;
    cfg_scale?: number;
    steps?: number;
    scheduler?: string; // maps to sampler
    model?: { name?: string; hash?: string; key?: string; base?: string; type?: string } | any;
    positive_style_prompt?: string;
    negative_style_prompt?: string;
};

function parseInvokeCoreToImageMeta(core: InvokeCoreMeta, raw: any): ImageMetadata {
    const settings: SDSettings = {};
    if (core.steps != null) settings['Steps'] = core.steps;
    if (core.cfg_scale != null) settings['CFG scale'] = core.cfg_scale;
    if (core.scheduler) settings['scheduler'] = core.scheduler;
    if (core.seed != null) settings['Seed'] = String(core.seed);
    if (core.width && core.height) settings['Size'] = `${core.width}x${core.height}`;
    if (core.model?.name) settings['Model'] = core.model.name;
    else if (core.model?.hash) settings['Model'] = String(core.model.hash);

    // Prefer positive_prompt; fall back to positive_style_prompt
    const pos = cleanText(core.positive_prompt || core.positive_style_prompt) || '';
    const neg = cleanText(core.negative_prompt || core.negative_style_prompt) || '';

    const meta = mapToImageMetadata('InvokeAI', pos, neg, settings, raw);
    return meta;
}

function parseInvokeMetadataJSON(s: string, raw: any): ImageMetadata | null {
    const j = tryParseJSON(s);
    if (!j || typeof j !== 'object') return null;

    // Direct top-level format (as in your sample)
    if ('positive_prompt' in j || 'core' in j) {
        const core: InvokeCoreMeta = j.core ?? j;
        return parseInvokeCoreToImageMeta(core, { ...raw, invokeai_metadata: j });
    }
    return null;
}

function parseInvokeGraphJSON(s: string, raw: any): ImageMetadata | null {
    const j = tryParseJSON(s);
    if (!j || typeof j !== 'object' || !j.nodes) return null;

    // Core metadata sits in nodes.core_metadata.metadata (Invoke 4.x)
    const coreNode = j.nodes.core_metadata;
    const metaObj: InvokeCoreMeta | undefined =
        (coreNode && (coreNode.metadata as any)) || undefined;

    if (metaObj) {
        return parseInvokeCoreToImageMeta(metaObj, { ...raw, invokeai_graph: j });
    }

    // Fallback: try to read from other nodes (rare)
    for (const node of Object.values<any>(j.nodes)) {
        if (node && typeof node === 'object') {
            if (node.metadata && (node.metadata.positive_prompt || node.metadata.steps)) {
                return parseInvokeCoreToImageMeta(node.metadata as any, { ...raw, invokeai_graph: j });
            }
        }
    }
    return null;
}

// ───────────────────────────────────────────────────────────────
// Main SD metadata reader
// ───────────────────────────────────────────────────────────────
async function readSdMetadata(filePath: string): Promise<ImageMetadata> {
    const buf = await fs.promises.readFile(filePath);
    const ext = path.extname(filePath).toLowerCase();
    const raw: any = { ext };

    if (isPNG(buf)) {
        const txt = extractPngTextBlocks(buf);
        raw.pngText = txt;

        // 1) InvokeAI explicit JSON (most reliable)
        const invokeMeta = txt['invokeai_metadata']?.[0];
        if (invokeMeta) {
            const parsed = parseInvokeMetadataJSON(invokeMeta, { txt });
            if (parsed) return parsed;
        }

        // 2) InvokeAI graph JSON → core_metadata
        const invokeGraph = txt['invokeai_graph']?.[0];
        if (invokeGraph) {
            const parsed = parseInvokeGraphJSON(invokeGraph, { txt });
            if (parsed) return parsed;
        }

        // 3) ComfyUI: workflow JSON in iTXt or custom keys
        const comfy =
            txt['workflow']?.[0] ||
            txt['ComfyUI']?.[0] ||
            txt['sd-metadata']?.[0];
        if (comfy) {
            const parsed = tryParseJSON(comfy);
            if (parsed) {
                const settings: SDSettings = {};
                if (parsed.steps != null) settings['Steps'] = parsed.steps;
                if (parsed.cfg_scale != null) settings['CFG scale'] = parsed.cfg_scale;
                if (parsed.seed != null) settings['Seed'] = parsed.seed;
                if (parsed.width && parsed.height) settings['Size'] = `${parsed.width}x${parsed.height}`;
                if (parsed.model) settings['Model'] = parsed.model;
                return mapToImageMetadata(
                    'ComfyUI',
                    parsed.prompt,
                    parsed.negative || parsed.negative_prompt,
                    settings,
                    { workflow: parsed, txt }
                );
            }
        }

        // 4) A1111 / SD.Next parameters blob (most common)
        const params =
            txt['parameters']?.[0] ||
            txt['Parameters']?.[0] ||
            txt['prompt']?.[0] ||
            txt['Description']?.[0] ||
            txt['Comment']?.[0];
        if (params) {
            const { positive, negative, settings } = parseA1111Parameters(params);
            const tool = (txt['Comment']?.[0] || '').includes('NovelAI') ? 'NovelAI' : 'A1111';
            return mapToImageMetadata(tool, positive, negative, settings, { parameters: params, txt });
        }

        // 5) Generic JSON in custom keys (last resort)
        for (const [k, arr] of Object.entries(txt)) {
            for (const v of arr) {
                const j = tryParseJSON(v);
                if (j && (j.prompt || j.parameters || j.workflow)) {
                    const settings: SDSettings = {};
                    if (j.steps != null) settings['Steps'] = j.steps;
                    if (j.cfg_scale != null) settings['CFG scale'] = j.cfg_scale;
                    if (j.seed != null) settings['Seed'] = j.seed;
                    if (j.width && j.height) settings['Size'] = `${j.width}x${j.height}`;
                    if (j.model?.name) settings['Model'] = j.model.name;
                    return mapToImageMetadata(
                        j.workflow ? 'ComfyUI' : 'Unknown',
                        j.prompt || j.positive,
                        j.negative || j.negative_prompt,
                        settings,
                        { key: k, json: j, txt }
                    );
                }
            }
        }

        return { generator: 'Unknown', raw };
    }

    // JPEG/WEBP route: EXIF/XMP + COM comments
    const exif = await readExifLike(buf);
    raw.exif = exif;

    const com = readJpegComments(buf);
    raw.jpegComments = com;

    const candidates = [
        ...com,
        String(exif['UserComment'] ?? ''),
        String(exif['ImageDescription'] ?? ''),
        String(exif['Description'] ?? ''),
        String(exif['Comment'] ?? ''),
        String(exif['XPComment'] ?? ''),
        String(exif['Software'] ?? ''),
        String(exif['parameters'] ?? '')
    ].filter(Boolean);

    const A1111_RE = /(Negative\s*prompt\s*:)|(Steps\s*:\s*\d+)|(Sampler\s*:\s*[A-Za-z0-9+ .-]+)/i;
    for (const c of candidates) {
        const j = tryParseJSON(c);
        if (j) {
            const settings: SDSettings = {};
            if (j.steps != null) settings['Steps'] = j.steps;
            if (j.cfg_scale != null) settings['CFG scale'] = j.cfg_scale;
            if (j.seed != null) settings['Seed'] = j.seed;
            if (j.width && j.height) settings['Size'] = `${j.width}x${j.height}`;
            if (j.model?.name) settings['Model'] = j.model.name;

            return mapToImageMetadata(
                j.workflow ? 'ComfyUI' : (String(exif['Software'] || '').toLowerCase().includes('invoke') ? 'InvokeAI' : 'Unknown'),
                j.prompt || j.positive,
                j.negative || j.negative_prompt,
                settings,
                { exif, json: j }
            );
        }
        if (A1111_RE.test(c)) {
            const { positive, negative, settings } = parseA1111Parameters(c);
            const sw = String(exif['Software'] || '');
            const tool = sw.toLowerCase().includes('invoke') ? 'InvokeAI' : 'A1111';
            return mapToImageMetadata(tool, positive, negative, settings, { exif, jpegComments: com });
        }
    }

    return { generator: 'Unknown', raw };
}

// ───────────────────────────────────────────────────────────────
// Sidecars (.json / .txt) exactly like spec
// ───────────────────────────────────────────────────────────────
async function readSidecar(basePath: string): Promise<Partial<ImageMetadata> | null> {
    const dir = path.dirname(basePath);
    const base = path.basename(basePath, path.extname(basePath));
    const jsonPath = path.join(dir, `${base}.json`);
    const txtPath  = path.join(dir, `${base}.txt`);

    if (await fse.pathExists(jsonPath)) {
        try {
            const s = await fse.readFile(jsonPath, 'utf8');
            const j = tryParseJSON(s);
            if (j) {
                const settings: SDSettings = {};
                if (j.steps != null) settings['Steps'] = j.steps;
                if (j.cfg_scale != null) settings['CFG scale'] = j.cfg_scale;
                if (j.seed != null) settings['Seed'] = j.seed;
                if (j.width && j.height) settings['Size'] = `${j.width}x${j.height}`;
                if (j.model?.name) settings['Model'] = j.model.name;
                return mapToImageMetadata(
                    j.workflow ? 'ComfyUI' : (j.scheduler ? 'InvokeAI' : 'Unknown'),
                    j.prompt || j.positive,
                    j.negative || j.negative_prompt,
                    settings,
                    { sidecar: j }
                );
            }
        } catch {}
    }
    if (await fse.pathExists(txtPath)) {
        try {
            const s = await fse.readFile(txtPath, 'utf8');
            const { positive, negative, settings } = parseA1111Parameters(s);
            return mapToImageMetadata('SidecarTXT', positive, negative, settings, { sidecarTxt: s });
        } catch {}
    }
    return null;
}

// ───────────────────────────────────────────────────────────────
// PUBLIC: used by main process IPC 'image:metadata'
// ───────────────────────────────────────────────────────────────
export async function getMetadataForFile(filePath: string): Promise<ImageMetadata> {
    try {
        const parsed = await readSdMetadata(filePath);

        // If neither prompt/negative found, try sidecar
        if (!parsed.prompt && !parsed.negative) {
            const side = await readSidecar(filePath);
            if (side) return { ...(parsed || {}), ...side, raw: { ...(parsed.raw || {}), sidecar: (side as any).raw } };
        }
        return parsed;
    } catch {
        return { raw: { error: 'Failed to read metadata' } } as ImageMetadata;
    }
}
