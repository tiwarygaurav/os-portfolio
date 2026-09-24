"use client";

import { useMemo, useState, type PointerEvent as ReactPointerEvent } from 'react';
import AppDialog from '@/components/ui/AppDialog';
import { GroupBox, XPButton, XPRadio, XP_INPUT_CLASS, XP_SELECT_CLASS } from '@/components/ui/xp-controls';
import { BASIC_COLORS, HLS_MAX, channels, cssOf, fromHLS, rgbFrom, toHLS } from './palette';
import { MAX_SIDE, SAVE_FORMATS, type SaveFormat } from './codec';
import { TOOLS, ZOOM_LEVELS } from './tools';
import type { RGB } from './raster';

/** The resolution Paint reports and converts units with. Browsers assume 96 dpi as well. */
const DPI = 96;

/* ---------------------------------------------------------------- helpers */

function NumberField({
    label,
    value,
    onChange,
    min,
    max,
    step = 1,
    suffix,
    id,
}: {
    label: string;
    value: string;
    onChange: (v: string) => void;
    min?: number;
    max?: number;
    step?: number;
    suffix?: string;
    id: string;
}) {
    return (
        <label htmlFor={id} className="flex items-center gap-1.5">
            <span className="w-[70px] shrink-0">{label}</span>
            <input
                id={id}
                type="number"
                inputMode="decimal"
                value={value}
                min={min}
                max={max}
                step={step}
                onChange={(e) => onChange(e.target.value)}
                className={`${XP_INPUT_CLASS} w-[64px]`}
            />
            {suffix && <span className="text-[#444]">{suffix}</span>}
        </label>
    );
}

const clampInt = (v: string, min: number, max: number): number | null => {
    const n = Number(v);
    if (!Number.isFinite(n)) return null;
    const r = Math.round(n);
    return r >= min && r <= max ? r : null;
};

/* ------------------------------------------------------------ Attributes */

type Units = 'inches' | 'cm' | 'pixels';
const toUnits = (px: number, u: Units) => (u === 'pixels' ? String(px) : u === 'inches' ? (px / DPI).toFixed(2) : ((px / DPI) * 2.54).toFixed(2));
const fromUnits = (v: string, u: Units) => {
    const n = Number(v);
    if (!Number.isFinite(n)) return NaN;
    return Math.round(u === 'pixels' ? n : u === 'inches' ? n * DPI : (n / 2.54) * DPI);
};

export interface SavedInfo {
    at: Date;
    bytes: number;
}

export function AttributesDialog({
    width,
    height,
    defaultSize,
    lastSaved,
    onOk,
    onCancel,
}: {
    width: number;
    height: number;
    defaultSize: { width: number; height: number };
    lastSaved: SavedInfo | null;
    onOk: (width: number, height: number, blackAndWhite: boolean) => void;
    onCancel: () => void;
}) {
    const [units, setUnits] = useState<Units>('pixels');
    const [w, setW] = useState(String(width));
    const [h, setH] = useState(String(height));
    const [mono, setMono] = useState(false);

    const px = { w: fromUnits(w, units), h: fromUnits(h, units) };
    const valid = [px.w, px.h].every((n) => Number.isInteger(n) && n >= 1 && n <= MAX_SIDE);

    const switchUnits = (u: Units) => {
        if (Number.isFinite(px.w)) setW(toUnits(px.w, u));
        if (Number.isFinite(px.h)) setH(toUnits(px.h, u));
        setUnits(u);
    };

    return (
        <AppDialog title="Attributes" width={340} onCancel={onCancel} onOk={() => valid && onOk(px.w, px.h, mono)} okDisabled={!valid}>
            <div className="space-y-2">
                <div className="space-y-0.5 text-[#222]">
                    <p>File last saved: {lastSaved ? lastSaved.at.toLocaleString() : 'Not Available'}</p>
                    <p>Size on disk: {lastSaved ? `${lastSaved.bytes.toLocaleString()} bytes` : 'Not Available'}</p>
                    <p>Resolution: {DPI} x {DPI} dots per inch</p>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                    <NumberField id="attr-w" label="Width:" value={w} onChange={setW} min={0} step={units === 'pixels' ? 1 : 0.01} />
                    <NumberField id="attr-h" label="Height:" value={h} onChange={setH} min={0} step={units === 'pixels' ? 1 : 0.01} />
                    <XPButton
                        onClick={() => {
                            setW(toUnits(defaultSize.width, units));
                            setH(toUnits(defaultSize.height, units));
                        }}
                    >
                        Default
                    </XPButton>
                </div>
                {!valid && (
                    <p role="alert" className="text-[#c00000]">
                        Width and height must be between 1 and {MAX_SIDE.toLocaleString()} pixels.
                    </p>
                )}
                <GroupBox label="Units">
                    <div className="flex flex-wrap gap-x-4 gap-y-1">
                        {(['inches', 'cm', 'pixels'] as const).map((u) => (
                            <XPRadio key={u} name="attr-units" checked={units === u} onChange={() => switchUnits(u)} label={u === 'cm' ? 'Cm' : u[0].toUpperCase() + u.slice(1)} />
                        ))}
                    </div>
                </GroupBox>
                <GroupBox label="Colors">
                    <div className="flex flex-wrap gap-x-4 gap-y-1">
                        <XPRadio name="attr-colors" checked={mono} onChange={() => setMono(true)} label="Black and white" />
                        <XPRadio name="attr-colors" checked={!mono} onChange={() => setMono(false)} label="Colors" />
                    </div>
                </GroupBox>
            </div>
        </AppDialog>
    );
}

