// FILE: main/parsers/shared.ts
export function detectGenerator(raw: string): string {
    const s = (raw || '').toLowerCase();
    if (s.includes('comfyui')) return 'ComfyUI';
    if (s.includes('invokeai')) return 'InvokeAI';
    if (s.includes('sd.next') || s.includes('sdnext')) return 'SD.Next';
    if (s.includes('fooocus')) return 'Fooocus';
    if (s.includes('novelai')) return 'NovelAI';
    if (s.includes('automatic1111') || s.includes('a1111')) return 'AUTOMATIC1111';
    return 'Unknown';
}

export function decodeA1111Params(
    rawParams?: string,
    json?: any,
    kv?: Record<string, string>
): {
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
} {
    const meta: any = { raw: null };

    if (json && typeof json === 'object') {
        meta.raw = json;
        const s = JSON.stringify(json).toLowerCase();
        meta.generator = detectGenerator(s);
        if (!meta.prompt && (json.prompt || json.text)) {
            meta.prompt = json.prompt || json.text;
        }
    }

    if (rawParams && rawParams.trim()) {
        meta.raw = meta.raw || rawParams;
        meta.generator = meta.generator || detectGenerator(rawParams);

        const lines = rawParams.split(/\r?\n/);
        const first = lines[0] || '';

        const negMatch = rawParams.match(/Negative prompt:\s*([\s\S]*?)\n(?:Steps:|$)/i);
        const prompt = first.includes('Negative prompt:') ? '' : first.trim();
        const negative = negMatch ? negMatch[1].trim() : '';

        const stepsMatch = rawParams.match(/Steps:\s*(\d+)/i);
        const cfgMatch = rawParams.match(/CFG(?:\s*Scale)?:\s*([\d.]+)/i);
        const samplerMatch = rawParams.match(/Sampler:\s*([^,\n]+)/i);
        const seedMatch = rawParams.match(/Seed:\s*([^,\n]+)/i);
        const sizeMatch = rawParams.match(/Size:\s*([^,\n]+)/i);
        const modelMatch = rawParams.match(/Model:\s*([^,\n]+)/i);

        meta.prompt = meta.prompt ?? prompt;
        meta.negative = meta.negative ?? negative;
        if (stepsMatch) meta.steps = Number(stepsMatch[1]);
        if (cfgMatch) meta.cfg = Number(cfgMatch[1]);
        if (samplerMatch) meta.sampler = samplerMatch[1].trim();
        if (seedMatch) meta.seed = seedMatch[1].trim();
        if (sizeMatch) meta.size = sizeMatch[1].trim();
        if (modelMatch) meta.model = modelMatch[1].trim();
    }

    if (kv && kv['software']) {
        meta.generator = meta.generator || detectGenerator(kv['software']);
    }

    if (!meta.generator) meta.generator = 'Unknown';
    return meta;
}
