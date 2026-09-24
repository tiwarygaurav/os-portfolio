/**
 * Paint's sixteen tools, in the toolbox's order, with the help text XP showed in the status bar.
 */

export type ToolId =
    | 'free-select'
    | 'select'
    | 'eraser'
    | 'fill'
    | 'pick'
    | 'magnifier'
    | 'pencil'
    | 'brush'
    | 'airbrush'
    | 'text'
    | 'line'
    | 'curve'
    | 'rectangle'
    | 'polygon'
    | 'ellipse'
    | 'rounded-rect';

export interface ToolInfo {
    id: ToolId;
    name: string;
    hint: string;
}

export const TOOLS: ToolInfo[] = [
    { id: 'free-select', name: 'Free-Form Select', hint: 'Selects a free-form part of the picture to move, copy, or edit.' },
    { id: 'select', name: 'Select', hint: 'Selects a rectangular part of the picture to move, copy, or edit.' },
    { id: 'eraser', name: 'Eraser/Color Eraser', hint: 'Erases a portion of the picture, using the selected eraser shape.' },
    { id: 'fill', name: 'Fill With Color', hint: 'Fills an area with the current drawing color.' },
    { id: 'pick', name: 'Pick Color', hint: 'Picks up a color from the picture for drawing.' },
    { id: 'magnifier', name: 'Magnifier', hint: 'Changes the magnification.' },
    { id: 'pencil', name: 'Pencil', hint: 'Draws a free-form line one pixel wide.' },
    { id: 'brush', name: 'Brush', hint: 'Draws using a brush with the selected shape and size.' },
    { id: 'airbrush', name: 'Airbrush', hint: 'Draws using an airbrush of the selected size.' },
    { id: 'text', name: 'Text', hint: 'Inserts text into the picture.' },
    { id: 'line', name: 'Line', hint: 'Draws a straight line with the selected line width.' },
    { id: 'curve', name: 'Curve', hint: 'Draws a curved line with the selected line width.' },
    { id: 'rectangle', name: 'Rectangle', hint: 'Draws a rectangle with the selected fill style.' },
    { id: 'polygon', name: 'Polygon', hint: 'Draws a polygon with the selected fill style.' },
    { id: 'ellipse', name: 'Ellipse', hint: 'Draws an ellipse with the selected fill style.' },
    { id: 'rounded-rect', name: 'Rounded Rectangle', hint: 'Draws a rounded rectangle with the selected fill style.' },
];

export const toolInfo = (id: ToolId): ToolInfo => TOOLS.find((t) => t.id === id) ?? TOOLS[0];

/** Tools whose outline uses the shared line width. */
export const SHAPE_TOOLS: ToolId[] = ['rectangle', 'polygon', 'ellipse', 'rounded-rect'];

/* ------------------------------------------------------------------ options */

export type BrushShape = 'round' | 'square' | 'forward' | 'back';

/** The twelve brush tips: three sizes each of round, square, and the two slants. */
export const BRUSHES: { shape: BrushShape; size: number }[] = [
    { shape: 'round', size: 7 },
    { shape: 'round', size: 4 },
    { shape: 'round', size: 1 },
    { shape: 'square', size: 8 },
    { shape: 'square', size: 5 },
    { shape: 'square', size: 2 },
    { shape: 'forward', size: 8 },
    { shape: 'forward', size: 5 },
    { shape: 'forward', size: 3 },
    { shape: 'back', size: 8 },
    { shape: 'back', size: 5 },
    { shape: 'back', size: 3 },
];

export const ERASER_SIZES = [4, 6, 8, 10] as const;

/** Spray radius, and dots per tick of the spray timer. */
export const AIRBRUSH_SIZES = [
    { radius: 4, dots: 6 },
    { radius: 8, dots: 14 },
    { radius: 12, dots: 26 },
] as const;

export const LINE_WIDTHS = [1, 2, 3, 4, 5] as const;

/** The magnifier's own choices. 4x is View > Zoom > Large Size, and the magnifier's default. */
export const MAGNIFICATIONS = [1, 2, 4, 6, 8] as const;

/** View > Zoom > Custom's choices, as percentages of actual size. */
export const ZOOM_LEVELS = [1, 2, 4, 6, 8] as const;

/* ------------------------------------------------------------------ cursors */

/** A CSS cursor from inline SVG, with a hotspot and a fallback. */
const svgCursor = (svg: string, x: number, y: number, fallback = 'crosshair') =>
    `url("data:image/svg+xml,${encodeURIComponent(svg)}") ${x} ${y}, ${fallback}`;

const SVG = (body: string) => `<svg xmlns='http://www.w3.org/2000/svg' width='32' height='32' viewBox='0 0 32 32'>${body}</svg>`;

/** Original cursor drawings in the spirit of XP Paint's: outlined in black, filled in white. */
export const CURSORS = {
    pencil: svgCursor(
        SVG(
            "<path d='M1.5 30.5 L3 24 L22 5 L27 10 L8 29 Z' fill='white' stroke='black' stroke-linejoin='round'/>" +
                "<path d='M1.5 30.5 L3 24 L8 29 Z' fill='black'/><path d='M19 8 L24 13' stroke='black'/>",
        ),
        1,
        30,
    ),
    fill: svgCursor(
        SVG(
            "<path d='M13 4 L25 16 L16 25 L4 13 Z' fill='white' stroke='black' stroke-linejoin='round'/>" +
                "<path d='M4 13 L16 25' stroke='black'/><path d='M13 4 Q16 1 18 5' fill='none' stroke='black'/>" +
                "<path d='M4.5 13.5 Q1.5 18 2 26 Q2.5 28 3.5 26 Q4 20 6 15' fill='black'/>",
        ),
        2,
        27,
    ),
    pick: svgCursor(
        SVG(
            "<path d='M2 30 L4 25 L17 12 L20 15 L7 28 Z' fill='white' stroke='black' stroke-linejoin='round'/>" +
                "<path d='M16 9 L23 16 L25 14 L28 11 A3 3 0 0 0 21 4 L18 7 Z' fill='black'/>",
        ),
        2,
        29,
    ),
    magnifier: svgCursor(
        SVG(
            "<circle cx='12' cy='12' r='8' fill='white' fill-opacity='0.6' stroke='black' stroke-width='2'/>" +
                "<path d='M18 18 L28 28' stroke='black' stroke-width='4' stroke-linecap='round'/>",
        ),
        12,
        12,
        'zoom-in',
    ),
} as const;
