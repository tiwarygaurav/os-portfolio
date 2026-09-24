/**
 * Calculator, headless: Standard's left-to-right evaluation against Scientific's precedence and
 * parentheses, %, repeated =, memory, errors, radix conversion, word-size wrapping with exact
 * BigInt maths, bitwise keys, Inv/Hyp variants, dms, n!, statistics, and paste as keystrokes.
 * `components/apps/calculator/engine.ts` and `input.ts` are pure, so all of it runs without a browser.
 */
const test = require('node:test');
const assert = require('node:assert/strict');

const E = require('../../.test-out/components/apps/calculator/engine.js');
const { keyFor, pasteText } = require('../../.test-out/components/apps/calculator/input.js');

/** Press a sequence. Tokens: digits/letters as keys; anything else via its Key name. */
function run(s, ...keys) {
    for (const k of keys) {
        const before = s;
        s = E.press(s, k);
        if (s === before && !E.isEnabled(before, k)) throw new Error(`key ${k} is disabled here`);
    }
    return s;
}
/** Type a string of digit characters. */
const typed = (s, text) => run(s, ...text.split('').map((c) => (c === '.' ? 'point' : c)));
const std = () => E.initialState();
const sci = () => E.setView(E.initialState(), 'scientific');
const show = (s) => E.displayText(s);

test('Standard evaluates left to right; Scientific applies precedence', () => {
    assert.equal(show(run(std(), '2', 'add', '3', 'mul', '4', 'equals')), '20.');
    assert.equal(show(run(sci(), '2', 'add', '3', 'mul', '4', 'equals')), '14.');
    // Standard shows the running result as each operator is pressed.
    assert.equal(show(run(std(), '2', 'add', '3', 'mul')), '5.');
    // Scientific shows the operand while a higher-precedence operator is pending.
    assert.equal(show(run(sci(), '2', 'add', '3', 'mul')), '3.');
    // x^y binds tighter than *, which binds tighter than +.
    assert.equal(show(run(sci(), '2', 'add', '3', 'mul', '2', 'pow', '3', 'equals')), '26.');
    // Or binds loosest: 1 Or 2 And 3 = 1 Or (2 And 3) = 1 Or 2 = 3.
    assert.equal(show(run(sci(), '1', 'or', '2', 'and', '3', 'equals')), '3.');
});

test('parentheses nest and show XP\'s (=n indicator depth', () => {
    let s = run(sci(), 'open', '2', 'add', '3', 'close', 'mul', '4', 'equals');
    assert.equal(show(s), '20.');
    s = run(sci(), '2', 'mul', 'open', '3', 'add', 'open');
    assert.equal(E.parenDepth(s), 2);
    s = run(s, '4', 'sub', '1', 'close');
    assert.equal(E.parenDepth(s), 1);
    assert.equal(show(s), '3.');
    s = run(s, 'close', 'equals');
    assert.equal(show(s), '12.');
    assert.equal(E.parenDepth(s), 0);
    // = closes whatever is still open.
    assert.equal(show(run(sci(), '2', 'mul', 'open', '3', 'add', '4', 'equals')), '14.');
    // A stray ) does nothing.
    assert.equal(E.parenDepth(run(sci(), 'close')), 0);
    // The nesting limit holds.
    let deep = sci();
    for (let i = 0; i < 30; i++) deep = E.press(deep, 'open');
    assert.equal(E.parenDepth(deep), E.MAX_PARENS);
});

test('% is a percentage of the pending operand, as XP computed it', () => {
    let s = run(std(), '5', '0', 'add', '1', '0', 'percent');
    assert.equal(show(s), '5.');
    assert.equal(show(run(s, 'equals')), '55.');
    // XP's quirk: 200 * 5 % shows 10, and = then gives 2000.
    s = run(std(), '2', '0', '0', 'mul', '5', 'percent');
    assert.equal(show(s), '10.');
    assert.equal(show(run(s, 'equals')), '2000.');
    // With nothing pending, % gives 0.
    assert.equal(show(run(std(), '1', '0', 'percent')), '0.');
});

