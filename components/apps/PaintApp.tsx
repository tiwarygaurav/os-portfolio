"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type ClipboardEvent, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { useSystemStore, type WindowPayload } from '@/store/useSystemStore';
import { xpAlert } from '@/utils/dialog';
import { PROFILE, SYSTEM } from '@/content';
import { PICTURES_PATH, isFile, lookup } from '@/system/vfs';
import FileDialog, { type FileType } from '@/components/os/FileDialog';
import MenuBar, { type MenuDef } from '@/components/ui/MenuBar';
import { XP_SELECT_CLASS } from '@/components/ui/xp-controls';
import { FONT_FAMILIES, FONT_SIZES, PaintEngine, type FontSettings } from './paint/engine';
import type { Bitmap, RGB } from './paint/raster';
import { canvasOf, decodeImage, download, encodeImage, formatOf, readClipboardImage, writeClipboardImage, MAX_SIDE, type SaveFormat } from './paint/codec';
import { ToolBox, RAISED } from './paint/Toolbox';
import { ColorBox } from './paint/ColorBox';
import { CanvasArea } from './paint/Canvas';
import {
    AttributesDialog,
    EditColorsDialog,
    FlipRotateDialog,
    HelpDialog,
    SaveAsDialog,
    StretchSkewDialog,
    ZoomDialog,
    type SavedInfo,
} from './paint/Dialogs';

/**
 * Paint — a native rebuild of Windows XP's mspaint.
 *
 * This replaced an `<iframe>` of a third-party site. Everything here runs on this desktop: the
 * sixteen tools, the colour box, undo, and the Image and Colors menus. Pictures are drawn pixel by
 * pixel without anti-aliasing (see `paint/raster.ts` for why that matters).
 *
 * Open and Save work on the desktop's own filesystem — My Pictures under /home/guest — through the
 * same XP common dialog Notepad uses, so a saved drawing appears in Explorer, the picture viewer
 * and the Command Prompt. "Open from Computer" and "Save to Computer" read and write real files on
 * the visitor's machine. The clipboard is the real one where the browser allows.
 */

const DEFAULT_HINT = 'For Help, click Help Topics on the Help Menu.';

/** What My Pictures can hold: the store keeps PNG and JPEG. BMP is a Save to Computer format. */
const PICTURE_TYPES: FileType[] = [
    { label: 'PNG (*.png)', test: (f) => /\.png$/i.test(f.name), ext: '.png' },
    { label: 'JPEG (*.jpg;*.jpeg)', test: (f) => /\.jpe?g$/i.test(f.name), ext: '.jpg' },
    { label: 'All Picture Files', test: (f) => Boolean(f.src) },
];

const baseName = (path: string) => path.slice(path.lastIndexOf('/') + 1);

/** A visitor's own file, which Save may overwrite in place. Sample Pictures are read-only. */
const isWritable = (path: string | null): path is string => {
    if (!path) return false;
    const node = lookup(path);
    return !node || (isFile(node) && !!node.writable);
};

/** Bytes in a base64 data: URL — what the file is, rather than the characters it is stored as. */
const dataUrlBytes = (url: string) => {
    const b64 = url.slice(url.indexOf(',') + 1);
    return Math.floor((b64.length * 3) / 4) - (b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0);
};

/** The picture's starting size: whatever fits the window it opens in, as XP's Paint did. */
function fittingSize(windowId?: string) {
    const win = useSystemStore.getState().windows.find((w) => w.id === windowId);
    const vw = typeof window !== 'undefined' ? window.innerWidth : 840;
    const vh = typeof window !== 'undefined' ? window.innerHeight - 36 : 600;
    const outer = !win || win.isMaximized ? { width: vw, height: vh } : win.size;
    const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, Math.round(v)));
    // Horizontally: toolbox and borders. Vertically: title bar, menu, colour box, status bar.
    return { width: clamp(outer.width - 90, 64, 1024), height: clamp(outer.height - 150, 64, 768) };
}

const stripExtension = (name: string) => name.replace(/\.(png|jpe?g|jpe|jfif|bmp|dib|gif|webp|tiff?)$/i, '');
const formatFromName = (name: string): SaveFormat => (/\.(jpe?g|jpe|jfif)$/i.test(name) ? 'jpeg' : /\.(bmp|dib)$/i.test(name) ? 'bmp' : 'png');

type DialogState =
    | null
    | { kind: 'attributes' }
    | { kind: 'flip' }
    | { kind: 'stretch' }
    | { kind: 'zoom' }
    | { kind: 'colors'; index: number }
    | { kind: 'download' }
    | { kind: 'help' };

/** The common dialog, and what its answer is for. */
type FileDialogState = null | { mode: 'open'; purpose: 'picture' | 'paste' } | { mode: 'save'; purpose: 'picture' | 'selection' };

