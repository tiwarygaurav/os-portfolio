"use client";

import { useSystemStore } from '@/store/useSystemStore';
import { useWallpaperStyle } from '@/utils/wallpaper';
import { APPS, DESKTOP_ICONS } from '@/constants/apps';
import Taskbar from './Taskbar';
import Window from './Window';
import { AnimatePresence, motion } from 'framer-motion';
import { playSound } from '@/utils/sound';
import { useEffect, useState } from 'react';
import DesktopIcon from './DesktopIcon';
import ContextMenu from '@/components/ui/ContextMenu';
import DialogLayer from './Dialog';
import ScreenSaver from './ScreenSaver';
import { RunDialogLayer } from './RunDialog';
import { xpAlert, xpConfirm } from '@/utils/dialog';
import { PROFILE, SYSTEM } from '@/content';
import { useIsMobile } from '@/utils/viewport';
import type { AppConfig } from '@/constants/apps';

/**
 * Send an icon to the Recycle Bin, asking first.
 *
 * Module scope on purpose: the Delete-key handler and the context menu both need it, and the
 * store is read imperatively so this does not have to be a hook.
 */
async function confirmDelete(appId: string, app: AppConfig): Promise<boolean> {
    const ok = await xpConfirm(
        'Confirm File Delete',
        `Are you sure you want to send "${app.title}" to the Recycle Bin?`,
        { confirmLabel: 'Yes', cancelLabel: 'No' },
    );
    if (!ok) return false;
    useSystemStore.getState().actions.deleteIcon(appId, app.title, app.iconAsset || '');
    playSound('close');
    return true;
}

/** Desktop icon grid cell, in px. Icons are 80x88 with a little air around them. */
const CELL_WIDTH = 90;
const CELL_HEIGHT = 90;
/** Vertical space the grid never uses: the taskbar plus a margin. */
const GRID_RESERVED_HEIGHT = 80;

