// FILE: main/parsers/pngText.ts
import fs from 'node:fs';
import extract from 'png-chunks-extract';
import decodeText from 'png-chunk-text';
import { type ImageMetadata } from '../metadata';

type TextChunk = { keyword: string; text: string };

// ───────────────── Reader (unchanged) ─────────────────
export async function parsePngTextParameters(filePath: string) {
    if (!filePath.toLowerCase().endsWith('.png')) return null;

    const buf = fs.readFileSync(filePath);
    const chunks = extract(buf);

    const texts = (chunks
        .filter((c: any) => c.name === 'tEXt' || c.name === 'iTXt')
        .map((c: any) => {
            if (c.name === 'tEXt') return decodeText(c.data) as TextChunk;
            // minimal iTXt decode for keyword + text
            const data: Buffer = c.data as Buffer;
            const nullIdx = data.indexOf(0);
            if (nullIdx < 0) return null;
            const keyword = data.subarray(0, nullIdx).toString('utf8');
            // skip flags/method/lang/translated
            let off = nullIdx + 1 + 1 + 1;
            const next1 = data.indexOf(0, off); off = next1 < 0 ? data.length : next1 + 1;
            const next2 = data.indexOf(0, off); off = next2 < 0 ? data.length : next2 + 1;
            const text = data.subarray(off).toString('utf8');
            return { keyword, text } as TextChunk;
        })
        .filter(Boolean) || []) as TextChunk[];

    if (!texts.length) return null;

    const kv: Record<string, string> = {};
    for (const t of texts) {
        const key = (t.keyword || '').toLowerCase();
        if (key) kv[key] = t.text;
    }

    const rawParams = kv['parameters'] || kv['comment'] || kv['description'] || '';

    if (kv['json']) {
        try {
            const j = JSON.parse(kv['json']);
            // You can route into your shared decoder here if desired
            return j;
        } catch { /* ignore malformed JSON */ }
    }

    if (!rawParams) return null;

    return rawParams;
}

// ───────────────── Writer ─────────────────
// Minimal CRC32 for PNG chunks
const CRC_TABLE = (() => {
    const table = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) {
            c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
        }
        table[n] = c >>> 0;
    }
    return table;
})();

function crc32(buf: Buffer): number {
    let c = 0xFFFFFFFF;
    for (let i = 0; i < buf.length; i++) {
        c = CRC_TABLE[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
    }
    return (c ^ 0xFFFFFFFF) >>> 0;
}

function packChunk(type: string, data: Buffer): Buffer {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);
    const typ = Buffer.from(type, 'ascii');
    const crc = Buffer.alloc(4);
    const crcVal = crc32(Buffer.concat([typ, data]));
    crc.writeUInt32BE(crcVal, 0);
    return Buffer.concat([len, typ, data, crc]);
}

const PNG_SIG = Buffer.from([0x89,0x50,0x4E,0x47,0x0D,0x0A,0x1A,0x0A]);

function makeITXt(keyword: string, text: string): Buffer {
    // iTXt: keyword\0 compressionFlag\0 languageTag\0 translated\0 text
    const key = Buffer.from(keyword, 'utf8');
    const zero = Buffer.from([0]);
    const compFlag = Buffer.from([0]);     // uncompressed
    const compMethod = Buffer.from([0]);   // reserved = 0
    const lang = Buffer.from([]);          // empty
    const translated = Buffer.from([]);    // empty
    const txt = Buffer.from(text, 'utf8');
    const data = Buffer.concat([key, zero, compFlag, compMethod, lang, zero, translated, zero, txt]);
    return packChunk('iTXt', data);
}

