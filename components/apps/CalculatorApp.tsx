"use client";

import { useEffect, useState } from 'react';
import { PROFILE, SYSTEM } from '@/content';
import { xpAlert } from '@/utils/dialog';

type Op = '+' | '-' | '*' | '/' | null;

const MENU = ['Edit', 'View', 'Help'];

// Paste needs the async Clipboard API's read half, which some browsers do not expose to pages.
// Decided once at module load; the menu item is shown disabled (with the reason) when it is absent.
const canReadClipboard =
    typeof navigator !== 'undefined' && typeof navigator.clipboard?.readText === 'function';

export default function CalculatorApp() {
    const [display, setDisplay] = useState('0');
    const [pending, setPending] = useState<number | null>(null);
    const [op, setOp] = useState<Op>(null);
    const [overwrite, setOverwrite] = useState(true);
    const [memory, setMemory] = useState(0);
    const [openMenu, setOpenMenu] = useState<string | null>(null);
    // Short-lived message under the display for clipboard outcomes — never a native alert.
    const [notice, setNotice] = useState<string | null>(null);

    useEffect(() => {
        if (!notice) return;
        const t = setTimeout(() => setNotice(null), 3000);
        return () => clearTimeout(t);
    }, [notice]);

    const copyDisplay = async () => {
        setOpenMenu(null);
        try {
            await navigator.clipboard.writeText(display);
            setNotice('Copied to clipboard.');
        } catch {
            setNotice('Copy failed: the browser refused clipboard access.');
        }
    };

    const pasteDisplay = async () => {
        setOpenMenu(null);
        try {
            const raw = (await navigator.clipboard.readText()).trim();
            const n = Number(raw);
            if (raw === '' || !Number.isFinite(n)) {
                setNotice('Clipboard does not contain a number.');
                return;
            }
            setDisplay(formatResult(n));
            setOverwrite(true);
        } catch {
            setNotice('Paste failed: the browser refused clipboard access.');
        }
    };

    const menus: Record<string, { label: string; action?: () => void; shortcut?: string; divider?: boolean; checked?: boolean; disabled?: boolean; title?: string }[]> = {
        Edit: [
            { label: 'Copy', action: () => { void copyDisplay(); }, shortcut: 'Ctrl+C' },
            {
                label: canReadClipboard ? 'Paste' : 'Paste (clipboard read not permitted here)',
                action: () => { void pasteDisplay(); },
                shortcut: 'Ctrl+V',
                disabled: !canReadClipboard,
                title: canReadClipboard ? undefined : 'This browser does not let pages read the clipboard.',
            },
        ],
        View: [
            // Standard is the only mode this calculator has; it is shown checked, not as a choice.
            { label: 'Standard', action: () => setOpenMenu(null), checked: true },
        ],
        Help: [
            {
                label: 'About Calculator',
                action: () => {
                    void xpAlert('About Calculator', ['Calculator', SYSTEM.name, PROFILE.name]);
                    setOpenMenu(null);
                },
            },
        ],
    };

    const inputDigit = (d: string) => {
        if (overwrite) {
            setDisplay(d === '.' ? '0.' : d);
            setOverwrite(false);
        } else {
            if (d === '.' && display.includes('.')) return;
            setDisplay(display === '0' && d !== '.' ? d : display + d);
        }
    };

    const compute = (a: number, b: number, o: Op): number => {
        switch (o) {
            case '+': return a + b;
            case '-': return a - b;
            case '*': return a * b;
            case '/': return b === 0 ? NaN : a / b;
            default: return b;
        }
    };

    const inputOp = (newOp: Op) => {
        const current = parseFloat(display);
        if (pending !== null && op && !overwrite) {
            const result = compute(pending, current, op);
            setDisplay(formatResult(result));
            setPending(result);
        } else {
            setPending(current);
        }
        setOp(newOp);
        setOverwrite(true);
    };

    const formatResult = (n: number) => {
        if (!isFinite(n)) return 'Error';
        const str = n.toString();
        return str.length > 14 ? n.toPrecision(10) : str;
    };

    const equals = () => {
        if (op === null || pending === null) return;
        const result = compute(pending, parseFloat(display), op);
        setDisplay(formatResult(result));
        setPending(null);
        setOp(null);
        setOverwrite(true);
    };

    const clear = () => {
        setDisplay('0');
        setPending(null);
        setOp(null);
        setOverwrite(true);
    };

    const clearEntry = () => {
        setDisplay('0');
        setOverwrite(true);
    };

    const backspace = () => {
        if (overwrite) return;
        setDisplay(display.length === 1 ? '0' : display.slice(0, -1));
        if (display.length === 1) setOverwrite(true);
    };

    const negate = () => setDisplay(display.startsWith('-') ? display.slice(1) : display === '0' ? '0' : '-' + display);
    const sqrt = () => {
        const n = parseFloat(display);
        setDisplay(formatResult(Math.sqrt(n)));
        setOverwrite(true);
    };
    const percent = () => {
        const n = parseFloat(display);
        const base = pending ?? 0;
        setDisplay(formatResult(base * n / 100));
        setOverwrite(true);
    };
    const reciprocal = () => {
        const n = parseFloat(display);
        setDisplay(formatResult(n === 0 ? NaN : 1 / n));
        setOverwrite(true);
    };

    const btn = (label: string, onClick: () => void, extra = '') => (
        <button
            onClick={onClick}
            className={`h-9 text-sm font-bold border border-gray-500 active:translate-y-px ${extra}`}
            style={{
                background: 'linear-gradient(to bottom, #f6f6f6, #d4d4d4)',
                boxShadow: 'inset 1px 1px 0 #ffffff, inset -1px -1px 0 #808080',
            }}
        >
            {label}
        </button>
    );

    return (
        <div className="h-full bg-[#ece9d8] flex flex-col font-sans select-none">
            {/* Menu bar — same pattern as NotepadApp so the two look identical. */}
            <div className="flex text-xs bg-[#ece9d8] border-b border-gray-400 relative">
                {MENU.map(m => (
                    <button
                        key={m}
                        onMouseDown={(e) => { e.preventDefault(); setOpenMenu(openMenu === m ? null : m); }}
                        onMouseEnter={() => openMenu && setOpenMenu(m)}
                        className={`px-3 py-1 hover:bg-[#316ac5] hover:text-white ${openMenu === m ? 'bg-[#316ac5] text-white' : ''}`}
                    >
                        <u>{m[0]}</u>{m.slice(1)}
                    </button>
                ))}

                {openMenu && (
                    <div
                        className="absolute top-full left-0 z-50 min-w-[200px] bg-[#ece9d8] border border-gray-500 shadow-lg py-1 select-none"
                        style={{
                            left: MENU.indexOf(openMenu) * 50,
                        }}
                        onMouseLeave={() => setOpenMenu(null)}
                    >
                        {menus[openMenu].map((item, i) =>
                            item.divider ? (
                                <div key={i} className="h-px bg-gray-400 my-1 mx-1" />
                            ) : (
                                <button
                                    key={i}
                                    onClick={item.action}
                                    disabled={item.disabled}
                                    title={item.title}
                                    className="w-full flex justify-between items-center px-4 py-1 text-xs hover:bg-[#316ac5] hover:text-white disabled:text-gray-500 disabled:hover:bg-transparent disabled:hover:text-gray-500"
                                >
                                    <span>
                                        {item.checked !== undefined && (
                                            <span className="inline-block w-3">{item.checked ? '✓' : ''}</span>
                                        )}
                                        {item.label}
                                    </span>
                                    {item.shortcut && <span className="text-gray-500 ml-6">{item.shortcut}</span>}
                                </button>
                            )
                        )}
                    </div>
                )}
            </div>

            <div className="p-2 flex flex-col flex-1">
                <div
                    className="bg-white border-2 border-gray-500 px-2 py-1 text-right font-mono text-lg overflow-hidden"
                    style={{ boxShadow: 'inset 1px 1px 2px rgba(0,0,0,0.3)' }}
                >
                    {display}
                </div>
                {/* Clipboard outcome, in-world. Reserved height so the keypad does not jump. */}
                <p role="status" className="h-4 mb-1 text-[10px] leading-4 text-gray-600 truncate">
                    {notice ?? ''}
                </p>
    
                <div className="grid grid-cols-5 gap-1 text-black">
                    <div />
                    {btn('Backspace', backspace, 'col-span-2 text-red-700')}
                    {btn('CE', clearEntry, 'text-red-700')}
                    {btn('C', clear, 'text-red-700')}
    
                    {btn('MC', () => setMemory(0))}
                    {btn('7', () => inputDigit('7'))}
                    {btn('8', () => inputDigit('8'))}
                    {btn('9', () => inputDigit('9'))}
                    {btn('/', () => inputOp('/'), 'text-red-700')}
    
                    {btn('MR', () => { setDisplay(formatResult(memory)); setOverwrite(true); })}
                    {btn('4', () => inputDigit('4'))}
                    {btn('5', () => inputDigit('5'))}
                    {btn('6', () => inputDigit('6'))}
                    {btn('*', () => inputOp('*'), 'text-red-700')}
    
                    {btn('MS', () => setMemory(parseFloat(display)))}
                    {btn('1', () => inputDigit('1'))}
                    {btn('2', () => inputDigit('2'))}
                    {btn('3', () => inputDigit('3'))}
                    {btn('-', () => inputOp('-'), 'text-red-700')}
    
                    {btn('M+', () => setMemory(m => m + parseFloat(display)))}
                    {btn('0', () => inputDigit('0'))}
                    {btn('±', negate)}
                    {btn('.', () => inputDigit('.'))}
                    {btn('+', () => inputOp('+'), 'text-red-700')}
    
                    <div />
                    {btn('sqrt', sqrt)}
                    {btn('%', percent)}
                    {btn('1/x', reciprocal)}
                    {btn('=', equals, 'text-red-700')}
                </div>
            </div>
        </div>
    );
}
