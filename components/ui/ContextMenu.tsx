"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { taskbarHeight } from '@/utils/viewport';

/** Breathing room between a menu and a viewport edge, in px. */
const EDGE_GAP = 2;
/** XP opened a submenu after the pointer rested on its item for a moment, not instantly. */
const SUBMENU_DELAY_MS = 250;

export interface MenuItem {
    label?: string;
    action?: () => void;
    divider?: boolean;
    disabled?: boolean;
    /** The action a double-click would take. XP draws it in bold. */
    bold?: boolean;
    /** Right-aligned shortcut text, e.g. "Alt+F4". */
    accel?: string;
    /** A 16px glyph for the left gutter. */
    icon?: ReactNode;
    checked?: boolean;
    /** A cascading submenu. */
    items?: MenuItem[];
}

interface ContextMenuProps {
    /** Viewport coordinates of the pointer (clientX / clientY). */
    x: number;
    y: number;
    isOpen: boolean;
    onClose: () => void;
    items: MenuItem[];
    /**
     * Which corner of the menu sits at (x, y). A context menu hangs from the pointer; the Start
     * menu's All Programs cascade grows upward from its button, so it anchors bottom-left.
     */
    anchor?: 'top-left' | 'bottom-left';
}

/** Marks a portaled menu, so a surface that closes on outside clicks can tell it is not outside. */
export const MENU_ATTR = 'data-xp-menu';

/** Is this event target inside any open XP menu? */
export const isInsideMenu = (target: EventTarget | null): boolean =>
    target instanceof Element && target.closest(`[${MENU_ATTR}]`) !== null;

/**
 * Where to draw a menu edge, given the pointer coordinate, the menu's size on that axis and the
 * furthest coordinate that still fits. XP flips a menu to the other side of the cursor when it
 * would run off an edge; on a viewport too small for either side, pin it to the edge.
 */
function place(pointer: number, size: number, limit: number): number {
    if (pointer <= limit) return pointer;
    return Math.max(0, Math.min(pointer - size, limit));
}

const actionable = (item: MenuItem) => !item.divider && !item.disabled;

/**
 * An XP menu: the white Luna panel with its #aca899 border and soft shadow, the default action in
 * bold, shortcut text on the right, and cascading submenus.
 *
 * Portaled to `document.body` with fixed positioning, so the same component serves the desktop,
 * the taskbar and a window's system menu without any of them clipping it. Keyboard works as it
 * did in XP — arrows move, Right opens a submenu, Left or Escape backs out, Enter activates — and
 * every key it handles is swallowed, so Enter on a menu item cannot also open the desktop icon
 * underneath.
 */
export default function ContextMenu({ x, y, isOpen, onClose, items, anchor = 'top-left' }: ContextMenuProps) {
    const menuRef = useRef<HTMLDivElement>(null);
    const [pos, setPos] = useState({ left: x, top: y });
    const [mounted, setMounted] = useState(false);

    useEffect(() => setMounted(true), []);

    useEffect(() => {
        if (!isOpen) return;
        const onPointerDown = (event: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) onClose();
        };
        const onBlur = () => onClose();
        document.addEventListener('mousedown', onPointerDown);
        window.addEventListener('blur', onBlur);
        window.addEventListener('resize', onBlur);
        return () => {
            document.removeEventListener('mousedown', onPointerDown);
            window.removeEventListener('blur', onBlur);
            window.removeEventListener('resize', onBlur);
        };
    }, [isOpen, onClose]);

    // Clamp to the viewport from the menu's rendered size, before paint.
    useLayoutEffect(() => {
        if (!isOpen) return;
        const el = menuRef.current;
        if (!el) return;
        const maxLeft = window.innerWidth - el.offsetWidth - EDGE_GAP;
        const maxTop = window.innerHeight - taskbarHeight() - el.offsetHeight - EDGE_GAP;
        const top = anchor === 'bottom-left'
            ? Math.max(0, Math.min(y - el.offsetHeight, maxTop))
            : place(y, el.offsetHeight, maxTop);
        setPos({ left: place(x, el.offsetWidth, maxLeft), top });
    }, [isOpen, x, y, items.length, anchor]);

    if (!mounted) return null;

    return createPortal(
        <AnimatePresence>
            {isOpen && (
                <motion.div
                    key="menu"
                    ref={menuRef}
                    // XP's default menu animation was a plain fade.
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.1, ease: 'easeOut' }}
                    className="fixed z-[10000]"
                    style={{ left: pos.left, top: pos.top }}
                    {...{ [MENU_ATTR]: '' }}
                    onContextMenu={(e) => e.preventDefault()}
                >
                    <MenuPanel items={items} onClose={onClose} root />
                </motion.div>
            )}
        </AnimatePresence>,
        document.body,
    );
}

interface MenuPanelProps {
    items: MenuItem[];
    onClose: () => void;
    /** The top-level panel owns the keyboard until a submenu takes it. */
    root?: boolean;
    /** For a submenu: hand the keyboard back to the parent. */
    onBack?: () => void;
}

