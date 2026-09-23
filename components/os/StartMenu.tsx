"use client";

import { useSystemStore, type WindowPayload } from '@/store/useSystemStore';
import { APPS, CATEGORY_LABELS, appList, type AppConfig } from '@/constants/apps';
import { motion } from 'framer-motion';
import { useState, useRef, useEffect } from 'react';
import { LINKS, PROFILE } from '@/content';
import ContextMenu, { isInsideMenu, type MenuItem } from '@/components/ui/ContextMenu';
import XpIcon from '@/components/ui/XpIcon';
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

type Flyout = { kind: 'programs' | 'connect'; x: number; y: number };

/**
 * The XP Start menu, laid out as XP laid it out: the user's picture and name over the orange rule;
 * pinned and most-used programs on the white left; bold system places on the blue right; Log Off
 * and Turn Off Computer along the bottom.
 */
export default function StartMenu({ onClose, triggerRef, onOpenRun, onExit }: StartMenuProps) {
    const actions = useSystemStore((s) => s.actions);
    const menuRef = useRef<HTMLDivElement>(null);
    const [flyout, setFlyout] = useState<Flyout | null>(null);
    const hoverTimer = useRef<number>();

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
            if (e.key === 'Escape') onClose();
        };
        document.addEventListener('mousedown', onMouseDown);
        document.addEventListener('keydown', onKeyDown);
        return () => {
            document.removeEventListener('mousedown', onMouseDown);
            document.removeEventListener('keydown', onKeyDown);
            window.clearTimeout(hoverTimer.current);
        };
    }, [onClose, triggerRef]);

    const open = (appId: string, payload?: WindowPayload) => {
        const app = APPS[appId];
        if (!app) return;
        actions.openWindow(app.id, app.title, payload);
        onClose();
    };

    /** Hovering any item decides, after a moment, which flyout (if any) should be showing. */
    const hover = (kind: Flyout['kind'] | null, el?: HTMLElement) => {
        window.clearTimeout(hoverTimer.current);
        hoverTimer.current = window.setTimeout(() => {
            if (!kind || !el) return setFlyout(null);
            const r = el.getBoundingClientRect();
            setFlyout(kind === 'programs' ? { kind, x: r.right, y: r.bottom } : { kind, x: r.right - 2, y: r.top - 3 });
        }, FLYOUT_DELAY_MS);
    };

    const toggleFlyout = (kind: Flyout['kind'], el: HTMLElement) => {
        window.clearTimeout(hoverTimer.current);
        if (flyout?.kind === kind) return setFlyout(null);
        const r = el.getBoundingClientRect();
        setFlyout(kind === 'programs' ? { kind, x: r.right, y: r.bottom } : { kind, x: r.right - 2, y: r.top - 3 });
    };

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

    const itemProps = (onClick: () => void) => ({
        type: 'button' as const,
        onClick,
        onMouseEnter: () => hover(null),
    });

    return (
        <motion.div
            ref={menuRef}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.12, ease: 'easeOut' }}
            className="xp-startmenu max-h-[calc(100dvh-var(--xp-taskbar-h))] overflow-y-auto sm:overflow-visible"
            role="group"
            aria-label="Start menu"
        >
            <div className="xp-startmenu-header">
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
                            <button key={id} className="xp-startmenu-item" {...itemProps(() => open(id))}>
                                {app.iconAsset && <XpIcon src={app.iconAsset} size={32} />}
                                <span>
                                    <b>{shortcutName(app.title)}</b>
                                    <small>{subtitle}</small>
                                </span>
                            </button>
                        );
                    })}
                    <div className="xp-startmenu-sep" />
                    {MOST_USED.map((id) => {
                        const app = APPS[id];
                        if (!app) return null;
                        return (
                            <button key={id} className="xp-startmenu-item" {...itemProps(() => open(id))}>
                                {app.iconAsset && <XpIcon src={app.iconAsset} size={32} />}
                                <span>{shortcutName(app.title)}</span>
                            </button>
                        );
                    })}

                    <div className="mt-auto pt-2">
                        <div className="xp-startmenu-sep" />
                        <button
                            type="button"
                            className={`xp-startmenu-allprograms${flyout?.kind === 'programs' ? ' is-active' : ''}`}
                            aria-haspopup="menu"
                            aria-expanded={flyout?.kind === 'programs'}
                            onMouseEnter={(e) => hover('programs', e.currentTarget)}
                            onClick={(e) => toggleFlyout('programs', e.currentTarget)}
                        >
                            All Programs
                            <i aria-hidden />
                        </button>
                    </div>
                </div>

                <div className="xp-startmenu-right w-full sm:w-1/2">
                    <button className="xp-startmenu-item is-place" {...itemProps(() => open('explorer', { path: '/home/guest/My Documents' }))}>
                        <XpIcon src="/icons/documents.png" size={24} />
                        My Documents
                    </button>
                    <button className="xp-startmenu-item is-place" {...itemProps(() => open('explorer', { path: '/home/guest/My Pictures' }))}>
                        <XpIcon src="/icons/xp/my-pictures.png" size={24} />
                        My Pictures
                    </button>
                    <button className="xp-startmenu-item is-place" {...itemProps(() => open('music'))}>
                        <XpIcon src="/icons/music.png" size={24} />
                        My Music
                    </button>
                    <button className="xp-startmenu-item is-place" {...itemProps(() => open('mycomputer'))}>
                        <XpIcon src="/icons/xp/my-computer.png" size={24} />
                        My Computer
                    </button>

                    <div className="xp-startmenu-sep" />

                    <button className="xp-startmenu-item" {...itemProps(() => open('settings'))}>
                        <XpIcon src="/icons/control-panel.png" size={24} />
                        Control Panel
                    </button>
                    <button
                        type="button"
                        className={`xp-startmenu-item has-submenu${flyout?.kind === 'connect' ? ' is-active' : ''}`}
                        aria-haspopup="menu"
                        aria-expanded={flyout?.kind === 'connect'}
                        onMouseEnter={(e) => hover('connect', e.currentTarget)}
                        onClick={(e) => toggleFlyout('connect', e.currentTarget)}
                    >
                        <XpIcon src="/icons/xp/connect-to.svg" size={24} />
                        Connect To
                    </button>

                    <div className="xp-startmenu-sep" />

                    {/*
                      * Run. XP's own command palette, and the fastest route to anything on this
                      * desktop -- it resolves app names, filesystem paths and URLs.
                      */}
                    <button className="xp-startmenu-item" {...itemProps(() => { onOpenRun(); onClose(); })}>
                        <XpIcon src="/icons/run.png" size={24} />
                        Run...
                    </button>
                </div>
            </div>

            <div className="xp-startmenu-footer">
                <button
                    type="button"
                    className="xp-startmenu-footer-btn"
                    onClick={() => { onClose(); onExit('logoff'); }}
                >
                    <XpIcon src="/icons/xp/log-off.svg" size={22} />
                    Log Off
                </button>
                <button
                    type="button"
                    className="xp-startmenu-footer-btn"
                    onClick={() => { onClose(); onExit('shutdown'); }}
                >
                    <XpIcon src="/icons/xp/turn-off.svg" size={22} />
                    Turn Off Computer
                </button>
            </div>

            <ContextMenu
                x={flyout?.x ?? 0}
                y={flyout?.y ?? 0}
                anchor={flyout?.kind === 'programs' ? 'bottom-left' : 'top-left'}
                isOpen={flyout !== null}
                onClose={() => setFlyout(null)}
                items={flyout?.kind === 'programs' ? programItems : connectItems}
            />
        </motion.div>
    );
}
