"use client";

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, ArrowUp, FolderClosed, FileText, Link2, AppWindow, Image as ImageIcon } from 'lucide-react';
import { useSystemStore, type WindowPayload } from '@/store/useSystemStore';
import { APPS } from '@/constants/apps';
import { DOCUMENTS_PATH, GUEST_PATH, HOME_PATH, PICTURES_PATH, isDir, isFile, listDir, lookup, resolvePath, type VNode } from '@/system/vfs';
import { prettyPath } from '@/system/shell';
import { useProcesses } from '@/utils/processes';
import { playSound } from '@/utils/sound';
import { xpAlert, xpConfirm } from '@/utils/dialog';
import { useFsRevision } from '@/utils/fs';

/**
 * Windows Explorer, over the same virtual filesystem the Command Prompt walks.
 *
 * This is the bridge between the two audiences. A visitor who will never type `ls` can now see
 * that the filesystem is real — the tree, the folders and the files are the identical objects
 * `system/vfs.ts` builds from `content/`, including the live `/proc`.
 *
 * **Folders always navigate, the way real Explorer does.** Some directories (home, `projects`,
 * a specific project) also carry an `open` launch hint, because the shell's `open <path>` and the
 * Run dialog use it to jump straight to the matching window — that is a deliberate shortcut for a
 * command-line-shaped tool, not what a double-click on a folder icon should do. A visitor who
 * wants the same jump from here still gets it: browsing into a project folder shows its
 * `README.md`, and double-clicking *that* opens the Projects window on that project, exactly as
 * `open <path>` would — the file-level hint and the folder-level hint were never in conflict.
 *
 * **Every navigation control here works.** The previous explorer chrome in this project was six
 * inert buttons and an address bar that went nowhere; they were deleted rather than faked. Back,
 * Forward, Up and the address bar are real because there is now a real tree to move through.
 */

interface ExplorerAppProps {
    payload?: WindowPayload;
}

/** Icon for a node, by kind. */
function NodeIcon({ node, size = 16 }: { node: VNode; size?: number }) {
    if (isDir(node)) return <FolderClosed size={size} className="shrink-0 text-[#f0b765]" aria-hidden />;
    if (node.mime === 'application/x-link') return <Link2 size={size} className="shrink-0 text-[#7a5cd6]" aria-hidden />;
    if (node.mime === 'application/x-app') return <AppWindow size={size} className="shrink-0 text-[#2f8b19]" aria-hidden />;
    if (node.src) return <ImageIcon size={size} className="shrink-0 text-[#2f8b19]" aria-hidden />;
    return <FileText size={size} className="shrink-0 text-[#5a8ac6]" aria-hidden />;
}

