"use client";

import { useEffect, useId, useRef, type KeyboardEvent, type MouseEvent } from 'react';
import { XPButton } from '@/components/ui/xp-controls';

/**
 * XP's Statistics Box, opened by Sta: the values entered with Dat, their count, and RET, LOAD,
 * CD and CAD. XP gave it a small window of its own; here it is a panel under the keypad, and the
 * calculator window grows to hold it, so it can never be lost behind another window.
 */

interface StatisticsBoxProps {
    /** The values, already formatted in the current number system. */
    values: string[];
    selected: number | null;
    onSelect: (index: number) => void;
    /** RET: back to the keypad. */
    onReturn: () => void;
    /** LOAD: the selected value onto the display. */
    onLoad: () => void;
    /** CD: delete the selected value. */
    onDelete: () => void;
    /** CAD: delete every value. */
    onClearAll: () => void;
    width: number;
}

/** The buttons leave the keyboard where it was, like the calculator's own keys. */
const keepFocus = (e: MouseEvent) => e.preventDefault();

export default function StatisticsBox({ values, selected, onSelect, onReturn, onLoad, onDelete, onClearAll, width }: StatisticsBoxProps) {
    const id = useId();
    const listRef = useRef<HTMLDivElement>(null);

    // Keep the selected value in view as the arrow keys move through a list longer than the box.
    useEffect(() => {
        if (selected === null) return;
        listRef.current?.querySelector<HTMLElement>(`[data-index="${selected}"]`)?.scrollIntoView({ block: 'nearest' });
    }, [selected]);

    const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
        const n = values.length;
        if (!n) return;
        let next: number | null = null;
        if (e.key === 'ArrowDown') next = selected === null ? 0 : Math.min(n - 1, selected + 1);
        else if (e.key === 'ArrowUp') next = selected === null ? n - 1 : Math.max(0, selected - 1);
        else if (e.key === 'Home') next = 0;
        else if (e.key === 'End') next = n - 1;
        if (next === null) return;
        // The list's own keys; everything else goes on to the calculator.
        e.preventDefault();
        e.stopPropagation();
        onSelect(next);
    };

    return (
        <fieldset className="xp-groupbox" style={{ width, minWidth: 0, marginTop: 8, padding: '2px 8px 8px' }}>
            <legend>Statistics Box</legend>
            <div
                ref={listRef}
                role="listbox"
                tabIndex={0}
                aria-label="Statistics values"
                aria-activedescendant={selected === null ? undefined : `${id}-${selected}`}
                onKeyDown={onKeyDown}
                className="xp-input overflow-y-auto outline-none"
                style={{ height: 80, padding: 1 }}
            >
                {values.map((v, i) => (
                    <div
                        key={i}
                        id={`${id}-${i}`}
                        data-index={i}
                        role="option"
                        aria-selected={selected === i}
                        onPointerDown={() => onSelect(i)}
                        className="whitespace-nowrap px-1 leading-[15px]"
                        style={selected === i ? { background: 'var(--luna-highlight)', color: 'var(--luna-highlight-text)' } : undefined}
                    >
                        {v}
                    </div>
                ))}
            </div>
            <div className="mt-2 flex items-center gap-1.5">
                <XPButton tabIndex={-1} onMouseDown={keepFocus} onClick={onReturn}>
                    RET
                </XPButton>
                <XPButton tabIndex={-1} onMouseDown={keepFocus} onClick={onLoad} disabled={selected === null}>
                    LOAD
                </XPButton>
                <XPButton tabIndex={-1} onMouseDown={keepFocus} onClick={onDelete} disabled={selected === null}>
                    CD
                </XPButton>
                <XPButton tabIndex={-1} onMouseDown={keepFocus} onClick={onClearAll} disabled={!values.length}>
                    CAD
                </XPButton>
                <span className="ml-auto pr-1" data-stat-count>
                    n={values.length}
                </span>
            </div>
        </fieldset>
    );
}
