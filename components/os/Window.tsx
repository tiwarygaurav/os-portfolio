"use client";

import { useSystemStore, type AppWindow } from '@/store/useSystemStore';
import { APPS, isAppId, type AppComponent } from '@/constants/apps';
import { X, Square } from 'lucide-react';
import { motion, useDragControls, useMotionValue } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { playSound } from '@/utils/sound';
import { useIsMobile } from '@/utils/viewport';

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
                <div className="flex h-full items-center justify-center bg-[#ece9d8] text-xs text-gray-600">
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

interface WindowProps {
    win: AppWindow;
}

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
    const [size, setSize] = useState(win.size);
    const [isResizing, setIsResizing] = useState(false);

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

    const handlePointerDown = () => {
        actions.focusWindow(win.id);
    };

    const startResize = (e: React.PointerEvent) => {
        if (!canResize || win.isMaximized) return;
        e.preventDefault();
        e.stopPropagation();
        setIsResizing(true);
        const startX = e.clientX;
        const startY = e.clientY;
        const startW = size.width;
        const startH = size.height;

        const onMove = (ev: PointerEvent) => {
            const newW = Math.max(280, startW + (ev.clientX - startX));
            const newH = Math.max(220, startH + (ev.clientY - startY));
            setSize({ width: newW, height: newH });
        };
        const onUp = (ev: PointerEvent) => {
            const newW = Math.max(280, startW + (ev.clientX - startX));
            const newH = Math.max(220, startH + (ev.clientY - startY));
            actions.resizeWindow(win.id, { width: newW, height: newH });
            setIsResizing(false);
            document.removeEventListener('pointermove', onMove);
            document.removeEventListener('pointerup', onUp);
        };

        document.addEventListener('pointermove', onMove);
        document.addEventListener('pointerup', onUp);
    };

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
            initial={{ scale: 0.92, opacity: 0 }}
            animate={{
                width: win.isMaximized ? '100%' : size.width,
                height: win.isMaximized ? 'calc(100% - 36px)' : size.height,
                top: win.isMaximized ? 0 : undefined,
                left: win.isMaximized ? 0 : undefined,
                opacity: 1,
                scale: 1,
            }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            style={{
                position: 'absolute',
                zIndex: win.zIndex,
                x,
                y,
                display: win.isMinimized ? 'none' : undefined,
            }}
            aria-hidden={win.isMinimized}
            className={`flex flex-col shadow-2xl overflow-visible ${win.isMaximized ? '' : 'rounded-t-xl rounded-b-md'} ${isActive ? '' : 'opacity-95'}`}
            onPointerDown={handlePointerDown}
        >
            {/* XP Title Bar */}
            <div
                onPointerDown={(e) => {
                    if (!win.isMaximized) controls.start(e);
                    handlePointerDown();
                }}
                onDoubleClick={() => {
                    if (!canMaximize) return;
                    if (win.isMaximized) actions.unmaximizeWindow(win.id);
                    else actions.maximizeWindow(win.id);
                }}
                className={`flex items-center justify-between px-2 h-7 select-none cursor-default ${isActive
                    ? 'bg-gradient-to-b from-[#0058ee] via-[#0073e6] to-[#0058ee]'
                    : 'bg-gradient-to-b from-[#7a96df] via-[#9bb4ea] to-[#7a96df]'} text-white border-b border-[#003da8] ${win.isMaximized ? '' : 'rounded-t-lg'}`}
            >
                <div className="flex items-center gap-2 min-w-0">
                    {appConfig?.iconAsset ? (
                        <img src={appConfig.iconAsset} alt={win.title} className="w-4 h-4 drop-shadow-md shrink-0" />
                    ) : (
                        appConfig?.icon && <appConfig.icon size={16} className="filter drop-shadow-md shrink-0" />
                    )}
                    <span className="text-xs font-bold tracking-wide drop-shadow-md truncate">{win.title}</span>
                </div>

                <div className="flex items-center gap-0.5 shrink-0">
                    <button
                        onClick={(e) => { e.stopPropagation(); playSound('minimize'); actions.minimizeWindow(win.id); }}
                        className="w-5 h-5 flex items-end justify-center pb-0.5 rounded-[3px] bg-gradient-to-b from-[#3d80f1] to-[#0e4cb0] hover:from-[#5fa6f5] hover:to-[#1c63d4] active:from-[#0e4cb0] active:to-[#3d80f1] border border-white/40"
                        title="Minimize"
                    >
                        <span className="block w-2 h-0.5 bg-white" />
                    </button>

                    {canMaximize && (
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                if (win.isMaximized) actions.unmaximizeWindow(win.id);
                                else actions.maximizeWindow(win.id);
                            }}
                            className="w-5 h-5 flex items-center justify-center rounded-[3px] bg-gradient-to-b from-[#3d80f1] to-[#0e4cb0] hover:from-[#5fa6f5] hover:to-[#1c63d4] active:from-[#0e4cb0] active:to-[#3d80f1] border border-white/40"
                            title={win.isMaximized ? "Restore" : "Maximize"}
                        >
                            {win.isMaximized ? <Square size={9} strokeWidth={3} /> : <span className="block w-2.5 h-2 border-2 border-white border-t-[3px]" />}
                        </button>
                    )}

                    <button
                        onClick={(e) => { e.stopPropagation(); playSound('close'); actions.closeWindow(win.id); }}
                        className="w-5 h-5 flex items-center justify-center rounded-[3px] bg-gradient-to-b from-[#e74e57] to-[#a91b1b] hover:from-[#f47280] hover:to-[#c0252b] active:from-[#a91b1b] active:to-[#e74e57] border border-white/40 ml-0.5"
                        title="Close"
                    >
                        <X size={12} strokeWidth={3} />
                    </button>
                </div>
            </div>

            {/* Content Area */}
            <div className="flex-1 bg-white overflow-hidden relative border-l-2 border-r-2 border-b-2 border-[#0055ea]">
                <AppBody windowId={win.id} payload={win.payload} />
            </div>

            {/* Resize handle */}
            {canResize && !win.isMaximized && (
                <div
                    onPointerDown={startResize}
                    className="absolute bottom-0 right-0 w-4 h-4 cursor-nwse-resize z-10"
                    style={{
                        background: 'linear-gradient(135deg, transparent 50%, #888 50%, #888 60%, transparent 60%, transparent 70%, #888 70%, #888 80%, transparent 80%)'
                    }}
                />
            )}
        </motion.div>
    );
}
