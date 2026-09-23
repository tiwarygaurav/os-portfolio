"use client";

import { useSystemStore } from '@/store/useSystemStore';
import { useWallpaperStyle } from '@/utils/wallpaper';
import { APPS, DESKTOP_ICONS } from '@/constants/apps';
import Taskbar from './Taskbar';
import Window from './Window';
import { AnimatePresence, motion } from 'framer-motion';
import { playSound } from '@/utils/sound';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import DesktopIcon from './DesktopIcon';
import ContextMenu, { type MenuItem } from '@/components/ui/ContextMenu';
import DialogLayer from './Dialog';
import ScreenSaver from './ScreenSaver';
import { RunDialogLayer } from './RunDialog';
import ExitWindows, { type ExitKind } from './ExitWindows';
import LoginScreen from './LoginScreen';
import Tooltips from './Tooltips';
import { StandByScreen, StatusScreen } from './SessionScreens';
import { requestRestart } from './power';
import { xpAlert, xpConfirm } from '@/utils/dialog';
import { SYSTEM } from '@/content';
import { useIsMobile } from '@/utils/viewport';
import type { AppConfig } from '@/constants/apps';

/**
 * Send icons to the Recycle Bin, asking first — in XP's own words for one item or several.
 *
 * Module scope on purpose: the Delete-key handler and the context menu both need it, and the
 * store is read imperatively so this does not have to be a hook.
 */
async function confirmDelete(ids: string[]): Promise<boolean> {
    const apps = ids.filter((id) => id !== 'trash' && APPS[id]).map((id) => [id, APPS[id]] as [string, AppConfig]);
    if (apps.length === 0) return false;
    const ok = apps.length === 1
        ? await xpConfirm('Confirm File Delete', `Are you sure you want to send "${apps[0][1].title}" to the Recycle Bin?`, { confirmLabel: 'Yes', cancelLabel: 'No' })
        : await xpConfirm('Confirm Multiple File Delete', `Are you sure you want to send these ${apps.length} items to the Recycle Bin?`, { confirmLabel: 'Yes', cancelLabel: 'No' });
    if (!ok) return false;
    const { deleteIcon } = useSystemStore.getState().actions;
    for (const [id, app] of apps) deleteIcon(id, app.title, app.iconAsset || '');
    playSound('recycle');
    return true;
}

/** Desktop icon grid cell, in px. Icons are 80x88 with a little air around them. */
const CELL_WIDTH = 90;
const CELL_HEIGHT = 90;
/** Vertical space the grid never uses: the taskbar plus a margin. */
const GRID_RESERVED_HEIGHT = 80;
/** How far the pointer must travel before a press on the desktop becomes a selection rectangle. */
const MARQUEE_THRESHOLD = 3;
/** "Saving your settings..." before a log off completes. */
const SAVING_MS = 1600;

/** System folders first, as XP's Arrange Icons By kept them; then everything else. */
const SYSTEM_FIRST = ['mycomputer', 'explorer', 'trash'];

type Rect = { left: number; top: number; width: number; height: number };

const intersects = (a: Rect, b: DOMRect) =>
    a.left < b.right && a.left + a.width > b.left && a.top < b.bottom && a.top + a.height > b.top;

