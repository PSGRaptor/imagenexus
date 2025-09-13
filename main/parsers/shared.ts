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

    // ---- JSON-based extraction (A1111 / Invoke / Fooocus / etc.) ----------------
    if (json && typeof json === 'object') {
        // Preserve the raw blob for downstream consumers
        meta.raw = json;

        // Detect generator from the JSON string (case-insensitive)
        const s = JSON.stringify(json);
        meta.generator = detectGenerator(s.toLowerCase());

        // Prompt: keep existing behavior, but also accept capitalized keys
        if (!meta.prompt) {
            const jp =
                (json as any).prompt ??
                (json as any).text ??
                (json as any).Prompt ??
                (json as any).Text;
            if (typeof jp === 'string' && jp.trim()) {
                meta.prompt = jp;
            }
        }

        // ---- Model / Checkpoint alias sweep --------------------------------------
        // Lowercase view of top-level keys for case-insensitive lookups
        const lower = Object.fromEntries(
            Object.entries(json as Record<string, unknown>).map(([k, v]) => [
                k.toLowerCase(),
                v,
            ])
        ) as Record<string, unknown>;

        // Common aliases seen across A1111/Comfy/Invoke/etc.
        const MODEL_ALIASES = [
            'model',
            'model_name',
            'sd_model',
            'sd_model_name',
            'sd_model_checkpoint',
            'checkpoint',
            'ckpt',
            'ckpt_name',
            'base_model',
            'refiner_model',
        ];

        // Helper to assign while respecting base/refiner if your meta supports them
        const assignModelLike = (key: string, value: string) => {
            const v = value.trim();
            if (!v) return;
            if (/refiner/.test(key)) {
                (meta as any).refinerModel = (meta as any).refinerModel || v;
            } else if (/base/.test(key)) {
                (meta as any).baseModel = (meta as any).baseModel || v;
            } else {
                meta.model = meta.model || v;
            }
        };

        for (const k of MODEL_ALIASES) {
            const v = lower[k];
            if (typeof v === 'string') {
                assignModelLike(k, v);
            }
        }

        // Some tools nest model info: e.g., { model: { name, hash, file } }
        if (!meta.model && typeof lower['model'] === 'object' && lower['model'] !== null) {
            const mobj = lower['model'] as any;
            const cand =
                (typeof mobj.name === 'string' && mobj.name) ||
                (typeof mobj.title === 'string' && mobj.title) ||
                (typeof mobj.file === 'string' && mobj.file) ||
                (typeof mobj.hash === 'string' && mobj.hash) ||
                '';
            if (cand && typeof cand === 'string' && cand.trim()) {
                meta.model = cand.trim();
            }
        }

        // Normalize any captured names: strip directory parts but keep extensions
        const normalizeName = (v?: string) => {
            if (!v) return v;
            return v.split(/[/\\]/).pop()!; // keep .safetensors/.ckpt, remove path
        };
        if (meta.model) meta.model = normalizeName(meta.model);
        if ((meta as any).baseModel) (meta as any).baseModel = normalizeName((meta as any).baseModel);
        if (-(meta as any).refinerModel) (meta as any).refinerModel = normalizeName((meta as any).refinerModel);
    }

    // ---- Free-form "Parameters" / infotext block (AUTOMATIC1111 style) ----------
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
        const modelMatch = rawParams.match(/(?:Model|Checkpoint):\s*([^,\n]+)/i);

        meta.prompt = meta.prompt ?? prompt;
        meta.negative = meta.negative ?? negative;
        if (stepsMatch) meta.steps = Number(stepsMatch[1]);
        if (cfgMatch) meta.cfg = Number(cfgMatch[1]);
        if (samplerMatch) meta.sampler = samplerMatch[1].trim();
        if (seedMatch) meta.seed = seedMatch[1].trim();
        if (sizeMatch) meta.size = sizeMatch[1].trim();
        if (modelMatch) {
            const v = modelMatch[1].trim();
            // Keep extension, strip parent directories if present
            meta.model = meta.model || v.split(/[\\/]/).pop();
        }
    }

    // ---- Fallback via simple key-value "software" hint --------------------------
    if (kv && kv['software']) {
        meta.generator = meta.generator || detectGenerator(kv['software']);
    }

    if (!meta.generator) meta.generator = 'Unknown';
    return meta;
}
// END FILE: main/parsers/shared.ts
