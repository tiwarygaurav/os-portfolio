/**
 * Minesweeper as Windows XP's winmine.exe played it: the fields, the first click, the flood fill,
 * chording, marks, and how a game is won or lost.
 *
 * No React, no DOM, no imports. Every function is pure: mine placement takes its randomness as an
 * argument and every move returns a new game instead of changing the old one. That is what lets
 * the whole rulebook run under Node, and it is why the window can hand the same game to a
 * mouse, a finger or a test and get the same answer.
 */

export type CellState = 'covered' | 'flagged' | 'question' | 'revealed';

export interface Cell {
    readonly mine: boolean;
    /** Mines among the eight neighbours. Meaningless until the mines are laid. */
    readonly adjacent: number;
    readonly state: CellState;
}

/** `ready`: a fresh field, no mines laid yet and the clock stopped. */
export type Status = 'ready' | 'playing' | 'won' | 'lost';

export interface Field {
    readonly rows: number;
    readonly cols: number;
    readonly mines: number;
}

export interface Game extends Field {
    /** Row-major: the cell at row r, column c is `cells[r * cols + c]`. */
    readonly cells: readonly Cell[];
    readonly status: Status;
    /** False until the first reveal lays the mines, which is what makes that reveal safe. */
    readonly laid: boolean;
    readonly flags: number;
    /** Safe cells still covered. The game is won the moment this reaches zero. */
    readonly safeLeft: number;
    /** The mines that were stepped on. XP drew each one on red. */
    readonly exploded: readonly number[];
}

export type Level = 'beginner' | 'intermediate' | 'expert' | 'custom';
export type RankedLevel = Exclude<Level, 'custom'>;

/** XP's three fields. Expert is sixteen rows of thirty. */
export const LEVELS: Readonly<Record<RankedLevel, Field>> = {
    beginner: { rows: 9, cols: 9, mines: 10 },
    intermediate: { rows: 16, cols: 16, mines: 40 },
    expert: { rows: 16, cols: 30, mines: 99 },
};

export const RANKED_LEVELS: readonly RankedLevel[] = ['beginner', 'intermediate', 'expert'];

/** The bounds XP's Custom Field dialog enforced. */
export const CUSTOM_LIMITS = {
    minRows: 9,
    maxRows: 24,
    minCols: 9,
    maxCols: 30,
    minMines: 10,
} as const;

/** XP allowed at most one mine fewer per row and per column than the field had: (h-1)(w-1). */
export const maxMines = (rows: number, cols: number): number => (rows - 1) * (cols - 1);

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/**
 * Read a Custom Field entry the way XP's dialog did: take the number typed, and treat anything
 * that is not one as the smallest allowed value. Then clamp into range, height and width first,
 * because the mine ceiling depends on both.
 */
export function clampCustom(input: { rows: number | string; cols: number | string; mines: number | string }): Field {
    const read = (v: number | string, fallback: number) => {
        const n = typeof v === 'number' ? Math.trunc(v) : parseInt(v.trim(), 10);
        return Number.isFinite(n) ? n : fallback;
    };
    const rows = clamp(read(input.rows, CUSTOM_LIMITS.minRows), CUSTOM_LIMITS.minRows, CUSTOM_LIMITS.maxRows);
    const cols = clamp(read(input.cols, CUSTOM_LIMITS.minCols), CUSTOM_LIMITS.minCols, CUSTOM_LIMITS.maxCols);
    const mines = clamp(read(input.mines, CUSTOM_LIMITS.minMines), CUSTOM_LIMITS.minMines, maxMines(rows, cols));
    return { rows, cols, mines };
}

/** The named level a field matches, or `custom`. */
export function levelOf(field: Field): Level {
    for (const level of RANKED_LEVELS) {
        const f = LEVELS[level];
        if (f.rows === field.rows && f.cols === field.cols && f.mines === field.mines) return level;
    }
    return 'custom';
}

/** The up-to-eight cells around `index`, never wrapping from one row onto the next. */
export function neighbours(field: Pick<Field, 'rows' | 'cols'>, index: number): number[] {
    const { rows, cols } = field;
    const r = Math.floor(index / cols);
    const c = index % cols;
    const out: number[] = [];
    for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
            if (dr === 0 && dc === 0) continue;
            const nr = r + dr;
            const nc = c + dc;
            if (nr >= 0 && nr < rows && nc >= 0 && nc < cols) out.push(nr * cols + nc);
        }
    }
    return out;
}

