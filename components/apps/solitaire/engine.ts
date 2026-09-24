/**
 * Klondike as Windows XP's sol.exe played it: the rules, the scoring and undo.
 *
 * No React, no DOM, no imports. Every function is pure: the shuffle takes its randomness as an
 * argument and every move returns a new game instead of changing the old one. That is what lets
 * the whole rulebook run under Node, and it makes undo a matter of keeping the previous board —
 * boards share their untouched piles, so a snapshot costs almost nothing.
 */

/** 0 clubs, 1 diamonds, 2 hearts, 3 spades. */
export type Suit = 0 | 1 | 2 | 3;

export interface Card {
    /** 0..51, fixed for the life of the deck: the key the view renders by and undo diffs by. */
    readonly id: number;
    readonly suit: Suit;
    /** 1 (Ace) to 13 (King). */
    readonly rank: number;
    readonly faceUp: boolean;
}

export type PileRef =
    | { readonly kind: 'stock' }
    | { readonly kind: 'waste' }
    | { readonly kind: 'foundation'; readonly index: number }
    | { readonly kind: 'tableau'; readonly index: number };

/** Every pile lists its cards bottom first: the last element is the one on top. */
export interface Board {
    readonly stock: readonly Card[];
    readonly waste: readonly Card[];
    readonly foundations: readonly (readonly Card[])[];
    readonly tableau: readonly (readonly Card[])[];
    /**
     * Cards of the latest draw still fanned out on the waste. Draw Three shows up to three, and
     * after the fanned cards are played the waste shows its top card alone until the next draw.
     */
    readonly wasteFan: number;
    /** Times the waste has been turned back into the stock this deal. */
    readonly recycles: number;
}

export type DrawCount = 1 | 3;
export type Scoring = 'standard' | 'vegas' | 'none';

export interface Rules {
    readonly draw: DrawCount;
    readonly scoring: Scoring;
}

interface UndoStep {
    readonly board: Board;
    /** The change the move actually made to the score, after the floor at zero. */
    readonly delta: number;
}

export interface Game {
    readonly rules: Rules;
    readonly board: Board;
    readonly score: number;
    readonly history: readonly UndoStep[];
    /** Cards the last action moved between places; the view lifts them while they glide. */
    readonly moved: readonly number[];
    readonly won: boolean;
}

export type Move =
    | { readonly type: 'draw' }
    | { readonly type: 'recycle' }
    | { readonly type: 'turn'; readonly column: number }
    | { readonly type: 'move'; readonly from: PileRef; readonly index: number; readonly to: PileRef };

export const STOCK: PileRef = { kind: 'stock' };
export const WASTE: PileRef = { kind: 'waste' };
export const foundation = (index: number): PileRef => ({ kind: 'foundation', index });
export const tableau = (index: number): PileRef => ({ kind: 'tableau', index });

export const isRed = (card: Card) => card.suit === 1 || card.suit === 2;
export const VEGAS_ANTE = 52;

// ---- deck --------------------------------------------------------------------------------------

export function createDeck(): Card[] {
    const deck: Card[] = [];
    for (let suit = 0; suit < 4; suit++) {
        for (let rank = 1; rank <= 13; rank++) {
            deck.push({ id: suit * 13 + rank - 1, suit: suit as Suit, rank, faceUp: false });
        }
    }
    return deck;
}

/** Fisher–Yates. `randomInt(n)` must return an integer in [0, n). */
export function shuffle<T>(items: readonly T[], randomInt: (n: number) => number): T[] {
    const a = items.slice();
    for (let i = a.length - 1; i > 0; i--) {
        const j = randomInt(i + 1);
        const t = a[i];
        a[i] = a[j];
        a[j] = t;
    }
    return a;
}

/**
 * Deals the way a person deals Klondike: across the row one card per column, each row starting
 * one column further right, the last card of each column face up. `deck[0]` is dealt first; the
 * 24 left over become the stock, whose top — the first card drawn — is `deck[51]`.
 */
export function deal(deck: readonly Card[]): Board {
    const columns: Card[][] = [[], [], [], [], [], [], []];
    let k = 0;
    for (let row = 0; row < 7; row++) {
        for (let col = row; col < 7; col++) columns[col].push({ ...deck[k++], faceUp: row === col });
    }
    return {
        stock: deck.slice(k).map((c) => ({ ...c, faceUp: false })),
        waste: [],
        foundations: [[], [], [], []],
        tableau: columns,
        wasteFan: 0,
        recycles: 0,
    };
}

/** Vegas starts $52 down, or carries a cumulative total the caller passes in. */
export function newGame(rules: Rules, deck: readonly Card[], startScore?: number): Game {
    return {
        rules,
        board: deal(deck),
        score: startScore ?? (rules.scoring === 'vegas' ? -VEGAS_ANTE : 0),
        history: [],
        moved: [],
        won: false,
    };
}

// ---- reading the board -------------------------------------------------------------------------

