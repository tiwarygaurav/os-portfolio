"use client";

import { useEffect, useRef, useState } from 'react';

/**
 * XP's in-place rename box, shared by Explorer and the Open / Save As dialog.
 *
 * It opens with the name selected up to the extension, as Explorer did, so typing replaces
 * "New Folder" or "notes" and keeps ".txt". Enter or a click elsewhere commits; Escape cancels.
 * Every key stays inside it: Enter and Delete in Explorer used to reach the desktop underneath,
 * and Escape in a file dialog must cancel the rename, not the dialog.
 */
interface RenameFieldProps {
    name: string;
    /** A folder's whole name is selected; a file's stops before the extension. */
    isFolder: boolean;
    onCommit: (typed: string) => void;
    onCancel: () => void;
    className?: string;
}

export default function RenameField({ name, isFolder, onCommit, onCancel, className }: RenameFieldProps) {
    const [value, setValue] = useState(name);
    const ref = useRef<HTMLInputElement>(null);
    /** Commit and cancel each end the edit once: Enter commits, and the blur that follows must not. */
    const finished = useRef(false);

    useEffect(() => {
        const el = ref.current;
        if (!el) return;
        el.focus();
        const dot = isFolder ? -1 : name.lastIndexOf('.');
        el.setSelectionRange(0, dot > 0 ? dot : name.length);
    }, [name, isFolder]);

    const finish = (commit: boolean) => {
        if (finished.current) return;
        finished.current = true;
        if (commit) onCommit(value);
        else onCancel();
    };

    return (
        <input
            ref={ref}
            value={value}
            aria-label={`New name for ${name}`}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
                e.stopPropagation();
                if (e.key === 'Enter') {
                    e.preventDefault();
                    finish(true);
                } else if (e.key === 'Escape') {
                    e.preventDefault();
                    finish(false);
                }
            }}
            onBlur={() => finish(true)}
            onClick={(e) => e.stopPropagation()}
            onDoubleClick={(e) => e.stopPropagation()}
            maxLength={64}
            spellCheck={false}
            autoComplete="off"
            className={className ?? 'min-w-0 flex-1 border border-black bg-white px-1 text-xs text-black outline-none'}
        />
    );
}
