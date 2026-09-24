/**
 * Paint, headless: the pixel engine (`components/apps/paint/raster.ts`), undo history, colour
 * conversions, the BMP encoder, text wrapping, and the document engine driven by real gestures —
 * strokes, shapes and fill styles, flood fill, selections, the polygon and curve tools, the Color
 * Eraser, transforms and their undo. The document engine only needs `ImageData` from the DOM, and
 * only as a container for its own buffer, so a two-line stand-in is enough to run it under Node.
 */
const test = require('node:test');
const assert = require('node:assert/strict');

global.ImageData ??= class ImageData {
    constructor(data, width, height) {
        this.data = data;
        this.width = width;
        this.height = height;
    }
};

const R = require('../../.test-out/components/apps/paint/raster.js');
const { History } = require('../../.test-out/components/apps/paint/history.js');
const P = require('../../.test-out/components/apps/paint/palette.js');
const { PaintEngine, wrapText } = require('../../.test-out/components/apps/paint/engine.js');
const { encodeBmp } = require('../../.test-out/components/apps/paint/codec.js');

const hex = (n) => (n === null ? 'null' : '#' + n.toString(16).padStart(6, '0'));
const count = (b, rgb) => {
    let n = 0;
    for (let y = 0; y < b.height; y++) for (let x = 0; x < b.width; x++) if (R.getRGB(b, x, y) === rgb) n++;
    return n;
};

const M = { shift: false, ctrl: false };
const SHIFT = { shift: true, ctrl: false };
const CTRL = { shift: false, ctrl: true };
const drag = (e, from, to, button = 'primary', mods = M) => {
    e.down(from[0], from[1], button, mods);
    e.move(to[0], to[1], mods);
    e.up(to[0], to[1], mods);
};

// ---- the pixel engine -------------------------------------------------------------------------------

test('bitmaps are RGBA in ImageData layout, and colours round-trip', () => {
    const b = R.createBitmap(4, 3, 0x123456);
    assert.equal(R.getRGB(b, 3, 2), 0x123456);
    assert.equal(R.rgbOf(R.pixelOf(0xabcdef)), 0xabcdef);
    assert.deepEqual([b.data[0], b.data[1], b.data[2], b.data[3]], [0x12, 0x34, 0x56, 255]);
    assert.equal(R.getRGB(b, 4, 0), null);
});

test('Bresenham lines include both ends and stay 8-connected', () => {
    const pts = [];
    R.eachLinePoint(0, 0, 5, 2, (x, y) => pts.push([x, y]));
    assert.deepEqual(pts[0], [0, 0]);
    assert.deepEqual(pts.at(-1), [5, 2]);
    for (let i = 1; i < pts.length; i++) {
        assert.ok(Math.abs(pts[i][0] - pts[i - 1][0]) <= 1 && Math.abs(pts[i][1] - pts[i - 1][1]) <= 1);
    }
});

test('flood fill fills exactly the enclosed region and stops at the outline', () => {
    const b = R.createBitmap(20, 20, 0xffffff);
    R.drawShape(b, 'rectangle', { x0: 2, y0: 2, x1: 12, y1: 12 }, 1, 'outline', R.pixelOf(0), R.pixelOf(0xff0000));
    assert.equal(R.getRGB(b, 2, 2), 0);
    assert.equal(R.getRGB(b, 12, 7), 0);
    assert.equal(R.getRGB(b, 7, 7), 0xffffff);
    assert.equal(R.floodFill(b, 7, 7, R.pixelOf(0x00ff00)), true);
    assert.equal(R.getRGB(b, 3, 3), 0x00ff00);
    assert.equal(R.getRGB(b, 11, 11), 0x00ff00);
    assert.equal(R.getRGB(b, 2, 7), 0, 'the outline survives');
    assert.equal(R.getRGB(b, 0, 0), 0xffffff, 'nothing leaks outside');
    assert.equal(R.getRGB(b, 15, 15), 0xffffff);
    assert.equal(R.floodFill(b, 7, 7, R.pixelOf(0x00ff00)), false, 'filling with the same colour is a no-op');
});

