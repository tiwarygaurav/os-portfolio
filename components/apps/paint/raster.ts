/**
 * Paint's pixel engine.
 *
 * MS Paint drew without anti-aliasing: every line, ellipse and letter is made of whole pixels in
 * exactly the chosen colour. That is not nostalgia for its own sake — it is why Fill With Color
 * works. A canvas 2D path is anti-aliased, and a flood fill stops at the soft half-tone fringe it
 * leaves, so the fill never reaches the line. Everything here writes pixels directly, so a fill
 * always meets the shape it fills.
 *
 * Pure: no DOM, no canvas, no React. A `Bitmap` is a width, a height and an RGBA buffer (the same
 * layout as `ImageData`, so the engine can hand the buffer straight to `putImageData`). That keeps
 * every algorithm below runnable — and testable — under Node.
 */

/* ------------------------------------------------------------------ types */

/** An RGBA byte buffer over a plain `ArrayBuffer`, which is what `ImageData` accepts. */
export type Bytes = Uint8ClampedArray<ArrayBuffer>;

export interface Bitmap {
    readonly width: number;
    readonly height: number;
    /**
     * RGBA bytes, row-major — `ImageData.data` layout, so the engine can wrap this very buffer in
     * an `ImageData` and repaint without copying.
     */
    readonly data: Bytes;
    /** The same buffer, one 32-bit word per pixel. Most algorithms write through this. */
    readonly px: Uint32Array;
}

export interface Rect {
    x: number;
    y: number;
    w: number;
    h: number;
}

/** A colour as the UI holds it: 0xRRGGBB. */
export type RGB = number;

/* ------------------------------------------------------------- pixels */

/** Byte order of a 32-bit word on this machine. Every mainstream platform is little-endian. */
const LITTLE_ENDIAN = new Uint8Array(new Uint32Array([0x0a0b0c0d]).buffer)[0] === 0x0d;

/** The opaque 32-bit word for a colour, in this machine's byte order. */
export function pixelOf(rgb: RGB): number {
    const r = (rgb >> 16) & 0xff;
    const g = (rgb >> 8) & 0xff;
    const b = rgb & 0xff;
    return LITTLE_ENDIAN ? ((0xff << 24) | (b << 16) | (g << 8) | r) >>> 0 : ((r << 24) | (g << 16) | (b << 8) | 0xff) >>> 0;
}

/** The colour of a 32-bit word (alpha ignored — Paint's pictures are opaque). */
export function rgbOf(word: number): RGB {
    if (LITTLE_ENDIAN) return ((word & 0xff) << 16) | (word & 0xff00) | ((word >>> 16) & 0xff);
    return (word >>> 8) & 0xffffff;
}

/** The alpha byte of a 32-bit word. */
export const alphaOf = (word: number): number => (LITTLE_ENDIAN ? word >>> 24 : word & 0xff);

export function wrapBitmap(width: number, height: number, data: Bytes): Bitmap {
    return { width, height, data, px: new Uint32Array(data.buffer, data.byteOffset, width * height) };
}

export function createBitmap(width: number, height: number, rgb: RGB = 0xffffff): Bitmap {
    const b = wrapBitmap(width, height, new Uint8ClampedArray(width * height * 4));
    b.px.fill(pixelOf(rgb));
    return b;
}

/** A fully transparent bitmap — the preview layer drawn over the picture. */
export function createClearBitmap(width: number, height: number): Bitmap {
    return wrapBitmap(width, height, new Uint8ClampedArray(width * height * 4));
}

export function cloneBitmap(b: Bitmap): Bitmap {
    return wrapBitmap(b.width, b.height, new Uint8ClampedArray(b.data));
}

export function getRGB(b: Bitmap, x: number, y: number): RGB | null {
    if (x < 0 || y < 0 || x >= b.width || y >= b.height) return null;
    return rgbOf(b.px[y * b.width + x]);
}

/* ---------------------------------------------------------- dirty rect */

/** Accumulates the bounding box of everything drawn, so only that region is repainted. */
export class Dirty {
    x0 = Infinity;
    y0 = Infinity;
    x1 = -Infinity;
    y1 = -Infinity;

