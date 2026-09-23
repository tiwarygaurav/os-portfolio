"use client";

import { useState } from 'react';
import { useSystemStore, type RecycledItem } from '@/store/useSystemStore';
import { APPS } from '@/constants/apps';
import { FILE_ICONS } from '@/constants/fileIcons';
import { DOCUMENTS_PATH } from '@/system/vfs';
import { xpAlert, xpConfirm } from '@/utils/dialog';
import { playSound } from '@/utils/sound';
import { useIsMobile } from '@/utils/viewport';
import XpIcon from '@/components/ui/XpIcon';
import { TaskLink, TaskPane, TaskSection, TaskText } from '@/components/ui/TaskPane';

/**
 * The Recycle Bin: desktop icons, and the visitor's files and folders, that were deleted.
 *
 * XP's layout: select an item, then Restore this item from the task pane; Delete removes it for
 * good; Empty the Recycle Bin asks first. A file goes back to the folder it came from, and a folder
 * that has gone since is made again — unless something now stands at that path, in which case it
 * says what, and nothing is overwritten. Deleting from the Command Prompt (`rm`) skips the bin, as
 * `del` did.
 */

/** XP's Type column. */
function typeOf(item: RecycledItem): string {
    if (item.kind !== 'file') return 'Shortcut';
    if (item.item.folders.includes(item.item.path)) return 'File Folder';
    const f = item.item.files[item.item.path];
    if (f?.mime === 'image/png') return 'PNG Image';
    if (f?.mime === 'image/jpeg') return 'JPEG Image';
    return 'Text Document';
}

function iconOf(item: RecycledItem): string {
    if (item.kind !== 'file') return item.icon;
    if (item.item.folders.includes(item.item.path)) return FILE_ICONS.folder;
    const mime = item.item.files[item.item.path]?.mime;
    return mime === 'image/png' || mime === 'image/jpeg' ? FILE_ICONS.picture : FILE_ICONS.text;
}