test('ellipse outlines are closed at every size, so a fill inside never leaks', () => {
    for (let w = 3; w <= 40; w += 3) {
        for (let h = 3; h <= 30; h += 4) {
            const b = R.createBitmap(50, 40, 0xffffff);
            R.drawShape(b, 'ellipse', { x0: 2, y0: 2, x1: 2 + w - 1, y1: 2 + h - 1 }, 1, 'outline', R.pixelOf(0), 0);
            const cx = 2 + Math.floor((w - 1) / 2);
            const cy = 2 + Math.floor((h - 1) / 2);
            if (R.getRGB(b, cx, cy) === 0) continue; // so small the centre is outline
            R.floodFill(b, cx, cy, R.pixelOf(0xff0000));
            assert.equal(R.getRGB(b, 0, 0), 0xffffff, `leak at ${w}x${h}`);
            assert.equal(R.getRGB(b, 49, 39), 0xffffff, `leak at ${w}x${h}`);
        }
    }
});

test('ellipses are symmetric, and tiny ones keep their shape', () => {
    const s = R.ellipseSpans({ x0: 0, y0: 0, x1: 20, y1: 10 });
    const n = s.left.length;
    for (let i = 0; i < n; i++) {
        assert.equal(s.left[i], s.left[n - 1 - i]);
        assert.equal(s.right[i], s.right[n - 1 - i]);
        assert.equal(s.left[i] + s.right[i], 20);
    }
    const tiny = R.ellipseSpans({ x0: 0, y0: 0, x1: 1, y1: 1 });
    assert.deepEqual([...tiny.left, ...tiny.right], [0, 0, 1, 1], 'a 2x2 ellipse is 2x2, not a line');
});

test('thick outlines sit inside the box; fill styles use the right colours', () => {
    const b = R.createBitmap(20, 20, 0xffffff);
    R.drawShape(b, 'rectangle', { x0: 0, y0: 0, x1: 9, y1: 9 }, 3, 'outline-fill', R.pixelOf(0), R.pixelOf(0x0000ff));
    assert.equal(R.getRGB(b, 2, 5), 0);
    assert.equal(R.getRGB(b, 3, 5), 0x0000ff);
    assert.equal(R.getRGB(b, 7, 5), 0);
    assert.equal(R.getRGB(b, 6, 5), 0x0000ff);
    const f = R.createBitmap(20, 20, 0xffffff);
    R.drawShape(f, 'ellipse', { x0: 0, y0: 0, x1: 9, y1: 9 }, 1, 'fill', 0, R.pixelOf(0xff0000));
    assert.equal(R.getRGB(f, 5, 5), 0xff0000);
    assert.equal(R.getRGB(f, 0, 0), 0xffffff);
});

test('polygon fill covers about the right area', () => {
    const b = R.createBitmap(20, 20, 0xffffff);
    R.fillPolygon(b, [0, 0, 10, 0, 0, 10], R.pixelOf(0));
    const n = count(b, 0);
    assert.ok(n >= 40 && n <= 60, `triangle area ${n}`);
});

test('rotate and flip move pixels where they belong', () => {
    const b = R.createBitmap(5, 3, 0xffffff);
    R.setPx(b, 0, 0, R.pixelOf(0xff0000));
    R.setPx(b, 4, 2, R.pixelOf(0x00ff00));
    const r90 = R.rotate(b, 90);
    assert.deepEqual([r90.width, r90.height], [3, 5]);
    assert.equal(R.getRGB(r90, 2, 0), 0xff0000, 'top-left goes top-right');
    const r4 = R.rotate(R.rotate(R.rotate(r90, 90), 90), 90);
    assert.deepEqual([...r4.px], [...b.px], 'four quarter turns are the identity');
    const r180 = R.rotate(b, 180);
    assert.equal(R.getRGB(r180, 4, 2), 0xff0000);
    assert.equal(R.getRGB(r180, 0, 0), 0x00ff00);
    assert.equal(R.getRGB(R.rotate(b, 270), 0, 4), 0xff0000, 'top-left goes bottom-left');
    assert.equal(R.getRGB(R.flipHorizontal(b), 4, 0), 0xff0000);
    assert.equal(R.getRGB(R.flipVertical(b), 0, 2), 0xff0000);
});

test('stretch and skew resize the picture', () => {
    const b = R.createBitmap(10, 10, 0xffffff);
    const s = R.stretchSkew(b, 200, 50, 0, 0, R.pixelOf(0));
    assert.deepEqual([s.width, s.height], [20, 5]);
    const k = R.stretchSkew(b, 100, 100, 45, 0, R.pixelOf(0));
    assert.deepEqual([k.width, k.height], [19, 10]);
});