    add(x: number, y: number): void {
        if (x < this.x0) this.x0 = x;
        if (y < this.y0) this.y0 = y;
        if (x > this.x1) this.x1 = x;
        if (y > this.y1) this.y1 = y;
    }

    addRect(r: Rect | null): void {
        if (!r || r.w <= 0 || r.h <= 0) return;
        this.add(r.x, r.y);
        this.add(r.x + r.w - 1, r.y + r.h - 1);
    }

    get empty(): boolean {
        return this.x1 < this.x0;
    }

    /** The accumulated box clipped to a `width` x `height` picture, or null if nothing landed. */
    rect(width: number, height: number): Rect | null {
        if (this.empty) return null;
        const x0 = Math.max(0, this.x0);
        const y0 = Math.max(0, this.y0);
        const x1 = Math.min(width - 1, this.x1);
        const y1 = Math.min(height - 1, this.y1);
        if (x1 < x0 || y1 < y0) return null;
        return { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
    }

    reset(): void {
        this.x0 = this.y0 = Infinity;
        this.x1 = this.y1 = -Infinity;
    }
}

export function unionRect(a: Rect | null, b: Rect | null): Rect | null {
    if (!a) return b;
    if (!b) return a;
    const x = Math.min(a.x, b.x);
    const y = Math.min(a.y, b.y);
    return { x, y, w: Math.max(a.x + a.w, b.x + b.w) - x, h: Math.max(a.y + a.h, b.y + b.h) - y };
}

export function clipRect(r: Rect, width: number, height: number): Rect | null {
    const x0 = Math.max(0, r.x);
    const y0 = Math.max(0, r.y);
    const x1 = Math.min(width, r.x + r.w);
    const y1 = Math.min(height, r.y + r.h);
    return x1 > x0 && y1 > y0 ? { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } : null;
}

/* ------------------------------------------------------------- basic writes */

export function setPx(b: Bitmap, x: number, y: number, word: number, dirty?: Dirty): void {
    if (x < 0 || y < 0 || x >= b.width || y >= b.height) return;
    b.px[y * b.width + x] = word;
    dirty?.add(x, y);
}

/** A horizontal run of pixels, clipped. `x0` and `x1` are inclusive and may be in either order. */
export function hline(b: Bitmap, x0: number, x1: number, y: number, word: number, dirty?: Dirty): void {
    if (y < 0 || y >= b.height) return;
    let a = Math.min(x0, x1);
    let c = Math.max(x0, x1);
    if (c < 0 || a >= b.width) return;
    a = Math.max(0, a);
    c = Math.min(b.width - 1, c);
    const row = y * b.width;
    b.px.fill(word, row + a, row + c + 1);
    dirty?.add(a, y);
    dirty?.add(c, y);
}

export function fillRect(b: Bitmap, r: Rect, word: number, dirty?: Dirty): void {
    for (let y = r.y; y < r.y + r.h; y++) hline(b, r.x, r.x + r.w - 1, y, word, dirty);
}

/** Every pixel becomes `word` — Image > Clear Image, and a new picture. */
export function fillAll(b: Bitmap, word: number): void {
    b.px.fill(word);
}

/* -------------------------------------------------------------------- pens */

/** A brush footprint: pixel offsets from the pointer position. */
export interface Pen {
    readonly dx: Int16Array;
    readonly dy: Int16Array;
}

function penFrom(points: [number, number][]): Pen {
    const seen = new Set<string>();
    const unique = points.filter(([x, y]) => {
        const k = `${x},${y}`;
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
    });
    return { dx: Int16Array.from(unique.map((p) => p[0])), dy: Int16Array.from(unique.map((p) => p[1])) };
}

/** A filled disc of the given diameter, centred as near the pointer as whole pixels allow. */
export function roundPen(diameter: number): Pen {
    const d = Math.max(1, Math.round(diameter));
    if (d === 1) return penFrom([[0, 0]]);
    const pts: [number, number][] = [];
    const r = d / 2;
    const off = Math.floor((d - 1) / 2);
    for (let y = 0; y < d; y++) {
        for (let x = 0; x < d; x++) {
            const cx = x + 0.5 - r;
            const cy = y + 0.5 - r;
            if (cx * cx + cy * cy <= r * r + 0.25) pts.push([x - off, y - off]);
        }
    }
    return penFrom(pts);
}

export function squarePen(size: number): Pen {
    const s = Math.max(1, Math.round(size));
    const off = Math.floor((s - 1) / 2);
    const pts: [number, number][] = [];
    for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) pts.push([x - off, y - off]);
    return penFrom(pts);
}

