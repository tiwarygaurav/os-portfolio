"use client";

import { useState } from 'react';
import { useSystemStore } from '@/store/useSystemStore';
import { APPS } from '@/constants/apps';
import { FILE_ICONS } from '@/constants/fileIcons';
import { PROJECTS, ROLES, SYSTEM } from '@/content';
import { DOCUMENTS_PATH, PICTURES_PATH } from '@/system/vfs';
import { useIsMobile } from '@/utils/viewport';
import XpIcon from '@/components/ui/XpIcon';
import { TaskLink, TaskPane, TaskSection, TaskText } from '@/components/ui/TaskPane';

interface Item {
    id: string;
    label: string;
    icon: string;
    /** Real count of what the volume holds, e.g. "4 projects". Never a fabricated capacity. */
    info?: string;
    /** What Details says it is. */
    kind: string;
    onOpen: () => void;
}

/**
 * My Computer: the visitor's folders and the portfolio's "drives".
 *
 * It selects on a click and opens on a double-click (or Enter), as XP did — a tap on a phone — and
 * Details describes the selection. Capacity bars ("18 GB free of 40 GB") were invented numbers on a
 * panel that claims to report storage; volumes report what they actually contain, counted from
 * `@/content`.
 */
export default function MyComputerApp() {
    const actions = useSystemStore((s) => s.actions);
    const [selected, setSelected] = useState<string | null>(null);
    // A phone has no double-click: a tap opens, as it does for the desktop icons.
    const isMobile = useIsMobile();
    const open = (appId: string, payload?: Record<string, string>) => actions.openWindow(appId, undefined, payload);

    const folders: Item[] = [
        // Real folders: what a visitor saves in Notepad lands in My Documents.
        { id: 'docs', label: 'My Documents', icon: FILE_ICONS.userFolder, kind: 'File Folder', onOpen: () => open('explorer', { path: DOCUMENTS_PATH }) },
        { id: 'pictures', label: 'My Pictures', icon: FILE_ICONS.pictures, kind: 'File Folder', onOpen: () => open('explorer', { path: PICTURES_PATH }) },
        { id: 'music', label: 'My Music', icon: FILE_ICONS.music, kind: 'The media player\'s playlist', onOpen: () => open('music') },
        { id: 'resume', label: 'Resume', icon: APPS.resume?.iconAsset ?? FILE_ICONS.text, kind: 'Document', onOpen: () => open('resume') },
        { id: 'profile', label: 'My Profile', icon: APPS.about?.iconAsset ?? FILE_ICONS.userFolder, kind: 'About the owner', onOpen: () => open('about') },
    ];

    const drives: Item[] = [
        { id: 'c', label: 'Local Disk (C:)', icon: FILE_ICONS.drive, info: SYSTEM.name, kind: 'Local Disk', onOpen: () => open('explorer', { path: '/' }) },
        { id: 'd', label: 'Projects (D:)', icon: FILE_ICONS.folder, info: `${PROJECTS.length} projects`, kind: 'Local Disk', onOpen: () => open('projects') },
        { id: 'e', label: 'Experience (E:)', icon: FILE_ICONS.folder, info: `${ROLES.length} roles`, kind: 'Local Disk', onOpen: () => open('about') },
    ];

    const all = [...folders, ...drives];
    const current = all.find((i) => i.id === selected);

    const tile = (item: Item, wide: boolean) => (
        <button
            key={item.id}
            type="button"
            onClick={() => {
                setSelected(item.id);
                if (isMobile) item.onOpen();
            }}
            onFocus={() => setSelected(item.id)}
            onDoubleClick={item.onOpen}
            onKeyDown={(e) => {
                if (e.key !== 'Enter') return;
                // Enter opens here; it must not also reach the desktop and open a desktop icon.
                e.preventDefault();
                e.stopPropagation();
                item.onOpen();
            }}
            className={`flex gap-2 rounded-sm p-1.5 text-left text-xs outline-none focus-visible:outline-dotted focus-visible:outline-1 ${
                wide ? 'items-center' : 'flex-col items-center text-center'
            } ${selected === item.id ? 'bg-[#316ac5] text-white' : 'hover:bg-[#e8f0fe]'}`}
        >
            <XpIcon src={item.icon} size={wide ? 40 : 32} />
            <span className="min-w-0">
                <span className="block truncate">{item.label}</span>
                {wide && item.info && (
                    <span className={`block text-[10px] ${selected === item.id ? 'text-blue-100' : 'text-gray-500'}`}>{item.info}</span>
                )}
            </span>
        </button>
    );

    return (
        <div className="flex h-full select-none flex-col bg-white font-sans">
            {/*
              * The toolbar here was six inert controls — Back, Forward, Up, Refresh, Search,
              * Folders — plus an address field and a Go button that went nowhere. This window
              * has no navigation history to move through, so they are gone rather than faked.
              * What remains is the address, read-only.
              */}
            <div className="xp-addressbar">
                <span className="hidden sm:inline">Address</span>
                <div className="xp-addressbar-field">
                    <XpIcon src={APPS.mycomputer?.iconAsset ?? FILE_ICONS.drive} size={16} />
                    <span>My Computer</span>
                </div>
            </div>

            <div className="flex flex-1 flex-col overflow-y-auto md:flex-row md:overflow-hidden">
                <TaskPane className="order-2 shrink-0 md:order-none md:w-[200px] md:overflow-y-auto">
                    {/* Links that fired `alert('Not implemented')` were removed, not relabelled. */}
                    <TaskSection title="System Tasks" special>
                        <TaskLink label="View system information" onClick={() => open('sysinfo')} />
                        <TaskLink label="Change a setting" onClick={() => open('settings')} />
                        <TaskLink label="Browse the filesystem" onClick={() => open('explorer')} />
                        <TaskLink label="Open a command prompt" onClick={() => open('terminal')} />
                    </TaskSection>
                    <TaskSection title="Other Places">
                        <TaskLink label="My Documents" icon={<XpIcon src={FILE_ICONS.userFolder} size={16} />} onClick={() => open('explorer', { path: DOCUMENTS_PATH })} />
                        <TaskLink label="My Projects" icon={<XpIcon src={APPS.projects?.iconAsset ?? FILE_ICONS.folder} size={16} />} onClick={() => open('projects')} />
                        <TaskLink label="Control Panel" icon={<XpIcon src={APPS.settings?.iconAsset ?? FILE_ICONS.program} size={16} />} onClick={() => open('settings')} />
                    </TaskSection>
                    <TaskSection title="Details">
                        <TaskText strong>{current?.label ?? 'My Computer'}</TaskText>
                        <TaskText>{current ? current.kind : 'System Folder'}</TaskText>
                        {current?.info && <TaskText>{current.info}</TaskText>}
                    </TaskSection>
                </TaskPane>

                <div className="order-1 flex-1 p-3 md:order-none md:overflow-y-auto" onClick={(e) => e.target === e.currentTarget && setSelected(null)}>
                    <h3 className="mb-2 border-b border-[#aca899] pb-1 text-xs font-bold text-[#0b3aa4]">Files Stored on This Computer</h3>
                    <div className="mb-4 grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5">{folders.map((f) => tile(f, false))}</div>

                    <h3 className="mb-2 border-b border-[#aca899] pb-1 text-xs font-bold text-[#0b3aa4]">Hard Disk Drives</h3>
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">{drives.map((d) => tile(d, true))}</div>
                </div>
            </div>

            <div className="flex justify-between border-t border-[#aca899] bg-[#ece9d8] px-2 py-0.5 text-xs text-gray-700">
                <span>{current ? `1 object selected` : `${all.length} objects`}</span>
                <span>My Computer</span>
            </div>
        </div>
    );
}
