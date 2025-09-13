import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import ExifReader from 'exifreader';
import fse from 'fs-extra';

// NEW: writers for embedding metadata
import { writePngMetadata } from './parsers/pngText';
import { writeJpegXmpMetadata } from './parsers/exifXmp';

// ───────────────────────────────────────────────────────────────
// Optional DOMParser polyfill for Node/Electron
// ───────────────────────────────────────────────────────────────
(() => {
    try {
        if (typeof (global as any).DOMParser === 'undefined') {
            // eslint-disable-next-line @typescript-eslint/no-var-requires
            const { DOMParser } = require('@xmldom/xmldom');
            (global as any).DOMParser = DOMParser;
        }
    } catch { /* noop */ }
})();

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

type SDSettings = Record<string, string | number | boolean>;

const looksLikeXmpPacket = (s?: string | null): boolean => {
    if (!s) return false;
    const t = s.trim();
    return /<x:xmpmeta[\s>]/i.test(t) || t.includes('http://ns.adobe.com/xap/1.0/');
};

const cleanText = (s?: string): string | undefined => {
    if (!s) return s;
    let t = s.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
    t = t.replace(/\u0000/g, '');
    t = t.replace(/[ \t]{2,}/g, ' ').replace(/\n{3,}/g, '\n\n');
    return t.trim();
};

const isPNG = (buf: Buffer): boolean => {
    if (buf.length < 8) return false;
    const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
    for (let i = 0; i < 8; i++) if (buf[i] !== sig[i]) return false;
    return true;
};

type PngChunk = { type: string; data: Buffer };
function readPngChunks(buf: Buffer): PngChunk[] {
    const chunks: PngChunk[] = [];
    let off = 8;
    while (off + 8 <= buf.length) {
        const len = buf.readUInt32BE(off); off += 4;
        const type = buf.subarray(off, off + 4).toString('ascii'); off += 4;
        const data = buf.subarray(off, off + len); off += len;
        off += 4; // CRC
        chunks.push({ type, data });
        if (type === 'IEND') break;
    }
    return chunks;
}
function decode_tEXt(data: Buffer): { key: string; value: string } | null {
    const nullIdx = data.indexOf(0);
    if (nullIdx < 0) return null;
    const key = data.subarray(0, nullIdx).toString('utf8');
    const value = data.subarray(nullIdx + 1).toString('utf8');
    return { key, value };
}
function decode_zTXt(data: Buffer): { key: string; value: string } | null {
    const nullIdx = data.indexOf(0);
    if (nullIdx < 0 || nullIdx + 2 >= data.length) return null;
    const key = data.subarray(0, nullIdx).toString('utf8');
    const compData = data.subarray(nullIdx + 2);
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
        const s = data.subarray(off, idx < 0 ? data.length : idx).toString('utf8');
        off = idx < 0 ? data.length : idx + 1;
        return s;
    };
    const key = readNullTerm();
    if (!key) return null;
    const compressionFlag = data[off++] || 0;
    off++; // compressionMethod
    readNullTerm(); // language
    readNullTerm(); // translated
    const text = data.subarray(off);
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

const tryParseJSON = (s?: string | null): any | null => {
    if (!s) return null;
    try { return JSON.parse(s); } catch { return null; }
};

// ───────────────────────────────────────────────────────────────
// A1111 textual parser
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
        const idxSteps = afterNeg.search(/\b(Steps|Sampler|CFG|Seed|Size|Model|Model hash|Checkpoint)\b/i);
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
            (settings as any)[k] = v;
        }
    }

    return {
        positive: cleanText(positive) || '',
        negative: cleanText(negative) || '',
        settings
    };
}

// ───────────────────────────────────────────────────────────────
// JPEG helpers
// ───────────────────────────────────────────────────────────────
const looksUtf16le = (buf: Buffer): boolean => {
    const sample = buf.subarray(0, Math.min(64, buf.length));
    let zeros = 0, pairs = 0;
    for (let i = 1; i < sample.length; i += 2) { pairs++; if (sample[i] === 0x00) zeros++; }
    return pairs > 0 && zeros / pairs > 0.6;
};

