"use client";

import { useSystemStore, type WindowPayload } from '@/store/useSystemStore';
import { APPS, CATEGORY_LABELS, appList, type AppConfig } from '@/constants/apps';
import { motion } from 'framer-motion';
import { useState, useRef, useEffect } from 'react';
import { LINKS, PROFILE } from '@/content';
import ContextMenu, { isInsideMenu, type MenuItem } from '@/components/ui/ContextMenu';
import XpIcon from '@/components/ui/XpIcon';
import AccessLabel from '@/components/ui/AccessLabel';
import { shortcutName } from '@/utils/shortcut';

interface StartMenuProps {
    onClose: () => void;
    /** Opens the Run dialog, which the desktop owns. */
    onOpenRun: () => void;
    /** Opens the Log Off / Turn Off Computer dialogs, which the desktop owns. */
    onExit: (kind: 'logoff' | 'shutdown') => void;
    /**
     * The element that opened the menu (the Start button). A mousedown on it is not "outside":
     * the button toggles the menu itself, and closing here first made the toggle re-open it.
     */
    triggerRef?: React.RefObject<HTMLElement>;
    /** Opened from the keyboard: the first item takes focus, and the access keys are underlined. */
    keyboard?: boolean;
}

/** XP opened a flyout after the pointer rested on its item, not instantly. */
const FLYOUT_DELAY_MS = 300;

/** The top of the left column: pinned programs, in bold, with what they are in grey. */
const PINNED: { id: string; subtitle: string }[] = [
    { id: 'projects', subtitle: 'Case studies and code' },
    { id: 'contact', subtitle: 'E-mail' },
];

/** Below the pinned programs XP listed the ones used most. These are the ones worth using most. */
const MOST_USED = ['about', 'skills', 'resume', 'terminal', 'music', 'minesweeper'];

/**
 * All Programs, grouped from the registry rather than a hand-written list, so a new app appears
 * here by declaring its category. XP kept system utilities under Accessories > System Tools; they
 * get a group of their own here because there are several.
 */
const PROGRAM_GROUPS: { title: string; apps: AppConfig[] }[] = (['accessory', 'game', 'portfolio', 'system'] as const)
    .map((category) => ({
        title: category === 'system' ? 'System Tools' : CATEGORY_LABELS[category],
        apps: appList().filter((a) => a.category === category && a.surfaces.includes('start')),
    }))
    .filter((g) => g.apps.length > 0);

/** Links that open outside the desktop, under XP's own "Connect To". URLs come from `@/content`. */
const CONNECTIONS = LINKS.filter((l) => l.known);

type Flyout = { kind: 'programs' | 'connect'; x: number; y: number; keyboard: boolean };

/*
 * The keyboard. The arrows move within the white left side, the blue right side and the footer;
 * Left and Right cross between the sides at the same height, and each side runs down into its own
 * footer button (Log Off under the left, Turn Off Computer under the right). Right on All Programs
 * or Connect To opens the flyout with its first item selected. A letter selects the item that
 * underlines it (XP's L, U, R and P), which answers before any item that merely begins with it;
 * otherwise the items it begins. A letter only one item answers to opens that item, so "Start, U, U"
 * turns the computer off, as it did in XP, and R opens Run. The menu takes only keys aimed at it,
 * its Start button or nothing, and closes when focus moves elsewhere.
 */
type Column = 'left' | 'right' | 'foot';

/** The menu as the keyboard sees it, read from the DOM at each key press, as it is laid out now. */
function columnsOf(root: HTMLElement): Record<Column, HTMLElement[]> {
    const pick = (c: Column) => Array.from(root.querySelectorAll<HTMLElement>(`[data-sm="${c}"]`));
    return { left: pick('left'), right: pick('right'), foot: pick('foot') };
}

/** The item in `col` level with `from`, for crossing between the sides. */
function levelWith(col: HTMLElement[], from: HTMLElement): HTMLElement | undefined {
    const middle = (el: HTMLElement) => {
        const r = el.getBoundingClientRect();
        return r.top + r.height / 2;
    };
    const at = middle(from);
    return col.reduce<HTMLElement | undefined>(
        (best, el) => (!best || Math.abs(middle(el) - at) < Math.abs(middle(best) - at) ? el : best),
        undefined,
    );
}

/** The items a letter selects: the one that underlines it, or else those whose names begin with it. */
function answering(items: HTMLElement[], letter: string): HTMLElement[] {
    const underlined = items.filter((el) => el.dataset.access === letter);
    if (underlined.length > 0) return underlined;
    return items.filter((el) => !el.dataset.access && (el.dataset.label ?? '').charAt(0).toLowerCase() === letter);
}

