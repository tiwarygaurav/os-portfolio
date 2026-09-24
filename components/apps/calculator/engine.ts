/**
 * Windows XP's Calculator (calc.exe 5.1) as pure functions: no React, no DOM.
 *
 * Everything the keypad can do is `press(state, key) -> state`, so the view is a renderer and the
 * arithmetic can be tested under Node without a browser. The rules are XP's:
 *
 *  - Standard evaluates left to right as a pocket calculator does (2 + 3 * 4 = 20); Scientific
 *    applies precedence (2 + 3 * 4 = 14) and nests parentheses.
 *  - Repeating = repeats the last operation; % takes a percentage of the pending operand.
 *  - Hex, Oct and Bin are whole numbers of the chosen word size, held as a signed BigInt and shown
 *    in two's complement, so Qword arithmetic is exact to the last bit and wraps as XP's did.
 *  - Decimal is an IEEE-754 double. XP used its own arbitrary-precision library to 32 digits; a
 *    double carries about 16, so every decimal result is rounded to 16 significant digits (which
 *    is also what hides 0.1 + 0.2 = 0.30000000000000004) and the display never shows more.
 *  - Errors are XP's own words, shown in the display and cleared by C or CE.
 *
 * The project's type-check target is ES5 for syntax, so there are no `1n` literals and no `**` on
 * bigints here: `BigInt(1)` and explicit loops instead. Runtime support is ES2020's BigInt.
 */

export type View = 'standard' | 'scientific';
export type Radix = 2 | 8 | 10 | 16;
export type Angle = 'deg' | 'rad' | 'grad';
export type WordSize = 8 | 16 | 32 | 64;

export const DIGITS = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', 'A', 'B', 'C', 'D', 'E', 'F'] as const;
export type Digit = (typeof DIGITS)[number];

export type BinaryOp = 'add' | 'sub' | 'mul' | 'div' | 'mod' | 'pow' | 'root' | 'and' | 'or' | 'xor' | 'lsh' | 'rsh';

/** Every key on either keypad, plus the radio buttons and check boxes, which XP also bound to keys. */
export type Key =
    | Digit
    | 'point' | 'negate' | 'back' | 'ce' | 'clear'
    | 'add' | 'sub' | 'mul' | 'div' | 'equals'
    | 'percent' | 'sqrt' | 'recip'
    | 'mc' | 'mr' | 'ms' | 'mplus'
    | 'open' | 'close'
    | 'mod' | 'and' | 'or' | 'xor' | 'lsh' | 'not' | 'int'
    | 'pow' | 'cube' | 'square' | 'ln' | 'log' | 'fact'
    | 'sin' | 'cos' | 'tan' | 'dms' | 'exp' | 'fe' | 'pi'
    | 'inv' | 'hyp'
    | 'sta' | 'ave' | 'sum' | 'dev' | 'dat'
    | 'hex' | 'dec' | 'oct' | 'bin'
    | 'deg' | 'rad' | 'grad'
    | 'qword' | 'dword' | 'word' | 'byte';

/** A double in Dec; a signed BigInt, already wrapped to the word size, in Hex, Oct and Bin. */
export type Num = number | bigint;

/** The number being typed, kept as text so "12." and "1.50" display exactly as keyed. */
export interface Entry {
    neg: boolean;
    /** Digits with at most one '.'; never empty. */
    mant: string;
    /** Exponent digits once Exp is pressed ('' shows as e+0); null before that. */
    exp: string | null;
    expNeg: boolean;
}

/** A left operand waiting for its right one. */
export interface Frame {
    left: Num;
    op: BinaryOp;
}

export interface CalcState {
    view: View;
    radix: Radix;
    angle: Angle;
    word: WordSize;
    inv: boolean;
    hyp: boolean;
    /** F-E: show decimal results in scientific notation. */
    fe: boolean;
    grouping: boolean;
    /** Null when the display shows `value` (a result) rather than something being typed. */
    entry: Entry | null;
    value: Num;
    /** Pending operations, one list per open parenthesis; the last list is the innermost. */
    levels: Frame[][];
    /** The last key was a binary operator, so another one replaces it rather than applying it. */
    afterOp: boolean;
    /** What a repeated = applies again. */
    lastOp: { op: BinaryOp; operand: Num } | null;
    memory: Num;
    /** The Statistics Box. Values are kept as doubles and shown in the current number system. */
    stats: number[];
    statsOpen: boolean;
    error: string | null;
}

/** XP's messages. The overflow one is ours: XP's arbitrary precision rarely reached one. */
export const ERR = {
    divideByZero: 'Cannot divide by zero.',
    invalidInput: 'Invalid input for function.',
    undefinedResult: 'Result of function is undefined.',
    overflow: 'Overflow.',
} as const;

/** Nesting limit for parentheses. */
export const MAX_PARENS = 25;
/** Significant digits a decimal entry or result may carry — all a double can honestly hold. */
export const DEC_DIGITS = 16;
/** Longest fixed-point decimal shown before the display switches to scientific notation. */
export const MAX_FRACTION = 32;

const BIG0 = BigInt(0);
const BIG1 = BigInt(1);

