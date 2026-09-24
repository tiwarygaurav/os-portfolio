/**
 * The Paint document and its tools: the picture, the preview layer over it, the selection, the
 * text box and undo — everything that is not a React concern.
 *
 * A class rather than component state because drawing is a stream of pixel writes at pointer
 * rate; routing each one through React would re-render the window on every mouse move. React
 * subscribes to two small snapshots instead: `getState()` for what the window shows (tool,
 * colours, selection, zoom, undo availability) and `getPointer()` for the status bar's
 * coordinates, so moving the mouse re-renders the status bar and nothing else.
 *
 * Browser-only (text is rasterised through a canvas), but every pixel algorithm it calls lives in
 * `raster.ts`, which is pure.
 */

import {
    Dirty,
    blit,
    bezierPoints,
    boxOf,
    clipRect,
    cloneBitmap,
    createBitmap,
    createClearBitmap,
    crop,
    drawShape,
    eachLinePoint,
    fillAll,
    fillPolygon,
    fillRect,
    flipHorizontal,
    flipVertical,
    floodFill,
    getRGB,
    invert,
    pixelOf,
    polygonRuns,
    readRegion,
    resizeCanvas,
    rotate,
    roundPen,
    setPx,
    slashPen,
    snapLine,
    snapSquare,
    spray,
    squarePen,
    stretchSkew,
    strokeLine,
    strokeLineReplace,
    strokePolyline,
    toBlackAndWhite,
    wrapBitmap,
    writeRegion,
    type Bitmap,
    type FillStyle,
    type Pen,
    type Rect,
    type RGB,
    type ShapeKind,
} from './raster';
import { History, type HistoryEntry } from './history';
import { AIRBRUSH_SIZES, BRUSHES, ERASER_SIZES, LINE_WIDTHS, type ToolId } from './tools';
import { DEFAULT_PALETTE } from './palette';

/* ------------------------------------------------------------------ types */

/** Left button draws in the foreground colour, right in the background colour. */
export type Button = 'primary' | 'secondary';

export interface Mods {
    shift: boolean;
    ctrl: boolean;
}

export interface FontSettings {
    family: string;
    size: number;
    bold: boolean;
    italic: boolean;
    underline: boolean;
}

export const FONT_FAMILIES = [
    'Arial',
    'Comic Sans MS',
    'Courier New',
    'Georgia',
    'Impact',
    'Tahoma',
    'Times New Roman',
    'Trebuchet MS',
    'Verdana',
] as const;

export const FONT_SIZES = [8, 9, 10, 11, 12, 14, 16, 18, 20, 22, 24, 26, 28, 36, 48, 72] as const;

/** Line height of the text tool, as a multiple of the font size. The overlay textarea uses it too. */
export const TEXT_LINE_HEIGHT = 1.25;
/** Inner padding of the text box, in pixels. The overlay textarea uses it too. */
export const TEXT_PADDING = 2;

export const cssFont = (f: FontSettings) =>
    `${f.italic ? 'italic ' : ''}${f.bold ? 'bold ' : ''}${f.size}px "${f.family}", sans-serif`;

export interface SelectionView {
    x: number;
    y: number;
    w: number;
    h: number;
    /** True once the pixels have been lifted — moved, pasted or transformed. */
    floating: boolean;
}

export interface TextView {
    x: number;
    y: number;
    w: number;
    h: number;
    value: string;
    /** True while the box is still being dragged out. */
    sizing: boolean;
}

export interface PaintState {
    width: number;
    height: number;
    tool: ToolId;
    fg: RGB;
    bg: RGB;
    palette: RGB[];
    lineWidth: number;
    /** Index into `BRUSHES`. */
    brush: number;
    /** Index into `ERASER_SIZES`. */
    eraser: number;
    /** Index into `AIRBRUSH_SIZES`. */
    airbrush: number;
    fillStyle: FillStyle;
    /** Image > Draw Opaque: whether selections and text carry the background colour with them. */
    opaque: boolean;
    /** The magnifier's chosen level. */
    magnification: number;
    zoom: number;
    selection: SelectionView | null;
    text: TextView | null;
    font: FontSettings;
    canUndo: boolean;
    canRedo: boolean;
    /** Changed since the last New, Open or Save. */
    modified: boolean;
    /** A drag, curve or polygon is in progress: Escape would cancel it. */
    busy: boolean;
}

export interface PointerView {
    /** Picture coordinates under the pointer; null when it is off the picture. */
    at: { x: number; y: number } | null;
    /** The size being dragged out, for the status bar. */
    extent: { w: number; h: number } | null;
}

interface Selection {
    x: number;
    y: number;
    w: number;
    h: number;
    /** Free-form selections: which pixels of the w x h box belong to it. */
    mask: Uint8Array | null;
    /** The lifted pixels (transparent outside a free-form mask), or null until first moved. */
    content: Bitmap | null;
}

type Gesture =
    | { kind: 'stroke'; tool: 'pencil' | 'brush' | 'eraser'; button: Button; lastX: number; lastY: number; startX: number; startY: number; straight: boolean }
    | { kind: 'spray'; button: Button; x: number; y: number }
    | { kind: 'line'; button: Button; x0: number; y0: number; x1: number; y1: number }
    | { kind: 'shape'; shape: ShapeKind; button: Button; x0: number; y0: number; x1: number; y1: number }
    | { kind: 'curve' }
    | { kind: 'polygon' }
    | { kind: 'marquee'; x0: number; y0: number; x1: number; y1: number }
    | { kind: 'lasso'; points: number[] }
    | { kind: 'move'; grabX: number; grabY: number; copy: boolean; smear: boolean; moved: boolean }
    | { kind: 'textbox'; x0: number; y0: number; x1: number; y1: number };

interface Curve {
    button: Button;
    /** Drag the line, then bend it twice — Paint's three-step curve. */
    stage: 'line' | 'await1' | 'bend1' | 'await2' | 'bend2';
    /** p0, p1, p2, p3 as x/y pairs. */
    p: number[];
}

interface Polygon {
    button: Button;
    points: number[];
    curX: number;
    curY: number;
}

/* ------------------------------------------------------------------- pens */

