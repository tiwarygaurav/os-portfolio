/**
 * Solitaire's rules, headless: the deal, legal and illegal moves, Draw Three and Vegas pass
 * limits, both scoring systems and the time bonus, undo back to the exact deal, auto-play and the
 * win. `components/apps/solitaire/engine.ts` is pure, so all of it runs without a browser.
 */
const test = require('node:test');
const assert = require('node:assert/strict');

const E = require('../../.test-out/components/apps/solitaire/engine.js');

// ---- builders ------------------------------------------------------------------------------------
const SUIT = { C: 0, D: 1, H: 2, S: 3 };
const RANK = { A: 1, J: 11, Q: 12, K: 13 };
/** card('7S') face up, card('7S', false) face down. */
function card(code, up = true) {
    const s = SUIT[code.slice(-1)];
    const r = RANK[code.slice(0, -1)] ?? Number(code.slice(0, -1));
    return { id: s * 13 + r - 1, suit: s, rank: r, faceUp: up };
}
const cards = (codes, up = true) => codes.map((c) => card(c, up));
function board({ stock = [], waste = [], foundations = [[], [], [], []], tableau = [[], [], [], [], [], [], []], wasteFan = 0, recycles = 0 } = {}) {
    return { stock, waste, foundations, tableau, wasteFan, recycles };
}
const game = (b, rules = { draw: 1, scoring: 'standard' }, score = 0) => ({ rules, board: b, score, history: [], moved: [], won: false });
const T = E.tableau;
const F = E.foundation;
const mv = (from, index, to) => ({ type: 'move', from, index, to });
function seeded(seed) {
    let s = seed >>> 0;
    return (n) => {
        s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
        return Math.floor((s / 4294967296) * n);
    };
}
const allIds = (b) => [b.stock, b.waste, ...b.foundations, ...b.tableau].flat().map((c) => c.id);
const CODES = ['', 'A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
/** A foundation holding `suit` from Ace up to `upTo`. */
const run = (suit, upTo) => Array.from({ length: upTo }, (_, i) => card(`${CODES[i + 1]}${suit}`));

// ---- Deal ----------------------------------------------------------------------------------------
test('deals 1..7 cards per column, top face up, 24 face-down in the stock, 52 unique', () => {
    const g = E.newGame({ draw: 3, scoring: 'standard' }, E.shuffle(E.createDeck(), seeded(1)));
    assert.deepStrictEqual(g.board.tableau.map((c) => c.length), [1, 2, 3, 4, 5, 6, 7]);
    g.board.tableau.forEach((col) => col.forEach((c, i) => assert.strictEqual(c.faceUp, i === col.length - 1)));
    assert.strictEqual(g.board.stock.length, 24);
    assert.ok(g.board.stock.every((c) => !c.faceUp));
    assert.strictEqual(new Set(allIds(g.board)).size, 52);
    assert.strictEqual(g.score, 0);
});
test('deals across the rows; deck[51] is the stock top', () => {
    const deck = E.createDeck();
    const b = E.deal(deck);
    assert.strictEqual(b.tableau[0][0].id, deck[0].id);
    assert.strictEqual(b.tableau[1][0].id, deck[1].id);
    assert.strictEqual(b.tableau[6][0].id, deck[6].id);
    assert.strictEqual(b.tableau[1][1].id, deck[7].id);
    assert.strictEqual(b.tableau[6][6].id, deck[27].id);
    assert.strictEqual(b.stock[b.stock.length - 1].id, deck[51].id);
});
test('the shuffle is a permutation and deterministic for a given source', () => {
    const a = E.shuffle(E.createDeck(), seeded(42)).map((c) => c.id);
    const b = E.shuffle(E.createDeck(), seeded(42)).map((c) => c.id);
    assert.deepStrictEqual(a, b);
    assert.deepStrictEqual([...a].sort((x, y) => x - y), Array.from({ length: 52 }, (_, i) => i));
    assert.notDeepStrictEqual(a, Array.from({ length: 52 }, (_, i) => i));
});
test('Vegas starts at -52, or at a carried cumulative total', () => {
    assert.strictEqual(E.newGame({ draw: 1, scoring: 'vegas' }, E.createDeck()).score, -52);
    assert.strictEqual(E.newGame({ draw: 1, scoring: 'vegas' }, E.createDeck(), -37).score, -37);
});

// ---- Legal and illegal drops ---------------------------------------------------------------------
test('alternating colour, one rank lower', () => {
    const b = board({ tableau: [[card('8H')], [], [], [], [], [], []] });
    assert.ok(E.canDrop(b, [card('7S')], T(0)));
    assert.ok(E.canDrop(b, [card('7C')], T(0)));
    assert.ok(!E.canDrop(b, [card('7D')], T(0)), 'red on red');
    assert.ok(!E.canDrop(b, [card('6S')], T(0)), 'two ranks lower');
    assert.ok(!E.canDrop(b, [card('9S')], T(0)), 'higher');
});
test('nothing lands on a face-down card', () => {
    const b = board({ tableau: [[card('8H', false)], [], [], [], [], [], []] });
    assert.ok(!E.canDrop(b, [card('7S')], T(0)));
});
test('only a King, or a run headed by one, fills an empty column', () => {
    const b = board();
    assert.ok(E.canDrop(b, [card('KS')], T(3)));
    assert.ok(E.canDrop(b, cards(['KD', 'QS', 'JH']), T(3)));
    assert.ok(!E.canDrop(b, [card('QS')], T(3)));
    assert.ok(!E.canDrop(b, cards(['QH', 'JS']), T(3)));
});
test('only an Ace starts a foundation; then same suit, one higher, one card at a time', () => {
    const b = board({ foundations: [[card('AH')], [], [], []] });
    assert.ok(E.canDrop(b, [card('AS')], F(1)));
    assert.ok(!E.canDrop(b, [card('2S')], F(1)), 'two on empty');
    assert.ok(E.canDrop(b, [card('2H')], F(0)));
    assert.ok(!E.canDrop(b, [card('2D')], F(0)), 'wrong suit');
    assert.ok(!E.canDrop(b, [card('3H')], F(0)), 'skips a rank');
    assert.ok(!E.canDrop(b, cards(['2H', 'AS']), F(0)), 'two cards at once');
});
test('illegal moves return null and change nothing', () => {
    const b = board({ waste: cards(['5D', '9C']), tableau: [[card('8H')], [card('4C', false), card('7D')], [], [], [], [], []] });
    const g = game(b);
    assert.strictEqual(E.apply(g, mv(T(1), 0, T(0))), null, 'face-down card cannot be picked');
    assert.strictEqual(E.apply(g, mv(E.WASTE, 0, T(0))), null, 'only the top of the waste');
    assert.strictEqual(E.apply(g, mv(T(1), 1, T(0))), null, 'red 7 on red 8');
    assert.strictEqual(E.apply(g, mv(T(0), 0, T(0))), null, 'same pile');
    assert.strictEqual(E.apply(g, mv(E.WASTE, 1, E.WASTE)), null, 'onto the waste');
    assert.strictEqual(E.apply(g, mv(E.WASTE, 1, E.STOCK)), null, 'onto the stock');
    assert.strictEqual(g.board, b);
});
test('a face-up run moves together and keeps its order', () => {
    const g = game(board({ tableau: [[card('8H')], [card('2C', false), card('7S'), card('6D'), card('5C')], [], [], [], [], []] }));
    const n = E.apply(g, mv(T(1), 1, T(0)));
    assert.deepStrictEqual(n.board.tableau[0].map(E.isRed), [true, false, true, false]);
    assert.deepStrictEqual(n.board.tableau[0].map((c) => c.rank), [8, 7, 6, 5]);
    assert.strictEqual(n.board.tableau[1].length, 1);
    assert.strictEqual(n.board.tableau[1][0].faceUp, false, 'uncovered card stays face down until clicked');
});

// ---- Stock, waste and passes ---------------------------------------------------------------------
test('Draw Three turns three over as a packet and fans them', () => {
    const stock = cards(['2C', '3C', '4C', '5C', '6C', '7C', '8C'], false); // 8C on top
    const g1 = E.apply(game(board({ stock }), { draw: 3, scoring: 'standard' }), { type: 'draw' });
    assert.deepStrictEqual(g1.board.waste.map((c) => c.rank), [8, 7, 6]);
    assert.ok(g1.board.waste.every((c) => c.faceUp));
    assert.strictEqual(g1.board.wasteFan, 3);
    const g2 = E.apply(g1, { type: 'draw' });
    const g3 = E.apply(g2, { type: 'draw' });
    assert.deepStrictEqual(g3.board.waste.map((c) => c.rank), [8, 7, 6, 5, 4, 3, 2]);
    assert.strictEqual(g3.board.wasteFan, 1, 'the last packet held one card');
    assert.strictEqual(E.apply(g3, { type: 'draw' }), null, 'nothing left to draw');
});
test('playing the top of a fanned packet uncovers the next one', () => {
    const g = E.apply(game(board({ stock: cards(['3S', '2S', 'AS'], false), tableau: [[card('3H')], [], [], [], [], [], []] }), { draw: 3, scoring: 'standard' }), { type: 'draw' });
    assert.strictEqual(g.board.waste[g.board.waste.length - 1].rank, 3);
    const h = E.apply(g, mv(E.WASTE, 2, E.foundation(0)));
    assert.strictEqual(h, null, 'a 3 cannot start a foundation');
    const i = E.apply(game(board({ stock: cards(['AS', '2S', '3S'], false), tableau: [[card('3H')], [], [], [], [], [], []] }), { draw: 3, scoring: 'standard' }), { type: 'draw' });
    const j = E.apply(i, mv(E.WASTE, 2, F(0)));
    assert.strictEqual(j.board.wasteFan, 2);
    const k = E.apply(j, mv(E.WASTE, 1, F(0)));
    assert.strictEqual(k.board.wasteFan, 1);
});
test('recycling turns the waste back over in the same order', () => {
    const stock = cards(['2C', '3C', '4C', '5C', '6C', '7C', '8C'], false);
    let g = game(board({ stock }), { draw: 3, scoring: 'none' });
    const first = [];
    while (g.board.stock.length) {
        g = E.apply(g, { type: 'draw' });
        first.push(g.board.waste[g.board.waste.length - 1].id);
    }
    g = E.apply(g, { type: 'recycle' });
    assert.deepStrictEqual(g.board.stock.map((c) => c.id), stock.map((c) => c.id));
    assert.ok(g.board.stock.every((c) => !c.faceUp));
    assert.strictEqual(g.board.waste.length, 0);
    assert.strictEqual(g.board.recycles, 1);
    const second = [];
    while (g.board.stock.length) {
        g = E.apply(g, { type: 'draw' });
        second.push(g.board.waste[g.board.waste.length - 1].id);
    }
    assert.deepStrictEqual(second, first);
});
test('recycle needs an empty stock and a non-empty waste', () => {
    assert.strictEqual(E.apply(game(board({ stock: [card('2C', false)], waste: [card('3C')] })), { type: 'recycle' }), null);
    assert.strictEqual(E.apply(game(board()), { type: 'recycle' }), null);
});
test('Vegas Draw One allows one pass: no recycle at all', () => {
    const g = game(board({ waste: cards(['2C', '3C']) }), { draw: 1, scoring: 'vegas' }, -52);
    assert.strictEqual(E.recyclesLeft(g), 0);
    assert.strictEqual(E.apply(g, { type: 'recycle' }), null);
});
test('Vegas Draw Three allows three passes: two recycles, then an X', () => {
    let g = game(board({ waste: cards(['2C', '3C', '4C']) }), { draw: 3, scoring: 'vegas' }, -52);
    assert.strictEqual(E.recyclesLeft(g), 2);
    g = E.apply(g, { type: 'recycle' });
    assert.strictEqual(E.recyclesLeft(g), 1);
    g = E.apply(g, { type: 'draw' });
    g = E.apply(g, { type: 'recycle' });
    assert.strictEqual(E.recyclesLeft(g), 0);
    g = E.apply(g, { type: 'draw' });
    assert.strictEqual(E.apply(g, { type: 'recycle' }), null);
    assert.strictEqual(g.score, -52, 'Vegas charges nothing for a pass');
});
test('Standard and None never limit passes', () => {
    assert.strictEqual(E.recyclesLeft(game(board({ recycles: 40 }), { draw: 1, scoring: 'standard' })), Infinity);
    assert.strictEqual(E.recyclesLeft(game(board({ recycles: 40 }), { draw: 3, scoring: 'none' })), Infinity);
});

// ---- Standard scoring ----------------------------------------------------------------------------
const std1 = { draw: 1, scoring: 'standard' };
test('waste to tableau +5, waste to foundation +10', () => {
    const g = game(board({ waste: cards(['AD', '7S']), tableau: [[card('8H')], [], [], [], [], [], []] }), std1, 20);
    const a = E.apply(g, mv(E.WASTE, 1, T(0)));
    assert.strictEqual(a.score, 25);
    const b = E.apply(a, mv(E.WASTE, 0, F(2)));
    assert.strictEqual(b.score, 35);
});
test('tableau to foundation +10, turning a card +5, tableau to tableau 0', () => {
    const g = game(board({ tableau: [[card('9C', false), card('AS')], [card('8H')], [card('7C')], [], [], [], []] }), std1);
    const a = E.apply(g, mv(T(0), 1, F(0)));
    assert.strictEqual(a.score, 10);
    const b = E.apply(a, { type: 'turn', column: 0 });
    assert.strictEqual(b.score, 15);
    assert.ok(b.board.tableau[0][0].faceUp);
    assert.strictEqual(E.apply(b, { type: 'turn', column: 0 }), null, 'already face up');
    const c = E.apply(b, mv(T(2), 0, T(1)));
    assert.strictEqual(c.score, 15);
});
test('foundation to tableau -15, floored at zero', () => {
    const g = game(board({ foundations: [run('S', 7), [], [], []], tableau: [[card('8H')], [], [], [], [], [], []] }), std1, 20);
    assert.strictEqual(E.apply(g, mv(F(0), 6, T(0))).score, 5);
    const poor = game(g.board, std1, 5);
    assert.strictEqual(E.apply(poor, mv(F(0), 6, T(0))).score, 0);
});
test('recycling costs 100 in Draw One and 20 in Draw Three, floored at zero', () => {
    assert.strictEqual(E.apply(game(board({ waste: cards(['2C']) }), std1, 250), { type: 'recycle' }).score, 150);
    assert.strictEqual(E.apply(game(board({ waste: cards(['2C']) }), { draw: 3, scoring: 'standard' }, 250), { type: 'recycle' }).score, 230);
    assert.strictEqual(E.apply(game(board({ waste: cards(['2C']) }), std1, 30), { type: 'recycle' }).score, 0);
});
test('the time penalty is Standard-only, floors at zero, and stops at the win', () => {
    assert.strictEqual(E.penalize(game(board(), std1, 7), 2).score, 5);
    assert.strictEqual(E.penalize(game(board(), std1, 1), 2).score, 0);
    const vegas = game(board(), { draw: 1, scoring: 'vegas' }, -52);
    assert.strictEqual(E.penalize(vegas, 2), vegas);
    const won = { ...game(board(), std1, 50), won: true };
    assert.strictEqual(E.penalize(won, 2), won);
});
test('the win bonus is 700000 / seconds, only after 30 seconds', () => {
    assert.strictEqual(E.timeBonus(30), 0);
    assert.strictEqual(E.timeBonus(31), 22580);
    assert.strictEqual(E.timeBonus(100), 7000);
    assert.strictEqual(E.timeBonus(700), 1000);
});

// ---- Vegas scoring -------------------------------------------------------------------------------
const veg = { draw: 3, scoring: 'vegas' };
test('+$5 per card onto a foundation, -$5 per card off one, nothing else pays', () => {
    const g = game(board({ waste: cards(['AD']), foundations: [run('S', 2), [], [], []], tableau: [[card('3H')], [card('9C', false), card('8D')], [card('7S')], [], [], [], []] }), veg, -52);
    const a = E.apply(g, mv(E.WASTE, 0, F(1)));
    assert.strictEqual(a.score, -47);
    const b = E.apply(a, mv(F(0), 1, T(0)));
    assert.strictEqual(b.score, -52);
    const c = E.apply(b, mv(T(2), 0, T(1)));
    assert.strictEqual(c.score, -52, 'tableau to tableau');
    const d = E.apply(game(board({ tableau: [[card('9C', false)], [], [], [], [], [], []] }), veg, -52), { type: 'turn', column: 0 });
    assert.strictEqual(d.score, -52, 'turning a card');
});
test('Vegas can go below zero', () => {
    const g = game(board({ foundations: [[card('AS')], [], [], []] }), veg, -52);
    assert.strictEqual(E.apply(g, mv(F(0), 0, F(1))).score, -52, 'foundation to foundation is neutral');
    const h = game(board({ foundations: [run('S', 13), [], [], []] }), veg, -52);
    assert.strictEqual(E.apply(h, mv(F(0), 12, T(0))).score, -57);
});

// ---- Undo ----------------------------------------------------------------------------------------
test('undo restores the exact board and score, one move at a time', () => {
    let g = E.newGame(std1, E.shuffle(E.createDeck(), seeded(9)));
    const snapshots = [g];
    for (let i = 0; i < 30; i++) {
        const next = E.autoPlay(g) ?? E.apply(g, g.board.stock.length ? { type: 'draw' } : { type: 'recycle' });
        if (!next) break;
        g = next;
        snapshots.push(g);
    }
    assert.ok(snapshots.length > 20, 'the game produced enough moves to test');
    for (let i = snapshots.length - 1; i > 0; i--) {
        g = E.undo(g);
        assert.deepStrictEqual(g.board, snapshots[i - 1].board, `board after undo #${snapshots.length - i}`);
        assert.strictEqual(g.score, snapshots[i - 1].score, `score after undo #${snapshots.length - i}`);
        assert.strictEqual(g.history.length, snapshots[i - 1].history.length);
    }
    assert.strictEqual(E.undo(g), null, 'nothing left to undo');
});
test('undo of a recycle restores the pass count and refunds the penalty', () => {
    const g = game(board({ waste: cards(['2C', '3C']) }), std1, 300);
    const r = E.apply(g, { type: 'recycle' });
    assert.strictEqual(r.score, 200);
    const u = E.undo(r);
    assert.deepStrictEqual(u.board, g.board);
    assert.strictEqual(u.score, 300);
});
test('undo reverses only what the floor let a move take', () => {
    const g = game(board({ foundations: [run('S', 7), [], [], []], tableau: [[card('8H')], [], [], [], [], [], []] }), std1, 5);
    const down = E.apply(g, mv(F(0), 6, T(0)));
    assert.strictEqual(down.score, 0);
    assert.strictEqual(E.undo(down).score, 5);
});
test('undo lists the cards it moved back, for the view to lift', () => {
    const g = game(board({ waste: cards(['AD']) }), std1);
    const a = E.apply(g, mv(E.WASTE, 0, F(0)));
    assert.deepStrictEqual(a.moved, [card('AD').id]);
    assert.deepStrictEqual(E.undo(a).moved, [card('AD').id]);
});

// ---- Double-click and auto-play ------------------------------------------------------------------
test('sendHome plays the top card to the foundation that takes it', () => {
    const g = game(board({ waste: cards(['9C', '2H']), foundations: [[card('AS')], [card('AH')], [], []] }), std1);
    const h = E.sendHome(g, E.WASTE);
    assert.strictEqual(h.board.foundations[1].length, 2);
    assert.strictEqual(h.score, 10);
    assert.strictEqual(E.sendHome(h, E.WASTE), null, '9C has nowhere to go');
    assert.strictEqual(E.sendHome(game(board({ tableau: [[card('AC', false)], [], [], [], [], [], []] })), T(0)), null, 'face-down');
});
test('auto-play sends up every card it can, repeatedly, as one undo step', () => {
    const b = board({
        waste: cards(['KD', 'AC']),
        tableau: [[card('5S', false), card('2C')], [card('AH')], [card('3C')], [card('2H')], [], [], [card('9D')]],
    });
    const g = game(b, std1);
    const a = E.autoPlay(g);
    const home = a.board.foundations.map((f) => f.map((c) => `${c.rank}${'CDHS'[c.suit]}`).join(' ')).filter(Boolean);
    assert.deepStrictEqual(home.sort(), ['1C 2C 3C', '1H 2H']);
    assert.strictEqual(a.score, 50);
    assert.strictEqual(a.history.length, 1);
    assert.strictEqual(a.board.tableau[0][0].faceUp, false, 'the uncovered 5S stays face down');
    assert.strictEqual(a.moved.length, 5);
    assert.deepStrictEqual(E.undo(a).board, b);
    assert.strictEqual(E.autoPlay(a), null, 'nothing more to send up');
});

// ---- Winning -------------------------------------------------------------------------------------
test('the 52nd card on a foundation wins; nothing plays after that', () => {
    const b = board({ foundations: [run('C', 13), run('D', 13), run('H', 13), run('S', 12)], tableau: [[card('KS')], [], [], [], [], [], []] });
    const g = game(b, std1, 500);
    assert.ok(!E.isWon(b));
    const w = E.sendHome(g, T(0));
    assert.ok(w.won);
    assert.ok(E.isWon(w.board));
    assert.strictEqual(E.apply(w, { type: 'draw' }), null);
    assert.strictEqual(E.undo(w), null, 'no undo after the win');
    assert.strictEqual(E.addPoints(w, E.timeBonus(140)).score, 510 + 5000);
});

// ---- Random play (invariants over 300 deals) -----------------------------------------------------
test('52 unique cards, face-down never above face-up, Standard never negative, full undo returns to the deal', () => {
    for (let seed = 1; seed <= 300; seed++) {
        const rnd = seeded(seed * 7919);
        const rules = { draw: seed % 2 ? 1 : 3, scoring: ['standard', 'vegas', 'none'][seed % 3] };
        const start = E.newGame(rules, E.shuffle(E.createDeck(), rnd));
        let g = start;
        for (let step = 0; step < 400 && !g.won; step++) {
            // Candidate moves: every legal pick onto every pile, plus draw/recycle/turn.
            const moves = [{ type: 'draw' }, { type: 'recycle' }];
            for (let t = 0; t < 7; t++) moves.push({ type: 'turn', column: t });
            const sources = [E.WASTE, ...[0, 1, 2, 3].map(F), ...[0, 1, 2, 3, 4, 5, 6].map(T)];
            const targets = [...[0, 1, 2, 3].map(F), ...[0, 1, 2, 3, 4, 5, 6].map(T)];
            for (const from of sources) {
                const pile = E.pileOf(g.board, from);
                for (let i = 0; i < pile.length; i++) {
                    if (E.canPick(g.board, from, i)) for (const to of targets) moves.push(mv(from, i, to));
                }
            }
            const legal = moves.map((m) => E.apply(g, m)).filter(Boolean);
            if (!legal.length) break;
            g = legal[rnd(legal.length)];
            const ids = allIds(g.board);
            assert.strictEqual(ids.length, 52);
            assert.strictEqual(new Set(ids).size, 52);
            g.board.tableau.forEach((col) => {
                const firstUp = col.findIndex((c) => c.faceUp);
                if (firstUp >= 0) assert.ok(col.slice(firstUp).every((c) => c.faceUp), `seed ${seed}: face-down card above a face-up one`);
            });
            if (rules.scoring === 'standard') assert.ok(g.score >= 0, `seed ${seed}: negative standard score`);
            if (rules.scoring === 'none') assert.strictEqual(g.score, 0);
        }
        let back = g;
        while (!back.won && back.history.length) back = E.undo(back);
        if (!g.won) {
            assert.deepStrictEqual(back.board, start.board, `seed ${seed}: undo all the way`);
            assert.strictEqual(back.score, start.score, `seed ${seed}: score after undoing everything`);
        }
    }
});