function toStringFromExifValue(v: any): string | null {
    if (v == null) return null;

    // simple string
    if (typeof v === 'string') {
        const out = cleanText(v) || null;
        return looksLikeXmpPacket(out) ? null : out;
    }

    // exifreader common shape { description, value }
    if (typeof v === 'object' && ('description' in v || 'value' in v)) {
        if (typeof (v as any).description === 'string') {
            const d = cleanText((v as any).description);
            if (d && !looksLikeXmpPacket(d)) return d;
        }
        return toStringFromExifValue((v as any).value);
    }

    // array -> join child strings
    if (Array.isArray(v)) {
        const parts: string[] = [];
        for (const el of v) {
            const s = toStringFromExifValue(el);
            if (s) parts.push(s);
        }
        const joined = parts.length ? (cleanText(parts.join('\n')) || null) : null;
        return looksLikeXmpPacket(joined) ? null : joined;
    }

    // buffers -> decode as UTF-16LE if likely, else UTF-8
    if (v instanceof Uint8Array || Buffer.isBuffer(v)) {
        const b = Buffer.from(v as Uint8Array);
        if (looksUtf16le(b)) {
            const t = b.toString('utf16le').replace(/\u0000+/g, '').trim();
            const out = t ? (cleanText(t) || null) : null;
            return looksLikeXmpPacket(out) ? null : out;
        }
        const t = b.toString('utf8').replace(/\u0000/g, '').trim();
        const out = t ? (cleanText(t) || null) : null;
        return looksLikeXmpPacket(out) ? null : out;
    }

    // numbers / booleans
    if (typeof v === 'number' || typeof v === 'boolean') return String(v);

    // generic object -> recurse values and join
    if (typeof v === 'object') {
        const parts: string[] = [];
        for (const child of Object.values(v)) {
            const s = toStringFromExifValue(child);
            if (s) parts.push(s);
        }
        const joined = parts.length ? (cleanText(parts.join('\n')) || null) : null;
        return looksLikeXmpPacket(joined) ? null : joined;
    }

    return null;
}

function collectExifStrings(tags: Record<string, any>): string[] {
    const out: string[] = [];
    const add = (str?: string | null) => { const s = cleanText(str || ''); if (s) out.push(s); };

    const recursive = (node: any) => {
        const s = toStringFromExifValue(node);
        if (s) { out.push(s); return; }
        if (Array.isArray(node)) node.forEach(recursive);
        else if (node && typeof node === 'object') Object.values(node).forEach(recursive);
    };
    recursive(tags);

    const pick = (k: string) => add(toStringFromExifValue((tags as any)[k]));
    [
        'UserComment','XPComment','XPTitle','XPSubject',
        'ImageDescription','Description','Comment','parameters',
        'Software','Artist','Caption','ObjectName','Headline','Title',
        'Make'
    ].forEach(pick);

    return Array.from(new Set(out));
}

function readJpegComments(buf: Buffer): string[] {
    const out: string[] = [];
    let i = 0;
    const len = buf.length;
    if (!(len > 2 && buf[i] === 0xFF && buf[i + 1] === 0xD8)) return out;
    i += 2;
    while (i + 4 <= len) {
        if (buf[i] !== 0xFF) break;
        const marker = buf[i + 1]; i += 2;
        if (marker === 0xDA || marker === 0xD9) break;
        if (i + 2 > len) break;
        const segLen = buf.readUInt16BE(i); i += 2;
        if (segLen < 2 || i + segLen - 2 > len) break;
        const segEnd = i + segLen - 2;
        if (marker === 0xFE) {
            const data = buf.subarray(i, segEnd);
            const text = data.toString('utf8').replace(/\u0000/g, '').trim();
            if (text) out.push(text);
        }
        i = segEnd;
    }
    return out;
}