export function initialState(): CalcState {
    return {
        view: 'standard',
        radix: 10,
        angle: 'deg',
        word: 64,
        inv: false,
        hyp: false,
        fe: false,
        grouping: false,
        entry: null,
        value: 0,
        levels: [[]],
        afterOp: false,
        lastOp: null,
        memory: 0,
        stats: [],
        statsOpen: false,
        error: null,
    };
}

// ---- failures ----------------------------------------------------------------------------------

/*
 * Arithmetic reports a failure by throwing a tagged object that `press` turns into the display's
 * error text. A plain object rather than an Error subclass: `instanceof` on a subclass of Error is
 * unreliable once compiled down, and this never needs a stack.
 */
interface Failure {
    calcFailure: string;
}

function fail(message: string): never {
    const failure: Failure = { calcFailure: message };
    throw failure;
}

function failureText(e: unknown): string | null {
    if (typeof e === 'object' && e !== null && 'calcFailure' in e) return String((e as Failure).calcFailure);
    return null;
}

// ---- numbers -----------------------------------------------------------------------------------

const isIntMode = (s: Pick<CalcState, 'radix'>) => s.radix !== 10;
const zeroOf = (s: Pick<CalcState, 'radix'>): Num => (isIntMode(s) ? BIG0 : 0);

/**
 * Round a decimal result to the 16 significant digits a double can carry, and turn -0 into 0.
 *
 * A double holds 15.95 decimal digits, so the 16th is partly noise: 0.7 + 0.1 is
 * 0.7999999999999999 and sin 30 is 0.4999999999999999 at 16 digits. When the 16th digit is within
 * one unit of a 15-digit number, that is binary rounding rather than information, and the result
 * snaps to the 15-digit number (0.8, 0.5) — which is what XP's 32-digit arithmetic showed. A result
 * further away keeps all 16 digits (1/3 is 0.3333333333333333).
 */
export function tidy(x: number): number {
    if (Number.isNaN(x)) fail(ERR.invalidInput);
    if (!Number.isFinite(x)) fail(ERR.overflow);
    if (x === 0) return 0;
    const r16 = Number(x.toPrecision(DEC_DIGITS));
    const r15 = Number(x.toPrecision(DEC_DIGITS - 1));
    if (r15 === r16) return r16;
    const unit = Math.pow(10, Number(r16.toExponential().split('e')[1]) - (DEC_DIGITS - 1));
    return Math.abs(r16 - r15) <= unit * 1.5 ? r15 : r16;
}

const truncBig = (x: number): bigint => BigInt(Math.trunc(x));

/** A value in the representation the given number system uses. */
export function convert(v: Num, radix: Radix, word: WordSize): Num {
    if (radix === 10) return typeof v === 'number' ? v : Number(v);
    return BigInt.asIntN(word, typeof v === 'bigint' ? v : truncBig(v));
}

const asNumber = (v: Num): number => (typeof v === 'number' ? v : Number(v));
const fromNumber = (s: CalcState, x: number): Num => convert(x, s.radix, s.word);

export const memoryHolds = (s: CalcState): boolean => (typeof s.memory === 'bigint' ? s.memory !== BIG0 : s.memory !== 0);
export const parenDepth = (s: CalcState): number => s.levels.length - 1;

function parseEntry(s: CalcState, e: Entry): Num {
    if (s.radix === 10) {
        const x = Number(`${e.neg ? '-' : ''}${e.mant}e${e.expNeg ? '-' : ''}${e.exp || '0'}`);
        return x === 0 ? 0 : x;
    }
    return BigInt.asIntN(s.word, BigInt(radixPrefix(s.radix) + e.mant));
}

const radixPrefix = (radix: Radix) => (radix === 16 ? '0x' : radix === 8 ? '0o' : radix === 2 ? '0b' : '');

/** The number on the display: what is being typed, or else the last result. */
export function current(s: CalcState): Num {
    return s.entry ? parseEntry(s, s.entry) : s.value;
}

// ---- operations --------------------------------------------------------------------------------

/**
 * Precedence in Scientific view, from XP's calc: Or and Xor bind loosest, then And, then + and -,
 * then * / Mod and the shifts, then x^y and its root. Standard has none: everything is equal, so
 * each operator applies the one before it — left to right.
 */
const PRECEDENCE: Record<BinaryOp, number> = {
    or: 0,
    xor: 0,
    and: 1,
    add: 2,
    sub: 2,
    mul: 3,
    div: 3,
    mod: 3,
    lsh: 3,
    rsh: 3,
    pow: 4,
    root: 4,
};

const precedence = (s: CalcState, op: BinaryOp) => (s.view === 'standard' ? 0 : PRECEDENCE[op]);

function power(a: number, b: number): number {
    if (a === 0 && b < 0) fail(ERR.divideByZero);
    const r = Math.pow(a, b);
    if (Number.isNaN(r)) fail(ERR.invalidInput);
    return tidy(r);
}

