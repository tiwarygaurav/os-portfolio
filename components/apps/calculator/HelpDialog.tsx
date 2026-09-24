"use client";

import type { ReactNode } from 'react';
import AppDialog from '@/components/ui/AppDialog';
import { XPButton } from '@/components/ui/xp-controls';
import { DEC_DIGITS, MAX_PARENS } from './engine';

/**
 * Help > Help Topics. XP opened the HTML Help viewer here; this is the same material in one of the
 * window's own dialogs, including the one way this calculator is not XP's: its decimal arithmetic.
 */

function Section({ title, children }: { title: string; children: ReactNode }) {
    return (
        <section>
            <h3 className="font-bold" style={{ color: 'var(--luna-groupbox-text)' }}>
                {title}
            </h3>
            <div className="mt-0.5">{children}</div>
        </section>
    );
}

/** Key, what it does. */
const KEYS: [string, string][] = [
    ['0-9  .', 'Digits and the decimal point'],
    ['+  -  *  /', 'Add, subtract, multiply, divide'],
    ['Enter or =', '='],
    ['Esc', 'C: clear the calculation'],
    ['Delete', 'CE: clear the number shown'],
    ['Backspace', 'Delete the last digit'],
    ['F9', '+/-'],
    ['r', '1/x'],
    ['@', 'sqrt in Standard, x^2 in Scientific'],
    ['%', '% in Standard, Mod in Scientific'],
    ['Ctrl+M  Ctrl+R', 'MS, MR'],
    ['Ctrl+L  Ctrl+P', 'MC, M+'],
    ['Ctrl+C  Ctrl+V', 'Copy, Paste'],
];

const SCIENTIFIC_KEYS: [string, string][] = [
    ['(  )', 'Parentheses'],
    ['s  o  t', 'sin, cos, tan'],
    ['n  l', 'ln, log'],
    ['y  #  !', 'x^y, x^3, n!'],
    ['p  x  m  v', 'pi, Exp, dms, F-E'],
    ['i  h', 'Inv, Hyp'],
    ['a-f', 'Hex digits A-F'],
    ['&  |  ^  ~', 'And, Or, Xor, Not'],
    ['<  ;', 'Lsh, Int'],
    ['F5  F6  F7  F8', 'Hex, Dec, Oct, Bin'],
    ['F2  F3  F4', 'Degrees, Radians, Grads in Dec; Dword, Word, Byte otherwise'],
    ['F12', 'Qword'],
    ['Ctrl+S  Insert', 'Sta, Dat'],
    ['Ctrl+A  Ctrl+T  Ctrl+D', 'Ave, Sum, s'],
];

function KeyTable({ rows }: { rows: [string, string][] }) {
    return (
        <table className="w-full border-collapse">
            <tbody>
                {rows.map(([key, what]) => (
                    <tr key={key} className="align-top">
                        <td className="whitespace-pre pr-3 font-bold">{key}</td>
                        <td>{what}</td>
                    </tr>
                ))}
            </tbody>
        </table>
    );
}

export default function HelpDialog({ onClose, paneHeight }: { onClose: () => void; paneHeight: number }) {
    return (
        <AppDialog
            title="Calculator Help"
            onCancel={onClose}
            onOk={onClose}
            width={420}
            footer={
                <div className="mt-3 flex justify-end">
                    <XPButton data-ok isDefault onClick={onClose}>
                        OK
                    </XPButton>
                </div>
            }
        >
            {/* The text scrolls in its own pane so OK stays in view in a window as small as this one. */}
            <div className="xp-input overflow-y-auto" style={{ maxHeight: paneHeight }}>
                <div className="space-y-2 p-1.5 leading-[1.45]">
                    <Section title="Standard and Scientific">
                        View &gt; Standard works left to right, like a pocket calculator: 2 + 3 * 4 = 20. View &gt; Scientific
                        applies precedence, so 2 + 3 * 4 = 14: x^y first, then * / Mod Lsh, then + -, then And, then Or and Xor.
                        Parentheses nest up to {MAX_PARENS} deep; the box beside the M box shows how many are open, as (=2.
                    </Section>
                    <Section title="Everyday keys">
                        Pressing = again repeats the last operation. % gives a percentage of the number before it: 50 + 10 %
                        shows 5, and = then gives 55. MS stores the number shown, M+ adds to it, MR recalls it and MC clears it; an
                        M in the box means memory holds something other than zero.
                    </Section>
                    <Section title="Inv and Hyp">
                        Tick Inv for the inverse of the next function: asin, acos, atan; the y-th root for x^y; the cube root for
                        x^3 and the square root for x^2; e^x for ln and 10^x for log; 2 pi for pi; degrees from D.MMSS for dms;
                        the fractional part for Int; Rsh for Lsh; and the population forms of Ave, Sum and s. Hyp makes sin, cos
                        and tan hyperbolic. Both clear once they have been used.
                    </Section>
                    <Section title="Number systems">
                        Hex, Oct and Bin work in whole numbers of the size chosen: Qword is 64 bits, Dword 32, Word 16, Byte 8.
                        Results wrap at that size and negative numbers show in two&apos;s complement. This arithmetic is exact to
                        the last bit. Keys that have no meaning there, such as the decimal point and sin, are greyed.
                    </Section>
                    <Section title="Statistics">
                        Sta opens the Statistics Box. Dat adds the number shown; Ave, Sum and s give the mean, the total and the
                        standard deviation over n - 1 (Inv: the mean of the squares, the sum of the squares, and s over n). LOAD
                        puts the selected value on the display, CD deletes it, CAD deletes them all and RET returns to the keypad.
                    </Section>
                    <Section title="Precision">
                        Decimal results are IEEE-754 double-precision numbers, which carry about {DEC_DIGITS} significant digits,
                        so no more than {DEC_DIGITS} are shown and the last can differ by one. Windows XP&apos;s Calculator did its
                        own arbitrary-precision arithmetic to 32 digits, so a long calculation here can end differently in the
                        last places. Anything beyond about 1.8e+308 is reported as Overflow.
                    </Section>
                    <Section title="Copy and Paste">
                        Copy puts the number shown on the clipboard. Paste types the clipboard in, key by key, so 12+3= gives 15.
                        :c, :m, :p, :r and :q stand for MC, MS, M+, MR and C, :e for Exp and \ for Dat. Anything that is not a key
                        is ignored.
                    </Section>
                    <Section title="Keyboard">
                        <KeyTable rows={KEYS} />
                        <p className="mt-1.5 font-bold">Scientific only</p>
                        <KeyTable rows={SCIENTIFIC_KEYS} />
                        <p className="mt-1.5">
                            A browser keeps a few keys for itself before any page sees them, Ctrl+T and F12 among them in most; use
                            the buttons for those.
                        </p>
                    </Section>
                </div>
            </div>
        </AppDialog>
    );
}