/* ----------------------------------------------------------- Flip / Rotate */

export type FlipRotate = { kind: 'flip'; direction: 'horizontal' | 'vertical' } | { kind: 'rotate'; degrees: 90 | 180 | 270 };

export function FlipRotateDialog({ onOk, onCancel }: { onOk: (a: FlipRotate) => void; onCancel: () => void }) {
    const [mode, setMode] = useState<'horizontal' | 'vertical' | 'rotate'>('horizontal');
    const [deg, setDeg] = useState<90 | 180 | 270>(90);
    return (
        <AppDialog
            title="Flip and Rotate"
            width={300}
            onCancel={onCancel}
            onOk={() => onOk(mode === 'rotate' ? { kind: 'rotate', degrees: deg } : { kind: 'flip', direction: mode })}
        >
            <GroupBox label="Flip or rotate">
                <div className="flex flex-col gap-1.5">
                    <XPRadio name="fr" checked={mode === 'horizontal'} onChange={() => setMode('horizontal')} label="Flip horizontal" />
                    <XPRadio name="fr" checked={mode === 'vertical'} onChange={() => setMode('vertical')} label="Flip vertical" />
                    <XPRadio name="fr" checked={mode === 'rotate'} onChange={() => setMode('rotate')} label="Rotate by angle" />
                    <div className="ml-5 flex flex-col gap-1.5">
                        {([90, 180, 270] as const).map((d) => (
                            <XPRadio key={d} name="fr-deg" disabled={mode !== 'rotate'} checked={deg === d} onChange={() => setDeg(d)} label={`${d}°`} />
                        ))}
                    </div>
                </div>
            </GroupBox>
        </AppDialog>
    );
}

/* ----------------------------------------------------------- Stretch / Skew */

export function StretchSkewDialog({
    onOk,
    onCancel,
}: {
    onOk: (stretchX: number, stretchY: number, skewX: number, skewY: number) => void;
    onCancel: () => void;
}) {
    const [sx, setSx] = useState('100');
    const [sy, setSy] = useState('100');
    const [kx, setKx] = useState('0');
    const [ky, setKy] = useState('0');
    const v = { sx: clampInt(sx, 1, 500), sy: clampInt(sy, 1, 500), kx: clampInt(kx, -89, 89), ky: clampInt(ky, -89, 89) };
    const valid = v.sx !== null && v.sy !== null && v.kx !== null && v.ky !== null;
    return (
        <AppDialog
            title="Stretch and Skew"
            width={320}
            onCancel={onCancel}
            okDisabled={!valid}
            onOk={() => valid && onOk(v.sx!, v.sy!, v.kx!, v.ky!)}
        >
            <div className="space-y-2">
                <GroupBox label="Stretch">
                    <div className="flex flex-col gap-1.5">
                        <NumberField id="st-h" label="Horizontal:" value={sx} onChange={setSx} min={1} max={500} suffix="%" />
                        <NumberField id="st-v" label="Vertical:" value={sy} onChange={setSy} min={1} max={500} suffix="%" />
                    </div>
                </GroupBox>
                <GroupBox label="Skew">
                    <div className="flex flex-col gap-1.5">
                        <NumberField id="sk-h" label="Horizontal:" value={kx} onChange={setKx} min={-89} max={89} suffix="Degrees" />
                        <NumberField id="sk-v" label="Vertical:" value={ky} onChange={setKy} min={-89} max={89} suffix="Degrees" />
                    </div>
                </GroupBox>
                {!valid && (
                    <p role="alert" className="text-[#c00000]">
                        Stretch takes 1 to 500 percent; skew takes -89 to 89 degrees.
                    </p>
                )}
            </div>
        </AppDialog>
    );
}

