"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, ArrowUp } from 'lucide-react';
import { useSystemStore, type WindowPayload } from '@/store/useSystemStore';
import { APPS } from '@/constants/apps';
import {
    DOCUMENTS_PATH,
    GUEST_PATH,
    HOME_PATH,
    PICTURES_PATH,
    isDir,
    isFile,
    isWritableDir,
    listDir,
    lookup,
    nextFreeName,
    resolvePath,
    type VNode,
} from '@/system/vfs';
import { prettyPath } from '@/system/shell';
import { useProcesses } from '@/utils/processes';
import { playSound } from '@/utils/sound';
import { xpAlert, xpConfirm } from '@/utils/dialog';
import { makeNewFolder, pasteInto, renameUserPath, setFileClipboard, useFileClipboard, useFsRevision } from '@/utils/fs';
import XpIcon from '@/components/ui/XpIcon';
import ContextMenu, { type MenuItem } from '@/components/ui/ContextMenu';
import { TaskLink, TaskPane, TaskSection, TaskText } from '@/components/ui/TaskPane';
import PropertiesDialog from '@/components/os/PropertiesDialog';
import FileList, { sizeColumn, sortEntries, type Entry, type SortKey, type ViewMode } from '@/components/apps/explorer/FileList';
import { FILE_ICONS, fileTypeName } from '@/constants/fileIcons';

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

const join = (dir: string, name: string) => `${dir === '/' ? '' : dir}/${name}`;

