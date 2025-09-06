// FILE: main/parsers/pngText.ts
import fs from 'node:fs';
import extract from 'png-chunks-extract';
import decodeText from 'png-chunk-text';
import { decodeA1111Params } from './shared';

type TextChunk = { keyword: string; text: string };

export async function parsePngTextParameters(filePath: string) {
    if (!filePath.toLowerCase().endsWith('.png')) return null;

    const buf = fs.readFileSync(filePath);
    const chunks = extract(buf);

    const texts = (chunks
        .filter((c: any) => c.name === 'tEXt')
        .map((c: any) => decodeText(c.data)) || []) as TextChunk[];

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
            return decodeA1111Params('', j);
        } catch {
            /* ignore malformed JSON */
        }
    }

    if (!rawParams) return null;

    return decodeA1111Params(rawParams, null, kv);
}