test('region patches round-trip, which is what undo stores', () => {
    const b = R.createBitmap(6, 6, 0xffffff);
    R.fillRect(b, { x: 1, y: 1, w: 2, h: 2 }, R.pixelOf(0));
    const r = { x: 0, y: 0, w: 4, h: 4 };
    const before = R.readRegion(b, r);
    R.fillAll(b, R.pixelOf(0xff0000));
    R.writeRegion(b, r, before);
    assert.equal(R.getRGB(b, 1, 1), 0);
    assert.equal(R.getRGB(b, 0, 0), 0xffffff);
    assert.equal(R.getRGB(b, 5, 5), 0xff0000);
});

test('the Color Eraser replaces only the foreground colour', () => {
    const b = R.createBitmap(10, 10, 0xff0000);
    R.stampReplace(b, 5, 5, R.squarePen(4), R.pixelOf(0xff0000), R.pixelOf(0x0000ff));
    assert.equal(R.getRGB(b, 5, 5), 0x0000ff);
    const c = R.createBitmap(10, 10, 0x00ff00);
    R.stampReplace(c, 5, 5, R.squarePen(4), R.pixelOf(0xff0000), R.pixelOf(0x0000ff));
    assert.equal(R.getRGB(c, 5, 5), 0x00ff00);
});

// ---- colours, files, text -----------------------------------------------------------------------------

test("hue/sat/lum use Windows' 0-240 scale", () => {
    assert.deepEqual(P.toHLS(0xff0000), { h: 0, s: 240, l: 120 });
    assert.equal(P.fromHLS(80, 240, 120), 0x00ff00);
    assert.equal(P.fromHLS(0, 0, 240), 0xffffff);
});

test('the BMP encoder writes a 24-bit file with padded rows', () => {
    const bmp = encodeBmp(R.createBitmap(3, 2, 0x112233));
    assert.equal(bmp.size, 54 + 12 * 2);
});

test('text wraps like the text box: by word, long words by letter, blank lines kept', () => {
    const len = (s) => s.length;
    assert.deepEqual(wrapText(len, 'the quick brown fox', 9), ['the quick', 'brown fox']);
    assert.deepEqual(wrapText(len, 'abcdefghijkl', 5), ['abcde', 'fghij', 'kl']);
    assert.deepEqual(wrapText(len, 'a\n\nb', 5), ['a', '', 'b']);
});

test('undo history: order, redo, and a new change clears redo', () => {
    const h = new History();
    const e = (n) => ({ kind: 'patch', rect: { x: 0, y: 0, w: 1, h: 1 }, before: new Uint8ClampedArray(4).fill(n), after: new Uint8ClampedArray(4).fill(n + 1) });
    h.push(e(1));
    h.push(e(2));
    assert.ok(h.canUndo && !h.canRedo);
    assert.equal(h.undo().before[0], 2);
    assert.ok(h.canRedo);
    h.push(e(5));
    assert.ok(!h.canRedo);
    assert.equal(h.undo().before[0], 5);
    assert.equal(h.undo().before[0], 1);
    assert.equal(h.undo(), null);
});

// ---- the document engine, driven by gestures ------------------------------------------------------------

test('pencil strokes, undo and redo; the right button draws in the background colour', () => {
    const e = new PaintEngine(40, 30);
    e.setTool('pencil');
    drag(e, [1, 1], [10, 1]);
    assert.equal(e.colorAt(1, 1), 0);
    assert.equal(e.colorAt(5, 1), 0);
    assert.equal(e.colorAt(10, 1), 0);
    assert.equal(e.colorAt(5, 2), 0xffffff);
    assert.ok(e.getState().modified && e.getState().canUndo);
    e.undo();
    assert.equal(e.colorAt(5, 1), 0xffffff);
    assert.ok(!e.getState().canUndo && e.getState().canRedo);
    e.redo();
    assert.equal(e.colorAt(5, 1), 0);
    e.setColor('secondary', 0xff0000);
    drag(e, [1, 5], [3, 5], 'secondary');
    assert.equal(e.colorAt(2, 5), 0xff0000);
});

