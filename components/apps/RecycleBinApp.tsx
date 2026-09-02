"use client";

import Image from 'next/image';
import { useSystemStore } from '@/store/useSystemStore';
import { Trash2, RotateCw } from 'lucide-react';

export default function RecycleBinApp() {
    const recycleBin = useSystemStore((s) => s.recycleBin);
    const emptyRecycleBin = useSystemStore((s) => s.actions.emptyRecycleBin);
    const restoreItem = useSystemStore((s) => s.actions.restoreItem);
    const isEmpty = recycleBin.length === 0;

    return (
        <div className="h-full flex flex-col bg-[#ece9d8] font-sans select-none">
            {/* Toolbar */}
            <div className="flex items-center gap-1 px-2 py-1 border-b border-gray-400">
                <button
                    onClick={emptyRecycleBin}
                    disabled={isEmpty}
                    className="flex items-center gap-1 px-2 py-1 text-xs hover:bg-[#d9d6c4] active:translate-y-px disabled:opacity-40"
                >
                    <Trash2 size={14} /> Empty the Recycle Bin
                </button>
                <div className="h-5 w-px bg-gray-400 mx-1" />
                <span className="text-xs text-gray-600">{recycleBin.length} item{recycleBin.length === 1 ? '' : 's'}</span>
            </div>

            {/* Body */}
            <div className="flex flex-1 flex-col overflow-hidden md:flex-row">
                {/* Sidebar */}
                <div className="shrink-0 bg-gradient-to-b from-[#7da2ce] to-[#3a6ea5] p-2 overflow-y-auto text-white text-xs md:w-52">
                    <div className="mb-3 bg-white/20 rounded overflow-hidden">
                        <div className="bg-gradient-to-r from-[#f0b765] to-[#cf8b1f] px-2 py-1 font-bold text-[11px] text-white">Recycle Bin Tasks</div>
                        <div className="p-2 space-y-2">
                            <button onClick={emptyRecycleBin} disabled={isEmpty} className="text-left hover:underline w-full disabled:opacity-40">
                                Empty the Recycle Bin
                            </button>
                            <button
                                onClick={() => recycleBin.forEach(r => restoreItem(r.id))}
                                disabled={isEmpty}
                                className="text-left hover:underline w-full disabled:opacity-40"
                            >
                                Restore all items
                            </button>
                        </div>
                    </div>

                    <div className="mb-3 bg-white/20 rounded overflow-hidden">
                        <div className="bg-gradient-to-r from-[#f0b765] to-[#cf8b1f] px-2 py-1 font-bold text-[11px] text-white">Details</div>
                        <div className="p-2">
                            <p className="font-bold">Recycle Bin</p>
                            <p className="text-[10px] text-blue-100 mt-1">
                                To delete a desktop icon: drag it onto the Recycle Bin icon on the
                                desktop, right-click it and choose Delete, or select it and press
                                the Delete key. Deleted icons can be restored from here.
                            </p>
                        </div>
                    </div>
                </div>

                {/* Main */}
                <div className="flex-1 bg-white overflow-y-auto p-3">
                    {isEmpty ? (
                        <div className="h-full flex items-center justify-center flex-col text-gray-400 text-sm">
                            <Trash2 size={64} className="mb-2 text-gray-300" />
                            <span>This folder is empty.</span>
                        </div>
                    ) : (
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="bg-[#ece9d8] text-left">
                                    <th className="border-b border-gray-300 p-1 font-normal">Name</th>
                                    <th className="border-b border-gray-300 p-1 font-normal">Original Location</th>
                                    <th className="border-b border-gray-300 p-1 font-normal">Date Deleted</th>
                                    <th className="border-b border-gray-300 p-1 font-normal w-20"></th>
                                </tr>
                            </thead>
                            <tbody>
                                {recycleBin.map(item => (
                                    <tr key={item.id} className="hover:bg-blue-50">
                                        <td className="p-1 flex items-center gap-2">
                                            {/* `unoptimized`: these are the desktop's own .ico/.png files at 20 px; the optimizer has nothing to add. */}
                                            <Image src={item.icon} alt="" width={20} height={20} unoptimized className="w-5 h-5 object-contain opacity-70" />
                                            <span>{item.name}</span>
                                        </td>
                                        <td className="p-1 text-xs text-gray-600">{item.origin}</td>
                                        <td className="p-1 text-xs text-gray-600">{new Date(item.deletedAt).toLocaleString()}</td>
                                        <td className="p-1">
                                            <button
                                                onClick={() => restoreItem(item.id)}
                                                className="flex items-center gap-1 px-2 py-0.5 text-xs bg-[#ece9d8] border border-gray-500 hover:bg-blue-100"
                                                title="Restore"
                                            >
                                                <RotateCw size={10} /> Restore
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
            </div>

            <div className="bg-[#ece9d8] border-t border-gray-400 px-2 py-0.5 text-xs text-gray-700">
                {recycleBin.length} object{recycleBin.length === 1 ? '' : 's'}
            </div>
        </div>
    );
}
