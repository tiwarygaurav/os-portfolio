"use client";

import type { PaintEngine, PaintState } from './engine';
import { cssOf } from './palette';
import { RAISED, SUNKEN } from './Toolbox';

const WELL_DITHER = 'repeating-conic-gradient(#ffffff 0% 25%, #ece9d8 0% 50%) 0 0 / 2px 2px';

/**
 * The colour box: the current-colours well and Paint's 28 swatches. Left-click chooses the
 * foreground colour, right-click the background colour, and a double-click opens Edit Colors
 * for that swatch — all as in XP.
 */
export function ColorBox({
    engine,
    state,
    onEdit,
    onHint,
}: {
    engine: PaintEngine;
    state: PaintState;
    /** Double-click: edit this swatch. */
    onEdit: (index: number) => void;
    onHint: (hint: string | null) => void;
}) {
    return (
        <div role="group" aria-label="Color Box" className="flex shrink-0 items-center gap-[6px] px-[3px] pb-[3px] pt-[4px]">
            {/* Foreground drawn over background, the way Paint showed them. */}
            <div
                aria-label={`Foreground ${cssOf(state.fg)}, background ${cssOf(state.bg)}`}
                role="img"
                className="relative h-[32px] w-[32px] shrink-0"
                style={{ ...SUNKEN, background: WELL_DITHER }}
            >
                <span className="absolute left-[13px] top-[13px] h-[13px] w-[13px] bg-[#ece9d8]" style={RAISED}>
                    <span className="absolute inset-[2px]" style={{ background: cssOf(state.bg) }} />
                </span>
                <span className="absolute left-[5px] top-[5px] h-[13px] w-[13px] bg-[#ece9d8]" style={RAISED}>
                    <span className="absolute inset-[2px]" style={{ background: cssOf(state.fg) }} />
                </span>
            </div>
            <div className="grid gap-0" style={{ gridTemplateColumns: 'repeat(14, 16px)' }}>
                {state.palette.map((c, i) => (
                    <button
                        key={i}
                        type="button"
                        aria-label={`Color ${cssOf(c)}`}
                        onClick={() => engine.setColor('primary', c)}
                        onContextMenu={(e) => {
                            e.preventDefault();
                            engine.setColor('secondary', c);
                        }}
                        onDoubleClick={() => onEdit(i)}
                        onPointerEnter={() => onHint('Selects colors: left-click for the foreground, right-click for the background. Double-click to change a color.')}
                        onPointerLeave={() => onHint(null)}
                        className="h-[16px] w-[16px] p-[2px]"
                        style={SUNKEN}
                    >
                        <span className="block h-full w-full" style={{ background: cssOf(c) }} />
                    </button>
                ))}
            </div>
        </div>
    );
}
