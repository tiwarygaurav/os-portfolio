"use client";

import { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useSystemStore, type DialogRequest } from '@/store/useSystemStore';

/**
 * XP message boxes.
 *
 * Every native `alert()` and `confirm()` used to shatter the illusion at exactly the moments the
 * desktop was doing something interesting: deleting an icon, finishing the Konami code, opening
 * an app's About box. A browser chrome dialog says "this is a web page" louder than any missing
 * feature says "this is unfinished".
 *
 * These are drawn from the same XP grammar as the windows: beige control face, the title-bar
 * gradient, a 32px symbol, and buttons bottom-right. They stack, they trap focus, Enter takes the
 * default and Escape takes the cancel action.
 */

/** The four XP message-box symbols, drawn rather than shipped as assets. */
function DialogIcon({ kind }: { kind: DialogRequest['icon'] }) {
    const common = 'shrink-0 drop-shadow-sm';
    if (kind === 'warning') {
        return (
            <svg width="32" height="32" viewBox="0 0 32 32" className={common} aria-hidden>
                <path d="M16 2 L31 29 H1 Z" fill="#ffd930" stroke="#8a6d00" strokeWidth="1.2" strokeLinejoin="round" />
                <rect x="14.4" y="11" width="3.2" height="10" rx="1" fill="#3a2f00" />
                <circle cx="16" cy="24.5" r="1.9" fill="#3a2f00" />
            </svg>
        );
    }
    if (kind === 'error') {
        return (
            <svg width="32" height="32" viewBox="0 0 32 32" className={common} aria-hidden>
                <circle cx="16" cy="16" r="14" fill="#d13438" stroke="#7c1013" strokeWidth="1.2" />
                <path d="M10.5 10.5 L21.5 21.5 M21.5 10.5 L10.5 21.5" stroke="#fff" strokeWidth="3.4" strokeLinecap="round" />
            </svg>
        );
    }
    if (kind === 'question') {
        return (
            <svg width="32" height="32" viewBox="0 0 32 32" className={common} aria-hidden>
                <circle cx="16" cy="16" r="14" fill="#1c6fd4" stroke="#0b3c7d" strokeWidth="1.2" />
                <text x="16" y="23" textAnchor="middle" fontSize="19" fontWeight="bold" fill="#fff" fontFamily="Tahoma, Verdana, sans-serif">?</text>
            </svg>
        );
    }
    return (
        <svg width="32" height="32" viewBox="0 0 32 32" className={common} aria-hidden>
            <circle cx="16" cy="16" r="14" fill="#1c6fd4" stroke="#0b3c7d" strokeWidth="1.2" />
            <text x="16" y="23" textAnchor="middle" fontSize="19" fontWeight="bold" fill="#fff" fontFamily="Georgia, serif">i</text>
        </svg>
    );
}