export default function RecycleBinApp() {
    const recycleBin = useSystemStore((s) => s.recycleBin);
    const actions = useSystemStore((s) => s.actions);
    const [selected, setSelected] = useState<string | null>(null);
    // A phone has no double-click or right-click: a tap selects, and the task pane acts.
    const isMobile = useIsMobile();
    const current = recycleBin.find((r) => r.id === selected);
    const isEmpty = recycleBin.length === 0;
    const binIcon = isEmpty ? FILE_ICONS.binEmpty : FILE_ICONS.binFull;

    const restore = async (item: RecycledItem) => {
        const problem = actions.restoreItem(item.id);
        if (problem) await xpAlert('Recycle Bin', [problem], 'error');
        else setSelected(null);
    };

    const restoreAll = async () => {
        for (const item of recycleBin) {
            const problem = actions.restoreItem(item.id);
            if (problem) {
                await xpAlert('Recycle Bin', [problem], 'error');
                return;
            }
        }
        setSelected(null);
    };

    const purge = async (item: RecycledItem) => {
        const ok = await xpConfirm('Confirm File Delete', `Are you sure you want to permanently delete '${item.name}'?`, {
            confirmLabel: 'Yes',
            cancelLabel: 'No',
            icon: 'warning',
        });
        if (!ok) return;
        actions.purgeRecycledItem(item.id);
        setSelected(null);
        playSound('recycle');
    };

    const emptyBin = async () => {
        const n = recycleBin.length;
        if (!n) return;
        const ok = await xpConfirm(
            n === 1 ? 'Confirm File Delete' : 'Confirm Multiple File Delete',
            n === 1 ? 'Are you sure you want to permanently delete this item?' : `Are you sure you want to delete these ${n} items?`,
            { confirmLabel: 'Yes', cancelLabel: 'No', icon: 'warning' },
        );
        if (!ok) return;
        actions.emptyRecycleBin();
        setSelected(null);
        playSound('recycle');
    };

    return (
        <div className="flex h-full select-none flex-col bg-white font-sans">
            <div className="xp-addressbar">
                <span className="hidden sm:inline">Address</span>
                <div className="xp-addressbar-field">
                    <XpIcon src={binIcon} size={16} />
                    <span>Recycle Bin</span>
                </div>
            </div>

            <div className="flex flex-1 flex-col overflow-y-auto md:flex-row md:overflow-hidden">
                <TaskPane className="order-2 shrink-0 md:order-none md:w-[200px] md:overflow-y-auto">
                    <TaskSection title="Recycle Bin Tasks" special>
                        {isEmpty && <TaskText>The Recycle Bin is empty.</TaskText>}
                        {!isEmpty && <TaskLink label="Empty the Recycle Bin" onClick={() => void emptyBin()} />}
                        {!isEmpty && !current && <TaskLink label="Restore all items" onClick={() => void restoreAll()} />}
                        {current && <TaskLink label="Restore this item" onClick={() => void restore(current)} />}
                    </TaskSection>
                    <TaskSection title="Other Places">
                        <TaskLink label="My Documents" icon={<XpIcon src={FILE_ICONS.userFolder} size={16} />} onClick={() => actions.openWindow('explorer', undefined, { path: DOCUMENTS_PATH })} />
                        <TaskLink label="My Computer" icon={<XpIcon src={APPS.mycomputer?.iconAsset ?? FILE_ICONS.drive} size={16} />} onClick={() => actions.openWindow('mycomputer')} />
                    </TaskSection>
                    <TaskSection title="Details">
                        {current ? (
                            <>
                                <TaskText strong>{current.name}</TaskText>
                                <TaskText>{typeOf(current)}</TaskText>
                                <TaskText>From: {current.origin}</TaskText>
                                <TaskText>Deleted: {new Date(current.deletedAt).toLocaleString()}</TaskText>
                            </>
                        ) : (
                            <>
                                <TaskText strong>Recycle Bin</TaskText>
                                <TaskText>
                                    Deleted desktop icons, and files and folders deleted in Explorer, wait here until
                                    the bin is emptied. Shift+Delete, and rm in the Command Prompt, skip it.
                                </TaskText>
                            </>
                        )}
                    </TaskSection>
                </TaskPane>

                <div className="order-1 min-h-[8rem] flex-1 md:order-none md:overflow-y-auto" onClick={(e) => e.target === e.currentTarget && setSelected(null)}>
                    {isEmpty ? (
                        <p className="p-4 text-xs text-gray-500">This folder is empty.</p>
                    ) : (
                        <table className="w-full border-collapse text-xs">
                            <thead>
                                <tr className="bg-[#ece9d8] text-left">
                                    <th className="border-b border-r border-[#d6d2c2] px-2 py-0.5 font-normal">Name</th>
                                    <th className="hidden border-b border-r border-[#d6d2c2] px-2 py-0.5 font-normal sm:table-cell">Original Location</th>
                                    <th className="border-b border-r border-[#d6d2c2] px-2 py-0.5 font-normal">Date Deleted</th>
                                    <th className="hidden border-b border-[#d6d2c2] px-2 py-0.5 font-normal md:table-cell">Type</th>
                                </tr>
                            </thead>
                            <tbody>
                                {recycleBin.map((item) => {
                                    const isSelected = item.id === selected;
                                    return (
                                        <tr
                                            key={item.id}
                                            tabIndex={0}
                                            aria-selected={isSelected}
                                            data-bin-item={item.name}
                                            onClick={() => setSelected(item.id)}
                                            onFocus={() => setSelected(item.id)}
                                            onKeyDown={(e) => {
                                                // The bin's keys stay in the bin: Delete used to be free to reach the desktop.
                                                if (e.key !== 'Delete' && e.key !== 'Enter') return;
                                                e.preventDefault();
                                                e.stopPropagation();
                                                if (e.key === 'Delete') void purge(item);
                                                else void restore(item);
                                            }}
                                            className={`cursor-default outline-none ${isSelected ? 'bg-[#316ac5] text-white' : 'hover:bg-[#e8f0fe]'}`}
                                        >
                                            <td className="px-2 py-1">
                                                <span className="flex items-center gap-2">
                                                    <XpIcon src={iconOf(item)} size={16} className={item.kind === 'file' ? undefined : 'opacity-70'} />
                                                    <span className="truncate">{item.name}</span>
                                                </span>
                                            </td>
                                            <td className={`hidden px-2 py-1 sm:table-cell ${isSelected ? '' : 'text-gray-600'}`}>{item.origin}</td>
                                            <td className={`px-2 py-1 ${isSelected ? '' : 'text-gray-600'}`}>{new Date(item.deletedAt).toLocaleString()}</td>
                                            <td className={`hidden px-2 py-1 md:table-cell ${isSelected ? '' : 'text-gray-600'}`}>{typeOf(item)}</td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    )}
                    {isMobile && current && (
                        <p className="p-2 text-[11px] text-gray-600">Restore this item is in Recycle Bin Tasks, below.</p>
                    )}
                </div>
            </div>

            <div className="flex justify-between border-t border-[#aca899] bg-[#ece9d8] px-2 py-0.5 text-xs text-gray-700">
                <span>{current ? '1 object selected' : `${recycleBin.length} object${recycleBin.length === 1 ? '' : 's'}`}</span>
                <span>Recycle Bin</span>
            </div>
        </div>
    );
}
