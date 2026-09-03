"use client";


import { useSystemStore } from '@/store/useSystemStore';
import { HardDrive } from 'lucide-react';
import { PROJECTS, ROLES, SYSTEM } from '@/content';

interface Drive {
    id: string;
    label: string;
    icon: string;
    type: 'drive' | 'folder' | 'app';
    /** Real count of what the volume holds, e.g. "4 projects". Never a fabricated capacity. */
    info?: string;
    onOpen?: () => void;
}

export default function MyComputerApp() {
    const actions = useSystemStore((s) => s.actions);
    const currentPath = 'My Computer';

    /*
     * Capacity bars ("18 GB free of 40 GB") were invented numbers on a panel that claims to
     * report storage. Volumes now report what they actually contain, counted from `@/content`.
     */
    const drives: Drive[] = [
        {
            id: 'c',
            label: 'Local Disk (C:)',
            icon: '/icons/My Computer.ico',
            type: 'drive',
            info: SYSTEM.name,
            onOpen: () => actions.openWindow('explorer', undefined, { path: '/' }),
        },
        {
            id: 'd',
            label: 'Projects (D:)',
            icon: '/icons/Folder Closed.ico',
            type: 'drive',
            info: `${PROJECTS.length} projects`,
            onOpen: () => actions.openWindow('projects'),
        },
        {
            id: 'e',
            label: 'Experience (E:)',
            icon: '/icons/List File.ico',
            type: 'drive',
            info: `${ROLES.length} roles`,
            onOpen: () => actions.openWindow('about'),
        },
    ];

    const folders: Drive[] = [
        { id: 'docs', label: 'Resume', icon: '/icons/documents.png', type: 'folder', onOpen: () => actions.openWindow('resume') },
        { id: 'pictures', label: 'My Pictures', icon: '/icons/Display.ico', type: 'folder', onOpen: () => actions.openWindow('imageviewer') },
        { id: 'music', label: 'My Music', icon: '/icons/Music.ico', type: 'folder', onOpen: () => actions.openWindow('music') },
        { id: 'profile', label: 'My Profile', icon: '/icons/User Personalization.ico', type: 'folder', onOpen: () => actions.openWindow('about') },
    ];

    const allItems = [...folders, ...drives];

    return (
        <div className="h-full flex flex-col bg-[#ece9d8] font-sans select-none">
            {/*
              * The toolbar here was six inert controls — Back, Forward, Up, Refresh, Search,
              * Folders — plus an address field and a Go button that went nowhere. This window
              * has no navigation history to move through, so they are gone rather than faked.
              * What remains is a read-only location display.
              */}
            <div className="flex items-center gap-2 border-b border-gray-400 bg-[#ece9d8] px-2 py-1">
                <HardDrive size={12} aria-hidden />
                <span className="text-xs">Location</span>
                <div className="flex-1 border border-gray-500 bg-white px-2 py-0.5 text-xs">{currentPath}</div>
            </div>

            {/* Body */}
            <div className="flex flex-1 flex-col overflow-hidden md:flex-row">
                {/* Sidebar. Stacks above the content on a phone. */}
                <div className="shrink-0 bg-gradient-to-b from-[#7da2ce] to-[#3a6ea5] p-2 overflow-y-auto text-white text-xs md:w-52">
                    {/* Links that fired `alert('Not implemented')` have been removed, not relabelled. */}
                    <ExplorerPanel title="System Tasks">
                        <SidebarLink label="View system information" onClick={() => actions.openWindow('settings')} />
                        <SidebarLink label="Change a setting" onClick={() => actions.openWindow('settings')} />
                        <SidebarLink label="Browse the filesystem" onClick={() => actions.openWindow('explorer')} />
                        <SidebarLink label="Open a terminal" onClick={() => actions.openWindow('terminal')} />
                    </ExplorerPanel>

                    <ExplorerPanel title="Other Places">
                        <SidebarLink label="My Documents" onClick={() => actions.openWindow('resume')} />
                        <SidebarLink label="My Projects" onClick={() => actions.openWindow('projects')} />
                        <SidebarLink label="Control Panel" onClick={() => actions.openWindow('settings')} />
                    </ExplorerPanel>

                    <ExplorerPanel title="Details">
                        <p className="font-bold mb-1">My Computer</p>
                        <p className="text-blue-100 text-[10px]">System Folder</p>
                    </ExplorerPanel>
                </div>

                {/* Main */}
                <div className="flex-1 bg-white overflow-y-auto p-3">
                    <h3 className="font-bold text-sm mb-2 border-b border-gray-300 pb-1">Files Stored on This Computer</h3>
                    <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
                        {folders.map(f => (
                            <FileTile key={f.id} item={f} onOpen={() => f.onOpen?.()} />
                        ))}
                    </div>

                    <h3 className="font-bold text-sm mb-2 border-b border-gray-300 pb-1">Hard Disk Drives</h3>
                    <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                        {drives.map(d => (
                            <button
                                key={d.id}
                                className="flex cursor-pointer gap-2 rounded p-2 text-left hover:bg-blue-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                                onClick={() => d.onOpen?.()}
                            >
                                <img src={d.icon} alt="" className="h-10 w-10 object-contain" />
                                <div className="min-w-0 flex-1">
                                    <div className="truncate text-xs font-medium">{d.label}</div>
                                    {d.info && <div className="text-[10px] text-gray-500">{d.info}</div>}
                                </div>
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {/* Status Bar */}
            <div className="bg-[#ece9d8] border-t border-gray-400 px-2 py-0.5 text-xs flex justify-between text-gray-700">
                <span>{allItems.length} objects</span>
                <span>My Computer</span>
            </div>
        </div>
    );
}

function ExplorerPanel({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <div className="mb-3 bg-white/20 rounded overflow-hidden">
            <div className="bg-gradient-to-r from-[#f0b765] to-[#cf8b1f] px-2 py-1 font-bold text-[11px] text-white">{title}</div>
            <div className="p-2 bg-white/10 space-y-1">{children}</div>
        </div>
    );
}

function SidebarLink({ label, onClick }: { label: string; onClick: () => void }) {
    return (
        <button onClick={onClick} className="text-left text-[11px] hover:underline w-full">
            🔧 {label}
        </button>
    );
}

function FileTile({ item, onOpen }: { item: Drive; onOpen: () => void }) {
    return (
        <button
            onDoubleClick={onOpen}
            onClick={onOpen}
            className="flex flex-col items-center p-2 hover:bg-blue-100 rounded text-xs"
        >
            <img src={item.icon} alt={item.label} className="w-10 h-10 object-contain mb-1" />
            <span className="text-center leading-tight">{item.label}</span>
        </button>
    );
}