const PIXEL: Pen = roundPen(1);
const WIDTH_PENS: Pen[] = LINE_WIDTHS.map((w) => (w === 1 ? PIXEL : roundPen(w)));
const BRUSH_PENS: Pen[] = BRUSHES.map((b) =>
    b.shape === 'round' ? roundPen(b.size) : b.shape === 'square' ? squarePen(b.size) : slashPen(b.size, b.shape === 'forward' ? 'forward' : 'back'),
);
const ERASER_PENS: Pen[] = ERASER_SIZES.map((s) => squarePen(s));

/** Airbrush timer interval: slow strokes come out dense, fast ones sparse, as XP's did. */
const SPRAY_MS = 40;

/* ------------------------------------------------------------ text layout */

/** Break text into lines that fit `width`, the way the text box's textarea wraps it. */
export function wrapText(measure: (s: string) => number, text: string, width: number): string[] {
    const out: string[] = [];
    for (const paragraph of text.split('\n')) {
        if (paragraph === '') {
            out.push('');
            continue;
        }
        let line = '';
        for (const word of paragraph.split(/(\s+)/)) {
            if (word === '') continue;
            const next = line + word;
            if (measure(next) <= width || line === '') {
                // A single word wider than the box is broken by characters.
                if (line === '' && measure(word) > width && !/^\s+$/.test(word)) {
                    let chunk = '';
                    for (const ch of word) {
                        if (chunk && measure(chunk + ch) > width) {
                            out.push(chunk);
                            chunk = '';
                        }
                        chunk += ch;
                    }
                    line = chunk;
                } else {
                    line = next;
                }
            } else {
                out.push(line.replace(/\s+$/, ''));
                line = /^\s+$/.test(word) ? '' : word;
            }
        }
        out.push(line.replace(/\s+$/, ''));
    }
    return out;
}

/* ------------------------------------------------------------------ engine */

export class PaintEngine {
    private doc: Bitmap;
    private overlay: Bitmap;
    private mainImage: ImageData;
    private overlayImage: ImageData;
    private mainCanvas: HTMLCanvasElement | null = null;
    private overlayCanvas: HTMLCanvasElement | null = null;
    private mainCtx: CanvasRenderingContext2D | null = null;
    private overlayCtx: CanvasRenderingContext2D | null = null;

    private history = new History();
    /** The picture as it was when the current operation began; null between operations. */
    private snap: Bitmap | null = null;
    private opDirty = new Dirty();
    private pendingMain = new Dirty();
    private pendingOverlay = new Dirty();
    /** What the overlay currently shows, so it can be wiped before the next preview. */
    private overlayRect: Rect | null = null;
    private raf = 0;
    private sprayTimer: ReturnType<typeof setInterval> | null = null;

    private gesture: Gesture | null = null;
    private curve: Curve | null = null;
    private polygon: Polygon | null = null;
    private sel: Selection | null = null;
    private text: TextView | null = null;
    /** The tool to return to after Pick Color or the Magnifier, as XP did. */
    private returnTool: ToolId = 'pencil';
    /** Paint's own clipboard, which works whether or not the system clipboard lets us in. */
    clipboard: Bitmap | null = null;

    private state: PaintState;
    private pointer: PointerView = { at: null, extent: null };
    private listeners = new Set<() => void>();

    constructor(width: number, height: number) {
        this.doc = createBitmap(width, height, 0xffffff);
        this.overlay = createClearBitmap(width, height);
        this.mainImage = new ImageData(this.doc.data, width, height);
        this.overlayImage = new ImageData(this.overlay.data, width, height);
        this.state = {
            width,
            height,
            tool: 'pencil',
            fg: 0x000000,
            bg: 0xffffff,
            palette: [...DEFAULT_PALETTE],
            lineWidth: 1,
            brush: 1,
            eraser: 1,
            airbrush: 0,
            fillStyle: 'outline',
            opaque: true,
            magnification: 4,
            zoom: 1,
            selection: null,
            text: null,
            font: { family: 'Arial', size: 12, bold: false, italic: false, underline: false },
            canUndo: false,
            canRedo: false,
            modified: false,
            busy: false,
        };
    }

    /* ------------------------------------------------------------ store */

    subscribe = (fn: () => void): (() => void) => {
        this.listeners.add(fn);
        return () => {
            this.listeners.delete(fn);
        };
    };

    getState = (): PaintState => this.state;
    getPointer = (): PointerView => this.pointer;

    private notify() {
        this.listeners.forEach((fn) => fn());
    }

    private set(patch: Partial<PaintState>) {
        this.state = { ...this.state, ...patch };
        this.notify();
    }

    private setPointerAt(x: number, y: number) {
        const inside = x >= 0 && y >= 0 && x < this.doc.width && y < this.doc.height;
        const cur = this.pointer.at;
        if (inside ? cur && cur.x === x && cur.y === y : cur === null) return;
        this.pointer = { ...this.pointer, at: inside ? { x, y } : null };
        this.notify();
    }

    private setExtent(extent: PointerView['extent']) {
        const cur = this.pointer.extent;
        if (extent === cur || (extent && cur && extent.w === cur.w && extent.h === cur.h)) return;
        this.pointer = { ...this.pointer, extent };
        this.notify();
    }

    private syncBusy() {
        const busy = !!(this.gesture || this.curve || this.polygon);
        if (busy !== this.state.busy) this.set({ busy });
    }

    private emitSelection() {
        const s = this.sel;
        this.set({ selection: s ? { x: s.x, y: s.y, w: s.w, h: s.h, floating: !!s.content } : null });
    }

    private emitText() {
        this.set({ text: this.text ? { ...this.text } : null });
    }

    /* ------------------------------------------------------------ canvases */

    attach(main: HTMLCanvasElement, overlay: HTMLCanvasElement) {
        this.mainCanvas = main;
        this.overlayCanvas = overlay;
        this.mainCtx = main.getContext('2d');
        this.overlayCtx = overlay.getContext('2d');
        this.sizeCanvases();
        this.repaintAll();
    }

    detach() {
        if (this.raf) cancelAnimationFrame(this.raf);
        this.raf = 0;
        this.stopSpray();
        this.mainCanvas = this.overlayCanvas = null;
        this.mainCtx = this.overlayCtx = null;
    }

    private sizeCanvases() {
        for (const c of [this.mainCanvas, this.overlayCanvas]) {
            if (!c) continue;
            if (c.width !== this.doc.width) c.width = this.doc.width;
            if (c.height !== this.doc.height) c.height = this.doc.height;
        }
    }

