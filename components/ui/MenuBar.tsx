"use client";

import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

/**
 * An XP application menu bar: File, Edit, View…
 *
 * Behaves the way XP's did, because that is most of what makes one feel right:
 *  - Menus open on mouse-down; with one open, hovering another title switches to it.
 *  - The click that dismisses a menu is swallowed when it lands in the same window, so closing
 *    the File menu over Paint's canvas does not also draw on it.
 *  - Arrow keys, Enter, Escape and access keys work inside an open menu; Alt+letter and F10 open
 *    one while the window is active. Access-key underlines appear only in keyboard use — XP's
 *    default was to hide them until Alt was pressed.
 *  - The highlighted item's hint is reported so the app can show it in its status bar, which is
 *    where XP programs explained their menu items.
 *
 * Dropdowns are portaled to `document.body` with fixed positioning: the window body clips its
 * content, and an XP menu hangs past the edge of its window rather than being cut off by it.
 *
 * The drawing is `app/luna.css`'s (`xp-menubar`, `xp-menu`, `xp-menu-item`), shared with every
 * other XP menu on the desktop; this component supplies the markup and the behaviour.
 */

export interface MenuAction {
    label: string;
    onSelect: () => void;
    /** Shown right-aligned, e.g. "Ctrl+Z". Display only — the app binds its own shortcuts. */
    shortcut?: string;
    disabled?: boolean;
    /** Present for a toggle; true draws the check. */
    checked?: boolean;
    /** One of a mutually exclusive set: drawn as a dot rather than a check. */
    radio?: boolean;
    /** Status-bar text while highlighted. */
    hint?: string;
    /** The access letter. Defaults to the label's first letter. */
    accessKey?: string;
}

export interface MenuSubmenu {
    label: string;
    items: MenuEntry[];
    disabled?: boolean;
    hint?: string;
    accessKey?: string;
}

/** `null` draws a separator. */
export type MenuEntry = MenuAction | MenuSubmenu | null;

export interface MenuDef {
    label: string;
    items: MenuEntry[];
    accessKey?: string;
}

interface MenuBarProps {
    menus: MenuDef[];
    /** True while this window is the active one; only then do Alt+letter and F10 reach it. */
    active: boolean;
    onHint?: (hint: string | null) => void;
}

const TASKBAR_HEIGHT = 36;
const MENU_Z = 9990;

const isSubmenu = (e: MenuEntry): e is MenuSubmenu => !!e && 'items' in e;
const isLive = (e: MenuEntry): e is MenuAction | MenuSubmenu => !!e && !e.disabled;
const accessOf = (e: { label: string; accessKey?: string }) => (e.accessKey ?? e.label[0] ?? '').toLowerCase();

/** Next live index from `from` in direction `dir`, wrapping; -1 when there is none. */
function step(items: MenuEntry[], from: number, dir: 1 | -1): number {
    const n = items.length;
    for (let k = 1; k <= n; k++) {
        const i = (((from + dir * k) % n) + n) % n;
        if (isLive(items[i])) return i;
    }
    return -1;
}
const firstLive = (items: MenuEntry[]) => step(items, -1, 1);

/** The window a menu bar belongs to: its frame where the window manager marks one, else its parent. */
const windowOf = (bar: HTMLElement | null): HTMLElement | null =>
    bar?.closest<HTMLElement>('[data-window]') ?? bar?.parentElement ?? null;

function AccessLabel({ label, accessKey, show }: { label: string; accessKey?: string; show: boolean }) {
    const key = (accessKey ?? label[0] ?? '').toLowerCase();
    const i = show && key ? label.toLowerCase().indexOf(key) : -1;
    if (i < 0) return <>{label}</>;
    return (
        <>
            {label.slice(0, i)}
            <u>{label[i]}</u>
            {label.slice(i + 1)}
        </>
    );
}

