"use client";

import type { CSSProperties, ReactNode } from 'react';
import type { PaintEngine, PaintState } from './engine';
import { ToolIcon } from './ToolIcons';
import { AIRBRUSH_SIZES, BRUSHES, ERASER_SIZES, LINE_WIDTHS, MAGNIFICATIONS, TOOLS, type ToolId } from './tools';
import type { FillStyle } from './raster';

/** Classic 3-D bevels, drawn with inset shadows so they cost no layout. */
export const RAISED: CSSProperties = { boxShadow: 'inset 1px 1px 0 #fff, inset -1px -1px 0 #404040, inset -2px -2px 0 #808080' };
export const SUNKEN: CSSProperties = { boxShadow: 'inset 1px 1px 0 #808080, inset -1px -1px 0 #fff' };
const PRESSED: CSSProperties = {
    boxShadow: 'inset 1px 1px 0 #404040, inset 2px 2px 0 #808080, inset -1px -1px 0 #fff',
    // The one-pixel checker Windows drew behind a latched button.
    background: 'repeating-conic-gradient(#ffffff 0% 25%, #ece9d8 0% 50%) 0 0 / 2px 2px',
};

/** Selection blue for the chosen option, with the glyph drawn in white — XP's option box. */
const CHOSEN = '#316ac5';

function Option({ chosen, label, onClick, children, className = '' }: { chosen: boolean; label: string; onClick: () => void; children: ReactNode; className?: string }) {
    return (
        <button
            type="button"
            aria-label={label}
            aria-pressed={chosen}
            title={label}
            onClick={onClick}
            className={`flex items-center justify-center ${className}`}
            style={chosen ? { background: CHOSEN, color: '#fff' } : { color: '#000' }}
        >
            {children}
        </button>
    );
}

/** A tiny pixel-exact glyph on a grid, in the current text colour. */
function Pixels({ w, h, cells }: { w: number; h: number; cells: [number, number][] }) {
    return (
        <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} shapeRendering="crispEdges" aria-hidden>
            {cells.map(([x, y], i) => (
                <rect key={i} x={x} y={y} width={1} height={1} fill="currentColor" />
            ))}
        </svg>
    );
}

function brushCells(shape: (typeof BRUSHES)[number]['shape'], size: number): [number, number][] {
    const cells: [number, number][] = [];
    const c = 4;
    const off = Math.floor((size - 1) / 2);
    if (shape === 'round') {
        const r = size / 2;
        for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if ((x + 0.5 - r) ** 2 + (y + 0.5 - r) ** 2 <= r * r + 0.25) cells.push([c + x - off, c + y - off]);
    } else if (shape === 'square') {
        for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) cells.push([c + x - off, c + y - off]);
    } else {
        for (let i = 0; i < size; i++) cells.push([c + i - off, shape === 'forward' ? c + off - i : c + i - off]);
    }
    return cells;
}

const SPRAY_DOTS: [number, number][][] = [
    [[3, 3], [5, 2], [4, 5], [6, 4], [2, 5], [5, 6]],
    [[2, 2], [5, 1], [8, 3], [3, 5], [6, 5], [9, 6], [2, 8], [5, 8], [8, 9], [4, 10]],
    [[3, 1], [7, 1], [11, 2], [1, 4], [5, 4], [9, 5], [13, 5], [3, 7], [7, 8], [11, 8], [1, 10], [5, 11], [9, 11], [13, 10], [7, 13]],
];

function FillStyleGlyph({ style }: { style: FillStyle }) {
    return (
        <svg width="26" height="11" viewBox="0 0 26 11" shapeRendering="crispEdges" aria-hidden>
            {style !== 'outline' && <rect x={style === 'fill' ? 1 : 2} y={style === 'fill' ? 1 : 2} width={style === 'fill' ? 24 : 22} height={style === 'fill' ? 9 : 7} fill="#808080" />}
            {style !== 'fill' && <rect x={1.5} y={1.5} width={23} height={8} fill="none" stroke="currentColor" />}
        </svg>
    );
}

function TransparencyGlyph({ opaque }: { opaque: boolean }) {
    return (
        <svg width="30" height="20" viewBox="0 0 30 20" shapeRendering="crispEdges" aria-hidden>
            {opaque && <rect x="4" y="3" width="22" height="14" fill="#fff" stroke="#808080" />}
            <rect x="8" y="6" width="8" height="8" fill="#ff0000" />
            <circle cx="19" cy="11" r="4" fill="#0000ff" />
        </svg>
    );
}

