"use client";

import { useEffect, useRef } from 'react';
import { APPS } from '@/constants/apps';
import { fileIconFor, fileTypeName } from '@/constants/fileIcons';
import { GUEST_PATH, HOME_PATH, isDir, isWritableDir, lookup, type ProcEntry, type VNode } from '@/system/vfs';
import { prettyPath } from '@/system/shell';
import XpIcon from '@/components/ui/XpIcon';

/**
 * XP's Properties box for a file, a folder, or several at once: the General tab.
 *
 * Every line is measured, not invented. A size is the bytes the item really holds — a picture's
 * decoded data, a text file's UTF-8, a folder's contents added up. A built-in picture is a file on
 * the site whose size this page never downloads, so it says that instead of a number. The Read-only
 * box reports; it is not a control, because nothing here can change it.
 */

interface PropertiesDialogProps {
    /** One item, or a selection: XP titled several "first.txt, ... Properties". */
    paths: string[];
    /** The live process table, so an item under /proc can be described too. */
    procs: ProcEntry[];
    onClose: () => void;
}

const encoder = new TextEncoder();

/**
 * Bytes an item holds — a picture's decoded data, a text file's UTF-8 — and how many files in it
 * could not be measured (a built-in picture is a file on the site the page never downloaded). A
 * folder used to count those as zero, and said "0 bytes" beside "4 Files".
 */
function bytesOf(node: VNode): { bytes: number; unknown: number } {
    if (isDir(node)) {
        return node.children.reduce(
            (acc, c) => {
                const inner = bytesOf(c);
                return { bytes: acc.bytes + inner.bytes, unknown: acc.unknown + inner.unknown };
            },
            { bytes: 0, unknown: 0 },
        );
    }
    if (node.src) {
        if (!node.src.startsWith('data:')) return { bytes: 0, unknown: 1 };
        const b64 = node.src.slice(node.src.indexOf(',') + 1);
        return { bytes: Math.floor((b64.length * 3) / 4) - (b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0), unknown: 0 };
    }
    return { bytes: encoder.encode(node.content).length, unknown: 0 };
}

function counts(node: VNode): { files: number; folders: number } {
    if (!isDir(node)) return { files: 1, folders: 0 };
    return node.children.reduce(
        (acc, c) => {
            if (!isDir(c)) return { ...acc, files: acc.files + 1 };
            const inner = counts(c);
            return { files: acc.files + inner.files, folders: acc.folders + 1 + inner.folders };
        },
        { files: 0, folders: 0 },
    );
}

/** "1.21 KB (1,234 bytes)", as XP wrote a size. */
function sizeText(bytes: number): string {
    const exact = `${bytes.toLocaleString()} bytes`;
    if (bytes < 1024) return exact;
    const units = ['KB', 'MB'];
    let v = bytes / 1024;
    let u = 0;
    while (v >= 1024 && u < units.length - 1) {
        v /= 1024;
        u++;
    }
    return `${v.toFixed(v < 10 ? 2 : 1)} ${units[u]} (${exact})`;
}