const VIEWS: { id: ViewMode; label: string }[] = [
    { id: 'tiles', label: 'Tiles' },
    { id: 'icons', label: 'Icons' },
    { id: 'list', label: 'List' },
    { id: 'details', label: 'Details' },
];
const SORTS: { id: SortKey; label: string }[] = [
    { id: 'name', label: 'Name' },
    { id: 'size', label: 'Size' },
    { id: 'type', label: 'Type' },
    { id: 'modified', label: 'Modified' },
];

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
    /** XP opened a folder in Tiles; the View menu and the Views button change it. */
    const [view, setView] = useState<ViewMode>('tiles');
    const [sortBy, setSortBy] = useState<SortKey>('name');
    /** An open right-click menu: over an item, or (item null) over the empty part of the folder. */
    const [menu, setMenu] = useState<{ x: number; y: number; items: MenuItem[] } | null>(null);
    /** The path whose Properties box is showing. */
    const [properties, setProperties] = useState<string | null>(null);
    const clipboard = useFileClipboard();

    const path = nav.list[nav.cursor];
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `revision` is the signal that /home/guest changed
    const children = useMemo(() => listDir(path, procs) ?? [], [path, procs, revision]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    const node = useMemo(() => lookup(path, procs), [path, procs, revision]);
    const entries = useMemo(
        () => sortEntries(children.map((c) => ({ node: c, path: join(path, c.name) })), sortBy),
        [children, path, sortBy],
    );

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

    /* -------------------------------------------------------- Cut, Copy, Paste, New */

    /** Only the visitor's own things can be moved; anything can be copied, and Paste says if not. */
    const cut = async (entry: Entry) => {
        if (!entry.node.writable) {
            await xpAlert('Error Moving File or Folder', [
                `Cannot move ${entry.node.name}: ${isDir(entry.node) ? 'it is a system folder.' : 'it is read-only.'}`,
                'Only files and folders you made in /home/guest can be moved. Copy makes a copy you can change.',
            ], 'error');
            return;
        }
        setFileClipboard({ path: entry.path, cut: true });
    };
    const copy = (entry: Entry) => setFileClipboard({ path: entry.path, cut: false });
    const paste = async () => {
        if (!clipboard) return;
        if (!canWriteHere) {
            await xpAlert('Windows Explorer', ['Nothing can be pasted here: this is part of the portfolio.', 'Paste into My Documents, My Pictures or a folder you made.'], 'error');
            return;
        }
        const name = await pasteInto(path);
        if (name) {
            setSelected(name);
            focusItem(name);
        }
    };
    /** New > Text Document: XP made "New Text Document.txt" and went straight into naming it. */
    const newTextDocument = () => {
        const { userFiles, userFolders } = useSystemStore.getState();
        const name = nextFreeName(path, { files: userFiles, folders: userFolders }, 'New Text Document', '.txt');
        const problem = actions.writeUserFile(join(path, name), { content: '' });
        if (problem) {
            void xpAlert('Windows Explorer', ['Unable to create the file.', problem], 'error');
            return;
        }
        setSelected(name);
        setRenaming(name);
    };

    /* ---------------------------------------------------------------- menus and keys */

    const viewItems = (): MenuItem[] => VIEWS.map((v) => ({ label: v.label, checked: view === v.id, action: () => setView(v.id) }));

    const itemMenu = (entry: Entry): MenuItem[] => {
        const own = !!entry.node.writable;
        return [
            { label: 'Open', bold: true, action: () => activate(entry.node, entry.path) },
            { divider: true },
            { label: 'Cut', accel: 'Ctrl+X', disabled: !own, action: () => void cut(entry) },
            { label: 'Copy', accel: 'Ctrl+C', action: () => copy(entry) },
            { divider: true },
            { label: 'Delete', accel: 'Del', disabled: !own, action: () => void deleteNode(entry.node, entry.path) },
            { label: 'Rename', accel: 'F2', disabled: !own, action: () => startRename(entry.node) },
            { divider: true },
            { label: 'Properties', accel: 'Alt+Enter', action: () => setProperties(entry.path) },
        ];
    };

    const folderMenu = (): MenuItem[] => [
        { label: 'View', items: viewItems() },
        { label: 'Arrange Icons By', items: SORTS.map((s) => ({ label: s.label, checked: sortBy === s.id, action: () => setSortBy(s.id) })) },
        { divider: true },
        { label: 'Paste', accel: 'Ctrl+V', disabled: !clipboard || !canWriteHere, action: () => void paste() },
        { divider: true },
        canWriteHere
            ? {
                label: 'New',
                items: [
                    { label: 'Folder', icon: <XpIcon src={FILE_ICONS.folder} size={16} />, action: () => void newFolder() },
                    { divider: true },
                    { label: 'Text Document', icon: <XpIcon src={FILE_ICONS.text} size={16} />, action: newTextDocument },
                ],
            }
            : { label: 'New', disabled: true },
        { divider: true },
        { label: 'Properties', action: () => setProperties(path) },
    ];

    /** Keys on an item belong to Explorer; they used to reach the desktop and act on its icons. */
    const onItemKey = (e: React.KeyboardEvent, entry: Entry) => {
        const ctrl = e.ctrlKey || e.metaKey;
        const key = e.key.toLowerCase();
        const handled =
            ['Enter', 'Delete', 'F2', 'Backspace'].includes(e.key) || (ctrl && ['x', 'c', 'v'].includes(key));
        if (!handled) return;
        e.preventDefault();
        e.stopPropagation();
        if (e.key === 'Enter' && e.altKey) setProperties(entry.path);
        else if (e.key === 'Enter') activate(entry.node, entry.path);
        else if (e.key === 'Delete') void deleteNode(entry.node, entry.path, e.shiftKey);
        else if (e.key === 'F2') startRename(entry.node);
        else if (e.key === 'Backspace') { if (parent) navigate(parent); }
        else if (key === 'x') void cut(entry);
        else if (key === 'c') copy(entry);
        else void paste();
    };

    return (
        <div className="relative flex h-full flex-col bg-[#ece9d8] font-sans text-black">
            {/* Toolbar. Every control here is wired to real history, or to the view. */}
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
                <div className="mx-1 h-5 w-px bg-[#d8d2bd]" />
                <ToolButton
                    label="Views"
                    onClick={(e) => {
                        const r = e.currentTarget.getBoundingClientRect();
                        setMenu({ x: r.left, y: r.bottom, items: viewItems() });
                    }}
                >
                    <span className="px-1 text-[11px]">Views ▾</span>
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
                                    {fileTypeName(selectedNode)}
                                    {isDir(selectedNode) && ` — ${(listDir(join(path, selectedNode.name), procs) ?? []).length} items`}
                                </TaskText>
                                {isFile(selectedNode) && selectedNode.modified !== undefined && (
                                    <TaskText>Date Modified: {new Date(selectedNode.modified).toLocaleString()}</TaskText>
                                )}
                                {sizeColumn(selectedNode) && <TaskText>Size: {sizeColumn(selectedNode)}</TaskText>}
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

                {/* File list. The empty part of it has its own menu (View, Paste, New...), as in XP. */}
                <div
                    tabIndex={-1}
                    className="order-1 min-h-[8rem] flex-1 bg-white p-2 outline-none md:order-none md:overflow-y-auto"
                    onContextMenu={(e) => {
                        e.preventDefault();
                        setSelected(null);
                        setMenu({ x: e.clientX, y: e.clientY, items: folderMenu() });
                    }}
                    onMouseDown={(e) => {
                        if (e.target === e.currentTarget) setSelected(null);
                    }}
                    onKeyDown={(e) => {
                        // Keys on the empty part of the folder: Paste, and Backspace for Up, as in XP.
                        const ctrl = e.ctrlKey || e.metaKey;
                        if (ctrl && e.key.toLowerCase() === 'v') {
                            e.preventDefault();
                            e.stopPropagation();
                            void paste();
                        } else if (e.key === 'Backspace' && parent) {
                            e.preventDefault();
                            e.stopPropagation();
                            navigate(parent);
                        }
                    }}
                >
                    {children.length === 0 ? (
                        <p className="p-4 text-xs text-gray-500">
                            {node ? 'This folder is empty.' : 'This folder no longer exists. It was moved or deleted.'}
                        </p>
                    ) : (
                        <FileList
                            entries={entries}
                            view={view}
                            sortBy={sortBy}
                            onSort={setSortBy}
                            selected={selected}
                            renaming={renaming}
                            cutPath={clipboard?.cut ? clipboard.path : null}
                            listRef={listRef}
                            onSelect={setSelected}
                            onActivate={(entry) => activate(entry.node, entry.path)}
                            onItemKey={onItemKey}
                            onItemMenu={(e, entry) => {
                                e.preventDefault();
                                e.stopPropagation();
                                setSelected(entry.node.name);
                                setMenu({ x: e.clientX, y: e.clientY, items: itemMenu(entry) });
                            }}
                            onRenameCommit={(entry, typed) => void commitRename(entry.path, typed)}
                            onRenameCancel={(entry) => {
                                setRenaming(null);
                                focusItem(entry.node.name);
                            }}
                        />
                    )}
                </div>
            </div>

            <div className="flex shrink-0 justify-between gap-2 border-t border-[#aca899] bg-[#ece9d8] px-2 py-0.5 text-[10px] text-gray-700">
                <span>
                    {selectedNode
                        ? `1 object selected${sizeColumn(selectedNode) ? ` — ${sizeColumn(selectedNode)}` : ''}`
                        : `${children.length} object${children.length === 1 ? '' : 's'}`}
                </span>
                <span className="truncate font-mono">{prettyPath(path)}</span>
            </div>

            <ContextMenu x={menu?.x ?? 0} y={menu?.y ?? 0} isOpen={menu !== null} onClose={() => setMenu(null)} items={menu?.items ?? []} />
            {properties && <PropertiesDialog path={properties} onClose={() => setProperties(null)} />}
        </div>
    );
}

function ToolButton({
    children,
    onClick,
    disabled,
    label,
}: {
    children: React.ReactNode;
    onClick: (e: React.MouseEvent<HTMLButtonElement>) => void;
    disabled?: boolean;
    label: string;
}) {
    return (
        <button
            type="button"
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
