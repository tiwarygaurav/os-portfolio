"use client";

import { useState } from 'react';

type Op = '+' | '-' | '*' | '/' | null;

export default function CalculatorApp() {
    const [display, setDisplay] = useState('0');
    const [pending, setPending] = useState<number | null>(null);
    const [op, setOp] = useState<Op>(null);
    const [overwrite, setOverwrite] = useState(true);
    const [memory, setMemory] = useState(0);

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
        <div className="h-full bg-[#ece9d8] p-2 flex flex-col font-sans select-none">
            <div className="text-xs flex gap-3 mb-2 text-black">
                <span className="hover:bg-[#316ac5] hover:text-white px-1 cursor-default"><u>E</u>dit</span>
                <span className="hover:bg-[#316ac5] hover:text-white px-1 cursor-default"><u>V</u>iew</span>
                <span className="hover:bg-[#316ac5] hover:text-white px-1 cursor-default"><u>H</u>elp</span>
            </div>

            <div
                className="bg-white border-2 border-gray-500 px-2 py-1 text-right font-mono text-lg mb-2 overflow-hidden"
                style={{ boxShadow: 'inset 1px 1px 2px rgba(0,0,0,0.3)' }}
            >
                {display}
            </div>

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
    );
}
