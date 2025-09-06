// FILE: main/parsers/exifXmp.ts
import exifr from 'exifr';
import { decodeA1111Params, detectGenerator } from './shared';

export async function parseExifXmp(filePath: string) {
    try {
        const data = await exifr.parse(filePath, { xmp: true, userComment: true });
        if (!data) return null;

        const raw = (data as any)?.UserComment || (data as any)?.Parameters || '';
        if (raw && typeof raw === 'string') {
            return decodeA1111Params(raw);
        }

        const s = JSON.stringify(data);
        return { generator: detectGenerator(s), raw: data };
    } catch {
        return null;
    }
}
