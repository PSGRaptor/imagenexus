// Minimal ambient type declarations for packages without @types

declare module 'png-chunks-extract' {
    export interface PngChunk {
        name: string;   // e.g., 'IHDR', 'tEXt', 'iTXt'
        data: Buffer;   // raw chunk data
    }
    export default function extractChunks(buffer: Buffer): PngChunk[];
}

declare module 'png-chunk-text' {
    import type { PngChunk } from 'png-chunks-extract';
    export interface PngTextChunk {
        keyword: string; // e.g., 'parameters', 'prompt', 'json'
        text: string;
    }
    // Decodes a tEXt/iTXt PngChunk to { keyword, text }
    export default function decodeText(chunk: PngChunk): PngTextChunk;
}