test('repeated = repeats the last operation', () => {
    let s = run(std(), '2', 'add', '3', 'equals');
    assert.equal(show(s), '5.');
    s = run(s, 'equals');
    assert.equal(show(s), '8.');
    s = run(s, 'equals');
    assert.equal(show(s), '11.');
    // A new number, then =, applies it to that number: 7 + 3.
    assert.equal(show(run(s, '7', 'equals')), '10.');
    // 5 * = squares, then keeps multiplying by 5.
    s = run(std(), '5', 'mul', 'equals');
    assert.equal(show(s), '25.');
    assert.equal(show(run(s, 'equals')), '125.');
    // 10 - 2 = = counts down.
    assert.equal(show(run(std(), '1', '0', 'sub', '2', 'equals', 'equals')), '6.');
    // A second operator replaces the first.
    assert.equal(show(run(std(), '6', 'add', 'mul', '2', 'equals')), '12.');
});

test('memory: MS, M+, MR, MC and the M indicator', () => {
    let s = run(std(), '1', '2', 'ms');
    assert.equal(E.memoryHolds(s), true);
    s = run(s, 'clear', '3', 'mplus', 'clear');
    assert.equal(show(s), '0.');
    s = run(s, 'mr');
    assert.equal(show(s), '15.');
    // MR's value is a result: the next digit starts a new number.
    assert.equal(show(run(s, '4')), '4.');
    s = run(s, 'mc');
    assert.equal(E.memoryHolds(s), false);
    // C keeps memory.
    assert.equal(E.memoryHolds(run(std(), '7', 'ms', 'clear')), true);
    // MS of zero shows no M.
    assert.equal(E.memoryHolds(run(std(), '0', 'ms')), false);
    // Memory follows a change of number system.
    s = run(sci(), '2', '5', '5', 'ms', 'hex', 'clear', 'mr');
    assert.equal(show(s), 'FF');
});

test('errors are XP\'s words and only C or CE clear them', () => {
    let s = run(std(), '1', 'div', '0', 'equals');
    assert.equal(show(s), 'Cannot divide by zero.');
    // Keys are ignored while the error shows.
    assert.equal(show(run(s, '5', 'add')), 'Cannot divide by zero.');
    assert.equal(show(run(s, 'ce')), '0.');
    assert.equal(show(run(s, 'clear')), '0.');
    assert.equal(show(run(std(), '0', 'recip')), 'Cannot divide by zero.');
    assert.equal(show(run(std(), '0', 'div', '0', 'equals')), 'Result of function is undefined.');
    assert.equal(show(run(std(), '4', 'negate', 'sqrt')), 'Invalid input for function.');
    assert.equal(show(run(sci(), '0', 'ln')), 'Invalid input for function.');
    assert.equal(show(run(sci(), '2', 'inv', 'sin')), 'Invalid input for function.');
    assert.equal(show(run(sci(), '9', '0', 'tan')), 'Invalid input for function.');
    assert.equal(show(run(sci(), '7', 'mod', '0', 'equals')), 'Cannot divide by zero.');
    // After CE the calculation is clean again.
    assert.equal(show(run(s, 'ce', '2', 'add', '2', 'equals')), '4.');
});

test('decimal display: XP\'s trailing point, 16 significant digits, grouping, F-E', () => {
    assert.equal(show(std()), '0.');
    assert.equal(show(typed(std(), '12')), '12.');
    assert.equal(show(typed(std(), '1.50')), '1.50');
    assert.equal(show(run(std(), 'point')), '0.');
    assert.equal(show(run(typed(std(), '.1'), 'add', ...'.2'.split('').map((c) => (c === '.' ? 'point' : c)), 'equals')), '0.3');
    assert.equal(show(run(std(), '1', 'div', '3', 'equals')), '0.3333333333333333');
    // The correctly rounded 16 digits of the double nearest 2/3 (XP's 32 digits ended ...667).
    assert.equal(show(run(std(), '2', 'div', '3', 'equals')), '0.6666666666666666');
    // Binary noise in the 16th digit is not shown as a digit.
    assert.equal(show(run(typed(std(), '.7'), 'add', 'point', '1', 'equals')), '0.8');
    assert.equal(show(run(typed(std(), '1.1'), 'mul', '1', 'point', '1', 'equals')), '1.21');
    assert.equal(show(run(std(), '2', 'sqrt', 'mul', '2', 'sqrt', 'equals')), '2.');
    // No more than 16 significant digits can be typed.
    assert.equal(show(typed(std(), '12345678901234567')), '1234567890123456.');
    // Beyond 16 digits the display turns to scientific notation.
    assert.equal(show(run(typed(std(), '9999999999999999'), 'add', '1', 'equals')), '1.e+16');
    let s = typed(std(), '1234567');
    s = E.toggleGrouping(s);
    assert.equal(show(s), '1,234,567.');
    s = run(sci(), '1', '2', '3', '4', '5');
    assert.equal(show(run(s, 'fe')), '1.2345e+4');
    assert.equal(show(run(sci(), 'fe')), '0.e+0');
    // Copy drops grouping and the trailing point.
    assert.equal(E.copyText(E.toggleGrouping(typed(std(), '1234567'))), '1234567');
    // +/- on a typed number, and typing continues after it.
    assert.equal(show(run(typed(std(), '5'), 'negate', '3')), '-53.');
});