function MenuPanel({ items, onClose, root, onBack }: MenuPanelProps) {
    // A submenu opened from the keyboard starts on its first item, as XP's did.
    const [active, setActive] = useState(() => (onBack ? items.findIndex(actionable) : -1));
    const [openSub, setOpenSub] = useState(-1);
    const [keyboardInSub, setKeyboardInSub] = useState(false);
    const timer = useRef<number>();

    useEffect(() => () => window.clearTimeout(timer.current), []);

    const activate = (index: number) => {
        const item = items[index];
        if (!item || !actionable(item)) return;
        if (item.items) {
            setOpenSub(index);
            return;
        }
        item.action?.();
        onClose();
    };

    // Keyboard: only the innermost open panel listens.
    useEffect(() => {
        if (keyboardInSub) return;
        if (!root && !onBack) return;
        const step = (from: number, dir: 1 | -1) => {
            for (let i = 1; i <= items.length; i++) {
                const next = (from + dir * i + items.length * 2) % items.length;
                if (actionable(items[next])) return next;
            }
            return from;
        };
        const onKey = (e: KeyboardEvent) => {
            const handled = ['ArrowDown', 'ArrowUp', 'ArrowRight', 'ArrowLeft', 'Enter', 'Escape', ' '];
            if (!handled.includes(e.key)) return;
            e.preventDefault();
            e.stopPropagation();
            if (e.key === 'ArrowDown') setActive((a) => step(a, 1));
            else if (e.key === 'ArrowUp') setActive((a) => step(a < 0 ? 0 : a, -1));
            else if (e.key === 'ArrowRight') {
                if (active >= 0 && items[active]?.items && actionable(items[active])) {
                    setOpenSub(active);
                    setKeyboardInSub(true);
                }
            } else if (e.key === 'ArrowLeft') {
                if (onBack) onBack();
            } else if (e.key === 'Escape') {
                if (onBack) onBack();
                else onClose();
            } else if (active >= 0) {
                if (items[active]?.items) {
                    setOpenSub(active);
                    setKeyboardInSub(true);
                } else activate(active);
            }
        };
        document.addEventListener('keydown', onKey, true);
        return () => document.removeEventListener('keydown', onKey, true);
    });

    return (
        <div className="xp-menu" role="menu">
            {items.map((item, index) =>
                item.divider ? (
                    <div key={index} className="xp-menu-sep" role="separator" />
                ) : (
                    <div key={index} className="relative">
                        <button
                            type="button"
                            role={item.checked !== undefined ? 'menuitemcheckbox' : 'menuitem'}
                            aria-checked={item.checked}
                            aria-disabled={item.disabled || undefined}
                            aria-haspopup={item.items ? 'menu' : undefined}
                            aria-expanded={item.items ? openSub === index : undefined}
                            tabIndex={-1}
                            className={[
                                'xp-menu-item',
                                item.bold && 'is-default',
                                item.items && 'has-submenu',
                                (active === index || openSub === index) && !item.disabled && 'is-active',
                            ].filter(Boolean).join(' ')}
                            onMouseEnter={() => {
                                setActive(index);
                                setKeyboardInSub(false);
                                window.clearTimeout(timer.current);
                                timer.current = window.setTimeout(
                                    () => setOpenSub(item.items && !item.disabled ? index : -1),
                                    SUBMENU_DELAY_MS,
                                );
                            }}
                            onClick={() => activate(index)}
                        >
                            {item.icon && <span className="absolute left-[3px] flex h-4 w-4 items-center justify-center">{item.icon}</span>}
                            <span>{item.label}</span>
                            {item.accel && <span className="xp-menu-accel">{item.accel}</span>}
                        </button>
                        {item.items && openSub === index && (
                            <Submenu
                                items={item.items}
                                onClose={onClose}
                                takesKeyboard={keyboardInSub}
                                onBack={() => {
                                    setOpenSub(-1);
                                    setKeyboardInSub(false);
                                }}
                            />
                        )}
                    </div>
                ),
            )}
        </div>
    );
}

function Submenu({ items, onClose, onBack, takesKeyboard }: { items: MenuItem[]; onClose: () => void; onBack: () => void; takesKeyboard: boolean }) {
    const ref = useRef<HTMLDivElement>(null);
    const [side, setSide] = useState<{ left?: string; right?: string; top: number }>({ left: '100%', top: -3 });

    // Open to the right of the item; flip left when it would run off-screen, as XP did.
    useLayoutEffect(() => {
        const el = ref.current;
        if (!el) return;
        const r = el.getBoundingClientRect();
        const next: typeof side = { left: '100%', top: -3 };
        if (r.right > window.innerWidth - EDGE_GAP) {
            next.left = undefined;
            next.right = '100%';
        }
        const overflow = r.bottom - (window.innerHeight - taskbarHeight() - EDGE_GAP);
        if (overflow > 0) next.top = -3 - overflow;
        setSide(next);
        // Measured once per open; the panel's size does not change while it is open.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return (
        <div ref={ref} className="absolute z-10" style={{ left: side.left, right: side.right, top: side.top }}>
            <MenuPanel items={items} onClose={onClose} onBack={takesKeyboard ? onBack : undefined} />
        </div>
    );
}