/** A one-pixel diagonal stroke: `/` rises to the right, `\` falls to the right. */
export function slashPen(length: number, direction: 'forward' | 'back'): Pen {
    const n = Math.max(1, Math.round(length));
    const off = Math.floor((n - 1) / 2);
    const pts: [number, number][] = [];
    for (let i = 0; i < n; i++) pts.push([i - off, direction === 'forward' ? off - i : i - off]);
    return penFrom(pts);
}

export function stamp(b: Bitmap, x: number, y: number, pen: Pen, word: number, dirty?: Dirty): void {
    const { width, height, px } = b;
    for (let i = 0; i < pen.dx.length; i++) {
        const px_ = x + pen.dx[i];
        const py = y + pen.dy[i];
        if (px_ < 0 || py < 0 || px_ >= width || py >= height) continue;
        px[py * width + px_] = word;
        dirty?.add(px_, py);
    }
}

/**
 * Stamp that only repaints pixels currently equal to `from` — the Color Eraser. XP's eraser,
 * dragged with the right button, turned only the foreground colour into the background colour
 * and left every other colour alone.
 */
export function stampReplace(b: Bitmap, x: number, y: number, pen: Pen, from: number, to: number, dirty?: Dirty): void {
    const { width, height, px } = b;
    const fromRGB = rgbOf(from);
    for (let i = 0; i < pen.dx.length; i++) {
        const px_ = x + pen.dx[i];
        const py = y + pen.dy[i];
        if (px_ < 0 || py < 0 || px_ >= width || py >= height) continue;
        const at = py * width + px_;
        if (rgbOf(px[at]) !== fromRGB) continue;
        px[at] = to;
        dirty?.add(px_, py);
    }
}

/* ------------------------------------------------------------------- lines */

/** Bresenham: every integer point from (x0,y0) to (x1,y1), both ends included. */
export function eachLinePoint(x0: number, y0: number, x1: number, y1: number, fn: (x: number, y: number) => void): void {
    let x = Math.round(x0);
    let y = Math.round(y0);
    const tx = Math.round(x1);
    const ty = Math.round(y1);
    const dx = Math.abs(tx - x);
    const dy = -Math.abs(ty - y);
    const sx = x < tx ? 1 : -1;
    const sy = y < ty ? 1 : -1;
    let err = dx + dy;
    for (;;) {
        fn(x, y);
        if (x === tx && y === ty) return;
        const e2 = 2 * err;
        if (e2 >= dy) {
            err += dy;
            x += sx;
        }
        if (e2 <= dx) {
            err += dx;
            y += sy;
        }
    }
}

export function strokeLine(b: Bitmap, x0: number, y0: number, x1: number, y1: number, pen: Pen, word: number, dirty?: Dirty): void {
    eachLinePoint(x0, y0, x1, y1, (x, y) => stamp(b, x, y, pen, word, dirty));
}

export function strokeLineReplace(
    b: Bitmap,
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    pen: Pen,
    from: number,
    to: number,
    dirty?: Dirty,
): void {
    eachLinePoint(x0, y0, x1, y1, (x, y) => stampReplace(b, x, y, pen, from, to, dirty));
}

/** A polyline through `points` ([x0, y0, x1, y1, ...]). `closed` joins the last to the first. */
export function strokePolyline(b: Bitmap, points: number[], pen: Pen, word: number, closed: boolean, dirty?: Dirty): void {
    const n = points.length / 2;
    if (n === 0) return;
    if (n === 1) {
        stamp(b, points[0], points[1], pen, word, dirty);
        return;
    }
    for (let i = 0; i < n - 1; i++) strokeLine(b, points[2 * i], points[2 * i + 1], points[2 * i + 2], points[2 * i + 3], pen, word, dirty);
    if (closed) strokeLine(b, points[2 * n - 2], points[2 * n - 1], points[0], points[1], pen, word, dirty);
}