export default function PaintApp({ windowId, payload }: { windowId?: string; payload?: WindowPayload }) {
    const [initialSize] = useState(() => fittingSize(windowId));
    const [engine] = useState(() => new PaintEngine(initialSize.width, initialSize.height));
    const s = useSyncExternalStore(engine.subscribe, engine.getState, engine.getState);
    const active = useSystemStore((st) => st.activeWindowId === windowId);
    const actions = useSystemStore((st) => st.actions);
    const { closeWindow, openDialog } = actions;

    const rootRef = useRef<HTMLDivElement>(null);
    const scrollRef = useRef<HTMLDivElement>(null);
    const openInput = useRef<HTMLInputElement>(null);
    /** Whether the system clipboard holds what Paint last copied (writing it can be refused). */
    const clipboardSynced = useRef(false);
    const pendingScroll = useRef<{ left: number; top: number } | null>(null);

    const [showTools, setShowTools] = useState(true);
    const [showColors, setShowColors] = useState(true);
    const [showStatus, setShowStatus] = useState(true);
    const [showTextBar, setShowTextBar] = useState(true);
    const [showGrid, setShowGrid] = useState(false);
    const [viewBitmap, setViewBitmap] = useState<string | null>(null);
    const [menuHint, setMenuHint] = useState<string | null>(null);
    const [toolHint, setToolHint] = useState<string | null>(null);
    const [resizePreview, setResizePreview] = useState<{ w: number; h: number } | null>(null);
    const [dialog, setDialog] = useState<DialogState>(null);
    const [fileDialog, setFileDialog] = useState<FileDialogState>(null);
    /** Where the picture lives on this desktop; null while untitled or opened from the computer. */
    const [docPath, setDocPath] = useState<string | null>(null);
    /** The name of a picture opened from the computer, which has no path here. */
    const [localName, setLocalName] = useState<string | null>(null);
    /** The format Save to Computer offers first: the last one used, or the opened file's own. */
    const [downloadFormat, setDownloadFormat] = useState<SaveFormat>('png');
    const [lastSaved, setLastSaved] = useState<SavedInfo | null>(null);
    const fileName = docPath ? stripExtension(baseName(docPath)) : (localName ?? 'untitled');

    /** Run once a Save As completes — the New, Open or close that asked to save first. */
    const afterSave = useRef<(() => void) | null>(null);
    // The close guard runs outside React's render cycle, so it reads the latest values from here.
    const live = useRef({ docPath, fileName });
    live.current = { docPath, fileName };
    const [customColors, setCustomColors] = useState<RGB[]>(() => Array(16).fill(0xffffff));

    const focusRoot = () => rootRef.current?.focus({ preventScroll: true });

    // Take the keyboard when this becomes the active window, as XP gave it to a window on
    // activation, so shortcuts work before the first click inside it.
    useEffect(() => {
        const root = rootRef.current;
        if (active && root && !root.contains(document.activeElement)) root.focus({ preventScroll: true });
    }, [active]);

    /* ------------------------------------------------------------ view */

    const zoomTo = useCallback(
        (z: number, center?: { x: number; y: number }) => {
            const el = scrollRef.current;
            if (el && center) {
                const vw = el.clientWidth / z;
                const vh = el.clientHeight / z;
                const left = Math.max(0, Math.min(s.width - vw, center.x - vw / 2));
                const top = Math.max(0, Math.min(s.height - vh, center.y - vh / 2));
                pendingScroll.current = { left: left * z, top: top * z };
            }
            engine.setZoom(z);
            if (z < 4) setShowGrid(false);
        },
        [engine, s.width, s.height],
    );

    // Scroll to the magnified area once the zoomed picture has been laid out.
    useLayoutEffect(() => {
        const target = pendingScroll.current;
        if (!target || !scrollRef.current) return;
        pendingScroll.current = null;
        scrollRef.current.scrollTo(target);
    }, [s.zoom]);

    const magnify = (x: number, y: number) => {
        // Clicking with the Magnifier while zoomed goes back to actual size, as in Paint.
        if (s.zoom !== 1) zoomTo(1);
        else if (s.magnification !== 1) zoomTo(s.magnification, { x, y });
        engine.returnToPreviousTool();
    };

    /** The top-left of the visible part of the picture: where Paint pasted. */
    const visibleOrigin = () => {
        const el = scrollRef.current;
        return el ? { x: Math.floor(el.scrollLeft / s.zoom), y: Math.floor(el.scrollTop / s.zoom) } : { x: 0, y: 0 };
    };

    /* ------------------------------------------------------------ saving */

    // "flower - Paint", as XP titled it.
    useEffect(() => {
        if (windowId) actions.setWindowTitle(windowId, `${fileName} - Paint`);
    }, [windowId, fileName, actions]);

    /**
     * Write a picture into the desktop's filesystem. My Pictures holds PNG and JPEG; the store's
     * refusal (a read-only folder, a full browser) is shown in its own words. True when written.
     */
    const writePicture = (target: string, bitmap: Bitmap, purpose: 'picture' | 'selection'): boolean => {
        const jpeg = /\.jpe?g$/i.test(target);
        if (!jpeg && !/\.png$/i.test(target)) {
            void xpAlert('Paint', [
                `Paint cannot save ${baseName(target)} here.`,
                'Pictures on this desktop are saved as PNG or JPEG. To keep a 24-bit bitmap, use File > Save to Computer.',
            ], 'warning');
            return false;
        }
        const url = canvasOf(bitmap).toDataURL(jpeg ? 'image/jpeg' : 'image/png', 0.92);
        const problem = actions.writeUserFile(target, { content: url, mime: jpeg ? 'image/jpeg' : 'image/png' });
        if (problem) {
            void xpAlert('Paint', [problem], 'warning');
            return false;
        }
        if (purpose === 'picture') {
            setDocPath(target);
            setLocalName(null);
            setLastSaved({ at: new Date(), bytes: dataUrlBytes(url) });
            // Synchronously too: a close waiting on this save re-runs the close guard before React
            // re-renders, and must see the picture as saved rather than ask again.
            live.current = { docPath: target, fileName: stripExtension(baseName(target)) };
            engine.markSaved();
        }
        return true;
    };

    /**
     * Save to Computer: a real PNG, JPEG or 24-bit BMP handed to the browser's downloads. An
     * export, not a save — the picture on this desktop is unchanged, so it stays "modified".
     */
    const downloadPicture = async (bitmap: Bitmap, name: string, format: SaveFormat) => {
        try {
            const blob = await encodeImage(bitmap, format);
            download(blob, `${stripExtension(name)}.${formatOf(format).ext}`);
        } catch (err) {
            void xpAlert('Paint', ['The picture could not be saved.', err instanceof Error ? err.message : String(err)], 'error');
        }
    };

    /** Save in place; an untitled or read-only picture goes to Save As instead. True if saved now. */
    const save = (): boolean => {
        const path = live.current.docPath;
        if (isWritable(path)) return writePicture(path, engine.snapshot(), 'picture');
        setFileDialog({ mode: 'save', purpose: 'picture' });
        return false;
    };

    /**
     * XP's question: Yes saves, No discards, Cancel stays. Resolves true when the picture may be
     * replaced now. When Yes needs a Save As first, `then` runs once that save succeeds, and this
     * resolves false.
     */
    const askToSave = async (then: () => void): Promise<boolean> => {
        if (!engine.getState().modified) return true;
        const answer = await openDialog({
            title: 'Paint',
            body: [`Save changes to ${live.current.fileName}?`],
            icon: 'warning',
            buttons: [
                { id: 'yes', label: 'Yes', primary: true },
                { id: 'no', label: 'No' },
                { id: 'cancel', label: 'Cancel', cancel: true },
            ],
        });
        if (answer === 'no') return true;
        if (answer === 'cancel') return false;
        if (save()) return true;
        afterSave.current = then;
        return false;
    };
    const askRef = useRef(askToSave);
    askRef.current = askToSave;

    // The title-bar close button, Alt+F4 and File > Exit all ask about unsaved changes.
    useEffect(() => {
        if (!windowId) return;
        return actions.registerCloseGuard(windowId, () => askRef.current(() => actions.closeWindow(windowId)));
    }, [windowId, actions]);

    /* ------------------------------------------------------------ files */

    const fileNew = async () => {
        const reset = () => {
            engine.newImage(initialSize.width, initialSize.height);
            setDocPath(null);
            setLocalName(null);
            setLastSaved(null);
        };
        if (await askToSave(reset)) reset();
    };

    const fileOpen = async () => {
        const open = () => setFileDialog({ mode: 'open', purpose: 'picture' });
        if (await askToSave(open)) open();
    };

    const openFromComputer = async () => {
        const pick = () => openInput.current?.click();
        if (await askToSave(pick)) pick();
    };

    const exit = () => {
        if (windowId) closeWindow(windowId);
    };

    /**
     * File > Set As Background, as XP had it. The wallpaper points at the saved file rather than
     * holding a second copy of the picture, so a picture that is unsaved — or has changed since it
     * was saved — is saved first, and becomes the background once that save succeeds.
     */
    const setAsBackground = async (position: 'tile' | 'center') => {
        const apply = () => {
            const path = live.current.docPath;
            if (!path) return;
            const problem = actions.setWallpaperFile(path, position);
            if (problem) void xpAlert('Paint', [problem], 'warning');
        };
        if (live.current.docPath && !engine.getState().modified) {
            apply();
            return;
        }
        const answer = await openDialog({
            title: 'Paint',
            body: ['The picture must be saved before it can be used as the desktop background.', 'Do you want to save it now?'],
            icon: 'question',
            buttons: [
                { id: 'yes', label: 'Yes', primary: true },
                { id: 'no', label: 'No', cancel: true },
            ],
        });
        if (answer !== 'yes') return;
        if (save()) apply();
        else afterSave.current = apply;
    };

    /**
     * File > Print: the picture alone, through the browser's own print dialog. It goes through a
     * detached frame holding just the image, so the desktop around the window is never printed.
     */
    const printPicture = () => {
        const url = canvasOf(engine.snapshot()).toDataURL('image/png');
        const frame = document.createElement('iframe');
        frame.setAttribute('aria-hidden', 'true');
        Object.assign(frame.style, { position: 'fixed', right: '0', bottom: '0', width: '0', height: '0', border: '0' });
        document.body.appendChild(frame);
        const doc = frame.contentDocument;
        const win = frame.contentWindow;
        if (!doc || !win) {
            frame.remove();
            return;
        }
        doc.title = `${fileName} - Paint`;
        const style = doc.createElement('style');
        style.textContent = '@page { margin: 12mm } html, body { margin: 0 } img { max-width: 100%; max-height: 100vh; image-rendering: pixelated }';
        const img = doc.createElement('img');
        img.alt = fileName;
        doc.head.appendChild(style);
        doc.body.appendChild(img);
        let removed = false;
        const cleanup = () => {
            if (removed) return;
            removed = true;
            frame.remove();
        };
        win.addEventListener('afterprint', cleanup);
        img.onload = () => {
            win.focus();
            win.print();
            // Some browsers return from print() before the dialog closes and never fire afterprint.
            setTimeout(cleanup, 60_000);
        };
        img.src = url;
    };

    const readPicture = async (file: Blob, name: string) => {
        try {
            const { bitmap, scaledFrom } = await decodeImage(file);
            if (scaledFrom) {
                void xpAlert('Paint', [
                    `This picture is ${scaledFrom.width} x ${scaledFrom.height} pixels.`,
                    `Paint on this desktop opens pictures up to ${MAX_SIDE} pixels on a side, so it has been scaled to ${bitmap.width} x ${bitmap.height}.`,
                ]);
            }
            return bitmap;
        } catch {
            void xpAlert('Paint', [`Paint cannot read ${name}.`, 'This is not a valid bitmap file, or its format is not currently supported.'], 'error');
            return null;
        }
    };

    /** Open from the computer: a real file, which has no path on this desktop. */
    const onOpenFile = async (file: File | undefined) => {
        if (!file) return;
        const bitmap = await readPicture(file, file.name);
        if (!bitmap) return;
        engine.load(bitmap);
        setDocPath(null);
        setLocalName(stripExtension(file.name));
        setDownloadFormat(formatFromName(file.name));
        setLastSaved({ at: new Date(file.lastModified), bytes: file.size });
        focusRoot();
    };

    /** A picture in the desktop's filesystem, decoded; null (having said why) when it cannot be. */
    const readFromDesktop = async (path: string): Promise<Bitmap | null> => {
        const node = lookup(path);
        if (!node || !isFile(node) || !node.src) {
            void xpAlert('Paint', [`Paint cannot read ${baseName(path)}.`, 'This is not a valid bitmap file, or its format is not currently supported.'], 'error');
            return null;
        }
        try {
            const blob = await (await fetch(node.src)).blob();
            return await readPicture(blob, baseName(path));
        } catch {
            void xpAlert('Paint', [`Paint cannot read ${baseName(path)}.`], 'error');
            return null;
        }
    };

    const openFromDesktop = async (path: string) => {
        const bitmap = await readFromDesktop(path);
        if (!bitmap) return;
        engine.load(bitmap);
        setDocPath(path);
        setLocalName(null);
        const node = lookup(path);
        setLastSaved(node && isFile(node) && node.modified ? { at: new Date(node.modified), bytes: node.src ? dataUrlBytes(node.src) : 0 } : null);
        focusRoot();
    };

    // Opened with a picture (`open ~/…/x.png` in the shell, or a later hand-off to this window).
    const lastPayload = useRef<WindowPayload | undefined>(undefined);
    useEffect(() => {
        if (!payload?.path || payload === lastPayload.current) return;
        lastPayload.current = payload;
        const target = payload.path;
        const open = () => void openFromDesktop(target);
        void askRef.current(open).then((ok) => ok && open());
        // `openFromDesktop` closes over stable setters and the engine.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [payload]);

    /* ------------------------------------------------------------ clipboard */

    const copy = () => {
        const b = engine.copySelection();
        if (!b) return;
        clipboardSynced.current = false;
        void writeClipboardImage(b).then((ok) => {
            clipboardSynced.current = ok;
        });
    };

    const cut = () => {
        if (!engine.hasSelection) return;
        copy();
        engine.clearSelection();
    };

    /** Paste as a floating selection, offering to enlarge the picture first if it is bigger. */
    const pasteBitmap = async (b: Bitmap) => {
        const cur = engine.getState();
        if (b.width > cur.width || b.height > cur.height) {
            const answer = await openDialog({
                title: 'Paint',
                body: ['The image in the clipboard is larger than the bitmap.', 'Would you like the bitmap enlarged?'],
                icon: 'question',
                buttons: [
                    { id: 'yes', label: 'Yes', primary: true },
                    { id: 'no', label: 'No' },
                    { id: 'cancel', label: 'Cancel', cancel: true },
                ],
            });
            if (answer === 'cancel') return;
            if (answer === 'yes') engine.resize(Math.max(cur.width, b.width), Math.max(cur.height, b.height));
        }
        const o = visibleOrigin();
        engine.paste(b, o.x, o.y);
        focusRoot();
    };

    const pasteBlob = async (blob: Blob) => {
        const b = await readPicture(blob, 'the clipboard picture');
        if (b) await pasteBitmap(b);
    };

    /** Edit > Paste: the async clipboard where the browser allows it, Paint's own otherwise. */
    const pasteFromMenu = async () => {
        if (engine.clipboard && !clipboardSynced.current) return pasteBitmap(engine.clipboard);
        const blob = await readClipboardImage();
        if (blob) return pasteBlob(blob);
        if (engine.clipboard) return pasteBitmap(engine.clipboard);
        void xpAlert('Paint', [
            'There is no picture on the clipboard that this page can read.',
            'Copy a selection first, or press Ctrl+V to paste a picture from another program — browsers hand pictures to a page only when you press the keys yourself.',
        ]);
    };

    const onPaste = (e: ClipboardEvent<HTMLDivElement>) => {
        const t = e.target as HTMLElement;
        if (t.tagName === 'TEXTAREA' || t.tagName === 'INPUT') return;
        const file = Array.from(e.clipboardData.files).find((f) => f.type.startsWith('image/'));
        e.preventDefault();
        if (engine.clipboard && !clipboardSynced.current) void pasteBitmap(engine.clipboard);
        else if (file) void pasteBlob(file);
        else if (engine.clipboard) void pasteBitmap(engine.clipboard);
    };

    /* ------------------------------------------------------------ keyboard */

    const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
        const t = e.target as HTMLElement;
        if (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT') return;
        const ctrl = e.ctrlKey || e.metaKey;
        let handled = true;
        if (ctrl && !e.altKey && !e.shiftKey) {
            switch (e.key.toLowerCase()) {
                case 'z': engine.undo(); break;
                case 'y': engine.redo(); break;
                case 'x': cut(); break;
                case 'c': copy(); break;
                case 'a': engine.selectAll(); break;
                case 'o': void fileOpen(); break;
                case 's': save(); break;
                case 'p': printPicture(); break;
                case 'i': engine.invertColors(); break;
                case 'e': setDialog({ kind: 'attributes' }); break;
                case 'r': setDialog({ kind: 'flip' }); break;
                case 'f': setViewBitmap(canvasOf(engine.snapshot()).toDataURL()); break;
                case 'l': setShowColors((v) => !v); break;
                case 'g': if (s.zoom >= 4) setShowGrid((v) => !v); break;
                // Ctrl+V is left to the browser, which answers with a paste event (see onPaste).
                default: handled = false;
            }
        } else if (!ctrl && !e.altKey && e.key === 'Delete') {
            // Swallowed even with nothing selected: Delete must not reach the desktop and delete an icon.
            engine.clearSelection();
        } else if (e.key === 'Escape') {
            engine.cancel();
        } else {
            handled = false;
        }
        if (handled) {
            e.preventDefault();
            e.stopPropagation();
        }
    };

    /* ------------------------------------------------------------ menus */

    const hasSel = !!s.selection;
    const menus: MenuDef[] = [
        {
            label: 'File',
            items: [
                { label: 'New', onSelect: () => void fileNew(), hint: 'Creates a new picture.' },
                { label: 'Open...', shortcut: 'Ctrl+O', onSelect: () => void fileOpen(), hint: 'Opens a picture from My Pictures or elsewhere on this desktop.' },
                { label: 'Save', shortcut: 'Ctrl+S', onSelect: () => void save(), hint: 'Saves the picture.' },
                {
                    label: 'Save As...',
                    accessKey: 'a',
                    onSelect: () => setFileDialog({ mode: 'save', purpose: 'picture' }),
                    hint: 'Saves the picture with a new name.',
                },
                null,
                { label: 'Open from Computer...', accessKey: 'm', onSelect: () => void openFromComputer(), hint: 'Opens a picture file from your own computer.' },
                { label: 'Save to Computer...', accessKey: 'u', onSelect: () => setDialog({ kind: 'download' }), hint: 'Downloads the picture to your own computer as PNG, JPEG or 24-bit bitmap.' },
                null,
                { label: 'Print...', shortcut: 'Ctrl+P', onSelect: printPicture, hint: 'Prints the picture.' },
                null,
                {
                    label: 'Set As Background (Tiled)',
                    accessKey: 'b',
                    onSelect: () => void setAsBackground('tile'),
                    hint: 'Tiles this picture across the desktop background.',
                },
                {
                    label: 'Set As Background (Centered)',
                    accessKey: 'k',
                    onSelect: () => void setAsBackground('center'),
                    hint: 'Centers this picture as the desktop background.',
                },
                null,
                { label: 'Exit', accessKey: 'x', onSelect: exit, hint: 'Quits Paint.' },
            ],
        },
        {
            label: 'Edit',
            items: [
                { label: 'Undo', shortcut: 'Ctrl+Z', disabled: !s.canUndo, onSelect: () => engine.undo(), hint: 'Undoes the last action.' },
                { label: 'Repeat', shortcut: 'Ctrl+Y', disabled: !s.canRedo, onSelect: () => engine.redo(), hint: 'Redoes the previously undone action.' },
                null,
                { label: 'Cut', accessKey: 't', shortcut: 'Ctrl+X', disabled: !hasSel, onSelect: cut, hint: 'Cuts the selection and puts it on the Clipboard.' },
                { label: 'Copy', shortcut: 'Ctrl+C', disabled: !hasSel, onSelect: copy, hint: 'Copies the selection and puts it on the Clipboard.' },
                { label: 'Paste', shortcut: 'Ctrl+V', onSelect: () => void pasteFromMenu(), hint: 'Inserts the Clipboard contents.' },
                { label: 'Clear Selection', accessKey: 'l', shortcut: 'Del', disabled: !hasSel, onSelect: () => engine.clearSelection(), hint: 'Deletes the selection.' },
                { label: 'Select All', accessKey: 'a', shortcut: 'Ctrl+A', onSelect: () => engine.selectAll(), hint: 'Selects everything.' },
                null,
                {
                    label: 'Copy To...',
                    accessKey: 'o',
                    disabled: !hasSel,
                    onSelect: () => setFileDialog({ mode: 'save', purpose: 'selection' }),
                    hint: 'Copies the selection to a file.',
                },
                {
                    label: 'Paste From...',
                    accessKey: 'f',
                    onSelect: () => setFileDialog({ mode: 'open', purpose: 'paste' }),
                    hint: 'Pastes a picture file into the picture as a selection.',
                },
            ],
        },
        {
            label: 'View',
            items: [
                { label: 'Tool Box', checked: showTools, onSelect: () => setShowTools((v) => !v), hint: 'Shows or hides the tool box.' },
                { label: 'Color Box', shortcut: 'Ctrl+L', checked: showColors, onSelect: () => setShowColors((v) => !v), hint: 'Shows or hides the color box.' },
                { label: 'Status Bar', checked: showStatus, onSelect: () => setShowStatus((v) => !v), hint: 'Shows or hides the status bar.' },
                {
                    label: 'Text Toolbar',
                    accessKey: 'e',
                    checked: showTextBar,
                    disabled: s.tool !== 'text',
                    onSelect: () => setShowTextBar((v) => !v),
                    hint: 'Shows or hides the text toolbar.',
                },
                null,
                {
                    label: 'Zoom',
                    hint: 'Changes the magnification.',
                    items: [
                        { label: 'Normal Size', radio: true, checked: s.zoom === 1, onSelect: () => zoomTo(1), hint: 'Zooms the picture to 100%.' },
                        { label: 'Large Size', radio: true, checked: s.zoom === 4, onSelect: () => zoomTo(4), hint: 'Zooms the picture to 400%.' },
                        { label: 'Custom...', accessKey: 'u', onSelect: () => setDialog({ kind: 'zoom' }), hint: 'Zooms the picture to a percentage you choose.' },
                        null,
                        { label: 'Show Grid', shortcut: 'Ctrl+G', checked: showGrid, disabled: s.zoom < 4, onSelect: () => setShowGrid((v) => !v), hint: 'Shows or hides the grid (at 400% and above).' },
                    ],
                },
                { label: 'View Bitmap', shortcut: 'Ctrl+F', onSelect: () => setViewBitmap(canvasOf(engine.snapshot()).toDataURL()), hint: 'Displays the entire picture.' },
            ],
        },
        {
            label: 'Image',
            items: [
                { label: 'Flip/Rotate...', shortcut: 'Ctrl+R', onSelect: () => setDialog({ kind: 'flip' }), hint: 'Flips or rotates the picture or a selection.' },
                { label: 'Stretch/Skew...', onSelect: () => setDialog({ kind: 'stretch' }), hint: 'Stretches or skews the picture or a selection.' },
                { label: 'Invert Colors', shortcut: 'Ctrl+I', onSelect: () => engine.invertColors(), hint: 'Inverts the colors of the picture or a selection.' },
                { label: 'Attributes...', shortcut: 'Ctrl+E', onSelect: () => setDialog({ kind: 'attributes' }), hint: 'Changes the attributes of the picture.' },
                {
                    label: 'Clear Image',
                    onSelect: () => (engine.hasSelection ? engine.clearSelection() : engine.clearImage()),
                    hint: 'Clears the picture or selection to the background color.',
                },
                { label: 'Draw Opaque', checked: s.opaque, onSelect: () => engine.setOpaque(!s.opaque), hint: 'Makes the current selection either opaque or transparent.' },
            ],
        },
        {
            label: 'Colors',
            items: [
                {
                    label: 'Edit Colors...',
                    onSelect: () => {
                        const i = s.palette.indexOf(s.fg);
                        setDialog({ kind: 'colors', index: i >= 0 ? i : 0 });
                    },
                    hint: 'Creates a new color.',
                },
            ],
        },
        {
            label: 'Help',
            items: [
                { label: 'Help Topics', onSelect: () => setDialog({ kind: 'help' }), hint: 'Displays Help for Paint.' },
                null,
                {
                    label: 'About Paint',
                    onSelect: () => void xpAlert('About Paint', ['Paint', SYSTEM.name, PROFILE.name]),
                    hint: 'Displays program information.',
                },
            ],
        },
    ];

    /* ------------------------------------------------------------ render */

    const hint = menuHint ?? toolHint ?? DEFAULT_HINT;

    return (
        <div
            ref={rootRef}
            tabIndex={-1}
            onKeyDown={onKeyDown}
            onPaste={onPaste}
            onPointerDownCapture={(e) => {
                const t = e.target as HTMLElement;
                if (!t.closest('input, textarea, select, [role="menubar"]')) focusRoot();
            }}
            className="xp-face relative flex h-full select-none flex-col outline-none"
        >
            <MenuBar menus={menus} active={active} onHint={setMenuHint} />

            <div className="flex min-h-0 flex-1 border-t border-[#aca899]">
                {showTools && <ToolBox engine={engine} state={s} onHint={setToolHint} />}
                <CanvasArea
                    engine={engine}
                    state={s}
                    showGrid={showGrid}
                    scrollRef={scrollRef}
                    onMagnify={magnify}
                    onResizePreview={setResizePreview}
                />
                {s.tool === 'text' && s.text && showTextBar && <TextToolbar engine={engine} font={s.font} onClose={() => setShowTextBar(false)} />}
            </div>

            {showColors && (
                <ColorBox
                    engine={engine}
                    state={s}
                    onEdit={(index) => setDialog({ kind: 'colors', index })}
                    onHint={setToolHint}
                />
            )}

            {showStatus && <StatusBar engine={engine} hint={hint} resizing={resizePreview} />}

            {/* Open from Computer. The accept list is what browsers can decode. */}
            <input
                ref={openInput}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                    void onOpenFile(e.target.files?.[0]);
                    e.target.value = '';
                }}
            />

            {dialog?.kind === 'attributes' && (
                <AttributesDialog
                    width={s.width}
                    height={s.height}
                    defaultSize={initialSize}
                    lastSaved={lastSaved}
                    onCancel={() => setDialog(null)}
                    onOk={(w, h, mono) => {
                        setDialog(null);
                        engine.resize(w, h);
                        if (mono) engine.toBlackAndWhite();
                    }}
                />
            )}
            {dialog?.kind === 'flip' && (
                <FlipRotateDialog
                    onCancel={() => setDialog(null)}
                    onOk={(a) => {
                        setDialog(null);
                        if (a.kind === 'flip') engine.flip(a.direction);
                        else engine.rotate(a.degrees);
                    }}
                />
            )}
            {dialog?.kind === 'stretch' && (
                <StretchSkewDialog
                    onCancel={() => setDialog(null)}
                    onOk={(sx, sy, kx, ky) => {
                        setDialog(null);
                        engine.stretchSkew(sx, sy, kx, ky);
                    }}
                />
            )}
            {dialog?.kind === 'zoom' && (
                <ZoomDialog
                    zoom={s.zoom}
                    onCancel={() => setDialog(null)}
                    onOk={(z) => {
                        setDialog(null);
                        zoomTo(z);
                    }}
                />
            )}
            {dialog?.kind === 'colors' && (
                <EditColorsDialog
                    initial={s.palette[dialog.index] ?? s.fg}
                    custom={customColors}
                    onCustomChange={setCustomColors}
                    onCancel={() => setDialog(null)}
                    onOk={(rgb) => {
                        engine.setPaletteColor(dialog.index, rgb);
                        engine.setColor('primary', rgb);
                        setDialog(null);
                    }}
                />
            )}
            {dialog?.kind === 'download' && (
                <SaveAsDialog
                    title="Save to Computer"
                    initialName={fileName}
                    initialFormat={downloadFormat}
                    onCancel={() => setDialog(null)}
                    onSave={(name, format) => {
                        setDialog(null);
                        setDownloadFormat(format);
                        void downloadPicture(engine.snapshot(), name, format);
                    }}
                />
            )}
            {fileDialog && (
                <FileDialog
                    mode={fileDialog.mode}
                    initialDir={docPath ? docPath.slice(0, docPath.lastIndexOf('/')) : PICTURES_PATH}
                    initialName={fileDialog.mode === 'save' ? (fileDialog.purpose === 'selection' ? 'selection.png' : `${fileName}.png`) : ''}
                    types={PICTURE_TYPES}
                    onCancel={() => {
                        setFileDialog(null);
                        afterSave.current = null;
                        focusRoot();
                    }}
                    onConfirm={(path) => {
                        const request = fileDialog;
                        if (request.mode === 'open') {
                            setFileDialog(null);
                            if (request.purpose === 'picture') void openFromDesktop(path);
                            else void readFromDesktop(path).then((b) => b && pasteBitmap(b));
                            return;
                        }
                        const bitmap = request.purpose === 'picture' ? engine.snapshot() : engine.copySelection();
                        // A refused write leaves the dialog open, so another name can be tried.
                        if (!bitmap || !writePicture(path, bitmap, request.purpose)) return;
                        setFileDialog(null);
                        focusRoot();
                        const then = afterSave.current;
                        afterSave.current = null;
                        if (request.purpose === 'picture') then?.();
                    }}
                />
            )}
            {dialog?.kind === 'help' && <HelpDialog onClose={() => setDialog(null)} />}

            {viewBitmap && <ViewBitmap src={viewBitmap} onClose={() => setViewBitmap(null)} />}
        </div>
    );
}

