"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, ArrowUp } from 'lucide-react';
import { useSystemStore, type WindowPayload } from '@/store/useSystemStore';
import { APPS } from '@/constants/apps';
import { DOCUMENTS_PATH, GUEST_PATH, HOME_PATH, PICTURES_PATH, isDir, isFile, isWritableDir, listDir, lookup, resolvePath, type VNode } from '@/system/vfs';
import { prettyPath } from '@/system/shell';
import { useProcesses } from '@/utils/processes';
import { playSound } from '@/utils/sound';
import { xpAlert, xpConfirm } from '@/utils/dialog';
import { makeNewFolder, renameUserPath, useFsRevision } from '@/utils/fs';
import RenameField from '@/components/ui/RenameField';
import XpIcon from '@/components/ui/XpIcon';
import { TaskLink, TaskPane, TaskSection, TaskText } from '@/components/ui/TaskPane';
import { FILE_ICONS, fileIconFor } from '@/constants/fileIcons';

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

/** XP's icon for a node: a special folder's own, a program's, or the one for its kind. */
function NodeIcon({ node, path, size = 16 }: { node: VNode; path: string; size?: number }) {
    return <XpIcon src={fileIconFor(node, path)} size={size} className="shrink-0" />;
}

export default function ExplorerApp({ payload }: ExplorerAppProps) {
    const actions = useSystemStore((s) => s.actions);
    const procs = useProcesses();
    // The visitor's files are mounted into the VFS from the store; a save or delete must re-list.
    const revision = useFsRevision();

    const start = payload?.path ? resolvePath(HOME_PATH, payload.path) : HOME_PATH;

    /**
     * Real navigation history, which is what makes Back and Forward honest controls. One state, so
     * the list and the cursor can never disagree — they were two, and a re-open appended to the end
     * of the list while moving the cursor from wherever it was, showing one folder while the
     * address bar named another.
     */
    const [nav, setNav] = useState<{ list: string[]; cursor: number }>({ list: [start], cursor: 0 });
    const [selected, setSelected] = useState<string | null>(null);
    /** The item whose name is being edited in place, if any. */
    const [renaming, setRenaming] = useState<string | null>(null);
    const [address, setAddress] = useState(prettyPath(start));
    const listRef = useRef<HTMLUListElement>(null);

    const path = nav.list[nav.cursor];
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `revision` is the signal that /home/guest changed
    const children = useMemo(() => listDir(path, procs) ?? [], [path, procs, revision]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    const node = useMemo(() => lookup(path, procs), [path, procs, revision]);

    const navigate = useCallback((next: string) => {
        setNav((n) => ({ list: [...n.list.slice(0, n.cursor + 1), next], cursor: n.cursor + 1 }));
        setSelected(null);
        setRenaming(null);
        setAddress(prettyPath(next));
    }, []);

    const step = (by: -1 | 1) => {
        const next = nav.cursor + by;
        if (next < 0 || next >= nav.list.length) return;
        setNav({ ...nav, cursor: next });
        setAddress(prettyPath(nav.list[next]));
        setSelected(null);
        setRenaming(null);
    };

    // A later `open` on this window carries a new path; follow it. Not on mount: the opening path
    // is already the start of the history, and adding it again made Back go "back" to the same folder.
    const openingPayload = useRef(payload);
    useEffect(() => {
        if (payload === openingPayload.current || !payload?.path) return;
        navigate(resolvePath(HOME_PATH, payload.path));
    }, [payload, navigate]);

    const canBack = nav.cursor > 0;
    const canForward = nav.cursor < nav.list.length - 1;
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

    /**
     * Delete `target` — the item the key was pressed on, or the one the task pane refers to — to
     * the Recycle Bin, or for good with Shift+Delete, as XP did. Only the visitor's own files and
     * folders can go; anything else gets XP's refusal with the actual reason.
     */
    const deleteNode = async (target: VNode, targetPath: string, permanently = false) => {
        if (!target.writable) {
            await xpAlert('Error Deleting File or Folder', [
                `Cannot delete ${target.name}: ${isDir(target) ? 'it is a system folder.' : 'it is read-only.'}`,
                'Only files and folders you made in /home/guest can be deleted.',
            ], 'error');
            return;
        }
        const folder = isDir(target);
        const question = permanently
            ? folder
                ? `Are you sure you want to remove the folder '${target.name}' and all its contents?`
                : `Are you sure you want to delete '${target.name}'?`
            : folder
                ? `Are you sure you want to remove the folder '${target.name}' and move all its contents to the Recycle Bin?`
                : `Are you sure you want to send '${target.name}' to the Recycle Bin?`;
        const ok = await xpConfirm(folder ? 'Confirm Folder Delete' : 'Confirm File Delete', question, {
            confirmLabel: 'Yes',
            cancelLabel: 'No',
            icon: 'warning',
        });
        if (!ok) return;
        const problem = !permanently
            ? actions.recycleUserPath(targetPath)
            : folder
                ? actions.deleteUserFolder(targetPath, true)
                : actions.deleteUserFile(targetPath);
        if (!problem) playSound('recycle');
        if (problem) void xpAlert('Windows Explorer', [problem], 'error');
        else setSelected(null);
    };

    /** Put keyboard focus back on an item after the rename box it was replaced by goes away. */
    const focusItem = (name: string) =>
        requestAnimationFrame(() =>
            Array.from(listRef.current?.querySelectorAll<HTMLButtonElement>('button[data-name]') ?? [])
                .find((b) => b.dataset.name === name)
                ?.focus(),
        );

    /** F2, or "Rename this file": only the visitor's own items; anything else says why not. */
    const startRename = (target: VNode) => {
        if (!target.writable) {
            void xpAlert('Error Renaming File or Folder', [
                `Cannot rename ${target.name}: ${isDir(target) ? 'it is a system folder.' : 'it is read-only.'}`,
                'Only files and folders you made in /home/guest can be renamed.',
            ], 'error');
            return;
        }
        setSelected(target.name);
        setRenaming(target.name);
    };

    const commitRename = async (targetPath: string, typed: string) => {
        setRenaming(null);
        const name = await renameUserPath(targetPath, typed);
        setSelected(name);
        focusItem(name);
    };

    const canWriteHere = isWritableDir(path);
    const newFolder = async () => {
        const name = await makeNewFolder(path);
        if (!name) return;
        // XP made it and went straight into naming it.
        setSelected(name);
        setRenaming(name);
    };
    const deleteSelected = () => {
        if (selectedNode && selectedPath) void deleteNode(selectedNode, selectedPath);
    };

    return (
        <div className="flex h-full flex-col bg-[#ece9d8] font-sans text-black">
            {/* Toolbar. Every control here is wired to real history. */}
            <div className="xp-toolbar shrink-0">
                <ToolButton label="Back" disabled={!canBack} onClick={() => step(-1)}>
                    <ChevronLeft size={16} />
                </ToolButton>
                <ToolButton label="Forward" disabled={!canForward} onClick={() => step(1)}>
                    <ChevronRight size={16} />
                </ToolButton>
                <ToolButton label="Up one level" disabled={!parent} onClick={() => parent && navigate(parent)}>
                    <ArrowUp size={16} />
                </ToolButton>
            </div>
            <div className="xp-addressbar shrink-0">
                <label htmlFor="explorer-address" className="hidden sm:inline">
                    Address
                </label>
                <div className="xp-addressbar-field">
                    <XpIcon src={FILE_ICONS.folderOpen} size={16} />
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
                        className="min-w-0 flex-1 bg-transparent text-[11px] outline-none"
                        aria-label="Address"
                    />
                </div>
                <ToolButton label="Go" onClick={submitAddress}>
                    <span className="px-1 text-xs">Go</span>
                </ToolButton>
            </div>

            <div className="flex flex-1 flex-col overflow-y-auto md:flex-row md:overflow-hidden">
                {/* Task pane, in XP's order: tasks, places, details. */}
                <TaskPane className="order-2 shrink-0 md:order-none md:w-[200px] md:overflow-y-auto">
                    {(canWriteHere || selectedNode?.writable) && (
                        <TaskSection title="File and Folder Tasks" special>
                            {canWriteHere && <TaskLink label="Make a new folder" onClick={() => void newFolder()} />}
                            {selectedNode?.writable && (
                                <>
                                    <TaskLink label={`Rename this ${isDir(selectedNode) ? 'folder' : 'file'}`} onClick={() => startRename(selectedNode)} />
                                    <TaskLink label={`Delete this ${isDir(selectedNode) ? 'folder' : 'file'}`} onClick={deleteSelected} />
                                </>
                            )}
                        </TaskSection>
                    )}

                    <TaskSection title="Other Places">
                        <TaskLink label="My Documents" icon={<XpIcon src={FILE_ICONS.userFolder} size={16} />} onClick={() => navigate(DOCUMENTS_PATH)} />
                        <TaskLink label="My Pictures" icon={<XpIcon src={FILE_ICONS.pictures} size={16} />} onClick={() => navigate(PICTURES_PATH)} />
                        <TaskLink label="Home" icon={<XpIcon src={FILE_ICONS.folder} size={16} />} onClick={() => navigate(HOME_PATH)} />
                        <TaskLink label="Projects" icon={<XpIcon src={FILE_ICONS.folder} size={16} />} onClick={() => navigate(`${HOME_PATH}/projects`)} />
                        <TaskLink label="Experience" icon={<XpIcon src={FILE_ICONS.folder} size={16} />} onClick={() => navigate(`${HOME_PATH}/experience`)} />
                        <TaskLink label="Processes (/proc)" icon={<XpIcon src={FILE_ICONS.folder} size={16} />} onClick={() => navigate('/proc')} />
                        <TaskLink label="System (/etc)" icon={<XpIcon src={FILE_ICONS.folder} size={16} />} onClick={() => navigate('/etc')} />
                        <TaskLink label="Recycle Bin" icon={<XpIcon src={FILE_ICONS.binEmpty} size={16} />} onClick={() => actions.openWindow('trash')} />
                    </TaskSection>

                    <TaskSection title="Details">
                        {selectedNode ? (
                            <>
                                <TaskText strong>{selectedNode.name}</TaskText>
                                <TaskText>
                                    {isDir(selectedNode)
                                        ? `Folder — ${(listDir(`${path === '/' ? '' : path}/${selectedNode.name}`, procs) ?? []).length} items`
                                        : selectedNode.mime === 'application/x-link'
                                            ? 'Shortcut'
                                            : selectedNode.src
                                                ? 'Picture'
                                                : `${selectedNode.content.split('\n').length} lines`}
                                </TaskText>
                                {isFile(selectedNode) && selectedNode.modified !== undefined && (
                                    <TaskText>Date Modified: {new Date(selectedNode.modified).toLocaleString()}</TaskText>
                                )}
                                {!selectedNode.writable && <TaskText>Read-only</TaskText>}
                                {isDir(selectedNode) && selectedNode.description && <TaskText>{selectedNode.description}</TaskText>}
                            </>
                        ) : (
                            <>
                                <TaskText strong>{node && isDir(node) ? node.name || '/' : prettyPath(path)}</TaskText>
                                <TaskText>
                                    {children.length} object{children.length === 1 ? '' : 's'}
                                </TaskText>
                                {node && isDir(node) && node.description && <TaskText>{node.description}</TaskText>}
                            </>
                        )}
                    </TaskSection>

                    <TaskSection title="This is real">
                        <TaskText>
                            {path === GUEST_PATH || path.startsWith(GUEST_PATH + '/')
                                ? 'This is your folder. What you save here stays in this browser, and the Command Prompt sees the same files — try '
                                : 'Everything here is generated from the same typed content the windows render. The Command Prompt walks this exact tree — try '}
                            <span className="font-mono">ls {prettyPath(path).includes(' ') ? `"${prettyPath(path)}"` : prettyPath(path)}</span> there.
                        </TaskText>
                    </TaskSection>
                </TaskPane>

                {/* File list */}
                <div className="order-1 flex-1 bg-white p-2 md:order-none md:overflow-y-auto">
                    {children.length === 0 ? (
                        <p className="p-4 text-xs text-gray-500">
                            {node ? 'This folder is empty.' : 'This folder no longer exists. It was moved or deleted.'}
                        </p>
                    ) : (
                        <ul ref={listRef} className="grid grid-cols-2 gap-1 sm:grid-cols-3 lg:grid-cols-4">
                            {children.map((child) => {
                                const childPath = `${path === '/' ? '' : path}/${child.name}`;
                                const isSelected = selected === child.name;
                                if (renaming === child.name) {
                                    return (
                                        <li key={child.name}>
                                            <div className="flex w-full items-center gap-2 rounded bg-[#316ac5] px-2 py-1 text-xs">
                                                <NodeIcon node={child} path={childPath} size={18} />
                                                <RenameField
                                                    name={child.name}
                                                    isFolder={isDir(child)}
                                                    onCommit={(typed) => void commitRename(childPath, typed)}
                                                    onCancel={() => { setRenaming(null); focusItem(child.name); }}
                                                />
                                            </div>
                                        </li>
                                    );
                                }
                                return (
                                    <li key={child.name}>
                                        <button
                                            data-name={child.name}
                                            onClick={() => setSelected(child.name)}
                                            onDoubleClick={() => activate(child, childPath)}
                                            onFocus={() => setSelected(child.name)}
                                            onKeyDown={(e) => {
                                                // Keys pressed on a file belong to Explorer. They used to reach the
                                                // desktop underneath and act on whatever desktop icon was selected.
                                                if (e.key === 'Enter' || e.key === 'Delete' || e.key === 'F2') {
                                                    e.preventDefault();
                                                    e.stopPropagation();
                                                }
                                                if (e.key === 'Enter') activate(child, childPath);
                                                if (e.key === 'Delete') void deleteNode(child, childPath, e.shiftKey);
                                                if (e.key === 'F2') startRename(child);
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
                                            <NodeIcon node={child} path={childPath} size={18} />
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

