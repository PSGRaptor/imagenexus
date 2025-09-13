// FILE: main/parsers/exifXmp.ts
import { type ImageMetadata } from '../metadata';

// JPEG markers
const SOI = 0xD8;  // Start of Image
const EOI = 0xD9;  // End of Image
const SOS = 0xDA;  // Start of Scan
const APP1 = 0xE1;

const XMP_HEADER = Buffer.from('http://ns.adobe.com/xap/1.0/\x00', 'utf8');

function buildXmpPacket(meta: ImageMetadata): Buffer {
    // Basic XMP with Dublin Core + custom sdx namespace
    const esc = (s?: string | number) => {
        const v = s == null ? '' : String(s);
        return v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    };
    const description = esc(
        meta.prompt
            ? (meta.negative ? `${meta.prompt}\nNegative prompt: ${meta.negative}` : meta.prompt)
            : ''
    );
    const size = meta.size || '';
    const xml =
        `<x:xmpmeta xmlns:x="adobe:ns:meta/">
 <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
          xmlns:dc="http://purl.org/dc/elements/1.1/"
          xmlns:sdx="https://imagenexus.app/ns/sdx/1.0/">
  <rdf:Description>
   <dc:description>
    <rdf:Alt>
     <rdf:li xml:lang="x-default">${description}</rdf:li>
    </rdf:Alt>
   </dc:description>
   <sdx:generator>${esc(meta.generator)}</sdx:generator>
   <sdx:model>${esc(meta.model)}</sdx:model>
   <sdx:steps>${esc(meta.steps)}</sdx:steps>
   <sdx:cfg>${esc(meta.cfg)}</sdx:cfg>
   <sdx:seed>${esc(meta.seed)}</sdx:seed>
   <sdx:size>${esc(size)}</sdx:size>
  </rdf:Description>
 </rdf:RDF>
</x:xmpmeta>`;
    const body = Buffer.from(xml, 'utf8');
    return Buffer.concat([XMP_HEADER, body]);
}

function readJpegSegments(jpeg: Buffer): Array<{ marker: number; start: number; end: number; data: Buffer }> {
    let off = 0;
    if (!(jpeg[off] === 0xFF && jpeg[off + 1] === SOI)) throw new Error('Not a JPEG');
    off += 2;

    const segs: Array<{ marker: number; start: number; end: number; data: Buffer }> = [];
    while (off + 4 <= jpeg.length) {
        if (jpeg[off] !== 0xFF) break;
        let marker = jpeg[off + 1]; off += 2;
        if (marker === SOS || marker === EOI) break;
        const len = jpeg.readUInt16BE(off); off += 2;
        const start = off;
        const end = off + len - 2;
        const data = jpeg.subarray(start, end);
        segs.push({ marker, start, end, data });
        off = end;
    }
    return segs;
}

/**
 * Replace or insert an APP1 XMP segment.
 * Returns a new JPEG buffer with updated XMP.
 */
export async function writeJpegXmpMetadata(inputJpeg: Buffer, meta: ImageMetadata): Promise<Buffer> {
    // Validate JPEG
    if (!(inputJpeg[0] === 0xFF && inputJpeg[1] === SOI)) throw new Error('Not a JPEG');

    const xmpPayload = buildXmpPacket(meta);
    const xmpLen = xmpPayload.length + 2; // include header inside APP1 data length

    const out: Buffer[] = [];
    // SOI
    out.push(Buffer.from([0xFF, SOI]));

    // Walk segments, replace existing XMP APP1 if found
    let off = 2;
    let replaced = false;

    while (off + 4 <= inputJpeg.length) {
        if (inputJpeg[off] !== 0xFF) break;
        const marker = inputJpeg[off + 1];

        if (marker === SOS || marker === EOI) {
            // Insert our XMP before SOS/EOI if we haven't yet
            if (!replaced) {
                const hdr = Buffer.alloc(4);
                hdr[0] = 0xFF; hdr[1] = APP1;
                hdr.writeUInt16BE(xmpLen, 2);
                out.push(hdr, xmpPayload);
                replaced = true;
            }
            // Copy the rest untouched
            out.push(inputJpeg.subarray(off));
            return Buffer.concat(out);
        }

        // Normal segment with length
        const len = inputJpeg.readUInt16BE(off + 2);
        const segStart = off + 4;
        const segEnd = segStart + len - 2;

        // Is this an APP1 XMP?
        if (marker === APP1) {
            const payload = inputJpeg.subarray(segStart, segEnd);
            if (payload.length >= XMP_HEADER.length && payload.subarray(0, XMP_HEADER.length).equals(XMP_HEADER)) {
                // Replace it
                const hdr = Buffer.alloc(4);
                hdr[0] = 0xFF; hdr[1] = APP1;
                hdr.writeUInt16BE(xmpLen, 2);
                out.push(hdr, xmpPayload);
                replaced = true;
                off = segEnd;
                continue;
            }
        }

        // Pass-through unchanged
        out.push(inputJpeg.subarray(off, segEnd));
        off = segEnd;
    }

    // If we exit loop without SOS/EOI, append XMP then the tail
    if (!replaced) {
        const hdr = Buffer.alloc(4);
        hdr[0] = 0xFF; hdr[1] = APP1;
        hdr.writeUInt16BE(xmpLen, 2);
        out.push(hdr, xmpPayload);
    }
    out.push(inputJpeg.subarray(off));
    return Buffer.concat(out);
}
