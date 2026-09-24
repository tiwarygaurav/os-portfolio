"use client";

import {
    useEffect,
    useId,
    useLayoutEffect,
    useRef,
    useState,
    type ClipboardEvent as ReactClipboardEvent,
    type CSSProperties,
    type KeyboardEvent as ReactKeyboardEvent,
    type ReactNode,
} from 'react';
import { PROFILE, SYSTEM } from '@/content';
import { useSystemStore } from '@/store/useSystemStore';
import { xpAlert } from '@/utils/dialog';
import MenuBar, { type MenuDef, type MenuEntry } from '@/components/ui/MenuBar';
import { XPCheckbox, XPRadio } from '@/components/ui/xp-controls';
import {
    copyText,
    displayText,
    formatStat,
    initialState,
    isEnabled,
    memoryHolds,
    parenDepth,
    press,
    setView,
    statClearAll,
    statDelete,
    statLoad,
    toggleGrouping,
    type CalcState,
    type Digit,
    type Key,
    type View,
} from './calculator/engine';
import { keyFor, pasteText } from './calculator/input';
import HelpDialog from './calculator/HelpDialog';
import StatisticsBox from './calculator/StatisticsBox';

/**
 * Calculator — Windows XP's calc.exe 5.1, Standard and Scientific.
 *
 * The arithmetic lives in `calculator/engine.ts` as pure functions and the keyboard map in
 * `calculator/input.ts`; this file draws the keypad and routes input to them. The keypad is laid
 * out in fixed pixels, as XP's was, and the window is sized to fit it: switching view (or opening
 * the Statistics Box) resizes the window, the way XP's Calculator jumped between its two sizes.
 * On a phone, where every window is maximised, the keypad is centred and scaled to fit instead.
 */

// ---- geometry -----------------------------------------------------------------------------------

const KEY_W = 36;
const KEY_H = 28;
/** Between keys in one block. */
const GAP = 4;
/** Between blocks: the memory column, the function keys, the digits. */
const BLOCK = 8;
const PAD = 6;
const DISPLAY_H = 23;
/** Largest a maximised keypad is scaled up, so a tablet does not get fist-sized keys. */
const MAX_SCALE = 3;

/** Width of `n` keys side by side in one block. */
const span = (n: number) => n * KEY_W + (n - 1) * GAP;
const STD_WIDTH = KEY_W + BLOCK + span(5);
const SCI_WIDTH = KEY_W + BLOCK + span(3) + BLOCK + KEY_W + BLOCK + span(6);

// ---- keys ---------------------------------------------------------------------------------------

/*
 * XP's key colours. Set inline because `app/luna.css` loads after Tailwind and wins ties, and left
 * off a disabled key so luna.css can grey it.
 */
const BLUE = '#0000ff';
const RED = '#ff0000';
const NAVY = '#000080';
const PURPLE = '#800080';

interface KeyDef {
    key: Key;
    label: string;
    color: string;
    /** Accessible name, where the label is a symbol. */
    name?: string;
}

const def = (key: Key, label: string, color: string, name?: string): KeyDef => ({ key, label, color, name });
const digit = (d: Digit) => def(d, d, BLUE);

const CLEAR_KEYS = [def('back', 'Backspace', RED), def('ce', 'CE', RED, 'Clear entry'), def('clear', 'C', RED, 'Clear')];
const MEMORY_KEYS = [
    def('mc', 'MC', RED, 'Memory clear'),
    def('mr', 'MR', RED, 'Memory recall'),
    def('ms', 'MS', RED, 'Memory store'),
    def('mplus', 'M+', RED, 'Memory add'),
];
const DIV = def('div', '/', RED, 'Divide');
const MUL = def('mul', '*', RED, 'Multiply');
const SUB = def('sub', '-', RED, 'Subtract');
const ADD = def('add', '+', RED, 'Add');
const EQUALS = def('equals', '=', RED, 'Equals');
const NEGATE = def('negate', '+/-', BLUE, 'Negate');
const POINT = def('point', '.', BLUE, 'Decimal point');

