"use client";

import { useEffect, useState } from 'react';
import { counterText } from './engine';
import { PAL } from './sprites';

/**
 * The two pieces of winmine's header that are not squares: the red seven-segment counters and the
 * face button. Original pixel art, drawn as crisp-edged SVG rectangles.
 */

type Rect = readonly [x: number, y: number, w: number, h: number];

/**
 * One 13x23 LED digit. Each segment is a bar that tapers over three pixel rows, so neighbouring
 * segments meet only on the diagonal at their corners — the look of the display winmine drew,
 * without borrowing its bitmap. (Stopping each bar a pixel short of the next was tried: at this
 * size the bars shrink into wedges and a 0 reads as an X.)
 */
const SEGMENTS: Readonly<Record<'a' | 'b' | 'c' | 'd' | 'e' | 'f' | 'g', readonly Rect[]>> = {
    a: [[2, 1, 9, 1], [3, 2, 7, 1], [4, 3, 5, 1]],
    b: [[11, 2, 1, 9], [10, 3, 1, 7], [9, 4, 1, 5]],
    c: [[11, 12, 1, 9], [10, 13, 1, 7], [9, 14, 1, 5]],
    d: [[4, 19, 5, 1], [3, 20, 7, 1], [2, 21, 9, 1]],
    e: [[1, 12, 1, 9], [2, 13, 1, 7], [3, 14, 1, 5]],
    f: [[1, 2, 1, 9], [2, 3, 1, 7], [3, 4, 1, 5]],
    g: [[3, 10, 7, 1], [2, 11, 9, 1], [3, 12, 7, 1]],
};
const ALL = Object.keys(SEGMENTS) as (keyof typeof SEGMENTS)[];

const LIT: Record<string, string> = {
    '0': 'abcdef',
    '1': 'bc',
    '2': 'abdeg',
    '3': 'abcdg',
    '4': 'bcfg',
    '5': 'acdfg',
    '6': 'acdefg',
    '7': 'abc',
    '8': 'abcdefg',
    '9': 'abcdfg',
    '-': 'g',
};

const LED_ON = '#ff0000';
/**
 * Unlit segments stay faintly visible, as they did on XP's counters — faintly: any brighter and
 * every digit reads as an 8 at 1x.
 */
const LED_OFF = '#360000';

/**
 * A three-digit counter in a 1px sunken frame. `mono` is Color turned off: the board goes grey, and
 * the digits turn white so they stay readable on black instead of greying into it.
 */
export function Led({ value, mono, label }: { value: number; mono: boolean; label: string }) {
    const text = counterText(value);
    const on = mono ? PAL.light : LED_ON;
    return (
        <svg
            role="img"
            aria-label={`${label}: ${value}`}
            width={41}
            height={25}
            viewBox="0 0 41 25"
            shapeRendering="crispEdges"
            className="block shrink-0"
        >
            <rect width={41} height={25} fill={PAL.light} />
            <rect width={40} height={1} fill={PAL.shadow} />
            <rect width={1} height={24} fill={PAL.shadow} />
            <rect x={1} y={1} width={39} height={23} fill={PAL.black} />
            {Array.from(text).map((ch, i) => (
                <g key={i} transform={`translate(${1 + i * 13} 1)`}>
                    {ALL.map((seg) =>
                        SEGMENTS[seg].map(([x, y, w, h], k) => (
                            <rect key={`${seg}${k}`} x={x} y={y} width={w} height={h} fill={LIT[ch]?.includes(seg) ? on : LED_OFF} />
                        )),
                    )}
                </g>
            ))}
        </svg>
    );
}

export type Mood = 'smile' | 'oh' | 'dead' | 'cool';

/** Row extents of a 17px disc. */
const DISC: readonly (readonly [number, number])[] = [
    [6, 10], [4, 12], [3, 13], [2, 14], [1, 15], [1, 15], [0, 16], [0, 16], [0, 16],
    [0, 16], [0, 16], [1, 15], [1, 15], [2, 14], [3, 13], [4, 12], [6, 10],
];
const inDisc = (x: number, y: number) => y >= 0 && y < DISC.length && x >= DISC[y][0] && x <= DISC[y][1];

/** The disc as runs: a 1px black rim wherever a pixel has an outside neighbour, yellow inside. */
const DISC_RUNS: readonly { x: number; y: number; w: number; rim: boolean }[] = (() => {
    const runs: { x: number; y: number; w: number; rim: boolean }[] = [];
    DISC.forEach(([lo, hi], y) => {
        for (let x = lo; x <= hi; ) {
            const rim = (px: number) => !inDisc(px - 1, y) || !inDisc(px + 1, y) || !inDisc(px, y - 1) || !inDisc(px, y + 1);
            const kind = rim(x);
            let end = x + 1;
            while (end <= hi && rim(end) === kind) end++;
            runs.push({ x, y, w: end - x, rim: kind });
            x = end;
        }
    });
    return runs;
})();

