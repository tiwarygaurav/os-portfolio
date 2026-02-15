
"use client";

import { ArrowLeft, ArrowRight, Search, Folder, ChevronUp, ChevronDown } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/utils/cn'; // Ensure this utility exists

interface SidebarItem {
    label: string;
    icon?: any; // Component
    action?: () => void;
}

interface SidebarSection {
    title: string;
    items: SidebarItem[];
    defaultOpen?: boolean;
}

interface ExplorerLayoutProps {
    windowId: string; // To handle window specific actions if needed
    title: string;
    address: string;
    sidebarSections: SidebarSection[];
    children: React.ReactNode;
}

export default function ExplorerLayout({ windowId, title, address, sidebarSections, children }: ExplorerLayoutProps) {
    return (
        <div className="flex flex-col h-full bg-[#f1f1f1] font-sans">
            {/* Toolbar (Standard Buttons) */}
            <div className="bg-[#ece9d8] border-b border-[#d0cfc4] p-1 flex items-center gap-2 select-none">
                <div className="flex items-center gap-1 pr-2 border-r border-[#daca9e]">
                    <button className="flex items-center gap-1 px-2 py-1 rounded hover:bg-white/50 disabled:opacity-50 text-xs">
                        <div className="bg-green-500 rounded-full p-0.5 text-white"><ArrowLeft size={12} /></div>
                        Back
                    </button>
                    <button className="flex items-center gap-1 px-1 py-1 rounded hover:bg-white/50 disabled:opacity-50 text-xs">
                        <div className="bg-green-500 rounded-full p-0.5 text-white"><ArrowRight size={12} /></div>
                    </button>
                </div>

                <button className="flex items-center gap-1 px-2 py-1 rounded hover:bg-white/50 text-xs">
                    <Search size={16} className="text-blue-600" />
                    Search
                </button>
                <button className="flex items-center gap-1 px-2 py-1 rounded hover:bg-white/50 text-xs">
                    <Folder size={16} className="text-[#e2c057]" />
                    Folders
                </button>
            </div>

            {/* Address Bar */}
            <div className="bg-[#ece9d8] border-b border-[#d0cfc4] p-1 flex items-center gap-2 text-xs select-none">
                <span className="text-gray-500 pl-1">Address</span>
                <div className="flex-1 bg-white border border-[#7f9db9] px-2 py-0.5 flex items-center gap-2 shadow-inner">
                    <img src="/icons/ie.png" alt="" className="w-3 h-3 opacity-50" onError={(e) => e.currentTarget.style.display = 'none'} />
                    <span className="text-black">{address}</span>
                </div>
                <button className="flex items-center gap-1 px-2 py-0.5 bg-[#f1f1f1] border border-gray-400 hover:border-blue-400 text-xs">
                    Go
                </button>
            </div>

            {/* Main Body Split */}
            <div className="flex-1 flex overflow-hidden">
                {/* Sidebar (Left) */}
                <div className="w-48 bg-gradient-to-b from-[#748aff] to-[#4057d2] p-3 overflow-y-auto space-y-3 shrink-0">
                    {sidebarSections.map((section, idx) => (
                        <CollapsibleSection key={idx} title={section.title} items={section.items} defaultOpen={section.defaultOpen} />
                    ))}
                </div>

                {/* Main Content (Right) */}
                <div className="flex-1 bg-white overflow-y-auto p-6 relative">
                    {/* Top gradient/header box effect often seen in specific folders, but generally white for 'About' usually */}
                    <div className="absolute top-0 left-0 right-0 h-16 bg-gradient-to-r from-[#f0f0f0] to-white pointer-events-none" />
                    {children}
                </div>
            </div>
        </div>
    );
}

function CollapsibleSection({ title, items, defaultOpen = true }: SidebarSection) {
    const [isOpen, setIsOpen] = useState(defaultOpen);

    return (
        <div className="rounded overflow-hidden shadow-sm">
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="w-full bg-gradient-to-r from-blue-100 to-blue-200 p-1 px-2 flex justify-between items-center cursor-pointer hover:brightness-105"
            >
                <span className="font-bold text-[#215dc6] text-xs">{title}</span>
                {isOpen ? <ChevronUp size={14} className="text-blue-400 bg-white rounded-full border border-blue-200" /> : <ChevronDown size={14} className="text-blue-400 bg-white rounded-full border border-blue-200" />}
            </button>

            {isOpen && (
                <div className="bg-[#d6dff7] p-2 space-y-1 border-t border-white/50">
                    {items.map((item, idx) => (
                        <button
                            key={idx}
                            onClick={item.action}
                            className="flex items-center gap-2 w-full text-left text-xs text-[#215dc6] hover:underline hover:text-blue-800 py-0.5"
                        >
                            {item.icon && <item.icon size={14} />}
                            <span>{item.label}</span>
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}