export function newGame(field: Field): Game {
    const rows = Math.max(1, Math.trunc(field.rows));
    const cols = Math.max(1, Math.trunc(field.cols));
    // At least one safe cell, or there would be no first click to protect.
    const mines = clamp(Math.trunc(field.mines), 0, rows * cols - 1);
    const blank: Cell = { mine: false, adjacent: 0, state: 'covered' };
    return {
        rows,
        cols,
        mines,
        cells: Array.from({ length: rows * cols }, () => blank),
        status: 'ready',
        laid: false,
        flags: 0,
        safeLeft: rows * cols - mines,
        exploded: [],
    };
}

/**
 * Lay the mines around a first click at `safe`.
 *
 * XP only promised that the first square clicked was not a mine: if it was, winmine quietly moved
 * that mine to the top-left corner. This keeps the stronger promise the previous version of this
 * app made — the clicked square *and its neighbours* are clear, so the first click always opens an
 * area instead of a lone number. XP's own Custom limits always leave room for that; a field too
 * crowded for it (only reachable by calling this directly) falls back to XP's promise.
 *
 * A partial Fisher-Yates shuffle over the permitted cells, so every layout is equally likely.
 * Flags placed before the first click stay where they are, as they did in XP.
 */
function lay(game: Game, safe: number, rng: () => number): Game {
    const total = game.rows * game.cols;
    const around = new Set([safe, ...neighbours(game, safe)]);
    const keepClear = total - around.size >= game.mines ? around : new Set([safe]);

    const candidates: number[] = [];
    for (let i = 0; i < total; i++) if (!keepClear.has(i)) candidates.push(i);
    for (let k = 0; k < game.mines; k++) {
        const j = Math.min(candidates.length - 1, k + Math.floor(rng() * (candidates.length - k)));
        const t = candidates[k];
        candidates[k] = candidates[j];
        candidates[j] = t;
    }

    const isMine = new Uint8Array(total);
    for (let k = 0; k < game.mines; k++) isMine[candidates[k]] = 1;
    const cells = game.cells.map((cell, i) => {
        let adjacent = 0;
        for (const n of neighbours(game, i)) adjacent += isMine[n];
        return { mine: isMine[i] === 1, adjacent, state: cell.state };
    });
    return { ...game, cells, laid: true };
}

/**
 * Uncover `start` in `cells` (a private copy) and, from every empty square reached, its
 * neighbours — winmine's flood fill. Flags stop it; question marks do not, as in XP.
 * Returns how many safe squares it uncovered.
 */
function flood(field: Field, cells: Cell[], start: number): number {
    let opened = 0;
    const stack = [start];
    while (stack.length) {
        const i = stack.pop() as number;
        const cell = cells[i];
        if (cell.mine || cell.state === 'revealed' || cell.state === 'flagged') continue;
        cells[i] = { ...cell, state: 'revealed' };
        opened++;
        if (cell.adjacent === 0) stack.push(...neighbours(field, i));
    }
    return opened;
}

/** The end of a lost game: every unflagged mine shows; flags stay, so wrong ones can be drawn crossed out. */
function lose(game: Game, cells: Cell[], hit: number[]): Game {
    for (let i = 0; i < cells.length; i++) {
        const cell = cells[i];
        if (cell.mine && cell.state !== 'flagged') cells[i] = { ...cell, state: 'revealed' };
    }
    return { ...game, cells, status: 'lost', exploded: hit };
}

/** Win if nothing safe is left covered. Winning flags every mine, which zeroes the counter. */
function settle(game: Game): Game {
    if (game.safeLeft > 0) return game.status === 'ready' ? { ...game, status: 'playing' } : game;
    const cells = game.cells.map((cell) => (cell.mine && cell.state !== 'flagged' ? { ...cell, state: 'flagged' as const } : cell));
    return { ...game, cells, status: 'won', flags: game.mines };
}

const isOver = (game: Game) => game.status === 'won' || game.status === 'lost';

/** Left-click release on a square. The first one lays the mines and can never hit one. */
export function reveal(game: Game, index: number, rng: () => number = Math.random): Game {
    if (isOver(game)) return game;
    const target = game.cells[index];
    if (!target || target.state === 'flagged' || target.state === 'revealed') return game;

    const g = game.laid ? game : lay(game, index, rng);
    const cells = g.cells.slice();
    if (cells[index].mine) return lose({ ...g, status: 'playing' }, cells, [index]);
    const opened = flood(g, cells, index);
    return settle({ ...g, cells, safeLeft: g.safeLeft - opened, status: 'playing' });
}