const STANDARD_KEYS: KeyDef[] = [
    digit('7'), digit('8'), digit('9'), DIV, def('sqrt', 'sqrt', NAVY, 'Square root'),
    digit('4'), digit('5'), digit('6'), MUL, def('percent', '%', NAVY, 'Percent'),
    digit('1'), digit('2'), digit('3'), SUB, def('recip', '1/x', NAVY, 'Reciprocal'),
    digit('0'), NEGATE, POINT, ADD, EQUALS,
];

const STAT_KEYS = [
    def('sta', 'Sta', NAVY, 'Statistics Box'),
    def('ave', 'Ave', NAVY, 'Average'),
    def('sum', 'Sum', NAVY),
    def('dev', 's', NAVY, 'Standard deviation'),
    def('dat', 'Dat', NAVY, 'Add to statistics'),
];

const FUNCTION_KEYS: KeyDef[] = [
    def('fe', 'F-E', PURPLE, 'Scientific notation'), def('open', '(', PURPLE, 'Open parenthesis'), def('close', ')', PURPLE, 'Close parenthesis'),
    def('dms', 'dms', PURPLE), def('exp', 'Exp', PURPLE), def('ln', 'ln', PURPLE),
    def('sin', 'sin', PURPLE), def('pow', 'x^y', PURPLE, 'x to the power y'), def('log', 'log', PURPLE),
    def('cos', 'cos', PURPLE), def('cube', 'x^3', PURPLE, 'Cube'), def('fact', 'n!', PURPLE, 'Factorial'),
    def('tan', 'tan', PURPLE), def('square', 'x^2', PURPLE, 'Square'), def('recip', '1/x', PURPLE, 'Reciprocal'),
];

const SCI_MEMORY_KEYS = [...MEMORY_KEYS, def('pi', 'pi', BLUE, 'Pi')];

const SCIENTIFIC_KEYS: KeyDef[] = [
    digit('7'), digit('8'), digit('9'), DIV, def('mod', 'Mod', RED), def('and', 'And', RED),
    digit('4'), digit('5'), digit('6'), MUL, def('or', 'Or', RED), def('xor', 'Xor', RED),
    digit('1'), digit('2'), digit('3'), SUB, def('lsh', 'Lsh', RED, 'Left shift'), def('not', 'Not', RED),
    digit('0'), NEGATE, POINT, ADD, EQUALS, def('int', 'Int', RED, 'Integer part'),
    digit('A'), digit('B'), digit('C'), digit('D'), digit('E'), digit('F'),
];

const RADIXES: { key: Key; label: string; radix: CalcState['radix'] }[] = [
    { key: 'hex', label: 'Hex', radix: 16 },
    { key: 'dec', label: 'Dec', radix: 10 },
    { key: 'oct', label: 'Oct', radix: 8 },
    { key: 'bin', label: 'Bin', radix: 2 },
];
const ANGLES: { key: Key; label: string; angle: CalcState['angle'] }[] = [
    { key: 'deg', label: 'Degrees', angle: 'deg' },
    { key: 'rad', label: 'Radians', angle: 'rad' },
    { key: 'grad', label: 'Grads', angle: 'grad' },
];
const WORDS: { key: Key; label: string; word: CalcState['word'] }[] = [
    { key: 'qword', label: 'Qword', word: 64 },
    { key: 'dword', label: 'Dword', word: 32 },
    { key: 'word', label: 'Word', word: 16 },
    { key: 'byte', label: 'Byte', word: 8 },
];

/** XP's pressed key — `app/luna.css`'s `.xp-button:active` — shown for a key typed on the keyboard. */
const PRESSED: CSSProperties = {
    background: 'linear-gradient(180deg, #cdcac3 0%, #e3e3db 8%, #e5e5de 94%, #f2f2f1 100%)',
    boxShadow: 'none',
};

/** A sunken XP static: the M and (=n indicator boxes. */
const SUNKEN = 'inset 1px 1px #aca899, inset -1px -1px #fff';

/*
 * Paste reads the clipboard through the async Clipboard API's read half, which some browsers do not
 * expose to pages. Decided once at load; without it Edit > Paste is disabled and says why. Ctrl+V
 * does not need it — it arrives as the browser's own paste event.
 */
