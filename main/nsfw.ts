export function heuristicNSFW(name: string): boolean {
    const s = name.toLowerCase();
    const hints = ['nsfw', 'r18', 'lewd', '18+', 'explicit'];
    return hints.some(h => s.includes(h));
}