/**
 * The XP Start menu, laid out as XP laid it out: the user's picture and name over the orange rule;
 * pinned and most-used programs on the white left; bold system places on the blue right; Log Off
 * and Turn Off Computer along the bottom.
 */
export default function StartMenu({ onClose, triggerRef, onOpenRun, onExit, keyboard = false }: StartMenuProps) {
    const actions = useSystemStore((s) => s.actions);
    const menuRef = useRef<HTMLDivElement>(null);
    const [flyout, setFlyout] = useState<Flyout | null>(null);
    const hoverTimer = useRef<number>();
    // XP hid the underlined letters until the keyboard was in use.
    const [cues, setCues] = useState(keyboard);
    // The item a keyboard-opened flyout returns to when Left or Escape closes it.
    const flyoutOpener = useRef<HTMLElement | null>(null);
    // The kind of flyout last shown. All Programs and Connect To are separate menus (it is the menu's
    // key), so one never inherits the other's selection, keyboard or return target; it is kept while
    // a flyout closes, so the closing one still fades out.
    const [shownKind, setShownKind] = useState<Flyout['kind']>('programs');
    if (flyout && flyout.kind !== shownKind) setShownKind(flyout.kind);
    // The flyout as it is now, for the hover timer, whose callback outlives the render that set it.
    const flyoutNow = useRef(flyout);
    flyoutNow.current = flyout;
    // Who holds the selection: the keyboard (and the item under a resting pointer is not lit) or the mouse.
    const [nav, setNav] = useState<'keys' | 'pointer'>(keyboard ? 'keys' : 'pointer');

    useEffect(() => {
        const onMouseDown = (e: MouseEvent) => {
            const target = e.target as Node;
            if (menuRef.current?.contains(target)) return;
            if (triggerRef?.current?.contains(target)) return;
            // The flyouts are portaled; a click inside one is a click inside the Start menu.
            if (isInsideMenu(e.target)) return;
            onClose();
        };
        const onKeyDown = (e: KeyboardEvent) => {
            // A chord is not this Escape: Ctrl+Shift+Esc still reaches the desktop (Task Manager).
            if (e.key !== 'Escape' || e.ctrlKey || e.shiftKey || e.altKey || e.metaKey) return;
            // Only the menu closes: not the desktop's own Escape, which would also deselect its icons.
            e.stopPropagation();
            onClose();
            // Back to the Start button, where the keyboard was before the menu opened.
            triggerRef?.current?.focus({ preventScroll: true });
        };
        // Focus moving anywhere else (Tab into a window, a click on a focusable control) closes it.
        const onFocusIn = (e: FocusEvent) => {
            const target = e.target as Node;
            if (menuRef.current?.contains(target) || triggerRef?.current?.contains(target) || isInsideMenu(e.target)) return;
            onClose();
        };
        document.addEventListener('mousedown', onMouseDown);
        document.addEventListener('keydown', onKeyDown);
        document.addEventListener('focusin', onFocusIn);
        return () => {
            document.removeEventListener('mousedown', onMouseDown);
            document.removeEventListener('keydown', onKeyDown);
            document.removeEventListener('focusin', onFocusIn);
            window.clearTimeout(hoverTimer.current);
        };
    }, [onClose, triggerRef]);

    // Opened from the keyboard, the menu starts on its first item.
    useEffect(() => {
        if (keyboard) menuRef.current?.querySelector<HTMLElement>('[data-sm="left"]')?.focus({ preventScroll: true });
    }, [keyboard]);

    const open = (appId: string, payload?: WindowPayload) => {
        const app = APPS[appId];
        if (!app) return;
        actions.openWindow(app.id, app.title, payload);
        onClose();
    };

    const openFlyout = (el: HTMLElement, byKeyboard: boolean) => {
        window.clearTimeout(hoverTimer.current);
        const kind = el.dataset.flyout as Flyout['kind'];
        // The pointer resting on the opener of the flyout already open leaves it as it is: a keyboard
        // flyout reopened as a pointer one stopped answering Left.
        if (!byKeyboard && flyoutNow.current?.kind === kind) return;
        const r = el.getBoundingClientRect();
        flyoutOpener.current = byKeyboard ? el : null;
        setFlyout(
            kind === 'programs'
                ? { kind, x: r.right, y: r.bottom, keyboard: byKeyboard }
                : { kind, x: r.right - 2, y: r.top - 3, keyboard: byKeyboard },
        );
    };

    /** Hovering any item decides, after a moment, which flyout (if any) should be showing. */
    const hover = (el?: HTMLElement) => {
        window.clearTimeout(hoverTimer.current);
        hoverTimer.current = window.setTimeout(() => {
            if (el) openFlyout(el, false);
            else setFlyout(null);
        }, FLYOUT_DELAY_MS);
    };

    /** A click on All Programs or Connect To; one from the keyboard opens the flyout for the keyboard. */
    const toggleFlyout = (e: React.MouseEvent<HTMLElement>) => {
        window.clearTimeout(hoverTimer.current);
        if (flyout?.kind === e.currentTarget.dataset.flyout) return setFlyout(null);
        openFlyout(e.currentTarget, e.detail === 0);
    };

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            // An open flyout has the keyboard: it swallows the keys it handles, and the rest wait.
            if (flyout) return;
            const root = menuRef.current;
            if (!root || e.ctrlKey || e.metaKey || e.altKey) return;
            // Only keys aimed at the menu, its Start button, or nothing at all.
            const focused = document.activeElement;
            const aimed = !focused || focused === document.body || root.contains(focused) || !!triggerRef?.current?.contains(focused);
            if (!aimed) return;
            // A held key repeats: a held U must not go on through the Turn Off dialog, nor a held
            // Enter from the Start button into the first program.
            if (e.repeat && (e.key === 'Enter' || e.key === ' ' || /^[a-z0-9]$/i.test(e.key))) {
                e.preventDefault();
                e.stopPropagation();
                return;
            }
            const cols = columnsOf(root);
            const current = focused instanceof HTMLElement && root.contains(focused) && focused.dataset.sm ? focused : null;
            const col = current?.dataset.sm as Column | undefined;
            const list = col ? cols[col] : [];
            const i = current ? list.indexOf(current) : -1;
            const footUnder = (side: Column) => (side === 'right' ? cols.foot[cols.foot.length - 1] : cols.foot[0]);
            const sideOver = (el: HTMLElement) => cols[el === cols.foot[0] ? 'left' : 'right'];
            const activate = (el: HTMLElement) => (el.dataset.flyout ? openFlyout(el, true) : el.click());

            let next: HTMLElement | undefined;
            let handled = true;
            if (!current && e.key.startsWith('Arrow')) {
                next = cols.left[0];
            } else if (e.key === 'ArrowDown' && current && col) {
                next = col === 'foot' ? sideOver(current)[0] : list[i + 1] ?? footUnder(col);
            } else if (e.key === 'ArrowUp' && current && col) {
                if (col === 'foot') {
                    const side = sideOver(current);
                    next = side[side.length - 1];
                } else next = i > 0 ? list[i - 1] : footUnder(col);
            } else if (e.key === 'ArrowRight' && current && col) {
                if (current.dataset.flyout) activate(current);
                else next = col === 'left' ? levelWith(cols.right, current) : col === 'foot' ? cols.foot[i + 1] : undefined;
            } else if (e.key === 'ArrowLeft' && current && col) {
                next = col === 'right' ? levelWith(cols.left, current) : col === 'foot' ? cols.foot[i - 1] : undefined;
            } else if (e.key === 'Home' || e.key === 'End') {
                const side = col && col !== 'foot' ? list : cols.left;
                next = e.key === 'Home' ? side[0] : side[side.length - 1];
            } else if (/^[a-z0-9]$/i.test(e.key)) {
                const matches = answering([...cols.left, ...cols.right, ...cols.foot], e.key.toLowerCase());
                if (matches.length === 1) activate(matches[0]);
                else if (matches.length > 1) next = matches[(matches.indexOf(current as HTMLElement) + 1) % matches.length];
                else handled = false;
            } else {
                handled = false;
            }
            if (!handled) return;
            e.preventDefault();
            e.stopPropagation();
            setCues(true);
            setNav('keys');
            next?.focus({ preventScroll: true });
        };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    });

    const programItems: MenuItem[] = PROGRAM_GROUPS.map((group) => ({
        label: group.title,
        icon: <XpIcon src="/icons/xp/folder-closed.png" size={16} />,
        items: group.apps.map((a) => ({
            label: shortcutName(a.title),
            icon: a.iconAsset ? <XpIcon src={a.iconAsset} size={16} /> : <a.icon size={14} />,
            action: () => open(a.id),
        })),
    }));

    const connectItems: MenuItem[] = CONNECTIONS.map((l) => ({
        label: l.label === 'Email' ? 'E-mail' : l.label,
        icon: <XpIcon src={l.label === 'Email' ? '/icons/xp/phone.png' : '/icons/xp/connect-to.svg'} size={16} />,
        action: () => {
            // E-mail goes to the Contact window, which validates and hands off to the mail client.
            if (l.label === 'Email') return open('contact');
            window.open(l.url, '_blank', 'noopener,noreferrer');
            onClose();
        },
    }));

    /**
     * Pointing at an item makes it the selection: it takes focus if the keyboard is already in the menu
     * or in one of its flyouts. A flyout the keyboard opened gives way at once (unless the item is its
     * own opener): left open for the hover delay, it went on taking Enter and the arrows while focus
     * and the highlight were on the item pointed at, so Enter launched a program under Log Off.
     */
    const point = (el: HTMLElement) => {
        const focused = document.activeElement;
        const fromFlyout = isInsideMenu(focused);
        if (!menuRef.current?.contains(focused) && !fromFlyout) return;
        el.focus({ preventScroll: true });
        if (fromFlyout && el.dataset.flyout !== flyoutNow.current?.kind) setFlyout(null);
    };

    /** The pointer arriving on an item: it becomes the selection, and the flyouts follow it. */
    const arrive = (el: HTMLElement) => {
        point(el);
        hover(el.dataset.flyout ? el : undefined);
    };

    /** A plain item: where it sits for the arrows, and the name its first letter is taken from. */
    const itemProps = (onClick: () => void, column: Column, label: string) => ({
        type: 'button' as const,
        role: 'menuitem' as const,
        onClick,
        onMouseEnter: (e: React.MouseEvent<HTMLElement>) => arrive(e.currentTarget),
        'data-sm': column,
        'data-label': label,
    });

    return (
        <motion.div
            ref={menuRef}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.12, ease: 'easeOut' }}
            className="xp-startmenu max-h-[calc(100dvh-var(--xp-taskbar-h))] overflow-y-auto sm:overflow-visible"
            role="menu"
            aria-label="Start menu"
            data-nav={nav}
            onMouseOver={(e) => {
                // The pointer arriving in a flyout (portaled, but its events bubble here) cancels a close
                // that brushing another item on the way had started.
                if (isInsideMenu(e.target)) window.clearTimeout(hoverTimer.current);
            }}
            onMouseMove={(e) => {
                if (nav !== 'keys') return;
                // The mouse takes the selection back: the item under it becomes the one selection,
                // even if the pointer has not left it since the keyboard moved on.
                setNav('pointer');
                const item = (e.target as Element).closest<HTMLElement>('[data-sm]');
                if (item) arrive(item);
            }}
        >
            <div className="xp-startmenu-header" role="none">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/profile.jpg" alt={PROFILE.name} className="xp-startmenu-avatar" draggable={false} />
                <span className="xp-startmenu-user">{PROFILE.name}</span>
            </div>
            <div className="xp-startmenu-rule" />

            <div className="xp-startmenu-body flex-col sm:flex-row">
                <div className="xp-startmenu-left w-full sm:w-1/2">
                    {PINNED.map(({ id, subtitle }) => {
                        const app = APPS[id];
                        if (!app) return null;
                        return (
                            <button key={id} className="xp-startmenu-item" {...itemProps(() => open(id), 'left', shortcutName(app.title))}>
                                {app.iconAsset && <XpIcon src={app.iconAsset} size={32} />}
                                <span>
                                    <b>{shortcutName(app.title)}</b>
                                    <small>{subtitle}</small>
                                </span>
                            </button>
                        );
                    })}
                    <div className="xp-startmenu-sep" role="separator" />
                    {MOST_USED.map((id) => {
                        const app = APPS[id];
                        if (!app) return null;
                        return (
                            <button key={id} className="xp-startmenu-item" {...itemProps(() => open(id), 'left', shortcutName(app.title))}>
                                {app.iconAsset && <XpIcon src={app.iconAsset} size={32} />}
                                <span>{shortcutName(app.title)}</span>
                            </button>
                        );
                    })}

                    <div className="mt-auto pt-2">
                        <div className="xp-startmenu-sep" role="separator" />
                        <button
                            type="button"
                            className={`xp-startmenu-allprograms${flyout?.kind === 'programs' ? ' is-active' : ''}`}
                            role="menuitem"
                            aria-haspopup="menu"
                            aria-expanded={flyout?.kind === 'programs'}
                            data-sm="left"
                            data-flyout="programs"
                            data-label="All Programs"
                            data-access="p"
                            onMouseEnter={(e) => arrive(e.currentTarget)}
                            onClick={toggleFlyout}
                        >
                            <AccessLabel text="All Programs" accessKey="P" show={cues} />
                            <i aria-hidden />
                        </button>
                    </div>
                </div>

                <div className="xp-startmenu-right w-full sm:w-1/2">
                    <button className="xp-startmenu-item is-place" {...itemProps(() => open('explorer', { path: '/home/guest/My Documents' }), 'right', 'My Documents')}>
                        <XpIcon src="/icons/xp/my-documents.png" size={24} />
                        My Documents
                    </button>
                    <button className="xp-startmenu-item is-place" {...itemProps(() => open('explorer', { path: '/home/guest/My Pictures' }), 'right', 'My Pictures')}>
                        <XpIcon src="/icons/xp/my-pictures.png" size={24} />
                        My Pictures
                    </button>
                    <button className="xp-startmenu-item is-place" {...itemProps(() => open('music'), 'right', 'My Music')}>
                        <XpIcon src="/icons/xp/my-music.png" size={24} />
                        My Music
                    </button>
                    <button className="xp-startmenu-item is-place" {...itemProps(() => open('mycomputer'), 'right', 'My Computer')}>
                        <XpIcon src="/icons/xp/my-computer.png" size={24} />
                        My Computer
                    </button>

                    <div className="xp-startmenu-sep" role="separator" />

                    <button className="xp-startmenu-item" {...itemProps(() => open('settings'), 'right', 'Control Panel')}>
                        <XpIcon src="/icons/xp/control-panel.png" size={24} />
                        Control Panel
                    </button>
                    <button
                        type="button"
                        className={`xp-startmenu-item has-submenu${flyout?.kind === 'connect' ? ' is-active' : ''}`}
                        role="menuitem"
                        aria-haspopup="menu"
                        aria-expanded={flyout?.kind === 'connect'}
                        data-sm="right"
                        data-flyout="connect"
                        data-label="Connect To"
                        onMouseEnter={(e) => arrive(e.currentTarget)}
                        onClick={toggleFlyout}
                    >
                        <XpIcon src="/icons/xp/connect-to.svg" size={24} />
                        Connect To
                    </button>

                    <div className="xp-startmenu-sep" role="separator" />

                    {/*
                      * Run. XP's own command palette, and the fastest route to anything on this
                      * desktop -- it resolves app names, filesystem paths and URLs.
                      */}
                    <button
                        className="xp-startmenu-item"
                        {...itemProps(() => { onOpenRun(); onClose(); }, 'right', 'Run...')}
                        data-access="r"
                    >
                        <XpIcon src="/icons/xp/run.png" size={24} />
                        <AccessLabel text="Run..." accessKey="R" show={cues} />
                    </button>
                </div>
            </div>

            <div className="xp-startmenu-footer">
                <button
                    type="button"
                    className="xp-startmenu-footer-btn"
                    role="menuitem"
                    data-sm="foot"
                    onMouseEnter={(e) => arrive(e.currentTarget)}
                    data-label="Log Off"
                    data-access="l"
                    onClick={() => { onClose(); onExit('logoff'); }}
                >
                    <XpIcon src="/icons/xp/log-off.svg" size={22} />
                    <AccessLabel text="Log Off" accessKey="L" show={cues} />
                </button>
                <button
                    type="button"
                    className="xp-startmenu-footer-btn"
                    role="menuitem"
                    data-sm="foot"
                    onMouseEnter={(e) => arrive(e.currentTarget)}
                    data-label="Turn Off Computer"
                    data-access="u"
                    onClick={() => { onClose(); onExit('shutdown'); }}
                >
                    <XpIcon src="/icons/xp/turn-off.svg" size={22} />
                    <AccessLabel text="Turn Off Computer" accessKey="U" show={cues} />
                </button>
            </div>

            <ContextMenu
                menuKey={shownKind}
                x={flyout?.x ?? 0}
                y={flyout?.y ?? 0}
                anchor={shownKind === 'programs' ? 'bottom-left' : 'top-left'}
                isOpen={flyout !== null}
                onClose={() => setFlyout(null)}
                onBack={flyout?.keyboard ? () => {
                    setFlyout(null);
                    flyoutOpener.current?.focus({ preventScroll: true });
                } : undefined}
                items={shownKind === 'programs' ? programItems : connectItems}
            />
        </motion.div>
    );
}
