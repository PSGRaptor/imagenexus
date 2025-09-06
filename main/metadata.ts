import fs from 'fs-extra';
import path from 'path';
import extractChunks, { PngChunk } from 'png-chunks-extract';
import decodeText from 'png-chunk-text';
import type { ImageMetadata } from './types';

// exifr supports JPG/JPEG/WEBP/XMP
async function exifrParse(file: string) {
    try {
        const exifr = await import('exifr');
        // some builds expose default, some named
        const parse = (exifr as any).parse || (exifr as any).default?.parse || (exifr as any).default;
        return parse ? parse(file) : null;
    } catch {
        return null;
    }
}

function parseA1111ParamsBlock(block: string): Partial<ImageMetadata> {
    const lines = block.split(/\r?\n/);
    let prompt = '';
    let negative = '';
    const rest: string[] = [];

    for (const line of lines) {
        const idx = line.toLowerCase().indexOf('negative prompt:');
        if (idx >= 0) {
            negative = line.slice(idx + 'negative prompt:'.length).trim();
        } else if (!prompt) {
            prompt = line.trim();
        } else {
            rest.push(line.trim());
        }
    }

    const settings = rest.join(' ');
    const meta: Partial<ImageMetadata> = { prompt, negative };

    const pick = (label: string) => {
        const m = new RegExp(`${label}\\s*:\\s*([^,]+)`, 'i').exec(settings);
        return m ? m[1].trim() : undefined;
    };

    meta.steps   = Number(pick('Steps'));
    meta.sampler = pick('Sampler');
    meta.cfgScale= Number(pick('CFG scale') || pick('CFG'));
    meta.seed    = pick('Seed');
    meta.size    = pick('Size');
    meta.model   = pick('Model') || pick('Model hash') || pick('Model hash \\(sd\\)');
    return meta;
}

function detectGenerator(kv: Record<string,string>): ImageMetadata['generator'] {
    const keys = Object.keys(kv).map(k => k.toLowerCase());
    if (keys.includes('parameters')) return 'automatic1111';
    if (keys.includes('prompt') || keys.includes('workflow') || keys.includes('json')) return 'comfyui';
    if ('invokeai' in kv) return 'invokeai';
    if ('sdnext' in kv) return 'sdnext';
    if ('fooocus' in kv) return 'fooocus';
    if ('novelai' in kv) return 'novelai';
    return 'unknown';
}

function tryBruteFindParams(buf: Buffer): string|undefined {
    // fallback: pull a text window around 'Negative prompt:' if chunk decode failed
    const needle = Buffer.from('Negative prompt:');
    const i = buf.indexOf(needle);
    if (i < 0) return undefined;
    // scan back a bit to include the positive prompt line
    const start = Math.max(0, i - 2000);
    // and forward some for settings line
    const end   = Math.min(buf.length, i + 4000);
    const slice = buf.subarray(start, end).toString('utf8');
    // try to trim at next PNG IDAT boundary if any (heuristic)
    const stop = slice.indexOf('\x00IDAT');
    return stop > 0 ? slice.slice(0, stop) : slice;
}

export async function readMetadata(filePath: string): Promise<ImageMetadata> {
    const ext = path.extname(filePath).toLowerCase();
    const base = filePath.replace(/\.(png|jpg|jpeg|webp)$/i, '');
    const sideTxt = `${base}.txt`;
    const sideJson = `${base}.json`;

    // ---- PNG embedded ----
    if (ext === '.png') {
        try {
            const buf = await fs.readFile(filePath);
            let kv: Record<string,string> = {};

            try {
                const chunks: PngChunk[] = extractChunks(buf);
                for (const c of chunks) {
                    if (c.name === 'tEXt' || c.name === 'iTXt') {
                        try {
                            const t = decodeText(c) as { keyword: string; text: string };
                            if (t?.keyword) kv[t.keyword] = t.text ?? '';
                        } catch {/* ignore non-text or malformed */}
                    }
                }
            } catch {/* if chunk extraction fails, try brute below */}

            if (Object.keys(kv).length) {
                const gen = detectGenerator(kv);
                if (gen === 'automatic1111' && kv['parameters']) {
                    const partial = parseA1111ParamsBlock(kv['parameters']);
                    return { source: 'embedded', generator: gen, ...partial, other: kv, raw: kv };
                }
                if (gen === 'comfyui') {
                    const rawStr = kv['prompt'] || kv['workflow'] || kv['json'];
                    let rawObj: any = undefined;
                    if (rawStr) { try { rawObj = JSON.parse(rawStr); } catch { /* keep string */ } }
                    return { source: 'embedded', generator: gen, prompt: undefined, other: kv, raw: rawObj ?? kv };
                }
                // fallback: return raw kv
                return { source: 'embedded', generator: gen, other: kv, raw: kv };
            }

            // Brute scan: some A1111 builds write odd iTXt/zTXt; pull the block anyway
            const block = tryBruteFindParams(buf);
            if (block) {
                const partial = parseA1111ParamsBlock(block);
                return { source: 'embedded', generator: 'automatic1111', ...partial, raw: block };
            }
        } catch {/* fall through */}
    }

    // ---- JPG/JPEG/WEBP embedded via exifr ----
    if (ext === '.jpg' || ext === '.jpeg' || ext === '.webp') {
        const exif = await exifrParse(filePath).catch(() => null);
        if (exif) {
            const fields = ['UserComment', 'ImageDescription', 'XPComment', 'Description'];
            let found: string | undefined;
            for (const f of fields) {
                if ((exif as any)[f]) { found = String((exif as any)[f]); break; }
            }
            if (found) {
                const partial = parseA1111ParamsBlock(found);
                return { source: 'embedded', generator: 'unknown', ...partial, other: exif as any, raw: exif as any };
            }
            return { source: 'embedded', generator: 'unknown', other: exif as any, raw: exif as any };
        }
    }

    // ---- Sidecars ----
    if (await fs.pathExists(sideTxt)) {
        const txt = await fs.readFile(sideTxt, 'utf8');
        const partial = parseA1111ParamsBlock(txt);
        return { source: 'sidecar', generator: partial.model ? 'automatic1111' : 'unknown', ...partial, raw: txt };
    }
    if (await fs.pathExists(sideJson)) {
        try {
            const json = await fs.readJSON(sideJson);
            const prompt = json.prompt || json.positive || json.text || '';
            const negative = json.negative || json.negative_prompt || '';
            return { source: 'sidecar', generator: 'comfyui', prompt, negative, other: json, raw: json };
        } catch {
            const txt = await fs.readFile(sideJson, 'utf8');
            return { source: 'sidecar', generator: 'unknown', other: { text: txt }, raw: txt };
        }
    }

    return { source: 'none', generator: 'unknown' };
}