test('shapes preview without touching the picture, then land; fill styles follow the buttons', () => {
    const e = new PaintEngine(40, 30);
    e.setTool('rectangle');
    e.setFillStyle('outline-fill');
    e.setColor('secondary', 0x00ff00);
    e.down(2, 2, 'primary', M);
    e.move(12, 12, M);
    assert.equal(e.colorAt(2, 2), 0xffffff, 'preview only');
    e.up(12, 12, M);
    assert.equal(e.colorAt(2, 2), 0);
    assert.equal(e.colorAt(12, 12), 0);
    assert.equal(e.colorAt(7, 7), 0x00ff00);
    e.setTool('fill');
    e.setColor('primary', 0x0000ff);
    drag(e, [7, 7], [7, 7]);
    assert.equal(e.colorAt(7, 7), 0x0000ff);
    assert.equal(e.colorAt(20, 20), 0xffffff);
    e.undo();
    assert.equal(e.colorAt(7, 7), 0x00ff00);
    e.setTool('rectangle');
    e.setFillStyle('fill');
    drag(e, [20, 2], [25, 7], 'secondary');
    assert.equal(e.colorAt(22, 4), 0x00ff00, 'a borderless fill takes the colour of the button used');
});

test('Shift snaps lines and makes circles', () => {
    const e = new PaintEngine(40, 30);
    e.setTool('line');
    drag(e, [0, 0], [10, 3], 'primary', SHIFT);
    assert.equal(e.colorAt(10, 0), 0);
    assert.equal(e.colorAt(10, 3), 0xffffff);
    e.setTool('ellipse');
    e.setFillStyle('outline');
    drag(e, [20, 10], [30, 14], 'primary', SHIFT);
    assert.equal(e.colorAt(25, 20), 0, 'the circle reaches y=20');
    assert.equal(e.colorAt(25, 10), 0);
});

test('selections: marquee, move, commit, undo, Ctrl-drag copy, Clear Selection', () => {
    const e = new PaintEngine(40, 30);
    e.setTool('rectangle');
    e.setFillStyle('fill');
    drag(e, [2, 2], [5, 5]);
    e.setTool('select');
    drag(e, [2, 2], [6, 6]);
    assert.deepEqual(e.getState().selection, { x: 2, y: 2, w: 4, h: 4, floating: false });
    drag(e, [3, 3], [13, 3]);
    assert.ok(e.getState().selection.floating);
    assert.equal(e.getState().selection.x, 12);
    assert.equal(e.colorAt(3, 3), 0xffffff, 'lifting clears to the background colour');
    assert.equal(e.colorAt(13, 3), 0xffffff, 'still floating');
    e.commitSelection();
    assert.equal(e.colorAt(13, 3), 0);
    assert.equal(e.getState().selection, null);
    e.undo();
    assert.equal(e.colorAt(3, 3), 0);
    assert.equal(e.colorAt(13, 3), 0xffffff);
    e.setTool('select');
    drag(e, [2, 2], [6, 6]);
    drag(e, [3, 3], [23, 3], 'primary', CTRL);
    e.commitSelection();
    assert.equal(e.colorAt(3, 3), 0, 'Ctrl-drag leaves the original');
    assert.equal(e.colorAt(23, 3), 0);
    drag(e, [20, 0], [30, 10]);
    e.clearSelection();
    assert.equal(e.colorAt(23, 3), 0xffffff);
});

test('a transparent selection leaves the background colour behind', () => {
    const e = new PaintEngine(40, 30);
    e.setTool('rectangle');
    e.setFillStyle('fill');
    e.setColor('primary', 0xff0000);
    drag(e, [20, 0], [39, 29]);
    e.setColor('primary', 0x000000);
    e.setTool('pencil');
    drag(e, [5, 5], [5, 5]);
    e.setOpaque(false);
    e.setTool('select');
    drag(e, [3, 3], [8, 8]);
    drag(e, [4, 4], [24, 4]);
    e.commitSelection();
    assert.equal(e.colorAt(25, 5), 0);
    assert.equal(e.colorAt(23, 3), 0xff0000);
    assert.equal(e.colorAt(26, 7), 0xff0000);
});

test('free-form selection lifts only the pixels inside the lasso', () => {
    const e = new PaintEngine(40, 30);
    e.setTool('rectangle');
    e.setFillStyle('fill');
    drag(e, [0, 0], [39, 29]);
    e.setTool('free-select');
    e.down(10, 10, 'primary', M);
    e.move(20, 10, M);
    e.move(15, 20, M);
    e.up(10, 10, M);
    assert.deepEqual(e.getState().selection, { x: 10, y: 10, w: 11, h: 11, floating: false });
    drag(e, [15, 12], [15, 22]);
    assert.equal(e.colorAt(15, 12), 0xffffff);
    assert.equal(e.colorAt(10, 19), 0, 'outside the lasso stays');
});

