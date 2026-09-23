"use client";

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useSystemStore } from '@/store/useSystemStore';
import { SYSTEM } from '@/content';
import { playSound } from '@/utils/sound';
import { requestRestart } from './power';

export type ExitKind = 'logoff' | 'shutdown';

interface ExitWindowsProps {
    kind: ExitKind;
    onCancel: () => void;
    /** Stand By: the caller darkens the screen until the visitor moves the mouse or types. */
    onStandBy: () => void;
    /** Switch User: back to the Welcome screen, session kept. Omit where there is no session. */
    onSwitchUser?: () => void;
    /** Log Off: the caller shows "Saving your settings..." and ends the session. */
    onLogOff?: () => void;
    /**
     * Turn Off / Restart where a session is running: the caller closes this dialog and asks each
     * window with unsaved work first. Omitted on the Welcome screen, where nothing is open.
     */
    onTurnOff?: (restart: boolean) => void;
}

interface ExitButton {
    id: string;
    label: string;
    /** XP's access key: the underlined letter, which also works as a keyboard shortcut. */
    key: string;
    icon: string;
    tip: string;
    act: () => void;
}

const TIP_DELAY_MS = 400;

/**
 * XP's "Turn off computer" and "Log Off Windows" dialogs.
 *
 * Both appear over a screen that slowly drains to grey — the most recognisable thing XP ever did
 * while waiting for an answer. Every button does what it says: Stand By darkens the screen until
 * the visitor moves the mouse, Turn Off and Restart run the real shutdown sequence, Switch User
 * returns to the Welcome screen with every window kept, and Log Off ends the session.
 */
export default function ExitWindows({ kind, onCancel, onStandBy, onSwitchUser, onLogOff, onTurnOff }: ExitWindowsProps) {
    const actions = useSystemStore((s) => s.actions);
    const ref = useRef<HTMLDivElement>(null);
    const [tip, setTip] = useState<string | null>(null);
    const tipTimer = useRef<number>();
    const [mounted, setMounted] = useState(false);

    const buttons: ExitButton[] =
        kind === 'shutdown'
            ? [
                {
                    id: 'standby',
                    label: 'Stand By',
                    key: 'S',
                    icon: '/icons/xp/stand-by.svg',
                    tip: 'Turns the screen off. Move the mouse or press a key to come back exactly where you were.',
                    act: onStandBy,
                },
                {
                    id: 'off',
                    label: 'Turn Off',
                    key: 'U',
                    icon: '/icons/xp/turn-off.svg',
                    tip: `Shuts down ${SYSTEM.name}. It starts again from the power button.`,
                    act: () => {
                        if (onTurnOff) return onTurnOff(false);
                        playSound('shutdown');
                        actions.shutdown();
                    },
                },
                {
                    id: 'restart',
                    label: 'Restart',
                    key: 'R',
                    icon: '/icons/xp/restart.svg',
                    tip: `Shuts down ${SYSTEM.name} and then starts it again.`,
                    act: () => {
                        if (onTurnOff) return onTurnOff(true);
                        requestRestart();
                        playSound('shutdown');
                        actions.shutdown();
                    },
                },
            ]
            : [
                ...(onSwitchUser
                    ? [{
                        id: 'switch',
                        label: 'Switch User',
                        key: 'S',
                        icon: '/icons/xp/switch-user.svg',
                        tip: 'Returns to the Welcome screen. Your programs stay open, just as you left them.',
                        act: onSwitchUser,
                    }]
                    : []),
                {
                    id: 'logoff',
                    label: 'Log Off',
                    key: 'L',
                    icon: '/icons/xp/log-off.svg',
                    tip: 'Closes your programs and ends your session.',
                    act: () => (onLogOff ? onLogOff() : actions.logout()),
                },
            ];

    const primary = kind === 'shutdown' ? 'off' : 'logoff';
    const title = kind === 'shutdown' ? 'Turn off computer' : `Log Off ${SYSTEM.name}`;

    useEffect(() => setMounted(true), []);

    useEffect(() => {
        if (!mounted) return;
        ref.current?.querySelector<HTMLButtonElement>(`[data-exit="${primary}"]`)?.focus();
    }, [mounted, primary]);

    useEffect(() => () => window.clearTimeout(tipTimer.current), []);

    // Modal: every key is handled here or swallowed, so nothing reaches the desktop underneath.
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            e.stopPropagation();
            if (e.key === 'Escape') {
                e.preventDefault();
                onCancel();
                return;
            }
            const focusables = Array.from(ref.current?.querySelectorAll<HTMLButtonElement>('button') ?? []);
            const i = focusables.indexOf(document.activeElement as HTMLButtonElement);
            if (e.key === 'Tab' || e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
                e.preventDefault();
                const back = e.key === 'ArrowLeft' || (e.key === 'Tab' && e.shiftKey);
                const next = back ? (i <= 0 ? focusables.length - 1 : i - 1) : (i + 1) % focusables.length;
                focusables[next]?.focus();
                return;
            }
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                focusables[i]?.click();
                return;
            }
            const match = buttons.find((b) => b.key.toLowerCase() === e.key.toLowerCase());
            if (match && !e.ctrlKey && !e.metaKey && !e.altKey) {
                e.preventDefault();
                match.act();
            }
        };
        document.addEventListener('keydown', onKey, true);
        return () => document.removeEventListener('keydown', onKey, true);
    });

    if (!mounted) return null;

    return createPortal(
        <>
            <div className="xp-exit-backdrop" aria-hidden />
            <div className="xp-exit-layer" onPointerDown={(e) => e.target === e.currentTarget && e.preventDefault()}>
                <div ref={ref} className="xp-exit" role="dialog" aria-modal="true" aria-labelledby="xp-exit-title">
                    <div className="xp-exit-head">
                        <span id="xp-exit-title">{title}</span>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src="/icons/windows.png" alt="" draggable={false} />
                    </div>
                    <div className="xp-exit-body">
                        {buttons.map((b) => (
                            <button
                                key={b.id}
                                type="button"
                                data-exit={b.id}
                                className="xp-exit-btn"
                                onClick={b.act}
                                onMouseEnter={() => {
                                    window.clearTimeout(tipTimer.current);
                                    tipTimer.current = window.setTimeout(() => setTip(b.id), TIP_DELAY_MS);
                                }}
                                onMouseLeave={() => {
                                    window.clearTimeout(tipTimer.current);
                                    setTip(null);
                                }}
                            >
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src={b.icon} alt="" draggable={false} />
                                <Label text={b.label} accessKey={b.key} />
                                {tip === b.id && (
                                    <span className="xp-exit-tip" role="tooltip">
                                        <b>{b.label}</b>
                                        {b.tip}
                                    </span>
                                )}
                            </button>
                        ))}
                    </div>
                    <div className="xp-exit-foot">
                        <button type="button" className="xp-button" onClick={onCancel}>
                            Cancel
                        </button>
                    </div>
                </div>
            </div>
        </>,
        document.body,
    );
}

/** A label with its access key underlined, as XP drew it. */
function Label({ text, accessKey }: { text: string; accessKey: string }) {
    const i = text.toLowerCase().indexOf(accessKey.toLowerCase());
    if (i < 0) return <span>{text}</span>;
    return (
        <span>
            {text.slice(0, i)}
            <u>{text[i]}</u>
            {text.slice(i + 1)}
        </span>
    );
}
