"use client";

import type { RefObject } from 'react';
import { APPS } from '@/constants/apps';
import { fileIconFor, fileTypeName } from '@/constants/fileIcons';
import { isDir, isFile, type VNode } from '@/system/vfs';
import RenameField from '@/components/ui/RenameField';
import XpIcon from '@/components/ui/XpIcon';

/**
 * The right-hand pane of Explorer, in XP's views: Tiles (XP's default for a folder), Icons, List
 * and Details. Every view is the same list of buttons — `ul li button[data-name]` — so selection,
 * keys and renaming behave identically whichever is showing; only the drawing differs.
 */

export type ViewMode = 'tiles' | 'icons' | 'list' | 'details';
export type SortKey = 'name' | 'size' | 'type' | 'modified';

export interface Entry {
    node: VNode;
    path: string;
}

/** What XP's Size column showed: nothing for a folder, whole kilobytes (at least 1) for a file. */
export function sizeColumn(node: VNode): string {
    if (isDir(node)) return '';
    if (node.src && !node.src.startsWith('data:')) return '';
    const chars = node.src ? Math.floor((node.src.length - node.src.indexOf(',') - 1) * 0.75) : node.content.length;
    return `${Math.max(1, Math.ceil(chars / 1024)).toLocaleString()} KB`;
}

const sizeValue = (node: VNode) => (isDir(node) ? -1 : node.src ? node.src.length : node.content.length);
const modifiedValue = (node: VNode) => (isFile(node) ? node.modified ?? 0 : 0);

/** XP's Arrange Icons By: folders first, then the chosen key, then the name. */
export function sortEntries(entries: Entry[], by: SortKey): Entry[] {
    const byName = (a: Entry, b: Entry) => a.node.name.localeCompare(b.node.name, undefined, { numeric: true });
    return [...entries].sort((a, b) => {
        const folders = Number(isDir(b.node)) - Number(isDir(a.node));
        if (folders) return folders;
        if (by === 'size') return sizeValue(b.node) - sizeValue(a.node) || byName(a, b);
        if (by === 'type') return fileTypeName(a.node).localeCompare(fileTypeName(b.node)) || byName(a, b);
        if (by === 'modified') return modifiedValue(b.node) - modifiedValue(a.node) || byName(a, b);
        return byName(a, b);
    });
}

interface FileListProps {
    entries: Entry[];
    view: ViewMode;
    sortBy: SortKey;
    onSort: (by: SortKey) => void;
    selected: string | null;
    renaming: string | null;
    /** The path on the clipboard from a Cut: drawn faded, as XP did, until it is pasted. */
    cutPath: string | null;
    listRef: RefObject<HTMLUListElement>;
    onSelect: (name: string) => void;
    onActivate: (entry: Entry) => void;
    onItemKey: (e: React.KeyboardEvent, entry: Entry) => void;
    onItemMenu: (e: React.MouseEvent, entry: Entry) => void;
    onRenameCommit: (entry: Entry, typed: string) => void;
    onRenameCancel: (entry: Entry) => void;
}

const LAYOUT: Record<ViewMode, string> = {
    tiles: 'grid grid-cols-1 gap-1 sm:grid-cols-2 xl:grid-cols-3',
    icons: 'grid grid-cols-[repeat(auto-fill,minmax(84px,1fr))] gap-1',
    list: 'grid grid-cols-2 gap-x-2 sm:grid-cols-3 lg:grid-cols-4',
    details: 'flex flex-col',
};

const DETAIL_COLUMNS = 'grid grid-cols-[minmax(0,1fr)_64px] sm:grid-cols-[minmax(0,1fr)_64px_120px] md:grid-cols-[minmax(0,1fr)_64px_120px_140px]';

