"use client";

import { useEffect, useRef } from 'react';
import { APPS } from '@/constants/apps';
import { fileIconFor, fileTypeName } from '@/constants/fileIcons';
import { isDir, lookup, type VNode } from '@/system/vfs';
import { prettyPath } from '@/system/shell';
import XpIcon from '@/components/ui/XpIcon';

/**
 * XP's Properties box for a file or folder: the General tab.
 *
 * Every line is measured, not invented. A size is the bytes the item really holds — a picture's
 * decoded data, a text file's characters, a folder's contents added up. A built-in picture is a
 * file on the site whose size this page never downloads, so it says that instead of a number. The
 * Read-only box reports; it is not a control, because nothing here can change it.
 */

interface PropertiesDialogProps {
    path: string;
    onClose: () => void;
}

/** Bytes a stored item holds: a data: URL decoded, anything else by its characters. */
function bytesOf(node: VNode): number | null {
    if (isDir(node)) return node.children.reduce<number>((n, c) => n + (bytesOf(c) ?? 0), 0);
    if (node.src) {
        if (!node.src.startsWith('data:')) return null;
        const b64 = node.src.slice(node.src.indexOf(',') + 1);
        return Math.floor((b64.length * 3) / 4) - (b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0);
    }
    return node.content.length;
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

export default function PropertiesDialog({ path, onClose }: PropertiesDialogProps) {
    const node = lookup(path);
    const okRef = useRef<HTMLButtonElement>(null);
    useEffect(() => okRef.current?.focus(), []);

    if (!node) return null;
    const folder = isDir(node);
    const bytes = bytesOf(node);
    const inside = folder ? counts(node) : null;
    const opensWith = !folder && node.open ? APPS[node.open.appId]?.title : undefined;
    const location = prettyPath(path.slice(0, path.lastIndexOf('/')) || '/');
    const readOnly = !node.writable;
    const modified = !folder ? node.modified : undefined;

    const row = (label: string, value: React.ReactNode) => (
        <div className="grid grid-cols-[88px_1fr] items-start gap-2 py-0.5">
            <span>{label}</span>
            <span className="min-w-0 break-words">{value}</span>
        </div>
    );

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
                aria-label={`${node.name} Properties`}
                className="flex max-h-full w-[340px] max-w-full flex-col border luna-title-edge bg-[#ece9d8] font-sans text-[11px] text-black shadow-2xl"
            >
                <div className="luna-title flex h-6 shrink-0 items-center px-2 font-bold text-white">
                    <span className="truncate">{node.name || '/'} Properties</span>
                </div>
                <div className="px-2 pt-2">
                    <div className="inline-block rounded-t border border-b-0 border-[#919b9c] bg-[#fcfcfe] px-3 py-0.5">General</div>
                </div>
                <div className="mx-2 mb-2 min-h-0 overflow-y-auto border border-[#919b9c] bg-[#fcfcfe] p-3">
                    <div className="flex items-center gap-3 pb-2">
                        <XpIcon src={fileIconFor(node, path)} size={32} />
                        <div className="min-w-0 flex-1 truncate border border-[#7f9db9] bg-white px-1 py-0.5">{node.name || '/'}</div>
                    </div>
                    <hr className="my-1 border-[#d0d0bf]" />
                    {row(folder ? 'Type:' : 'Type of file:', fileTypeName(node))}
                    {opensWith && row('Opens with:', opensWith)}
                    <hr className="my-1 border-[#d0d0bf]" />
                    {row('Location:', location)}
                    {row('Size:', bytes === null ? 'Not known — a file on the site, which this page has not downloaded' : sizeText(bytes))}
                    {inside && row('Contains:', `${inside.files} File${inside.files === 1 ? '' : 's'}, ${inside.folders} Folder${inside.folders === 1 ? '' : 's'}`)}
                    <hr className="my-1 border-[#d0d0bf]" />
                    {row('Modified:', modified ? new Date(modified).toLocaleString() : readOnly ? 'Built into the portfolio' : '—')}
                    <hr className="my-1 border-[#d0d0bf]" />
                    {row(
                        'Attributes:',
                        <label className="inline-flex items-center gap-1">
                            <input type="checkbox" checked={readOnly} disabled readOnly />
                            Read-only
                        </label>,
                    )}
                    {readOnly && (
                        <p className="pt-1 text-gray-600">
                            Part of the portfolio. Copy it into My Documents to have a copy you can change.
                        </p>
                    )}
                </div>
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
