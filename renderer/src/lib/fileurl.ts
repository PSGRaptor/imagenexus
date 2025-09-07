// Convert a Windows/Unix absolute path (or an existing file:// path)
// into a valid URL for <img src>.
export function toFileUrl(p?: string | null): string | null {
    if (!p) return null;
    let s = p.startsWith('file:') ? p.replace(/^file:\/*/i, '') : p;
    s = s.replace(/\\/g, '/'); // Windows backslashes -> forward slashes
    return `file:///${s}`;
}