function DialogBox({ request, index }: { request: DialogRequest; index: number }) {
    const resolveDialog = useSystemStore((s) => s.actions.resolveDialog);
    const ref = useRef<HTMLDivElement>(null);

    const defaultButton = request.buttons.find((b) => b.primary) ?? request.buttons[0];
    const cancelButton =
        request.buttons.find((b) => b.cancel) ??
        (request.buttons.length > 1 ? request.buttons[request.buttons.length - 1] : defaultButton);

    // Focus the default button so Enter works immediately and the dialog owns the keyboard.
    useEffect(() => {
        const el = ref.current?.querySelector<HTMLButtonElement>('button[data-default="true"]');
        el?.focus();
    }, []);

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                e.preventDefault();
                e.stopPropagation();
                resolveDialog(request.id, cancelButton.id);
                return;
            }
            if (e.key === 'Enter') {
                // Let a focused non-default button answer for itself.
                const active = document.activeElement as HTMLElement | null;
                if (active?.tagName === 'BUTTON' && ref.current?.contains(active)) return;
                e.preventDefault();
                resolveDialog(request.id, defaultButton.id);
                return;
            }
            if (e.key === 'Tab') {
                // Trap focus: a message box is modal, so Tab must not wander onto the desktop.
                const focusable = ref.current?.querySelectorAll<HTMLButtonElement>('button');
                if (!focusable?.length) return;
                const list = Array.from(focusable);
                const i = list.indexOf(document.activeElement as HTMLButtonElement);
                e.preventDefault();
                const next = e.shiftKey ? (i <= 0 ? list.length - 1 : i - 1) : (i === list.length - 1 ? 0 : i + 1);
                list[next].focus();
            }
        };
        document.addEventListener('keydown', onKey, true);
        return () => document.removeEventListener('keydown', onKey, true);
    }, [request.id, defaultButton.id, cancelButton.id, resolveDialog]);

    return (
        <motion.div
            ref={ref}
            role="dialog"
            aria-modal="true"
            aria-label={request.title}
            initial={{ opacity: 0, scale: 0.94 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.97 }}
            transition={{ duration: 0.12, ease: 'easeOut' }}
            className="pointer-events-auto w-[400px] max-w-[92vw] border border-[#003da8] shadow-2xl"
            style={{ marginTop: index * 26, marginLeft: index * 26 }}
        >
            <div className="flex h-7 items-center justify-between rounded-t-[6px] bg-gradient-to-b from-[#0058ee] via-[#0073e6] to-[#0058ee] px-2 text-white">
                <span className="truncate text-xs font-bold tracking-wide drop-shadow-md">{request.title}</span>
                <button
                    onClick={() => resolveDialog(request.id, cancelButton.id)}
                    className="flex h-5 w-5 items-center justify-center rounded-[3px] border border-white/40 bg-gradient-to-b from-[#e74e57] to-[#a91b1b] hover:from-[#f47280] hover:to-[#c0252b]"
                    title="Close"
                    aria-label="Close"
                >
                    <span className="text-[11px] font-bold leading-none">&times;</span>
                </button>
            </div>

            <div className="bg-[#ece9d8] px-5 py-4 font-sans text-black">
                <div className="flex gap-4">
                    <DialogIcon kind={request.icon} />
                    <div className="min-w-0 flex-1 space-y-2 pt-0.5 text-xs leading-relaxed">
                        {request.body.map((line, i) => (
                            <p key={i} className={line.startsWith('  ') ? 'font-mono text-[11px] text-gray-700' : ''}>
                                {line}
                            </p>
                        ))}
                    </div>
                </div>

                <div className="mt-5 flex justify-end gap-2">
                    {request.buttons.map((b) => (
                        <button
                            key={b.id}
                            data-default={b.id === defaultButton.id ? 'true' : undefined}
                            onClick={() => resolveDialog(request.id, b.id)}
                            className="min-w-[75px] rounded-[3px] border border-[#7a7a6d] bg-gradient-to-b from-white via-[#f2f1ea] to-[#dedbc8] px-3 py-1 text-xs shadow-sm hover:border-[#3c7fb1] hover:from-[#fefefe] hover:to-[#e6f1fb] active:translate-y-px focus:outline-none focus-visible:ring-1 focus-visible:ring-[#0058ee] focus-visible:ring-offset-1"
                        >
                            {b.label}
                        </button>
                    ))}
                </div>
            </div>
        </motion.div>
    );
}

/** The dialog layer. Rendered once by the desktop, above windows and below the taskbar. */
export default function DialogLayer() {
    const dialogs = useSystemStore((s) => s.dialogs);

    return (
        <AnimatePresence>
            {dialogs.length > 0 && (
                <motion.div
                    key="dialog-layer"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.1 }}
                    // Stops below the taskbar: an XP message box never covers the Start button.
                    className="pointer-events-auto absolute inset-x-0 top-0 bottom-9 z-[45] flex items-center justify-center bg-black/10"
                >
                    <div className="flex flex-col items-center">
                        {dialogs.map((d, i) => (
                            <DialogBox key={d.id} request={d} index={i} />
                        ))}
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
