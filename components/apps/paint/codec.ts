import { wrapBitmap, type Bitmap } from './raster';

/**
 * Getting pictures into and out of Paint: decode an image file or clipboard blob into a
 * `Bitmap`, and encode a `Bitmap` as PNG, JPEG or a 24-bit BMP.
 *
 * Browser-only (it uses a canvas to decode and to encode PNG and JPEG). The BMP encoder is plain
 * byte-writing, because no browser can produce a BMP — and 24-bit Bitmap was the format XP's
 * Paint saved by default, so leaving it out would have been a conspicuous gap.
 */

/** The largest side Paint accepts. Bigger images are scaled down on the way in, and the visitor is told. */
export const MAX_SIDE = 2000;

export type SaveFormat = 'png' | 'jpeg' | 'bmp';

/** "Save as type", in the wording XP's Save As dialog used. */
export const SAVE_FORMATS: { id: SaveFormat; label: string; ext: string; mime: string }[] = [
    { id: 'png', label: 'PNG (*.PNG)', ext: 'png', mime: 'image/png' },
    { id: 'jpeg', label: 'JPEG (*.JPG;*.JPEG;*.JPE;*.JFIF)', ext: 'jpg', mime: 'image/jpeg' },
    { id: 'bmp', label: '24-bit Bitmap (*.BMP;*.DIB)', ext: 'bmp', mime: 'image/bmp' },
];

export const formatOf = (id: SaveFormat) => SAVE_FORMATS.find((f) => f.id === id) ?? SAVE_FORMATS[0];

/** A canvas holding exactly `b`. */
export function canvasOf(b: Bitmap): HTMLCanvasElement {
    const c = document.createElement('canvas');
    c.width = b.width;
    c.height = b.height;
    c.getContext('2d')?.putImageData(new ImageData(new Uint8ClampedArray(b.data), b.width, b.height), 0, 0);
    return c;
}

export interface Decoded {
    bitmap: Bitmap;
    /** The original size when the image was scaled down to fit `MAX_SIDE`. */
    scaledFrom: { width: number; height: number } | null;
}

/**
 * Decode any image the browser can read. Transparent areas are flattened onto white, since
 * Paint's pictures have no transparency.
 */
export async function decodeImage(blob: Blob): Promise<Decoded> {
    const img = await createImageBitmap(blob);
    try {
        let width = img.width;
        let height = img.height;
        let scaledFrom: Decoded['scaledFrom'] = null;
        if (width > MAX_SIDE || height > MAX_SIDE) {
            const k = Math.min(MAX_SIDE / width, MAX_SIDE / height);
            scaledFrom = { width, height };
            width = Math.max(1, Math.round(width * k));
            height = Math.max(1, Math.round(height * k));
        }
        const c = document.createElement('canvas');
        c.width = width;
        c.height = height;
        const ctx = c.getContext('2d');
        if (!ctx) throw new Error('No 2D canvas available.');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);
        const data = ctx.getImageData(0, 0, width, height).data;
        return { bitmap: wrapBitmap(width, height, new Uint8ClampedArray(data)), scaledFrom };
    } finally {
        img.close();
    }
}

/** A 24-bit, bottom-up BMP with the standard 40-byte header, at 96 dpi. */
export function encodeBmp(b: Bitmap): Blob {
    const rowSize = Math.ceil((b.width * 3) / 4) * 4;
    const imageSize = rowSize * b.height;
    const buf = new ArrayBuffer(54 + imageSize);
    const v = new DataView(buf);
    v.setUint8(0, 0x42); // 'B'
    v.setUint8(1, 0x4d); // 'M'
    v.setUint32(2, 54 + imageSize, true);
    v.setUint32(10, 54, true);
    v.setUint32(14, 40, true);
    v.setInt32(18, b.width, true);
    v.setInt32(22, b.height, true);
    v.setUint16(26, 1, true);
    v.setUint16(28, 24, true);
    v.setUint32(34, imageSize, true);
    v.setInt32(38, 3780, true); // 96 dpi in pixels per metre
    v.setInt32(42, 3780, true);
    const out = new Uint8Array(buf);
    for (let y = 0; y < b.height; y++) {
        const src = (b.height - 1 - y) * b.width * 4;
        let dst = 54 + y * rowSize;
        for (let x = 0; x < b.width; x++) {
            const i = src + x * 4;
            out[dst++] = b.data[i + 2];
            out[dst++] = b.data[i + 1];
            out[dst++] = b.data[i];
        }
    }
    return new Blob([buf], { type: 'image/bmp' });
}

export function encodeImage(b: Bitmap, format: SaveFormat): Promise<Blob> {
    if (format === 'bmp') return Promise.resolve(encodeBmp(b));
    const { mime } = formatOf(format);
    return new Promise((resolve, reject) => {
        canvasOf(b).toBlob(
            (blob) => (blob ? resolve(blob) : reject(new Error(`This browser cannot encode ${mime}.`))),
            mime,
            format === 'jpeg' ? 0.92 : undefined,
        );
    });
}

/** Hand a file to the browser's download mechanism. */
export function download(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    // Revoked after the click has been handled, not synchronously inside it.
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/**
 * Put a picture on the system clipboard as PNG. Best effort: it needs a secure context and
 * `ClipboardItem` support, and the browser may refuse it. Returns whether it worked, so Paint's
 * own clipboard can carry on regardless.
 */
export async function writeClipboardImage(b: Bitmap): Promise<boolean> {
    try {
        if (typeof ClipboardItem === 'undefined' || !navigator.clipboard?.write) return false;
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': encodeImage(b, 'png') })]);
        return true;
    } catch {
        return false;
    }
}

/** Read an image from the system clipboard, where the browser allows it. */
export async function readClipboardImage(): Promise<Blob | null> {
    try {
        if (!navigator.clipboard?.read) return null;
        for (const item of await navigator.clipboard.read()) {
            const type = item.types.find((t) => t.startsWith('image/'));
            if (type) return await item.getType(type);
        }
        return null;
    } catch {
        return null;
    }
}