test('Exp enters an exponent', () => {
    let s = run(sci(), '1', 'point', '5', 'exp', '3');
    assert.equal(show(s), '1.5e+3');
    assert.equal(show(run(s, 'equals')), '1500.');
    s = run(sci(), '2', 'exp', '3', 'negate');
    assert.equal(show(s), '2.e-3');
    assert.equal(show(run(s, 'add', '1', 'equals')), '1.002');
    // An exponent a double cannot hold is refused.
    assert.equal(show(run(sci(), '1', 'exp', '9', '9', '9')), '1.e+99');
    // Backspace takes exponent digits first, then the exponent.
    assert.equal(show(run(sci(), '4', 'exp', '1', '2', 'back', 'back', 'back')), '4.');
});

test('radix conversion round-trips', () => {
    let s = run(sci(), '2', '5', '5', 'hex');
    assert.equal(show(s), 'FF');
    s = run(s, 'bin');
    assert.equal(show(s), '11111111');
    s = run(s, 'oct');
    assert.equal(show(s), '377');
    s = run(s, 'dec');
    assert.equal(show(s), '255.');
    // A fraction is truncated on the way to an integer system.
    assert.equal(show(run(sci(), '3', 'point', '7', 'hex')), '3');
    // Negative numbers show in two's complement and come back negative.
    s = run(sci(), '1', 'negate', 'hex');
    assert.equal(show(s), 'FFFFFFFFFFFFFFFF');
    assert.equal(show(run(s, 'dec')), '-1.');
    // Hex digits, and digits beyond the radix are dead.
    s = run(sci(), 'hex', 'F', 'F', 'mul', '2', 'equals');
    assert.equal(show(s), '1FE');
    assert.equal(E.isEnabled(run(sci(), 'bin'), '2'), false);
    assert.equal(E.isEnabled(run(sci(), 'oct'), '8'), false);
    assert.equal(E.isEnabled(sci(), 'A'), false);
    assert.equal(E.isEnabled(run(sci(), 'hex'), 'point'), false);
    assert.equal(E.isEnabled(run(sci(), 'hex'), 'sin'), false);
    // Grouping: 4 in Hex and Bin, 3 in Oct.
    assert.equal(show(E.toggleGrouping(run(sci(), 'hex', 'F', 'F', 'F', 'F', 'F'))), 'F FFFF');
    assert.equal(show(E.toggleGrouping(run(sci(), '6', '4', 'oct'))), '100');
    assert.equal(show(E.toggleGrouping(run(sci(), '5', '1', '1', 'oct'))), '777');
    assert.equal(show(E.toggleGrouping(run(sci(), '5', '1', '2', 'oct'))), '1 000');
    // Standard is always decimal.
    assert.equal(show(E.setView(run(sci(), 'hex', 'F', 'F'), 'standard')), '255.');
});