    private repaintAll() {
        const all = { x: 0, y: 0, w: this.doc.width, h: this.doc.height };
        this.pendingMain.addRect(all);
        this.pendingOverlay.addRect(all);
        this.flush();
    }

    private schedule() {
        if (this.raf || typeof requestAnimationFrame === 'undefined') return;
        this.raf = requestAnimationFrame(() => this.flush());
    }

    /** Copy the changed regions of both layers to their canvases. */
    private flush() {
        this.raf = 0;
        const { width, height } = this.doc;
        const m = this.pendingMain.rect(width, height);
        if (m && this.mainCtx) this.mainCtx.putImageData(this.mainImage, 0, 0, m.x, m.y, m.w, m.h);
        const o = this.pendingOverlay.rect(width, height);
        if (o && this.overlayCtx) this.overlayCtx.putImageData(this.overlayImage, 0, 0, o.x, o.y, o.w, o.h);
        if (this.mainCtx) this.pendingMain.reset();
        if (this.overlayCtx) this.pendingOverlay.reset();
    }

    /** Draw on the picture: records the region for undo and for repainting. */
    private drawDoc(fn: (d: Dirty) => void) {
        const d = new Dirty();
        fn(d);
        const r = d.rect(this.doc.width, this.doc.height);
        if (!r) return;
        this.opDirty.addRect(r);
        this.pendingMain.addRect(r);
        this.schedule();
    }

    /** Replace whatever the preview layer shows with a new preview. */
    private drawOverlay(fn: (d: Dirty) => void) {
        this.clearOverlay();
        const d = new Dirty();
        fn(d);
        const r = d.rect(this.overlay.width, this.overlay.height);
        this.overlayRect = r;
        if (r) this.pendingOverlay.addRect(r);
        this.schedule();
    }

    /** Add to the preview without wiping it — the free-form selection's trail. */
    private appendOverlay(fn: (d: Dirty) => void) {
        const d = new Dirty();
        fn(d);
        const r = d.rect(this.overlay.width, this.overlay.height);
        if (!r) return;
        this.overlayRect = this.overlayRect ? unionOf(this.overlayRect, r) : r;
        this.pendingOverlay.addRect(r);
        this.schedule();
    }

    private clearOverlay() {
        if (!this.overlayRect) return;
        fillRect(this.overlay, this.overlayRect, 0);
        this.pendingOverlay.addRect(this.overlayRect);
        this.overlayRect = null;
        this.schedule();
    }

    private installDoc(b: Bitmap) {
        this.doc = b;
        this.overlay = createClearBitmap(b.width, b.height);
        this.overlayRect = null;
        this.mainImage = new ImageData(this.doc.data, b.width, b.height);
        this.overlayImage = new ImageData(this.overlay.data, b.width, b.height);
        this.sizeCanvases();
        this.pendingMain.reset();
        this.pendingOverlay.reset();
        this.repaintAll();
        if (this.state.width !== b.width || this.state.height !== b.height) this.set({ width: b.width, height: b.height });
    }

    /* ---------------------------------------------------------- operations */

    private beginOp() {
        if (this.snap) return;
        this.snap = cloneBitmap(this.doc);
        this.opDirty.reset();
    }

    /** Close the current operation as one undo step covering everything it changed. */
    private endOp() {
        const snap = this.snap;
        this.snap = null;
        if (!snap) return;
        const r = this.opDirty.rect(this.doc.width, this.doc.height);
        this.opDirty.reset();
        if (!r) return;
        this.pushHistory({ kind: 'patch', rect: r, before: readRegion(snap, r), after: readRegion(this.doc, r) });
    }

    /** Put back what the current operation drew, keeping it open. */
    private restoreOp() {
        if (!this.snap) return;
        const r = this.opDirty.rect(this.doc.width, this.doc.height);
        if (!r) return;
        writeRegion(this.doc, r, readRegion(this.snap, r));
        this.pendingMain.addRect(r);
        this.schedule();
    }

    private abortOp() {
        this.restoreOp();
        this.snap = null;
        this.opDirty.reset();
    }

    private pushHistory(entry: HistoryEntry) {
        this.history.push(entry);
        this.set({ canUndo: true, canRedo: false, modified: true });
    }

    /** A change of size (or of everything): recorded as a swap of whole pictures. */
    private swapDoc(next: Bitmap) {
        this.pushHistory({ kind: 'swap', before: this.doc, after: next });
        this.installDoc(next);
    }

    private colors(button: Button): [RGB, RGB] {
        return button === 'primary' ? [this.state.fg, this.state.bg] : [this.state.bg, this.state.fg];
    }

    private clampToPicture(x: number, y: number): [number, number] {
        return [Math.max(0, Math.min(this.doc.width - 1, x)), Math.max(0, Math.min(this.doc.height - 1, y))];
    }

    /** Finish everything in progress: the one call every menu command makes first. */
    commitAll() {
        if (this.gesture) this.cancelGesture();
        this.commitCurve();
        this.commitPolygon();
        this.commitText();
        this.commitSelection();
    }

    /* ------------------------------------------------------------- settings */

    setTool(tool: ToolId) {
        if (tool === this.state.tool) return;
        if (this.gesture) this.cancelGesture();
        this.commitCurve();
        this.commitPolygon();
        this.commitText();
        this.commitSelection();
        if (tool === 'pick' || tool === 'magnifier') {
            if (this.state.tool !== 'pick' && this.state.tool !== 'magnifier') this.returnTool = this.state.tool;
        }
        this.set({ tool });
    }

    /** After Pick Color or the Magnifier has done its job, go back to the tool before it. */
    returnToPreviousTool() {
        this.set({ tool: this.returnTool });
    }

    setColor(which: Button, rgb: RGB) {
        this.set(which === 'primary' ? { fg: rgb } : { bg: rgb });
        if (this.sel?.content && !this.state.opaque) this.renderFloating();
    }

    setPaletteColor(index: number, rgb: RGB) {
        const palette = [...this.state.palette];
        palette[index] = rgb;
        this.set({ palette });
    }

