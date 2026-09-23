"use client";

import { useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import XpIcon from '@/components/ui/XpIcon';

/**
 * Explorer-style shell: XP's task pane beside a content pane.
 *
 * The previous version carried a full fake browser toolbar — Back, Forward, Search, Folders, Go
 * and an editable address field, none of which did anything. They are gone rather than
 * reimplemented: nothing here needs browser history.
 *
 * What remains of the address bar is a *read-only* path display showing the VFS location of the
 * content — the same path that works in the terminal. It reports state; it never invites input.
 * The task pane is drawn from `app/luna.css` (`.xp-taskpane*`), so it follows the colour scheme.
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
    /** XP drew the first, most important group with a dark header (e.g. "System Tasks"). */
    special?: boolean;
}

interface ExplorerLayoutProps {
    /** VFS path this window is showing, e.g. `~/about.md`. Displayed, not editable. */
    path: string;
    sidebarSections: SidebarSection[];
    children: React.ReactNode;
}

export default function ExplorerLayout({ path, sidebarSections, children }: ExplorerLayoutProps) {
    return (
        <div className="flex h-full flex-col bg-white">
            <div className="xp-addressbar">
                <span className="hidden sm:inline">Address</span>
                <div className="xp-addressbar-field" data-tip="The same path works in the Command Prompt">
                    <XpIcon src="/icons/xp/folder-open.png" size={16} />
                    <span>{path}</span>
                </div>
            </div>

            {/*
              * On a phone this becomes one scrolling column with the content first and the task
              * panes beneath it: a 200px sidebar beside content on a 390px screen leaves neither
              * readable, and putting the panes on top buries what the visitor came for.
              * `order` moves them visually while the DOM keeps the sidebar first for screen
              * readers. `flex-col-reverse` would do the same but starts the scroll at the visual
              * bottom, so the window opened showing the end of the content.
              */}
            <div className="flex flex-1 flex-col overflow-y-auto md:flex-row md:overflow-hidden">
                <div className="xp-taskpane order-2 shrink-0 md:order-none md:w-[200px] md:overflow-y-auto">
                    {sidebarSections.map((section) => (
                        <CollapsibleSection key={section.title} {...section} />
                    ))}
                </div>

                <div className="order-1 flex-1 bg-white p-4 md:order-none md:overflow-y-auto md:p-6">{children}</div>
            </div>
        </div>
    );
}

/** XP's round double-chevron: pointing up to collapse, down to expand. */
function Chevrons({ open }: { open: boolean }) {
    return (
        <svg width="9" height="9" viewBox="0 0 9 9" aria-hidden style={{ transform: open ? undefined : 'rotate(180deg)' }}>
            <path d="M1 4.6 4.5 1.2 8 4.6M1 8.2 4.5 4.8 8 8.2" fill="none" stroke="currentColor" strokeWidth="1.5" />
        </svg>
    );
}

function CollapsibleSection({ title, items, defaultOpen = true, special = false }: SidebarSection) {
    const [isOpen, setIsOpen] = useState(defaultOpen);
    const panelId = `panel-${title.replace(/\s+/g, '-').toLowerCase()}`;

    return (
        <section className={`xp-taskpane-section${special ? ' is-special' : ''}`}>
            <button
                type="button"
                onClick={() => setIsOpen(!isOpen)}
                aria-expanded={isOpen}
                aria-controls={panelId}
                className="xp-taskpane-head"
            >
                <span>{title}</span>
                <span className="xp-taskpane-chevron">
                    <Chevrons open={isOpen} />
                </span>
            </button>

            {isOpen && (
                <div id={panelId} className="xp-taskpane-body">
                    {items.map((item) =>
                        item.action ? (
                            <button key={item.label} type="button" onClick={item.action} className="xp-taskpane-link">
                                {item.icon && <item.icon size={16} aria-hidden />}
                                <span>{item.label}</span>
                            </button>
                        ) : (
                            // No action: render as text, never as a button that does nothing.
                            <div key={item.label} className="xp-taskpane-text flex items-start gap-1.5">
                                {item.icon && <item.icon size={16} aria-hidden />}
                                <span>{item.label}</span>
                            </div>
                        ),
                    )}
                </div>
            )}
        </section>
    );
}