/** The b-th root of a. Odd roots of negative numbers are real, as they were on XP. */
function root(a: number, b: number): number {
    if (b === 0) fail(ERR.invalidInput);
    if (a === 0 && b < 0) fail(ERR.divideByZero);
    const oddInteger = Number.isInteger(b) && Math.abs(b) % 2 === 1;
    if (a < 0 && !oddInteger) fail(ERR.invalidInput);
    let r = a < 0 ? -Math.pow(-a, 1 / b) : Math.pow(a, 1 / b);
    // A perfect power has an exact root: 27 root 3 is 3, not 3.0000000000000004.
    const k = Math.round(r);
    if (Number.isInteger(b) && b > 0 && Math.pow(k, b) === a) r = k;
    return tidy(r);
}

/** And, Or, Xor and Not in Dec act on the whole part as a 64-bit two's-complement integer. */
function logical64(a: number, b: number, f: (p: bigint, q: bigint) => bigint): number {
    return Number(BigInt.asIntN(64, f(truncBig(a), truncBig(b))));
}

function shiftCount(b: number): number {
    const n = Math.trunc(b);
    if (n < 0) fail(ERR.invalidInput);
    return n;
}

function applyDec(a: number, op: BinaryOp, b: number): number {
    switch (op) {
        case 'add':
            return tidy(a + b);
        case 'sub':
            return tidy(a - b);
        case 'mul':
            return tidy(a * b);
        case 'div':
            if (b === 0) fail(a === 0 ? ERR.undefinedResult : ERR.divideByZero);
            return tidy(a / b);
        case 'mod':
            if (b === 0) fail(ERR.divideByZero);
            return tidy(a % b);
        case 'pow':
            return power(a, b);
        case 'root':
            return root(a, b);
        case 'and':
            return logical64(a, b, (p, q) => p & q);
        case 'or':
            return logical64(a, b, (p, q) => p | q);
        case 'xor':
            return logical64(a, b, (p, q) => p ^ q);
        case 'lsh':
            return tidy(Math.trunc(a) * Math.pow(2, shiftCount(b)));
        case 'rsh':
            return tidy(Math.floor(Math.trunc(a) / Math.pow(2, shiftCount(b))));
    }
}

/** x^y modulo the word size, by squaring: exact for any exponent a Qword can hold. */
function intPower(word: WordSize, a: bigint, b: bigint): bigint {
    if (b < BIG0) {
        if (a === BIG0) fail(ERR.divideByZero);
        return BigInt.asIntN(word, truncBig(Math.pow(Number(a), Number(b))));
    }
    let result = BIG1;
    let base = BigInt.asIntN(word, a);
    let e = b;
    while (e > BIG0) {
        if ((e & BIG1) === BIG1) result = BigInt.asIntN(word, result * base);
        base = BigInt.asIntN(word, base * base);
        e = e >> BIG1;
    }
    return result;
}

function applyInt(word: WordSize, a: bigint, op: BinaryOp, b: bigint): bigint {
    const wrap = (v: bigint) => BigInt.asIntN(word, v);
    const bits = BigInt(word);
    switch (op) {
        case 'add':
            return wrap(a + b);
        case 'sub':
            return wrap(a - b);
        case 'mul':
            return wrap(a * b);
        case 'div':
            if (b === BIG0) fail(a === BIG0 ? ERR.undefinedResult : ERR.divideByZero);
            return wrap(a / b);
        case 'mod':
            if (b === BIG0) fail(ERR.divideByZero);
            return wrap(a % b);
        case 'pow':
            return intPower(word, a, b);
        case 'root':
            return wrap(truncBig(root(Number(a), Number(b))));
        case 'and':
            return wrap(a & b);
        case 'or':
            return wrap(a | b);
        case 'xor':
            return wrap(a ^ b);
        case 'lsh':
            if (b < BIG0) fail(ERR.invalidInput);
            return b >= bits ? BIG0 : wrap(a << b);
        case 'rsh':
            // Arithmetic, as BigInt's >> is: the sign bit is kept.
            if (b < BIG0) fail(ERR.invalidInput);
            return b >= bits ? (a < BIG0 ? -BIG1 : BIG0) : a >> b;
    }
}

export function apply(s: CalcState, a: Num, op: BinaryOp, b: Num): Num {
    if (isIntMode(s)) return applyInt(s.word, convert(a, s.radix, s.word) as bigint, op, convert(b, s.radix, s.word) as bigint);
    return applyDec(asNumber(a), op, asNumber(b));
}

// ---- functions of one number ------------------------------------------------------------------

const LANCZOS = [
    0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059,
    12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7,
];

/** The gamma function (Lanczos, g = 7), which is what n! means for a number that is not whole. */
function gamma(z: number): number {
    if (z < 0.5) {
        const s = Math.sin(Math.PI * z);
        if (s === 0) fail(ERR.invalidInput);
        return Math.PI / (s * gamma(1 - z));
    }
    const x = z - 1;
    let sum = LANCZOS[0];
    for (let i = 1; i < LANCZOS.length; i++) sum += LANCZOS[i] / (x + i);
    const t = x + 7.5;
    // t^(x+0.5) is split in two so it cannot overflow before exp(-t) brings it back down.
    const half = Math.pow(t, (x + 0.5) / 2);
    return Math.sqrt(2 * Math.PI) * half * (half * Math.exp(-t)) * sum;
}

