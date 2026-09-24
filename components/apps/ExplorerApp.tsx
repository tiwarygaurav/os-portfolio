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
    findFiles,
    isWritableDir,
    listDir,
    lookup,
    nextFreeName,
    resolvePath,
    type VNode,
} from '@/system/vfs';
import { prettyPath } from '@/system/shell';
import { useProcesses } from '@/utils/processes';
// Mounts this build's module graph at /usr/src (loaded with this window, not with the page).
import '@/system/source';
import { playSound } from '@/utils/sound';
import { xpAlert, xpConfirm } from '@/utils/dialog';
import { makeNewFolder, pasteInto, renameUserPath, setFileClipboard, transferInto, useFileClipboard, useFsRevision } from '@/utils/fs';
import XpIcon from '@/components/ui/XpIcon';
import ContextMenu, { type MenuItem } from '@/components/ui/ContextMenu';
import { TaskLink, TaskPane, TaskSection, TaskText } from '@/components/ui/TaskPane';
import PropertiesDialog from '@/components/os/PropertiesDialog';
import FileList, { fileBytes, sizeColumn, sortEntries, type Entry, type PickMods, type SortKey, type ViewMode } from '@/components/apps/explorer/FileList';
import SearchPane, { type SearchState } from '@/components/apps/explorer/SearchPane';
import FolderTree from '@/components/apps/explorer/FolderTree';
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
const parentOf = (path: string) => path.slice(0, path.lastIndexOf('/')) || '/';

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
    /**
     * The selection: every selected path, the one last clicked (which a rename or Open acts on), and
     * where a Shift+click range starts. Paths, not names: search results come from many folders.
     */
    const [sel, setSel] = useState<{ all: string[]; primary: string | null; anchor: string | null }>({ all: [], primary: null, anchor: null });
    const selected = sel.primary;
    /** Select exactly one item, or nothing, as a plain click does. */
    const setSelected = useCallback((p: string | null) => setSel({ all: p ? [p] : [], primary: p, anchor: p }), []);
    /** The path of the item whose name is being edited in place, if any. */
    const [renaming, setRenaming] = useState<string | null>(null);
    /** XP's Search Companion: open while set, with what it found once a search has run. */
    const [search, setSearch] = useState<(SearchState & { results: string[] | null }) | null>(null);
    /** XP's Folders button: the folder tree in place of the task pane. Search and Folders take turns. */
    const [showFolders, setShowFolders] = useState(false);
    const [address, setAddress] = useState(prettyPath(start));
    const listRef = useRef<HTMLUListElement>(null);
    /** XP opened a folder in Tiles; the View menu and the Views button change it. */
    const [view, setView] = useState<ViewMode>('tiles');
    const [sortBy, setSortBy] = useState<SortKey>('name');
    /** An open right-click menu: over an item, or (item null) over the empty part of the folder. */
    const [menu, setMenu] = useState<{ x: number; y: number; items: MenuItem[] } | null>(null);
    /** The paths whose Properties box is showing. */
    const [properties, setProperties] = useState<string[] | null>(null);
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
        setSearch(null);
        setAddress(prettyPath(next));
    }, [setSelected]);

    const step = (by: -1 | 1) => {
        const next = nav.cursor + by;
        if (next < 0 || next >= nav.list.length) return;
        setNav({ ...nav, cursor: next });
        setAddress(prettyPath(nav.list[next]));
        setSelected(null);
        setRenaming(null);
        setSearch(null);
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

    /** What the list shows: the folder, or — once Search has run — what it found. */
    /*
     * What Search found, re-read on every change: a result deleted or moved since drops out rather
     * than lingering as a row whose every action said "Cannot find". The hits are kept as paths.
     */
    const results = useMemo(
        () =>
            search?.results
                ? search.results
                    .map((p) => ({ path: p, node: lookup(p, procs) }))
                    .filter((e): e is Entry => e.node !== null)
                : null,
        // eslint-disable-next-line react-hooks/exhaustive-deps -- `revision` is the signal that files changed
        [search, procs, revision],
    );
    const shown: Entry[] = results ?? entries;
    // Only what is still there: a selected item deleted or moved elsewhere drops out.
    const selectedEntries = shown.filter((e) => sel.all.includes(e.path));
    const selectedEntry = selected ? shown.find((e) => e.path === selected) : undefined;
    const selectedNode = selectedEntries.length > 1 ? undefined : selectedEntry?.node;
    const selectedPath = selectedEntries.length > 1 ? null : selectedEntry?.path ?? null;

    /** A click, with XP's modifiers: Ctrl adds or removes one, Shift takes the range from the last plain click. */
    const pick = (p: string, mods: PickMods) => {
        if (mods.range && sel.anchor) {
            const order = shown.map((e) => e.path);
            const a = order.indexOf(sel.anchor);
            const b = order.indexOf(p);
            if (a >= 0 && b >= 0) {
                const range = order.slice(Math.min(a, b), Math.max(a, b) + 1);
                setSel({ all: mods.toggle ? Array.from(new Set([...sel.all, ...range])) : range, primary: p, anchor: sel.anchor });
                return;
            }
        }
        if (mods.toggle) {
            const had = sel.all.includes(p);
            const all = had ? sel.all.filter((x) => x !== p) : [...sel.all, p];
            setSel({ all, primary: had ? all[all.length - 1] ?? null : p, anchor: p });
            return;
        }
        setSelected(p);
    };
    const selectAll = () => setSel({ all: shown.map((e) => e.path), primary: shown[0]?.path ?? null, anchor: shown[0]?.path ?? null });
    /** What an action on `entry` applies to: the whole selection when it is part of one, as in XP. */
    const targetsFor = (entry: Entry): Entry[] =>
        sel.all.includes(entry.path) && selectedEntries.length > 1 ? selectedEntries : [entry];

    const runSearch = () => {
        if (!search) return;
        const { hits, more } = findFiles({ name: search.name, text: search.text, under: search.under }, procs);
        setSearch({ ...search, results: hits.map((h) => h.path), found: hits.length, more });
        setSelected(null);
        // XP showed what it found in Details, with the folder each was in.
        setView('details');
    };

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

    /** Delete several at once, to the Recycle Bin or (Shift) for good, with XP's "these N items". */
    const deleteEntries = async (targets: Entry[], permanently = false) => {
        if (targets.length === 1) {
            await deleteNode(targets[0].node, targets[0].path, permanently);
            return;
        }
        const locked = targets.find((t) => !t.node.writable);
        if (locked) {
            await xpAlert('Error Deleting File or Folder', [
                `Cannot delete ${locked.node.name}: ${isDir(locked.node) ? 'it is a system folder.' : 'it is read-only.'}`,
                'Only files and folders you made in /home/guest can be deleted. Nothing was deleted.',
            ], 'error');
            return;
        }
        const ok = await xpConfirm(
            'Confirm Multiple File Delete',
            permanently
                ? `Are you sure you want to delete these ${targets.length} items?`
                : `Are you sure you want to send these ${targets.length} items to the Recycle Bin?`,
            { confirmLabel: 'Yes', cancelLabel: 'No', icon: 'warning' },
        );
        if (!ok) return;
        for (const t of targets) {
            // A folder earlier in the selection may already have taken this one with it.
            if (!lookup(t.path, procs)) continue;
            const problem = !permanently
                ? actions.recycleUserPath(t.path)
                : isDir(t.node)
                    ? actions.deleteUserFolder(t.path, true)
                    : actions.deleteUserFile(t.path);
            if (problem) {
                await xpAlert('Windows Explorer', [problem], 'error');
                break;
            }
        }
        playSound('recycle');
        setSelected(null);
    };

    /** Put keyboard focus back on an item after the rename box it was replaced by goes away. */
    const focusItem = (itemPath: string) =>
        requestAnimationFrame(() =>
            Array.from(listRef.current?.querySelectorAll<HTMLButtonElement>('button[data-path]') ?? [])
                .find((b) => b.dataset.path === itemPath)
                ?.focus(),
        );

    /** F2, or "Rename this file": only the visitor's own items; anything else says why not. */
    const startRename = ({ node: target, path: targetPath }: Entry) => {
        if (!target.writable) {
            void xpAlert('Error Renaming File or Folder', [
                `Cannot rename ${target.name}: ${isDir(target) ? 'it is a system folder.' : 'it is read-only.'}`,
                'Only files and folders you made in /home/guest can be renamed.',
            ], 'error');
            return;
        }
        setSelected(targetPath);
        setRenaming(targetPath);
    };

    const commitRename = async (targetPath: string, typed: string) => {
        setRenaming(null);
        const renamed = join(parentOf(targetPath), await renameUserPath(targetPath, typed));
        if (search?.results) {
            // A renamed result keeps its place under its new name — and a renamed folder takes the
            // results found inside it along, instead of leaving them on paths that are gone.
            const moved = (r: string) =>
                r === targetPath ? renamed : r.startsWith(targetPath + '/') ? renamed + r.slice(targetPath.length) : r;
            setSearch({ ...search, results: search.results.map(moved) });
        }
        setSelected(renamed);
        focusItem(renamed);
    };

    /** Search results are not a folder: nothing can be made or pasted into them. */
    const canWriteHere = !results && isWritableDir(path);
    const newFolder = async () => {
        const name = await makeNewFolder(path);
        if (!name) return;
        // XP made it and went straight into naming it.
        setSelected(join(path, name));
        setRenaming(join(path, name));
    };
    const deleteSelected = () => {
        if (selectedEntries.length) void deleteEntries(selectedEntries);
    };

    /* -------------------------------------------------------- Cut, Copy, Paste, New */

    /** Only the visitor's own things can be moved; anything can be copied, and Paste says if not. */
    const cut = async (targets: Entry[]) => {
        const locked = targets.find((t) => !t.node.writable);
        if (locked) {
            await xpAlert('Error Moving File or Folder', [
                `Cannot move ${locked.node.name}: ${isDir(locked.node) ? 'it is a system folder.' : 'it is read-only.'}`,
                'Only files and folders you made in /home/guest can be moved. Copy makes a copy you can change.',
            ], 'error');
            return;
        }
        setFileClipboard({ paths: targets.map((t) => t.path), cut: true });
    };
    const copy = (targets: Entry[]) => setFileClipboard({ paths: targets.map((t) => t.path), cut: false });
    const paste = async () => {
        if (!clipboard) return;
        if (!canWriteHere) {
            await xpAlert('Windows Explorer', [
                results ? 'Search results are not a folder, so nothing can be pasted into them.' : 'Nothing can be pasted here: this is part of the portfolio.',
                'Paste into My Documents, My Pictures or a folder you made.',
            ], 'error');
            return;
        }
        // What was pasted is what is selected afterwards, as in XP.
        const done = (await pasteInto(path)).filter((p) => parentOf(p) === path);
        if (done.length) {
            const last = done[done.length - 1];
            setSel({ all: done, primary: last, anchor: last });
            focusItem(last);
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
        setSelected(join(path, name));
        setRenaming(join(path, name));
    };

    /**
     * A drop on a folder, as XP handled one: the visitor's own file or folder moves (Ctrl copies
     * it), and one of the portfolio's is copied, as dragging from a CD was. A folder of the portfolio
     * cannot take anything, and says so.
     */
    const dropOn = async (target: Entry, from: string[], forceCopy: boolean) => {
        const items = from.filter((p) => p !== target.path && (forceCopy || parentOf(p) !== target.path));
        if (!items.length) return;
        if (!isWritableDir(target.path)) {
            const what = items.length === 1 ? items[0].slice(items[0].lastIndexOf('/') + 1) : `these ${items.length} items`;
            await xpAlert('Windows Explorer', [
                `Cannot put ${what} in ${target.node.name}: it is part of the portfolio.`,
                'Drop on My Documents, My Pictures or a folder you made.',
            ], 'error');
            return;
        }
        for (const item of items) {
            const mode = lookup(item, procs)?.writable && !forceCopy ? 'move' : 'copy';
            if ((await transferInto(target.path, [item], mode)).length === 0) break;
        }
    };

    /* ---------------------------------------------------------------- menus and keys */

    const viewItems = (): MenuItem[] => VIEWS.map((v) => ({ label: v.label, checked: view === v.id, action: () => setView(v.id) }));

    const itemMenu = (entry: Entry): MenuItem[] => {
        const targets = targetsFor(entry);
        const own = targets.every((t) => t.node.writable);
        return [
            { label: 'Open', bold: true, action: () => activate(entry.node, entry.path) },
            { divider: true },
            { label: 'Cut', accel: 'Ctrl+X', disabled: !own, action: () => void cut(targets) },
            { label: 'Copy', accel: 'Ctrl+C', action: () => copy(targets) },
            { divider: true },
            { label: 'Delete', accel: 'Del', disabled: !own, action: () => void deleteEntries(targets) },
            { label: 'Rename', accel: 'F2', disabled: !entry.node.writable, action: () => startRename(entry) },
            { divider: true },
            { label: 'Properties', accel: 'Alt+Enter', action: () => setProperties(targets.map((t) => t.path)) },
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
        { label: 'Properties', action: () => setProperties([path]) },
    ];

    /** Keys on an item belong to Explorer; they used to reach the desktop and act on its icons. */
    const onItemKey = (e: React.KeyboardEvent, entry: Entry) => {
        const ctrl = e.ctrlKey || e.metaKey;
        const key = e.key.toLowerCase();
        const handled =
            ['Enter', 'Delete', 'F2', 'Backspace'].includes(e.key) || (ctrl && ['x', 'c', 'v', 'a'].includes(key));
        if (!handled) return;
        e.preventDefault();
        e.stopPropagation();
        const targets = targetsFor(entry);
        if (e.key === 'Enter' && e.altKey) setProperties(targets.map((t) => t.path));
        else if (e.key === 'Enter') activate(entry.node, entry.path);
        else if (e.key === 'Delete') void deleteEntries(targets, e.shiftKey);
        else if (e.key === 'F2') startRename(entry);
        else if (e.key === 'Backspace') { if (parent) navigate(parent); }
        else if (key === 'a') selectAll();
        else if (key === 'x') void cut(targets);
        else if (key === 'c') copy(targets);
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
                    label="Search"
                    pressed={search !== null}
                    onClick={() => {
                        setShowFolders(false);
                        setSearch(search ? null : { name: '', text: '', under: path, found: null, more: false, results: null });
                    }}
                >
                    <span className="px-1 text-[11px]">Search</span>
                </ToolButton>
                <ToolButton
                    label="Folders"
                    pressed={showFolders}
                    onClick={() => {
                        setSearch(null);
                        setShowFolders(!showFolders);
                    }}
                >
                    <span className="px-1 text-[11px]">Folders</span>
                </ToolButton>
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
                {/* Task pane, in XP's order: tasks, places, details — or the Search Companion. */}
                {search ? (
                    <SearchPane
                        className="order-2 shrink-0 md:order-none md:w-[200px] md:overflow-y-auto"
                        state={search}
                        current={path}
                        onChange={(patch) => setSearch({ ...search, ...patch })}
                        onSearch={runSearch}
                        onClose={() => {
                            setSearch(null);
                            setSelected(null);
                        }}
                    />
                ) : showFolders ? (
                    <FolderTree
                        className="order-2 max-h-64 shrink-0 border-r border-[#aca899] md:order-none md:max-h-none md:w-[200px]"
                        current={path}
                        procs={procs}
                        revision={revision}
                        onOpen={navigate}
                        onDropOn={(target, from, copy) => {
                            const targetNode = lookup(target, procs);
                            if (targetNode) void dropOn({ node: targetNode, path: target }, from, copy);
                        }}
                    />
                ) : (
                <TaskPane className="order-2 shrink-0 md:order-none md:w-[200px] md:overflow-y-auto">
                    {(canWriteHere || selectedNode?.writable || (selectedEntries.length > 1 && selectedEntries.every((e) => e.node.writable))) && (
                        <TaskSection title="File and Folder Tasks" special>
                            {canWriteHere && <TaskLink label="Make a new folder" onClick={() => void newFolder()} />}
                            {selectedEntries.length > 1 && selectedEntries.every((e) => e.node.writable) && (
                                <TaskLink label="Delete the selected items" onClick={deleteSelected} />
                            )}
                            {selectedNode?.writable && (
                                <>
                                    <TaskLink label={`Rename this ${isDir(selectedNode) ? 'folder' : 'file'}`} onClick={() => selectedEntry && startRename(selectedEntry)} />
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
                        {selectedEntries.length > 1 ? (
                            <>
                                <TaskText strong>{selectedEntries.length} items selected.</TaskText>
                                {selectedEntries.some((e) => fileBytes(e.node) !== null) && (
                                    <TaskText>
                                        Total File Size: {(selectedEntries.reduce((n, e) => n + (fileBytes(e.node) ?? 0), 0) / 1024).toFixed(1)} KB
                                        {selectedEntries.some((e) => isDir(e.node)) && ' (files only; Properties counts folders too)'}
                                    </TaskText>
                                )}
                            </>
                        ) : selectedNode ? (
                            <>
                                <TaskText strong>{selectedNode.name}</TaskText>
                                <TaskText>
                                    {fileTypeName(selectedNode)}
                                    {isDir(selectedNode) && selectedPath && ` — ${(listDir(selectedPath, procs) ?? []).length} items`}
                                </TaskText>
                                {isFile(selectedNode) && selectedNode.modified !== undefined && (
                                    <TaskText>Date Modified: {new Date(selectedNode.modified).toLocaleString()}</TaskText>
                                )}
                                {sizeColumn(selectedNode) && <TaskText>Size: {sizeColumn(selectedNode)}</TaskText>}
                                {!selectedNode.writable && !(selectedPath && isWritableDir(selectedPath)) && <TaskText>Read-only</TaskText>}
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
                )}

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
                        if (ctrl && e.key.toLowerCase() === 'a') {
                            e.preventDefault();
                            e.stopPropagation();
                            selectAll();
                        } else if (ctrl && e.key.toLowerCase() === 'v') {
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
                    {shown.length === 0 ? (
                        <p className="p-4 text-xs text-gray-500">
                            {results
                                ? 'Search is complete. There are no results to display.'
                                : node
                                    ? 'This folder is empty.'
                                    : 'This folder no longer exists. It was moved or deleted.'}
                        </p>
                    ) : (
                        <FileList
                            entries={shown}
                            showFolder={results !== null}
                            view={view}
                            sortBy={sortBy}
                            onSort={setSortBy}
                            selection={sel.all}
                            renaming={renaming}
                            cutPaths={clipboard?.cut ? clipboard.paths : []}
                            listRef={listRef}
                            onPick={pick}
                            onActivate={(entry) => activate(entry.node, entry.path)}
                            onItemKey={onItemKey}
                            onItemMenu={(e, entry) => {
                                e.preventDefault();
                                e.stopPropagation();
                                // Right-clicking inside the selection keeps it; outside, it selects just that one.
                                if (!sel.all.includes(entry.path)) setSelected(entry.path);
                                setMenu({ x: e.clientX, y: e.clientY, items: itemMenu(entry) });
                            }}
                            onRenameCommit={(entry, typed) => void commitRename(entry.path, typed)}
                            onDropOn={(target, from, copy) => void dropOn(target, from, copy)}
                            onRenameCancel={(entry) => {
                                setRenaming(null);
                                focusItem(entry.path);
                            }}
                        />
                    )}
                </div>
            </div>

            <div className="flex shrink-0 justify-between gap-2 border-t border-[#aca899] bg-[#ece9d8] px-2 py-0.5 text-[10px] text-gray-700">
                <span>
                    {selectedEntries.length > 1
                        ? `${selectedEntries.length} objects selected`
                        : selectedNode
                        ? `1 object selected${sizeColumn(selectedNode) ? ` — ${sizeColumn(selectedNode)}` : ''}`
                        : results
                            ? `${results.length} object${results.length === 1 ? '' : 's'} found`
                            : `${children.length} object${children.length === 1 ? '' : 's'}`}
                </span>
                <span className="truncate font-mono">{prettyPath(path)}</span>
            </div>

            <ContextMenu x={menu?.x ?? 0} y={menu?.y ?? 0} isOpen={menu !== null} onClose={() => setMenu(null)} items={menu?.items ?? []} />
            {properties && <PropertiesDialog paths={properties} procs={procs} onClose={() => setProperties(null)} />}
        </div>
    );
}

function ToolButton({
    children,
    onClick,
    disabled,
    label,
    pressed,
}: {
    children: React.ReactNode;
    onClick: (e: React.MouseEvent<HTMLButtonElement>) => void;
    disabled?: boolean;
    label: string;
    /** A toggle, like XP's Search button while the Search Companion is open. */
    pressed?: boolean;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            disabled={disabled}
            title={label}
            aria-label={label}
            aria-pressed={pressed}
            className={`flex h-6 items-center justify-center rounded-[3px] border px-1 hover:border-[#7a7a6d] hover:bg-[#f2f1ea] active:translate-y-px disabled:text-gray-400 disabled:hover:border-transparent disabled:hover:bg-transparent ${
                pressed ? 'border-[#7a7a6d] bg-[#e3e1d6]' : 'border-transparent'
            }`}
        >
            {children}
        </button>
    );
}