test('word size wraps; Qword is exact at 2^63', () => {
    let s = run(sci(), 'hex', 'byte', 'F', 'F', 'add', '1', 'equals');
    assert.equal(show(s), '0');
    s = run(sci(), 'hex', 'byte', '7', 'F', 'add', '1', 'equals');
    assert.equal(show(s), '80');
    assert.equal(show(run(s, 'dec')), '-128.');
    // Typing past the word size is refused.
    assert.equal(show(run(sci(), 'hex', 'byte', '1', '2', '3')), '12');
    s = run(sci(), 'hex', ...'7FFFFFFFFFFFFFFF'.split(''), 'add', '1', 'equals');
    assert.equal(show(s), '8000000000000000');
    s = run(sci(), 'hex', ...'FFFFFFFFFFFFFFFF'.split(''), 'add', '1', 'equals');
    assert.equal(show(s), '0');
    // 2^63 by x^y, exact (3F is 63).
    s = run(sci(), 'hex', '2', 'pow', '3', 'F', 'equals');
    assert.equal(show(s), '8000000000000000');
    // 2^64 - 1 squared, modulo 2^64, is 1 — no rounding anywhere.
    assert.equal(show(run(sci(), 'hex', ...'FFFFFFFFFFFFFFFF'.split(''), 'square')), '1');
    // Dword, Word, Byte chop the value; widening keeps the signed value.
    s = run(sci(), 'hex', '1', '2', '3', '4', '5', '6', '7', '8', '9');
    assert.equal(show(run(s, 'dword')), '23456789');
    assert.equal(show(run(s, 'word')), '6789');
    assert.equal(show(run(s, 'byte')), '89');
    assert.equal(show(run(s, 'byte', 'qword')), 'FFFFFFFFFFFFFF89');
    // Word-size keys do nothing in Dec, where F2-F4 are the angle units.
    assert.equal(E.isEnabled(sci(), 'byte'), false);
    // Integer division truncates.
    assert.equal(show(run(sci(), 'hex', '7', 'div', '2', 'equals')), '3');
});

test('bitwise operations', () => {
    const b = () => run(sci(), 'bin');
    assert.equal(show(run(b(), '1', '1', '0', '0', 'and', '1', '0', '1', '0', 'equals')), '1000');
    assert.equal(show(run(b(), '1', '1', '0', '0', 'or', '1', '0', '1', '0', 'equals')), '1110');
    assert.equal(show(run(b(), '1', '1', '0', '0', 'xor', '1', '0', '1', '0', 'equals')), '110');
    assert.equal(show(run(sci(), 'hex', 'byte', '0', 'F', 'not')), 'F0');
    assert.equal(show(run(sci(), 'hex', '1', 'lsh', '4', 'equals')), '10');
    assert.equal(show(run(sci(), 'hex', '1', 'lsh', '4', '0', 'equals')), '0'); // shifted out of a Qword
    assert.equal(show(run(sci(), 'hex', 'F', '0', 'inv', 'lsh', '4', 'equals')), 'F');
    assert.equal(show(run(sci(), 'hex', 'byte', '8', '0', 'inv', 'lsh', '1', 'equals')), 'C0'); // arithmetic
    // In Dec: on the whole part, two's complement for Not.
    assert.equal(show(run(sci(), '1', '2', 'and', '1', '0', 'equals')), '8.');
    assert.equal(show(run(sci(), '5', 'not')), '-6.');
    assert.equal(show(run(sci(), '1', 'lsh', '3', 'equals')), '8.');
    assert.equal(show(run(sci(), '7', 'mod', '3', 'equals')), '1.');
    assert.equal(show(run(sci(), '2', 'point', '7', '5', 'int')), '2.');
    assert.equal(show(run(sci(), '2', 'point', '7', '5', 'inv', 'int')), '0.75');
});

