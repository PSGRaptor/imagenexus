// FILE: main/parsers/sidecars.ts
import path from 'node:path';
import fse from 'fs-extra';
import { decodeA1111Params } from './shared';

export async function parseSidecarTxt(filePath: string) {
    const dir = path.dirname(filePath);
    const base = path.basename(filePath, path.extname(filePath));
    const txt = path.join(dir, `${base}.txt`);
    if (await fse.pathExists(txt)) {
        const s = await fse.readFile(txt, 'utf8');
        return decodeA1111Params(s);
    }
    return null;
}

export async function parseSidecarJson(filePath: string) {
    const dir = path.dirname(filePath);
    const base = path.basename(filePath, path.extname(filePath));
    const js = path.join(dir, `${base}.json`);
    if (await fse.pathExists(js)) {
        try {
            const j = await fse.readJSON(js);
            return decodeA1111Params('', j);
        } catch {
            return { generator: 'Unknown', raw: null };
        }
    }
    return null;
}