/** True if `index` is an uncovered number whose flag count matches it: a chord there would act. */
export function canChord(game: Game, index: number): boolean {
    const cell = game.cells[index];
    if (game.status !== 'playing' || !cell || cell.state !== 'revealed' || cell.mine || cell.adjacent === 0) return false;
    let flags = 0;
    for (const n of neighbours(game, index)) if (game.cells[n].state === 'flagged') flags++;
    return flags === cell.adjacent;
}

/**
 * The chord: both buttons, or the middle one, on an uncovered number. If the flags around it match
 * the number, every other covered neighbour is uncovered at once — and if a flag was wrong, that
 * uncovers a mine. Anything else does nothing, exactly as XP's did.
 */
export function chord(game: Game, index: number): Game {
    if (!canChord(game, index)) return game;
    const targets = neighbours(game, index).filter((n) => {
        const s = game.cells[n].state;
        return s === 'covered' || s === 'question';
    });
    if (!targets.length) return game;

    const cells = game.cells.slice();
    const hit = targets.filter((n) => cells[n].mine);
    let opened = 0;
    for (const n of targets) if (!cells[n].mine) opened += flood(game, cells, n);
    const next = { ...game, cells, safeLeft: game.safeLeft - opened };
    return hit.length ? lose(next, cells, hit) : settle(next);
}

/**
 * Right-click on a covered square: blank, then a flag, then — only while Marks (?) is on — a
 * question mark, then blank again. Allowed before the first click, as XP allowed it.
 */
export function cycleMark(game: Game, index: number, marks: boolean): Game {
    if (isOver(game)) return game;
    const cell = game.cells[index];
    if (!cell || cell.state === 'revealed') return game;
    const state: CellState = cell.state === 'covered' ? 'flagged' : cell.state === 'flagged' && marks ? 'question' : 'covered';
    const cells = game.cells.slice();
    cells[index] = { ...cell, state };
    const flags = game.flags + (state === 'flagged' ? 1 : 0) - (cell.state === 'flagged' ? 1 : 0);
    return { ...game, cells, flags };
}

/** The mine counter: mines less flags. It goes negative when there are more flags than mines. */
export const minesLeft = (game: Game): number => game.mines - game.flags;

/**
 * Three LED characters for a counter value. XP showed a negative count as a minus and two digits,
 * so it bottoms out at -99; nothing it counted ever exceeded 999.
 */
export function counterText(value: number): string {
    const v = clamp(Math.trunc(value), -99, 999);
    return v < 0 ? `-${String(-v).padStart(2, '0')}` : String(v).padStart(3, '0');
}

/** What a square looks like. `pressed` is the sunken look under a held mouse button. */
export type Tile =
    | 'covered'
    | 'pressed'
    | 'flag'
    | 'question'
    | 'question-pressed'
    | 'open-0'
    | 'open-1'
    | 'open-2'
    | 'open-3'
    | 'open-4'
    | 'open-5'
    | 'open-6'
    | 'open-7'
    | 'open-8'
    | 'mine'
    | 'exploded'
    | 'wrong-flag';

const OPEN: readonly Tile[] = ['open-0', 'open-1', 'open-2', 'open-3', 'open-4', 'open-5', 'open-6', 'open-7', 'open-8'];

export function tileAt(game: Game, index: number, pressed = false): Tile {
    const cell = game.cells[index];
    switch (cell.state) {
        case 'revealed':
            if (cell.mine) return game.exploded.includes(index) ? 'exploded' : 'mine';
            return OPEN[cell.adjacent] ?? 'open-0';
        case 'flagged':
            return game.status === 'lost' && !cell.mine ? 'wrong-flag' : 'flag';
        case 'question':
            return pressed ? 'question-pressed' : 'question';
        default:
            return pressed ? 'pressed' : 'covered';
    }
}

/** Squares a held button can press down: covered ones and question marks, never flags. */
export const pressable = (game: Game, index: number): boolean => {
    const s = game.cells[index]?.state;
    return s === 'covered' || s === 'question';
};

export type BestTimes = Partial<Record<RankedLevel, number>>;

/** Record `seconds` for `level` if it beats the time held. Custom fields were never ranked. */
export function recordBest(best: BestTimes, level: Level, seconds: number): { best: BestTimes; improved: boolean } {
    if (level === 'custom') return { best, improved: false };
    const held = best[level];
    if (held !== undefined && held <= seconds) return { best, improved: false };
    return { best: { ...best, [level]: seconds }, improved: true };
}