/** A fixed popup beside its anchor, measured after layout and kept inside the viewport. */
function Popup({
    getAnchor,
    side,
    register,
    children,
}: {
    getAnchor: () => HTMLElement | null | undefined;
    side: 'below' | 'right';
    register: (el: HTMLElement | null) => void;
    children: ReactNode;
}) {
    const ref = useRef<HTMLDivElement | null>(null);
    const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

    useLayoutEffect(() => {
        const el = ref.current;
        const anchor = getAnchor();
        if (!el || !anchor) return;
        const a = anchor.getBoundingClientRect();
        const w = el.offsetWidth;
        const h = el.offsetHeight;
        const maxX = window.innerWidth - 2;
        const maxY = window.innerHeight - TASKBAR_HEIGHT;
        let left: number;
        let top: number;
        if (side === 'below') {
            left = Math.min(a.left, maxX - w);
            top = a.bottom + h <= maxY ? a.bottom : Math.max(0, a.top - h);
        } else {
            // Submenus open to the right, overlapping the parent by a few pixels, and flip left
            // when there is no room — as XP's did.
            left = a.right - 3 + w <= maxX ? a.right - 3 : Math.max(0, a.left - w + 3);
            top = Math.max(0, Math.min(a.top - 3, maxY - h));
        }
        setPos({ left: Math.max(0, left), top });
        // Measured once per mount: menus close on resize, so the anchor cannot move under them.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return createPortal(
        <div
            ref={(el) => {
                ref.current = el;
                register(el);
            }}
            role="menu"
            // Keep focus on the menu bar, so the keyboard keeps driving the menu after a click.
            onMouseDown={(e) => e.preventDefault()}
            onContextMenu={(e) => e.preventDefault()}
            className="xp-menu fixed"
            style={{ left: pos?.left ?? 0, top: pos?.top ?? 0, visibility: pos ? 'visible' : 'hidden', zIndex: MENU_Z }}
        >
            {children}
        </div>,
        document.body,
    );
}

export default function MenuBar({ menus, active, onHint }: MenuBarProps) {
    const [open, setOpen] = useState<number | null>(null);
    /** Highlighted index at each depth of the open menu; -1 means nothing highlighted there. */
    const [path, setPath] = useState<number[]>([]);
    /** Keyboard mode: shows access-key underlines, as XP did only after Alt. */
    const [keys, setKeys] = useState(false);
    const [altHeld, setAltHeld] = useState(false);

    const barRef = useRef<HTMLDivElement>(null);
    const titleRefs = useRef<(HTMLButtonElement | null)[]>([]);
    const itemRefs = useRef(new Map<string, HTMLElement>());
    const popups = useRef(new Set<HTMLElement>());
    const restoreFocus = useRef<HTMLElement | null>(null);

    // Latest values for listeners that are registered once.
    const menusRef = useRef(menus);
    menusRef.current = menus;
    const onHintRef = useRef(onHint);
    onHintRef.current = onHint;
    const openRef = useRef(open);
    openRef.current = open;

    const register = (el: HTMLElement | null) => {
        if (el) popups.current.add(el);
        // Detached popups are pruned on the next open; a stale entry only widens "inside".
    };

    const openMenu = (i: number, viaKeyboard: boolean) => {
        if (openRef.current === null) {
            const current = document.activeElement;
            restoreFocus.current = current instanceof HTMLElement && !barRef.current?.contains(current) ? current : null;
            popups.current.clear();
        }
        setOpen(i);
        setPath([viaKeyboard ? firstLive(menusRef.current[i].items) : -1]);
        setKeys(viaKeyboard);
        barRef.current?.focus({ preventScroll: true });
    };

    const close = (restore: boolean) => {
        setOpen(null);
        setPath([]);
        setKeys(false);
        onHintRef.current?.(null);
        if (restore) restoreFocus.current?.focus({ preventScroll: true });
        restoreFocus.current = null;
    };

    const activate = (entry: MenuAction) => {
        close(true);
        entry.onSelect();
    };

    /** The entries shown at `depth` of the open menu. */
    const itemsAt = (depth: number): MenuEntry[] => {
        if (open === null) return [];
        let items = menus[open]?.items ?? [];
        for (let d = 0; d < depth; d++) {
            const e = items[path[d]];
            if (!isSubmenu(e)) return [];
            items = e.items;
        }
        return items;
    };

    // Report the highlighted item's hint.
    useEffect(() => {
        if (open === null) return;
        const depth = path.length - 1;
        const entry = depth >= 0 ? itemsAt(depth)[path[depth]] : undefined;
        onHintRef.current?.(entry?.hint ?? null);
        // `itemsAt` reads only `open`, `path` and `menus`.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, path]);

    // Close when the window stops being the active one, or the viewport changes under the menu.
    useEffect(() => {
        if (!active && openRef.current !== null) close(false);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [active]);

    useEffect(() => {
        if (open === null) return;
        const onDown = (e: PointerEvent) => {
            const target = e.target as Node;
            if (barRef.current?.contains(target)) return;
            for (const p of Array.from(popups.current)) if (p.isConnected && p.contains(target)) return;
            // XP swallowed the click that dismissed a menu when it landed in the same window.
            if (windowOf(barRef.current)?.contains(target)) {
                e.preventDefault();
                e.stopPropagation();
            }
            close(false);
        };
        const onResize = () => close(false);
        document.addEventListener('pointerdown', onDown, true);
        window.addEventListener('resize', onResize);
        window.addEventListener('blur', onResize);
        return () => {
            document.removeEventListener('pointerdown', onDown, true);
            window.removeEventListener('resize', onResize);
            window.removeEventListener('blur', onResize);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open]);

    // Alt+letter and F10 open a menu, but only in the active window.
    useEffect(() => {
        if (!active) {
            setAltHeld(false);
            return;
        }
        const onKeyDown = (e: KeyboardEvent) => {
            // Only keys aimed at this window: not ones typed into the Run box or another surface
            // that happens to have focus while this window is the active one.
            const target = e.target as Node | null;
            const root = windowOf(barRef.current);
            if (target && target !== document.body && root && !root.contains(target)) return;
            if (e.key === 'Alt') setAltHeld(true);
            if (e.defaultPrevented || openRef.current !== null) return;
            if (e.key === 'F10' && !e.shiftKey && !e.ctrlKey && !e.altKey && menusRef.current.length) {
                e.preventDefault();
                openMenu(0, true);
                return;
            }
            if (e.altKey && !e.ctrlKey && !e.metaKey && e.code.startsWith('Key')) {
                const letter = e.code.slice(3).toLowerCase();
                const i = menusRef.current.findIndex((m) => accessOf(m) === letter);
                if (i >= 0) {
                    e.preventDefault();
                    openMenu(i, true);
                }
            }
        };
        const onKeyUp = (e: KeyboardEvent) => {
            if (e.key === 'Alt') setAltHeld(false);
        };
        const onBlur = () => setAltHeld(false);
        window.addEventListener('keydown', onKeyDown);
        window.addEventListener('keyup', onKeyUp);
        window.addEventListener('blur', onBlur);
        return () => {
            window.removeEventListener('keydown', onKeyDown);
            window.removeEventListener('keyup', onKeyUp);
            window.removeEventListener('blur', onBlur);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [active]);

    const onKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
        if (open === null) return;
        // While a menu is open it owns the keyboard: nothing reaches the app or the desktop.
        e.stopPropagation();
        const depth = Math.max(0, path.length - 1);
        const items = itemsAt(depth);
        const cur = path[depth] ?? -1;
        const setAt = (d: number, i: number) => setPath([...path.slice(0, d), i]);
        const switchMenu = (dir: 1 | -1) => {
            const n = (open + dir + menus.length) % menus.length;
            setOpen(n);
            setPath([firstLive(menus[n].items)]);
        };

        if (e.altKey && e.code.startsWith('Key')) {
            const i = menus.findIndex((m) => accessOf(m) === e.code.slice(3).toLowerCase());
            if (i >= 0) {
                e.preventDefault();
                openMenu(i, true);
            }
            return;
        }

        switch (e.key) {
            case 'ArrowDown':
            case 'ArrowUp': {
                e.preventDefault();
                setKeys(true);
                setAt(depth, step(items, cur, e.key === 'ArrowDown' ? 1 : -1));
                return;
            }
            case 'Home':
            case 'End': {
                e.preventDefault();
                setKeys(true);
                setAt(depth, e.key === 'Home' ? firstLive(items) : step(items, 0, -1));
                return;
            }
            case 'ArrowRight': {
                e.preventDefault();
                setKeys(true);
                const entry = items[cur];
                if (isSubmenu(entry) && !entry.disabled) setPath([...path.slice(0, depth + 1), firstLive(entry.items)]);
                else switchMenu(1);
                return;
            }
            case 'ArrowLeft': {
                e.preventDefault();
                setKeys(true);
                if (depth > 0) setPath(path.slice(0, depth));
                else switchMenu(-1);
                return;
            }
            case 'Enter':
            case ' ': {
                e.preventDefault();
                const entry = items[cur];
                if (!isLive(entry)) return;
                if (isSubmenu(entry)) setPath([...path.slice(0, depth + 1), firstLive(entry.items)]);
                else activate(entry);
                return;
            }
            case 'Escape': {
                e.preventDefault();
                if (depth > 0) setPath(path.slice(0, depth));
                else close(true);
                return;
            }
            case 'Tab': {
                e.preventDefault();
                close(true);
                return;
            }
        }

        if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) {
            const letter = e.key.toLowerCase();
            const i = items.findIndex((it) => isLive(it) && accessOf(it) === letter);
            if (i < 0) return;
            e.preventDefault();
            const entry = items[i];
            if (isSubmenu(entry)) setPath([...path.slice(0, depth), i, firstLive(entry.items)]);
            else if (entry) activate(entry);
        }
    };

    const renderItems = (items: MenuEntry[], depth: number, keyPrefix: string): ReactNode =>
        items.map((entry, i) => {
            if (entry === null) {
                return <div key={`sep-${i}`} role="separator" className="xp-menu-sep" />;
            }
            const key = `${keyPrefix}${i}`;
            const sub = isSubmenu(entry);
            const lit = path[depth] === i;
            const disabled = !!entry.disabled;
            const action = sub ? null : (entry as MenuAction);
            const role = action?.radio ? 'menuitemradio' : action?.checked !== undefined ? 'menuitemcheckbox' : 'menuitem';
            return (
                <div key={key} className="relative">
                    <button
                        type="button"
                        tabIndex={-1}
                        ref={(el) => {
                            if (el) itemRefs.current.set(key, el);
                            else itemRefs.current.delete(key);
                        }}
                        role={role}
                        aria-checked={role === 'menuitem' ? undefined : !!action?.checked}
                        aria-disabled={disabled || undefined}
                        aria-haspopup={sub ? 'menu' : undefined}
                        aria-expanded={sub ? lit : undefined}
                        onPointerEnter={() => {
                            if (disabled) return;
                            setPath([...path.slice(0, depth), i]);
                        }}
                        onClick={() => {
                            if (disabled) return;
                            if (sub) setPath([...path.slice(0, depth), i, firstLive(entry.items)]);
                            else if (action) activate(action);
                        }}
                        // Ticks, radio dots and the submenu arrow are drawn by `app/luna.css` from
                        // `aria-checked`, the role and `has-submenu`.
                        className={`xp-menu-item${lit && !disabled ? ' is-active' : ''}${sub ? ' has-submenu' : ''}`}
                    >
                        <span>
                            <AccessLabel label={entry.label} accessKey={entry.accessKey} show={keys} />
                        </span>
                        {action?.shortcut && <span className="xp-menu-accel">{action.shortcut}</span>}
                    </button>
                    {sub && lit && !disabled && (
                        <Popup side="right" getAnchor={() => itemRefs.current.get(key)} register={register}>
                            {renderItems(entry.items, depth + 1, `${key}.`)}
                        </Popup>
                    )}
                </div>
            );
        });

    return (
        <div
            ref={barRef}
            role="menubar"
            tabIndex={-1}
            onKeyDown={onKeyDown}
            className="xp-menubar relative shrink-0 outline-none"
        >
            {menus.map((m, i) => (
                <div key={m.label} className="flex">
                    <button
                        type="button"
                        tabIndex={-1}
                        ref={(el) => {
                            titleRefs.current[i] = el;
                        }}
                        role="menuitem"
                        aria-haspopup="menu"
                        aria-expanded={open === i}
                        onPointerDown={(e) => {
                            if (e.button !== 0) return;
                            e.preventDefault();
                            if (open === i) close(true);
                            else openMenu(i, false);
                        }}
                        onPointerEnter={() => {
                            if (open !== null && open !== i) {
                                setOpen(i);
                                setPath([-1]);
                            }
                        }}
                        className={`xp-menubar-item${open === i ? ' is-open' : ''}`}
                    >
                        <AccessLabel label={m.label} accessKey={m.accessKey} show={keys || altHeld} />
                    </button>
                    {open === i && (
                        <Popup side="below" getAnchor={() => titleRefs.current[i]} register={register}>
                            {renderItems(m.items, 0, `${i}:`)}
                        </Popup>
                    )}
                </div>
            ))}
        </div>
    );
}