test('Inv and Hyp modify the next function and then clear', () => {
    const near = (s, want) => {
        const got = Number(E.copyText(s));
        assert.ok(Math.abs(got - want) <= 1e-12 * Math.max(1, Math.abs(want)), `${E.displayText(s)} vs ${want}`);
    };
    assert.equal(show(run(sci(), '3', '0', 'sin')), '0.5');
    assert.equal(show(run(sci(), '6', '0', 'cos')), '0.5');
    assert.equal(show(run(sci(), '4', '5', 'sin')), '0.7071067811865475');
    assert.equal(show(run(sci(), '1', '8', '0', 'sin')), '0.');
    assert.equal(show(run(sci(), '4', '5', 'tan')), '1.');
    let s = run(sci(), 'point', '5', 'inv', 'sin');
    assert.equal(show(s), '30.');
    assert.equal(s.inv, false);
    assert.equal(show(run(sci(), '1', 'inv', 'cos')), '0.');
    assert.equal(show(run(sci(), '1', 'inv', 'tan')), '45.');
    // Radians and grads.
    assert.equal(show(run(sci(), 'rad', 'pi', 'sin')), '0.');
    assert.equal(show(run(sci(), 'rad', 'pi', 'cos')), '-1.');
    assert.equal(show(run(sci(), 'grad', '1', '0', '0', 'sin')), '1.');
    near(run(sci(), 'rad', '1', 'sin'), Math.sin(1));
    // Hyperbolic and their inverses.
    near(run(sci(), '1', 'hyp', 'sin'), Math.sinh(1));
    near(run(sci(), '1', 'hyp', 'cos'), Math.cosh(1));
    near(run(sci(), '1', 'hyp', 'tan'), Math.tanh(1));
    s = run(sci(), '1', 'inv', 'hyp', 'sin');
    near(s, Math.asinh(1));
    assert.equal(s.inv || s.hyp, false);
    assert.equal(show(run(sci(), 'point', '5', 'inv', 'hyp', 'cos')), 'Invalid input for function.');
    // x^y and its root, x^3 and cube root, x^2 and square root.
    assert.equal(show(run(sci(), '2', 'pow', '1', '0', 'equals')), '1024.');
    assert.equal(show(run(sci(), '2', '7', 'inv', 'pow', '3', 'equals')), '3.');
    assert.equal(show(run(sci(), '8', 'negate', 'inv', 'pow', '3', 'equals')), '-2.');
    assert.equal(show(run(sci(), '3', 'cube')), '27.');
    assert.equal(show(run(sci(), '2', '7', 'inv', 'cube')), '3.');
    assert.equal(show(run(sci(), '9', 'square')), '81.');
    assert.equal(show(run(sci(), '8', '1', 'inv', 'square')), '9.');
    assert.equal(show(run(sci(), '2', 'square', 'inv', 'square')), '2.');
    // ln and e^x, log and 10^x.
    near(run(sci(), '1', 'inv', 'ln'), Math.E);
    assert.equal(show(run(sci(), '1', '0', '0', '0', 'log')), '3.');
    assert.equal(show(run(sci(), '3', 'inv', 'log')), '1000.');
    // pi and 2 pi.
    assert.equal(show(run(sci(), 'pi')), '3.141592653589793');
    assert.equal(show(run(sci(), 'inv', 'pi')), '6.283185307179586');
    // Inv stays set across keys that do not use it.
    assert.equal(run(sci(), 'inv', '5').inv, true);
});

test('dms converts both ways', () => {
    assert.equal(show(run(sci(), '1', 'point', '5', 'dms')), '1.3');
    assert.equal(show(run(sci(), '1', 'point', '3', 'inv', 'dms')), '1.5');
    assert.equal(show(run(sci(), '1', 'point', '2', '3', '4', '5', 'dms')), '1.14042');
    assert.equal(show(run(sci(), '1', 'point', '1', '4', '0', '4', '2', 'inv', 'dms')), '1.2345');
    assert.equal(show(run(sci(), '2', 'point', '5', 'negate', 'dms')), '-2.3');
});

test('n! is exact for integers and gamma for fractions', () => {
    assert.equal(show(run(sci(), '5', 'fact')), '120.');
    assert.equal(show(run(sci(), '0', 'fact')), '1.');
    assert.equal(show(run(sci(), '2', '0', 'fact')), '2.43290200817664e+18');
    const half = Number(E.copyText(run(sci(), 'point', '5', 'fact')));
    assert.ok(Math.abs(half - Math.sqrt(Math.PI) / 2) < 1e-13, String(half));
    const negHalf = Number(E.copyText(run(sci(), 'point', '5', 'negate', 'fact')));
    assert.ok(Math.abs(negHalf - Math.sqrt(Math.PI)) < 1e-13, String(negHalf));
    assert.equal(show(run(sci(), '3', 'negate', 'fact')), 'Invalid input for function.');
    assert.equal(show(run(sci(), '1', '7', '1', 'fact')), 'Overflow.');
    // Integer systems: exact, and wrapping.
    assert.equal(show(run(sci(), 'hex', '1', '4', 'fact')), '21C3677C82B40000'); // 0x14 = 20, and 20! fits a Qword exactly
    assert.equal(show(run(sci(), 'hex', 'byte', '6', 'fact')), 'D0'); // 720 mod 256 = 208
    assert.equal(show(run(sci(), 'hex', '6', '4', 'fact')), '0'); // 100! mod 2^64
});

