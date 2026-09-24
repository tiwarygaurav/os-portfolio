import { isEnabled, press, type CalcState, type Digit, type Key } from './engine';

/**
 * XP Calculator's keyboard, and its Paste — which fed the clipboard through that same keyboard.
 *
 * Pure like the engine: it maps a key description to a calculator key, so the component's
 * `onKeyDown` and the paste loop share one table and cannot disagree about what "s" or "%" means.
 */

/** The parts of a KeyboardEvent the map reads; a pasted character supplies only `key`. */
export interface Keystroke {
    key: string;
    ctrlKey?: boolean;
    altKey?: boolean;
    metaKey?: boolean;
}

/** Keys that mean the same in both views. */
const COMMON: Record<string, Key> = {
    Enter: 'equals',
    '=': 'equals',
    Escape: 'clear',
    Delete: 'ce',
    Backspace: 'back',
    F9: 'negate',
    '.': 'point',
    ',': 'point',
    '+': 'add',
    '-': 'sub',
    '*': 'mul',
    '/': 'div',
    r: 'recip',
    R: 'recip',
};

/** Scientific view's symbol and function keys. */
const SCIENTIFIC: Record<string, Key> = {
    '(': 'open',
    ')': 'close',
    '%': 'mod',
    '&': 'and',
    '|': 'or',
    '^': 'xor',
    '<': 'lsh',
    '~': 'not',
    ';': 'int',
    '!': 'fact',
    '@': 'square',
    '#': 'cube',
    Insert: 'dat',
    F5: 'hex',
    F6: 'dec',
    F7: 'oct',
    F8: 'bin',
    F12: 'qword',
};

/** Letters, case-insensitive. Scientific only. */
const LETTERS: Record<string, Key> = {
    s: 'sin',
    o: 'cos',
    t: 'tan',
    n: 'ln',
    l: 'log',
    y: 'pow',
    p: 'pi',
    x: 'exp',
    m: 'dms',
    v: 'fe',
    i: 'inv',
    h: 'hyp',
};

const own = <T>(table: Record<string, T>, key: string): T | undefined =>
    Object.prototype.hasOwnProperty.call(table, key) ? table[key] : undefined;

/**
 * The calculator key a keystroke stands for in this state, or null when it is not a calculator
 * key at all (and should be left to the menus, the window and the desktop). Whether the key is
 * live — A in Dec, sin in Hex — is `isEnabled`'s question, not this one's.
 */
export function keyFor(k: Keystroke, s: CalcState): Key | null {
    // Alt belongs to the menu bar.
    if (k.altKey) return null;
    const sci = s.view === 'scientific';
    const ch = k.key;

    if (k.ctrlKey || k.metaKey) {
        switch (ch.toLowerCase()) {
            case 'm':
                return 'ms';
            case 'r':
                return 'mr';
            case 'l':
                return 'mc';
            case 'p':
                return 'mplus';
            case 's':
                return sci ? 'sta' : null;
            case 'a':
                return sci ? 'ave' : null;
            case 't':
                return sci ? 'sum' : null;
            case 'd':
                return sci ? 'dev' : null;
            default:
                return null;
        }
    }

    if (/^[0-9]$/.test(ch)) return ch as Digit;
    const common = own(COMMON, ch);
    if (common) return common;

    if (!sci) {
        if (ch === '%') return 'percent';
        if (ch === '@') return 'sqrt';
        return null;
    }

    // F2-F4 are the angle units in Dec and the word sizes everywhere else, as on XP.
    if (ch === 'F2') return s.radix === 10 ? 'deg' : 'dword';
    if (ch === 'F3') return s.radix === 10 ? 'rad' : 'word';
    if (ch === 'F4') return s.radix === 10 ? 'grad' : 'byte';
    const symbol = own(SCIENTIFIC, ch);
    if (symbol) return symbol;

    if (ch.length !== 1) return null;
    const lower = ch.toLowerCase();
    if (s.radix === 16 && lower >= 'a' && lower <= 'f') return lower.toUpperCase() as Digit;
    return own(LETTERS, lower) ?? null;
}

/** XP's paste codes for the keys that have no character of their own. */
function colonCode(c: string): Key | null {
    switch (c.toLowerCase()) {
        case 'c':
            return 'mc';
        case 'e':
            return 'exp';
        case 'm':
            return 'ms';
        case 'p':
            return 'mplus';
        case 'q':
            return 'clear';
        case 'r':
            return 'mr';
        default:
            return null;
    }
}

/** More than anyone would paste into a calculator; keeps a pasted novel from freezing the tab. */
export const MAX_PASTE = 10000;

/**
 * Paste, the way XP did it: every character is typed in turn, so "12+3=" computes 15. The map
 * is consulted per character because an earlier one can change it (F5-style keys cannot be
 * pasted, but "(" in Standard is ignored and in Scientific is a parenthesis). ":c", ":e", ":m",
 * ":p", ":q" and ":r" are MC, Exp, MS, M+, C and MR, and "\" is Dat. Anything that is not a key
 * — spaces, commas used as thousands separators, letters — is skipped.
 */
export function pasteText(s: CalcState, text: string): { state: CalcState; used: number } {
    let state = s;
    let used = 0;
    const t = text.slice(0, MAX_PASTE);
    for (let i = 0; i < t.length; i++) {
        const ch = t[i];
        let key: Key | null;
        const code = ch === ':' && i + 1 < t.length ? colonCode(t[i + 1]) : null;
        if (code) {
            key = code;
            i++;
        } else if (ch === '\\') {
            key = 'dat';
        } else if (ch === ',') {
            // A thousands separator in pasted text, not a decimal point.
            continue;
        } else {
            key = keyFor({ key: ch }, state);
        }
        if (!key || !isEnabled(state, key)) continue;
        state = press(state, key);
        used++;
    }
    return { state, used };
}