    setLineWidth(lineWidth: number) {
        this.set({ lineWidth });
    }
    setBrush(brush: number) {
        this.set({ brush });
    }
    setEraser(eraser: number) {
        this.set({ eraser });
    }
    setAirbrush(airbrush: number) {
        this.set({ airbrush });
    }
    setFillStyle(fillStyle: FillStyle) {
        this.set({ fillStyle });
    }
    setMagnification(magnification: number) {
        this.set({ magnification });
    }
    setZoom(zoom: number) {
        if (zoom !== this.state.zoom) this.set({ zoom });
    }
    setOpaque(opaque: boolean) {
        this.set({ opaque });
        if (this.sel?.content) this.renderFloating();
    }
    setFont(patch: Partial<FontSettings>) {
        this.set({ font: { ...this.state.font, ...patch } });
    }

    /* -------------------------------------------------------------- pointer */

    hover(x: number, y: number) {
        this.setPointerAt(x, y);
    }

    leave() {
        if (this.pointer.at) {
            this.pointer = { ...this.pointer, at: null };
            this.notify();
        }
    }

    down(x: number, y: number, button: Button, mods: Mods) {
        this.setPointerAt(x, y);
        if (this.gesture) {
            // Pressing the other button mid-drag cancels the drag, as in Paint.
            this.cancelGesture();
            return;
        }
        const tool = this.state.tool;
        if (tool !== 'select' && tool !== 'free-select') this.commitSelection();
        if (tool !== 'text') this.commitText();
        if (tool !== 'curve') this.commitCurve();
        if (tool !== 'polygon') this.commitPolygon();
        const [c1] = this.colors(button);

        switch (tool) {
            case 'pencil':
            case 'brush':
            case 'eraser':
                this.beginOp();
                this.gesture = { kind: 'stroke', tool, button, lastX: x, lastY: y, startX: x, startY: y, straight: mods.shift && tool !== 'eraser' };
                this.strokeTo(x, y);
                break;
            case 'airbrush':
                this.beginOp();
                this.gesture = { kind: 'spray', button, x, y };
                this.sprayOnce();
                this.sprayTimer = setInterval(() => this.sprayOnce(), SPRAY_MS);
                break;
            case 'fill':
                this.beginOp();
                this.drawDoc((d) => floodFill(this.doc, x, y, pixelOf(c1), d));
                this.endOp();
                break;
            case 'pick': {
                const c = getRGB(this.doc, x, y);
                if (c !== null) this.setColor(button, c);
                this.returnToPreviousTool();
                break;
            }
            case 'magnifier':
                // The window owns scrolling, so it handles the magnifier itself.
                break;
            case 'line':
                this.gesture = { kind: 'line', button, x0: x, y0: y, x1: x, y1: y };
                this.previewLine();
                break;
            case 'rectangle':
            case 'ellipse':
            case 'rounded-rect':
                this.gesture = { kind: 'shape', shape: tool, button, x0: x, y0: y, x1: x, y1: y };
                this.previewShape();
                break;
            case 'curve':
                this.curveDown(x, y, button);
                break;
            case 'polygon':
                this.polygonDown(x, y, button);
                break;
            case 'select':
            case 'free-select':
                this.selectDown(x, y, mods);
                break;
            case 'text':
                this.textDown(x, y);
                break;
        }
        this.syncBusy();
    }

    move(x: number, y: number, mods: Mods) {
        this.setPointerAt(x, y);
        const g = this.gesture;
        if (!g) return;
        switch (g.kind) {
            case 'stroke':
                this.strokeTo(x, y);
                break;
            case 'spray':
                g.x = x;
                g.y = y;
                break;
            case 'line':
                [g.x1, g.y1] = mods.shift ? snapLine(g.x0, g.y0, x, y) : [x, y];
                this.previewLine();
                break;
            case 'shape':
                [g.x1, g.y1] = mods.shift ? snapSquare(g.x0, g.y0, x, y) : [x, y];
                this.previewShape();
                break;
            case 'curve':
                this.curveMove(x, y, mods);
                break;
            case 'polygon':
                this.polygonMove(x, y, mods);
                break;
            case 'marquee':
                [g.x1, g.y1] = this.clampToPicture(x, y);
                this.showMarquee(g);
                break;
            case 'lasso':
                this.lassoTo(g, x, y);
                break;
            case 'move':
                this.moveSelection(g, x, y);
                break;
            case 'textbox':
                [g.x1, g.y1] = this.clampToPicture(x, y);
                this.text = { ...boxRect(g.x0, g.y0, g.x1, g.y1), value: '', sizing: true };
                this.setExtent({ w: this.text.w, h: this.text.h });
                this.emitText();
                break;
        }
    }

    up(x: number, y: number, mods: Mods) {
        const g = this.gesture;
        if (!g) return;
        this.move(x, y, mods);
        this.gesture = null;
        switch (g.kind) {
            case 'stroke':
                this.endOp();
                break;
            case 'spray':
                this.stopSpray();
                this.endOp();
                break;
            case 'line': {
                this.clearOverlay();
                this.beginOp();
                const [c1] = this.colors(g.button);
                this.drawDoc((d) => strokeLine(this.doc, g.x0, g.y0, g.x1, g.y1, WIDTH_PENS[this.state.lineWidth - 1], pixelOf(c1), d));
                this.endOp();
                break;
            }
            case 'shape':
                this.clearOverlay();
                this.beginOp();
                this.drawDoc((d) => this.shapeInto(this.doc, g, d));
                this.endOp();
                break;
            case 'curve':
                this.curveUp();
                break;
            case 'polygon':
                this.polygonUp();
                break;
            case 'marquee': {
                const r = boxRectExclusive(g.x0, g.y0, g.x1, g.y1);
                this.sel = r.w > 0 && r.h > 0 ? { ...r, mask: null, content: null } : null;
                this.emitSelection();
                break;
            }
            case 'lasso':
                this.finishLasso(g.points);
                break;
            case 'move':
                break;
            case 'textbox':
                this.finishTextBox(g);
                break;
        }
        this.setExtent(null);
        this.syncBusy();
    }

    doubleClick() {
        if (this.polygon) {
            this.commitPolygon();
            this.syncBusy();
        }
    }

    /** Escape: abandon whatever is half-done. Typed text is kept, never thrown away. */
    cancel() {
        if (this.gesture) {
            this.cancelGesture();
            return;
        }
        if (this.curve || this.polygon) {
            this.curve = null;
            this.polygon = null;
            this.clearOverlay();
            this.syncBusy();
            return;
        }
        if (this.text) {
            this.commitText();
            return;
        }
        this.commitSelection();
    }