/** Points along a cubic Bézier, dense enough that joining them with lines leaves no gaps. */
export function bezierPoints(
    x0: number, y0: number, x1: number, y1: number, x2: number, y2: number, x3: number, y3: number,
): number[] {
    const length = Math.hypot(x1 - x0, y1 - y0) + Math.hypot(x2 - x1, y2 - y1) + Math.hypot(x3 - x2, y3 - y2);
    const steps = Math.max(2, Math.ceil(length / 2));
    const out: number[] = [];
    for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const u = 1 - t;
        const a = u * u * u;
        const bq = 3 * u * u * t;
        const c = 3 * u * t * t;
        const d = t * t * t;
        out.push(Math.round(a * x0 + bq * x1 + c * x2 + d * x3), Math.round(a * y0 + bq * y1 + c * y2 + d * y3));
    }
    return out;
}

/* ---------------------------------------------------------- shapes as spans */

/**
 * A shape as one horizontal span per row: row `y0 + i` covers `left[i]..right[i]` inclusive (an
 * empty row has `left > right`). Rectangles, ellipses and rounded rectangles are all described
 * this way, which gives filled shapes and thick outlines one shared implementation: an outline of
 * width w is the shape minus the same shape inset by w.
 */
export interface Spans {
    y0: number;
    left: Int32Array;
    right: Int32Array;
}

export interface Box {
    x0: number;
    y0: number;
    x1: number;
    y1: number;
}

/** Normalise two corner points into an inclusive box. */
export const boxOf = (ax: number, ay: number, bx: number, by: number): Box => ({
    x0: Math.min(ax, bx),
    y0: Math.min(ay, by),
    x1: Math.max(ax, bx),
    y1: Math.max(ay, by),
});

export const insetBox = (b: Box, n: number): Box => ({ x0: b.x0 + n, y0: b.y0 + n, x1: b.x1 - n, y1: b.y1 - n });

const emptyBox = (b: Box) => b.x1 < b.x0 || b.y1 < b.y0;

function newSpans(box: Box): Spans {
    const rows = box.y1 - box.y0 + 1;
    return { y0: box.y0, left: new Int32Array(rows), right: new Int32Array(rows) };
}

export function rectSpans(box: Box): Spans | null {
    if (emptyBox(box)) return null;
    const s = newSpans(box);
    s.left.fill(box.x0);
    s.right.fill(box.x1);
    return s;
}

/**
 * The ellipse inscribed in `box`. Each row's span is the chord of the ellipse at that row's
 * centre line, so a one-pixel-tall or one-pixel-wide box still yields a line, and the result is
 * symmetric about both axes.
 */
export function ellipseSpans(box: Box): Spans | null {
    if (emptyBox(box)) return null;
    const s = newSpans(box);
    const cx = (box.x0 + box.x1) / 2;
    const cy = (box.y0 + box.y1) / 2;
    const rx = (box.x1 - box.x0 + 1) / 2;
    const ry = (box.y1 - box.y0 + 1) / 2;
    for (let i = 0; i < s.left.length; i++) {
        const dy = (box.y0 + i - cy) / ry;
        const t = 1 - dy * dy;
        if (t <= 0) {
            s.left[i] = Math.round(cx);
            s.right[i] = Math.round(cx);
            continue;
        }
        const half = rx * Math.sqrt(t) - 0.5;
        s.left[i] = Math.ceil(cx - half - 1e-9);
        s.right[i] = Math.floor(cx + half + 1e-9);
        // A chord narrower than a pixel still covers the pixel(s) at the centre — two of them
        // when the box is an even number of pixels wide — so tiny ellipses keep their shape.
        if (s.left[i] > s.right[i]) {
            s.left[i] = Math.floor(cx);
            s.right[i] = Math.ceil(cx);
        }
    }
    return s;
}

/** A rectangle with quarter-ellipse corners of radius `radius` (shrunk to fit a small box). */
export function roundRectSpans(box: Box, radius: number): Spans | null {
    if (emptyBox(box)) return null;
    const w = box.x1 - box.x0 + 1;
    const h = box.y1 - box.y0 + 1;
    const rx = Math.max(0, Math.min(radius, Math.floor(w / 2)));
    const ry = Math.max(0, Math.min(radius, Math.floor(h / 2)));
    const s = newSpans(box);
    for (let i = 0; i < h; i++) {
        // Distance into the corner band from the nearer of the top/bottom edges.
        const fromEdge = Math.min(i, h - 1 - i);
        let inset = 0;
        if (ry > 0 && fromEdge < ry) {
            const dy = (ry - fromEdge - 0.5) / ry;
            inset = Math.round(rx - rx * Math.sqrt(Math.max(0, 1 - dy * dy)));
        }
        s.left[i] = box.x0 + inset;
        s.right[i] = box.x1 - inset;
    }
    return s;
}