function factorial(x: number): number {
    if (Number.isInteger(x)) {
        if (x < 0) fail(ERR.invalidInput);
        if (x > 170) fail(ERR.overflow);
        let r = 1;
        for (let i = 2; i <= x; i++) r *= i;
        return r;
    }
    return gamma(x + 1);
}

const toRadians = (x: number, angle: Angle) => (angle === 'rad' ? x : angle === 'deg' ? ((x % 360) * Math.PI) / 180 : ((x % 400) * Math.PI) / 200);
const fromRadians = (r: number, angle: Angle) => (angle === 'rad' ? r : angle === 'deg' ? (r * 180) / Math.PI : (r * 200) / Math.PI);

function trig(s: CalcState, fn: 'sin' | 'cos' | 'tan', x: number): number {
    if (s.hyp) {
        if (!s.inv) return fn === 'sin' ? Math.sinh(x) : fn === 'cos' ? Math.cosh(x) : Math.tanh(x);
        if (fn === 'sin') return Math.asinh(x);
        if (fn === 'cos') {
            if (x < 1) fail(ERR.invalidInput);
            return Math.acosh(x);
        }
        if (Math.abs(x) >= 1) fail(ERR.invalidInput);
        return Math.atanh(x);
    }
    if (s.inv) {
        if (fn !== 'tan' && Math.abs(x) > 1) fail(ERR.invalidInput);
        return fromRadians(fn === 'sin' ? Math.asin(x) : fn === 'cos' ? Math.acos(x) : Math.atan(x), s.angle);
    }
    /*
     * Exactly on a quarter turn the answer is exact, as it was with XP's 32 digits: sin 180 is 0,
     * not 1.2e-16, and tan 90 has no value. In radians that means an exact multiple of the double
     * nearest pi/2 — which is what the pi key produces.
     */
    const quarter = s.angle === 'deg' ? 90 : s.angle === 'grad' ? 100 : Math.PI / 2;
    const k = Math.round(x / quarter);
    if (k * quarter === x) {
        const q = ((k % 4) + 4) % 4;
        if (fn === 'sin') return [0, 1, 0, -1][q];
        if (fn === 'cos') return [1, 0, -1, 0][q];
        if (q % 2 === 1) fail(ERR.invalidInput);
        return 0;
    }
    const r = toRadians(x, s.angle);
    return fn === 'sin' ? Math.sin(r) : fn === 'cos' ? Math.cos(r) : Math.tan(r);
}

/** Rounded to 10 decimals before splitting, so 29.999999999999996 minutes is 30, not 29 and 59.99". */
const settle = (x: number) => Math.round(x * 1e10) / 1e10;

/** Decimal degrees to D.MMSS (1.5 -> 1.3, i.e. 1 degree 30 minutes). */
function toDms(x: number): number {
    const sign = x < 0 ? -1 : 1;
    const a = Math.abs(x);
    const d = Math.floor(a);
    const minutes = settle((a - d) * 60);
    const m = Math.floor(minutes);
    const seconds = settle((minutes - m) * 60);
    return sign * (d + m / 100 + seconds / 10000);
}

/** D.MMSS back to decimal degrees (Inv+dms). */
function fromDms(x: number): number {
    const sign = x < 0 ? -1 : 1;
    const a = Math.abs(x);
    const d = Math.floor(a);
    const rest = settle((a - d) * 100);
    const m = Math.floor(rest);
    const seconds = settle((rest - m) * 100);
    return sign * (d + m / 60 + seconds / 3600);
}

type UnaryKey = 'sqrt' | 'recip' | 'square' | 'cube' | 'ln' | 'log' | 'fact' | 'sin' | 'cos' | 'tan' | 'dms' | 'int' | 'not';

function unaryDec(s: CalcState, key: UnaryKey, x: number): number {
    switch (key) {
        case 'sqrt':
            if (x < 0) fail(ERR.invalidInput);
            return tidy(Math.sqrt(x));
        case 'recip':
            if (x === 0) fail(ERR.divideByZero);
            return tidy(1 / x);
        case 'square':
            if (!s.inv) return tidy(x * x);
            if (x < 0) fail(ERR.invalidInput);
            return tidy(Math.sqrt(x));
        case 'cube':
            return tidy(s.inv ? Math.cbrt(x) : x * x * x);
        case 'ln':
            if (s.inv) return tidy(Math.exp(x));
            if (x <= 0) fail(ERR.invalidInput);
            return tidy(Math.log(x));
        case 'log':
            if (s.inv) return tidy(Math.pow(10, x));
            if (x <= 0) fail(ERR.invalidInput);
            return tidy(Math.log10(x));
        case 'fact':
            return tidy(factorial(x));
        case 'sin':
        case 'cos':
        case 'tan':
            return tidy(trig(s, key, x));
        case 'dms':
            return tidy(s.inv ? fromDms(x) : toDms(x));
        case 'int':
            return s.inv ? tidy(x - Math.trunc(x)) : Math.trunc(x) || 0;
        case 'not':
            return Number(BigInt.asIntN(64, ~truncBig(x)));
    }
}

