"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence, useIsPresent } from 'framer-motion';
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
    /**
     * Opened from the keyboard by a menu that keeps its own (the Start menu's All Programs): start
     * on the first item, and hand the keyboard back on Left or Escape, as a submenu does.
     */
    onBack?: () => void;
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

/** Ends an edit in progress (an input, a text area, an editable element) by taking focus from it. */
function endEdit(): void {
    const el = document.activeElement;
    if (el instanceof HTMLElement && (el.matches('input, textarea, select') || el.isContentEditable)) el.blur();
}

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
export default function ContextMenu({ x, y, isOpen, onClose, items, anchor = 'top-left', onBack }: ContextMenuProps) {
    const menuRef = useRef<HTMLDivElement | null>(null);
    const [pos, setPos] = useState({ left: x, top: y });
    const [mounted, setMounted] = useState(false);

    /*
     * Each opening is a new menu, as in XP. Reopened during its exit fade under the same key, the
     * old panel came back as it was left: its submenu still open where the last menu had placed it,
     * which could be off the screen. The old one fades out beside the new one, so its ref is only
     * ever set, never cleared: its unmount must not clear the new menu's.
     */
    const [wasOpen, setWasOpen] = useState(isOpen);
    const [opening, setOpening] = useState(0);
    if (isOpen !== wasOpen) {
        setWasOpen(isOpen);
        if (isOpen) setOpening((n) => n + 1);
    }
    const setMenuEl = useCallback((el: HTMLDivElement | null) => {
        if (el) menuRef.current = el;
    }, []);

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
                    key={opening}
                    ref={setMenuEl}
                    // XP's default menu animation was a plain fade. A closing menu is already gone
                    // to the pointer, as XP's was: a right-click during the fade opens a new menu
                    // instead of landing on the old one.
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1, pointerEvents: 'auto' }}
                    exit={{ opacity: 0, pointerEvents: 'none' }}
                    transition={{ duration: 0.1, ease: 'easeOut' }}
                    className="fixed z-[10000]"
                    style={{ left: pos.left, top: pos.top }}
                    {...{ [MENU_ATTR]: '' }}
                    onContextMenu={(e) => e.preventDefault()}
                >
                    <MenuPanel items={items} onClose={onClose} root onBack={onBack} />
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
    /*
     * False from the moment the menu starts its exit fade. A closing menu must stop listening at
     * once: its capture-phase key handler used to stay attached for the whole fade and swallow the
     * Enter meant for whatever the chosen item just opened (a rename box, a dialog).
     */
    const isPresent = useIsPresent();

    useEffect(() => () => window.clearTimeout(timer.current), []);

    const hasKeyboard = !!onBack;
    useEffect(() => {
        if (hasKeyboard) setActive((a) => (a < 0 ? items.findIndex(actionable) : a));
    }, [hasKeyboard, items]);

    const activate = (index: number) => {
        const item = items[index];
        if (!item || !actionable(item)) return;
        if (item.items) {
            setOpenSub(index);
            return;
        }
        // The menu is about to fade out under aria-hidden: it must not be holding focus.
        const focused = document.activeElement;
        if (focused instanceof HTMLElement && focused.closest(`[${MENU_ATTR}]`)) focused.blur();
        item.action?.();
        onClose();
    };

    /*
     * A panel that owns the keyboard (a submenu opened from the keyboard, or the Start menu's All
     * Programs) moves real focus with its selection, so a screen reader announces each item. A press
     * of the mouse still never moves focus into a menu.
     */
    const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);
    useEffect(() => {
        if (!hasKeyboard || keyboardInSub || !isPresent || active < 0) return;
        itemRefs.current[active]?.focus({ preventScroll: true });
    }, [hasKeyboard, keyboardInSub, isPresent, active]);

    // Keyboard: only the innermost open panel listens.
    useEffect(() => {
        if (!isPresent) return;
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
            window.clearTimeout(timer.current);
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
            } else if (active >= 0 && actionable(items[active])) {
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
        // A closing menu is gone to assistive technology too, not just to the pointer and the keys.
        // A press never moves focus into a menu, as XP's never took it: the keyboard stays with the
        // window or box it was in, and aria-hidden can never sit over the focused element. An edit in
        // progress still ends, as a press anywhere else ends it (a rename box commits on blur).
        <div className="xp-menu" role="menu" aria-hidden={!isPresent || undefined} onMouseDown={(e) => {
            endEdit();
            e.preventDefault();
        }}>
            {items.map((item, index) =>
                item.divider ? (
                    <div key={index} className="xp-menu-sep" role="separator" />
                ) : (
                    <div key={index} className="relative">
                        <button
                            ref={(el) => {
                                itemRefs.current[index] = el;
                            }}
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
                                onTakeKeyboard={() => {
                                    window.clearTimeout(timer.current);
                                    setKeyboardInSub(true);
                                }}
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

function Submenu({ items, onClose, onBack, takesKeyboard, onTakeKeyboard }: { items: MenuItem[]; onClose: () => void; onBack: () => void; takesKeyboard: boolean; onTakeKeyboard: () => void }) {
    const ref = useRef<HTMLDivElement>(null);
    const [side, setSide] = useState<{ left?: string; right?: string; top: number }>({ left: '100%', top: -3 });

    // Open to the right of the item; flip left when it would run off-screen, as XP did.
    useLayoutEffect(() => {
        const el = ref.current;
        if (!el) return;
        const r = el.getBoundingClientRect();
        const next: typeof side = { left: '100%', top: -3 };
        if (r.right > window.innerWidth - EDGE_GAP) {
            const parent = el.parentElement?.getBoundingClientRect();
            const flippedLeft = parent ? parent.left - r.width : 0;
            if (parent && flippedLeft >= EDGE_GAP) {
                next.left = undefined;
                next.right = '100%';
            } else if (parent) {
                // Neither side fits (a phone): overlap the parent, pinned inside the screen.
                const x = Math.max(EDGE_GAP, window.innerWidth - EDGE_GAP - r.width);
                next.left = `${x - parent.left}px`;
            }
        }
        const overflow = r.bottom - (window.innerHeight - taskbarHeight() - EDGE_GAP);
        if (overflow > 0) next.top = -3 - overflow;
        setSide(next);
        // Measured once per open; the panel's size does not change while it is open.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return (
        <div ref={ref} className="absolute z-10" style={{ left: side.left, right: side.right, top: side.top }} onPointerEnter={onTakeKeyboard}>
            <MenuPanel items={items} onClose={onClose} onBack={takesKeyboard ? onBack : undefined} />
        </div>
    );
}