export default function Desktop() {
    const windows = useSystemStore((s) => s.windows);
    const activeWindowId = useSystemStore((s) => s.activeWindowId);
    const actions = useSystemStore((s) => s.actions);
    const themeId = useSystemStore((s) => s.themeId);
    const deletedAppIds = useSystemStore((s) => s.deletedAppIds);
    const binCount = useSystemStore((s) => s.recycleBin.length);
    const [selected, setSelected] = useState<string[]>([]);
    const [focusedIcon, setFocusedIcon] = useState<string | null>(null);
    const [desktopMenu, setDesktopMenu] = useState({ isOpen: false, x: 0, y: 0 });
    const [iconMenu, setIconMenu] = useState<{ isOpen: boolean; x: number; y: number; appId: string | null }>({ isOpen: false, x: 0, y: 0, appId: null });
    const [showBalloon, setShowBalloon] = useState(true);
    const [runOpen, setRunOpen] = useState(false);
    const [exit, setExit] = useState<ExitKind | null>(null);
    const [standby, setStandby] = useState(false);
    const [locked, setLocked] = useState(false);
    const [saving, setSaving] = useState(false);
    const [iconsHidden, setIconsHidden] = useState(false);
    const [refreshing, setRefreshing] = useState(false);
    const [marquee, setMarquee] = useState<Rect | null>(null);
    // Keys act on the desktop only while it has focus: after a click on it, until a window takes over.
    const desktopFocused = useRef(false);
    const iconLayer = useRef<HTMLDivElement>(null);
    const isMobile = useIsMobile();
    // Desktop is only mounted client-side (page.tsx renders null until mounted), so `window`
    // is safe here; the fallback keeps the initialiser total.
    const [viewportHeight, setViewportHeight] = useState(() =>
        typeof window !== 'undefined' ? window.innerHeight : 700,
    );

    useEffect(() => {
        if (windows.length > 0) setShowBalloon(false);
    }, [windows.length]);

    // A window taking focus takes the keyboard with it.
    useEffect(() => {
        if (activeWindowId) desktopFocused.current = false;
    }, [activeWindowId, windows.length]);

    /*
     * Apply the chosen Luna colour scheme. `data-theme` on <html> is what `app/luna.css` keys
     * the scheme variables off, so every window, the taskbar, the Start menu and the dialogs
     * follow it. Removed again on unmount: the boot and login screens are always the XP blue.
     */
    useEffect(() => {
        document.documentElement.dataset.theme = themeId;
        return () => {
            delete document.documentElement.dataset.theme;
        };
    }, [themeId]);

    /*
     * Force every open window maximised the moment the viewport crosses into the mobile
     * breakpoint — a phone rotation, or a desktop browser dragged narrower. `openWindow` only
     * decided this once, at open time; without this a window opened wide and left floating would
     * end up wider than the screen with no maximise button, no drag and no resize grip once the
     * breakpoint crossed under it, and no route back except closing it.
     */
    useEffect(() => {
        if (isMobile) actions.syncViewportBreakpoint(true);
    }, [isMobile, actions]);

    const visibleIcons = useMemo(() => DESKTOP_ICONS.filter((id) => !deletedAppIds.includes(id)), [deletedAppIds]);
    const rowsPerColumn = Math.max(1, Math.floor((viewportHeight - GRID_RESERVED_HEIGHT) / CELL_HEIGHT));
    const gridPosition = (index: number) => ({
        x: 10 + Math.floor(index / rowsPerColumn) * CELL_WIDTH,
        y: 10 + (index % rowsPerColumn) * CELL_HEIGHT,
    });

    const openIcon = useCallback((appId: string) => {
        const app = APPS[appId];
        if (!app) return;
        actions.openWindow(appId, app.title);
    }, [actions]);

    const selectIcon = (appId: string, additive: boolean) => {
        desktopFocused.current = true;
        setFocusedIcon(appId);
        setSelected((cur) => (additive ? (cur.includes(appId) ? cur.filter((id) => id !== appId) : [...cur, appId]) : [appId]));
    };

    const handleDesktopContextMenu = (e: React.MouseEvent) => {
        e.preventDefault();
        setDesktopMenu({ isOpen: true, x: e.clientX, y: e.clientY });
        setIconMenu({ isOpen: false, x: 0, y: 0, appId: null });
    };

    const handleIconContextMenu = (e: React.MouseEvent, appId: string) => {
        e.preventDefault();
        e.stopPropagation();
        setIconMenu({ isOpen: true, x: e.clientX, y: e.clientY, appId });
        setDesktopMenu({ isOpen: false, x: 0, y: 0 });
        if (!selected.includes(appId)) setSelected([appId]);
        setFocusedIcon(appId);
        desktopFocused.current = true;
    };

    /** XP's Arrange Icons By: lay the icons out down the grid in the chosen order. */
    const arrange = (by: 'name' | 'type') => {
        const key = (id: string) => (by === 'type' ? `${APPS[id]?.category}:${APPS[id]?.title}` : APPS[id]?.title ?? id);
        const system = SYSTEM_FIRST.filter((id) => visibleIcons.includes(id));
        const rest = visibleIcons.filter((id) => !system.includes(id)).sort((a, b) => key(a).localeCompare(key(b)));
        [...system, ...rest].forEach((id, i) => {
            const p = gridPosition(i);
            actions.setDesktopIconPosition(id, p.x, p.y);
        });
    };

    /** Refresh redraws the desktop — the icons blink, as they did — rather than rebooting the page. */
    const refresh = () => {
        setRefreshing(true);
        window.setTimeout(() => setRefreshing(false), 140);
    };

    /**
     * Log Off, Turn Off and Restart end the session, so, as XP did, each window with unsaved work
     * is brought forward and asked first; the first Cancel keeps the session. The dialog closes
     * before asking, since its grey layer would sit over the questions.
     */
    const endSession = async (then: () => void) => {
        setExit(null);
        if (!(await actions.requestEndSession())) return;
        then();
    };

    const emptyBin = async () => {
        const n = useSystemStore.getState().recycleBin.length;
        if (n === 0) return;
        const ok = await xpConfirm(
            n === 1 ? 'Confirm File Delete' : 'Confirm Multiple File Delete',
            n === 1 ? 'Are you sure you want to permanently delete this item?' : `Are you sure you want to delete these ${n} items?`,
            { confirmLabel: 'Yes', cancelLabel: 'No' },
        );
        if (!ok) return;
        actions.emptyRecycleBin();
        playSound('recycle');
    };

    // Reflow the default icon grid when the viewport height changes. Only the defaults move:
    // positions a visitor has dragged are persisted in the store and DesktopIcon prefers them.
    // Coalesced to one update per frame so a live window resize does not re-render per event.
    useEffect(() => {
        let frame = 0;
        const onResize = () => {
            cancelAnimationFrame(frame);
            frame = requestAnimationFrame(() => setViewportHeight(window.innerHeight));
        };
        window.addEventListener('resize', onResize);
        return () => {
            cancelAnimationFrame(frame);
            window.removeEventListener('resize', onResize);
        };
    }, []);

    /** Rubber-band selection: press on empty desktop and drag. Ctrl adds to the selection. */
    const startMarquee = (e: React.PointerEvent) => {
        if (e.button !== 0 || e.target !== e.currentTarget) return;
        desktopFocused.current = true;
        const origin = { x: e.clientX, y: e.clientY };
        const additive = e.ctrlKey || e.metaKey;
        const base = additive ? selected : [];
        let active = false;
        if (!additive) {
            setSelected([]);
            setFocusedIcon(null);
        }

        const onMove = (ev: PointerEvent) => {
            const dx = ev.clientX - origin.x;
            const dy = ev.clientY - origin.y;
            if (!active && Math.hypot(dx, dy) < MARQUEE_THRESHOLD) return;
            active = true;
            const rect = {
                left: Math.min(origin.x, ev.clientX),
                top: Math.min(origin.y, ev.clientY),
                width: Math.abs(dx),
                height: Math.abs(dy),
            };
            setMarquee(rect);
            const hits = Array.from(iconLayer.current?.querySelectorAll<HTMLElement>('[data-desktop-icon]') ?? [])
                .filter((el) => intersects(rect, (el.firstElementChild ?? el).getBoundingClientRect()))
                .map((el) => el.dataset.desktopIcon!)
                .filter(Boolean);
            setSelected(Array.from(new Set([...base, ...hits])));
        };
        const onUp = () => {
            setMarquee(null);
            document.removeEventListener('pointermove', onMove);
            document.removeEventListener('pointerup', onUp);
        };
        document.addEventListener('pointermove', onMove);
        document.addEventListener('pointerup', onUp);
    };

    // Keyboard shortcuts
    useEffect(() => {
        /** The icon nearest the focused one in an arrow's direction, as XP's desktop moved focus. */
        const neighbour = (from: string | null, key: string): string | null => {
            const els = Array.from(iconLayer.current?.querySelectorAll<HTMLElement>('[data-desktop-icon]') ?? []);
            if (els.length === 0) return null;
            const origin = from ? els.find((el) => el.dataset.desktopIcon === from) : undefined;
            if (!origin) return els[0].dataset.desktopIcon ?? null;
            const o = origin.getBoundingClientRect();
            let best: { id: string; score: number } | null = null;
            for (const el of els) {
                if (el === origin) continue;
                const r = el.getBoundingClientRect();
                const dx = r.left - o.left;
                const dy = r.top - o.top;
                const [primary, secondary] =
                    key === 'ArrowRight' ? [dx, dy] : key === 'ArrowLeft' ? [-dx, dy] : key === 'ArrowDown' ? [dy, dx] : [-dy, dx];
                if (primary <= 4) continue;
                const score = primary + Math.abs(secondary) * 2;
                if (!best || score < best.score) best = { id: el.dataset.desktopIcon!, score };
            }
            return best?.id ?? from;
        };

        const onKey = (e: KeyboardEvent) => {
            /*
             * A message box is modal and swallows the keys it handles itself (see Dialog.tsx),
             * but it stops propagation on `document`, not on `window` — belt and suspenders here
             * in case any future dialog variant skips that. With one open, Delete/Enter/Alt+F4
             * acting on the desktop underneath is exactly the bug an XP message box exists to
             * prevent (deleting an icon and having Enter also launch the app it just described).
             */
            if (useSystemStore.getState().dialogs.length > 0) return;

            const target = e.target as HTMLElement;
            const inForm = ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable;

            // Alt+F4 closes active window
            if (e.altKey && e.key === 'F4') {
                e.preventDefault();
                const active = useSystemStore.getState().activeWindowId;
                if (active) actions.closeWindow(active);
                else setExit('shutdown');
            }

            // Escape closes context menus and deselects
            if (e.key === 'Escape' && !inForm) {
                setDesktopMenu({ isOpen: false, x: 0, y: 0 });
                setIconMenu({ isOpen: false, x: 0, y: 0, appId: null });
                setSelected([]);
                setRunOpen(false);
            }

            if (!inForm && desktopFocused.current) {
                // Delete sends the selection to the Recycle Bin
                if (e.key === 'Delete' && selected.length > 0) {
                    void confirmDelete(selected).then((deleted) => {
                        if (deleted) setSelected([]);
                    });
                }
                // Enter opens every selected icon, as XP did
                if (e.key === 'Enter' && selected.length > 0) {
                    selected.forEach(openIcon);
                }
                if (e.key.startsWith('Arrow')) {
                    e.preventDefault();
                    const next = neighbour(focusedIcon ?? selected[0] ?? null, e.key);
                    if (next) {
                        setFocusedIcon(next);
                        setSelected([next]);
                    }
                }
                // Ctrl+A selects every icon
                if (e.key.toLowerCase() === 'a' && (e.ctrlKey || e.metaKey)) {
                    e.preventDefault();
                    setSelected(visibleIcons);
                }
            }

            /*
             * XP's own shortcuts, attempted but never advertised.
             *
             * On Windows the OS claims Win+R and Ctrl+Shift+Esc before a web page ever sees the
             * event, so these fire only where the host lets them through. They are therefore a
             * bonus, not a route: the documented ways in are Start > Run and the taskbar's
             * right-click menu, both of which always work. Nothing in the UI promises otherwise.
             */
            if (e.key.toLowerCase() === 'r' && e.metaKey && !e.ctrlKey && !inForm) {
                e.preventDefault();
                setRunOpen(true);
            }
            if (e.ctrlKey && e.shiftKey && e.key === 'Escape') {
                e.preventDefault();
                actions.openWindow('taskmgr');
            }
        };

        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [selected, focusedIcon, visibleIcons, actions, openIcon]);

    useEffect(() => {
        const konamiCode = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a'];
        let cursor = 0;

        const onKey = (e: KeyboardEvent) => {
            // A message box is modal; the desktop underneath must not advance on its keystrokes.
            if (useSystemStore.getState().dialogs.length > 0) return;

            // Ignore keystrokes aimed at an input — typing "…b, a" in the terminal used to fire this.
            const target = e.target as HTMLElement;
            if (['INPUT', 'TEXTAREA'].includes(target.tagName) || target.isContentEditable) {
                cursor = 0;
                return;
            }

            if (e.key.toLowerCase() === konamiCode[cursor].toLowerCase()) {
                cursor++;
                if (cursor === konamiCode.length) {
                    playSound('tada');
                    void xpAlert(`${SYSTEM.name}`, [
                        'Easter egg unlocked.',
                        `Thanks for exploring ${SYSTEM.name}.`,
                        'Try the Command Prompt next. It runs on a real filesystem, and the windows on this desktop are real processes:',
                        '  ls ~',
                        '  ps',
                    ]);
                    cursor = 0;
                }
            } else {
                cursor = 0;
            }
        };

        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, []);

    // Built-in wallpapers and pictures chosen in Display Properties or Paint, drawn one way.
    const wallpaperStyle = useWallpaperStyle();

    const desktopMenuItems: MenuItem[] = [
        {
            label: 'Arrange Icons By',
            items: [
                { label: 'Name', action: () => arrange('name') },
                { label: 'Type', action: () => arrange('type') },
                { divider: true },
                { label: 'Show Desktop Icons', checked: !iconsHidden, action: () => setIconsHidden((h) => !h) },
            ],
        },
        { label: 'Refresh', action: refresh },
        { divider: true },
        { label: 'Paste', disabled: true },
        { label: 'Paste Shortcut', disabled: true },
        { divider: true },
        { label: 'New', disabled: true, items: [] },
        { divider: true },
        { label: 'Properties', action: () => actions.openWindow('settings') },
    ];

    const iconMenuItems = (): MenuItem[] => {
        const id = iconMenu.appId;
        const app = id ? APPS[id] : undefined;
        if (!id || !app) return [];
        const targets = selected.includes(id) ? selected : [id];
        if (id === 'trash') {
            return [
                { label: 'Open', bold: true, action: () => openIcon(id) },
                { label: 'Explore', action: () => openIcon(id) },
                { label: 'Empty Recycle Bin', disabled: binCount === 0, action: () => void emptyBin() },
                { divider: true },
                { label: 'Create Shortcut', disabled: true },
                { label: 'Properties', action: () => void xpAlert('Recycle Bin Properties', [
                    'Recycle Bin',
                    `Contains: ${binCount} item${binCount === 1 ? '' : 's'}`,
                    'Drag a desktop icon onto the Recycle Bin, or press Delete, to send it here.',
                ]) },
            ];
        }
        return [
            { label: 'Open', bold: true, action: () => targets.forEach(openIcon) },
            { divider: true },
            { label: 'Send To', disabled: true, items: [] },
            { divider: true },
            { label: 'Cut', disabled: true },
            { label: 'Copy', disabled: true },
            { divider: true },
            { label: 'Create Shortcut', disabled: true },
            {
                label: 'Delete',
                action: () => {
                    void confirmDelete(targets).then((deleted) => {
                        if (deleted) setSelected([]);
                    });
                },
            },
            { label: 'Rename', disabled: true },
            { divider: true },
            {
                label: 'Properties',
                // Only facts the registry holds and the window manager honours. The previous
                // version asserted "Size: 0 bytes" for every app — a fabricated file-metadata
                // readout of the same class as the drive capacities removed from My Computer.
                action: () => void xpAlert(
                    `${app.title} Properties`,
                    [
                        app.title,
                        'Type: Application',
                        `Opens at: ${app.width ?? 800} x ${app.height ?? 600}`,
                        `Resizable: ${app.canResize ? 'Yes' : 'No'}`,
                        `Maximizable: ${app.canMaximize ? 'Yes' : 'No'}`,
                    ],
                ),
            },
        ];
    };

    return (
        <div className="relative h-full w-full overflow-hidden bg-[#1c55ee] font-sans">
            {/* Background */}
            <div className="absolute inset-0" style={wallpaperStyle} />

            {/* Desktop Icons */}
            <div
                ref={iconLayer}
                className="absolute inset-0"
                style={{ visibility: iconsHidden || refreshing ? 'hidden' : undefined }}
                onPointerDown={startMarquee}
                onContextMenu={handleDesktopContextMenu}
            >
                {visibleIcons.map((appId, index) => {
                    const app = APPS[appId];
                    if (!app) return null;
                    return (
                        <DesktopIcon
                            key={appId}
                            appId={appId}
                            app={app}
                            initialPosition={gridPosition(index)}
                            isSelected={selected.includes(appId)}
                            isFocused={focusedIcon === appId && selected.includes(appId)}
                            onSelect={(additive) => selectIcon(appId, additive)}
                            onOpen={() => openIcon(appId)}
                            onContextMenu={(e) => handleIconContextMenu(e, appId)}
                        />
                    );
                })}
                {marquee && (
                    <div
                        className="xp-marquee"
                        style={{ left: marquee.left, top: marquee.top, width: marquee.width, height: marquee.height }}
                    />
                )}
            </div>

            <ContextMenu
                x={desktopMenu.x}
                y={desktopMenu.y}
                isOpen={desktopMenu.isOpen}
                onClose={() => setDesktopMenu((m) => ({ ...m, isOpen: false }))}
                items={desktopMenuItems}
            />

            <ContextMenu
                x={iconMenu.x}
                y={iconMenu.y}
                isOpen={iconMenu.isOpen}
                onClose={() => setIconMenu((m) => ({ ...m, isOpen: false }))}
                items={iconMenuItems()}
            />

            {/* Windows Layer */}
            <AnimatePresence>
                {windows.map((win) => (
                    <Window key={win.id} win={win} />
                ))}
            </AnimatePresence>

            {/* Welcome balloon, pointing at the notification area as XP's tour balloon did. */}
            <AnimatePresence>
                {showBalloon && (
                    <motion.div
                        key="balloon"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ delay: 1.2, duration: 0.2 }}
                        className="xp-balloon bottom-[calc(var(--xp-taskbar-h)+22px)] right-2 sm:right-4"
                        role="status"
                    >
                        <div className="xp-balloon-title">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src="/icons/info-balloon.png" alt="" />
                            Welcome to {SYSTEM.name}
                        </div>
                        <button
                            type="button"
                            onClick={() => setShowBalloon(false)}
                            className="xp-balloon-close"
                            aria-label="Close"
                        />
                        {/*
                          * Wayfinding. The links point at what a visitor actually came for — the old
                          * balloon led with Minesweeper — but the XP balloon styling and voice stay.
                          */}
                        <p>
                            {isMobile
                                ? 'A faithful XP-inspired desktop. Tap an icon to open it, or start here:'
                                : 'A faithful XP-inspired desktop. Try right-clicking the desktop, or start here:'}
                        </p>
                        <div className="mt-2 flex flex-wrap gap-x-2 gap-y-1">
                            <button type="button" className="xp-link" onClick={() => actions.openWindow('resume')}>Resume</button>
                            <span>|</span>
                            <button type="button" className="xp-link" onClick={() => actions.openWindow('projects')}>My Projects</button>
                            <span>|</span>
                            <button type="button" className="xp-link" onClick={() => actions.openWindow('contact')}>Contact Me</button>
                            <span>|</span>
                            <button type="button" className="xp-link" onClick={() => actions.openWindow('minesweeper')}>Minesweeper</button>
                        </div>
                        {/* The shell is the reward for exploring, but on a phone it is not the way in. */}
                        {!isMobile && (
                            <p className="mt-2 text-[#555]">
                                The Command Prompt is real — try typing &ldquo;ls ~&rdquo;.
                            </p>
                        )}
                        <svg className="xp-balloon-stem right-10" viewBox="0 0 22 20" aria-hidden>
                            <path d="M1 0 L19 19 L20.5 0" fill="#ffffe1" stroke="#000" />
                            <rect x="1.6" y="-1" width="18.4" height="1.6" fill="#ffffe1" />
                        </svg>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Run: XP's own command palette, over the app registry and the filesystem. */}
            <RunDialogLayer isOpen={runOpen} onClose={() => setRunOpen(false)} />

            {/* XP message boxes: above the windows, never over the taskbar. */}
            <DialogLayer />

            {/* Taskbar */}
            <Taskbar onOpenRun={() => setRunOpen(true)} onExit={setExit} />

            {/* XP-styled tooltips for every `data-tip` on the desktop. */}
            <Tooltips />

            {/* Log Off / Turn Off Computer, over a screen draining to grey. */}
            {exit && (
                <ExitWindows
                    kind={exit}
                    onCancel={() => setExit(null)}
                    onStandBy={() => {
                        setExit(null);
                        setStandby(true);
                    }}
                    onSwitchUser={() => {
                        setExit(null);
                        playSound('logoff');
                        setLocked(true);
                    }}
                    onLogOff={() => void endSession(() => {
                        playSound('logoff');
                        setSaving(true);
                        window.setTimeout(() => actions.logout(), SAVING_MS);
                    })}
                    onTurnOff={(restart) => void endSession(() => {
                        if (restart) requestRestart();
                        playSound('shutdown');
                        actions.shutdown();
                    })}
                />
            )}
            {standby && <StandByScreen onWake={() => setStandby(false)} />}
            {/* Switch User: the Welcome screen over a session that keeps running underneath. */}
            {locked && (
                <div className="fixed inset-0 z-[10040]">
                    <LoginScreen
                        session={{ programs: windows.length }}
                        onLogin={() => setLocked(false)}
                        onTurnOff={(restart) => {
                            setLocked(false);
                            void endSession(() => {
                                if (restart) requestRestart();
                                playSound('shutdown');
                                actions.shutdown();
                            });
                        }}
                    />
                </div>
            )}
            {saving && (
                <div className="fixed inset-0 z-[10040]">
                    <StatusScreen message="Saving your settings..." />
                </div>
            )}

            {/* Idle timer + screen saver, configured in Display Properties. Above everything. */}
            <ScreenSaver />
        </div>
    );
}