/** Floor square root of a non-negative BigInt: exact where a double's would not be. */
function isqrt(n: bigint): bigint {
    if (n < BigInt(2)) return n;
    let r = truncBig(Math.sqrt(Number(n)));
    while (r * r > n) r -= BIG1;
    while ((r + BIG1) * (r + BIG1) <= n) r += BIG1;
    return r;
}

/** Cube root, truncated towards zero. */
function icbrt(n: bigint): bigint {
    if (n < BIG0) return -icbrt(-n);
    let r = truncBig(Math.cbrt(Number(n)));
    while (r * r * r > n) r -= BIG1;
    while ((r + BIG1) * (r + BIG1) * (r + BIG1) <= n) r += BIG1;
    return r;
}

function unaryInt(s: CalcState, key: UnaryKey, x: bigint): bigint {
    const wrap = (v: bigint) => BigInt.asIntN(s.word, v);
    switch (key) {
        case 'recip':
            if (x === BIG0) fail(ERR.divideByZero);
            return x === BIG1 || x === -BIG1 ? x : BIG0;
        case 'square':
            if (!s.inv) return wrap(x * x);
            if (x < BIG0) fail(ERR.invalidInput);
            return isqrt(x);
        case 'cube':
            return s.inv ? icbrt(x) : wrap(x * x * x);
        case 'fact': {
            if (x < BIG0) fail(ERR.invalidInput);
            // From 66! on, the product carries 64 factors of two: modulo 2^64 it is zero, and stays so.
            const last = x > BigInt(200) ? 200 : Number(x);
            let acc = BIG1;
            for (let i = 2; i <= last && acc !== BIG0; i++) acc = wrap(acc * BigInt(i));
            return acc;
        }
        case 'int':
            return s.inv ? BIG0 : x;
        case 'not':
            return wrap(~x);
        default:
            // ln, log and their inverses: worked in doubles, then the whole part kept.
            return wrap(truncBig(unaryDec(s, key, Number(x))));
    }
}

function statistic(s: CalcState, key: 'ave' | 'sum' | 'dev'): number {
    const xs = s.stats;
    const n = xs.length;
    const sum = xs.reduce((a, b) => a + b, 0);
    const sumSq = xs.reduce((a, b) => a + b * b, 0);
    if (key === 'ave') return tidy(s.inv ? sumSq / n : sum / n);
    if (key === 'sum') return tidy(s.inv ? sumSq : sum);
    // s divides by n - 1; Inv+s by n, the population form.
    const divisor = s.inv ? n : n - 1;
    if (divisor === 0) fail(ERR.divideByZero);
    const mean = sum / n;
    const squares = xs.reduce((a, b) => a + (b - mean) * (b - mean), 0);
    return tidy(Math.sqrt(squares / divisor));
}

// ---- which keys are live ----------------------------------------------------------------------

export const isDigit = (key: Key): key is Digit => (DIGITS as readonly string[]).indexOf(key) >= 0;

/**
 * Whether a key does anything in this state — the view draws the others disabled, and neither
 * the keyboard nor Paste can reach them, just as XP greyed them.
 */
export function isEnabled(s: CalcState, key: Key): boolean {
    const sci = s.view === 'scientific';
    const dec = s.radix === 10;
    if (isDigit(key)) return DIGITS.indexOf(key) < s.radix;
    switch (key) {
        case 'point':
            return dec;
        case 'percent':
        case 'sqrt':
            return !sci;
        case 'sin':
        case 'cos':
        case 'tan':
        case 'dms':
        case 'exp':
        case 'fe':
        case 'pi':
        case 'deg':
        case 'rad':
        case 'grad':
            return sci && dec;
        case 'qword':
        case 'dword':
        case 'word':
        case 'byte':
            return sci && !dec;
        case 'dat':
            return sci && s.statsOpen;
        case 'ave':
        case 'sum':
        case 'dev':
            return sci && s.statsOpen && s.stats.length > 0;
        case 'open':
        case 'close':
        case 'mod':
        case 'and':
        case 'or':
        case 'xor':
        case 'lsh':
        case 'not':
        case 'int':
        case 'pow':
        case 'cube':
        case 'square':
        case 'ln':
        case 'log':
        case 'fact':
        case 'inv':
        case 'hyp':
        case 'sta':
        case 'hex':
        case 'dec':
        case 'oct':
        case 'bin':
            return sci;
        default:
            return true;
    }
}

// ---- typing --------------------------------------------------------------------------------------

const FRESH: Entry = { neg: false, mant: '0', exp: null, expNeg: false };

/** A typed number stays within what the display can honestly hold. */
function entryFits(s: CalcState, e: Entry): boolean {
    if (s.radix === 10) {
        const significant = e.mant.replace('.', '').replace(/^0+/, '');
        return significant.length <= DEC_DIGITS && e.mant.length <= MAX_FRACTION + 1;
    }
    return BigInt(radixPrefix(s.radix) + e.mant) < BIG1 << BigInt(s.word);
}

