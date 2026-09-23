"use client";

import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowUp, FileText, FolderClosed, Image as ImageIcon } from 'lucide-react';
import {
    DOCUMENTS_PATH,
    GUEST_PATH,
    HOME_PATH,
    PICTURES_PATH,
    isDir,
    isFile,
    listDir,
    lookup,
    resolvePath,
    validateUserPath,
    type VFile,
    type VNode,
} from '@/system/vfs';
import { prettyPath } from '@/system/shell';
import { useFsRevision } from '@/utils/fs';
import { xpAlert, xpConfirm } from '@/utils/dialog';

/**
 * The XP common "Open" / "Save As" dialog, over the virtual filesystem.
 *
 * It is drawn inside the owning app's window and blocks it, the way a common dialog was modal to
 * the program that opened it. Every control is real: the Look in list, Up One Level, the places
 * bar, the Files of type filter. Saving is only possible under /home/guest, and the refusal
 * elsewhere uses the same words as the shell (`validateUserPath`).
 */

export interface FileType {
    label: string;
    /** Which files this type shows. */
    test: (file: VFile) => boolean;
    /** Appended on save when the typed name has no extension, e.g. ".txt". */
    ext?: string;
}

export const TEXT_TYPES: FileType[] = [
    { label: 'Text Documents (*.txt)', test: (f) => /\.txt$/i.test(f.name), ext: '.txt' },
    { label: 'All Files', test: () => true },
];

export const IMAGE_TYPES: FileType[] = [
    { label: 'PNG (*.png)', test: (f) => /\.png$/i.test(f.name), ext: '.png' },
    { label: 'All Picture Files', test: (f) => Boolean(f.src) },
];

interface FileDialogProps {
    mode: 'open' | 'save';
    initialDir: string;
    initialName?: string;
    types: FileType[];
    onCancel: () => void;
    /** Receives an absolute path: an existing file to open, or a writable path to save to. */
    onConfirm: (path: string) => void;
}

const PLACES = [
    { label: 'My Documents', path: DOCUMENTS_PATH },
    { label: 'My Pictures', path: PICTURES_PATH },
    { label: 'Guest', path: GUEST_PATH },
    { label: 'Portfolio', path: HOME_PATH },
];

function NodeIcon({ node }: { node: VNode }) {
    if (isDir(node)) return <FolderClosed size={16} className="shrink-0 text-[#e8a93b]" aria-hidden />;
    if (node.src) return <ImageIcon size={16} className="shrink-0 text-[#2f8b19]" aria-hidden />;
    return <FileText size={16} className="shrink-0 text-[#5a8ac6]" aria-hidden />;
}