/* ------------------------------------------------------------------ parts */

function StatusBar({ engine, hint, resizing }: { engine: PaintEngine; hint: string; resizing: { w: number; h: number } | null }) {
    const { at, extent } = useSyncExternalStore(engine.subscribe, engine.getPointer, engine.getPointer);
    const size = resizing ?? extent;
    return (
        <div className="xp-statusbar shrink-0">
            <span className="xp-statusbar-field flex-1">{hint}</span>
            <span className="xp-statusbar-field w-[76px] shrink-0 justify-center">{at ? `${at.x},${at.y}` : ''}</span>
            <span className="xp-statusbar-field w-[76px] shrink-0 justify-center">{size ? `${size.w}x${size.h}` : ''}</span>
        </div>
    );
}

/** XP's floating "Fonts" toolbar for the Text tool. */
function TextToolbar({ engine, font, onClose }: { engine: PaintEngine; font: FontSettings; onClose: () => void }) {
    const toggle = (key: 'bold' | 'italic' | 'underline', label: string, glyph: string, style: string) => (
        <button
            type="button"
            aria-label={label}
            aria-pressed={font[key]}
            title={label}
            onClick={() => engine.setFont({ [key]: !font[key] })}
            className={`h-[22px] w-[22px] text-[13px] ${style}`}
            style={font[key] ? { boxShadow: 'inset 1px 1px 0 #808080, inset -1px -1px 0 #fff', background: '#fff' } : RAISED}
        >
            {glyph}
        </button>
    );
    return (
        <div
            role="toolbar"
            aria-label="Fonts"
            className="absolute right-3 top-2 z-20 border border-[#0a246a] bg-[#ece9d8] shadow-[2px_2px_4px_rgba(0,0,0,0.35)]"
        >
            <div className="luna-title flex h-[18px] items-center justify-between px-1 text-[11px] font-bold text-white">
                <span>Fonts</span>
                <button type="button" onClick={onClose} aria-label="Close" title="Close" className="leading-none">
                    &times;
                </button>
            </div>
            <div className="flex items-center gap-1 p-1">
                <select
                    aria-label="Font"
                    value={font.family}
                    onChange={(e) => engine.setFont({ family: e.target.value })}
                    className={`${XP_SELECT_CLASS} w-[128px]`}
                >
                    {FONT_FAMILIES.map((f) => (
                        <option key={f} value={f} style={{ fontFamily: f }}>
                            {f}
                        </option>
                    ))}
                </select>
                <select
                    aria-label="Font size"
                    value={font.size}
                    onChange={(e) => engine.setFont({ size: Number(e.target.value) })}
                    className={`${XP_SELECT_CLASS} w-[48px]`}
                >
                    {FONT_SIZES.map((n) => (
                        <option key={n} value={n}>
                            {n}
                        </option>
                    ))}
                </select>
                {toggle('bold', 'Bold', 'B', 'font-bold')}
                {toggle('italic', 'Italic', 'I', 'italic font-serif')}
                {toggle('underline', 'Underline', 'U', 'underline')}
            </div>
        </div>
    );
}


/** View > View Bitmap: the whole picture on the whole screen, until any key or click. */
function ViewBitmap({ src, onClose }: { src: string; onClose: () => void }) {
    useEffect(() => {
        const close = (e: Event) => {
            e.preventDefault();
            e.stopPropagation();
            onClose();
        };
        // A beat of grace, so the click or key that opened it does not close it again.
        const t = setTimeout(() => {
            window.addEventListener('keydown', close, true);
            window.addEventListener('pointerdown', close, true);
        }, 150);
        return () => {
            clearTimeout(t);
            window.removeEventListener('keydown', close, true);
            window.removeEventListener('pointerdown', close, true);
        };
    }, [onClose]);
    return createPortal(
        <div role="dialog" aria-label="View Bitmap" className="fixed inset-0 z-[19000] flex items-center justify-center bg-black">
            {/* eslint-disable-next-line @next/next/no-img-element -- a generated data URL, not an asset next/image could optimise */}
            <img src={src} alt="The whole picture" className="max-h-full max-w-full" style={{ imageRendering: 'pixelated' }} />
        </div>,
        document.body,
    );
}