// ── Raw file scan helpers ──
function extractA1111Block(text: string): string | null {
    const t = text.replace(/\r/g, '');
    const candIdx = t.search(/Negative\s*prompt\s*:/i);
    if (candIdx < 0) return null;
    const tailIdx = t.slice(candIdx).search(/\b(Steps|Sampler|CFG|Seed|Size|Model)\b/i);
    if (tailIdx < 0) return null;
    const start = Math.max(0, t.lastIndexOf('\n\n', candIdx - 1));
    const end = t.indexOf('\n\n', candIdx + tailIdx);
    const slice = t.slice(start >= 0 ? start : 0, end >= 0 ? end : (candIdx + tailIdx + 2000));
    return cleanText(slice) || null;
}
function extractJSONObject(text: string, startIdx: number): string | null {
    let i = startIdx, depth = 0; let inStr = false; let esc = false;
    while (i < text.length && text[i] !== '{') i++;
    if (i >= text.length) return null;
    let out = '';
    for (; i < text.length; i++) {
        const ch = text[i];
        out += ch;
        if (inStr) {
            if (esc) { esc = false; continue; }
            if (ch === '\\') { esc = true; continue; }
            if (ch === '"') inStr = false;
        } else {
            if (ch === '"') inStr = true;
            else if (ch === '{') depth++;
            else if (ch === '}') { depth--; if (depth === 0) break; }
        }
    }
    const j = tryParseJSON(out);
    return j ? out : null;
}
function extractSDLikeJSON(text: string): string | null {
    const idx = text.search(/\{\s*"(prompt|positive_prompt|core"|workflow"|nodes")/i);
    if (idx < 0) return null;
    return extractJSONObject(text, idx);
}
function stripComfyPrefixToJSON(s: string): string | null {
    const m = s.match(/^\s*(workflow|prompt)\s*:\s*(\{[\s\S]+)$/i);
    if (!m) return null;
    const json = m[2].trim();
    const j = tryParseJSON(json);
    return j ? json : null;
}

// ───────────────────────────────────────────────────────────────
// Mapping helpers
// ───────────────────────────────────────────────────────────────
function mapToImageMetadata(tool: string, positive?: string, negative?: string, settings?: SDSettings, raw?: any): ImageMetadata {
    const meta: ImageMetadata = { generator: tool as any, raw: raw ?? {} };
    meta.prompt = positive || undefined;
    meta.negative = negative || undefined;

    const get = (k: string) => {
        if (!settings) return undefined;
        const key = Object.keys(settings).find(s => s.toLowerCase() === k.toLowerCase());
        return key ? String((settings as any)[key]) : undefined;
    };

    const steps = get('Steps');
    const cfg = get('CFG scale') || get('CFG') || get('CFG Scale') || get('cfg_scale');
    const sampler = get('Sampler') || get('Sampler name') || get('scheduler');
    const seed = get('Seed') || get('seed');
    const size = get('Size') || get('Resolution') || get('Dims');
    const model =
        get('Model') || get('Model hash') || get('Model name') || get('model_name') ||
        get('sd_model_checkpoint') || get('checkpoint') || get('ckpt') || get('ckpt_name');

    if (model) {
        const cleaned = String(model).trim().split(/[\\/]/).pop()!;
        meta.model = cleaned;
    }

    if (steps) meta.steps = Number(steps);
    if (cfg) meta.cfg = Number(cfg);
    if (sampler) meta.sampler = sampler;
    if (seed) meta.seed = seed;
    if (size) {
        const m = size?.match?.(/(\d+)\s*[xX]\s*(\d+)/);
        if (m) meta.size = `${m[1]}x${m[2]}`;
    }

    return meta;
}

// ───────────────────────────────────────────────────────────────
// InvokeAI helpers
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
    scheduler?: string;
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
    const pos = cleanText(core.positive_prompt || core.positive_style_prompt) || '';
    const neg = cleanText(core.negative_prompt || core.negative_style_prompt) || '';
    return mapToImageMetadata('InvokeAI', pos, neg, settings, raw);
}

// ───────────────────────────────────────────────────────────────
// NEW: ComfyUI lifters
// ───────────────────────────────────────────────────────────────
type ComfyNode = {
    id?: number | string;
    type?: string;                  // array-form uses 'type'
    class_type?: string;            // object-form uses 'class_type'
    inputs?: Record<string, any>;
    widgets_values?: any[];
    _meta?: { title?: string } | any;
    properties?: Record<string, any>;
};

// Type guards to satisfy TS safely
function isObjectRecord(v: unknown): v is Record<string, unknown> {
    return !!v && typeof v === 'object';
}
function looksLikeComfyPromptMap(j: any): j is Record<string, { inputs?: any; class_type?: string }> {
    if (!isObjectRecord(j)) return false;
    const first = Object.values(j)[0] as any;
    return isObjectRecord(first) && ('inputs' in first);
}
function looksLikeComfyNodeMap(j: any): j is { nodes: any } {
    return isObjectRecord(j) && 'nodes' in j;
}

// 1) Prompt-map lifter (txt.prompt[0] format)
function liftFromComfyPromptMap(mapObj: any): ImageMetadata | null {
    if (!looksLikeComfyPromptMap(mapObj)) return null;

    let positive = '';
    let negative = '';
    const settings: SDSettings = {};

    const values = Object.values(mapObj) as Array<{ inputs?: any; class_type?: string }>;
    for (const entry of values) {
        const cls = (entry.class_type || '').toLowerCase();
        const inp = entry.inputs || {};

        // Prompts most often live on loader/CLIP nodes in this layout
        if (inp.positive && typeof inp.positive === 'string') {
            if ((inp.positive as string).length > (positive?.length || 0)) positive = inp.positive;
        }
        if (inp.negative && typeof inp.negative === 'string') {
            negative = negative ? `${negative}, ${inp.negative}` : inp.negative;
        }

        // Sampler settings
        if (cls.includes('ksampler')) {
            if (inp.steps != null) settings['Steps'] = inp.steps;
            if (inp.cfg != null || inp.cfg_scale != null) settings['CFG scale'] = inp.cfg ?? inp.cfg_scale;
            if (inp.seed != null) settings['Seed'] = inp.seed;
            if (inp.sampler_name) settings['Sampler'] = inp.sampler_name;
            if (inp.scheduler) settings['scheduler'] = inp.scheduler;
        }

        // Resolution
        const w = inp.empty_latent_width ?? inp.width;
        const h = inp.empty_latent_height ?? inp.height;
        if (Number.isFinite(w) && Number.isFinite(h)) {
            settings['Size'] = `${Number(w)}x${Number(h)}`;
        }

        // Model
        if (typeof inp.ckpt_name === 'string') settings['Model'] = inp.ckpt_name;
        else if (typeof inp.model === 'string') settings['Model'] = inp.model;
    }

    const hasAny = positive || negative || Object.keys(settings).length > 0;
    if (!hasAny) return null;
    return mapToImageMetadata('ComfyUI', cleanText(positive) || '', cleanText(negative) || '', settings, { comfy_prompt_map: mapObj });
}