export function pileOf(board: Board, ref: PileRef): readonly Card[] {
    switch (ref.kind) {
        case 'stock':
            return board.stock;
        case 'waste':
            return board.waste;
        case 'foundation':
            return board.foundations[ref.index] ?? [];
        case 'tableau':
            return board.tableau[ref.index] ?? [];
    }
}

export function samePile(a: PileRef, b: PileRef): boolean {
    if (a.kind !== b.kind) return false;
    if ((a.kind === 'foundation' || a.kind === 'tableau') && (b.kind === 'foundation' || b.kind === 'tableau')) {
        return a.index === b.index;
    }
    return true;
}

export const isWon = (board: Board) => board.foundations.every((f) => f.length === 13);

/** Whether the cards from `index` up can be lifted: any face-up tableau run, or a single top card. */
export function canPick(board: Board, from: PileRef, index: number): boolean {
    const pile = pileOf(board, from);
    if (index < 0 || index >= pile.length) return false;
    switch (from.kind) {
        case 'stock':
            return false;
        case 'waste':
        case 'foundation':
            return index === pile.length - 1;
        case 'tableau':
            return pile[index].faceUp;
    }
}

/**
 * Tableau: alternate colours, one rank lower, and only a King (or a run led by one) on an empty
 * column. Foundation: one card at a time, same suit, one rank higher, an Ace to start.
 */
export function canDrop(board: Board, cards: readonly Card[], to: PileRef): boolean {
    const lead = cards[0];
    if (!lead) return false;
    if (to.kind === 'foundation') {
        const pile = board.foundations[to.index];
        if (!pile || cards.length !== 1) return false;
        const top = pile[pile.length - 1];
        return top ? top.suit === lead.suit && lead.rank === top.rank + 1 : lead.rank === 1;
    }
    if (to.kind === 'tableau') {
        const pile = board.tableau[to.index];
        if (!pile) return false;
        const top = pile[pile.length - 1];
        return top ? top.faceUp && isRed(top) !== isRed(lead) && top.rank === lead.rank + 1 : lead.rank === 13;
    }
    return false;
}

/** The foundation a single card can go to right now, or -1. */
export function foundationFor(board: Board, card: Card): number {
    for (let f = 0; f < 4; f++) if (canDrop(board, [card], foundation(f))) return f;
    return -1;
}

/** Recycles still allowed this deal. Vegas allows one pass in Draw One and three in Draw Three. */
export function recyclesLeft(game: Game): number {
    if (game.rules.scoring !== 'vegas') return Infinity;
    const passes = game.rules.draw === 1 ? 1 : 3;
    return Math.max(0, passes - 1 - game.board.recycles);
}

// ---- scoring -----------------------------------------------------------------------------------

/** sol.exe's scoring for a card moving between piles. */
function moveScore(rules: Rules, from: PileRef, to: PileRef): number {
    if (rules.scoring === 'standard') {
        if (from.kind === 'waste' && to.kind === 'tableau') return 5;
        if ((from.kind === 'waste' || from.kind === 'tableau') && to.kind === 'foundation') return 10;
        if (from.kind === 'foundation' && to.kind === 'tableau') return -15;
        return 0;
    }
    if (rules.scoring === 'vegas') {
        const into = to.kind === 'foundation';
        const outOf = from.kind === 'foundation';
        if (into === outOf) return 0;
        return into ? 5 : -5;
    }
    return 0;
}

/** Standard scoring never shows a negative score; Vegas is money and can. */
const clampScore = (rules: Rules, score: number) => (rules.scoring === 'standard' ? Math.max(0, score) : score);

/** Standard, timed: two points off for every ten seconds of play. Not a move, so not undoable. */
export function penalize(game: Game, points: number): Game {
    if (game.won || game.rules.scoring !== 'standard' || points <= 0) return game;
    const score = clampScore(game.rules, game.score - points);
    return score === game.score ? game : { ...game, score };
}

/** A timed Standard win longer than 30 seconds earns 700,000 divided by the seconds taken. */
export const timeBonus = (seconds: number) => (seconds > 30 ? Math.floor(700000 / seconds) : 0);

export const addPoints = (game: Game, points: number): Game =>
    points ? { ...game, score: clampScore(game.rules, game.score + points) } : game;

// ---- moves -------------------------------------------------------------------------------------

function withPile(board: Board, ref: PileRef, cards: readonly Card[]): Board {
    switch (ref.kind) {
        case 'stock':
            return { ...board, stock: cards };
        case 'waste':
            return { ...board, waste: cards };
        case 'foundation':
            return { ...board, foundations: board.foundations.map((p, i) => (i === ref.index ? cards : p)) };
        case 'tableau':
            return { ...board, tableau: board.tableau.map((p, i) => (i === ref.index ? cards : p)) };
    }
}

/** Where every card is, as a comparable string per id. */
function locations(board: Board): string[] {
    const at: string[] = [];
    const mark = (pile: readonly Card[], key: string) =>
        pile.forEach((c, i) => {
            at[c.id] = `${key}${i}`;
        });
    mark(board.stock, 's:');
    mark(board.waste, 'w:');
    board.foundations.forEach((p, f) => mark(p, `f${f}:`));
    board.tableau.forEach((p, t) => mark(p, `t${t}:`));
    return at;
}