export default function FileList(props: FileListProps) {
    const { entries, view, sortBy, onSort, selected, renaming, cutPath, listRef } = props;
    const iconSize = view === 'tiles' ? 48 : view === 'icons' ? 32 : 16;

    const title = (node: VNode) =>
        isDir(node)
            ? node.description ?? node.name
            : isFile(node) && node.open
                ? `Opens ${APPS[node.open.appId]?.title ?? node.open.appId}`
                : node.name;

    const body = (entry: Entry, isSelected: boolean) => {
        const { node } = entry;
        const muted = isSelected ? 'text-blue-100' : 'text-gray-500';
        if (view === 'details') {
            return (
                <>
                    <span className="flex min-w-0 items-center gap-1.5">
                        <XpIcon src={fileIconFor(node, entry.path)} size={16} className="shrink-0" />
                        <span className="truncate">{node.name}</span>
                    </span>
                    <span className={`text-right ${muted}`}>{sizeColumn(node)}</span>
                    <span className={`hidden truncate sm:block ${muted}`}>{fileTypeName(node)}</span>
                    <span className={`hidden truncate md:block ${muted}`}>
                        {isFile(node) && node.modified ? new Date(node.modified).toLocaleString() : ''}
                    </span>
                </>
            );
        }
        if (view === 'tiles') {
            return (
                <>
                    <XpIcon src={fileIconFor(node, entry.path)} size={48} className="shrink-0" />
                    <span className="min-w-0">
                        <span className="block truncate">{node.name}</span>
                        <span className={`block truncate ${muted}`}>{fileTypeName(node)}</span>
                        {sizeColumn(node) && <span className={`block truncate ${muted}`}>{sizeColumn(node)}</span>}
                    </span>
                </>
            );
        }
        return (
            <>
                <XpIcon src={fileIconFor(node, entry.path)} size={iconSize} className="shrink-0" />
                <span className={view === 'icons' ? 'line-clamp-2 break-all' : 'truncate'}>{node.name}</span>
            </>
        );
    };

    const itemClass = (isSelected: boolean) => {
        const shape =
            view === 'tiles'
                ? 'flex items-center gap-2 p-1.5'
                : view === 'icons'
                    ? 'flex flex-col items-center gap-1 p-1.5 text-center'
                    : view === 'details'
                        ? `${DETAIL_COLUMNS} items-center gap-2 px-1.5 py-0.5`
                        : 'flex items-center gap-1.5 px-1.5 py-0.5';
        return `${shape} w-full rounded-sm text-left text-[11px] outline-none focus-visible:outline-dotted focus-visible:outline-1 ${
            isSelected ? 'bg-[#316ac5] text-white' : 'hover:bg-[#e8f0fe]'
        }`;
    };

    const header = (key: SortKey, label: string, className = '') => (
        <button
            type="button"
            onClick={() => onSort(key)}
            aria-pressed={sortBy === key}
            title={`Arrange by ${label}`}
            className={`border-r border-[#d6d2c2] px-1.5 py-0.5 text-left font-normal hover:bg-[#f7f6f0] ${className}`}
        >
            {label}
            {sortBy === key && <span aria-hidden> ▾</span>}
        </button>
    );

    return (
        <>
            {view === 'details' && (
                <div className={`${DETAIL_COLUMNS} sticky top-0 z-[1] border-b border-[#d6d2c2] bg-[#ece9d8] text-[11px]`}>
                    {header('name', 'Name')}
                    {header('size', 'Size', 'text-right')}
                    {header('type', 'Type', 'hidden sm:block')}
                    {header('modified', 'Date Modified', 'hidden md:block')}
                </div>
            )}
            <ul ref={listRef} className={LAYOUT[view]}>
                {entries.map((entry) => {
                    const { node } = entry;
                    const isSelected = selected === node.name;
                    const faded = cutPath === entry.path ? 'opacity-50' : '';
                    if (renaming === node.name) {
                        return (
                            <li key={node.name}>
                                <div className={`${itemClass(true)} ${faded}`}>
                                    <XpIcon src={fileIconFor(node, entry.path)} size={view === 'details' ? 16 : iconSize} className="shrink-0" />
                                    <RenameField
                                        name={node.name}
                                        isFolder={isDir(node)}
                                        onCommit={(typed) => props.onRenameCommit(entry, typed)}
                                        onCancel={() => props.onRenameCancel(entry)}
                                    />
                                </div>
                            </li>
                        );
                    }
                    return (
                        <li key={node.name} className={faded}>
                            <button
                                type="button"
                                data-name={node.name}
                                onClick={() => props.onSelect(node.name)}
                                onFocus={() => props.onSelect(node.name)}
                                onDoubleClick={() => props.onActivate(entry)}
                                onKeyDown={(e) => props.onItemKey(e, entry)}
                                onContextMenu={(e) => props.onItemMenu(e, entry)}
                                className={itemClass(isSelected)}
                                title={title(node)}
                            >
                                {body(entry, isSelected)}
                            </button>
                        </li>
                    );
                })}
            </ul>
        </>
    );
}