const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? '' : 's'}`;

function sizeLine({ bytes, unknown }: { bytes: number; unknown: number }, several: boolean): string {
    if (unknown === 0) return sizeText(bytes);
    if (!several) return 'Not known — a file on the site, which this page has not downloaded';
    return `At least ${sizeText(bytes)} — ${plural(unknown, 'built-in picture')} not counted (files on the site this page has not downloaded)`;
}

/** Why an item cannot be changed, by where it lives; null when it can be. */
function noteFor(node: VNode, path: string): string | null {
    const readOnly = !node.writable && !isWritableDir(path);
    const within = (root: string) => path === root || path.startsWith(root + '/');
    if (!readOnly) return node.writable ? null : 'One of your system folders: you can save into it, but not rename or delete it.';
    if (within(HOME_PATH)) return 'Part of the portfolio. Copy it into My Documents to have a copy you can change.';
    if (within('/proc')) return 'Describes a running window, and exists only while that window does.';
    if (within(GUEST_PATH)) return 'A built-in picture. It can be viewed and set as the wallpaper, not changed.';
    return 'Part of the system, generated from this desktop itself. It cannot be changed.';
}

const row = (label: string, value: React.ReactNode) => (
    <div className="grid grid-cols-[88px_1fr] items-start gap-2 py-0.5">
        <span>{label}</span>
        <span className="min-w-0 break-words">{value}</span>
    </div>
);
const rule = <hr className="my-1 border-[#d0d0bf]" />;

export default function PropertiesDialog({ paths, procs, onClose }: PropertiesDialogProps) {
    const okRef = useRef<HTMLButtonElement>(null);
    useEffect(() => okRef.current?.focus(), []);

    const items = paths
        .map((path) => ({ path, node: lookup(path, procs) }))
        .filter((i): i is { path: string; node: VNode } => i.node !== null);
    if (items.length === 0) return null;
    const [first] = items;
    const several = items.length > 1;
    const name = (n: VNode) => n.name || '/';
    const title = several ? `${name(first.node)}, ... Properties` : `${name(first.node)} Properties`;

    let body: React.ReactNode;
    if (!several) {
        const { node, path } = first;
        const folder = isDir(node);
        const inside = folder ? counts(node) : null;
        const opensWith = !folder && node.open ? APPS[node.open.appId]?.title : undefined;
        const readOnly = !node.writable && !isWritableDir(path);
        const modified = !folder ? node.modified : undefined;
        const note = noteFor(node, path);
        body = (
            <>
                <div className="flex items-center gap-3 pb-2">
                    <XpIcon src={fileIconFor(node, path)} size={32} />
                    <div className="min-w-0 flex-1 truncate border border-[#7f9db9] bg-white px-1 py-0.5">{name(node)}</div>
                </div>
                {rule}
                {row(folder ? 'Type:' : 'Type of file:', fileTypeName(node))}
                {opensWith && row('Opens with:', opensWith)}
                {rule}
                {row('Location:', prettyPath(path.slice(0, path.lastIndexOf('/')) || '/'))}
                {row('Size:', sizeLine(bytesOf(node), folder))}
                {inside && row('Contains:', `${plural(inside.files, 'File')}, ${plural(inside.folders, 'Folder')}`)}
                {rule}
                {modified !== undefined && (
                    <>
                        {row('Modified:', new Date(modified).toLocaleString())}
                        {rule}
                    </>
                )}
                {row(
                    'Attributes:',
                    <label className="inline-flex items-center gap-1">
                        <input type="checkbox" checked={readOnly} disabled readOnly />
                        Read-only
                    </label>,
                )}
                {note && <p className="pt-1 text-gray-600">{note}</p>}
            </>
        );
    } else {
        // Several at once, as XP summed them: what they are, where they are, how big together.
        const files = items.filter((i) => !isDir(i.node)).length;
        const folders = items.length - files;
        const types = new Set(items.map((i) => fileTypeName(i.node)));
        const parents = new Set(items.map((i) => i.path.slice(0, i.path.lastIndexOf('/')) || '/'));
        const size = items.reduce(
            (acc, i) => {
                const b = bytesOf(i.node);
                return { bytes: acc.bytes + b.bytes, unknown: acc.unknown + b.unknown };
            },
            { bytes: 0, unknown: 0 },
        );
        const inside = items.reduce(
            (acc, i) => {
                const c = counts(i.node);
                return { files: acc.files + c.files, folders: acc.folders + (isDir(i.node) ? 1 : 0) + c.folders };
            },
            { files: 0, folders: 0 },
        );
        const readOnly = items.filter((i) => !i.node.writable && !isWritableDir(i.path)).length;
        body = (
            <>
                <div className="flex items-center gap-3 pb-2">
                    <XpIcon src={fileIconFor(first.node, first.path)} size={32} />
                    <div className="min-w-0 flex-1">{[files && plural(files, 'File'), folders && plural(folders, 'Folder')].filter(Boolean).join(', ')}</div>
                </div>
                {rule}
                {row('Type:', types.size === 1 ? `All of type ${Array.from(types)[0]}` : 'Multiple Types')}
                {row('Location:', parents.size === 1 ? `All in ${prettyPath(Array.from(parents)[0])}` : 'Various Folders')}
                {rule}
                {row('Size:', sizeLine(size, true))}
                {row('Contains:', `${plural(inside.files, 'File')}, ${plural(inside.folders, 'Folder')}`)}
                {rule}
                {row(
                    'Attributes:',
                    <label className="inline-flex items-center gap-1">
                        <input type="checkbox" checked={readOnly === items.length} disabled readOnly />
                        Read-only{readOnly > 0 && readOnly < items.length ? ` (${readOnly} of ${items.length})` : ''}
                    </label>,
                )}
            </>
        );
    }

    return (
        <div
            className="absolute inset-0 z-40 flex items-center justify-center bg-black/10 p-2"
            onKeyDown={(e) => {
                // Modal: every key stays here. Enter is OK, as XP's default button.
                e.stopPropagation();
                if (e.key === 'Escape' || e.key === 'Enter') {
                    e.preventDefault();
                    onClose();
                }
            }}
            onMouseDown={(e) => e.target === e.currentTarget && onClose()}
        >
            <div
                role="dialog"
                aria-modal="true"
                aria-label={title}
                className="flex max-h-full w-[340px] max-w-full flex-col border luna-title-edge bg-[#ece9d8] font-sans text-[11px] text-black shadow-2xl"
            >
                <div className="luna-title flex h-6 shrink-0 items-center px-2 font-bold text-white">
                    <span className="truncate">{title}</span>
                </div>
                <div className="px-2 pt-2">
                    <div className="inline-block rounded-t border border-b-0 border-[#919b9c] bg-[#fcfcfe] px-3 py-0.5">General</div>
                </div>
                <div className="mx-2 mb-2 min-h-0 overflow-y-auto border border-[#919b9c] bg-[#fcfcfe] p-3">{body}</div>
                <div className="flex justify-end gap-2 px-2 pb-2">
                    <button
                        ref={okRef}
                        type="button"
                        onClick={onClose}
                        className="min-w-[75px] rounded-[3px] border border-[#003c74] bg-gradient-to-b from-white via-[#f2f1ea] to-[#dedbc8] px-3 py-1 hover:border-[#3c7fb1]"
                    >
                        OK
                    </button>
                </div>
            </div>
        </div>
    );
}