export default function ExplorerApp({ payload }: ExplorerAppProps) {
    const actions = useSystemStore((s) => s.actions);
    const procs = useProcesses();
    // The visitor's files are mounted into the VFS from the store; a save or delete must re-list.
    const revision = useFsRevision();

    const start = payload?.path ? resolvePath(HOME_PATH, payload.path) : HOME_PATH;

    /** Real navigation history, which is what makes Back and Forward honest controls. */
    const [history, setHistory] = useState<string[]>([start]);
    const [cursor, setCursor] = useState(0);
    const [selected, setSelected] = useState<string | null>(null);
    const [address, setAddress] = useState(prettyPath(start));

    const path = history[cursor];
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `revision` is the signal that /home/guest changed
    const children = useMemo(() => listDir(path, procs) ?? [], [path, procs, revision]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    const node = useMemo(() => lookup(path, procs), [path, procs, revision]);

    const navigate = useCallback((next: string) => {
        setHistory((prev) => [...prev.slice(0, cursor + 1), next]);
        setCursor((c) => c + 1);
        setSelected(null);
        setAddress(prettyPath(next));
    }, [cursor]);

    // A later `open` on this window carries a new path; follow it.
    useEffect(() => {
        if (!payload?.path) return;
        const target = resolvePath(HOME_PATH, payload.path);
        setHistory((prev) => [...prev, target]);
        setCursor((c) => c + 1);
        setAddress(prettyPath(target));
    }, [payload]);

    const canBack = cursor > 0;
    const canForward = cursor < history.length - 1;
    const parent = path === '/' ? null : resolvePath(path, '..');

    /** Open a node: the app that owns it, its external target, or navigate into it. */
    const activate = (child: VNode, childPath: string) => {
        if (isDir(child)) {
            navigate(childPath);
            return;
        }
        if (child.href) {
            window.open(child.href, '_blank', 'noopener,noreferrer');
            return;
        }
        if (child.open) {
            playSound('open');
            actions.openWindow(child.open.appId, APPS[child.open.appId]?.title, child.open.payload);
            return;
        }
        // No window owns this file. Show what it contains rather than doing nothing.
        void xpAlert(child.name, child.content.split('\n').slice(0, 24));
    };

    const submitAddress = () => {
        const target = resolvePath(path, address.trim() || '~');
        if (!lookup(target, procs)) {
            void xpAlert(
                'Windows Explorer',
                [`Cannot find "${address.trim()}".`, 'Check the spelling and try again.'],
                'error',
            );
            setAddress(prettyPath(path));
            return;
        }
        navigate(target);
    };

    const selectedNode = selected ? children.find((c) => c.name === selected) : undefined;
    const selectedPath = selectedNode ? `${path === '/' ? '' : path}/${selectedNode.name}` : null;

    /** Delete a file the visitor saved. Built-in files are read-only and never offer this. */
    const deleteSelected = async () => {
        if (!selectedNode || !isFile(selectedNode) || !selectedNode.writable || !selectedPath) return;
        const ok = await xpConfirm('Confirm File Delete', `Are you sure you want to delete '${selectedNode.name}'?`, {
            confirmLabel: 'Yes',
            cancelLabel: 'No',
            icon: 'warning',
        });
        if (!ok) return;
        const problem = actions.deleteUserFile(selectedPath);
        if (problem) void xpAlert('Windows Explorer', [problem], 'error');
        else setSelected(null);
    };

    return (
        <div className="flex h-full flex-col bg-[#ece9d8] font-sans text-black">
            {/* Toolbar. Every control here is wired to real history. */}
            <div className="flex shrink-0 items-center gap-1 border-b border-[#aca899] px-2 py-1">
                <ToolButton label="Back" disabled={!canBack} onClick={() => { setCursor((c) => c - 1); setAddress(prettyPath(history[cursor - 1])); setSelected(null); }}>
                    <ChevronLeft size={16} />
                </ToolButton>
                <ToolButton label="Forward" disabled={!canForward} onClick={() => { setCursor((c) => c + 1); setAddress(prettyPath(history[cursor + 1])); setSelected(null); }}>
                    <ChevronRight size={16} />
                </ToolButton>
                <ToolButton label="Up one level" disabled={!parent} onClick={() => parent && navigate(parent)}>
                    <ArrowUp size={16} />
                </ToolButton>
                <div className="mx-1 h-5 w-px bg-[#aca899]" />
                <label htmlFor="explorer-address" className="hidden text-xs sm:inline">
                    Address
                </label>
                <input
                    id="explorer-address"
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter') { e.preventDefault(); submitAddress(); }
                        if (e.key === 'Escape') setAddress(prettyPath(path));
                    }}
                    onBlur={() => setAddress(prettyPath(path))}
                    spellCheck={false}
                    autoComplete="off"
                    className="min-w-0 flex-1 border border-[#7f9db9] bg-white px-2 py-0.5 font-mono text-xs outline-none focus:border-[#0058ee]"
                    aria-label="Address"
                />
                <ToolButton label="Go" onClick={submitAddress}>
                    <span className="px-1 text-xs">Go</span>
                </ToolButton>
            </div>

            <div className="flex flex-1 flex-col overflow-y-auto md:flex-row md:overflow-hidden">
                {/* Task pane */}
                <div className="order-2 shrink-0 space-y-3 bg-gradient-to-b from-[#7da2ce] to-[#3a6ea5] p-2 text-xs text-white md:order-none md:w-52 md:overflow-y-auto">
                    <Panel title="Details">
                        {selectedNode ? (
                            <>
                                <p className="font-bold">{selectedNode.name}</p>
                                <p className="mt-1 text-[10px] text-blue-100">
                                    {isDir(selectedNode)
                                        ? `Folder — ${(listDir(`${path === '/' ? '' : path}/${selectedNode.name}`, procs) ?? []).length} items`
                                        : selectedNode.mime === 'application/x-link'
                                            ? 'Shortcut'
                                            : selectedNode.src
                                                ? 'Picture'
                                                : `${selectedNode.content.split('\n').length} lines`}
                                </p>
                                {isFile(selectedNode) && selectedNode.modified !== undefined && (
                                    <p className="mt-1 text-[10px] text-blue-100">
                                        Date Modified: {new Date(selectedNode.modified).toLocaleString()}
                                    </p>
                                )}
                                {isFile(selectedNode) && !selectedNode.writable && !isDir(selectedNode) && (
                                    <p className="mt-1 text-[10px] text-blue-100">Read-only</p>
                                )}
                                {isDir(selectedNode) && selectedNode.description && (
                                    <p className="mt-1 text-[10px] text-blue-100">{selectedNode.description}</p>
                                )}
                            </>
                        ) : (
                            <>
                                <p className="font-bold">{node && isDir(node) ? node.name || '/' : prettyPath(path)}</p>
                                <p className="mt-1 text-[10px] text-blue-100">
                                    {children.length} object{children.length === 1 ? '' : 's'}
                                </p>
                                {node && isDir(node) && node.description && (
                                    <p className="mt-1 text-[10px] text-blue-100">{node.description}</p>
                                )}
                            </>
                        )}
                    </Panel>

                    {selectedNode && isFile(selectedNode) && selectedNode.writable && (
                        <Panel title="File Tasks">
                            <PlaceLink label="Delete this file" onClick={() => void deleteSelected()} />
                        </Panel>
                    )}

                    <Panel title="Other Places">
                        <PlaceLink label="My Documents" onClick={() => navigate(DOCUMENTS_PATH)} />
                        <PlaceLink label="My Pictures" onClick={() => navigate(PICTURES_PATH)} />
                        <PlaceLink label="Home" onClick={() => navigate(HOME_PATH)} />
                        <PlaceLink label="Projects" onClick={() => navigate(`${HOME_PATH}/projects`)} />
                        <PlaceLink label="Experience" onClick={() => navigate(`${HOME_PATH}/experience`)} />
                        <PlaceLink label="Processes (/proc)" onClick={() => navigate('/proc')} />
                        <PlaceLink label="System (/etc)" onClick={() => navigate('/etc')} />
                    </Panel>

                    <Panel title="This is real">
                        <p className="text-[10px] leading-relaxed text-blue-100">
                            {path === GUEST_PATH || path.startsWith(GUEST_PATH + '/')
                                ? 'This is your folder. What you save here stays in this browser, and the Command Prompt sees the same files — try '
                                : 'Everything here is generated from the same typed content the windows render. The Command Prompt walks this exact tree — try '}
                            <span className="font-mono">ls {prettyPath(path).includes(' ') ? `"${prettyPath(path)}"` : prettyPath(path)}</span> there.
                        </p>
                    </Panel>
                </div>

                {/* File list */}
                <div className="order-1 flex-1 bg-white p-2 md:order-none md:overflow-y-auto">
                    {children.length === 0 ? (
                        <p className="p-4 text-xs text-gray-500">This folder is empty.</p>
                    ) : (
                        <ul className="grid grid-cols-2 gap-1 sm:grid-cols-3 lg:grid-cols-4">
                            {children.map((child) => {
                                const childPath = `${path === '/' ? '' : path}/${child.name}`;
                                const isSelected = selected === child.name;
                                return (
                                    <li key={child.name}>
                                        <button
                                            onClick={() => setSelected(child.name)}
                                            onDoubleClick={() => activate(child, childPath)}
                                            onKeyDown={(e) => {
                                                if (e.key === 'Enter') { e.preventDefault(); activate(child, childPath); }
                                                if (e.key === 'Delete' && isFile(child) && child.writable) {
                                                    e.preventDefault();
                                                    e.stopPropagation();
                                                    void deleteSelected();
                                                }
                                            }}
                                            className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs ${
                                                isSelected ? 'bg-[#316ac5] text-white' : 'hover:bg-[#e8f0fe]'
                                            }`}
                                            title={
                                                isDir(child)
                                                    ? child.description ?? child.name
                                                    : isFile(child) && child.open
                                                        ? `Opens ${APPS[child.open.appId]?.title ?? child.open.appId}`
                                                        : child.name
                                            }
                                        >
                                            <NodeIcon node={child} size={18} />
                                            <span className="truncate">{child.name}</span>
                                        </button>
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                </div>
            </div>

            <div className="flex shrink-0 justify-between border-t border-[#aca899] bg-[#ece9d8] px-2 py-0.5 text-[10px] text-gray-700">
                <span>{children.length} object{children.length === 1 ? '' : 's'}</span>
                <span className="truncate font-mono">{prettyPath(path)}</span>
            </div>
        </div>
    );
}

function ToolButton({ children, onClick, disabled, label }: { children: React.ReactNode; onClick: () => void; disabled?: boolean; label: string }) {
    return (
        <button
            onClick={onClick}
            disabled={disabled}
            title={label}
            aria-label={label}
            className="flex h-6 items-center justify-center rounded-[3px] border border-transparent px-1 hover:border-[#7a7a6d] hover:bg-[#f2f1ea] active:translate-y-px disabled:text-gray-400 disabled:hover:border-transparent disabled:hover:bg-transparent"
        >
            {children}
        </button>
    );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <div className="overflow-hidden rounded bg-white/20">
            <div className="bg-gradient-to-r from-[#f0b765] to-[#cf8b1f] px-2 py-1 text-[11px] font-bold text-white">
                {title}
            </div>
            <div className="space-y-1 bg-white/10 p-2">{children}</div>
        </div>
    );
}

function PlaceLink({ label, onClick }: { label: string; onClick: () => void }) {
    return (
        <button onClick={onClick} className="block w-full text-left text-[11px] hover:underline">
            {label}
        </button>
    );
}