export function fillSpans(b: Bitmap, s: Spans, word: number, dirty?: Dirty): void {
    for (let i = 0; i < s.left.length; i++) {
        if (s.left[i] <= s.right[i]) hline(b, s.left[i], s.right[i], s.y0 + i, word, dirty);
    }
}

/** The pixels of `outer` that `inner` does not cover: a ring, i.e. a thick outline. */
export function fillRing(b: Bitmap, outer: Spans, inner: Spans | null, word: number, dirty?: Dirty): void {
    for (let i = 0; i < outer.left.length; i++) {
        const y = outer.y0 + i;
        const l = outer.left[i];
        const r = outer.right[i];
        if (l > r) continue;
        const j = inner ? y - inner.y0 : -1;
        if (!inner || j < 0 || j >= inner.left.length || inner.left[j] > inner.right[j]) {
            hline(b, l, r, y, word, dirty);
            continue;
        }
        if (inner.left[j] > l) hline(b, l, inner.left[j] - 1, y, word, dirty);
        if (inner.right[j] < r) hline(b, inner.right[j] + 1, r, y, word, dirty);
    }
}

/**
 * The one-pixel outline of a span shape: every pixel of the shape with a 4-neighbour outside it.
 * Used for width-1 outlines, where "shape minus shape inset by 1" would leave gaps on the
 * shallow parts of an ellipse.
 */
export function outlineSpans(b: Bitmap, s: Spans, word: number, dirty?: Dirty): void {
    const n = s.left.length;
    for (let i = 0; i < n; i++) {
        const l = s.left[i];
        const r = s.right[i];
        if (l > r) continue;
        const y = s.y0 + i;
        const hasUp = i > 0 && s.left[i - 1] <= s.right[i - 1];
        const hasDown = i < n - 1 && s.left[i + 1] <= s.right[i + 1];
        if (!hasUp || !hasDown) {
            hline(b, l, r, y, word, dirty);
            continue;
        }
        // Interior pixels have all four neighbours inside: not the row's ends, and covered by the
        // rows above and below. Everything else in the row is edge.
        const a = Math.max(l + 1, s.left[i - 1], s.left[i + 1]);
        const c = Math.min(r - 1, s.right[i - 1], s.right[i + 1]);
        if (a > c) {
            hline(b, l, r, y, word, dirty);
            continue;
        }
        hline(b, l, a - 1, y, word, dirty);
        hline(b, c + 1, r, y, word, dirty);
    }
}

export type ShapeKind = 'rectangle' | 'ellipse' | 'rounded-rect';

/** XP's three fill styles: border only, border with fill, fill with no border. */
export type FillStyle = 'outline' | 'outline-fill' | 'fill';

/** The corner radius XP's Rounded Rectangle used, in pixels. */
export const ROUND_RECT_RADIUS = 8;

export function shapeSpans(kind: ShapeKind, box: Box, inset = 0): Spans | null {
    const b = inset ? insetBox(box, inset) : box;
    if (kind === 'rectangle') return rectSpans(b);
    if (kind === 'ellipse') return ellipseSpans(b);
    return roundRectSpans(b, Math.max(0, ROUND_RECT_RADIUS - inset));
}

/**
 * Draw a rectangle, ellipse or rounded rectangle inside `box` the way Paint did: the outline sits
 * inside the box and is `width` pixels thick, in `stroke`; `fill` paints the interior.
 */
export function drawShape(
    b: Bitmap,
    kind: ShapeKind,
    box: Box,
    width: number,
    style: FillStyle,
    stroke: number,
    fill: number,
    dirty?: Dirty,
): void {
    const outer = shapeSpans(kind, box);
    if (!outer) return;
    if (style === 'fill') {
        fillSpans(b, outer, fill, dirty);
        return;
    }
    const inner = shapeSpans(kind, box, width);
    if (style === 'outline-fill' && inner) fillSpans(b, inner, fill, dirty);
    if (width <= 1) outlineSpans(b, outer, stroke, dirty);
    else fillRing(b, outer, inner, stroke, dirty);
}