export default function FileDialog({ mode, initialDir, initialName = '', types, onCancel, onConfirm }: FileDialogProps) {
    useFsRevision();
    const [dir, setDir] = useState(initialDir);
    const [name, setName] = useState(initialName);
    const [typeIndex, setTypeIndex] = useState(0);
    const [selected, setSelected] = useState<string | null>(null);
    const nameRef = useRef<HTMLInputElement>(null);
    const type = types[typeIndex] ?? types[0];

    useEffect(() => {
        nameRef.current?.focus();
        nameRef.current?.select();
    }, []);

    const entries = useMemo(() => {
        const children = listDir(dir) ?? [];
        const dirs = children.filter(isDir);
        const files = children.filter((c): c is VFile => isFile(c) && !c.href && type.test(c));
        return [...dirs, ...files];
    }, [dir, type]);

    // The Look in list: the current folder's ancestors, then the places.
    const ancestry = useMemo(() => {
        const parts = dir.split('/').filter(Boolean);
        return ['/', ...parts.map((_, i) => '/' + parts.slice(0, i + 1).join('/'))];
    }, [dir]);

    const go = (next: string) => {
        setDir(next);
        setSelected(null);
    };

    const confirm = async (override?: string) => {
        const typed = (override ?? name).trim();
        if (!typed) return;
        let target = resolvePath(dir, typed);
        const existing = lookup(target);
        if (existing && isDir(existing)) {
            go(target);
            setName('');
            return;
        }

        if (mode === 'open') {
            if (!existing || !isFile(existing)) {
                await xpAlert('Open', [typed, 'File not found.', 'Please verify the correct file name was given.'], 'warning');
                return;
            }
            onConfirm(target);
            return;
        }

        // Save: add the type's extension to a bare name, as XP did.
        if (type.ext && !/\.[^./]+$/.test(typed)) target = resolvePath(dir, typed + type.ext);
        const problem = validateUserPath(target);
        if (problem) {
            await xpAlert('Save As', [problem], 'warning');
            return;
        }
        const clash = lookup(target);
        if (clash) {
            const replace = await xpConfirm(
                'Save As',
                [`${target.slice(target.lastIndexOf('/') + 1)} already exists.`, 'Do you want to replace it?'],
                { confirmLabel: 'Yes', cancelLabel: 'No', icon: 'warning' },
            );
            if (!replace) return;
        }
        onConfirm(target);
    };

    const parent = dir === '/' ? null : resolvePath(dir, '..');

    return (
        <div
            className="absolute inset-0 z-40 flex items-center justify-center bg-black/10 p-2"
            onKeyDown={(e) => {
                if (e.key === 'Escape') {
                    e.stopPropagation();
                    onCancel();
                }
            }}
        >
            <div
                role="dialog"
                aria-modal="true"
                aria-label={mode === 'open' ? 'Open' : 'Save As'}
                className="flex max-h-full w-[440px] max-w-full flex-col border luna-title-edge bg-[#ece9d8] font-sans text-xs text-black shadow-2xl"
            >
                <div className="luna-title flex h-6 shrink-0 items-center px-2 font-bold text-white">
                    {mode === 'open' ? 'Open' : 'Save As'}
                </div>

                <div className="flex shrink-0 items-center gap-2 px-2 pt-2">
                    <label htmlFor="fd-lookin" className="shrink-0">{mode === 'open' ? 'Look in:' : 'Save in:'}</label>
                    <select
                        id="fd-lookin"
                        value={dir}
                        onChange={(e) => go(e.target.value)}
                        className="min-w-0 flex-1 border border-[#7f9db9] bg-white px-1 py-0.5"
                    >
                        {ancestry.map((p) => (
                            <option key={p} value={p}>{prettyPath(p)}</option>
                        ))}
                        {PLACES.filter((pl) => !ancestry.includes(pl.path)).map((pl) => (
                            <option key={pl.path} value={pl.path}>{pl.label}</option>
                        ))}
                    </select>
                    <button
                        type="button"
                        onClick={() => parent && go(parent)}
                        disabled={!parent}
                        title="Up One Level"
                        aria-label="Up One Level"
                        className="rounded-[3px] border border-transparent p-0.5 hover:border-[#7a7a6d] disabled:text-gray-400"
                    >
                        <ArrowUp size={14} />
                    </button>
                </div>

                <div className="flex min-h-0 flex-1 gap-2 p-2">
                    {/* Places bar */}
                    <nav aria-label="Places" className="hidden w-24 shrink-0 flex-col gap-1 bg-[#8aa3d6] p-1 sm:flex">
                        {PLACES.map((pl) => (
                            <button
                                key={pl.path}
                                type="button"
                                onClick={() => go(pl.path)}
                                className={`rounded px-1 py-2 text-center text-[11px] text-white hover:bg-white/20 ${dir === pl.path ? 'bg-white/30' : ''}`}
                            >
                                {pl.label}
                            </button>
                        ))}
                    </nav>

                    {/* File list */}
                    <ul aria-label="Files" className="h-40 min-w-0 flex-1 overflow-auto border border-[#7f9db9] bg-white p-1 sm:h-44">
                        {entries.length === 0 && <li className="p-2 text-gray-500">This folder is empty.</li>}
                        {entries.map((node) => (
                            <li key={node.name}>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setSelected(node.name);
                                        if (isFile(node)) setName(node.name);
                                    }}
                                    onDoubleClick={() => {
                                        const path = resolvePath(dir, node.name);
                                        if (isDir(node)) go(path);
                                        else if (mode === 'open') onConfirm(path);
                                        else { setName(node.name); void confirm(node.name); }
                                    }}
                                    className={`flex w-full items-center gap-2 px-1 py-0.5 text-left ${selected === node.name ? 'bg-[#316ac5] text-white' : 'hover:bg-[#e8f0fe]'}`}
                                >
                                    <NodeIcon node={node} />
                                    <span className="truncate">{node.name}</span>
                                </button>
                            </li>
                        ))}
                    </ul>
                </div>

                <div className="grid shrink-0 grid-cols-[auto_1fr_auto] items-center gap-2 px-2 pb-2">
                    <label htmlFor="fd-name">File name:</label>
                    <input
                        id="fd-name"
                        ref={nameRef}
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                                e.preventDefault();
                                void confirm();
                            }
                        }}
                        className="min-w-0 border border-[#7f9db9] bg-white px-1 py-0.5"
                        autoComplete="off"
                        spellCheck={false}
                    />
                    <button
                        type="button"
                        onClick={() => void confirm()}
                        disabled={!name.trim()}
                        className="min-w-[75px] rounded-[3px] border border-[#7a7a6d] bg-gradient-to-b from-white via-[#f2f1ea] to-[#dedbc8] px-3 py-1 hover:border-[#3c7fb1] disabled:text-gray-400"
                    >
                        {mode === 'open' ? 'Open' : 'Save'}
                    </button>

                    <label htmlFor="fd-type">Files of type:</label>
                    <select
                        id="fd-type"
                        value={typeIndex}
                        onChange={(e) => setTypeIndex(Number(e.target.value))}
                        className="min-w-0 border border-[#7f9db9] bg-white px-1 py-0.5"
                    >
                        {types.map((t, i) => (
                            <option key={t.label} value={i}>{t.label}</option>
                        ))}
                    </select>
                    <button
                        type="button"
                        onClick={onCancel}
                        className="min-w-[75px] rounded-[3px] border border-[#7a7a6d] bg-gradient-to-b from-white via-[#f2f1ea] to-[#dedbc8] px-3 py-1 hover:border-[#3c7fb1]"
                    >
                        Cancel
                    </button>
                </div>
            </div>
        </div>
    );
}
