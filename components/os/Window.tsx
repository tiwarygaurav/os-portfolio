"use client";

import { useSystemStore, type AppWindow } from '@/store/useSystemStore';
import { APPS, isAppId, type AppComponent } from '@/constants/apps';
import { motion, useDragControls, useMotionValue } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { useIsMobile } from '@/utils/viewport';
import ContextMenu, { type MenuItem } from '@/components/ui/ContextMenu';
import XpIcon from '@/components/ui/XpIcon';
import { boxOf, playCaptionZoom, taskButtonBox, titleBarBox, TITLE_BAR_HEIGHT } from './captionZoom';

/**
 * App bodies, code-split and loaded on first open.
 *
 * The cache matters: `dynamic()` returns a *new* component type each call, so building one during
 * render would remount the app — and wipe its state — on every parent render. Keyed by app id, the
 * same component identity comes back every time.
 *
 * The registry is the only place an app is declared. There used to be a second table here, and
 * forgetting it failed silently at runtime with "App not found".
 */
const bodyCache = new Map<string, AppComponent>();

function bodyFor(appId: string): AppComponent {
    const cached = bodyCache.get(appId);
    if (cached) return cached;

    const config = isAppId(appId) ? APPS[appId] : undefined;
    const Body: AppComponent = config
        ? dynamic(config.load, {
            ssr: false,
            loading: () => (
                <div className="xp-face flex h-full items-center justify-center text-gray-600">
                    Opening…
                </div>
            ),
        })
        : () => (
            <div className="p-4 text-xs">
                No application is registered under the id <span className="font-mono">{appId}</span>.
            </div>
        );

    bodyCache.set(appId, Body);
    return Body;
}

/** Smallest a window can be resized to. */
const MIN_WIDTH = 280;
const MIN_HEIGHT = 220;

type Edge = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';
const EDGES: Edge[] = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'];

interface WindowProps {
    win: AppWindow;
}

/**
 * A Luna window: the blue frame with its three-ring bevel, the Trebuchet MS caption, and the
 * minimise / maximise / close buttons, drawn in `app/luna.css`.
 *
 * What XP did, it does here: every edge and corner resizes; right-clicking the title bar or
 * clicking its icon opens the system menu; double-clicking the icon closes the window; and
 * minimising or maximising flies a caption ghost rather than scaling the window (see
 * `captionZoom.ts`). Windows appear instantly when opened — XP did not animate that.
 */