/* ------------------------------------------------------------------ polygons */

/**
 * Scanline fill of a closed polygon ([x0, y0, x1, y1, ...]) with the even-odd rule, sampling each
 * row at its pixel centre. Calls `span(y, xStart, xEnd)` for every covered run, inclusive.
 */
export function polygonRuns(points: number[], span: (y: number, x0: number, x1: number) => void): void {
    const n = points.length / 2;
    if (n < 3) return;
    let minY = Infinity;
    let maxY = -Infinity;
    for (let i = 0; i < n; i++) {
        minY = Math.min(minY, points[2 * i + 1]);
        maxY = Math.max(maxY, points[2 * i + 1]);
    }
    const xs: number[] = [];
    for (let y = Math.floor(minY); y <= Math.ceil(maxY); y++) {
        const sy = y + 0.5;
        xs.length = 0;
        for (let i = 0; i < n; i++) {
            const ax = points[2 * i];
            const ay = points[2 * i + 1];
            const bx = points[(2 * i + 2) % (2 * n)];
            const by = points[(2 * i + 3) % (2 * n)];
            if ((ay <= sy && by > sy) || (by <= sy && ay > sy)) {
                xs.push(ax + ((sy - ay) / (by - ay)) * (bx - ax));
            }
        }
        xs.sort((p, q) => p - q);
        for (let k = 0; k + 1 < xs.length; k += 2) {
            const x0 = Math.ceil(xs[k] - 0.5);
            const x1 = Math.floor(xs[k + 1] - 0.5);
            if (x1 >= x0) span(y, x0, x1);
        }
    }
}

export function fillPolygon(b: Bitmap, points: number[], word: number, dirty?: Dirty): void {
    polygonRuns(points, (y, x0, x1) => hline(b, x0, x1, y, word, dirty));
}

/* ----------------------------------------------------------------- flood fill */

/**
 * Fill With Color: replace the 4-connected region of exactly the colour under (x, y). A scanline
 * fill with an explicit stack, so a large region never recurses and each pixel is visited about
 * once. Returns false when there was nothing to change.
 */
export function floodFill(b: Bitmap, x: number, y: number, word: number, dirty?: Dirty): boolean {
    const { width, height, px } = b;
    if (x < 0 || y < 0 || x >= width || y >= height) return false;
    const target = px[y * width + x];
    if (rgbOf(target) === rgbOf(word)) return false;

    const stack: number[] = [x, y];
    while (stack.length) {
        const sy = stack.pop()!;
        let sx = stack.pop()!;
        let at = sy * width + sx;
        if (px[at] !== target) continue;
        // Walk left to the start of the run.
        while (sx > 0 && px[at - 1] === target) {
            sx--;
            at--;
        }
        let spanUp = false;
        let spanDown = false;
        let cx = sx;
        while (cx < width && px[at] === target) {
            px[at] = word;
            if (sy > 0) {
                const up = px[at - width] === target;
                if (up && !spanUp) {
                    stack.push(cx, sy - 1);
                    spanUp = true;
                } else if (!up) spanUp = false;
            }
            if (sy < height - 1) {
                const down = px[at + width] === target;
                if (down && !spanDown) {
                    stack.push(cx, sy + 1);
                    spanDown = true;
                } else if (!down) spanDown = false;
            }
            cx++;
            at++;
        }
        dirty?.add(sx, sy);
        dirty?.add(cx - 1, sy);
    }
    return true;
}

/* -------------------------------------------------------------------- airbrush */

/** Scatter `count` pixels uniformly over a disc of `radius` around (cx, cy). */
export function spray(
    b: Bitmap,
    cx: number,
    cy: number,
    radius: number,
    count: number,
    word: number,
    dirty?: Dirty,
    random: () => number = Math.random,
): void {
    for (let i = 0; i < count; i++) {
        const a = random() * Math.PI * 2;
        const r = radius * Math.sqrt(random());
        setPx(b, Math.round(cx + Math.cos(a) * r), Math.round(cy + Math.sin(a) * r), word, dirty);
    }
}

