import { foundation, pileOf, tableau, STOCK, WASTE, type Board, type Card, type PileRef } from './engine';

/**
 * Where everything sits on the table, in board units (CSS pixels before the board is scaled).
 *
 * One model serves the rendered cards, the drop targets and the win cascade, so what the visitor
 * sees and what the pointer hits cannot disagree. The numbers are sol.exe's: 71×96 cards, seven
 * columns 80px apart, the stock and waste top left and the foundations over columns 3–6.
 */

export const CARD_W = 71;
export const CARD_H = 96;
const PITCH = 80;
const MARGIN = 11;
export const TOP_Y = 8;
export const TABLEAU_Y = TOP_Y + CARD_H + 16;
/** Seven columns wide: below this the whole board scales down rather than overlapping. */
export const BOARD_W = MARGIN * 2 + PITCH * 6 + CARD_W;

const FAN_DOWN = 4;
const FAN_UP = 16;
/** How far a crowded column may squeeze its fan before it is allowed to run off the bottom. */
const MIN_DOWN = 2;
const MIN_UP = 7;
const BOTTOM_PAD = 6;
/** Draw Three fans the latest draw sideways so all three indices show. */
const WASTE_FAN = 12;
/** The stock and waste look thicker the more they hold: one more edge per ten cards. */
const THICKNESS_EVERY = 10;
const THICKNESS_STEP = 2;

export interface Geometry {
    /** CSS scale applied to the whole board; 1 unless the window is narrower than seven columns. */
    scale: number;
    /** Board size in board units. */
    width: number;
    height: number;
    margin: number;
    pitch: number;
}

/**
 * Narrower than seven columns: scale the whole board down uniformly. Wider: spread the columns,
 * sharing the extra room equally between the gaps and the two margins, as sol.exe did when its
 * window was enlarged. Cards never grow — XP's cards were fixed-size bitmaps.
 */
export function geometry(viewW: number, viewH: number): Geometry {
    if (viewW <= 0 || viewH <= 0) return { scale: 1, width: BOARD_W, height: TABLEAU_Y + CARD_H * 3, margin: MARGIN, pitch: PITCH };
    if (viewW < BOARD_W) {
        const scale = viewW / BOARD_W;
        return { scale, width: BOARD_W, height: viewH / scale, margin: MARGIN, pitch: PITCH };
    }
    const extra = (viewW - BOARD_W) / 8;
    return { scale: 1, width: viewW, height: viewH, margin: MARGIN + extra, pitch: PITCH + extra };
}

export const columnX = (g: Geometry, col: number) => Math.round(g.margin + g.pitch * col);

export interface Rect {
    x: number;
    y: number;
    w: number;
    h: number;
}

export const slotRect = (g: Geometry, ref: PileRef): Rect => {
    switch (ref.kind) {
        case 'stock':
            return { x: columnX(g, 0), y: TOP_Y, w: CARD_W, h: CARD_H };
        case 'waste':
            return { x: columnX(g, 1), y: TOP_Y, w: CARD_W, h: CARD_H };
        case 'foundation':
            return { x: columnX(g, 3 + ref.index), y: TOP_Y, w: CARD_W, h: CARD_H };
        case 'tableau':
            return { x: columnX(g, ref.index), y: TABLEAU_Y, w: CARD_W, h: CARD_H };
    }
};

export interface Placed {
    card: Card;
    pile: PileRef;
    index: number;
    x: number;
    y: number;
    /** Stacking order within the board; the view adds lift for moving and dragged cards. */
    z: number;
}

/**
 * Tableau fan offsets for one column: face-down cards 4px apart, face-up 16px, squeezed — face-up
 * spacing first, then face-down — when the column would run past the bottom of the window.
 */
function fan(column: readonly Card[], room: number): number[] {
    let downs = 0;
    for (let i = 0; i < column.length - 1; i++) if (!column[i].faceUp) downs++;
    const ups = Math.max(0, column.length - 1 - downs);
    let down = FAN_DOWN;
    let up = FAN_UP;
    const space = room - CARD_H;
    if (downs * down + ups * up > space) {
        if (ups) up = Math.max(MIN_UP, (space - downs * down) / ups);
        if (downs && downs * down + ups * up > space) down = Math.max(MIN_DOWN, (space - ups * up) / downs);
    }
    const ys: number[] = [];
    let y = 0;
    column.forEach((card) => {
        ys.push(Math.round(y));
        y += card.faceUp ? up : down;
    });
    return ys;
}