/** Each expression's features in disc coordinates, as black rects. */
const FEATURES: Readonly<Record<Mood, readonly Rect[]>> = {
    smile: [
        [5, 5, 2, 2], [10, 5, 2, 2],
        [4, 10, 1, 1], [12, 10, 1, 1], [5, 11, 2, 1], [10, 11, 2, 1], [7, 12, 3, 1],
    ],
    // The held-breath face while a square is pressed: round eyes and an open mouth.
    oh: [
        [5, 4, 2, 3], [10, 4, 2, 3],
        [7, 9, 3, 1], [6, 10, 1, 3], [10, 10, 1, 3], [7, 13, 3, 1],
    ],
    dead: [
        [4, 4, 1, 1], [6, 4, 1, 1], [5, 5, 1, 1], [4, 6, 1, 1], [6, 6, 1, 1],
        [10, 4, 1, 1], [12, 4, 1, 1], [11, 5, 1, 1], [10, 6, 1, 1], [12, 6, 1, 1],
        [7, 11, 3, 1], [5, 12, 2, 1], [10, 12, 2, 1], [4, 13, 1, 1], [12, 13, 1, 1],
    ],
    cool: [
        [2, 5, 13, 1], [3, 6, 5, 1], [9, 6, 5, 1], [4, 7, 3, 1], [10, 7, 3, 1],
        [4, 10, 1, 1], [12, 10, 1, 1], [5, 11, 2, 1], [10, 11, 2, 1], [7, 12, 3, 1],
    ],
};

const FACE_YELLOW = '#ffff00';

/** A 26x26 button face: 1px dark rim, then either XP's 2px raised bevel or the flat pressed look. */
function ButtonFrame({ down }: { down: boolean }) {
    if (down) {
        return (
            <>
                <rect width={26} height={26} fill={PAL.shadow} />
                <rect x={1} y={1} width={24} height={24} fill={PAL.face} />
                <rect x={1} y={1} width={24} height={1} fill={PAL.shadow} />
                <rect x={1} y={1} width={1} height={24} fill={PAL.shadow} />
            </>
        );
    }
    // Light on the top and left, shadow on the bottom and right, meeting on the diagonal.
    return (
        <>
            <rect width={26} height={26} fill={PAL.shadow} />
            <rect x={1} y={1} width={24} height={24} fill={PAL.face} />
            <rect x={1} y={1} width={23} height={1} fill={PAL.light} />
            <rect x={1} y={2} width={22} height={1} fill={PAL.light} />
            <rect x={1} y={1} width={1} height={23} fill={PAL.light} />
            <rect x={2} y={1} width={1} height={22} fill={PAL.light} />
            <rect x={24} y={1} width={1} height={24} fill={PAL.shadow} />
            <rect x={23} y={2} width={1} height={23} fill={PAL.shadow} />
            <rect x={1} y={24} width={24} height={1} fill={PAL.shadow} />
            <rect x={2} y={23} width={23} height={1} fill={PAL.shadow} />
        </>
    );
}

/**
 * The face button. It starts a new game, and its expression reports the game: a smile, the "oh"
 * while a square is held down, crosses for eyes after a mine, sunglasses after a win.
 *
 * It presses and releases the way an XP push button did: down while the button is held over it,
 * up again if the pointer slides off, and the new game only if the release happens on it — which
 * is exactly when the browser fires `click`, so `click` is the one place a game starts.
 */
export function FaceButton({ mood, onNewGame }: { mood: Mood; onNewGame: () => void }) {
    const [down, setDown] = useState(false);
    const [armed, setArmed] = useState(false);

    // A release anywhere ends the press, including one outside the button that it never sees.
    useEffect(() => {
        if (!armed) return;
        const end = () => {
            setArmed(false);
            setDown(false);
        };
        window.addEventListener('pointerup', end);
        window.addEventListener('pointercancel', end);
        window.addEventListener('blur', end);
        return () => {
            window.removeEventListener('pointerup', end);
            window.removeEventListener('pointercancel', end);
            window.removeEventListener('blur', end);
        };
    }, [armed]);

    const shift = down ? 5 : 4;
    return (
        <button
            type="button"
            aria-label="New game"
            data-face={mood}
            onClick={onNewGame}
            onPointerDown={(e) => {
                if (e.button !== 0) return;
                setArmed(true);
                setDown(true);
            }}
            onPointerLeave={() => setDown(false)}
            onPointerEnter={(e) => {
                if (armed && e.buttons & 1) setDown(true);
            }}
            className="block shrink-0 border-0 bg-transparent p-0 outline-none focus-visible:outline-1 focus-visible:outline-dotted focus-visible:outline-black"
        >
            <svg width={26} height={26} viewBox="0 0 26 26" shapeRendering="crispEdges" aria-hidden className="block">
                <ButtonFrame down={down} />
                <g transform={`translate(${shift} ${shift})`}>
                    {DISC_RUNS.map((r) => (
                        <rect key={`${r.x},${r.y}`} x={r.x} y={r.y} width={r.w} height={1} fill={r.rim ? PAL.black : FACE_YELLOW} />
                    ))}
                    {FEATURES[mood].map(([x, y, w, h]) => (
                        <rect key={`${x},${y},${w}`} x={x} y={y} width={w} height={h} fill={PAL.black} />
                    ))}
                </g>
            </svg>
        </button>
    );
}
