"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type MutableRefObject, type ReactNode } from 'react';
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
    /**
     * Which menu this is, when one ContextMenu shows different ones in turn (the Start menu's All
     * Programs and Connect To): a different one is a fresh panel, with nothing of the last one's
     * selection or keyboard, while this component stays mounted and goes on placing it.
     */
    menuKey?: string;
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

/** Where focus was before a menu took it, and the nearest focusable place around it, in case it goes. */
type ReturnTarget = { el: HTMLElement; scope: HTMLElement | null };

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
export default function ContextMenu({ x, y, isOpen, onClose, items, anchor = 'top-left', onBack, menuKey = '' }: ContextMenuProps) {
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
        // `mounted`: a menu open from its very first render is measured once the portal exists.
    }, [isOpen, x, y, items.length, anchor, mounted, menuKey]);

    if (!mounted) return null;

    return createPortal(
        <AnimatePresence>
            {isOpen && (
                <motion.div
                    key={`${opening}:${menuKey}`}
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
                    <MenuPanel items={items} onClose={onClose} root onBack={onBack} focusFollows={!!onBack} />
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
    /** Keys opened this panel: real focus moves with its selection from the start. */
    focusFollows?: boolean;
    /** Where focus was before the menu took it, shared down the submenus; the root panel owns it. */
    returnFocus?: MutableRefObject<ReturnTarget | null>;
}

function MenuPanel({ items, onClose, root, onBack, focusFollows = false, returnFocus: sharedReturn }: MenuPanelProps) {
    // A submenu opened from the keyboard starts on its first item, as XP's did.
    const [active, setActive] = useState(() => (onBack ? items.findIndex(actionable) : -1));
    const [openSub, setOpenSub] = useState(-1);
    const [keyboardInSub, setKeyboardInSub] = useState(false);
    // Whether keys (not the pointer) opened the submenu that has the keyboard.
    const [subByKey, setSubByKey] = useState(false);
    // Keys have driven this panel: from then on, real focus moves with its selection.
    const [keyed, setKeyed] = useState(false);
    const ownReturn = useRef<ReturnTarget | null>(null);
    const returnFocus = sharedReturn ?? ownReturn;
    const panelRef = useRef<HTMLDivElement>(null);
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
        giveBackFocus();
        item.action?.();
        onClose();
    };

    /*
     * Real focus moves with the selection only in a panel the keys are driving (one opened by a key,
     * or one a key has been pressed in), so a screen reader announces each item. The pointer never
     * moves focus into a menu, as XP's never took it: a pointer entering a submenu used to pull focus
     * out of the window it was in (Explorer's list stopped taking its keys after View > List).
     */
    const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);
    const focusMoves = focusFollows || keyed;
    useEffect(() => {
        // Only the panel with the keyboard: the root, or a submenu it has been handed to.
        if (keyboardInSub || !isPresent || active < 0 || !(root || hasKeyboard)) return;
        // Once focus is anywhere in this menu, it stays on the selection of the panel with the keyboard,
        // whoever moves it — a sibling's submenu the pointer opened included. With the pointer lighting
        // one item and focus on another, Enter chose one while a screen reader read the other.
        const menu = panelRef.current?.closest(`[${MENU_ATTR}]`);
        const inThisMenu = !!menu && !!document.activeElement && menu.contains(document.activeElement);
        if (!focusMoves && !inThisMenu) return;
        const current = document.activeElement;
        if (current instanceof HTMLElement && current !== document.body && !current.closest(`[${MENU_ATTR}]`)) {
            returnFocus.current = { el: current, scope: current.parentElement?.closest<HTMLElement>('[tabindex]') ?? null };
        }
        itemRefs.current[active]?.focus({ preventScroll: true });
    }, [focusMoves, keyboardInSub, isPresent, active, returnFocus, root, hasKeyboard]);

    /**
     * Focus goes back where it was before the menu took it (or is let go, if that has gone), so a
     * menu fading out under aria-hidden never holds it. Called when an item acts, and at the start of
     * every other close (Escape, a click outside, the window losing focus, a hover moving on).
     */
    function giveBackFocus() {
        const focused = document.activeElement;
        if (!(focused instanceof HTMLElement) || !panelRef.current?.contains(focused)) return;
        // The element it came from, or, if that has gone (a rename box that committed as the menu took
        // focus), the nearest focusable place around it. Focus must really land: a hidden or disabled
        // target takes none, and focus would stay in the fading menu.
        const back = returnFocus.current;
        for (const target of [back?.el, back?.scope]) {
            if (!target?.isConnected) continue;
            target.focus({ preventScroll: true });
            if (document.activeElement === target) return;
        }
        focused.blur();
    }
    useLayoutEffect(() => {
        if (!isPresent) giveBackFocus();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isPresent]);
    // A submenu unmounts without fading (Left, Escape, the pointer moving on): if it holds focus, it
    // hands it back as it goes, before its node leaves the page.
    useLayoutEffect(() => () => giveBackFocus(), []); // eslint-disable-line react-hooks/exhaustive-deps

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
            // Tab does nothing in a menu that holds focus, as in XP's: it would carry focus on past the
            // menu, out of the page, and the window losing focus closed the menu.
            if (e.key === 'Tab') {
                const menu = panelRef.current?.closest(`[${MENU_ATTR}]`);
                if (menu && document.activeElement && menu.contains(document.activeElement)) {
                    e.preventDefault();
                    e.stopPropagation();
                }
                return;
            }
            const handled = ['ArrowDown', 'ArrowUp', 'ArrowRight', 'ArrowLeft', 'Enter', 'Escape', ' '];
            if (!handled.includes(e.key)) return;
            // Ctrl+Shift+Esc is Task Manager's, not the menu's: the menu closes and lets it through.
            if (e.key === 'Escape' && e.ctrlKey && e.shiftKey) {
                onClose();
                return;
            }
            e.preventDefault();
            e.stopPropagation();
            // Any other chord of a menu key is swallowed and does nothing, as in XP's menus: Alt+Enter,
            // Ctrl+Enter or Ctrl+Arrow must not act on the desktop or a window behind an open menu.
            if (e.ctrlKey || e.altKey || e.metaKey) return;
            // A held Enter repeats: it opened this, and must not go on to choose in it.
            if (e.repeat && (e.key === 'Enter' || e.key === ' ')) return;
            setKeyed(true);
            window.clearTimeout(timer.current);
            if (e.key === 'ArrowDown') setActive((a) => step(a, 1));
            else if (e.key === 'ArrowUp') setActive((a) => step(a < 0 ? 0 : a, -1));
            else if (e.key === 'ArrowRight') {
                if (active >= 0 && items[active]?.items && actionable(items[active])) {
                    setOpenSub(active);
                    setKeyboardInSub(true);
                    setSubByKey(true);
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
                    setSubByKey(true);
                } else activate(active);
            }
        };
        document.addEventListener('keydown', onKey, true);
        return () => document.removeEventListener('keydown', onKey, true);
    });

    return (
        // A closing menu is gone to assistive technology too, not just to the pointer and the keys.
        // A press never moves focus into a menu, as XP's never took it: the keyboard stays with the
        // window or box it was in. An edit in progress still ends, as a press anywhere else ends it
        // (a rename box commits on blur).
        <div ref={panelRef} className="xp-menu" role="menu" aria-hidden={!isPresent || undefined} onMouseDown={(e) => {
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
                                focusFollows={keyboardInSub && subByKey}
                                returnFocus={returnFocus}
                                onTakeKeyboard={() => {
                                    window.clearTimeout(timer.current);
                                    setKeyboardInSub(true);
                                    setSubByKey(false);
                                }}
                                onBack={() => {
                                    // Left or Escape in the submenu: the keys now drive this panel, and
                                    // focus lands on the item that opened it, as XP's did — before the
                                    // submenu goes, so it stops nowhere else on the way.
                                    // (Only when focus is already in the menu: if the pointer took the
                                    // submenu, the focus effect moves it, recording where it came from.)
                                    const menu = panelRef.current?.closest(`[${MENU_ATTR}]`);
                                    if (menu && document.activeElement && menu.contains(document.activeElement)) {
                                        itemRefs.current[index]?.focus({ preventScroll: true });
                                    }
                                    setOpenSub(-1);
                                    setKeyboardInSub(false);
                                    setSubByKey(false);
                                    setKeyed(true);
                                }}
                            />
                        )}
                    </div>
                ),
            )}
        </div>
    );
}

function Submenu({ items, onClose, onBack, takesKeyboard, onTakeKeyboard, focusFollows, returnFocus }: {
    items: MenuItem[];
    onClose: () => void;
    onBack: () => void;
    takesKeyboard: boolean;
    onTakeKeyboard: () => void;
    focusFollows: boolean;
    returnFocus: MutableRefObject<ReturnTarget | null>;
}) {
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
            <MenuPanel items={items} onClose={onClose} onBack={takesKeyboard ? onBack : undefined} focusFollows={focusFollows} returnFocus={returnFocus} />
        </div>
    );
}
