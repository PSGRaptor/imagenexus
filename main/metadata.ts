// FILE: main/metadata.ts
import { parsePngTextParameters } from './parsers/pngText';
import { parseSidecarTxt, parseSidecarJson } from './parsers/sidecars';
import { parseExifXmp } from './parsers/exifXmp';

export type ImageMetadata = {
    generator?: string;
    prompt?: string;
    negative?: string;
    model?: string;
    sampler?: string;
    steps?: number;
    cfg?: number;
    seed?: string | number;
    size?: string;
    raw?: any;
};

export async function getMetadataForFile(filePath: string): Promise<ImageMetadata> {
    // 1) PNG tEXt (A1111/ComfyUI/etc.)
    let meta = await parsePngTextParameters(filePath);

    // 2) EXIF/XMP fallback
    if (!meta || Object.keys(meta).length === 0) {
        const ex = await parseExifXmp(filePath);
        if (ex) meta = ex;
    }

    // 3) Sidecars (.txt / .json)
    if (!meta || ((!meta.prompt || !meta.model) && !meta.raw)) {
        const txt = await parseSidecarTxt(filePath);
        if (txt) meta = txt;
    }
    if (!meta || ((!meta.prompt || !meta.model) && !meta.raw)) {
        const js = await parseSidecarJson(filePath);
        if (js) meta = js;
    }

    return meta || { generator: 'Unknown', raw: null };
}
