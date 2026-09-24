"use client";

import { useEffect, useRef, useState, useSyncExternalStore, type PointerEvent as ReactPointerEvent, type RefObject } from 'react';
import { TEXT_LINE_HEIGHT, TEXT_PADDING, cssFont, type Button, type PaintEngine, type PaintState } from './engine';
import { CURSORS, ERASER_SIZES } from './tools';
import { cssOf } from './palette';
import { MAX_SIDE } from './codec';
import { SUNKEN } from './Toolbox';

type Mods = { shiftKey: boolean; ctrlKey: boolean; metaKey: boolean };
const modsOf = (e: Mods) => ({ shift: e.shiftKey, ctrl: e.ctrlKey || e.metaKey });

/** Elements that handle their own pointer input rather than drawing: the text box, the handles. */
const OWN_POINTER = '[data-paint-own-pointer]';

function usePointer(engine: PaintEngine) {
    return useSyncExternalStore(engine.subscribe, engine.getPointer, engine.getPointer);
}

/** XP's eraser showed its own footprint as the cursor: a square the size of the eraser. */
function EraserCursor({ engine, size, zoom }: { engine: PaintEngine; size: number; zoom: number }) {
    const { at } = usePointer(engine);
    if (!at) return null;
    const off = Math.floor((size - 1) / 2);
    return (
        <div
            aria-hidden
            className="pointer-events-none absolute border border-black bg-white"
            style={{ left: (at.x - off) * zoom, top: (at.y - off) * zoom, width: size * zoom, height: size * zoom }}
        />
    );
}

/** At 100%, the magnifier outlines the area it will enlarge. */
function MagnifierFrame({ engine, state, viewport }: { engine: PaintEngine; state: PaintState; viewport: { w: number; h: number } }) {
    const { at } = usePointer(engine);
    if (!at || state.zoom !== 1 || state.magnification === 1) return null;
    const w = Math.min(state.width, Math.round(viewport.w / state.magnification));
    const h = Math.min(state.height, Math.round(viewport.h / state.magnification));
    const x = Math.max(0, Math.min(state.width - w, Math.round(at.x - w / 2)));
    const y = Math.max(0, Math.min(state.height - h, Math.round(at.y - h / 2)));
    return <div aria-hidden className="pointer-events-none absolute border border-black" style={{ left: x, top: y, width: w, height: h }} />;
}

function TextBox({ engine, state }: { engine: PaintEngine; state: PaintState }) {
    const ref = useRef<HTMLTextAreaElement>(null);
    const t = state.text;
    const z = state.zoom;
    const key = t ? `${t.x},${t.y}` : '';
    // Take the keyboard as soon as the box exists, so typing goes straight into it.
    useEffect(() => {
        ref.current?.focus({ preventScroll: true });
    }, [key]);
    if (!t) return null;
    const f = state.font;
    return (
        <textarea
            ref={ref}
            data-paint-own-pointer
            aria-label="Text"
            value={t.value}
            spellCheck={false}
            onChange={(e) => engine.setTextValue(e.target.value)}
            onKeyDown={(e) => {
                // Typing belongs to the text box, not to Paint's shortcuts or the desktop's.
                e.stopPropagation();
                if (e.key === 'Escape') {
                    e.preventDefault();
                    engine.commitText();
                }
            }}
            className="absolute m-0 resize-none overflow-hidden border-0 outline outline-1 outline-dashed outline-black"
            style={{
                left: t.x * z,
                top: t.y * z,
                width: t.w * z,
                height: t.h * z,
                boxSizing: 'border-box',
                padding: TEXT_PADDING * z,
                font: cssFont({ ...f, size: f.size * z }),
                lineHeight: `${Math.ceil(f.size * TEXT_LINE_HEIGHT) * z}px`,
                textDecoration: f.underline ? 'underline' : 'none',
                color: cssOf(state.fg),
                background: state.opaque ? cssOf(state.bg) : 'transparent',
                whiteSpace: 'pre-wrap',
                overflowWrap: 'break-word',
            }}
        />
    );
}

type Edge = 'right' | 'bottom' | 'corner';

