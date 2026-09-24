import type { RGB } from './raster';

/** Paint's default colour box: two rows of fourteen, dark over light. */
export const DEFAULT_PALETTE: RGB[] = [
    0x000000, 0x808080, 0x800000, 0x808000, 0x008000, 0x008080, 0x000080,
    0x800080, 0x808040, 0x004040, 0x0080ff, 0x004080, 0x4000ff, 0x804000,
    0xffffff, 0xc0c0c0, 0xff0000, 0xffff00, 0x00ff00, 0x00ffff, 0x0000ff,
    0xff00ff, 0xffff80, 0x00ff80, 0x80ffff, 0x8080ff, 0xff0080, 0xff8040,
];

/** The 48 "Basic colors" of the Edit Colors dialog, in its eight-column order. */
export const BASIC_COLORS: RGB[] = [
    0xff8080, 0xffff80, 0x80ff80, 0x00ff80, 0x80ffff, 0x0080ff, 0xff80c0, 0xff80ff,
    0xff0000, 0xffff00, 0x80ff00, 0x00ff40, 0x00ffff, 0x0080c0, 0x8080c0, 0xff00ff,
    0x804040, 0xff8040, 0x00ff00, 0x008080, 0x004080, 0x8080ff, 0x800040, 0xff0080,
    0x800000, 0xff8000, 0x008000, 0x008040, 0x0000ff, 0x0000a0, 0x800080, 0x8000ff,
    0x400000, 0x804000, 0x004000, 0x004040, 0x000080, 0x000040, 0x400040, 0x400080,
    0x000000, 0x808000, 0x808040, 0x808080, 0x408080, 0xc0c0c0, 0x400040, 0xffffff,
];

export const cssOf = (rgb: RGB): string => `#${rgb.toString(16).padStart(6, '0')}`;

export const channels = (rgb: RGB): [number, number, number] => [(rgb >> 16) & 0xff, (rgb >> 8) & 0xff, rgb & 0xff];

export const rgbFrom = (r: number, g: number, b: number): RGB =>
    ((clampByte(r) << 16) | (clampByte(g) << 8) | clampByte(b)) >>> 0;

const clampByte = (v: number) => Math.max(0, Math.min(255, Math.round(v)));

/**
 * Windows measured hue, saturation and luminosity on a 0–240 scale, and the Edit Colors dialog
 * showed them that way. These convert between that scale and RGB.
 */
export const HLS_MAX = 240;

export function toHLS(rgb: RGB): { h: number; s: number; l: number } {
    const [r, g, b] = channels(rgb).map((c) => c / 255);
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const l = (max + min) / 2;
    let h = 0;
    let s = 0;
    if (max !== min) {
        const d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
        else if (max === g) h = (b - r) / d + 2;
        else h = (r - g) / d + 4;
        h /= 6;
    }
    // Hue wraps at 240, which is the same red as 0; Windows showed 0.
    return { h: Math.round(h * HLS_MAX) % HLS_MAX, s: Math.round(s * HLS_MAX), l: Math.round(l * HLS_MAX) };
}

export function fromHLS(h: number, s: number, l: number): RGB {
    const H = (((h % HLS_MAX) + HLS_MAX) % HLS_MAX) / HLS_MAX;
    const S = Math.max(0, Math.min(1, s / HLS_MAX));
    const L = Math.max(0, Math.min(1, l / HLS_MAX));
    if (S === 0) return rgbFrom(L * 255, L * 255, L * 255);
    const q = L < 0.5 ? L * (1 + S) : L + S - L * S;
    const p = 2 * L - q;
    const hue = (t: number) => {
        let u = t;
        if (u < 0) u += 1;
        if (u > 1) u -= 1;
        if (u < 1 / 6) return p + (q - p) * 6 * u;
        if (u < 1 / 2) return q;
        if (u < 2 / 3) return p + (q - p) * (2 / 3 - u) * 6;
        return p;
    };
    return rgbFrom(hue(H + 1 / 3) * 255, hue(H) * 255, hue(H - 1 / 3) * 255);
}