    /**
     * The other mouse button was pressed mid-drag: in Paint that cancels the drag. Browsers report
     * that second press as a pointer move rather than a pointer down, so the window calls this.
     */
    abortDrag() {
        if (this.gesture) this.cancelGesture();
    }

    get dragging(): boolean {
        return this.gesture !== null;
    }

    private cancelGesture() {
        const g = this.gesture;
        if (!g) return;
        this.gesture = null;
        switch (g.kind) {
            case 'stroke':
                this.abortOp();
                break;
            case 'spray':
                this.stopSpray();
                this.abortOp();
                break;
            case 'line':
            case 'shape':
            case 'lasso':
                this.clearOverlay();
                break;
            case 'curve':
                this.curve = null;
                this.clearOverlay();
                break;
            case 'polygon':
                this.polygon = null;
                this.clearOverlay();
                break;
            case 'marquee':
                this.sel = null;
                this.emitSelection();
                break;
            case 'textbox':
                this.text = null;
                this.emitText();
                break;
            case 'move':
                break;
        }
        this.setExtent(null);
        this.syncBusy();
    }

    /* ---------------------------------------------------- freehand tools */

    private strokeTo(x: number, y: number) {
        const g = this.gesture;
        if (!g || g.kind !== 'stroke') return;
        const { fg, bg } = this.state;
        if (g.tool === 'eraser') {
            const pen = ERASER_PENS[this.state.eraser];
            this.drawDoc((d) =>
                g.button === 'primary'
                    ? strokeLine(this.doc, g.lastX, g.lastY, x, y, pen, pixelOf(bg), d)
                    : // The right button makes it the Color Eraser: foreground becomes background.
                      strokeLineReplace(this.doc, g.lastX, g.lastY, x, y, pen, pixelOf(fg), pixelOf(bg), d),
            );
        } else {
            const pen = g.tool === 'pencil' ? PIXEL : BRUSH_PENS[this.state.brush];
            const [c1] = this.colors(g.button);
            if (g.straight) {
                // Shift: a straight line from where the stroke began, redrawn as the pointer moves.
                this.restoreOp();
                const [ex, ey] = snapLine(g.startX, g.startY, x, y);
                this.drawDoc((d) => strokeLine(this.doc, g.startX, g.startY, ex, ey, pen, pixelOf(c1), d));
            } else {
                this.drawDoc((d) => strokeLine(this.doc, g.lastX, g.lastY, x, y, pen, pixelOf(c1), d));
            }
        }
        g.lastX = x;
        g.lastY = y;
    }

    private sprayOnce() {
        const g = this.gesture;
        if (!g || g.kind !== 'spray') return;
        const { radius, dots } = AIRBRUSH_SIZES[this.state.airbrush];
        const [c1] = this.colors(g.button);
        this.drawDoc((d) => spray(this.doc, g.x, g.y, radius, dots, pixelOf(c1), d));
    }

    private stopSpray() {
        if (this.sprayTimer) clearInterval(this.sprayTimer);
        this.sprayTimer = null;
    }

    /* ------------------------------------------------------ line & shapes */

    private previewLine() {
        const g = this.gesture;
        if (!g || g.kind !== 'line') return;
        const [c1] = this.colors(g.button);
        this.drawOverlay((d) => strokeLine(this.overlay, g.x0, g.y0, g.x1, g.y1, WIDTH_PENS[this.state.lineWidth - 1], pixelOf(c1), d));
        this.setExtent({ w: Math.abs(g.x1 - g.x0), h: Math.abs(g.y1 - g.y0) });
    }

    private shapeInto(target: Bitmap, g: Extract<Gesture, { kind: 'shape' }>, d: Dirty) {
        const [c1, c2] = this.colors(g.button);
        const style = this.state.fillStyle;
        // Borderless fills take the colour of the button used; a bordered fill takes the other one.
        drawShape(target, g.shape, boxOf(g.x0, g.y0, g.x1, g.y1), this.state.lineWidth, style, pixelOf(c1), pixelOf(style === 'fill' ? c1 : c2), d);
    }

    private previewShape() {
        const g = this.gesture;
        if (!g || g.kind !== 'shape') return;
        this.drawOverlay((d) => this.shapeInto(this.overlay, g, d));
        this.setExtent({ w: Math.abs(g.x1 - g.x0) + 1, h: Math.abs(g.y1 - g.y0) + 1 });
    }

    /* --------------------------------------------------------------- curve */

    private curveDown(x: number, y: number, button: Button) {
        const c = this.curve;
        if (!c) {
            this.curve = { button, stage: 'line', p: [x, y, x, y, x, y, x, y] };
        } else if (c.stage === 'await1') {
            c.stage = 'bend1';
            c.p[2] = c.p[4] = x;
            c.p[3] = c.p[5] = y;
        } else if (c.stage === 'await2') {
            c.stage = 'bend2';
            c.p[4] = x;
            c.p[5] = y;
        }
        this.gesture = { kind: 'curve' };
        this.previewCurve();
    }

    private curveMove(x: number, y: number, mods: Mods) {
        const c = this.curve;
        if (!c) return;
        if (c.stage === 'line') {
            const [ex, ey] = mods.shift ? snapLine(c.p[0], c.p[1], x, y) : [x, y];
            // While it is still a line, the control points sit on its ends.
            c.p = [c.p[0], c.p[1], c.p[0], c.p[1], ex, ey, ex, ey];
        } else if (c.stage === 'bend1') {
            c.p[2] = c.p[4] = x;
            c.p[3] = c.p[5] = y;
        } else if (c.stage === 'bend2') {
            c.p[4] = x;
            c.p[5] = y;
        }
        this.previewCurve();
    }

    private curveUp() {
        const c = this.curve;
        if (!c) return;
        if (c.stage === 'line') c.stage = 'await1';
        else if (c.stage === 'bend1') c.stage = 'await2';
        else if (c.stage === 'bend2') this.commitCurve();
    }

    private curvePoints(c: Curve): number[] {
        const [x0, y0, x1, y1, x2, y2, x3, y3] = c.p;
        return bezierPoints(x0, y0, x1, y1, x2, y2, x3, y3);
    }

    private previewCurve() {
        const c = this.curve;
        if (!c) return;
        const [c1] = this.colors(c.button);
        this.drawOverlay((d) => strokePolyline(this.overlay, this.curvePoints(c), WIDTH_PENS[this.state.lineWidth - 1], pixelOf(c1), false, d));
    }

