"use client";

import { useEffect, useState } from 'react';
import { isDir, listDir, type ProcEntry } from '@/system/vfs';
import { FILE_ICONS, fileIconFor } from '@/constants/fileIcons';
import XpIcon from '@/components/ui/XpIcon';
import { DRAG_TYPE, droppedPaths } from '@/components/apps/explorer/FileList';

/**
 * Explorer's Folders pane: the whole tree, folders only, with XP's [+] / [-] boxes.
 *
 * It opens with the path to the current folder expanded and that folder selected, and follows
 * navigation from anywhere else (the address bar, Back, a double-click). Folders here take a drop,
 * the same as a folder in the file list.
 */

interface FolderTreeProps {
    current: string;
    procs: ProcEntry[];
    /** Changes when the visitor's files or folders do, so the tree re-lists. */
    revision: object;
    onOpen: (path: string) => void;
    onDropOn: (path: string, from: string[], copy: boolean) => void;
    className?: string;
}

const join = (dir: string, name: string) => `${dir === '/' ? '' : dir}/${name}`;
const ancestors = (path: string) => {
    const parts = path.split('/').filter(Boolean);
    return ['/', ...parts.map((_, i) => '/' + parts.slice(0, i + 1).join('/'))];
};

export default function FolderTree({ current, procs, revision, onOpen, onDropOn, className = '' }: FolderTreeProps) {
    const [open, setOpen] = useState<Set<string>>(() => new Set(ancestors(current)));
    const [dropTarget, setDropTarget] = useState<string | null>(null);

    // Wherever Explorer goes, the tree opens down to it, as XP's did.
    useEffect(() => {
        setOpen((prev) => {
            const next = new Set(prev);
            ancestors(current).forEach((p) => next.add(p));
            return next;
        });
    }, [current]);

    const toggle = (path: string) =>
        setOpen((prev) => {
            const next = new Set(prev);
            if (next.has(path)) next.delete(path);
            else next.add(path);
            return next;
        });

    const node = (path: string, name: string, depth: number): React.ReactNode => {
        // `revision` is read so a new or renamed folder appears without a manual refresh.
        void revision;
        const subdirs = (listDir(path, procs) ?? []).filter(isDir);
        const expanded = open.has(path);
        const here = path === current;
        return (
            <li key={path} role="treeitem" aria-expanded={subdirs.length ? expanded : undefined} aria-selected={here}>
                <div className="flex items-center" style={{ paddingLeft: depth * 14 }}>
                    {subdirs.length ? (
                        <button
                            type="button"
                            onClick={() => toggle(path)}
                            aria-label={`${expanded ? 'Collapse' : 'Expand'} ${name}`}
                            className="mr-0.5 flex h-[9px] w-[9px] shrink-0 items-center justify-center border border-[#8a8a8a] bg-white text-[9px] leading-none text-black"
                        >
                            {expanded ? '−' : '+'}
                        </button>
                    ) : (
                        <span className="mr-0.5 w-[9px] shrink-0" />
                    )}
                    <button
                        type="button"
                        data-tree-path={path}
                        onClick={() => onOpen(path)}
                        onDragOver={(e) => {
                            if (!e.dataTransfer.types.includes(DRAG_TYPE)) return;
                            e.preventDefault();
                            e.dataTransfer.dropEffect = e.ctrlKey ? 'copy' : 'move';
                            setDropTarget(path);
                        }}
                        onDragLeave={() => setDropTarget((t) => (t === path ? null : t))}
                        onDrop={(e) => {
                            setDropTarget(null);
                            const from = droppedPaths(e.dataTransfer);
                            if (from.length === 0) return;
                            e.preventDefault();
                            onDropOn(path, from, e.ctrlKey);
                        }}
                        className={`flex min-w-0 items-center gap-1 rounded-sm px-0.5 text-left ${
                            here || dropTarget === path ? 'bg-[#316ac5] text-white' : 'hover:bg-[#e8f0fe]'
                        }`}
                    >
                        <XpIcon
                            src={here ? FILE_ICONS.folderOpen : fileIconFor({ kind: 'dir', name, children: [] }, path)}
                            size={16}
                            className="shrink-0"
                        />
                        <span className="truncate">{name}</span>
                    </button>
                </div>
                {expanded && subdirs.length > 0 && (
                    <ul role="group">{subdirs.map((d) => node(join(path, d.name), d.name, depth + 1))}</ul>
                )}
            </li>
        );
    };

    return (
        <div className={`overflow-auto bg-white p-1 text-[11px] ${className}`}>
            <div className="mb-1 flex items-center justify-between border-b border-[#d6d2c2] px-1 pb-0.5">
                <span className="font-bold">Folders</span>
            </div>
            <ul role="tree" aria-label="Folders">
                {node('/', 'Local Disk (C:)', 0)}
            </ul>
        </div>
    );
}