export default function Desktop() {
    const windows = useSystemStore((s) => s.windows);
    const actions = useSystemStore((s) => s.actions);
    const themeId = useSystemStore((s) => s.themeId);
    const deletedAppIds = useSystemStore((s) => s.deletedAppIds);
    const [selectedIconId, setSelectedIconId] = useState<string | null>(null);
    const [desktopMenu, setDesktopMenu] = useState({ isOpen: false, x: 0, y: 0 });
    const [iconMenu, setIconMenu] = useState<{ isOpen: boolean; x: number; y: number; appId: string | null }>({ isOpen: false, x: 0, y: 0, appId: null });
    const [showBalloon, setShowBalloon] = useState(true);
    const [runOpen, setRunOpen] = useState(false);
    const isMobile = useIsMobile();
    // Desktop is only mounted client-side (page.tsx renders null until mounted), so `window`
    // is safe here; the fallback keeps the initialiser total.
    const [viewportHeight, setViewportHeight] = useState(() =>
        typeof window !== 'undefined' ? window.innerHeight : 700,
    );

    useEffect(() => {
        if (windows.length > 0) setShowBalloon(false);
    }, [windows.length]);

    /*
     * Apply the chosen Luna colour scheme. `data-theme` on <html> is what `app/globals.css` keys
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

    const visibleIcons = DESKTOP_ICONS.filter(id => !deletedAppIds.includes(id));

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
        setSelectedIconId(appId);
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

    // Keyboard shortcuts
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            /*
             * A message box is modal and swallows the keys it handles itself (see Dialog.tsx),
             * but it stops propagation on `document`, not on `window` — belt and suspenders here
             * in case any future dialog variant skips that. With one open, Delete/Enter/Alt+F4
             * acting on the desktop underneath is exactly the bug an XP message box exists to
             * prevent (deleting an icon and having Enter also launch the app it just described).
             */
            if (useSystemStore.getState().dialogs.length > 0) return;

            // Konami
            // (handled separately below)
            const target = e.target as HTMLElement;
            const inForm = ['INPUT', 'TEXTAREA'].includes(target.tagName) || target.isContentEditable;

            // Alt+F4 closes active window
            if (e.altKey && e.key === 'F4') {
                e.preventDefault();
                const active = useSystemStore.getState().activeWindowId;
                if (active) {
                    playSound('close');
                    actions.closeWindow(active);
                }
            }

            // Escape closes context menus and deselects
            if (e.key === 'Escape' && !inForm) {
                setDesktopMenu({ isOpen: false, x: 0, y: 0 });
                setIconMenu({ isOpen: false, x: 0, y: 0, appId: null });
                setSelectedIconId(null);
            }

            // Delete removes selected icon to recycle bin
            if (e.key === 'Delete' && selectedIconId && !inForm) {
                const app = APPS[selectedIconId];
                if (app && selectedIconId !== 'trash') {
                    void confirmDelete(selectedIconId, app).then((deleted) => {
                        if (deleted) setSelectedIconId(null);
                    });
                }
            }

            // Enter opens selected icon
            if (e.key === 'Enter' && selectedIconId && !inForm) {
                const app = APPS[selectedIconId];
                if (app) {
                    playSound('open');
                    actions.openWindow(selectedIconId, app.title);
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
            if (e.key === 'Escape' && !inForm) setRunOpen(false);
            if (e.ctrlKey && e.shiftKey && e.key === 'Escape') {
                e.preventDefault();
                actions.openWindow('taskmgr');
            }
        };

        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [selectedIconId, actions]);

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

    const rowsPerColumn = Math.max(1, Math.floor((viewportHeight - GRID_RESERVED_HEIGHT) / CELL_HEIGHT));

    // A built-in wallpaper or a picture from the filesystem (Display Properties > Browse...,
    // Paint's Set As Background) — drawn by the same helper the Settings previews use.
    const wallpaperStyle = useWallpaperStyle();

    return (
        <div className="h-full w-full bg-[#1c55ee] relative font-sans overflow-hidden">
            {/* Background */}
            <div className="absolute inset-0" style={wallpaperStyle} />

            {/* Desktop Icons */}
            <div
                className="absolute inset-0"
                onClick={() => setSelectedIconId(null)}
                onContextMenu={handleDesktopContextMenu}
            >
                {visibleIcons.map((appId, index) => {
                    const app = APPS[appId];
                    if (!app) return null;

                    const col = Math.floor(index / rowsPerColumn);
                    const row = index % rowsPerColumn;

                    const initialX = 10 + (col * CELL_WIDTH);
                    const initialY = 10 + (row * CELL_HEIGHT);

                    return (
                        <DesktopIcon
                            key={appId}
                            appId={appId}
                            app={app}
                            initialPosition={{ x: initialX, y: initialY }}
                            isSelected={selectedIconId === appId}
                            onSelect={() => setSelectedIconId(appId)}
                            onContextMenu={(e) => handleIconContextMenu(e, appId)}
                        />
                    );
                })}
            </div>

            {/* Desktop context menu */}
            <ContextMenu
                x={desktopMenu.x}
                y={desktopMenu.y}
                isOpen={desktopMenu.isOpen}
                onClose={() => setDesktopMenu({ ...desktopMenu, isOpen: false })}
                items={[
                    { label: "Arrange Icons By", disabled: true },
                    { label: "Refresh", action: () => window.location.reload() },
                    { divider: true },
                    { label: "Paste", disabled: true },
                    { label: "Paste Shortcut", disabled: true },
                    { divider: true },
                    { label: "New Folder", disabled: true },
                    { divider: true },
                    { label: "Properties", action: () => actions.openWindow('settings') },
                ]}
            />

            {/* Icon context menu */}
            <ContextMenu
                x={iconMenu.x}
                y={iconMenu.y}
                isOpen={iconMenu.isOpen}
                onClose={() => setIconMenu({ ...iconMenu, isOpen: false })}
                items={(() => {
                    if (!iconMenu.appId) return [];
                    const app = APPS[iconMenu.appId];
                    if (!app) return [];
                    const id = iconMenu.appId;
                    return [
                        { label: "Open", action: () => { playSound('open'); actions.openWindow(id, app.title); } },
                        { label: "Run as...", disabled: true },
                        { divider: true },
                        { label: "Send to", disabled: true },
                        { label: "Cut", disabled: true },
                        { label: "Copy", disabled: true },
                        { divider: true },
                        { label: "Create Shortcut", disabled: true },
                        {
                            label: "Delete",
                            disabled: id === 'trash',
                            action: () => {
                                if (id === 'trash') return;
                                void confirmDelete(id, app);
                            }
                        },
                        { label: "Rename", disabled: true },
                        { divider: true },
                        {
                            label: "Properties",
                            // Only facts the registry holds and the window manager honours. The
                            // previous version asserted "Size: 0 bytes" for every app — a
                            // fabricated file-metadata readout of the same class as the drive
                            // capacities removed from My Computer.
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
                })()}
            />

            {/* Windows Layer */}
            <AnimatePresence>
                {windows.map((win) => (
                    <Window key={win.id} win={win} />
                ))}
            </AnimatePresence>

            {/* Welcome Balloon */}
            {showBalloon && (
                <motion.div
                    initial={{ opacity: 0, y: 50, scale: 0.8 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    transition={{ delay: 1, duration: 0.5 }}
                    className="absolute bottom-12 right-2 z-40 w-[min(18rem,calc(100vw-1rem))] origin-bottom-right rounded-lg border border-black bg-[#FFFFE1] p-3 font-sans text-xs text-black shadow-xl sm:right-4"
                >
                    <div className="flex justify-between items-start mb-1">
                        <h3 className="font-bold text-sm">Welcome to {SYSTEM.name}</h3>
                        <button
                            onClick={() => setShowBalloon(false)}
                            className="text-gray-500 hover:text-black px-1 leading-none"
                            aria-label="Dismiss"
                        >
                            ×
                        </button>
                    </div>
                    {/*
                      * Wayfinding. The links point at what a visitor actually came for — the old
                      * balloon led with Minesweeper — but the XP balloon styling and voice stay.
                      */}
                    <p>
                        {isMobile
                            ? 'A faithful XP-inspired desktop. Tap an icon to open it, or start here:'
                            : 'A faithful XP-inspired desktop. Try right-clicking the desktop, or start here:'}
                    </p>
                    <div className="mt-2 text-blue-800 flex gap-2 flex-wrap">
                        <button className="underline hover:text-blue-600" onClick={() => actions.openWindow('resume')}>Resume</button>
                        <span>|</span>
                        <button className="underline hover:text-blue-600" onClick={() => actions.openWindow('projects')}>My Projects</button>
                        <span>|</span>
                        <button className="underline hover:text-blue-600" onClick={() => actions.openWindow('contact')}>Contact Me</button>
                        <span>|</span>
                        <button className="underline hover:text-blue-600" onClick={() => actions.openWindow('minesweeper')}>Minesweeper</button>
                    </div>
                    {/* The shell is the reward for exploring, but on a phone it is not the way in. */}
                    {!isMobile && (
                        <p className="mt-2 text-[11px] text-gray-600">
                            The Command Prompt is real — try <code className="font-mono">ls ~</code>.
                        </p>
                    )}

                    <div className="absolute -bottom-2 right-8 w-4 h-4 bg-[#FFFFE1] border-b border-r border-black transform rotate-45"></div>
                </motion.div>
            )}

            {/* Run: XP's own command palette, over the app registry and the filesystem. */}
            <RunDialogLayer isOpen={runOpen} onClose={() => setRunOpen(false)} />

            {/* XP message boxes: above the windows, never over the taskbar. */}
            <DialogLayer />

            {/* Taskbar */}
            <Taskbar onOpenRun={() => setRunOpen(true)} />

            {/* Idle timer + screen saver, configured in Display Properties. Above everything. */}
            <ScreenSaver />
        </div>
    );
}