// 2) Graph lifter (supports object-form and array-form nodes)
function liftFromComfyGraph(graph: any): ImageMetadata | null {
    if (!looksLikeComfyNodeMap(graph) || !graph.nodes) return null;

    const nodesValue = graph.nodes as any;
    const nodesArr: ComfyNode[] = Array.isArray(nodesValue)
        ? nodesValue as ComfyNode[]
        : Object.values(nodesValue) as ComfyNode[];

    let positive = '';
    let negative = '';
    const settings: SDSettings = {};

    // Heuristics over nodes
    for (const node of nodesArr) {
        const typeLower = String((node as any).type || (node as any).class_type || '').toLowerCase();
        const inp = (node as any).inputs || {};

        // Text from inputs (object-form)
        if (typeof inp.text === 'string') {
            const s = cleanText(inp.text) || '';
            if (s) {
                const label = String((node as any)._meta?.title || '').toLowerCase();
                if (label.includes('neg') || label.includes('negative')) negative = negative ? `${negative}, ${s}` : s;
                else if (s.length > (positive?.length || 0)) positive = s;
            }
        }

        // KSampler (Efficient) via widgets_values (array-form)
        if (typeLower.includes('ksampler')) {
            // Typical order observed: [seed, seed_behavior, steps, cfg, sampler_name, scheduler, denoise, preview_method, vae_decode]
            const w = (node as any).widgets_values || [];
            const steps = w[2]; const cfg = w[3];
            const sampler = w[4]; const scheduler = w[5];
            const seed = w[0];

            if (Number.isFinite(steps)) settings['Steps'] = steps;
            if (Number.isFinite(cfg)) settings['CFG scale'] = cfg;
            if (sampler) settings['Sampler'] = String(sampler);
            if (scheduler) settings['scheduler'] = String(scheduler);
            if (seed != null && seed !== -1) settings['Seed'] = seed;
        }

        // Efficient Loader via widgets_values
        if (typeLower.includes('efficient loader')) {
            const w = (node as any).widgets_values || [];
            // 0: ckpt_name, 1: vae_name, 2: clip_skip, 3: lora_name, 4: lora_model_strength, 5: lora_clip_strength,
            // 6: positive, 7: negative, 8: token_normalization, 9: weight_interpretation,
            // 10: width, 11: height, 12: batch_size
            const model = w[0]; const pos = w[6]; const neg = w[7];
            const width = w[10]; const height = w[11];
            if (typeof model === 'string') settings['Model'] = model;
            if (typeof width === 'number' && typeof height === 'number') {
                settings['Size'] = `${width}x${height}`;
            }
            if (typeof pos === 'string' && pos.length > (positive?.length || 0)) positive = pos;
            if (typeof neg === 'string' && neg) negative = negative ? `${negative}, ${neg}` : neg;
        }
    }

    const hasAny = positive || negative || Object.keys(settings).length > 0;
    if (!hasAny) return null;
    return mapToImageMetadata('ComfyUI', cleanText(positive) || '', cleanText(negative) || '', settings, { comfy_graph: graph });
}

/** Pull <sdx:*>{value}</sdx:*> fields out of the XMP block */
function extractSdxFromXmp(xml: string): Partial<ImageMetadata> | null {
    const out: Partial<ImageMetadata> = {};
    const get = (tag: string) => {
        const rx = new RegExp(`<sdx:${tag}[^>]*>([\\s\\S]*?)</sdx:${tag}>`, 'i');
        const m = xml.match(rx);
        return m ? cleanText(m[1]) : undefined;
    };

    const steps = get('steps');
    const cfg   = get('cfg') ?? get('cfg_scale');
    const seed  = get('seed');
    const model = get('model') ?? get('ckpt') ?? get('checkpoint');
    const sampler = get('sampler') ?? get('sampler_name') ?? get('scheduler');
    const size  = get('size');
    const generator = get('generator');
    const negative  = get('negative'); // ← NEW

    if (steps) out.steps = Number(steps);
    if (cfg)   out.cfg = Number(cfg);
    if (seed)  out.seed = seed;
    if (sampler) out.sampler = sampler;
    if (size) {
        const m = size.match(/(\d+)\s*[xX]\s*(\d+)/);
        if (m) out.size = `${m[1]}x${m[2]}`;
    }
    if (model) out.model = String(model).trim().split(/[\\/]/).pop();
    if (generator) out.generator = generator;
    if (negative) out.negative = negative; // ← NEW

    return Object.keys(out).length ? out : null;
}