const canReadClipboard = typeof navigator !== 'undefined' && typeof navigator.clipboard?.readText === 'function';

// ---- pieces -------------------------------------------------------------------------------------

function CalcKey({ k, width = KEY_W, enabled, lit, onPress }: { k: KeyDef; width?: number; enabled: boolean; lit: boolean; onPress: (key: Key) => void }) {
    return (
        <button
            type="button"
            tabIndex={-1}
            className="xp-button"
            data-key={k.key}
            aria-label={k.name}
            disabled={!enabled}
            // Keep the keyboard on the calculator: a focused button would take Enter for itself.
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => onPress(k.key)}
            style={{
                width,
                height: KEY_H,
                minWidth: 0,
                minHeight: 0,
                padding: 0,
                color: enabled ? k.color : undefined,
                ...(lit ? PRESSED : {}),
            }}
        >
            {k.label}
        </button>
    );
}

/**
 * The display: right-aligned, and shrunk to fit if what it shows is ever wider than it.
 *
 * `[data-calc-display]` holds exactly the number shown, or the error message — the stable hook
 * that tests and tools read. XP's trailing decimal point ("78.") marks where the point would go
 * rather than being part of the number, so it is drawn beside that element, not inside it.
 */
function Display({ text, marker, width }: { text: string; marker: string; width: number }) {
    const boxRef = useRef<HTMLDivElement>(null);
    const textRef = useRef<HTMLSpanElement>(null);
    const [fit, setFit] = useState(1);

    useLayoutEffect(() => {
        const box = boxRef.current;
        const t = textRef.current;
        if (!box || !t) return;
        const room = box.clientWidth - 10;
        setFit(t.offsetWidth > room && room > 0 ? room / t.offsetWidth : 1);
    }, [text, marker, width]);

    return (
        <div
            ref={boxRef}
            role="status"
            aria-label="Display"
            className="xp-input relative overflow-hidden"
            style={{ width, height: DISPLAY_H }}
        >
            <span
                ref={textRef}
                className="absolute right-[5px] top-1/2 whitespace-nowrap"
                style={{ transform: `translateY(-50%) scale(${fit})`, transformOrigin: 'right center' }}
            >
                <span data-calc-display>{text}</span>
                {marker && <span aria-hidden>{marker}</span>}
            </span>
        </div>
    );
}

function Well({ label, width, children }: { label: string; width: number; children: ReactNode }) {
    return (
        <div
            role="status"
            aria-label={label}
            className="flex shrink-0 items-center justify-center"
            style={{ width, height: 24, boxShadow: SUNKEN }}
        >
            {children}
        </div>
    );
}

/** XP's captionless frames round the radio buttons and check boxes. */
function Frame({ label, width, children }: { label: string; width: number; children: ReactNode }) {
    return (
        <fieldset className="xp-groupbox flex items-center justify-around" style={{ width, height: KEY_H, minWidth: 0, padding: '0 4px' }}>
            <legend className="sr-only">{label}</legend>
            {children}
        </fieldset>
    );
}

const grid = (columns: number): CSSProperties => ({
    display: 'grid',
    gridTemplateColumns: `repeat(${columns}, ${KEY_W}px)`,
    gridAutoRows: `${KEY_H}px`,
    gap: GAP,
});

// ---- the app ------------------------------------------------------------------------------------

interface CalculatorAppProps {
    windowId?: string;
    payload?: Record<string, string>;
}