/** Offsets that give a squared-up pile its visible thickness: lower cards peek out down-right. */
function thickness(count: number, i: number): number {
    if (count <= 0) return 0;
    return (Math.floor((count - 1) / THICKNESS_EVERY) - Math.floor(i / THICKNESS_EVERY)) * THICKNESS_STEP;
}

/** Every card's place on the table, indexed by card id. */
export function layout(board: Board, g: Geometry): Placed[] {
    const placed: Placed[] = [];
    const put = (card: Card, pile: PileRef, index: number, x: number, y: number, z: number) => {
        placed[card.id] = { card, pile, index, x, y, z };
    };

    const stock = slotRect(g, STOCK);
    board.stock.forEach((card, i) => {
        const t = thickness(board.stock.length, i);
        put(card, STOCK, i, stock.x + t, stock.y + t, 1 + i);
    });

    const waste = slotRect(g, WASTE);
    const fanned = Math.min(board.waste.length, Math.max(1, board.wasteFan));
    const flat = board.waste.length - fanned;
    board.waste.forEach((card, i) => {
        if (i < flat) {
            const t = thickness(flat, i);
            put(card, WASTE, i, waste.x + t, waste.y + t, 30 + i);
        } else {
            put(card, WASTE, i, waste.x + (i - flat) * WASTE_FAN, waste.y, 30 + i);
        }
    });

    board.foundations.forEach((pile, f) => {
        const slot = slotRect(g, foundation(f));
        pile.forEach((card, i) => put(card, foundation(f), i, slot.x, slot.y, 60 + i));
    });

    const room = g.height - TABLEAU_Y - BOTTOM_PAD;
    board.tableau.forEach((pile, t) => {
        const slot = slotRect(g, tableau(t));
        const ys = fan(pile, room);
        pile.forEach((card, i) => put(card, tableau(t), i, slot.x, slot.y + ys[i], 100 + i));
    });

    return placed;
}

/**
 * Where a dragged card can land: each foundation's slot, and each column from its first card to
 * the bottom of its last, so a drop anywhere on a long column counts.
 */
export function dropTargets(board: Board, g: Geometry, placed: Placed[]): { ref: PileRef; rect: Rect }[] {
    const targets: { ref: PileRef; rect: Rect }[] = [];
    for (let f = 0; f < 4; f++) targets.push({ ref: foundation(f), rect: slotRect(g, foundation(f)) });
    for (let t = 0; t < 7; t++) {
        const ref = tableau(t);
        const slot = slotRect(g, ref);
        const pile = pileOf(board, ref);
        const top = pile.length ? placed[pile[pile.length - 1].id] : null;
        const bottom = top ? top.y + CARD_H : slot.y + CARD_H;
        targets.push({ ref, rect: { x: slot.x, y: slot.y, w: CARD_W, h: bottom - slot.y } });
    }
    return targets;
}

/**
 * What a point on the board is over, decided by the model rather than by the element under the
 * pointer. A card still gliding from the last move is drawn where it was but already belongs
 * where it is going; asking the DOM would hand a fast second click on the stock to the card that
 * just left it. The stock's slot answers for an empty stock.
 */
export function hitTest(placed: Placed[], g: Geometry, x: number, y: number): { pile: PileRef; index: number } | null {
    let best: Placed | null = null;
    for (const p of placed) {
        if (p && x >= p.x && x < p.x + CARD_W && y >= p.y && y < p.y + CARD_H && (!best || p.z > best.z)) best = p;
    }
    if (best) return { pile: best.pile, index: best.index };
    const stock = slotRect(g, STOCK);
    if (x >= stock.x && x < stock.x + stock.w && y >= stock.y && y < stock.y + stock.h) return { pile: STOCK, index: -1 };
    return null;
}

export function overlap(a: Rect, b: Rect): number {
    const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
    const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
    return w > 0 && h > 0 ? w * h : 0;
}