test('polygon: clicks add corners and a double-click closes it', () => {
    const e = new PaintEngine(40, 30);
    e.setTool('polygon');
    e.setFillStyle('outline');
    drag(e, [5, 5], [25, 5]);
    drag(e, [25, 20], [25, 20]);
    drag(e, [5, 20], [5, 20]);
    e.doubleClick();
    for (const [x, y] of [[5, 12], [15, 5], [25, 12], [15, 20]]) assert.equal(e.colorAt(x, y), 0, `edge at ${x},${y}`);
    assert.equal(e.colorAt(15, 12), 0xffffff);
    assert.equal(e.getState().busy, false);
});

test('curve: a line, then two bends, then it lands', () => {
    const e = new PaintEngine(40, 30);
    e.setTool('curve');
    drag(e, [0, 15], [39, 15]);
    assert.equal(e.getState().busy, true);
    assert.equal(e.colorAt(20, 15), 0xffffff);
    drag(e, [20, 0], [20, 0]);
    drag(e, [20, 0], [20, 0]);
    assert.equal(e.getState().busy, false);
    let top = 99;
    for (let y = 0; y < 30; y++) if (e.colorAt(20, y) === 0) { top = y; break; }
    assert.ok(top < 12, `bent upward (top=${top})`);
});

test('Pick Color picks and hands back the previous tool', () => {
    const e = new PaintEngine(40, 30);
    e.setColor('primary', 0x0000ff);
    e.setTool('pick');
    e.down(3, 3, 'primary', M);
    assert.equal(e.getState().fg, 0xffffff);
    assert.equal(e.getState().tool, 'pencil');
});

test('the eraser dragged with the right button is the Color Eraser', () => {
    const e = new PaintEngine(40, 30);
    e.setColor('primary', 0xff0000);
    e.setTool('pencil');
    drag(e, [0, 0], [39, 0]);
    e.setTool('eraser');
    drag(e, [20, 0], [20, 0], 'secondary');
    assert.equal(e.colorAt(20, 0), 0xffffff);
    e.setColor('primary', 0x00ff00);
    drag(e, [30, 0], [30, 0], 'secondary');
    assert.equal(e.colorAt(30, 0), 0xff0000, 'other colours survive');
});

test('rotate, resize and invert are undoable', () => {
    const e = new PaintEngine(20, 10);
    e.setTool('pencil');
    drag(e, [0, 0], [0, 0]);
    e.rotate(90);
    assert.deepEqual([e.getState().width, e.getState().height], [10, 20]);
    assert.equal(e.colorAt(9, 0), 0);
    e.undo();
    assert.equal(e.getState().width, 20);
    assert.equal(e.colorAt(0, 0), 0);
    e.resize(30, 12);
    assert.deepEqual([e.getState().width, e.getState().height], [30, 12]);
    assert.equal(e.colorAt(29, 11), 0xffffff);
    e.undo();
    assert.equal(e.getState().width, 20);
    e.invertColors();
    assert.equal(e.colorAt(0, 0), 0xffffff);
    assert.equal(e.colorAt(5, 5), 0);
});

test('switching tools drops an unlifted selection; the other button cancels a drag', () => {
    const e = new PaintEngine(40, 30);
    e.setTool('select');
    drag(e, [0, 0], [10, 10]);
    e.setTool('pencil');
    assert.equal(e.getState().selection, null);
    e.down(0, 0, 'primary', M);
    e.move(5, 5, M);
    e.abortDrag();
    assert.equal(e.colorAt(3, 3), 0xffffff);
    assert.equal(e.getState().canUndo, false);
});

test('the airbrush sprays for as long as the button is held', async () => {
    const e = new PaintEngine(40, 30);
    e.setTool('airbrush');
    e.down(20, 15, 'primary', M);
    await new Promise((r) => setTimeout(r, 200));
    e.up(20, 15, M);
    let ink = 0;
    for (let y = 0; y < 30; y++) for (let x = 0; x < 40; x++) if (e.colorAt(x, y) === 0) ink++;
    assert.ok(ink > 6, `ink=${ink}`);
});