export function CanvasArea({
    engine,
    state,
    showGrid,
    scrollRef,
    onMagnify,
    onResizePreview,
}: {
    engine: PaintEngine;
    state: PaintState;
    showGrid: boolean;
    scrollRef: RefObject<HTMLDivElement>;
    onMagnify: (x: number, y: number) => void;
    onResizePreview: (size: { w: number; h: number } | null) => void;
}) {
    const wrapRef = useRef<HTMLDivElement>(null);
    const mainRef = useRef<HTMLCanvasElement>(null);
    const overlayRef = useRef<HTMLCanvasElement>(null);
    const drag = useRef<{ button: Button; pointerId: number } | null>(null);
    const [resize, setResize] = useState<{ w: number; h: number } | null>(null);

    useEffect(() => {
        const main = mainRef.current;
        const overlay = overlayRef.current;
        if (!main || !overlay) return;
        engine.attach(main, overlay);
        return () => engine.detach();
    }, [engine]);

    const z = state.zoom;
    const W = state.width * z;
    const H = state.height * z;

    const at = (clientX: number, clientY: number): [number, number] => {
        const r = wrapRef.current?.getBoundingClientRect();
        if (!r) return [0, 0];
        return [Math.floor((clientX - r.left) / z), Math.floor((clientY - r.top) / z)];
    };

    const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
        if ((e.target as HTMLElement).closest(OWN_POINTER)) return;
        if (e.button !== 0 && e.button !== 2) return;
        e.preventDefault();
        const [x, y] = at(e.clientX, e.clientY);
        if (state.tool === 'magnifier') {
            onMagnify(x, y);
            return;
        }
        if (drag.current) {
            engine.abortDrag();
            drag.current = null;
            return;
        }
        e.currentTarget.setPointerCapture(e.pointerId);
        drag.current = { button: e.button === 2 ? 'secondary' : 'primary', pointerId: e.pointerId };
        engine.down(x, y, drag.current.button, modsOf(e));
    };

    const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
        const d = drag.current;
        if (!d) {
            const [x, y] = at(e.clientX, e.clientY);
            engine.hover(x, y);
            return;
        }
        if (e.pointerId !== d.pointerId) return;
        // The other mouse button pressed mid-drag cancels it, as it did in Paint.
        if (e.pointerType === 'mouse' && e.buttons & (d.button === 'primary' ? 2 : 1)) {
            engine.abortDrag();
            drag.current = null;
            return;
        }
        // Every sample the browser coalesced into this event, so fast strokes keep their shape.
        const native = e.nativeEvent;
        const samples = typeof native.getCoalescedEvents === 'function' ? native.getCoalescedEvents() : [];
        const mods = modsOf(e);
        if (samples.length > 1) {
            for (const s of samples) {
                const [x, y] = at(s.clientX, s.clientY);
                engine.move(x, y, mods);
            }
        } else {
            const [x, y] = at(e.clientX, e.clientY);
            engine.move(x, y, mods);
        }
    };

    const onPointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
        const d = drag.current;
        if (!d || e.pointerId !== d.pointerId) return;
        drag.current = null;
        const [x, y] = at(e.clientX, e.clientY);
        engine.up(x, y, modsOf(e));
    };

    const onPointerCancel = () => {
        if (!drag.current) return;
        drag.current = null;
        engine.abortDrag();
    };

    /* Resize handles: drag the picture's edge to change its size, as in Paint. */
    const startResize = (edge: Edge) => (e: ReactPointerEvent<HTMLDivElement>) => {
        if (e.button !== 0) return;
        e.preventDefault();
        e.stopPropagation();
        const el = e.currentTarget;
        el.setPointerCapture(e.pointerId);
        const measure = (ev: { clientX: number; clientY: number }) => {
            const r = wrapRef.current?.getBoundingClientRect();
            if (!r) return { w: state.width, h: state.height };
            const clamp = (v: number) => Math.max(1, Math.min(MAX_SIDE, Math.round(v)));
            return {
                w: edge === 'bottom' ? state.width : clamp((ev.clientX - r.left) / z),
                h: edge === 'right' ? state.height : clamp((ev.clientY - r.top) / z),
            };
        };
        const move = (ev: PointerEvent) => {
            const s = measure(ev);
            setResize(s);
            onResizePreview(s);
        };
        const up = (ev: PointerEvent) => {
            el.removeEventListener('pointermove', move);
            el.removeEventListener('pointerup', up);
            el.removeEventListener('pointercancel', cancel);
            const s = measure(ev);
            setResize(null);
            onResizePreview(null);
            engine.resize(s.w, s.h);
        };
        const cancel = () => {
            el.removeEventListener('pointermove', move);
            el.removeEventListener('pointerup', up);
            el.removeEventListener('pointercancel', cancel);
            setResize(null);
            onResizePreview(null);
        };
        el.addEventListener('pointermove', move);
        el.addEventListener('pointerup', up);
        el.addEventListener('pointercancel', cancel);
    };

    const handle = (edge: Edge, left: number, top: number, cursor: string, label: string) => (
        <div
            data-paint-own-pointer
            role="separator"
            aria-label={label}
            onPointerDown={startResize(edge)}
            className="absolute touch-none"
            style={{ left: left - 3, top: top - 3, width: 11, height: 11, cursor }}
        >
            <span className="absolute left-[3px] top-[3px] h-[5px] w-[5px] bg-[#0a246a]" />
        </div>
    );

    const cursor =
        state.tool === 'pencil'
            ? CURSORS.pencil
            : state.tool === 'fill'
              ? CURSORS.fill
              : state.tool === 'pick'
                ? CURSORS.pick
                : state.tool === 'magnifier'
                  ? CURSORS.magnifier
                  : state.tool === 'eraser'
                    ? 'none'
                    : 'crosshair';

    const sel = state.selection;
    const selecting = state.tool === 'select' || state.tool === 'free-select';
    const viewport = { w: scrollRef.current?.clientWidth ?? W, h: scrollRef.current?.clientHeight ?? H };

    return (
        <div
            ref={scrollRef}
            className="relative min-h-0 min-w-0 flex-1 overflow-auto bg-[#808080]"
            style={SUNKEN}
            onContextMenu={(e) => e.preventDefault()}
        >
            <div className="w-max p-[3px] pb-[14px] pr-[14px]">
                <div
                    ref={wrapRef}
                    className="relative touch-none bg-white"
                    style={{ width: W, height: H, cursor }}
                    onPointerDown={onPointerDown}
                    onPointerMove={onPointerMove}
                    onPointerUp={onPointerUp}
                    onPointerCancel={onPointerCancel}
                    onPointerLeave={() => {
                        if (!drag.current) engine.leave();
                    }}
                    onDoubleClick={() => engine.doubleClick()}
                >
                    <canvas ref={mainRef} aria-label="Picture" className="absolute left-0 top-0" style={{ width: W, height: H, imageRendering: 'pixelated' }} />
                    <canvas ref={overlayRef} aria-hidden className="pointer-events-none absolute left-0 top-0" style={{ width: W, height: H, imageRendering: 'pixelated' }} />

                    {showGrid && z >= 4 && (
                        <div
                            aria-hidden
                            className="pointer-events-none absolute left-0 top-0"
                            style={{
                                width: W,
                                height: H,
                                backgroundImage:
                                    'linear-gradient(to right, rgba(128,128,128,0.6) 1px, transparent 1px), linear-gradient(to bottom, rgba(128,128,128,0.6) 1px, transparent 1px)',
                                backgroundSize: `${z}px ${z}px`,
                            }}
                        />
                    )}

                    {sel && (
                        <div
                            aria-label="Selection"
                            className="absolute border border-dashed border-black"
                            style={{
                                left: sel.x * z - 1,
                                top: sel.y * z - 1,
                                width: sel.w * z + 2,
                                height: sel.h * z + 2,
                                cursor: selecting ? 'move' : undefined,
                                pointerEvents: selecting ? 'auto' : 'none',
                            }}
                        />
                    )}

                    {state.text?.sizing && (
                        <div
                            aria-hidden
                            className="pointer-events-none absolute border border-dashed border-black"
                            style={{ left: state.text.x * z, top: state.text.y * z, width: state.text.w * z, height: state.text.h * z }}
                        />
                    )}
                    {state.text && !state.text.sizing && <TextBox engine={engine} state={state} />}

                    {state.tool === 'eraser' && <EraserCursor engine={engine} size={ERASER_SIZES[state.eraser]} zoom={z} />}
                    {state.tool === 'magnifier' && <MagnifierFrame engine={engine} state={state} viewport={viewport} />}

                    {resize && (
                        <div aria-hidden className="pointer-events-none absolute left-0 top-0 border border-dashed border-black" style={{ width: resize.w * z, height: resize.h * z }} />
                    )}

                    {handle('right', W, H / 2 - 2, 'ew-resize', 'Resize width')}
                    {handle('bottom', W / 2 - 2, H, 'ns-resize', 'Resize height')}
                    {handle('corner', W, H, 'nwse-resize', 'Resize')}
                </div>
            </div>
        </div>
    );
}
