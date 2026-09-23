"use client";

import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useSystemStore, type DialogRequest } from '@/store/useSystemStore';
import { playSound } from '@/utils/sound';

/**
 * XP message boxes.
 *
 * Every native `alert()` and `confirm()` used to shatter the illusion at exactly the moments the
 * desktop was doing something interesting: deleting an icon, finishing the Konami code, opening
 * an app's About box. A browser chrome dialog says "this is a web page" louder than any missing
 * feature says "this is unfinished".
 *
 * These are drawn as XP drew them: a Luna window frame with only a close button, the beige face,
 * a 32px symbol beside the text, and the buttons centred along the bottom. They stack, they trap
 * focus, Enter takes the default and Escape takes the cancel action — and clicking anywhere else
 * gets XP's answer to that: a ding, and the box's title bar flashing to say "I'm waiting".
 */

/** The four XP message-box symbols, drawn in the glossy Luna style rather than shipped as assets. */
function DialogIcon({ kind }: { kind: DialogRequest['icon'] }) {
    const common = 'shrink-0';
    if (kind === 'warning') {
        return (
            <svg width="32" height="32" viewBox="0 0 32 32" className={common} aria-hidden>
                <defs>
                    <linearGradient id="dlg-warn" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0" stopColor="#fff6a6" />
                        <stop offset="0.45" stopColor="#fbd73c" />
                        <stop offset="1" stopColor="#e9a40c" />
                    </linearGradient>
                </defs>
                <path d="M14.3 3.6a2 2 0 0 1 3.4 0l12.6 22.3a2 2 0 0 1-1.7 3H3.4a2 2 0 0 1-1.7-3z" fill="url(#dlg-warn)" stroke="#9c6a00" strokeWidth="1" />
                <path d="M15.9 5.4 4.3 26.4" stroke="#fff" strokeOpacity=".5" strokeWidth="1" />
                <path d="M14.3 11h3.4l-.7 9.2h-2z" fill="#1c1c1c" />
                <circle cx="16" cy="23.8" r="1.8" fill="#1c1c1c" />
            </svg>
        );
    }
    if (kind === 'error') {
        return (
            <svg width="32" height="32" viewBox="0 0 32 32" className={common} aria-hidden>
                <defs>
                    <radialGradient id="dlg-err" cx="0.38" cy="0.32" r="0.75">
                        <stop offset="0" stopColor="#ff9c80" />
                        <stop offset="0.45" stopColor="#e5391c" />
                        <stop offset="1" stopColor="#a4130a" />
                    </radialGradient>
                    <linearGradient id="dlg-err-hi" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0" stopColor="#fff" stopOpacity=".75" />
                        <stop offset="1" stopColor="#fff" stopOpacity="0" />
                    </linearGradient>
                </defs>
                <circle cx="16" cy="16" r="14" fill="url(#dlg-err)" stroke="#8a1009" strokeWidth="1" />
                <ellipse cx="16" cy="9.5" rx="9.5" ry="6" fill="url(#dlg-err-hi)" />
                <path d="M10.6 10.6l10.8 10.8M21.4 10.6 10.6 21.4" stroke="#fff" strokeWidth="3.6" strokeLinecap="round" />
            </svg>
        );
    }
    // Information and question share XP's white speech balloon, with a blue "i" or "?".
    return (
        <svg width="32" height="32" viewBox="0 0 32 32" className={common} aria-hidden>
            <defs>
                <radialGradient id={`dlg-bubble-${kind}`} cx="0.35" cy="0.3" r="0.8">
                    <stop offset="0" stopColor="#fff" />
                    <stop offset="0.7" stopColor="#eef3fb" />
                    <stop offset="1" stopColor="#c9d6ec" />
                </radialGradient>
                <linearGradient id={`dlg-glyph-${kind}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0" stopColor="#4f9bff" />
                    <stop offset="1" stopColor="#0b44b5" />
                </linearGradient>
            </defs>
            <path
                d="M16 2.5c7.7 0 13.5 4.9 13.5 11.2S23.7 25 16 25c-1.1 0-2.2-.1-3.2-.3L6 29.2l1.6-6.1C4.3 21 2.5 17.6 2.5 13.7 2.5 7.4 8.3 2.5 16 2.5z"
                fill={`url(#dlg-bubble-${kind})`}
                stroke="#6d84ad"
                strokeWidth="1"
            />
            {kind === 'question' ? (
                <path
                    d="M12.2 10.2c.4-2.3 2-3.5 4.2-3.5 2.5 0 4 1.4 4 3.4 0 1.6-.9 2.5-2.1 3.3-1 .7-1.3 1.1-1.3 2.2v.6h-2.6v-.8c0-1.6.5-2.4 1.7-3.2 1-.7 1.5-1.1 1.5-2 0-.9-.6-1.4-1.4-1.4-1 0-1.5.6-1.7 1.6zM13.9 18.2h2.9V21h-2.9z"
                    fill={`url(#dlg-glyph-${kind})`}
                />
            ) : (
                <>
                    <circle cx="16" cy="8.4" r="1.9" fill={`url(#dlg-glyph-${kind})`} />
                    <path d="M13.3 11.8h4.3v7.3h1.3v2.1h-5.6v-2.1h1.3v-5.2h-1.3z" fill={`url(#dlg-glyph-${kind})`} />
                </>
            )}
        </svg>
    );
}

function DialogBox({ request, index, flash }: { request: DialogRequest; index: number; flash: number }) {
    const resolveDialog = useSystemStore((s) => s.actions.resolveDialog);
    const ref = useRef<HTMLDivElement>(null);
    const [dimmed, setDimmed] = useState(false);

    const defaultButton = request.buttons.find((b) => b.primary) ?? request.buttons[0];
    const cancelButton =
        request.buttons.find((b) => b.cancel) ??
        (request.buttons.length > 1 ? request.buttons[request.buttons.length - 1] : defaultButton);

    // Focus the default button so Enter works immediately and the dialog owns the keyboard.
    useEffect(() => {
        const el = ref.current?.querySelector<HTMLButtonElement>('button[data-default="true"]');
        el?.focus();
    }, []);

    // A click outside the box: flash the title bar a few times, as XP did. Only for clicks made
    // after this box appeared — a box that becomes topmost must not replay an old one.
    const flashAtMount = useRef(flash);
    useEffect(() => {
        if (!flash || flash === flashAtMount.current) return;
        let n = 0;
        const t = window.setInterval(() => {
            n += 1;
            setDimmed((d) => !d);
            if (n >= 6) {
                window.clearInterval(t);
                setDimmed(false);
            }
        }, 90);
        return () => window.clearInterval(t);
    }, [flash]);

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            /*
             * A message box is modal: nothing behind it may see a keystroke it handles, and only
             * the topmost of a stack should act at all. Every key branch below must swallow the
             * event *before* deciding what to do with it — the previous version returned early on
             * Enter when a default button already had focus (which the mount effect guarantees),
             * so the event reached Desktop's own listener underneath and fired whatever shortcut
             * that key means there (opening the icon a Delete confirmation was about, for one).
             */
            if (useSystemStore.getState().dialogs.at(-1)?.id !== request.id) return;

            if (e.key === 'Escape') {
                e.preventDefault();
                e.stopPropagation();
                resolveDialog(request.id, cancelButton.id);
                return;
            }
            if (e.key === 'Enter') {
                e.preventDefault();
                e.stopPropagation();
                // A focused non-default button answers for itself via its own onClick.
                const active = document.activeElement as HTMLElement | null;
                if (active?.tagName === 'BUTTON' && ref.current?.contains(active) && active.dataset.default !== 'true') {
                    active.click();
                    return;
                }
                resolveDialog(request.id, defaultButton.id);
                return;
            }
            if (e.key === 'Tab') {
                // Trap focus: a message box is modal, so Tab must not wander onto the desktop.
                e.preventDefault();
                e.stopPropagation();
                const focusable = ref.current?.querySelectorAll<HTMLButtonElement>('.xp-button');
                if (!focusable?.length) return;
                const list = Array.from(focusable);
                const i = list.indexOf(document.activeElement as HTMLButtonElement);
                const next = e.shiftKey ? (i <= 0 ? list.length - 1 : i - 1) : (i === list.length - 1 ? 0 : i + 1);
                list[next].focus();
                return;
            }
            // Every other key (arrows, letters, ...) is swallowed too: with a dialog open, the
            // desktop underneath must not react to anything, including the Konami sequence.
            e.stopPropagation();
        };
        document.addEventListener('keydown', onKey, true);
        return () => document.removeEventListener('keydown', onKey, true);
    }, [request.id, defaultButton.id, cancelButton.id, resolveDialog]);

    return (
        <div
            ref={ref}
            role="dialog"
            aria-modal="true"
            aria-label={request.title}
            className="xp-window-frame pointer-events-auto w-max min-w-[260px] max-w-[min(480px,92vw)]"
            style={{ marginTop: index * 26, marginLeft: index * 26 }}
        >
            <div className={`xp-titlebar${dimmed ? ' is-inactive' : ''}`}>
                <span className="xp-titlebar-text">{request.title}</span>
                <div className="xp-titlebar-controls">
                    <button
                        type="button"
                        onClick={() => resolveDialog(request.id, cancelButton.id)}
                        className="xp-caption-btn is-close"
                        aria-label="Close"
                        data-tip="Close"
                    />
                </div>
            </div>

            <div className="xp-face px-3 pb-3 pt-4">
                <div className="flex gap-4 pl-1 pr-3">
                    <DialogIcon kind={request.icon} />
                    <div className="min-w-0 flex-1 space-y-2 self-center leading-[1.45]">
                        {request.body.map((line, i) => (
                            <p key={i} className={line.startsWith('  ') ? 'font-mono text-[11px] text-[#333]' : ''}>
                                {line}
                            </p>
                        ))}
                    </div>
                </div>

                <div className="mt-4 flex justify-center gap-1.5">
                    {request.buttons.map((b) => (
                        <button
                            key={b.id}
                            type="button"
                            data-default={b.id === defaultButton.id ? 'true' : undefined}
                            onClick={() => resolveDialog(request.id, b.id)}
                            className={`xp-button${b.id === defaultButton.id ? ' is-default' : ''}`}
                        >
                            {b.label}
                        </button>
                    ))}
                </div>
            </div>
        </div>
    );
}

/** The dialog layer. Rendered once by the desktop, above windows and below the taskbar. */
export default function DialogLayer() {
    const dialogs = useSystemStore((s) => s.dialogs);
    const [flash, setFlash] = useState(0);

    return (
        <AnimatePresence>
            {dialogs.length > 0 && (
                <motion.div
                    key="dialog-layer"
                    initial={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.08 }}
                    // Stops above the taskbar: an XP message box never covers the Start button.
                    className="pointer-events-auto absolute inset-x-0 top-0 z-[45] flex items-center justify-center"
                    style={{ bottom: 'var(--xp-taskbar-h)' }}
                    onPointerDown={(e) => {
                        // The box is modal: a click beside it is refused, audibly and visibly.
                        if (e.target !== e.currentTarget) return;
                        playSound('ding');
                        setFlash((f) => f + 1);
                    }}
                >
                    <div className="flex flex-col items-center">
                        {dialogs.map((d, i) => (
                            <DialogBox key={d.id} request={d} index={i} flash={i === dialogs.length - 1 ? flash : 0} />
                        ))}
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