export function OptionBox({ engine, state }: { engine: PaintEngine; state: PaintState }) {
    const { tool } = state;
    let body: ReactNode = null;

    if (tool === 'select' || tool === 'free-select' || tool === 'text') {
        body = (
            <div className="flex flex-col gap-1">
                <Option chosen={state.opaque} label="Opaque background" onClick={() => engine.setOpaque(true)} className="h-[24px] w-[36px]">
                    <TransparencyGlyph opaque />
                </Option>
                <Option chosen={!state.opaque} label="Transparent background" onClick={() => engine.setOpaque(false)} className="h-[24px] w-[36px]">
                    <TransparencyGlyph opaque={false} />
                </Option>
            </div>
        );
    } else if (tool === 'eraser') {
        body = (
            <div className="flex flex-col items-center gap-[2px]">
                {ERASER_SIZES.map((s, i) => (
                    <Option key={s} chosen={state.eraser === i} label={`${s} pixel eraser`} onClick={() => engine.setEraser(i)} className="h-[14px] w-[30px]">
                        <span className="block bg-current" style={{ width: s, height: s }} />
                    </Option>
                ))}
            </div>
        );
    } else if (tool === 'magnifier') {
        body = (
            <div className="flex flex-col items-center">
                {MAGNIFICATIONS.map((m) => (
                    <Option key={m} chosen={state.magnification === m} label={`Magnify ${m}x`} onClick={() => engine.setMagnification(m)} className="h-[12px] w-[30px] text-[10px] leading-none">
                        {m}x
                    </Option>
                ))}
            </div>
        );
    } else if (tool === 'brush') {
        body = (
            <div className="grid grid-cols-3 gap-[1px]">
                {BRUSHES.map((b, i) => (
                    <Option key={i} chosen={state.brush === i} label={`${b.shape} brush, size ${b.size}`} onClick={() => engine.setBrush(i)} className="h-[12px] w-[12px]">
                        <Pixels w={9} h={9} cells={brushCells(b.shape, b.size)} />
                    </Option>
                ))}
            </div>
        );
    } else if (tool === 'airbrush') {
        body = (
            <div className="grid grid-cols-2 place-items-center gap-[2px]">
                {AIRBRUSH_SIZES.map((a, i) => (
                    <Option key={i} chosen={state.airbrush === i} label={`Airbrush, size ${i + 1}`} onClick={() => engine.setAirbrush(i)} className="h-[18px] w-[18px]">
                        <Pixels w={15} h={15} cells={SPRAY_DOTS[i]} />
                    </Option>
                ))}
            </div>
        );
    } else if (tool === 'line' || tool === 'curve') {
        body = (
            <div className="flex flex-col items-center gap-[2px]">
                {LINE_WIDTHS.map((w) => (
                    <Option key={w} chosen={state.lineWidth === w} label={`Line width ${w}`} onClick={() => engine.setLineWidth(w)} className="h-[11px] w-[34px]">
                        <span className="block w-[26px] bg-current" style={{ height: w }} />
                    </Option>
                ))}
            </div>
        );
    } else if (tool === 'rectangle' || tool === 'polygon' || tool === 'ellipse' || tool === 'rounded-rect') {
        const styles: [FillStyle, string][] = [
            ['outline', 'Border only'],
            ['outline-fill', 'Border and fill'],
            ['fill', 'Fill, no border'],
        ];
        body = (
            <div className="flex flex-col items-center gap-[3px]">
                {styles.map(([s, label]) => (
                    <Option key={s} chosen={state.fillStyle === s} label={label} onClick={() => engine.setFillStyle(s)} className="h-[15px] w-[34px]">
                        <FillStyleGlyph style={s} />
                    </Option>
                ))}
            </div>
        );
    }

    return (
        <div className="flex h-[70px] w-[44px] items-center justify-center bg-[#ece9d8]" style={SUNKEN}>
            {body}
        </div>
    );
}

export function ToolBox({ engine, state, onHint }: { engine: PaintEngine; state: PaintState; onHint: (hint: string | null) => void }) {
    return (
        <div role="toolbar" aria-label="Tool Box" className="flex w-[58px] shrink-0 flex-col items-center gap-2 px-[3px] pt-[3px]">
            <div className="grid grid-cols-2">
                {TOOLS.map((t) => {
                    const on = state.tool === t.id;
                    return (
                        <button
                            key={t.id}
                            type="button"
                            title={t.name}
                            aria-label={t.name}
                            aria-pressed={on}
                            onClick={() => engine.setTool(t.id as ToolId)}
                            onPointerEnter={() => onHint(t.hint)}
                            onPointerLeave={() => onHint(null)}
                            className="flex h-[25px] w-[25px] items-center justify-center bg-[#ece9d8]"
                            style={on ? PRESSED : RAISED}
                        >
                            <span className={on ? 'translate-x-px translate-y-px' : ''}>
                                <ToolIcon tool={t.id} />
                            </span>
                        </button>
                    );
                })}
            </div>
            <OptionBox engine={engine} state={state} />
        </div>
    );
}