function composeA1111Parameters(meta: ImageMetadata): string {
    const p = meta.prompt || '';
    const n = meta.negative || '';
    const bits: string[] = [];
    if (meta.steps != null) bits.push(`Steps: ${meta.steps}`);
    if (meta.sampler) bits.push(`Sampler: ${meta.sampler}`);
    if (meta.cfg != null) bits.push(`CFG scale: ${meta.cfg}`);
    if (meta.seed != null) bits.push(`Seed: ${meta.seed}`);
    if (meta.size) bits.push(`Size: ${meta.size}`);
    if (meta.model) bits.push(`Model: ${meta.model}`);
    const tail = bits.join(', ');
    return n ? `${p}\nNegative prompt: ${n}\n${tail}` : `${p}\n${tail}`;
}

/**
 * Write PNG metadata by inserting/updating iTXt chunks:
 *  - iTXt "parameters": A1111-compatible string
 *  - iTXt "sd-metadata": structured JSON for round-tripping
 */
export async function writePngMetadata(
    inputPng: Buffer,
    meta: ImageMetadata
): Promise<Buffer> {
    if (inputPng.length < 8 || !inputPng.slice(0, 8).equals(PNG_SIG)) {
        throw new Error('Not a PNG file');
    }

    // Parse existing chunks, rebuild and replace/add our metadata
    let offset = 8;
    const chunks: { type: string; data: Buffer; raw: Buffer }[] = [];

    while (offset + 8 <= inputPng.length) {
        const len = inputPng.readUInt32BE(offset); offset += 4;
        const type = inputPng.slice(offset, offset + 4).toString('ascii'); offset += 4;
        const data = inputPng.slice(offset, offset + len); offset += len;
        const crc  = inputPng.slice(offset, offset + 4); offset += 4;
        const raw  = Buffer.concat([
            Buffer.alloc(4, 0), // placeholder, not used; we re-pack later
            Buffer.from(type, 'ascii'),
            data,
            crc
        ]);
        chunks.push({ type, data, raw });
        if (type === 'IEND') break;
    }

    // Remove existing "parameters" / "sd-metadata" iTXt to avoid duplicates
    const filtered = chunks.filter(c => {
        if (c.type !== 'iTXt' && c.type !== 'tEXt' && c.type !== 'zTXt') return true;
        // Peek key for iTXt/tEXt/zTXt to drop only our keys
        try {
            if (c.type === 'iTXt') {
                const data = c.data;
                const nullIdx = data.indexOf(0);
                const key = data.subarray(0, nullIdx).toString('utf8');
                return key !== 'parameters' && key !== 'sd-metadata';
            } else {
                // tEXt / zTXt
                const nullIdx = c.data.indexOf(0);
                const key = c.data.subarray(0, nullIdx).toString('utf8');
                return key !== 'parameters' && key !== 'sd-metadata';
            }
        } catch {
            return true;
        }
    });

    // Compose new metadata
    const parameters = composeA1111Parameters(meta);
    const jsonBlob = JSON.stringify({
        prompt: meta.prompt ?? '',
        negative: meta.negative ?? '',
        steps: meta.steps ?? null,
        cfg: meta.cfg ?? null,
        seed: meta.seed ?? null,
        size: meta.size ?? null,
        model: meta.model ?? null,
        generator: meta.generator ?? null
    });

    const itxtParams = makeITXt('parameters', parameters);
    const itxtJson   = makeITXt('sd-metadata', jsonBlob);

    // Rebuild: [sig][IHDR..][...][iTXt params][iTXt json][IEND]
    const outChunks: Buffer[] = [PNG_SIG];
    let inserted = false;
    for (let i = 0; i < filtered.length; i++) {
        const c = filtered[i];
        if (!inserted && c.type !== 'IHDR') {
            // Insert immediately after IHDR and any PLTE/IDAT preamble—safe option: before IEND
            // Simpler: when we hit IEND, inject our chunks just before it.
        }
        if (c.type === 'IEND') {
            outChunks.push(itxtParams, itxtJson);
        }
        // Re-pack the chunk we kept
        const data = c.data;
        outChunks.push(packChunk(c.type, data));
    }

    return Buffer.concat(outChunks);
}
