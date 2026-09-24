"use client";

import { Fragment, useId, useState, type ReactNode } from 'react';
import AppDialog from '@/components/ui/AppDialog';
import { XPButton, XP_INPUT_CLASS } from '@/components/ui/xp-controls';
import { CUSTOM_LIMITS, LEVELS, RANKED_LEVELS, clampCustom, maxMines, type BestTimes, type Field, type RankedLevel } from './engine';

/**
 * Minesweeper's own dialogs. In XP they were separate little windows; here they are in-window
 * modals (`AppDialog`), which means they must also fit a Beginner window — about 170 pixels wide.
 * Every layout below wraps rather than overflows: side by side where there is room, as XP laid
 * them out, stacked where there is not.
 */

export const LEVEL_NAMES: Readonly<Record<RankedLevel, string>> = {
    beginner: 'Beginner',
    intermediate: 'Intermediate',
    expert: 'Expert',
};

/** XP's "Custom Field": three edit boxes, clamped on OK the way winmine clamped them. */
export function CustomFieldDialog({ field, onApply, onCancel }: { field: Field; onApply: (field: Field) => void; onCancel: () => void }) {
    const id = useId();
    const [rows, setRows] = useState(String(field.rows));
    const [cols, setCols] = useState(String(field.cols));
    const [mines, setMines] = useState(String(field.mines));
    const ok = () => onApply(clampCustom({ rows, cols, mines }));

    const entry = (key: string, label: string, value: string, set: (v: string) => void, hint: string) => (
        <Fragment key={key}>
            <label htmlFor={`${id}-${key}`}>{label}</label>
            <input
                id={`${id}-${key}`}
                type="text"
                inputMode="numeric"
                maxLength={3}
                value={value}
                title={hint}
                onChange={(e) => set(e.target.value.replace(/[^0-9]/g, ''))}
                className={`${XP_INPUT_CLASS} w-[44px]`}
            />
        </Fragment>
    );

    return (
        <AppDialog title="Custom Field" onCancel={onCancel} onOk={ok} footer={false} width={220}>
            <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
                <div className="grid grid-cols-[auto_auto] items-center gap-x-2 gap-y-2">
                    {entry('h', 'Height:', rows, setRows, `${CUSTOM_LIMITS.minRows} to ${CUSTOM_LIMITS.maxRows}`)}
                    {entry('w', 'Width:', cols, setCols, `${CUSTOM_LIMITS.minCols} to ${CUSTOM_LIMITS.maxCols}`)}
                    {entry('m', 'Mines:', mines, setMines, `${CUSTOM_LIMITS.minMines} to (height - 1) x (width - 1)`)}
                </div>
                <div className="flex flex-col gap-2">
                    <XPButton data-ok isDefault onClick={ok}>
                        OK
                    </XPButton>
                    <XPButton onClick={onCancel}>Cancel</XPButton>
                </div>
            </div>
        </AppDialog>
    );
}

const seconds = (n: number) => `${n} ${n === 1 ? 'second' : 'seconds'}`;

/**
 * XP's "Fastest Mine Sweepers". XP kept a name beside each time and a placeholder of "999 seconds,
 * Anonymous" until someone beat it; this keeps only real times, and says where they live.
 */
export function BestTimesDialog({ best, onReset, onClose }: { best: BestTimes; onReset: () => void; onClose: () => void }) {
    const empty = RANKED_LEVELS.every((l) => best[l] === undefined);
    return (
        <AppDialog title="Fastest Mine Sweepers" onCancel={onClose} onOk={onClose} footer={false} width={250}>
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
                {RANKED_LEVELS.map((level) => (
                    <Fragment key={level}>
                        <dt>{LEVEL_NAMES[level]}:</dt>
                        <dd data-best={level}>{best[level] === undefined ? 'No time yet' : seconds(best[level] as number)}</dd>
                    </Fragment>
                ))}
            </dl>
            <p className="mt-2">For this session only. Nothing is saved.</p>
            <div className="mt-3 flex flex-wrap justify-end gap-2">
                <XPButton onClick={onReset} disabled={empty} title={empty ? 'There are no times to reset yet' : undefined}>
                    Reset Scores
                </XPButton>
                <XPButton data-ok isDefault onClick={onClose}>
                    OK
                </XPButton>
            </div>
        </AppDialog>
    );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
    return (
        <section>
            <h3 className="font-bold" style={{ color: 'var(--luna-groupbox-text)' }}>
                {title}
            </h3>
            <p className="mt-0.5">{children}</p>
        </section>
    );
}

const fieldText = (f: Field) => `${f.rows} x ${f.cols}, ${f.mines} mines`;

/**
 * The rules, including chording. The text scrolls in its own pane so OK stays in view; the pane's
 * height comes from the window, because a Beginner window is barely taller than this dialog.
 */
export function HowToPlayDialog({ paneHeight, onClose }: { paneHeight: number; onClose: () => void }) {
    return (
        <AppDialog title="How to Play" onCancel={onClose} onOk={onClose} footer={false} width={360}>
            <div className="xp-input overflow-y-auto" style={{ maxHeight: paneHeight }}>
                <div className="space-y-2 p-1.5 leading-[1.45]">
                    <Section title="The goal">
                        Uncover every square that does not hide a mine. A number tells you how many of the eight squares around it hold
                        a mine; a square with none around it opens its neighbors by itself.
                    </Section>
                    <Section title="Uncovering">
                        Click a square to uncover it. Hold the button down and the square sinks; slide off before letting go to change
                        your mind. The first square you click is never a mine, and it always opens an area.
                    </Section>
                    <Section title="Marking">
                        Right-click a covered square to flag it as a mine. With Marks (?) on, right-clicking a flag turns it into a
                        question mark, and once more clears it. The counter on the left is the mines less the flags you have placed.
                    </Section>
                    <Section title="Chording">
                        When a number already has that many flags around it, click it with both buttons together, or the middle button,
                        or Shift and click: every other square around it is uncovered at once. If one of those flags was wrong, that
                        uncovers a mine.
                    </Section>
                    <Section title="On a touch screen">
                        Tap to uncover. Touch and hold to flag. Tap a number to chord it.
                    </Section>
                    <Section title="Levels">
                        Beginner is {fieldText(LEVELS.beginner)}; Intermediate {fieldText(LEVELS.intermediate)}; Expert{' '}
                        {fieldText(LEVELS.expert)}. Custom takes a height of {CUSTOM_LIMITS.minRows} to {CUSTOM_LIMITS.maxRows}, a
                        width of {CUSTOM_LIMITS.minCols} to {CUSTOM_LIMITS.maxCols}, and from {CUSTOM_LIMITS.minMines} mines up to one
                        fewer per row and column ({maxMines(CUSTOM_LIMITS.maxRows, CUSTOM_LIMITS.maxCols)} on the largest field).
                    </Section>
                    <Section title="The clock">
                        It starts with the first square you uncover, pauses while the window is minimized, and stops when you win or
                        hit a mine. Your fastest Beginner,
                        Intermediate and Expert times are under Game &gt; Best Times for as long as this page stays open. F2, or the
                        face, starts a new game.
                    </Section>
                </div>
            </div>
            <div className="mt-3 flex justify-end">
                <XPButton data-ok isDefault onClick={onClose}>
                    OK
                </XPButton>
            </div>
        </AppDialog>
    );
}