/** Split dc:description into prompt + trailing CSV-ish "Key: Val" tokens */
function parseDescriptionWithKv(desc: string): { prompt?: string; settings?: Record<string, any> } | null {
    if (!desc) return null;
    const t = desc.replace(/\r/g, '').trim();
    const firstKv = t.match(/\b(Seed|Steps|CFG(?:\s*Scale)?|Model|Sampler|Size)\s*:/i);
    if (!firstKv || firstKv.index == null) return null;

    const prompt = cleanText(t.slice(0, firstKv.index)) || '';
    const tail = t.slice(firstKv.index);

    // tokenize by commas (ignore commas inside parentheses)
    const parts: string[] = [];
    let buf = '';
    let depth = 0;
    for (const ch of tail) {
        if (ch === '(') depth++;
        if (ch === ')') depth = Math.max(0, depth - 1);
        if (ch === ',' && depth === 0) {
            if (buf.trim()) parts.push(buf.trim());
            buf = '';
        } else {
            buf += ch;
        }
    }
    if (buf.trim()) parts.push(buf.trim());

    const settings: Record<string, any> = {};
    for (const p of parts) {
        const m = p.match(/^([A-Za-z _]+)\s*:\s*(.*)$/);
        if (!m) continue;
        const key = m[1].trim().toLowerCase();
        const val = m[2].trim();
        if (val === '') continue;
        if (key === 'steps') settings['Steps'] = Number(val);
        else if (key === 'cfg' || key === 'cfg scale' || key === 'cfg_scale') settings['CFG scale'] = Number(val);
        else if (key === 'seed') settings['Seed'] = val;
        else if (key === 'model' || key === 'checkpoint' || key === 'ckpt') settings['Model'] = val;
        else if (key === 'sampler' || key === 'sampler name' || key === 'scheduler') settings['Sampler'] = val;
        else if (key === 'size' || key === 'resolution') settings['Size'] = val;
    }

    return { prompt, settings };
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

        // Prefer our own structured JSON that the writer emits
        const sdMetaJson = txt['sd-metadata']?.[0];
        if (sdMetaJson) {
            const j = tryParseJSON(sdMetaJson);
            if (j) {
                const settings: SDSettings = {};
                if (j.steps != null) settings['Steps'] = j.steps;
                if (j.cfg   != null) settings['CFG scale'] = j.cfg;
                if (j.seed  != null) settings['Seed'] = j.seed;
                if (typeof j.size === 'string') settings['Size'] = j.size;
                if (typeof j.model === 'string') settings['Model'] = j.model;
                if (typeof j.sampler === 'string') settings['Sampler'] = j.sampler;

                const tool = typeof j.generator === 'string' ? j.generator : 'Unknown'; // ← use generator as tool
                const meta = mapToImageMetadata(
                    tool,
                    typeof j.prompt === 'string' ? j.prompt : undefined,
                    typeof j.negative === 'string' ? j.negative : undefined,
                    settings,
                    { txt, sd_metadata: j }
                );

                if (typeof j.generator === 'string') meta.generator = j.generator; // ← ensure saved

                return meta;
            }
        }

        // InvokeAI explicit JSON
        const invokeMeta = txt['invokeai_metadata']?.[0];
        if (invokeMeta) {
            const j = tryParseJSON(invokeMeta);
            if (j && (j.positive_prompt || j.core)) {
                return parseInvokeCoreToImageMeta(j.core ?? j, { txt });
            }
        }

        // InvokeAI graph JSON
        const invokeGraph = txt['invokeai_graph']?.[0];
        if (invokeGraph) {
            const j = tryParseJSON(invokeGraph);
            if (j && j.nodes) {
                const coreNode = j.nodes?.core_metadata;
                const metaObj = coreNode?.metadata ?? undefined;
                if (metaObj) return parseInvokeCoreToImageMeta(metaObj, { txt, invokeai_graph: j });
            }
        }

        // ComfyUI: workflow graph and/or prompt map
        const comfyWorkflow = txt['workflow']?.[0] || txt['ComfyUI']?.[0];
        const comfyPromptMap = txt['prompt']?.[0]; // some exporters use this key

        // Try prompt map first (cleanest)
        if (comfyPromptMap) {
            const pj = tryParseJSON(comfyPromptMap);
            const lifted = pj && liftFromComfyPromptMap(pj);
            if (lifted) return { ...lifted, raw: { ...(lifted.raw || {}), txt, prompt_map: pj } };
        }

        // Then the workflow graph (object or array)
        if (comfyWorkflow) {
            const wj = tryParseJSON(comfyWorkflow);
            const lifted = wj && liftFromComfyGraph(wj);
            if (lifted) return { ...lifted, raw: { ...(lifted.raw || {}), txt, workflow: wj } };
        }

        // Fallbacks: A1111 textual blob or generic JSON
        const params =
            txt['parameters']?.[0] ||
            txt['Parameters']?.[0] ||
            txt['Description']?.[0] ||
            txt['Comment']?.[0];
        if (params) {
            const { positive, negative, settings } = parseA1111Parameters(params);
            const tool = (txt['Comment']?.[0] || '').includes('NovelAI') ? 'NovelAI' : 'A1111';
            return mapToImageMetadata(tool, positive, negative, settings, { parameters: params, txt });
        }

        for (const [k, arr] of Object.entries(txt)) {
            for (const val of arr) {
                const j = tryParseJSON(val);
                if (j) {
                    // prefer Comfy prompt map/graph lifters if it looks like them
                    if (looksLikeComfyNodeMap(j)) {
                        const lifted = liftFromComfyGraph(j);
                        if (lifted) return { ...lifted, raw: { ...(lifted.raw || {}), txt, json: j, key: k } };
                    } else if (looksLikeComfyPromptMap(j)) {
                        const lifted = liftFromComfyPromptMap(j);
                        if (lifted) return { ...lifted, raw: { ...(lifted.raw || {}), txt, json: j, key: k } };
                    }
                    // generic mapping
                    const settings: SDSettings = {};
                    if ((j as any).steps != null) settings['Steps'] = (j as any).steps;

// accept either cfg_scale OR cfg
                    if ((j as any).cfg_scale != null) settings['CFG scale'] = (j as any).cfg_scale;
                    else if ((j as any).cfg != null) settings['CFG scale'] = (j as any).cfg;

                    if ((j as any).seed != null) settings['Seed'] = (j as any).seed;
                    if ((j as any).width && (j as any).height) settings['Size'] = `${(j as any).width}x${(j as any).height}`;

// accept model as nested or plain string
                    if ((j as any).model?.name) settings['Model'] = (j as any).model.name;
                    else if (typeof (j as any).model === 'string') settings['Model'] = (j as any).model;

// accept sampler as plain string
                    if (typeof (j as any).sampler === 'string') settings['Sampler'] = (j as any).sampler;
                    return mapToImageMetadata(
                        (j as any).workflow ? 'ComfyUI' : 'Unknown',
                        (j as any).prompt || (j as any).positive,
                        (j as any).negative || (j as any).negative_prompt,
                        settings,
                        { key: k, json: j, txt }
                    );
                }
            }
        }

        return { generator: 'Unknown', raw };
    }

    // ── JPEG / (and other) route — EXIF + whole-file scans
    let tags: Record<string, any> = {};
    try { tags = ExifReader.load(buf) as any; } catch {}
    try {
        const haveDomParser = typeof (global as any).DOMParser !== 'undefined';
        const expanded = ExifReader.load(buf, {
            expanded: true,
            includeXmp: haveDomParser,
            includeIptc: true,
            includeImage: false,
            includeIccProfile: false
        } as any);
        tags = { ...expanded, ...tags };
    } catch {}

    const rawExif = tags;
    const com = readJpegComments(buf);
    const exifStrings = collectExifStrings(tags);

    // Raw XMP scrape (fallback for description text)
    const xmpStrings = (() => {
        const s = buf.toString('utf8');
        const m = s.match(/<x:xmpmeta[\s\S]*?<\/x:xmpmeta>/i);
        if (!m) return [] as string[];
        const xml = m[0];
        const found: string[] = [];
        const liRegex = /<rdf:li[^>]*>([\s\S]*?)<\/rdf:li>/gi;
        let lm: RegExpExecArray | null;
        while ((lm = liRegex.exec(xml))) {
            const txt = lm[1].replace(/<[^>]+>/g, '').trim();
            if (txt) found.push(txt);
        }
        const descRegexes = [
            /<dc:description[^>]*>([\s\S]*?)<\/dc:description>/i,
            /<photoshop:Caption[^>]*>([\s\S]*?)<\/photoshop:Caption>/i,
            /<xmp:Description[^>]*>([\s\S]*?)<\/xmp:Description>/i,
            /<Description[^>]*>([\s\S]*?)<\/Description>/i,
        ];
        for (const rx of descRegexes) {
            const mm = xml.match(rx);
            if (mm) {
                const txt = mm[1].replace(/<[^>]+>/g, '').trim();
                if (txt) found.push(txt);
            }
        }
        return Array.from(new Set(found.map(x => cleanText(x) || '').filter(Boolean)));
    })();

    // Try to lift structured sdx:* tags directly from the XMP packet
    let xmpRawXml: string | null = null;
    {
        const s = buf.toString('utf8');
        const m = s.match(/<x:xmpmeta[\s\S]*?<\/x:xmpmeta>/i);
        if (m) xmpRawXml = m[0];
    }
    if (xmpRawXml) {
        const sdx = extractSdxFromXmp(xmpRawXml);
        if (sdx) {
            // Prefer dc:description as the positive prompt; parse K/V tail if any
            const descText = xmpStrings[0] || '';
            const kvParsed = parseDescriptionWithKv(descText || '');
            const pos = kvParsed?.prompt || descText || '';

            const meta = mapToImageMetadata(
                'Unknown',
                pos,
                sdx.negative,                                  // ← pass negative from sdx
                {
                    ...(kvParsed?.settings || {}),
                    ...(sdx.steps != null ? { Steps: sdx.steps } : {}),
                    ...(sdx.cfg   != null ? { 'CFG scale': sdx.cfg } : {}),
                    ...(sdx.seed  != null ? { Seed: sdx.seed } : {}),
                    ...(sdx.sampler ? { Sampler: sdx.sampler } : {}),
                    ...(sdx.size  ? { Size: sdx.size } : {}),
                    ...(sdx.model ? { Model: sdx.model } : {}),
                },
                { exif: rawExif, xmp: true }
            );

            // Preserve generator from sdx
            if (sdx.generator) meta.generator = sdx.generator;   // ← NEW

            return meta;
        }

        // If no sdx:* but description contains trailing K/V, lift them
        if (xmpStrings.length) {
            const kvParsed = parseDescriptionWithKv(xmpStrings[0]);
            if (kvParsed?.settings) {
                return mapToImageMetadata(
                    'Unknown',
                    kvParsed.prompt || xmpStrings[0],
                    undefined,
                    kvParsed.settings,
                    { exif: rawExif, xmp: true }
                );
            }
        }
    }

    // Whole-file scans
    const fileUtf8 = buf.toString('utf8');
    const fileUtf16 = (() => { try { return buf.toString('utf16le'); } catch { return ''; } })();
    const utf8JSON = extractSDLikeJSON(fileUtf8);
    const utf16JSON = extractSDLikeJSON(fileUtf16);
    const utf8Params = extractA1111Block(fileUtf8);
    const utf16Params = extractA1111Block(fileUtf16);

    // Comfy prefixed JSON in EXIF strings ("Workflow: {...}" / "Prompt: {...}")
    const comfyPrefixedJson: string[] = [];
    const addIfPrefixed = (s?: string | null) => {
        const v = cleanText(s || '');
        if (!v) return;
        const pj = stripComfyPrefixToJSON(v);
        if (pj) comfyPrefixedJson.push(pj);
    };
    addIfPrefixed(toStringFromExifValue((rawExif as any)?.ImageDescription));
    addIfPrefixed(toStringFromExifValue((rawExif as any)?.Make));
    addIfPrefixed(toStringFromExifValue((rawExif as any)?.Parameters));
    addIfPrefixed(toStringFromExifValue((rawExif as any)?.Prompt));
    addIfPrefixed(toStringFromExifValue((rawExif as any)?.XPComment));

    // Build candidate set
    const candidates = Array.from(new Set([
        ...com,
        ...exifStrings,
        ...xmpStrings,
        ...comfyPrefixedJson,
        utf8JSON || '',
        utf16JSON || '',
        utf8Params || '',
        utf16Params || ''
    ].map(s => cleanText(s) || '').filter(Boolean))) as string[];

    // Filter out full XMP packets so they don't become prompts
    const filteredCandidates = candidates.filter(c => !looksLikeXmpPacket(c));
    const A1111_RE = /(Negative\s*prompt\s*:)|(Steps\s*:\s*\d+)|(Sampler\s*:\s*[A-Za-z0-9+ .-]+)/i;

    for (const c of filteredCandidates) {
        const j = tryParseJSON(c);
        if (j) {
            // Prefer Comfy prompt-map
            if (looksLikeComfyPromptMap(j)) {
                const lifted = liftFromComfyPromptMap(j);
                if (lifted) return { ...lifted, raw: { ...(lifted.raw || {}), exif: rawExif, jpegComments: com, json: j } };
            }
            // Or Comfy graph
            if (looksLikeComfyNodeMap(j)) {
                const lifted = liftFromComfyGraph(j);
                if (lifted) return { ...lifted, raw: { ...(lifted.raw || {}), exif: rawExif, jpegComments: com, json: j } };
            }

            // Generic JSON mapping
            const settings: SDSettings = {};
            if ((j as any).steps != null) settings['Steps'] = (j as any).steps;
            if ((j as any).cfg_scale != null) settings['CFG scale'] = (j as any).cfg_scale;
            if ((j as any).seed != null) settings['Seed'] = (j as any).seed;
            if ((j as any).width && (j as any).height) settings['Size'] = `${(j as any).width}x${(j as any).height}`;
            if ((j as any).model?.name) settings['Model'] = (j as any).model.name;

            const sw = String(toStringFromExifValue((rawExif as any)?.Software) || '').toLowerCase();
            return mapToImageMetadata(
                (j as any).workflow ? 'ComfyUI' : (sw.includes('invoke') ? 'InvokeAI' : 'Unknown'),
                (j as any).prompt || (j as any).positive || (j as any).positive_prompt,
                (j as any).negative || (j as any).negative_prompt,
                settings,
                { exif: rawExif, json: j, jpegComments: com }
            );
        }

        // A1111 textual "parameters"
        if (A1111_RE.test(c)) {
            const { positive, negative, settings } = parseA1111Parameters(c);
            const sw = String(toStringFromExifValue((rawExif as any)?.Software) || '').toLowerCase();
            const tool = sw.includes('invoke') ? 'InvokeAI' : 'A1111';
            return mapToImageMetadata(tool, positive, negative, settings, { exif: rawExif, jpegComments: com });
        }
    }

    return { generator: 'Unknown', raw: { exif: rawExif, jpegComments: com } };
}