    /** Draw the curve as it stands — switching tools mid-curve keeps it, as Paint did. */
    private commitCurve() {
        const c = this.curve;
        if (!c) return;
        this.curve = null;
        if (this.gesture?.kind === 'curve') this.gesture = null;
        this.clearOverlay();
        const [c1] = this.colors(c.button);
        this.beginOp();
        this.drawDoc((d) => strokePolyline(this.doc, this.curvePoints(c), WIDTH_PENS[this.state.lineWidth - 1], pixelOf(c1), false, d));
        this.endOp();
        this.syncBusy();
    }

    /* -------------------------------------------------------------- polygon */

    private polygonDown(x: number, y: number, button: Button) {
        if (!this.polygon) this.polygon = { button, points: [x, y], curX: x, curY: y };
        else {
            this.polygon.curX = x;
            this.polygon.curY = y;
        }
        this.gesture = { kind: 'polygon' };
        this.previewPolygon();
    }

    private polygonMove(x: number, y: number, mods: Mods) {
        const p = this.polygon;
        if (!p) return;
        const n = p.points.length;
        [p.curX, p.curY] = mods.shift ? snapLine(p.points[n - 2], p.points[n - 1], x, y) : [x, y];
        this.previewPolygon();
    }

    private polygonUp() {
        const p = this.polygon;
        if (!p) return;
        const n = p.points.length;
        if (p.curX !== p.points[n - 2] || p.curY !== p.points[n - 1]) p.points.push(p.curX, p.curY);
        // Coming back to the first point closes the shape.
        const closes = p.points.length >= 8 && Math.abs(p.curX - p.points[0]) <= 2 && Math.abs(p.curY - p.points[1]) <= 2;
        if (closes) {
            p.points.splice(-2, 2);
            this.commitPolygon();
            return;
        }
        this.previewPolygon();
    }

    private previewPolygon() {
        const p = this.polygon;
        if (!p) return;
        const [c1] = this.colors(p.button);
        this.drawOverlay((d) => strokePolyline(this.overlay, [...p.points, p.curX, p.curY], WIDTH_PENS[this.state.lineWidth - 1], pixelOf(c1), false, d));
    }

    private commitPolygon() {
        const p = this.polygon;
        if (!p) return;
        this.polygon = null;
        if (this.gesture?.kind === 'polygon') this.gesture = null;
        this.clearOverlay();
        const pts = p.points;
        const [c1, c2] = this.colors(p.button);
        const style = this.state.fillStyle;
        const closed = pts.length >= 6;
        this.beginOp();
        this.drawDoc((d) => {
            if (closed && style !== 'outline') fillPolygon(this.doc, pts, pixelOf(style === 'fill' ? c1 : c2), d);
            if (style !== 'fill' || !closed) strokePolyline(this.doc, pts, WIDTH_PENS[this.state.lineWidth - 1], pixelOf(c1), closed, d);
        });
        this.endOp();
        this.syncBusy();
    }

    /* ------------------------------------------------------------ selection */

    private hitSelection(x: number, y: number): boolean {
        const s = this.sel;
        return !!s && x >= s.x && y >= s.y && x < s.x + s.w && y < s.y + s.h;
    }

    private selectDown(x: number, y: number, mods: Mods) {
        const s = this.sel;
        if (s && this.hitSelection(x, y)) {
            this.gesture = { kind: 'move', grabX: x - s.x, grabY: y - s.y, copy: mods.ctrl, smear: mods.shift, moved: false };
            return;
        }
        this.commitSelection();
        const [cx, cy] = this.clampToPicture(x, y);
        if (this.state.tool === 'free-select') {
            this.gesture = { kind: 'lasso', points: [cx, cy] };
        } else {
            this.gesture = { kind: 'marquee', x0: cx, y0: cy, x1: cx, y1: cy };
            this.showMarquee(this.gesture);
        }
    }

    private showMarquee(g: Extract<Gesture, { kind: 'marquee' }>) {
        const r = boxRectExclusive(g.x0, g.y0, g.x1, g.y1);
        this.set({ selection: { ...r, floating: false } });
        this.setExtent({ w: r.w, h: r.h });
    }

    private lassoTo(g: Extract<Gesture, { kind: 'lasso' }>, x: number, y: number) {
        const [cx, cy] = this.clampToPicture(x, y);
        const n = g.points.length;
        const lx = g.points[n - 2];
        const ly = g.points[n - 1];
        if (cx === lx && cy === ly) return;
        g.points.push(cx, cy);
        this.appendOverlay((d) => strokeLine(this.overlay, lx, ly, cx, cy, PIXEL, pixelOf(0x000000), d));
    }

    private finishLasso(points: number[]) {
        this.clearOverlay();
        if (points.length < 6) return;
        let minX = Infinity;
        let minY = Infinity;
        let maxX = -Infinity;
        let maxY = -Infinity;
        for (let i = 0; i < points.length; i += 2) {
            minX = Math.min(minX, points[i]);
            maxX = Math.max(maxX, points[i]);
            minY = Math.min(minY, points[i + 1]);
            maxY = Math.max(maxY, points[i + 1]);
        }
        const w = maxX - minX + 1;
        const h = maxY - minY + 1;
        if (w < 2 || h < 2) return;
        const mask = new Uint8Array(w * h);
        const mark = (x: number, y: number) => {
            if (x >= minX && x <= maxX && y >= minY && y <= maxY) mask[(y - minY) * w + (x - minX)] = 1;
        };
        polygonRuns(points, (y, x0, x1) => {
            for (let x = x0; x <= x1; x++) mark(x, y);
        });
        // The traced outline itself belongs to the selection, not just what it encloses.
        for (let i = 0; i < points.length; i += 2) {
            const j = (i + 2) % points.length;
            eachLinePoint(points[i], points[i + 1], points[j], points[j + 1], mark);
        }
        this.sel = { x: minX, y: minY, w, h, mask, content: null };
        this.emitSelection();
    }

    private blitOptions() {
        return { transparentRGB: this.state.opaque ? null : this.state.bg };
    }