export default function Window({ win }: WindowProps) {
    const actions = useSystemStore((s) => s.actions);
    const activeWindowId = useSystemStore((s) => s.activeWindowId);
    const isActive = activeWindowId === win.id;
    const appConfig = APPS[win.appId];
    const AppBody = bodyFor(win.appId);
    /*
     * On a phone every window is maximised (see `openWindow`), so un-maximising it would hand the
     * visitor a window wider than the screen with no way to scroll to the rest. The controls that
     * would do that are hidden rather than left present and inert.
     */
    const isMobile = useIsMobile();
    const canMaximize = !isMobile && !!appConfig?.canMaximize;
    const canResize = !isMobile && !!appConfig?.canResize;

    const controls = useDragControls();
    const winRef = useRef<HTMLDivElement>(null);
    const titleRef = useRef<HTMLDivElement>(null);
    const [size, setSize] = useState(win.size);
    const [isResizing, setIsResizing] = useState(false);
    const [sysMenu, setSysMenu] = useState<{ x: number; y: number } | null>(null);

    /*
     * Drag position, owned here rather than left to `animate`.
     *
     * The store clamps a dragged window back inside the viewport, and that correction used to be
     * rendered only because `animate.x` changed value. Drag off the same edge twice and the
     * clamped result is identical to last time, so framer sees an unchanged target, marks the key
     * protected and skips it — leaving the element wherever the drag dropped it while the store
     * believed otherwise. Owning the motion values lets us write the clamped position back
     * unconditionally.
     */
    const x = useMotionValue(win.position.x);
    const y = useMotionValue(win.position.y);

    useEffect(() => {
        setSize(win.size);
    }, [win.size]);

    // Follow the store whenever it moves the window (clamp, restore, un-maximise), including the
    // case where the clamped value equals the previous one.
    useEffect(() => {
        if (win.isMaximized) {
            x.set(0);
            y.set(0);
        } else {
            x.set(win.position.x);
            y.set(win.position.y);
        }
    }, [win.position.x, win.position.y, win.isMaximized, x, y]);

    const focus = () => actions.focusWindow(win.id);

    const minimize = () => {
        // The window hides at once; its caption flies to the taskbar button.
        void playCaptionZoom(boxOf(titleRef.current), taskButtonBox(win.id), win.title, 'in');
        actions.minimizeWindow(win.id);
    };

    const toggleMaximize = () => {
        if (!canMaximize) return;
        const from = boxOf(titleRef.current);
        if (win.isMaximized) {
            void playCaptionZoom(
                from,
                titleBarBox({ x: win.position.x, y: win.position.y, width: size.width, maximized: false }),
                win.title,
            );
            actions.unmaximizeWindow(win.id);
        } else {
            void playCaptionZoom(from, titleBarBox({ x: 0, y: 0, width: 0, maximized: true }), win.title);
            actions.maximizeWindow(win.id);
        }
    };

    const close = () => actions.closeWindow(win.id);

    /** Resize from any edge or corner. Left and top edges move the window as they resize it. */
    const startResize = (edge: Edge) => (e: React.PointerEvent) => {
        if (!canResize || win.isMaximized) return;
        e.preventDefault();
        e.stopPropagation();
        focus();
        setIsResizing(true);
        const startX = e.clientX;
        const startY = e.clientY;
        const start = { x: x.get(), y: y.get(), w: size.width, h: size.height };

        const rectAt = (ev: PointerEvent) => {
            const dx = ev.clientX - startX;
            const dy = ev.clientY - startY;
            let { x: nx, y: ny, w, h } = start;
            if (edge.includes('e')) w = Math.max(MIN_WIDTH, start.w + dx);
            if (edge.includes('s')) h = Math.max(MIN_HEIGHT, start.h + dy);
            if (edge.includes('w')) {
                w = Math.max(MIN_WIDTH, start.w - dx);
                nx = start.x + (start.w - w);
            }
            if (edge.includes('n')) {
                h = Math.max(MIN_HEIGHT, start.h - dy);
                ny = start.y + (start.h - h);
                // The title bar may not be pushed above the screen.
                if (ny < 0) {
                    h += ny;
                    ny = 0;
                }
            }
            return { x: nx, y: ny, w, h };
        };

        const onMove = (ev: PointerEvent) => {
            const r = rectAt(ev);
            setSize({ width: r.w, height: r.h });
            x.set(r.x);
            y.set(r.y);
        };
        const onUp = (ev: PointerEvent) => {
            const r = rectAt(ev);
            actions.resizeWindow(win.id, { width: r.w, height: r.h });
            if (r.x !== start.x || r.y !== start.y) actions.moveWindow(win.id, { x: r.x, y: r.y });
            setIsResizing(false);
            document.removeEventListener('pointermove', onMove);
            document.removeEventListener('pointerup', onUp);
        };

        document.addEventListener('pointermove', onMove);
        document.addEventListener('pointerup', onUp);
    };

    const openSystemMenu = (at: { x: number; y: number }) => {
        focus();
        setSysMenu(at);
    };

    const systemMenu: MenuItem[] = [
        {
            label: 'Restore',
            icon: <i className="xp-sysglyph is-restore" />,
            disabled: !win.isMaximized || !canMaximize,
            action: toggleMaximize,
        },
        { label: 'Minimize', icon: <i className="xp-sysglyph is-min" />, action: minimize },
        {
            label: 'Maximize',
            icon: <i className="xp-sysglyph is-max" />,
            disabled: win.isMaximized || !canMaximize,
            action: toggleMaximize,
        },
        { divider: true },
        { label: 'Close', icon: <i className="xp-sysglyph is-close" />, bold: true, accel: 'Alt+F4', action: close },
    ];

    const icon = appConfig?.iconAsset;

    /*
     * A minimised window is hidden, never unmounted.
     *
     * Returning null here destroyed the whole app subtree: a Minesweeper game in progress, unsaved
     * Notepad text, the Command Prompt's scrollback and working directory, and — because the
     * <audio> element left the document — whatever the media player was playing. `display: none`
     * keeps all of it alive, which is also what XP did.
     */
    return (
        <motion.div
            ref={winRef}
            data-window={win.id}
            data-app={win.appId}
            drag={!win.isMaximized && !isResizing && !win.isMinimized && !isMobile}
            dragControls={controls}
            dragListener={false}
            dragMomentum={false}
            onDragEnd={(_, info) => {
                actions.moveWindow(win.id, {
                    x: win.position.x + info.offset.x,
                    y: win.position.y + info.offset.y,
                });
                // Render the store's clamped answer, even when it matches the last one.
                const moved = useSystemStore.getState().windows.find((w) => w.id === win.id);
                if (moved && !moved.isMaximized) {
                    x.set(moved.position.x);
                    y.set(moved.position.y);
                }
            }}
            style={{
                position: 'absolute',
                left: 0,
                top: 0,
                zIndex: win.zIndex,
                x,
                y,
                width: win.isMaximized ? '100%' : size.width,
                height: win.isMaximized ? 'calc(100% - var(--xp-taskbar-h))' : size.height,
                display: win.isMinimized ? 'none' : undefined,
            }}
            aria-hidden={win.isMinimized}
            className={`xp-window-frame${isActive ? '' : ' is-inactive'}${win.isMaximized ? ' is-maximized' : ''}`}
            onPointerDown={focus}
        >
            <div
                ref={titleRef}
                // `luna-title*` is the scheme contract Display Properties and the tests read;
                // `.xp-titlebar` draws the bar, and `.is-inactive` on the frame decides its state.
                className={`xp-titlebar ${isActive ? 'luna-title' : 'luna-title-inactive'}`}
                style={{ height: TITLE_BAR_HEIGHT }}
                onPointerDown={(e) => {
                    if (e.button !== 0) return;
                    if (!win.isMaximized) controls.start(e);
                    focus();
                }}
                onDoubleClick={toggleMaximize}
                onContextMenu={(e) => {
                    e.preventDefault();
                    openSystemMenu({ x: e.clientX, y: e.clientY });
                }}
            >
                {icon ? (
                    <XpIcon
                        src={icon}
                        size={16}
                        className="xp-titlebar-icon"
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={(e) => {
                            const r = e.currentTarget.getBoundingClientRect();
                            openSystemMenu({ x: r.left - 3, y: r.bottom + 5 });
                        }}
                        onDoubleClick={(e) => {
                            e.stopPropagation();
                            setSysMenu(null);
                            close();
                        }}
                    />
                ) : (
                    appConfig?.icon && <appConfig.icon size={16} className="xp-titlebar-icon" />
                )}
                <span className="xp-titlebar-text">{win.title}</span>

                <div className="xp-titlebar-controls" onPointerDown={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()}>
                    <button type="button" className="xp-caption-btn is-min" aria-label="Minimize" data-tip="Minimize" onClick={minimize} />
                    {canMaximize && (
                        <button
                            type="button"
                            className={`xp-caption-btn ${win.isMaximized ? 'is-restore' : 'is-max'}`}
                            aria-label={win.isMaximized ? 'Restore' : 'Maximize'}
                            data-tip={win.isMaximized ? 'Restore Down' : 'Maximize'}
                            onClick={toggleMaximize}
                        />
                    )}
                    <button type="button" className="xp-caption-btn is-close" aria-label="Close" data-tip="Close" onClick={close} />
                </div>
            </div>

            <div className="xp-window-body">
                <AppBody windowId={win.id} payload={win.payload} />
            </div>

            {canResize && !win.isMaximized && EDGES.map((edge) => (
                <div key={edge} className={`xp-resize ${edge}`} onPointerDown={startResize(edge)} aria-hidden />
            ))}

            <ContextMenu
                x={sysMenu?.x ?? 0}
                y={sysMenu?.y ?? 0}
                isOpen={sysMenu !== null}
                onClose={() => setSysMenu(null)}
                items={systemMenu}
            />
        </motion.div>
    );
}