/* ------------------------------------------------------------- whole-image ops */

/** A copy of region `r` (clipped) as its own bitmap. */
export function crop(b: Bitmap, r: Rect): Bitmap {
    const out = createClearBitmap(r.w, r.h);
    for (let y = 0; y < r.h; y++) {
        const sy = r.y + y;
        if (sy < 0 || sy >= b.height) continue;
        for (let x = 0; x < r.w; x++) {
            const sx = r.x + x;
            if (sx < 0 || sx >= b.width) continue;
            out.px[y * r.w + x] = b.px[sy * b.width + sx];
        }
    }
    return out;
}

export interface BlitOptions {
    /** Pixels of this colour are skipped: XP's transparent selection. */
    transparentRGB?: RGB | null;
    /** Only pixels whose mask byte is non-zero are copied: a free-form selection. */
    mask?: Uint8Array | null;
}

/** Copy `src` onto `dst` with its top-left at (x, y), clipped to `dst`. */
export function blit(dst: Bitmap, src: Bitmap, x: number, y: number, opts: BlitOptions = {}, dirty?: Dirty): void {
    const { transparentRGB = null, mask = null } = opts;
    for (let sy = 0; sy < src.height; sy++) {
        const dy = y + sy;
        if (dy < 0 || dy >= dst.height) continue;
        for (let sx = 0; sx < src.width; sx++) {
            const dx = x + sx;
            if (dx < 0 || dx >= dst.width) continue;
            const at = sy * src.width + sx;
            if (mask && !mask[at]) continue;
            const word = src.px[at];
            if (alphaOf(word) === 0) continue;
            if (transparentRGB !== null && rgbOf(word) === transparentRGB) continue;
            dst.px[dy * dst.width + dx] = word;
            dirty?.add(dx, dy);
        }
    }
}

/** A new picture of `w` x `h` holding `b` at the top-left, the rest painted `bg`. */
export function resizeCanvas(b: Bitmap, w: number, h: number, bg: number): Bitmap {
    const out = createBitmap(w, h);
    out.px.fill(bg);
    blit(out, b, 0, 0);
    return out;
}

export function flipHorizontal(b: Bitmap): Bitmap {
    const out = createClearBitmap(b.width, b.height);
    for (let y = 0; y < b.height; y++) {
        const row = y * b.width;
        for (let x = 0; x < b.width; x++) out.px[row + x] = b.px[row + b.width - 1 - x];
    }
    return out;
}

export function flipVertical(b: Bitmap): Bitmap {
    const out = createClearBitmap(b.width, b.height);
    for (let y = 0; y < b.height; y++) out.px.set(b.px.subarray((b.height - 1 - y) * b.width, (b.height - y) * b.width), y * b.width);
    return out;
}

/** Rotate clockwise by a multiple of 90 degrees. */
export function rotate(b: Bitmap, degrees: 90 | 180 | 270): Bitmap {
    if (degrees === 180) return flipVertical(flipHorizontal(b));
    const out = createClearBitmap(b.height, b.width);
    for (let y = 0; y < b.height; y++) {
        for (let x = 0; x < b.width; x++) {
            const word = b.px[y * b.width + x];
            // 90 clockwise: (x, y) -> (h - 1 - y, x); 270: (x, y) -> (y, w - 1 - x).
            const nx = degrees === 90 ? b.height - 1 - y : y;
            const ny = degrees === 90 ? x : b.width - 1 - x;
            out.px[ny * out.width + nx] = word;
        }
    }
    return out;
}

/** Invert Colors, keeping alpha. */
export function invert(b: Bitmap): void {
    const d = b.data;
    for (let i = 0; i < d.length; i += 4) {
        d[i] = 255 - d[i];
        d[i + 1] = 255 - d[i + 1];
        d[i + 2] = 255 - d[i + 2];
    }
}

/** Nearest-neighbour scale to exactly `w` x `h`. */
export function scale(b: Bitmap, w: number, h: number): Bitmap {
    const out = createClearBitmap(w, h);
    for (let y = 0; y < h; y++) {
        const sy = Math.min(b.height - 1, Math.floor(((y + 0.5) * b.height) / h));
        for (let x = 0; x < w; x++) {
            const sx = Math.min(b.width - 1, Math.floor(((x + 0.5) * b.width) / w));
            out.px[y * w + x] = b.px[sy * b.width + sx];
        }
    }
    return out;
}