    /** Lift the selected pixels off the picture so they can move. */
    private lift(copy: boolean) {
        const s = this.sel;
        if (!s || s.content) return;
        this.beginOp();
        const content = crop(this.doc, s);
        if (s.mask) for (let i = 0; i < s.mask.length; i++) if (!s.mask[i]) content.px[i] = 0;
        if (!copy) {
            const word = pixelOf(this.state.bg);
            this.drawDoc((d) => {
                for (let y = 0; y < s.h; y++) {
                    for (let x = 0; x < s.w; x++) {
                        if (s.mask && !s.mask[y * s.w + x]) continue;
                        setPx(this.doc, s.x + x, s.y + y, word, d);
                    }
                }
            });
        }
        s.content = content;
    }

    private stampSelection() {
        const s = this.sel;
        if (!s?.content) return;
        const content = s.content;
        this.drawDoc((d) => blit(this.doc, content, s.x, s.y, this.blitOptions(), d));
    }

    private renderFloating() {
        const s = this.sel;
        this.drawOverlay((d) => {
            if (s?.content) blit(this.overlay, s.content, s.x, s.y, this.blitOptions(), d);
        });
    }

    private moveSelection(g: Extract<Gesture, { kind: 'move' }>, x: number, y: number) {
        const s = this.sel;
        if (!s) return;
        const nx = x - g.grabX;
        const ny = y - g.grabY;
        if (nx === s.x && ny === s.y) return;
        if (!s.content) this.lift(g.copy);
        // Ctrl-drag leaves a copy behind; Shift-drag leaves a trail of copies.
        else if (g.copy && !g.moved) this.stampSelection();
        if (g.smear) this.stampSelection();
        g.moved = true;
        s.x = nx;
        s.y = ny;
        this.renderFloating();
        this.emitSelection();
    }

    /** Drop a floating selection onto the picture and deselect. */
    commitSelection() {
        const s = this.sel;
        if (!s) return;
        this.sel = null;
        if (s.content) {
            this.clearOverlay();
            this.stampAt(s);
            this.endOp();
        }
        this.emitSelection();
    }

    private stampAt(s: Selection) {
        if (!s.content) return;
        const content = s.content;
        this.drawDoc((d) => blit(this.doc, content, s.x, s.y, this.blitOptions(), d));
    }

    get hasSelection(): boolean {
        return !!this.sel;
    }

    selectAll() {
        this.commitAll();
        this.sel = { x: 0, y: 0, w: this.doc.width, h: this.doc.height, mask: null, content: null };
        if (this.state.tool !== 'select') this.set({ tool: 'select' });
        this.emitSelection();
    }

    /** Edit > Clear Selection: the selected area becomes the background colour. */
    clearSelection() {
        const s = this.sel;
        if (!s) return;
        this.sel = null;
        if (s.content) {
            // Its pixels were already lifted off the picture; dropping them is the whole job.
            this.clearOverlay();
            this.endOp();
        } else {
            this.beginOp();
            const word = pixelOf(this.state.bg);
            this.drawDoc((d) => {
                for (let y = 0; y < s.h; y++) {
                    for (let x = 0; x < s.w; x++) {
                        if (s.mask && !s.mask[y * s.w + x]) continue;
                        setPx(this.doc, s.x + x, s.y + y, word, d);
                    }
                }
            });
            this.endOp();
        }
        this.emitSelection();
    }

    /** The selected pixels, as the clipboard should receive them; null with no selection. */
    copySelection(): Bitmap | null {
        const s = this.sel;
        if (!s) return null;
        let b: Bitmap;
        if (s.content) b = cloneBitmap(s.content);
        else {
            b = crop(this.doc, s);
            if (s.mask) for (let i = 0; i < s.mask.length; i++) if (!s.mask[i]) b.px[i] = 0;
        }
        this.clipboard = b;
        return b;
    }

    /** Paste as a floating selection at (x, y), as Paint did — top-left of the visible area. */
    paste(b: Bitmap, x: number, y: number) {
        this.commitAll();
        this.beginOp();
        this.sel = { x, y, w: b.width, h: b.height, mask: null, content: cloneBitmap(b) };
        if (this.state.tool !== 'select' && this.state.tool !== 'free-select') this.set({ tool: 'select' });
        this.renderFloating();
        this.emitSelection();
    }

    /* ------------------------------------------------------------------ text */

    private textDown(x: number, y: number) {
        const t = this.text;
        if (t && !t.sizing && x >= t.x && y >= t.y && x < t.x + t.w && y < t.y + t.h) return;
        this.commitText();
        const [cx, cy] = this.clampToPicture(x, y);
        this.gesture = { kind: 'textbox', x0: cx, y0: cy, x1: cx, y1: cy };
        this.text = { x: cx, y: cy, w: 1, h: 1, value: '', sizing: true };
        this.emitText();
    }

    private finishTextBox(g: Extract<Gesture, { kind: 'textbox' }>) {
        const { font } = this.state;
        const lineHeight = Math.ceil(font.size * TEXT_LINE_HEIGHT);
        const r = boxRect(g.x0, g.y0, g.x1, g.y1);
        // A click without a drag still makes a usable box, as Paint's did.
        const w = Math.min(this.doc.width, Math.max(r.w, Math.max(48, font.size * 6)));
        const h = Math.min(this.doc.height, Math.max(r.h, lineHeight + TEXT_PADDING * 2));
        this.text = {
            x: Math.max(0, Math.min(r.x, this.doc.width - w)),
            y: Math.max(0, Math.min(r.y, this.doc.height - h)),
            w,
            h,
            value: '',
            sizing: false,
        };
        this.emitText();
    }

    setTextValue(value: string) {
        if (!this.text) return;
        this.text = { ...this.text, value };
        this.emitText();
    }

