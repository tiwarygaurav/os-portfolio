/**
 * Minesweeper's rules, headless: XP's levels and the Custom Field's limits, a first click that is
 * never a mine, adjacency counts, flood fill, Marks, chording (including setting off a mine
 * through a wrong flag), winning, losing and best times. `components/apps/minesweeper/engine.ts`
 * is pure, so all of it runs without a browser.
 */
const test = require('node:test');
const assert = require('node:assert/strict');

const E = require('../../.test-out/components/apps/minesweeper/engine.js');

/** Deterministic PRNG (mulberry32). */
function rng(seed) {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

const idx = (g, r, c) => r * g.cols + c;
const mineCount = (g) => g.cells.filter((c) => c.mine).length;

/** A laid game with mines at exactly `mines` ([r,c] pairs), built through the public API. */
function fixed(rows, cols, mines, firstClick) {
    // Lay by revealing with an rng that selects the requested cells: easier to construct directly.
    const g = E.newGame({ rows, cols, mines: mines.length });
    const set = new Set(mines.map(([r, c]) => r * cols + c));
    const cells = g.cells.map((cell, i) => {
        let adjacent = 0;
        for (const n of E.neighbours(g, i)) if (set.has(n)) adjacent++;
        return { mine: set.has(i), adjacent, state: 'covered' };
    });
    const laid = { ...g, cells, laid: true, status: 'playing' };
    return firstClick ? E.reveal(laid, idx(laid, firstClick[0], firstClick[1])) : laid;
}

// ---- levels and custom clamping ------------------------------------------------------------------
test('level configs match XP', () => {
    assert.deepStrictEqual(E.LEVELS.beginner, { rows: 9, cols: 9, mines: 10 });
    assert.deepStrictEqual(E.LEVELS.intermediate, { rows: 16, cols: 16, mines: 40 });
    assert.deepStrictEqual(E.LEVELS.expert, { rows: 16, cols: 30, mines: 99 });
    assert.strictEqual(E.levelOf({ rows: 16, cols: 30, mines: 99 }), 'expert');
    assert.strictEqual(E.levelOf({ rows: 16, cols: 30, mines: 98 }), 'custom');
});
test('custom: height 9..24, width 9..30', () => {
    assert.deepStrictEqual(E.clampCustom({ rows: 3, cols: 100, mines: 10 }), { rows: 9, cols: 30, mines: 10 });
    assert.deepStrictEqual(E.clampCustom({ rows: 99, cols: 2, mines: 10 }), { rows: 24, cols: 9, mines: 10 });
});
test('custom: mines 10..(h-1)(w-1)', () => {
    assert.deepStrictEqual(E.clampCustom({ rows: 9, cols: 9, mines: 500 }), { rows: 9, cols: 9, mines: 64 });
    assert.deepStrictEqual(E.clampCustom({ rows: 24, cols: 30, mines: 999 }), { rows: 24, cols: 30, mines: 667 });
    assert.deepStrictEqual(E.clampCustom({ rows: 10, cols: 10, mines: 1 }), { rows: 10, cols: 10, mines: 10 });
});
test('custom: text entries parse; garbage and blanks become the minimum', () => {
    assert.deepStrictEqual(E.clampCustom({ rows: ' 12 ', cols: '20', mines: '30' }), { rows: 12, cols: 20, mines: 30 });
    assert.deepStrictEqual(E.clampCustom({ rows: 'abc', cols: '', mines: '-5' }), { rows: 9, cols: 9, mines: 10 });
    assert.deepStrictEqual(E.clampCustom({ rows: '12.9', cols: '15x', mines: '9999' }), { rows: 12, cols: 15, mines: 154 });
});

// ---- first click ---------------------------------------------------------------------------------
test('first click is never a mine and opens an area (1000 seeds x 3 levels, random click)', () => {
    for (const level of ['beginner', 'intermediate', 'expert']) {
        for (let s = 1; s <= 1000; s++) {
            const r = rng(s * 7 + level.length);
            const g0 = E.newGame(E.LEVELS[level]);
            const click = Math.floor(r() * g0.cells.length);
            const g = E.reveal(g0, click, r);
            assert.ok(!g.cells[click].mine, `mine under first click (${level}, seed ${s})`);
            assert.strictEqual(g.cells[click].adjacent, 0, 'first click should open an area');
            for (const n of E.neighbours(g, click)) assert.ok(!g.cells[n].mine, 'mine next to first click');
            assert.strictEqual(mineCount(g), g.mines, 'wrong number of mines laid');
            assert.notStrictEqual(g.status, 'lost');
        }
    }
});
test('crowded custom field (9x9, 64 mines) still keeps the first click safe', () => {
    for (let s = 1; s <= 300; s++) {
        const r = rng(s);
        const g0 = E.newGame({ rows: 9, cols: 9, mines: 64 });
        const click = Math.floor(r() * 81);
        const g = E.reveal(g0, click, r);
        assert.ok(!g.cells[click].mine);
        assert.strictEqual(mineCount(g), 64);
    }
});
test('over-crowded field falls back to keeping only the clicked square clear', () => {
    const g = E.reveal(E.newGame({ rows: 3, cols: 3, mines: 8 }), 4, rng(1));
    assert.ok(!g.cells[4].mine);
    assert.strictEqual(mineCount(g), 8);
    assert.strictEqual(g.status, 'won', 'the only safe square was opened');
});
test('an rng returning 1.0 does not break placement', () => {
    const g = E.reveal(E.newGame(E.LEVELS.expert), 0, () => 0.9999999999999999);
    assert.strictEqual(mineCount(g), 99);
});
test('mines are not laid until the first reveal; flags before it are kept', () => {
    let g = E.newGame(E.LEVELS.beginner);
    assert.strictEqual(g.laid, false);
    g = E.cycleMark(g, 80, true);
    assert.strictEqual(g.status, 'ready');
    assert.strictEqual(g.flags, 1);
    g = E.reveal(g, 0, rng(3));
    assert.strictEqual(g.laid, true);
    assert.strictEqual(g.cells[80].state, 'flagged');
});

// ---- counts and flood fill -----------------------------------------------------------------------
test('adjacent counts are correct on random fields', () => {
    for (let s = 1; s <= 200; s++) {
        const g = E.reveal(E.newGame(E.LEVELS.expert), 200, rng(s));
        g.cells.forEach((cell, i) => {
            const expected = E.neighbours(g, i).filter((n) => g.cells[n].mine).length;
            assert.strictEqual(cell.adjacent, expected, `cell ${i}`);
        });
    }
});
test('neighbours never wrap across rows', () => {
    const f = { rows: 3, cols: 4 };
    assert.deepStrictEqual(E.neighbours(f, 3).sort((a, b) => a - b), [2, 6, 7]);
    assert.deepStrictEqual(E.neighbours(f, 4).sort((a, b) => a - b), [0, 1, 5, 8, 9]);
    assert.strictEqual(E.neighbours(f, 5).length, 8);
});
test('flood fill opens exactly the connected empty region and its border', () => {
    // 5x5, one mine in the bottom-right corner.
    const g = fixed(5, 5, [[4, 4]], [0, 0]);
    const opened = g.cells.filter((c) => c.state === 'revealed').length;
    assert.strictEqual(opened, 24, 'everything but the mine opens');
    assert.strictEqual(g.status, 'won');
    assert.strictEqual(g.cells[idx(g, 4, 4)].state, 'flagged', 'win auto-flags the mine');
    assert.strictEqual(g.flags, 1);
});
test('flood fill stops at numbers and at flags, passes question marks', () => {
    // 5x5, mines down column 2 except the middle: the left region is walled off.
    let g = fixed(5, 5, [[0, 2], [1, 2], [3, 2], [4, 2]]);
    g = E.cycleMark(g, idx(g, 2, 0), true); // flag
    g = E.cycleMark(g, idx(g, 1, 0), true);
    g = E.cycleMark(g, idx(g, 1, 0), true); // question mark on a square the fill reaches
    g = E.reveal(g, idx(g, 0, 0));
    assert.strictEqual(g.cells[idx(g, 2, 0)].state, 'flagged', 'flag not opened by the fill');
    assert.strictEqual(g.cells[idx(g, 0, 1)].state, 'revealed');
    assert.strictEqual(g.cells[idx(g, 0, 3)].state, 'covered', 'fill crossed the wall');
    assert.strictEqual(g.cells[idx(g, 1, 0)].state, 'revealed', 'question mark opened by the fill');
    assert.strictEqual(g.cells[idx(g, 3, 0)].state, 'covered', 'fill went through the flag');
});
test('reveal ignores flags and already-open squares', () => {
    let g = fixed(5, 5, [[4, 4]]);
    g = E.cycleMark(g, 0, true);
    assert.strictEqual(E.reveal(g, 0), g);
});

// ---- marks ---------------------------------------------------------------------------------------
test('right-click cycles flag -> ? -> blank with Marks on, flag -> blank with it off', () => {
    let g = fixed(5, 5, [[4, 4]]);
    const i = idx(g, 4, 4);
    g = E.cycleMark(g, i, true);
    assert.strictEqual(g.cells[i].state, 'flagged');
    assert.strictEqual(E.minesLeft(g), 0);
    g = E.cycleMark(g, i, true);
    assert.strictEqual(g.cells[i].state, 'question');
    assert.strictEqual(E.minesLeft(g), 1);
    g = E.cycleMark(g, i, true);
    assert.strictEqual(g.cells[i].state, 'covered');
    g = E.cycleMark(g, i, false);
    g = E.cycleMark(g, i, false);
    assert.strictEqual(g.cells[i].state, 'covered');
    assert.strictEqual(g.flags, 0);
});
test('mine counter goes negative with too many flags', () => {
    let g = fixed(5, 5, [[4, 4]]);
    g = E.cycleMark(g, 0, true);
    g = E.cycleMark(g, 1, true);
    assert.strictEqual(E.minesLeft(g), -1);
    assert.strictEqual(E.counterText(E.minesLeft(g)), '-01');
});

// ---- chording ------------------------------------------------------------------------------------
// 3x3 with a single mine at the top-left: the centre shows 1.
test('chord reveals the other neighbours when flags match', () => {
    let g = fixed(4, 4, [[0, 0]]);
    g = E.reveal(g, idx(g, 1, 1));
    assert.strictEqual(g.cells[idx(g, 1, 1)].adjacent, 1);
    assert.strictEqual(g.cells[idx(g, 0, 1)].state, 'covered');
    g = E.cycleMark(g, idx(g, 0, 0), true);
    g = E.chord(g, idx(g, 1, 1));
    assert.strictEqual(g.status, 'won', 'chord opened every safe square');
});
test('chord does nothing when flags do not match the number', () => {
    let g = fixed(4, 4, [[0, 0]]);
    g = E.reveal(g, idx(g, 1, 1));
    assert.strictEqual(E.chord(g, idx(g, 1, 1)), g, 'no flags: no chord');
    const two = E.cycleMark(E.cycleMark(g, idx(g, 0, 0), true), idx(g, 0, 1), true);
    assert.strictEqual(E.chord(two, idx(g, 1, 1)), two, 'too many flags: no chord');
    assert.ok(!E.canChord(g, idx(g, 1, 1)));
});
test('chord on a covered square, an empty square or before the game does nothing', () => {
    const g0 = E.newGame(E.LEVELS.beginner);
    assert.strictEqual(E.chord(g0, 0), g0);
    let g = fixed(5, 5, [[4, 4]]);
    assert.strictEqual(E.chord(g, 0), g);
    g = fixed(6, 6, [[5, 5], [5, 4]], [0, 0]);
    assert.strictEqual(E.chord(g, 0), g, 'an empty square has nothing to chord');
});
test('chord with a wrong flag sets off the mine it uncovers', () => {
    let g = fixed(4, 4, [[0, 0]]);
    g = E.reveal(g, idx(g, 1, 1));
    g = E.cycleMark(g, idx(g, 0, 1), true); // wrong flag
    g = E.chord(g, idx(g, 1, 1));
    assert.strictEqual(g.status, 'lost');
    assert.deepStrictEqual(g.exploded, [idx(g, 0, 0)]);
    assert.strictEqual(E.tileAt(g, idx(g, 0, 0)), 'exploded');
    assert.strictEqual(E.tileAt(g, idx(g, 0, 1)), 'wrong-flag');
});

// ---- win and loss --------------------------------------------------------------------------------
test('stepping on a mine loses and shows every unflagged mine', () => {
    let g = fixed(5, 5, [[0, 4], [4, 4], [4, 0]]);
    g = E.reveal(g, idx(g, 3, 3)); // a number: the game is on, nothing floods
    assert.strictEqual(g.status, 'playing');
    g = E.cycleMark(g, idx(g, 4, 4), true); // right flag
    const target = idx(g, 0, 4);
    g = E.reveal(g, target);
    assert.strictEqual(g.status, 'lost');
    assert.strictEqual(E.tileAt(g, target), 'exploded');
    assert.strictEqual(E.tileAt(g, idx(g, 4, 0)), 'mine');
    assert.strictEqual(E.tileAt(g, idx(g, 4, 4)), 'flag', 'a correct flag stays a flag');
    // Once lost, nothing moves.
    assert.strictEqual(E.reveal(g, 1), g);
    assert.strictEqual(E.cycleMark(g, 1, true), g);
});
test('win when every safe square is open, even with no flags placed', () => {
    let g = fixed(3, 3, [[0, 0]]);
    for (let i = 1; i < 9; i++) g = E.reveal(g, i);
    assert.strictEqual(g.status, 'won');
    assert.strictEqual(g.safeLeft, 0);
    assert.strictEqual(E.minesLeft(g), 0);
    assert.strictEqual(E.tileAt(g, 0), 'flag');
});
test('not won while one safe square is covered', () => {
    let g = fixed(1, 3, [[0, 0]]);
    g = E.reveal(g, 1); // a 1: the empty square beside it stays covered
    assert.strictEqual(g.status, 'playing');
    assert.strictEqual(g.safeLeft, 1);
});
test('random full games: revealing every safe square in random order always wins', () => {
    for (let s = 1; s <= 200; s++) {
        const r = rng(s);
        let g = E.reveal(E.newGame(E.LEVELS.intermediate), Math.floor(r() * 256), r);
        const order = g.cells.map((_, i) => i).filter((i) => !g.cells[i].mine).sort(() => r() - 0.5);
        for (const i of order) g = E.reveal(g, i);
        assert.strictEqual(g.status, 'won', `seed ${s}`);
    }
});

// ---- display helpers -----------------------------------------------------------------------------
test('counterText', () => {
    assert.strictEqual(E.counterText(0), '000');
    assert.strictEqual(E.counterText(7), '007');
    assert.strictEqual(E.counterText(99), '099');
    assert.strictEqual(E.counterText(1234), '999');
    assert.strictEqual(E.counterText(-5), '-05');
    assert.strictEqual(E.counterText(-150), '-99');
});
test('tileAt: pressed looks, marks, numbers', () => {
    let g = fixed(4, 4, [[0, 0]]);
    assert.strictEqual(E.tileAt(g, 5), 'covered');
    assert.strictEqual(E.tileAt(g, 5, true), 'pressed');
    g = E.cycleMark(E.cycleMark(g, 5, true), 5, true);
    assert.strictEqual(E.tileAt(g, 5), 'question');
    assert.strictEqual(E.tileAt(g, 5, true), 'question-pressed');
    g = E.reveal(g, 5);
    assert.strictEqual(E.tileAt(g, 5), 'open-1');
    assert.ok(!E.pressable(g, 5));
});
test('recordBest keeps the faster time and never ranks Custom', () => {
    let { best, improved } = E.recordBest({}, 'beginner', 30);
    assert.ok(improved);
    assert.deepStrictEqual(best, { beginner: 30 });
    ({ best, improved } = E.recordBest(best, 'beginner', 31));
    assert.ok(!improved);
    ({ best, improved } = E.recordBest(best, 'beginner', 12));
    assert.deepStrictEqual(best, { beginner: 12 });
    ({ best, improved } = E.recordBest(best, 'custom', 1));
    assert.ok(!improved);
});
test('newGame never lets mines fill the field', () => {
    const g = E.newGame({ rows: 2, cols: 2, mines: 50 });
    assert.strictEqual(g.mines, 3);
    assert.strictEqual(g.safeLeft, 1);
});