test('statistics: mean, sum, s over n-1 and n', () => {
    let s = run(sci(), 'sta');
    assert.equal(s.statsOpen, true);
    assert.equal(E.isEnabled(s, 'ave'), false); // empty
    for (const d of ['2', '4', '4', '4', '5', '5', '7', '9']) s = run(s, d, 'dat');
    assert.equal(s.stats.length, 8);
    assert.equal(show(run(s, 'ave')), '5.');
    assert.equal(show(run(s, 'sum')), '40.');
    assert.equal(show(run(s, 'inv', 'sum')), '232.');
    assert.equal(show(run(s, 'inv', 'ave')), '29.');
    assert.equal(show(run(s, 'inv', 'dev')), '2.'); // population
    const sample = Number(E.copyText(run(s, 'dev')));
    assert.ok(Math.abs(sample - Math.sqrt(32 / 7)) < 1e-14, String(sample));
    // LOAD, CD, CAD.
    assert.equal(show(E.statLoad(run(s, 'clear'), 7)), '9.');
    s = E.statDelete(s, 0);
    assert.deepEqual(s.stats, [4, 4, 4, 5, 5, 7, 9]);
    s = E.statClearAll(s);
    assert.equal(s.stats.length, 0);
    assert.equal(E.isEnabled(s, 'sum'), false);
    // One value: s over n-1 divides by zero; over n it is 0.
    s = run(sci(), 'sta', '3', 'dat');
    assert.equal(show(run(s, 'dev')), 'Cannot divide by zero.');
    assert.equal(show(run(s, 'inv', 'dev')), '0.');
    // Dat does nothing while the Statistics Box is closed.
    assert.equal(E.isEnabled(sci(), 'dat'), false);
    // Values show in the current number system.
    s = run(sci(), 'sta', '2', '5', '5', 'dat', 'hex');
    assert.equal(E.formatStat(s, s.stats[0]), 'FF');
});

test('keyboard map', () => {
    const k = (key, s = std(), mods = {}) => keyFor({ key, ...mods }, s);
    assert.equal(k('7'), '7');
    assert.equal(k('Enter'), 'equals');
    assert.equal(k('Escape'), 'clear');
    assert.equal(k('Delete'), 'ce');
    assert.equal(k('%'), 'percent');
    assert.equal(k('%', sci()), 'mod');
    assert.equal(k('@'), 'sqrt');
    assert.equal(k('@', sci()), 'square');
    assert.equal(k('m', std(), { ctrlKey: true }), 'ms');
    assert.equal(k('R', std(), { ctrlKey: true }), 'mr');
    assert.equal(k('s', sci(), { ctrlKey: true }), 'sta');
    assert.equal(k('s', std(), { ctrlKey: true }), null);
    assert.equal(k('s', sci()), 'sin');
    assert.equal(k('s'), null);
    assert.equal(k('F2', sci()), 'deg');
    assert.equal(k('F2', run(sci(), 'hex')), 'dword');
    assert.equal(k('d', run(sci(), 'hex')), 'D');
    assert.equal(k('d', sci()), null);
    assert.equal(k('F9'), 'negate');
    assert.equal(k('x', sci(), { altKey: true }), null);
});

test('paste feeds characters through as keystrokes', () => {
    let r = pasteText(std(), '12+3=');
    assert.equal(show(r.state), '15.');
    assert.equal(r.used, 5);
    r = pasteText(std(), '1,234.5 * 2 =');
    assert.equal(show(r.state), '2469.');
    r = pasteText(sci(), '2+3*4=');
    assert.equal(show(r.state), '14.');
    r = pasteText(sci(), '(2+3)*4=');
    assert.equal(show(r.state), '20.');
    r = pasteText(std(), 'hello');
    assert.equal(r.used, 0);
    r = pasteText(std(), '42:m:q:r');
    assert.equal(show(r.state), '42.');
    assert.equal(E.memoryHolds(r.state), true);
    r = pasteText(run(sci(), 'hex'), 'ff+1=');
    assert.equal(show(r.state), '100');
    r = pasteText(run(sci(), 'sta'), '1\\2\\3\\');
    assert.deepEqual(r.state.stats, [1, 2, 3]);
    r = pasteText(sci(), '1.5:e3=');
    assert.equal(show(r.state), '1500.');
});

test('view switch keeps the number and drops the pending calculation', () => {
    let s = run(std(), '2', 'add', '3');
    s = E.setView(s, 'scientific');
    assert.equal(show(s), '3.');
    assert.equal(show(run(s, 'equals')), '3.');
    s = E.setView(run(sci(), 'inv', 'hyp', 'sta'), 'standard');
    assert.equal(s.inv || s.hyp || s.statsOpen, false);
});
