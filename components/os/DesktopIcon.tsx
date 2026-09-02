"use client";

import { useSystemStore, clampIconToViewport } from '@/store/useSystemStore';
import { AppConfig } from '@/constants/apps';
import { motion, useMotionValue } from 'framer-motion';
import { playSound } from '@/utils/sound';
import { useIsMobile } from '@/utils/viewport';
import { useEffect, useRef } from 'react';
import { cn } from '@/utils/cn';

interface DesktopIconProps {
    appId: string;
    app: AppConfig;
    initialPosition: { x: number; y: number };
    isSelected: boolean;
    onSelect: () => void;
    onContextMenu?: (e: React.MouseEvent) => void;
}

/** Grid the icons snap to when dropped, in px. */
const SNAP = 10;

/**
 * Is this drop point inside the Recycle Bin icon?
 *
 * The bin is found by its `data-desktop-icon` attribute rather than by a ref passed down through
 * the desktop, so the hit test does not need every icon to know about every other icon.
 */
function isOverRecycleBin(point: { x: number; y: number }): boolean {
    if (typeof document === 'undefined') return false;
    const bin = document.querySelector('[data-desktop-icon="trash"]');
    if (!bin) return false;
    const r = bin.getBoundingClientRect();
    return point.x >= r.left && point.x <= r.right && point.y >= r.top && point.y <= r.bottom;
}

export default function DesktopIcon({ appId, app, initialPosition, isSelected, onSelect, onContextMenu }: DesktopIconProps) {
    const actions = useSystemStore((s) => s.actions);
    const saved = useSystemStore((s) => s.desktopIcons[appId]);
    const isMobile = useIsMobile();

    /*
     * Clamped at render, not only on write: a position saved on a wide monitor would otherwise
     * place the icon off-screen when the same browser opens the site on a narrower one, and
     * because icon positions persist, that loss survived every reload.
     */
    const position = clampIconToViewport(saved ?? initialPosition);

    const x = useMotionValue(position.x);
    const y = useMotionValue(position.y);
    const dropped = useRef(false);

    // Follow the store, including when the clamped value is unchanged — framer skips an
    // `animate` target it has already seen, which would leave the icon where the drag left it.
    useEffect(() => {
        x.set(position.x);
        y.set(position.y);
    }, [position.x, position.y, x, y]);

    const handleDoubleClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        playSound('open');
        actions.openWindow(appId, app.title);
    };

    const handleClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        // A click is synthesised at the end of a drag; opening or selecting then is not intended.
        if (dropped.current) {
            dropped.current = false;
            return;
        }
        onSelect();
        // Touch has no hover to teach "double-tap", and XP's own tablet builds opened on a single
        // tap. On a pointer device the double-click idiom stays.
        if (isMobile) {
            playSound('open');
            actions.openWindow(appId, app.title);
        }
    };

    return (
        <motion.div
            data-desktop-icon={appId}
            drag
            dragMomentum={false}
            style={{ position: 'absolute', left: 0, top: 0, x, y }}
            onDragStart={() => { dropped.current = true; }}
            onDragEnd={(_e, info) => {
                // Dropping an icon on the Recycle Bin deletes it, which is what the bin's own
                // Details panel tells the visitor to do. XP did this silently, with no prompt.
                if (appId !== 'trash' && isOverRecycleBin(info.point)) {
                    playSound('close');
                    actions.deleteIcon(appId, app.title, app.iconAsset || '');
                    return;
                }
                const next = clampIconToViewport({
                    x: Math.round((position.x + info.offset.x) / SNAP) * SNAP,
                    y: Math.round((position.y + info.offset.y) / SNAP) * SNAP,
                });
                actions.setDesktopIconPosition(appId, next.x, next.y);
                // The store clamps again on write; render its answer even if it is unchanged.
                x.set(next.x);
                y.set(next.y);
            }}
            onDoubleClick={handleDoubleClick}
            onClick={handleClick}
            onContextMenu={onContextMenu}
            className={cn(
                "flex flex-col items-center justify-start gap-1 p-1 w-[80px] h-[88px] rounded cursor-default group touch-none",
                isSelected && "bg-blue-700/40"
            )}
        >
            <div className={cn(
                "relative transition-all filter pointer-events-none",
                isSelected ? "drop-shadow-none brightness-110" : "drop-shadow-md group-hover:drop-shadow-xl"
            )}>
                {app.iconAsset ? (
                    <img
                        src={app.iconAsset}
                        alt={app.title}
                        className="w-12 h-12 object-contain"
                        draggable={false}
                    />
                ) : (
                    <app.icon className="w-12 h-12 text-white drop-shadow-md" />
                )}
            </div>

            <span className={cn(
                "text-white text-xs text-center line-clamp-2 px-1 leading-tight max-w-full",
                isSelected ? "bg-[#0a246a] border border-dotted border-yellow-300" : "drop-shadow-[1px_1px_0_rgba(0,0,0,0.9)]"
            )}>
                {app.title}
            </span>
        </motion.div>
    );
}
