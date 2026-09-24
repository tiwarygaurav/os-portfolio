"use client";

import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { XPButton } from './xp-controls';

/**
 * A modal dialog that belongs to one app window — Paint's Attributes, Solitaire's Options.
 *
 * System message boxes (`components/os/Dialog.tsx`) cover the whole desktop because they answer
 * for the whole system. These answer for one window, so they cover only that window's body: the
 * rest of the desktop keeps working, exactly as an XP owned dialog left other programs usable.
 * The drawing is the message box's — `luna-title`, the red close button, the beige face — so the
 * two kinds look like they came from the same system, and both follow the colour scheme.
 *
 * Render it inside an element with `position: relative`; it fills that element.
 */

const FOCUSABLE =
    'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Tab order as the browser would compute it: only the checked radio of a group is a stop. */
function tabStops(root: HTMLElement): HTMLElement[] {
    return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => {
        if (!(el instanceof HTMLInputElement) || el.type !== 'radio' || el.checked || !el.name) return true;
        return !root.querySelector(`input[type="radio"][name="${CSS.escape(el.name)}"]:checked`);
    });
}

interface AppDialogProps {
    title: string;
    /** Cancel, the close button, Escape and Alt+F4. */
    onCancel: () => void;
    /** OK and Enter. Leave out when `footer` supplies the buttons itself. */
    onOk?: () => void;
    okLabel?: string;
    cancelLabel?: string;
    /** While true, OK is disabled and Enter does nothing. */
    okDisabled?: boolean;
    /** Replaces the OK / Cancel row. */
    footer?: ReactNode;
    /** Maximum width in px; the dialog also shrinks to fit a small window. */
    width?: number;
    children: ReactNode;
}

export default function AppDialog({
    title,
    onCancel,
    onOk,
    okLabel = 'OK',
    cancelLabel = 'Cancel',
    okDisabled = false,
    footer,
    width = 320,
    children,
}: AppDialogProps) {
    const ref = useRef<HTMLDivElement>(null);
    /*
     * Clicking the window behind a modal dialog flashes the dialog's title bar, which is how XP
     * said "answer me first". A short count, not a loop: it stops after three blinks.
     */
    const [flash, setFlash] = useState(0);

    // Take the keyboard at once — the first field if there is one, otherwise OK — and give it back
    // to whatever had it when the dialog closes, so the window's own shortcuts keep working.
    useEffect(() => {
        const root = ref.current;
        if (!root) return;
        const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        const target =
            root.querySelector<HTMLElement>('[data-autofocus]') ??
            root.querySelector<HTMLElement>('input:not([type="radio"]):not([type="checkbox"]):not([disabled]), select:not([disabled])') ??
            root.querySelector<HTMLElement>('button[data-ok]') ??
            root;
        target.focus();
        if (target instanceof HTMLInputElement && target.type !== 'number') target.select();
        return () => {
            const now = document.activeElement;
            // Only if focus was left behind with the dialog: never pull it back from somewhere the
            // visitor has since chosen to be.
            if (previous?.isConnected && (!now || now === document.body || root.contains(now))) previous.focus({ preventScroll: true });
        };
    }, []);

    useEffect(() => {
        if (!flash) return;
        const t = setTimeout(() => setFlash((f) => (f >= 6 ? 0 : f + 1)), 70);
        return () => clearTimeout(t);
    }, [flash]);

    const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
        // Modal: no key reaches the app or the desktop behind this dialog.
        e.stopPropagation();
        if (e.key === 'Escape' || (e.altKey && e.key === 'F4')) {
            e.preventDefault();
            onCancel();
            return;
        }
        if (e.key === 'Enter') {
            const t = e.target as HTMLElement;
            // A focused button answers for itself; a textarea takes the newline.
            if (t.tagName === 'BUTTON' || t.tagName === 'TEXTAREA') return;
            e.preventDefault();
            if (onOk && !okDisabled) onOk();
            return;
        }
        if (e.key === 'Tab' && ref.current) {
            const stops = tabStops(ref.current);
            if (!stops.length) return;
            e.preventDefault();
            const i = stops.indexOf(document.activeElement as HTMLElement);
            const next = e.shiftKey ? (i <= 0 ? stops.length - 1 : i - 1) : i === stops.length - 1 ? 0 : i + 1;
            stops[next].focus();
        }
    };

    return (
        <div
            className="absolute inset-0 z-40 flex items-center justify-center p-2"
            onPointerDown={(e) => {
                if (e.target !== e.currentTarget) return;
                e.preventDefault();
                setFlash(1);
            }}
            onContextMenu={(e) => e.preventDefault()}
        >
            {/* The chrome is `app/luna.css`'s, the same classes the system windows are drawn with. */}
            <div
                ref={ref}
                role="dialog"
                aria-modal="true"
                aria-label={title}
                tabIndex={-1}
                onKeyDown={onKeyDown}
                className={`xp-window-frame${flash % 2 === 1 ? ' is-inactive' : ''} max-h-full w-full shadow-2xl outline-none`}
                style={{ maxWidth: width }}
            >
                <div className="xp-titlebar">
                    <span className="xp-titlebar-text">{title}</span>
                    <div className="xp-titlebar-controls">
                        <button type="button" onClick={onCancel} className="xp-caption-btn is-close" title="Close" aria-label="Close" />
                    </div>
                </div>
                <div className="xp-face min-h-0 overflow-auto p-3">
                    {children}
                    {footer ??
                        (onOk && (
                            <div className="mt-3 flex justify-end gap-2">
                                <XPButton data-ok isDefault onClick={onOk} disabled={okDisabled}>
                                    {okLabel}
                                </XPButton>
                                <XPButton onClick={onCancel}>{cancelLabel}</XPButton>
                            </div>
                        ))}
                </div>
            </div>
        </div>
    );
}