function typeDigit(s: CalcState, d: Digit): CalcState {
    const e0 = s.entry ?? FRESH;
    let e: Entry;
    if (e0.exp !== null) {
        const exp = (e0.exp + d).replace(/^0+/, '');
        if (exp.length > 3) return s;
        e = { ...e0, exp };
    } else {
        e = { ...e0, mant: e0.mant === '0' ? d : e0.mant + d };
        if (!entryFits(s, e)) return s;
    }
    // An exponent too large for a double is refused, the way XP refused a key past its limits.
    if (s.radix === 10 && !Number.isFinite(asNumber(parseEntry(s, e)))) return s;
    return { ...s, entry: e, afterOp: false };
}

function typePoint(s: CalcState): CalcState {
    const e0 = s.entry ?? FRESH;
    if (e0.exp !== null || e0.mant.indexOf('.') >= 0) return s;
    return { ...s, entry: { ...e0, mant: e0.mant + '.' }, afterOp: false };
}

function backspace(s: CalcState): CalcState {
    const e = s.entry;
    if (!e) return s;
    if (e.exp !== null) {
        return { ...s, entry: e.exp.length ? { ...e, exp: e.exp.slice(0, -1) } : { ...e, exp: null, expNeg: false } };
    }
    const mant = e.mant.slice(0, -1);
    return { ...s, entry: mant === '' ? { ...e, mant: '0', neg: false } : { ...e, mant } };
}

function negate(s: CalcState): CalcState {
    if (s.radix !== 10) return result(s, BigInt.asIntN(s.word, -(current(s) as bigint)));
    const e = s.entry;
    if (e) {
        if (e.exp !== null) return { ...s, entry: { ...e, expNeg: !e.expNeg } };
        // Zero has no sign to change: +/- on "0." does nothing, as on XP.
        if (!/[1-9]/.test(e.mant)) return s;
        return { ...s, entry: { ...e, neg: !e.neg } };
    }
    const v = asNumber(s.value);
    return { ...s, value: v === 0 ? 0 : -v, afterOp: false };
}

/** The value's digits as XP would key them, for Exp pressed on a result. */
function entryFromValue(x: number): Entry {
    if (x === 0) return { ...FRESH, exp: '' };
    const p = decParts(x);
    const fixed = fixedParts(p);
    if (fixed) return { neg: p.neg, mant: `${fixed.int}.${fixed.frac}`, exp: '', expNeg: false };
    return { neg: p.neg, mant: `${p.digits[0]}.${p.digits.slice(1)}`, exp: String(Math.abs(p.exp)), expNeg: p.exp < 0 };
}

function startExponent(s: CalcState): CalcState {
    if (s.entry) return s.entry.exp !== null ? s : { ...s, entry: { ...s.entry, exp: '' } };
    const e = s.afterOp ? { ...FRESH, exp: '' } : entryFromValue(asNumber(s.value));
    return { ...s, entry: e, afterOp: false };
}

// ---- the calculation --------------------------------------------------------------------------

/** Show a new value; the next digit starts a new number. */
function result(s: CalcState, v: Num): CalcState {
    return { ...s, entry: null, value: v, afterOp: false };
}

/** Finish what is being typed without changing anything else. */
function commit(s: CalcState): CalcState {
    return s.entry ? { ...s, entry: null, value: current(s) } : s;
}

function binary(s: CalcState, op: BinaryOp): CalcState {
    const levels = s.levels.slice();
    const frames = levels[levels.length - 1].slice();
    let x: Num;
    // A second operator in a row replaces the first (2 + * 3 is 2 * 3).
    if (s.afterOp && frames.length) x = (frames.pop() as Frame).left;
    else x = current(s);
    while (frames.length && precedence(s, frames[frames.length - 1].op) >= precedence(s, op)) {
        const f = frames.pop() as Frame;
        x = apply(s, f.left, f.op, x);
    }
    frames.push({ left: x, op });
    levels[levels.length - 1] = frames;
    return { ...s, levels, entry: null, value: x, afterOp: true };
}

function equals(s: CalcState): CalcState {
    let x = current(s);
    const pending = s.levels.some((l) => l.length > 0);
    if (!pending) {
        // Nothing waiting: = repeats the last operation on the number shown (2 + 3 = = gives 8).
        if (s.lastOp) x = apply(s, x, s.lastOp.op, s.lastOp.operand);
        return { ...result(s, x), levels: [[]] };
    }
    // Close every open parenthesis, innermost first.
    let lastOp: CalcState['lastOp'] = null;
    for (let i = s.levels.length - 1; i >= 0; i--) {
        const frames = s.levels[i].slice();
        while (frames.length) {
            const f = frames.pop() as Frame;
            lastOp = { op: f.op, operand: x };
            x = apply(s, f.left, f.op, x);
        }
    }
    return { ...result(s, x), levels: [[]], lastOp };
}

/** XP's %: the number shown, as a percentage of the operand waiting for it (50 + 10 % shows 5). */
function percent(s: CalcState): CalcState {
    const frames = s.levels[s.levels.length - 1];
    const top = frames[frames.length - 1];
    const x = asNumber(current(s));
    return result(s, top ? tidy((asNumber(top.left) * x) / 100) : 0);
}

