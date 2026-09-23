"use client";

import { useId, useState } from 'react';

/**
 * XP's Explorer task pane — "File and Folder Tasks", "Other Places", "Details" — for windows that
 * lay out their own content (Explorer, My Computer, the Recycle Bin).
 *
 * Drawn entirely by `app/luna.css` (`.xp-taskpane*`), so it follows the colour scheme; the markup
 * is the one `components/os/ExplorerLayout.tsx` uses. A section collapses from its header, as XP's
 * did. A link does something or is not a link: text with no action is `TaskText`.
 */

export function TaskPane({ children, className = '' }: { children: React.ReactNode; className?: string }) {
    return <div className={`xp-taskpane ${className}`}>{children}</div>;
}

/** XP's round double-chevron: pointing up to collapse, down to expand. */
function Chevrons({ open }: { open: boolean }) {
    return (
        <svg width="9" height="9" viewBox="0 0 9 9" aria-hidden style={{ transform: open ? undefined : 'rotate(180deg)' }}>
            <path d="M1 4.6 4.5 1.2 8 4.6M1 8.2 4.5 4.8 8 8.2" fill="none" stroke="currentColor" strokeWidth="1.5" />
        </svg>
    );
}

export function TaskSection({
    title,
    special = false,
    children,
}: {
    title: string;
    /** XP drew the first, most important group with a dark header. */
    special?: boolean;
    children: React.ReactNode;
}) {
    const [open, setOpen] = useState(true);
    const bodyId = useId();
    return (
        <section className={`xp-taskpane-section${special ? ' is-special' : ''}`}>
            <button
                type="button"
                onClick={() => setOpen(!open)}
                aria-expanded={open}
                aria-controls={bodyId}
                className="xp-taskpane-head"
            >
                <span>{title}</span>
                <span className="xp-taskpane-chevron">
                    <Chevrons open={open} />
                </span>
            </button>
            {open && (
                <div id={bodyId} className="xp-taskpane-body">
                    {children}
                </div>
            )}
        </section>
    );
}

export function TaskLink({ label, onClick, icon }: { label: string; onClick: () => void; icon?: React.ReactNode }) {
    return (
        <button type="button" onClick={onClick} className="xp-taskpane-link">
            {icon}
            <span>{label}</span>
        </button>
    );
}

export function TaskText({ children, strong = false }: { children: React.ReactNode; strong?: boolean }) {
    return <div className={`xp-taskpane-text${strong ? ' font-bold' : ''}`}>{children}</div>;
}
