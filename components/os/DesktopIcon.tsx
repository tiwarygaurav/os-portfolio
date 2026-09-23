"use client";

import { useSystemStore, clampIconToViewport } from '@/store/useSystemStore';
import { AppConfig } from '@/constants/apps';
import { motion, useMotionValue } from 'framer-motion';
import { playSound } from '@/utils/sound';
import { useIsMobile } from '@/utils/viewport';
import { useEffect, useRef } from 'react';
import XpIcon from '@/components/ui/XpIcon';
import { shortcutName } from '@/utils/shortcut';

interface DesktopIconProps {
    appId: string;
    app: AppConfig;
    initialPosition: { x: number; y: number };
    isSelected: boolean;
    /** The icon that last took a click: XP draws the dotted focus rectangle on it. */
    isFocused: boolean;
    /** `additive` is Ctrl+click: toggle this icon without clearing the rest. */
    onSelect: (additive: boolean) => void;
    onOpen: () => void;
    onContextMenu?: (e: React.MouseEvent) => void;
}

/** Grid the icons snap to when dropped, in px. */
const SNAP = 10;

/** XP's Recycle Bin showed its full artwork whenever it held something. */
const RECYCLE_FULL = '/icons/xp/recycle-bin-full.svg';

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

/**
 * A desktop icon, drawn as XP drew them: 48px artwork over an 11px Tahoma label with a drop
 * shadow. Selected, the artwork takes a blue tint shaped exactly like the icon (a CSS mask of the
 * same image) and the label gets the highlight box; the focused one also gets the dotted focus
 * rectangle. Hovering does nothing, as it did in XP's double-click mode.
 */
export default function DesktopIcon({
    appId,
    app,
    initialPosition,
    isSelected,
    isFocused,
    onSelect,
    onOpen,
    onContextMenu,
}: DesktopIconProps) {
    const actions = useSystemStore((s) => s.actions);
    const saved = useSystemStore((s) => s.desktopIcons[appId]);
    const binFull = useSystemStore((s) => appId === 'trash' && s.recycleBin.length > 0);
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

    const icon = binFull ? RECYCLE_FULL : app.iconAsset;

    const handleClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        // A click is synthesised at the end of a drag; opening or selecting then is not intended.
        if (dropped.current) {
            dropped.current = false;
            return;
        }
        onSelect(e.ctrlKey || e.metaKey);
        // Touch has no hover to teach "double-tap", and XP's own tablet builds opened on a single
        // tap. On a pointer device the double-click idiom stays.
        if (isMobile) onOpen();
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
                    playSound('recycle');
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
            onDoubleClick={(e) => {
                e.stopPropagation();
                onOpen();
            }}
            onClick={handleClick}
            onPointerDown={(e) => e.stopPropagation()}
            onContextMenu={onContextMenu}
            className="flex h-[88px] w-[80px] cursor-default justify-center touch-none"
            role="button"
            aria-label={shortcutName(app.title)}
            aria-pressed={isSelected}
        >
            <div className={`xp-desktop-icon${isSelected ? ' is-selected' : ''}${isFocused ? ' is-focused' : ''}`}>
                <div
                    className="xp-desktop-icon-img"
                    style={icon ? ({ '--icon': `url("${icon}")` } as React.CSSProperties) : undefined}
                >
                    {icon ? (
                        <XpIcon src={icon} size={48} alt="" className="pointer-events-none" />
                    ) : (
                        <app.icon className="h-12 w-12 text-white drop-shadow-md" />
                    )}
                </div>
                <span className="xp-desktop-icon-label">{shortcutName(app.title)}</span>
            </div>
        </motion.div>
    );
}