function openParen(s: CalcState): CalcState {
    if (parenDepth(s) >= MAX_PARENS) return s;
    return { ...commit(s), levels: [...s.levels, []], afterOp: false };
}

function closeParen(s: CalcState): CalcState {
    if (parenDepth(s) === 0) return s;
    const frames = s.levels[s.levels.length - 1].slice();
    let x = current(s);
    while (frames.length) {
        const f = frames.pop() as Frame;
        x = apply(s, f.left, f.op, x);
    }
    return { ...result(s, x), levels: s.levels.slice(0, -1) };
}

function clearAll(s: CalcState): CalcState {
    return { ...s, entry: null, value: zeroOf(s), levels: [[]], afterOp: false, lastOp: null, error: null };
}

/** Converts everything that holds a number — display, memory, pending operands — together. */
function mapNumbers(s: CalcState, f: (v: Num) => Num): CalcState {
    return {
        ...s,
        value: f(s.value),
        memory: f(s.memory),
        levels: s.levels.map((l) => l.map((fr) => ({ ...fr, left: f(fr.left) }))),
        lastOp: s.lastOp && { ...s.lastOp, operand: f(s.lastOp.operand) },
    };
}

function setRadix(s: CalcState, radix: Radix): CalcState {
    if (radix === s.radix) return s;
    const t = mapNumbers(commit(s), (v) => convert(v, radix, s.word));
    return { ...t, radix };
}

function setWord(s: CalcState, word: WordSize): CalcState {
    if (word === s.word || s.radix === 10) return s;
    const t = mapNumbers(commit(s), (v) => BigInt.asIntN(word, v as bigint));
    return { ...t, word };
}

/** Inv and Hyp modify one function and then clear, as XP's check boxes did. */
const consumed = (s: CalcState): CalcState => ({ ...s, inv: false, hyp: false });

function step(s: CalcState, key: Key): CalcState {
    if (isDigit(key)) return typeDigit(s, key);
    switch (key) {
        case 'point':
            return typePoint(s);
        case 'negate':
            return negate(s);
        case 'back':
            return backspace(s);
        case 'ce':
            return { ...s, entry: null, value: zeroOf(s), afterOp: false, error: null };
        case 'clear':
            return clearAll(s);
        case 'add':
        case 'sub':
        case 'mul':
        case 'div':
        case 'mod':
        case 'and':
        case 'or':
        case 'xor':
            return binary(s, key);
        case 'pow':
            return binary(consumed(s), s.inv ? 'root' : 'pow');
        case 'lsh':
            return binary(consumed(s), s.inv ? 'rsh' : 'lsh');
        case 'equals':
            return equals(s);
        case 'percent':
            return percent(s);
        case 'open':
            return openParen(s);
        case 'close':
            return closeParen(s);
        case 'mc':
            return { ...s, memory: zeroOf(s) };
        case 'mr':
            return result(s, s.memory);
        case 'ms':
            return { ...commit(s), memory: current(s) };
        case 'mplus':
            return { ...commit(s), memory: apply(s, s.memory, 'add', current(s)) };
        case 'inv':
            return { ...s, inv: !s.inv };
        case 'hyp':
            return { ...s, hyp: !s.hyp };
        case 'fe':
            return { ...commit(s), fe: !s.fe };
        case 'exp':
            return startExponent(s);
        case 'pi':
            return result(consumed(s), s.inv ? 2 * Math.PI : Math.PI);
        case 'sta':
            return { ...s, statsOpen: !s.statsOpen };
        case 'dat':
            return { ...commit(s), stats: [...s.stats, asNumber(current(s))] };
        case 'ave':
        case 'sum':
        case 'dev':
            return result(consumed(s), fromNumber(s, statistic(s, key)));
        case 'hex':
            return setRadix(s, 16);
        case 'dec':
            return setRadix(s, 10);
        case 'oct':
            return setRadix(s, 8);
        case 'bin':
            return setRadix(s, 2);
        case 'deg':
        case 'rad':
        case 'grad':
            return { ...s, angle: key };
        case 'qword':
            return setWord(s, 64);
        case 'dword':
            return setWord(s, 32);
        case 'word':
            return setWord(s, 16);
        case 'byte':
            return setWord(s, 8);
        default: {
            const x = current(s);
            const v = typeof x === 'bigint' ? unaryInt(s, key, x) : unaryDec(s, key, x);
            return result(consumed(s), v);
        }
    }
}

/**
 * Press one key. A key that is disabled here does nothing; after an error only C and CE do
 * anything, as on XP. A failure leaves its message in the display and drops the calculation.
 */
export function press(s: CalcState, key: Key): CalcState {
    if (!isEnabled(s, key)) return s;
    if (s.error !== null && key !== 'clear' && key !== 'ce') return s;
    try {
        return step(s, key);
    } catch (e) {
        const message = failureText(e);
        if (message === null) throw e;
        return { ...clearAll(s), error: message, inv: false, hyp: false };
    }
}

/**
 * Standard is always decimal, so switching to it converts the number shown; either way the
 * pending calculation is dropped, because the two views would evaluate it differently.
 */
