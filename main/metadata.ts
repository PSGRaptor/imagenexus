import fs from 'fs-extra';
import path from 'path';
import extractChunks, { PngChunk } from 'png-chunks-extract';
import decodeText, { PngTextChunk } from 'png-chunk-text';
import { ImageMetadata } from './types';

// Dynamic import for ESM modules at runtime
async function exifrParse(file: string) {
    const exifr = await import('exifr');
    // exifr.parse handles JPG/WEBP EXIF/XMP
    return (exifr as any).parse(file).catch(() => null);
}

function parseA1111ParamsBlock(block: string): Partial<ImageMetadata> {
    // Typical A1111 "parameters" text block
    // "prompt text\nNegative prompt: ...\nSteps: 20, Sampler: Euler a, CFG scale: 7, Seed: 123, Size: 512x512, Model: ..."
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

    const settingsLine = rest.join(' ');
    const meta: Partial<ImageMetadata> = { prompt, negative };
    const get = (label: string) => {
        const m = new RegExp(`${label}\\s*:\\s*([^,]+)`, 'i').exec(settingsLine);
        return m ? m[1].trim() : undefined;
    };

    meta.steps = Number(get('Steps'));
    meta.sampler = get('Sampler');
    meta.cfgScale = Number(get('CFG scale') || get('CFG'));
    meta.seed = get('Seed');
    meta.size = get('Size');
    meta.model = get('Model') || get('Model hash') || get('Model hash (sd)');
    return meta;
}

function detectGenerator(keys: string[], kv: Record<string, string>): ImageMetadata['generator'] {
    const all = keys.map(k => k.toLowerCase());
    if (all.includes('parameters')) return 'automatic1111';
    if (all.includes('json') || all.includes('prompt') || all.includes('workflow')) return 'comfyui';
    // Heuristics for others via fields often used:
    if (kv['invokeai']) return 'invokeai';
    if (kv['sdnext']) return 'sdnext';
    if (kv['fooocus']) return 'fooocus';
    if (kv['novelai']) return 'novelai';
    return 'unknown';
}

export async function readMetadata(filePath: string): Promise<ImageMetadata> {
    const ext = path.extname(filePath).toLowerCase();
    // Sidecar discovery
    const base = filePath.replace(/\.(png|jpg|jpeg|webp)$/i, '');
    const sideTxt = `${base}.txt`;
    const sideJson = `${base}.json`;

    // Try embedded first
    if (ext === '.png') {
        try {
            const buf = await fs.readFile(filePath);
            const chunks: PngChunk[] = extractChunks(buf);
            const texts: PngTextChunk[] = chunks
                .filter((c: PngChunk) => c.name === 'tEXt' || c.name === 'iTXt')
                .map((c: PngChunk) => {
                    try {
                        return decodeText(c);
                    } catch {
                        return null as unknown as PngTextChunk;
                    }
                })
                .filter((x: PngTextChunk | null): x is PngTextChunk => Boolean(x));

            const kv: Record<string, string> = {};
            for (const t of texts) kv[t.keyword] = t.text;

            const keys = Object.keys(kv);
            if (keys.length) {
                const gen = detectGenerator(keys, kv);
                if (gen === 'automatic1111' && kv['parameters']) {
                    const partial = parseA1111ParamsBlock(kv['parameters']);
                    return { source: 'embedded', generator: gen, ...partial, other: kv, raw: kv };
                }
                if (gen === 'comfyui') {
                    // ComfyUI often stores JSON under 'prompt' or 'workflow' or 'json'
                    const rawStr = kv['prompt'] || kv['workflow'] || kv['json'];
                    let rawObj: any = rawStr;
                    try { rawObj = JSON.parse(rawStr); } catch {}
                    return {
                        source: 'embedded',
                        generator: gen,
                        // Attempt prompt extraction (best-effort)
                        prompt: typeof rawObj === 'object' ? undefined : rawStr,
                        other: kv,
                        raw: rawObj ?? kv
                    };
                }
                // Unknown PNG metadata; return raw
                return { source: 'embedded', generator: detectGenerator(keys, kv), other: kv, raw: kv };
            }
        } catch {
            /* fallthrough */
        }
    } else if (ext === '.jpg' || ext === '.jpeg' || ext === '.webp') {
        try {
            const exif = await exifrParse(filePath);
            if (exif) {
                const textFields = ['UserComment', 'ImageDescription', 'XPComment', 'Description'] as const;
                let found: string | undefined = undefined;
                for (const f of textFields) {
                    if ((exif as any)[f]) { found = String((exif as any)[f]); break; }
                }
                if (found) {
                    const partial = parseA1111ParamsBlock(found);
                    return { source: 'embedded', generator: 'unknown', ...partial, other: exif, raw: exif };
                }
                return { source: 'embedded', generator: 'unknown', other: exif, raw: exif };
            }
        } catch {
            /* fallthrough */
        }
    }

    // Sidecar discovery
    if (await fs.pathExists(sideTxt)) {
        const txt = await fs.readFile(sideTxt, 'utf8');
        const partial = parseA1111ParamsBlock(txt);
        return { source: 'sidecar', generator: partial.model ? 'automatic1111' : 'unknown', ...partial, raw: txt };
    }
    if (await fs.pathExists(sideJson)) {
        try {
            const json = await fs.readJSON(sideJson);
            // Try comfy style fields, or generic
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