// ───────────────────────────────────────────────────────────────
// Sidecars (.json / .txt)
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
                if (looksLikeComfyPromptMap(j)) {
                    const lifted = liftFromComfyPromptMap(j);
                    if (lifted) return { ...lifted, raw: { ...(lifted.raw || {}), sidecar: j } };
                }
                if (looksLikeComfyNodeMap(j)) {
                    const lifted = liftFromComfyGraph(j);
                    if (lifted) return { ...lifted, raw: { ...(lifted.raw || {}), sidecar: j } };
                }
                const settings: SDSettings = {};
                if ((j as any).steps != null) settings['Steps'] = (j as any).steps;
                if ((j as any).cfg_scale != null) settings['CFG scale'] = (j as any).cfg_scale;
                if ((j as any).seed != null) settings['Seed'] = (j as any).seed;
                if ((j as any).width && (j as any).height) settings['Size'] = `${(j as any).width}x${(j as any).height}`;
                if ((j as any).model?.name) settings['Model'] = (j as any).model.name;
                return mapToImageMetadata(
                    (j as any).workflow ? 'ComfyUI' : ((j as any).scheduler ? 'InvokeAI' : 'Unknown'),
                    (j as any).prompt || (j as any).positive,
                    (j as any).negative || (j as any).negative_prompt,
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
// PUBLIC — Reader
// ───────────────────────────────────────────────────────────────
export async function getMetadataForFile(filePath: string): Promise<ImageMetadata> {
    try {
        const parsed = await readSdMetadata(filePath);

        if (!parsed.prompt && !parsed.negative) {
            const side = await readSidecar(filePath);
            if (side) {
                return {
                    ...(parsed || {}),
                    ...side,
                    raw: { ...(parsed.raw || {}), sidecar: (side as any).raw }
                };
            }
        }
        return parsed;
    } catch {
        return { raw: { error: 'Failed to read metadata' } } as ImageMetadata;
    }
}

// ───────────────────────────────────────────────────────────────
/** Write sidecar as safe fallback for unsupported inline formats */
async function writeSidecarForFile(filePath: string, meta: ImageMetadata) {
    const dir = path.dirname(filePath);
    const base = path.basename(filePath, path.extname(filePath));
    const jsonPath = path.join(dir, `${base}.json`);

    const out = {
        prompt: meta.prompt || '',
        negative: meta.negative || '',
        steps: meta.steps ?? null,
        cfg_scale: meta.cfg ?? null,
        seed: meta.seed ?? null,
        size: meta.size || null,
        model: meta.model ? { name: meta.model } : null,
        generator: meta.generator ?? null,
    };

    await fse.writeJSON(jsonPath, out, { spaces: 2 });
}

// ───────────────────────────────────────────────────────────────
// PUBLIC — Writer (Atomic)
// ───────────────────────────────────────────────────────────────
export async function setMetadataForFile(
    filePath: string,
    patch: Partial<ImageMetadata>
): Promise<ImageMetadata> {
    const ext = path.extname(filePath).toLowerCase();
    const buf = await fs.promises.readFile(filePath);

    // Merge incoming patch with current parsed metadata
    const current = await getMetadataForFile(filePath);
    const merged: ImageMetadata = {
        ...current,
        ...Object.fromEntries(
            Object.entries(patch).filter(([_, v]) => v !== undefined && v !== null)
        ),
    };

    // Atomic write to temp file in same directory
    const dir = path.dirname(filePath);
    const base = path.basename(filePath);
    const tmp = path.join(dir, `.~${base}.writing`);

    try {
        if (ext === '.png' && isPNG(buf)) {
            const out = await writePngMetadata(buf, merged);
            await fs.promises.writeFile(tmp, out);
            await fse.move(tmp, filePath, { overwrite: true });
        } else if (ext === '.jpg' || ext === '.jpeg') {
            const out = await writeJpegXmpMetadata(buf, merged);
            await fs.promises.writeFile(tmp, out);
            await fse.move(tmp, filePath, { overwrite: true });
        } else {
            // Unsupported inline format — sidecar fallback
            await writeSidecarForFile(filePath, merged);
        }
    } finally {
        // Cleanup tmp if anything went wrong
        if (await fse.pathExists(tmp)) {
            try { await fse.remove(tmp); } catch {}
        }
    }

    // Re-read and return normalized metadata
    return await getMetadataForFile(filePath);
}