    /** Rasterise the text box into the picture, in the foreground colour, without anti-aliasing. */
    commitText() {
        const t = this.text;
        if (!t) return;
        this.text = null;
        this.emitText();
        if (t.sizing || !t.value.trim() || typeof document === 'undefined') return;
        const { font, fg, bg, opaque } = this.state;
        const canvas = document.createElement('canvas');
        canvas.width = t.w;
        canvas.height = t.h;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.font = cssFont(font);
        ctx.textBaseline = 'top';
        ctx.fillStyle = '#000';
        const lineHeight = Math.ceil(font.size * TEXT_LINE_HEIGHT);
        const inner = t.w - TEXT_PADDING * 2;
        const lines = wrapText((s) => ctx.measureText(s).width, t.value, inner);
        lines.forEach((line, i) => {
            const top = TEXT_PADDING + i * lineHeight + Math.round((lineHeight - font.size) / 2);
            ctx.fillText(line, TEXT_PADDING, top);
            if (font.underline && line) {
                const thickness = Math.max(1, Math.round(font.size / 14));
                ctx.fillRect(TEXT_PADDING, top + Math.round(font.size * 1.02), Math.ceil(ctx.measureText(line).width), thickness);
            }
        });
        const alpha = ctx.getImageData(0, 0, t.w, t.h).data;
        const ink = pixelOf(fg);
        this.beginOp();
        this.drawDoc((d) => {
            if (opaque) fillRect(this.doc, clipRect({ x: t.x, y: t.y, w: t.w, h: t.h }, this.doc.width, this.doc.height) ?? { x: 0, y: 0, w: 0, h: 0 }, pixelOf(bg), d);
            // Half-covered pixels become ink, the rest nothing: text as Paint set it, in whole pixels.
            for (let y = 0; y < t.h; y++) {
                for (let x = 0; x < t.w; x++) {
                    if (alpha[(y * t.w + x) * 4 + 3] >= 128) setPx(this.doc, t.x + x, t.y + y, ink, d);
                }
            }
        });
        this.endOp();
    }

    /* ------------------------------------------------------ image commands */

    /** Run `onSelection` on the (lifted) selection if there is one, otherwise `onPicture`. */
    private transform(onSelection: (content: Bitmap) => Bitmap, onPicture: () => void) {
        this.commitText();
        this.commitCurve();
        this.commitPolygon();
        const s = this.sel;
        if (s) {
            this.lift(false);
            if (!s.content) return;
            s.content = onSelection(s.content);
            s.w = s.content.width;
            s.h = s.content.height;
            this.renderFloating();
            this.emitSelection();
            return;
        }
        onPicture();
    }

    flip(direction: 'horizontal' | 'vertical') {
        const f = direction === 'horizontal' ? flipHorizontal : flipVertical;
        this.transform(f, () => this.swapDoc(f(this.doc)));
    }

    rotate(degrees: 90 | 180 | 270) {
        this.transform(
            (c) => rotate(c, degrees),
            () => this.swapDoc(rotate(this.doc, degrees)),
        );
    }

    stretchSkew(stretchX: number, stretchY: number, skewX: number, skewY: number) {
        this.transform(
            // Inside a selection, uncovered corners are transparent rather than a colour.
            (c) => stretchSkew(c, stretchX, stretchY, skewX, skewY, 0),
            () => this.swapDoc(stretchSkew(this.doc, stretchX, stretchY, skewX, skewY, pixelOf(this.state.bg))),
        );
    }

    invertColors() {
        this.transform(
            (c) => {
                const out = cloneBitmap(c);
                invert(out);
                return out;
            },
            () => {
                this.beginOp();
                this.drawDoc((d) => {
                    invert(this.doc);
                    d.addRect({ x: 0, y: 0, w: this.doc.width, h: this.doc.height });
                });
                this.endOp();
            },
        );
    }

    clearImage() {
        this.commitAll();
        this.beginOp();
        this.drawDoc((d) => {
            fillAll(this.doc, pixelOf(this.state.bg));
            d.addRect({ x: 0, y: 0, w: this.doc.width, h: this.doc.height });
        });
        this.endOp();
    }

    /** Image > Attributes, and the resize handles: new size, new area in the background colour. */
    resize(width: number, height: number) {
        this.commitAll();
        if (width === this.doc.width && height === this.doc.height) return;
        this.swapDoc(resizeCanvas(this.doc, width, height, pixelOf(this.state.bg)));
    }

    toBlackAndWhite() {
        this.commitAll();
        this.beginOp();
        this.drawDoc((d) => {
            toBlackAndWhite(this.doc);
            d.addRect({ x: 0, y: 0, w: this.doc.width, h: this.doc.height });
        });
        this.endOp();
    }

    /* ------------------------------------------------------ document level */

    undo() {
        this.commitAll();
        const e = this.history.undo();
        if (e) this.apply(e, 'before');
    }

    redo() {
        this.commitAll();
        const e = this.history.redo();
        if (e) this.apply(e, 'after');
    }

    private apply(e: HistoryEntry, side: 'before' | 'after') {
        if (e.kind === 'patch') {
            writeRegion(this.doc, e.rect, e[side]);
            this.pendingMain.addRect(e.rect);
            this.schedule();
        } else {
            this.installDoc(e[side]);
        }
        this.set({ canUndo: this.history.canUndo, canRedo: this.history.canRedo, modified: true });
    }

    /** Start over with a blank picture. Undo history does not survive File > New, as in Paint. */
    newImage(width: number, height: number) {
        this.load(createBitmap(width, height, 0xffffff));
    }

    /** Replace the picture — File > Open. */
    load(b: Bitmap) {
        this.commitAll();
        this.history.clear();
        this.installDoc(b);
        this.set({ canUndo: false, canRedo: false, modified: false, zoom: 1 });
    }

    markSaved() {
        this.set({ modified: false });
    }

    /** The finished picture, with anything floating dropped into place first. */
    snapshot(): Bitmap {
        this.commitAll();
        return wrapBitmap(this.doc.width, this.doc.height, new Uint8ClampedArray(this.doc.data));
    }

    colorAt(x: number, y: number): RGB | null {
        return getRGB(this.doc, x, y);
    }
}

/* ----------------------------------------------------------------- helpers */

/** Inclusive box between two corners, as a rect. */
function boxRect(x0: number, y0: number, x1: number, y1: number): Rect {
    return { x: Math.min(x0, x1), y: Math.min(y0, y1), w: Math.abs(x1 - x0) + 1, h: Math.abs(y1 - y0) + 1 };
}

/** A selection marquee spans from the press point to the pointer, the pointer's pixel excluded. */
function boxRectExclusive(x0: number, y0: number, x1: number, y1: number): Rect {
    return { x: Math.min(x0, x1), y: Math.min(y0, y1), w: Math.abs(x1 - x0), h: Math.abs(y1 - y0) };
}

function unionOf(a: Rect, b: Rect): Rect {
    const x = Math.min(a.x, b.x);
    const y = Math.min(a.y, b.y);
    return { x, y, w: Math.max(a.x + a.w, b.x + b.w) - x, h: Math.max(a.y + a.h, b.y + b.h) - y };
}