export default function CalculatorApp({ windowId }: CalculatorAppProps) {
    const active = useSystemStore((s) => s.activeWindowId === windowId);
    const resizeWindow = useSystemStore((s) => s.actions.resizeWindow);
    const win = useSystemStore((s) => s.windows.find((w) => w.id === windowId));
    const maximized = !!win?.isMaximized;
    const id = useId();

    const [calc, setCalc] = useState<CalcState>(initialState);
    // Short-lived message for clipboard outcomes — never a native alert. Numbered, so the same
    // message twice in a row restarts its three seconds instead of vanishing early.
    const [notice, setNotice] = useState<{ text: string; serial: number } | null>(null);
    const say = (text: string) => setNotice((prev) => ({ text, serial: (prev?.serial ?? 0) + 1 }));
    const [lit, setLit] = useState<Key | null>(null);
    const [help, setHelp] = useState(false);
    const [statIndex, setStatIndex] = useState<number | null>(null);
    const [scale, setScale] = useState(1);
    const [rootHeight, setRootHeight] = useState(0);

    const rootRef = useRef<HTMLDivElement>(null);
    const areaRef = useRef<HTMLDivElement>(null);
    const contentRef = useRef<HTMLDivElement>(null);

    // Handlers can run more than once before React re-renders — a paste is many keys — so they read
    // and write the latest state here.
    const calcRef = useRef(calc);
    calcRef.current = calc;
    const sizeRef = useRef(win?.size);
    sizeRef.current = win?.size;
    const maximizedRef = useRef(maximized);
    maximizedRef.current = maximized;

    const timers = useRef({ lit: 0, clipboard: 0 });
    const clipboardPending = useRef<'copy' | 'paste' | null>(null);

    const update = (f: (s: CalcState) => CalcState) => {
        const next = f(calcRef.current);
        if (next === calcRef.current) return;
        calcRef.current = next;
        setCalc(next);
    };
    const pressKey = (key: Key) => update((s) => press(s, key));
    const focusKeypad = () => rootRef.current?.focus({ preventScroll: true });

    useEffect(() => {
        if (!notice) return;
        const t = window.setTimeout(() => setNotice(null), 3000);
        return () => window.clearTimeout(t);
    }, [notice]);

    useEffect(() => {
        const t = timers.current;
        return () => {
            window.clearTimeout(t.lit);
            window.clearTimeout(t.clipboard);
        };
    }, []);

    /*
     * Keep the keyboard on the calculator while its window is the active one — including after a
     * radio button that had focus disappears (Dec's angle units give way to Hex's word sizes).
     */
    useEffect(() => {
        const root = rootRef.current;
        const focused = document.activeElement;
        // A removed element hands focus to the page body; take it back.
        if (active && root && (!focused || focused === document.body)) root.focus({ preventScroll: true });
    }, [active, calc.view, calc.radix, calc.statsOpen]);

    useEffect(() => {
        const root = rootRef.current;
        if (active && root && !root.contains(document.activeElement)) root.focus({ preventScroll: true });
    }, [active]);

    // ---- window size ----------------------------------------------------------------------------

    /*
     * Fit the window to the keypad, as XP did on every change of view. The chrome (frame and title
     * bar) is measured, not assumed: the frame's rendered size minus this app's own. Both come from
     * the DOM, so they always describe the same moment — the store's size can briefly run ahead of
     * the frame while the window catches up with it.
     */
    useLayoutEffect(() => {
        const root = rootRef.current;
        const area = areaRef.current;
        const content = contentRef.current;
        if (!root || !area || !content) return;
        const measure = () => {
            // Zero while minimised (display: none): keep the last good measurements.
            if (!root.clientWidth) return;
            setRootHeight(root.clientHeight);
            const naturalW = content.offsetWidth;
            const naturalH = content.offsetHeight;
            if (maximizedRef.current) {
                // A maximised window (a phone) cannot be resized; the keypad scales to it instead.
                const k = Math.min(area.clientWidth / naturalW, area.clientHeight / naturalH, MAX_SCALE);
                setScale(Math.max(0.1, Math.floor(k * 100) / 100));
                return;
            }
            setScale(1);
            const size = sizeRef.current;
            if (!windowId || !size) return;
            const frame = root.closest<HTMLElement>('[data-window]');
            const chromeW = (frame ? frame.offsetWidth : size.width) - root.clientWidth;
            const chromeH = (frame ? frame.offsetHeight : size.height) - root.clientHeight;
            const menuH = root.clientHeight - area.clientHeight;
            const width = naturalW + chromeW;
            const height = naturalH + menuH + chromeH;
            if (width !== size.width || height !== size.height) resizeWindow(windowId, { width, height });
        };
        measure();
        const observer = new ResizeObserver(measure);
        observer.observe(content);
        observer.observe(area);
        return () => observer.disconnect();
    }, [maximized, windowId, resizeWindow]);

    // ---- clipboard ------------------------------------------------------------------------------

    const copyDisplay = async () => {
        try {
            await navigator.clipboard.writeText(copyText(calcRef.current));
            say('Copied to clipboard.');
        } catch {
            say('Copy failed: the browser refused clipboard access.');
        }
    };

    /** XP's Paste: the text is typed in, key by key. */
    const typeIn = (text: string) => {
        const { state, used } = pasteText(calcRef.current, text);
        if (!used) {
            say('The clipboard holds nothing Calculator can type.');
            return;
        }
        update(() => state);
    };

    const pasteFromClipboard = async () => {
        try {
            typeIn(await navigator.clipboard.readText());
        } catch {
            say('Paste failed: the browser refused clipboard access.');
        }
    };

    /*
     * Ctrl+C and Ctrl+V arrive as the browser's own copy and paste events, which need no
     * permission. A browser that fires neither at a page with nothing selected gets the Clipboard
     * API instead, a moment later.
     */
    const armClipboardFallback = (kind: 'copy' | 'paste') => {
        clipboardPending.current = kind;
        window.clearTimeout(timers.current.clipboard);
        timers.current.clipboard = window.setTimeout(() => {
            if (clipboardPending.current !== kind) return;
            clipboardPending.current = null;
            if (kind === 'copy') void copyDisplay();
            else if (canReadClipboard) void pasteFromClipboard();
        }, 80);
    };

    const onCopy = (e: ReactClipboardEvent<HTMLDivElement>) => {
        // With Help open, Ctrl+C copies whatever text is selected in it, as usual.
        if (help) return;
        clipboardPending.current = null;
        e.preventDefault();
        e.clipboardData.setData('text/plain', copyText(calcRef.current));
        say('Copied to clipboard.');
    };

    const onPaste = (e: ReactClipboardEvent<HTMLDivElement>) => {
        if (help) return;
        clipboardPending.current = null;
        e.preventDefault();
        typeIn(e.clipboardData.getData('text/plain'));
    };

    // ---- keyboard -------------------------------------------------------------------------------

    const flash = (key: Key) => {
        setLit(key);
        window.clearTimeout(timers.current.lit);
        timers.current.lit = window.setTimeout(() => setLit(null), 120);
    };

    const onKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
        // The Help dialog keeps its own keys.
        if (help) return;
        const lower = e.key.toLowerCase();
        if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && (lower === 'c' || lower === 'v')) {
            e.stopPropagation();
            armClipboardFallback(lower === 'c' ? 'copy' : 'paste');
            return;
        }
        const key = keyFor(e, calcRef.current);
        if (!key) return;
        // Ours, even when greyed: the desktop and the browser (F5, Ctrl+P...) must not act on it.
        e.preventDefault();
        e.stopPropagation();
        if (!isEnabled(calcRef.current, key)) return;
        flash(key);
        pressKey(key);
    };

    // ---- menus ------------------------------------------------------------------------------------

    const switchView = (view: View) => {
        update((s) => setView(s, view));
        focusKeypad();
    };

    const sci = calc.view === 'scientific';
    const dec = calc.radix === 10;

    const viewItems: MenuEntry[] = [
        { label: 'Standard', accessKey: 't', radio: true, checked: !sci, onSelect: () => switchView('standard') },
        { label: 'Scientific', radio: true, checked: sci, onSelect: () => switchView('scientific') },
        null,
        { label: 'Digit grouping', accessKey: 'i', checked: calc.grouping, onSelect: () => update(toggleGrouping) },
    ];
    if (sci) {
        viewItems.push(
            null,
            { label: 'Hex', shortcut: 'F5', radio: true, checked: calc.radix === 16, onSelect: () => pressKey('hex') },
            { label: 'Decimal', shortcut: 'F6', radio: true, checked: dec, onSelect: () => pressKey('dec') },
            { label: 'Octal', shortcut: 'F7', radio: true, checked: calc.radix === 8, onSelect: () => pressKey('oct') },
            { label: 'Binary', shortcut: 'F8', radio: true, checked: calc.radix === 2, onSelect: () => pressKey('bin') },
            null,
        );
        if (dec) {
            viewItems.push(
                { label: 'Degrees', accessKey: 'e', shortcut: 'F2', radio: true, checked: calc.angle === 'deg', onSelect: () => pressKey('deg') },
                { label: 'Radians', shortcut: 'F3', radio: true, checked: calc.angle === 'rad', onSelect: () => pressKey('rad') },
                { label: 'Grads', shortcut: 'F4', radio: true, checked: calc.angle === 'grad', onSelect: () => pressKey('grad') },
            );
        } else {
            // Qword's F12 is not shown: most browsers keep F12 for their developer tools.
            viewItems.push(
                { label: 'Qword', radio: true, checked: calc.word === 64, onSelect: () => pressKey('qword') },
                { label: 'Dword', accessKey: 'w', shortcut: 'F2', radio: true, checked: calc.word === 32, onSelect: () => pressKey('dword') },
                { label: 'Word', accessKey: 'r', shortcut: 'F3', radio: true, checked: calc.word === 16, onSelect: () => pressKey('word') },
                { label: 'Byte', accessKey: 'y', shortcut: 'F4', radio: true, checked: calc.word === 8, onSelect: () => pressKey('byte') },
            );
        }
    }

    const menus: MenuDef[] = [
        {
            label: 'Edit',
            items: [
                { label: 'Copy', shortcut: 'Ctrl+C', onSelect: () => void copyDisplay() },
                canReadClipboard
                    ? { label: 'Paste', shortcut: 'Ctrl+V', onSelect: () => void pasteFromClipboard() }
                    : { label: 'Paste (clipboard read not permitted here)', accessKey: 'p', disabled: true, onSelect: () => undefined },
            ],
        },
        { label: 'View', items: viewItems },
        {
            label: 'Help',
            items: [
                { label: 'Help Topics', onSelect: () => setHelp(true) },
                null,
                { label: 'About Calculator', onSelect: () => void xpAlert('About Calculator', ['Calculator', SYSTEM.name, PROFILE.name]) },
            ],
        },
    ];

    // ---- rendering --------------------------------------------------------------------------------

    const keyButton = (k: KeyDef, width?: number) => (
        <CalcKey key={k.key} k={k} width={width} enabled={isEnabled(calc, k.key)} lit={lit === k.key} onPress={pressKey} />
    );
    const memoryMark = memoryHolds(calc) ? 'M' : '';
    const depth = parenDepth(calc);
    const width = sci ? SCI_WIDTH : STD_WIDTH;
    const selected = statIndex !== null && statIndex < calc.stats.length ? statIndex : null;
    const shown = displayText(calc);
    // XP's trailing point on a decimal number ("78."); an error message keeps its own full stop.
    const marker = calc.error === null && calc.radix === 10 && shown.endsWith('.') ? '.' : '';

    const standard = (
        <div className="flex" style={{ marginTop: 7, gap: BLOCK }}>
            <div style={grid(1)}>
                <div className="flex items-center justify-center">
                    <Well label="Memory" width={28}>
                        {memoryMark}
                    </Well>
                </div>
                {MEMORY_KEYS.map((k) => keyButton(k))}
            </div>
            <div style={grid(5)}>
                <div className="flex" style={{ gridColumn: '1 / -1', gap: GAP }}>
                    {CLEAR_KEYS.map((k) => keyButton(k, (span(5) - 2 * GAP) / 3))}
                </div>
                {STANDARD_KEYS.map((k) => keyButton(k))}
            </div>
        </div>
    );

    const scientific = (
        <>
            <div className="flex" style={{ marginTop: 6, gap: BLOCK }}>
                <Frame label="Number system" width={KEY_W + BLOCK + span(3) + BLOCK + KEY_W}>
                    {RADIXES.map((r) => (
                        <XPRadio key={r.key} name={`${id}-radix`} checked={calc.radix === r.radix} onChange={() => pressKey(r.key)} label={r.label} />
                    ))}
                </Frame>
                <Frame label={dec ? 'Angle unit' : 'Word size'} width={span(6)}>
                    {dec
                        ? ANGLES.map((a) => (
                              <XPRadio key={a.key} name={`${id}-angle`} checked={calc.angle === a.angle} onChange={() => pressKey(a.key)} label={a.label} />
                          ))
                        : WORDS.map((w) => (
                              <XPRadio key={w.key} name={`${id}-word`} checked={calc.word === w.word} onChange={() => pressKey(w.key)} label={w.label} />
                          ))}
                </Frame>
            </div>
            <div className="flex items-center" style={{ marginTop: 4, height: KEY_H }}>
                <Frame label="Function modifiers" width={KEY_W + BLOCK + span(2)}>
                    <XPCheckbox checked={calc.inv} onChange={(v) => v !== calcRef.current.inv && pressKey('inv')} label="Inv" />
                    <XPCheckbox checked={calc.hyp} onChange={(v) => v !== calcRef.current.hyp && pressKey('hyp')} label="Hyp" />
                </Frame>
                <div className="flex justify-center" style={{ marginLeft: GAP, width: KEY_W }}>
                    <Well label="Open parentheses" width={KEY_W - 2}>
                        {depth ? `(=${depth}` : ''}
                    </Well>
                </div>
                <div className="flex justify-center" style={{ marginLeft: BLOCK, width: KEY_W }}>
                    <Well label="Memory" width={28}>
                        {memoryMark}
                    </Well>
                </div>
                <div className="flex" style={{ marginLeft: BLOCK, gap: GAP }}>
                    {CLEAR_KEYS.map((k) => keyButton(k, (span(6) - 2 * GAP) / 3))}
                </div>
            </div>
            <div className="flex" style={{ marginTop: 6, gap: BLOCK }}>
                <div style={grid(1)}>{STAT_KEYS.map((k) => keyButton(k))}</div>
                <div style={grid(3)}>{FUNCTION_KEYS.map((k) => keyButton(k))}</div>
                <div style={grid(1)}>{SCI_MEMORY_KEYS.map((k) => keyButton(k))}</div>
                <div style={grid(6)}>{SCIENTIFIC_KEYS.map((k) => keyButton(k))}</div>
            </div>
            {calc.statsOpen && (
                <StatisticsBox
                    width={SCI_WIDTH}
                    values={calc.stats.map((x) => formatStat(calc, x))}
                    selected={selected}
                    onSelect={setStatIndex}
                    onReturn={focusKeypad}
                    onLoad={() => selected !== null && update((s) => statLoad(s, selected))}
                    onDelete={() => {
                        if (selected === null) return;
                        update((s) => statDelete(s, selected));
                        setStatIndex(calc.stats.length > 1 ? Math.min(selected, calc.stats.length - 2) : null);
                    }}
                    onClearAll={() => {
                        update(statClearAll);
                        setStatIndex(null);
                    }}
                />
            )}
        </>
    );

    return (
        <div
            ref={rootRef}
            tabIndex={-1}
            onKeyDown={onKeyDown}
            onCopy={onCopy}
            onPaste={onPaste}
            onPointerDownCapture={() => {
                if (!help) focusKeypad();
            }}
            className="xp-face relative flex h-full select-none flex-col overflow-hidden outline-none"
        >
            <MenuBar menus={menus} active={active} />

            <div ref={areaRef} className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden">
                <div
                    ref={contentRef}
                    className="relative shrink-0"
                    style={{ padding: PAD, transform: scale === 1 ? undefined : `scale(${scale})` }}
                >
                    <Display text={marker ? shown.slice(0, -1) : shown} marker={marker} width={width} />
                    {notice && (
                        // Under the Help dialog (z-40), not over it as luna.css's tooltip layer would put it.
                        <div
                            aria-hidden
                            className="xp-tooltip"
                            style={{ position: 'absolute', left: PAD + 4, top: PAD + DISPLAY_H + 3, zIndex: 30, maxWidth: width - 8 }}
                        >
                            {notice.text}
                        </div>
                    )}
                    {sci ? scientific : standard}
                </div>
            </div>

            <p role="status" className="sr-only">
                {notice?.text ?? ''}
            </p>

            {help && (
                <HelpDialog
                    paneHeight={Math.max(60, rootHeight - 112)}
                    onClose={() => {
                        setHelp(false);
                        focusKeypad();
                    }}
                />
            )}
        </div>
    );
}