/** Ids of the cards whose pile or position differs between two boards. */
export function movedBetween(before: Board, after: Board): number[] {
    const a = locations(before);
    const b = locations(after);
    const ids: number[] = [];
    for (let id = 0; id < b.length; id++) if (b[id] !== undefined && a[id] !== b[id]) ids.push(id);
    return ids;
}

function commit(game: Game, board: Board, delta: number): Game {
    const score = clampScore(game.rules, game.score + delta);
    return {
        ...game,
        board,
        score,
        history: [...game.history, { board: game.board, delta: score - game.score }],
        moved: movedBetween(game.board, board),
        won: isWon(board),
    };
}

/** Plays one move. Returns the new game, or null when the move is not legal. */
export function apply(game: Game, move: Move): Game | null {
    if (game.won) return null;
    const b = game.board;

    switch (move.type) {
        case 'draw': {
            if (!b.stock.length) return null;
            const n = Math.min(game.rules.draw, b.stock.length);
            // Turned over as a packet: the deepest of the n ends up on top of the waste.
            const drawn = b.stock
                .slice(b.stock.length - n)
                .reverse()
                .map((c) => ({ ...c, faceUp: true }));
            return commit(game, { ...b, stock: b.stock.slice(0, b.stock.length - n), waste: [...b.waste, ...drawn], wasteFan: n }, 0);
        }

        case 'recycle': {
            if (b.stock.length || !b.waste.length || recyclesLeft(game) <= 0) return null;
            // The whole waste turns over, so the next pass deals the cards in the same order.
            const stock = b.waste
                .slice()
                .reverse()
                .map((c) => ({ ...c, faceUp: false }));
            const delta = game.rules.scoring === 'standard' ? (game.rules.draw === 1 ? -100 : -20) : 0;
            return commit(game, { ...b, stock, waste: [], wasteFan: 0, recycles: b.recycles + 1 }, delta);
        }

        case 'turn': {
            const column = b.tableau[move.column];
            const top = column?.[column.length - 1];
            if (!column || !top || top.faceUp) return null;
            const turned = [...column.slice(0, -1), { ...top, faceUp: true }];
            return commit(game, withPile(b, tableau(move.column), turned), game.rules.scoring === 'standard' ? 5 : 0);
        }

        case 'move': {
            const { from, index, to } = move;
            if (samePile(from, to) || !canPick(b, from, index)) return null;
            const source = pileOf(b, from);
            const cards = source.slice(index);
            if (!canDrop(b, cards, to)) return null;
            let board = withPile(b, from, source.slice(0, index));
            board = withPile(board, to, [...pileOf(board, to), ...cards]);
            if (from.kind === 'waste') {
                board = { ...board, wasteFan: board.waste.length ? Math.max(1, b.wasteFan - 1) : 0 };
            }
            return commit(game, board, moveScore(game.rules, from, to));
        }
    }
}

/** Takes back the last move, score included. Nothing to undo once the game is won. */
export function undo(game: Game): Game | null {
    const last = game.history[game.history.length - 1];
    if (!last || game.won) return null;
    return {
        ...game,
        board: last.board,
        score: clampScore(game.rules, game.score - last.delta),
        history: game.history.slice(0, -1),
        moved: movedBetween(game.board, last.board),
        won: false,
    };
}

/** Double-click: the card on top of `from` goes to a foundation if one takes it. */
export function sendHome(game: Game, from: PileRef): Game | null {
    const pile = pileOf(game.board, from);
    const top = pile[pile.length - 1];
    if (!top || !top.faceUp || from.kind === 'foundation' || from.kind === 'stock') return null;
    const f = foundationFor(game.board, top);
    return f < 0 ? null : apply(game, { type: 'move', from, index: pile.length - 1, to: foundation(f) });
}

/** The next card auto-play would send up: the waste's top first, then the columns left to right. */
export function nextAutoMove(board: Board): Move | null {
    const sources: PileRef[] = [WASTE, ...board.tableau.map((_, i) => tableau(i))];
    for (const from of sources) {
        const pile = pileOf(board, from);
        const top = pile[pile.length - 1];
        if (!top || !top.faceUp) continue;
        const f = foundationFor(board, top);
        if (f >= 0) return { type: 'move', from, index: pile.length - 1, to: foundation(f) };
    }
    return null;
}

/**
 * Right-click: send up every card that can go, repeating until none can. Face-down cards it
 * uncovers stay face down, as they did in XP. The whole sweep is one undo step.
 */
export function autoPlay(game: Game): Game | null {
    let g = game;
    for (let guard = 0; guard < 52; guard++) {
        const move = nextAutoMove(g.board);
        const next = move && apply(g, move);
        if (!next) break;
        g = next;
    }
    if (g === game) return null;
    return {
        ...g,
        history: [...game.history, { board: game.board, delta: g.score - game.score }],
        moved: movedBetween(game.board, g.board),
    };
}