/**
 * Image > Stretch/Skew. Stretch by percentages, then shear by angles: a horizontal skew slides
 * each row sideways in proportion to its height, a vertical skew slides each column. The picture
 * grows to hold the result, and uncovered pixels take `bg`, as they did in Paint.
 */
export function stretchSkew(b: Bitmap, stretchX: number, stretchY: number, skewX: number, skewY: number, bg: number): Bitmap {
    let img = b;
    const w = Math.max(1, Math.round((b.width * stretchX) / 100));
    const h = Math.max(1, Math.round((b.height * stretchY) / 100));
    if (w !== b.width || h !== b.height) img = scale(b, w, h);

    if (skewX) {
        const t = Math.tan((skewX * Math.PI) / 180);
        const extra = Math.round(Math.abs(t) * (img.height - 1));
        const out = createBitmap(img.width + extra, img.height);
        out.px.fill(bg);
        for (let y = 0; y < img.height; y++) {
            // Positive angles lean the top to the right, the way Paint's preview showed it.
            const shift = t >= 0 ? Math.round(t * (img.height - 1 - y)) : Math.round(-t * y);
            out.px.set(img.px.subarray(y * img.width, (y + 1) * img.width), y * out.width + shift);
        }
        img = out;
    }
    if (skewY) {
        const t = Math.tan((skewY * Math.PI) / 180);
        const extra = Math.round(Math.abs(t) * (img.width - 1));
        const out = createBitmap(img.width, img.height + extra);
        out.px.fill(bg);
        for (let x = 0; x < img.width; x++) {
            const shift = t >= 0 ? Math.round(t * (img.width - 1 - x)) : Math.round(-t * x);
            for (let y = 0; y < img.height; y++) out.px[(y + shift) * out.width + x] = img.px[y * img.width + x];
        }
        img = out;
    }
    return img;
}

/** Reduce to pure black and white — Attributes > Black and white. */
export function toBlackAndWhite(b: Bitmap): void {
    const d = b.data;
    for (let i = 0; i < d.length; i += 4) {
        const lum = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
        const v = lum >= 128 ? 255 : 0;
        d[i] = d[i + 1] = d[i + 2] = v;
    }
}

/* ---------------------------------------------------------- region patches */

/** The raw bytes of region `r` — what the undo history stores instead of whole pictures. */
export function readRegion(b: Bitmap, r: Rect): Bytes {
    const out = new Uint8ClampedArray(r.w * r.h * 4);
    for (let y = 0; y < r.h; y++) {
        const from = ((r.y + y) * b.width + r.x) * 4;
        out.set(b.data.subarray(from, from + r.w * 4), y * r.w * 4);
    }
    return out;
}

export function writeRegion(b: Bitmap, r: Rect, bytes: Bytes): void {
    for (let y = 0; y < r.h; y++) {
        const to = ((r.y + y) * b.width + r.x) * 4;
        b.data.set(bytes.subarray(y * r.w * 4, (y + 1) * r.w * 4), to);
    }
}

/* ----------------------------------------------------------- constraints */

/** Shift-drag for lines: snap to horizontal, vertical or 45 degrees. */
export function snapLine(x0: number, y0: number, x1: number, y1: number): [number, number] {
    const dx = x1 - x0;
    const dy = y1 - y0;
    const ax = Math.abs(dx);
    const ay = Math.abs(dy);
    if (ax > 2 * ay) return [x1, y0];
    if (ay > 2 * ax) return [x0, y1];
    const d = Math.max(ax, ay);
    return [x0 + Math.sign(dx || 1) * d, y0 + Math.sign(dy || 1) * d];
}

/** Shift-drag for shapes: a square or circle, following the axis the pointer moved further on. */
export function snapSquare(x0: number, y0: number, x1: number, y1: number): [number, number] {
    const dx = x1 - x0;
    const dy = y1 - y0;
    const d = Math.max(Math.abs(dx), Math.abs(dy));
    return [x0 + Math.sign(dx || 1) * d, y0 + Math.sign(dy || 1) * d];
}