/* ------------------------------------------------------------------- Zoom */

export function ZoomDialog({ zoom, onOk, onCancel }: { zoom: number; onOk: (z: number) => void; onCancel: () => void }) {
    const [z, setZ] = useState(zoom);
    return (
        <AppDialog title="Custom Zoom" width={300} onCancel={onCancel} onOk={() => onOk(z)}>
            <p className="mb-2">Current zoom: {zoom * 100}%</p>
            <GroupBox label="Zoom to">
                <div className="grid grid-cols-2 gap-1.5">
                    {ZOOM_LEVELS.map((level) => (
                        <XPRadio key={level} name="zoom" checked={z === level} onChange={() => setZ(level)} label={`${level * 100}%`} />
                    ))}
                </div>
            </GroupBox>
        </AppDialog>
    );
}

/* ---------------------------------------------------------------- Save As */

const INVALID_NAME = /[\\/:*?"<>|]/;

export function SaveAsDialog({
    title,
    initialName,
    initialFormat,
    onSave,
    onCancel,
}: {
    title: string;
    initialName: string;
    initialFormat: SaveFormat;
    onSave: (name: string, format: SaveFormat) => void;
    onCancel: () => void;
}) {
    const [name, setName] = useState(initialName);
    const [format, setFormat] = useState<SaveFormat>(initialFormat);
    const trimmed = name.trim();
    const error = !trimmed
        ? 'Type a file name.'
        : INVALID_NAME.test(trimmed)
          ? 'A file name cannot contain any of the following characters: \\ / : * ? " < > |'
          : null;
    return (
        <AppDialog
            title={title}
            width={400}
            onCancel={onCancel}
            onOk={() => !error && onSave(trimmed, format)}
            okLabel="Save"
            okDisabled={!!error}
        >
            <div className="space-y-2">
                <label className="flex items-center gap-2">
                    <span className="w-[80px] shrink-0">File name:</span>
                    <input value={name} onChange={(e) => setName(e.target.value)} className={`${XP_INPUT_CLASS} min-w-0 flex-1`} spellCheck={false} />
                </label>
                <label className="flex items-center gap-2">
                    <span className="w-[80px] shrink-0">Save as type:</span>
                    <select value={format} onChange={(e) => setFormat(e.target.value as SaveFormat)} className={`${XP_SELECT_CLASS} min-w-0 flex-1`}>
                        {SAVE_FORMATS.map((f) => (
                            <option key={f.id} value={f.id}>
                                {f.label}
                            </option>
                        ))}
                    </select>
                </label>
                {error && name !== '' && (
                    <p role="alert" className="text-[#c00000]">
                        {error}
                    </p>
                )}
                <p className="leading-relaxed text-[#444]">
                    The picture is saved to your browser&apos;s downloads, as a real {format === 'bmp' ? 'BMP' : format.toUpperCase()} file.
                </p>
            </div>
        </AppDialog>
    );
}

/* ---------------------------------------------------------------- Help */

const HELP_KEYS: [string, string][] = [
    ['Ctrl+Z / Ctrl+Y', 'Undo / Repeat'],
    ['Ctrl+X, Ctrl+C, Ctrl+V', 'Cut, Copy, Paste — including pictures from other programs'],
    ['Del', 'Clear the selection to the background colour'],
    ['Ctrl+A', 'Select All'],
    ['Ctrl+O / Ctrl+S / Ctrl+P', 'Open / Save (My Pictures) / Print'],
    ['Ctrl+I', 'Invert Colors'],
    ['Ctrl+E', 'Attributes'],
    ['Ctrl+R', 'Flip/Rotate'],
    ['Ctrl+G', 'Show Grid (at 400% and above)'],
    ['Ctrl+F', 'View Bitmap'],
    ['Shift while drawing', 'Straight lines at 45° steps; squares and circles'],
    ['Ctrl while dragging a selection', 'Leave a copy behind'],
    ['Shift while dragging a selection', 'Leave a trail of copies'],
    ['Esc', 'Cancel what you are drawing'],
];

export function HelpDialog({ onClose }: { onClose: () => void }) {
    return (
        <AppDialog
            title="Paint Help"
            width={460}
            onCancel={onClose}
            footer={
                <div className="mt-3 flex justify-end">
                    <XPButton data-ok isDefault onClick={onClose}>
                        Close
                    </XPButton>
                </div>
            }
        >
            <div className="max-h-[52vh] space-y-3 overflow-y-auto pr-1 leading-relaxed">
                <section>
                    <h3 className="font-bold">Colors</h3>
                    <p>
                        Click a colour to draw with it; right-click one to make it the background colour. Every tool
                        draws in the foreground colour with the left button and in the background colour with the
                        right. Double-click a colour to change it.
                    </p>
                </section>
                <section>
                    <h3 className="font-bold">Tools</h3>
                    <ul className="space-y-0.5">
                        {TOOLS.map((t) => (
                            <li key={t.id}>
                                <span className="font-bold">{t.name}</span> — {t.hint}
                            </li>
                        ))}
                    </ul>
                    <p className="mt-1">
                        The Eraser dragged with the right button is the Color Eraser: it turns only the foreground
                        colour into the background colour. Curves take three steps: drag a line, then click-drag
                        twice to bend it. Polygons close on a double-click.
                    </p>
                </section>
                <section>
                    <h3 className="font-bold">Keyboard</h3>
                    <table className="w-full">
                        <tbody>
                            {HELP_KEYS.map(([k, v]) => (
                                <tr key={k} className="align-top">
                                    <td className="whitespace-nowrap py-0.5 pr-3 font-mono text-[11px]">{k}</td>
                                    <td className="py-0.5">{v}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </section>
                <section>
                    <h3 className="font-bold">Opening and saving</h3>
                    <p>
                        Open and Save use this desktop&apos;s own files: pictures saved in My Pictures stay in this browser, and
                        they appear in My Computer, the picture viewer and the Command Prompt too. Open from Computer reads
                        any picture your browser can display; Save to Computer writes a real PNG, JPEG or 24-bit BMP to your
                        downloads. Set As Background puts the saved picture on the desktop, tiled or centred.
                        Everything is drawn pixel by pixel without smoothing, the way Paint always did, so Fill With Color
                        meets every line exactly.
                    </p>
                </section>
            </div>
        </AppDialog>
    );
}

/* ------------------------------------------------------------ Edit Colors */

const SPECTRUM_W = 176;
const SPECTRUM_H = 150;

/** The hue/saturation field, drawn once at XP's fixed luminosity of 120. */
function useSpectrum() {
    return useMemo(() => {
        if (typeof document === 'undefined') return '';
        const c = document.createElement('canvas');
        c.width = SPECTRUM_W;
        c.height = SPECTRUM_H;
        const ctx = c.getContext('2d');
        if (!ctx) return '';
        const img = ctx.createImageData(SPECTRUM_W, SPECTRUM_H);
        for (let y = 0; y < SPECTRUM_H; y++) {
            for (let x = 0; x < SPECTRUM_W; x++) {
                const [r, g, b] = channels(fromHLS((x / (SPECTRUM_W - 1)) * (HLS_MAX - 1), (1 - y / (SPECTRUM_H - 1)) * HLS_MAX, HLS_MAX / 2));
                const i = (y * SPECTRUM_W + x) * 4;
                img.data[i] = r;
                img.data[i + 1] = g;
                img.data[i + 2] = b;
                img.data[i + 3] = 255;
            }
        }
        ctx.putImageData(img, 0, 0);
        return c.toDataURL();
    }, []);
}

function Swatch({ rgb, selected, onClick, label }: { rgb: RGB; selected: boolean; onClick: () => void; label: string }) {
    return (
        <button
            type="button"
            aria-label={label}
            aria-pressed={selected}
            onClick={onClick}
            className={`h-[15px] w-[19px] border ${selected ? 'border-black outline outline-1 outline-offset-1 outline-black' : 'border-t-[#808080] border-l-[#808080] border-b-white border-r-white'}`}
            style={{ background: cssOf(rgb) }}
        />
    );
}

export function EditColorsDialog({
    initial,
    custom,
    onCustomChange,
    onOk,
    onCancel,
}: {
    initial: RGB;
    custom: RGB[];
    onCustomChange: (next: RGB[]) => void;
    onOk: (rgb: RGB) => void;
    onCancel: () => void;
}) {
    const [rgb, setRgb] = useState<RGB>(initial);
    const [hls, setHls] = useState(() => toHLS(initial));
    const [expanded, setExpanded] = useState(false);
    const [customSlot, setCustomSlot] = useState(0);
    const spectrum = useSpectrum();
    const [r, g, b] = channels(rgb);

    const fromRgb = (next: RGB) => {
        setRgb(next);
        setHls(toHLS(next));
    };
    const fromHls = (h: number, s: number, l: number) => {
        const next = { h: Math.round(h), s: Math.round(s), l: Math.round(l) };
        setHls(next);
        setRgb(fromHLS(next.h, next.s, next.l));
    };

    const dragField = (e: ReactPointerEvent<HTMLDivElement>, kind: 'spectrum' | 'lum') => {
        const el = e.currentTarget;
        el.setPointerCapture(e.pointerId);
        const read = (clientX: number, clientY: number) => {
            const box = el.getBoundingClientRect();
            const fx = Math.max(0, Math.min(1, (clientX - box.left) / box.width));
            const fy = Math.max(0, Math.min(1, (clientY - box.top) / box.height));
            if (kind === 'spectrum') fromHls(fx * (HLS_MAX - 1), (1 - fy) * HLS_MAX, hls.l);
            else fromHls(hls.h, hls.s, (1 - fy) * HLS_MAX);
        };
        read(e.clientX, e.clientY);
        const move = (ev: PointerEvent) => read(ev.clientX, ev.clientY);
        const up = () => {
            el.removeEventListener('pointermove', move);
            el.removeEventListener('pointerup', up);
            el.removeEventListener('pointercancel', up);
        };
        el.addEventListener('pointermove', move);
        el.addEventListener('pointerup', up);
        el.addEventListener('pointercancel', up);
    };

    const lumGradient = `linear-gradient(to bottom, ${cssOf(fromHLS(hls.h, hls.s, HLS_MAX))}, ${cssOf(fromHLS(hls.h, hls.s, HLS_MAX / 2))}, ${cssOf(fromHLS(hls.h, hls.s, 0))})`;

    // Label and field as two grid cells, so both columns line up the way XP's dialog did.
    const numberInput = (label: string, value: number, max: number, set: (n: number) => void) => (
        <>
            <label htmlFor={`ec-${label}`} className="text-right">
                {label}
            </label>
            <input
                id={`ec-${label}`}
                type="number"
                min={0}
                max={max}
                value={value}
                onChange={(e) => {
                    const n = Number(e.target.value);
                    if (Number.isFinite(n)) set(Math.max(0, Math.min(max, Math.round(n))));
                }}
                className={`${XP_INPUT_CLASS} w-[38px] [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none`}
            />
        </>
    );

    return (
        <AppDialog title="Edit Colors" width={expanded ? 468 : 250} onCancel={onCancel} onOk={() => onOk(rgb)}>
            <div className="flex flex-wrap gap-3">
                <div className="w-[196px] shrink-0 space-y-2">
                    <div>
                        <p className="mb-1">Basic colors:</p>
                        <div className="grid grid-cols-8 gap-[3px]">
                            {BASIC_COLORS.map((c, i) => (
                                <Swatch key={i} rgb={c} selected={c === rgb} onClick={() => fromRgb(c)} label={cssOf(c)} />
                            ))}
                        </div>
                    </div>
                    <div>
                        <p className="mb-1">Custom colors:</p>
                        <div className="grid grid-cols-8 gap-[3px]">
                            {custom.map((c, i) => (
                                <Swatch
                                    key={i}
                                    rgb={c}
                                    selected={i === customSlot && expanded}
                                    onClick={() => {
                                        setCustomSlot(i);
                                        fromRgb(c);
                                    }}
                                    label={`Custom color ${i + 1}`}
                                />
                            ))}
                        </div>
                    </div>
                    <XPButton className="w-full" disabled={expanded} onClick={() => setExpanded(true)}>
                        Define Custom Colors &gt;&gt;
                    </XPButton>
                </div>

                {expanded && (
                    <div className="space-y-2">
                        <div className="flex gap-2">
                            <div
                                role="slider"
                                aria-label="Hue and saturation"
                                aria-valuetext={`Hue ${hls.h}, saturation ${hls.s}`}
                                aria-valuenow={hls.h}
                                tabIndex={0}
                                onPointerDown={(e) => dragField(e, 'spectrum')}
                                className="relative shrink-0 cursor-crosshair touch-none border border-t-[#808080] border-l-[#808080] border-b-white border-r-white"
                                style={{ width: SPECTRUM_W, height: SPECTRUM_H, backgroundImage: spectrum ? `url(${spectrum})` : undefined }}
                            >
                                <span
                                    aria-hidden
                                    className="pointer-events-none absolute h-[11px] w-[11px] -translate-x-1/2 -translate-y-1/2"
                                    style={{
                                        left: (hls.h / (HLS_MAX - 1)) * SPECTRUM_W,
                                        top: (1 - hls.s / HLS_MAX) * SPECTRUM_H,
                                        background: 'linear-gradient(#000,#000) center/100% 1px no-repeat, linear-gradient(#000,#000) center/1px 100% no-repeat',
                                    }}
                                />
                            </div>
                            <div
                                role="slider"
                                aria-label="Luminosity"
                                aria-valuenow={hls.l}
                                aria-valuemin={0}
                                aria-valuemax={HLS_MAX}
                                tabIndex={0}
                                onPointerDown={(e) => dragField(e, 'lum')}
                                className="relative h-[150px] w-[22px] shrink-0 cursor-ns-resize touch-none"
                            >
                                <div className="absolute inset-y-0 left-0 w-[12px] border border-[#808080]" style={{ background: lumGradient }} />
                                <span
                                    aria-hidden
                                    className="pointer-events-none absolute right-0 h-0 w-0 -translate-y-1/2 border-y-[5px] border-r-[7px] border-y-transparent border-r-black"
                                    style={{ top: (1 - hls.l / HLS_MAX) * SPECTRUM_H }}
                                />
                            </div>
                        </div>
                        <div className="flex items-start gap-2">
                            <div className="shrink-0">
                                <div className="h-[42px] w-[50px] border border-[#808080]" style={{ background: cssOf(rgb) }} />
                                <p className="text-center">Color|Solid</p>
                            </div>
                            <div className="grid grid-cols-[auto_38px_auto_38px] items-center gap-x-1 gap-y-1">
                                {numberInput('Hue:', hls.h, HLS_MAX - 1, (n) => fromHls(n, hls.s, hls.l))}
                                {numberInput('Red:', r, 255, (n) => fromRgb(rgbFrom(n, g, b)))}
                                {numberInput('Sat:', hls.s, HLS_MAX, (n) => fromHls(hls.h, n, hls.l))}
                                {numberInput('Green:', g, 255, (n) => fromRgb(rgbFrom(r, n, b)))}
                                {numberInput('Lum:', hls.l, HLS_MAX, (n) => fromHls(hls.h, hls.s, n))}
                                {numberInput('Blue:', b, 255, (n) => fromRgb(rgbFrom(r, g, n)))}
                            </div>
                        </div>
                        <XPButton
                            className="w-full"
                            onClick={() => {
                                const next = [...custom];
                                next[customSlot] = rgb;
                                onCustomChange(next);
                                setCustomSlot((customSlot + 1) % custom.length);
                            }}
                        >
                            Add to Custom Colors
                        </XPButton>
                    </div>
                )}
            </div>
        </AppDialog>
    );
}