export function setView(s: CalcState, view: View): CalcState {
    if (view === s.view) return s;
    let t = s.error !== null ? clearAll(s) : commit(s);
    if (view === 'standard') t = setRadix(t, 10);
    return { ...t, view, levels: [[]], afterOp: false, lastOp: null, inv: false, hyp: false, fe: false, statsOpen: false };
}

export const toggleGrouping = (s: CalcState): CalcState => ({ ...s, grouping: !s.grouping });

// ---- the Statistics Box ------------------------------------------------------------------------

/** LOAD: put a stored value on the display. */
export function statLoad(s: CalcState, index: number): CalcState {
    if (s.error !== null || index < 0 || index >= s.stats.length) return s;
    return result(s, fromNumber(s, s.stats[index]));
}

/** CD: delete one value. */
export function statDelete(s: CalcState, index: number): CalcState {
    if (index < 0 || index >= s.stats.length) return s;
    return { ...s, stats: s.stats.filter((_, i) => i !== index) };
}

/** CAD: delete them all. */
export const statClearAll = (s: CalcState): CalcState => ({ ...s, stats: [] });

// ---- the display --------------------------------------------------------------------------------

interface DecParts {
    neg: boolean;
    /** Significant digits, trailing zeros removed; the first is the units digit at `exp`. */
    digits: string;
    exp: number;
}

function decParts(x: number): DecParts {
    const [mantissa, exponent] = Math.abs(x).toExponential(DEC_DIGITS - 1).split('e');
    return { neg: x < 0, digits: mantissa.replace('.', '').replace(/0+$/, '') || '0', exp: Number(exponent) };
}

/** Whole and fractional digits for fixed-point display, or null when it needs an exponent. */
function fixedParts(p: DecParts): { int: string; frac: string } | null {
    if (p.exp >= DEC_DIGITS) return null;
    if (p.exp >= 0) {
        const int = p.digits.slice(0, p.exp + 1);
        return { int: int + '0'.repeat(p.exp + 1 - int.length), frac: p.digits.slice(p.exp + 1) };
    }
    const frac = '0'.repeat(-p.exp - 1) + p.digits;
    return frac.length > MAX_FRACTION ? null : { int: '0', frac };
}

/** Groups of `size` from the right, as View > Digit grouping showed them. */
export function groupDigits(digits: string, size: number, separator: string): string {
    let out = '';
    for (let i = digits.length; i > 0; i -= size) out = digits.slice(Math.max(0, i - size), i) + (out ? separator + out : '');
    return out;
}

/** Decimal as XP drew it: always with its point ("0.", "12."), scientific as "1.5e+20". */
export function formatDec(x: number, fe: boolean, grouping: boolean): string {
    if (x === 0) return fe ? '0.e+0' : '0.';
    const p = decParts(x);
    const sign = p.neg ? '-' : '';
    const fixed = fe ? null : fixedParts(p);
    if (!fixed) return `${sign}${p.digits[0]}.${p.digits.slice(1)}e${p.exp < 0 ? '-' : '+'}${Math.abs(p.exp)}`;
    return `${sign}${grouping ? groupDigits(fixed.int, 3, ',') : fixed.int}.${fixed.frac}`;
}

/** Hex, Oct and Bin show the word's bits: negative numbers in two's complement. */
export function formatInt(v: bigint, radix: Radix, word: WordSize, grouping: boolean): string {
    const digits = BigInt.asUintN(word, v).toString(radix).toUpperCase();
    return grouping ? groupDigits(digits, radix === 8 ? 3 : 4, ' ') : digits;
}

type Format = Pick<CalcState, 'radix' | 'word' | 'fe' | 'grouping'>;

export function formatValue(f: Format, v: Num): string {
    if (f.radix === 10) return formatDec(asNumber(v), f.fe, f.grouping);
    return formatInt(convert(v, f.radix, f.word) as bigint, f.radix, f.word, f.grouping);
}

function formatEntry(s: CalcState, e: Entry): string {
    if (s.radix !== 10) return s.grouping ? groupDigits(e.mant, s.radix === 8 ? 3 : 4, ' ') : e.mant;
    const [int, frac = ''] = e.mant.split('.');
    let text = `${e.neg ? '-' : ''}${s.grouping ? groupDigits(int, 3, ',') : int}.${frac}`;
    if (e.exp !== null) text += `e${e.expNeg ? '-' : '+'}${e.exp || '0'}`;
    return text;
}

/** Exactly what the display shows. */
export function displayText(s: CalcState): string {
    if (s.error !== null) return s.error;
    return s.entry ? formatEntry(s, s.entry) : formatValue(s, s.value);
}

/** A stored statistic in the current number system, for the Statistics Box list. */
export const formatStat = (s: CalcState, x: number): string => formatValue(s, fromNumber(s, x));

/**
 * What Copy puts on the clipboard: the display without grouping or XP's trailing point, so it
 * pastes as a number anywhere else ("12." copies as "12").
 */
export function copyText(s: CalcState): string {
    if (s.error !== null) return s.error;
    return displayText({ ...s, grouping: false }).replace(/\.(?=e|$)/, '');
}
