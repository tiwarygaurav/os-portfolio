"use client";

import { useState } from 'react';
import { ChevronDown, ChevronUp, type LucideIcon } from 'lucide-react';

/**
 * Explorer-style shell: task sidebar + content pane.
 *
 * The previous version carried a full fake browser toolbar — Back, Forward, Search, Folders, Go
 * and an editable address field, none of which did anything. They are gone rather than
 * reimplemented: nothing here needs browser history.
 *
 * What remains of the address bar is a *read-only* path display showing the VFS location of the
 * content — the same path that works in the terminal. It reports state; it never invites input.
 */

interface SidebarItem {
    label: string;
    icon?: LucideIcon;
    action?: () => void;
}

interface SidebarSection {
    title: string;
    items: SidebarItem[];
    defaultOpen?: boolean;
}

interface ExplorerLayoutProps {
    /** VFS path this window is showing, e.g. `~/about.md`. Displayed, not editable. */
    path: string;
    sidebarSections: SidebarSection[];
    children: React.ReactNode;
}

export default function ExplorerLayout({ path, sidebarSections, children }: ExplorerLayoutProps) {
    return (
        <div className="flex h-full flex-col bg-[#f1f1f1] font-sans">
            <div className="flex shrink-0 items-center gap-2 border-b border-[#d0cfc4] bg-[#ece9d8] px-2 py-1 text-xs">
                <span className="text-gray-500">Location</span>
                <div className="flex-1 border border-[#c8c6b8] bg-white px-2 py-0.5 font-mono text-black">
                    {path}
                </div>
                <span className="text-[10px] text-gray-500">also reachable from the terminal</span>
            </div>

            <div className="flex flex-1 overflow-hidden">
                <div className="w-48 shrink-0 space-y-3 overflow-y-auto bg-gradient-to-b from-[#748aff] to-[#4057d2] p-3">
                    {sidebarSections.map((section) => (
                        <CollapsibleSection
                            key={section.title}
                            title={section.title}
                            items={section.items}
                            defaultOpen={section.defaultOpen}
                        />
                    ))}
                </div>

                <div className="flex-1 overflow-y-auto bg-white p-6">{children}</div>
            </div>
        </div>
    );
}

function CollapsibleSection({ title, items, defaultOpen = true }: SidebarSection) {
    const [isOpen, setIsOpen] = useState(defaultOpen);
    const panelId = `panel-${title.replace(/\s+/g, '-').toLowerCase()}`;

    return (
        <section className="overflow-hidden rounded shadow-sm">
            <button
                onClick={() => setIsOpen(!isOpen)}
                aria-expanded={isOpen}
                aria-controls={panelId}
                className="flex w-full cursor-pointer items-center justify-between bg-gradient-to-r from-blue-100 to-blue-200 p-1 px-2 hover:brightness-105 focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
            >
                <span className="text-xs font-bold text-[#215dc6]">{title}</span>
                {isOpen ? (
                    <ChevronUp size={14} className="rounded-full border border-blue-200 bg-white text-blue-400" aria-hidden />
                ) : (
                    <ChevronDown size={14} className="rounded-full border border-blue-200 bg-white text-blue-400" aria-hidden />
                )}
            </button>

            {isOpen && (
                <div id={panelId} className="space-y-1 border-t border-white/50 bg-[#d6dff7] p-2">
                    {items.map((item) =>
                        item.action ? (
                            <button
                                key={item.label}
                                onClick={item.action}
                                className="flex w-full items-center gap-2 py-0.5 text-left text-xs text-[#215dc6] hover:text-blue-800 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                            >
                                {item.icon && <item.icon size={14} aria-hidden />}
                                <span>{item.label}</span>
                            </button>
                        ) : (
                            // No action: render as text, never as a button that does nothing.
                            <div key={item.label} className="flex items-center gap-2 py-0.5 text-xs text-[#1c3f8f]">
                                {item.icon && <item.icon size={14} aria-hidden />}
                                <span>{item.label}</span>
                            </div>
                        ),
                    )}
                </div>
            )}
        </section>
    );
}
