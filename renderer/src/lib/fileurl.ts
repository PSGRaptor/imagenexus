// Convert a Windows/Unix path to a valid file:// URL usable in <img src>
// - Ensures triple slash
// - Replaces backslashes with forward slashes
export function toFileUrl(p: string | undefined | null): string | null {
    if (!p) return null;
    const withSlashes = p.replace(/\\/g, '/');
    // If it already starts with file://, normalize to file:///
    if (/^file:\/\//i.test(withSlashes)) {
        const noProto = withSlashes.replace(/^file:\/+/, '');
        return `file:///${noProto}`;
    }
    return `file:///${withSlashes}`;
}
