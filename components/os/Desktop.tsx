"use client";

import { useSystemStore, WALLPAPERS } from '@/store/useSystemStore';
import { APPS, DESKTOP_ICONS } from '@/constants/apps';
import Taskbar from './Taskbar';
import Window from './Window';
import { AnimatePresence, motion } from 'framer-motion';
import { playSound } from '@/utils/sound';
import { useEffect, useState } from 'react';
import DesktopIcon from './DesktopIcon';
import ContextMenu from '@/components/ui/ContextMenu';
import { PROFILE, SYSTEM } from '@/content';

export default function Desktop() {
    const { windows, actions, wallpaperId, deletedAppIds } = useSystemStore();
    const [selectedIconId, setSelectedIconId] = useState<string | null>(null);
    const [desktopMenu, setDesktopMenu] = useState({ isOpen: false, x: 0, y: 0 });
    const [iconMenu, setIconMenu] = useState<{ isOpen: boolean; x: number; y: number; appId: string | null }>({ isOpen: false, x: 0, y: 0, appId: null });
    const [showBalloon, setShowBalloon] = useState(true);

    const visibleIcons = DESKTOP_ICONS.filter(id => !deletedAppIds.includes(id));
    const wallpaper = WALLPAPERS.find(w => w.id === wallpaperId) || WALLPAPERS[0];

    const handleDesktopContextMenu = (e: React.MouseEvent) => {
        e.preventDefault();
        setDesktopMenu({ isOpen: true, x: e.clientX, y: e.clientY });
        setIconMenu({ isOpen: false, x: 0, y: 0, appId: null });
    };

    const handleIconContextMenu = (e: React.MouseEvent, appId: string) => {
        e.preventDefault();
        e.stopPropagation();
        setIconMenu({ isOpen: true, x: e.clientX, y: e.clientY, appId });
        setDesktopMenu({ isOpen: false, x: 0, y: 0 });
        setSelectedIconId(appId);
    };

    // Keyboard shortcuts
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            // Konami
            // (handled separately below)
            const target = e.target as HTMLElement;
            const inForm = ['INPUT', 'TEXTAREA'].includes(target.tagName) || target.isContentEditable;

            // Alt+F4 closes active window
            if (e.altKey && e.key === 'F4') {
                e.preventDefault();
                const active = useSystemStore.getState().activeWindowId;
                if (active) {
                    playSound('close');
                    actions.closeWindow(active);
                }
            }

            // Escape closes context menus and deselects
            if (e.key === 'Escape' && !inForm) {
                setDesktopMenu({ isOpen: false, x: 0, y: 0 });
                setIconMenu({ isOpen: false, x: 0, y: 0, appId: null });
                setSelectedIconId(null);
            }

            // Delete removes selected icon to recycle bin
            if (e.key === 'Delete' && selectedIconId && !inForm) {
                const app = APPS[selectedIconId];
                if (app && selectedIconId !== 'trash') {
                    if (confirm(`Send "${app.title}" to the Recycle Bin?`)) {
                        actions.deleteIcon(selectedIconId, app.title, app.iconAsset || '');
                        setSelectedIconId(null);
                    }
                }
            }

            // Enter opens selected icon
            if (e.key === 'Enter' && selectedIconId && !inForm) {
                const app = APPS[selectedIconId];
                if (app) {
                    playSound('open');
                    actions.openWindow(selectedIconId, app.title);
                }
            }
        };

        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [selectedIconId, actions]);

    useEffect(() => {
        const konamiCode = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a'];
        let cursor = 0;

        const onKey = (e: KeyboardEvent) => {
            // Ignore keystrokes aimed at an input — typing "…b, a" in the terminal used to fire this.
            const target = e.target as HTMLElement;
            if (['INPUT', 'TEXTAREA'].includes(target.tagName) || target.isContentEditable) {
                cursor = 0;
                return;
            }

            if (e.key.toLowerCase() === konamiCode[cursor].toLowerCase()) {
                cursor++;
                if (cursor === konamiCode.length) {
                    playSound('tada');
                    alert(
                        `🎉 Easter Egg Unlocked!\n\nThanks for exploring ${SYSTEM.name}.\n\n` +
                        'Try the Command Prompt next — it runs on a real filesystem. Start with `ls ~`.',
                    );
                    cursor = 0;
                }
            } else {
                cursor = 0;
            }
        };

        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, []);

    const wallpaperStyle: React.CSSProperties = wallpaper.color
        ? { backgroundColor: wallpaper.color }
        : { backgroundImage: `url('${wallpaper.url}')`, backgroundSize: 'cover', backgroundPosition: 'center' };

    return (
        <div className="h-full w-full bg-[#1c55ee] relative font-sans overflow-hidden">
            {/* Background */}
            <div className="absolute inset-0" style={wallpaperStyle} />

            {/* Desktop Icons */}
            <div
                className="absolute inset-0"
                onClick={() => setSelectedIconId(null)}
                onContextMenu={handleDesktopContextMenu}
            >
                {visibleIcons.map((appId, index) => {
                    const app = APPS[appId];
                    if (!app) return null;

                    const cellHeight = 90;
                    const cellWidth = 90;
                    const rowsPerColumn = Math.floor((typeof window !== 'undefined' ? window.innerHeight - 80 : 700) / cellHeight);
                    const safeRows = Math.max(1, rowsPerColumn);
                    const col = Math.floor(index / safeRows);
                    const row = index % safeRows;

                    const initialX = 10 + (col * cellWidth);
                    const initialY = 10 + (row * cellHeight);

                    return (
                        <DesktopIcon
                            key={appId}
                            appId={appId}
                            app={app}
                            initialPosition={{ x: initialX, y: initialY }}
                            isSelected={selectedIconId === appId}
                            onSelect={() => setSelectedIconId(appId)}
                            onContextMenu={(e) => handleIconContextMenu(e, appId)}
                        />
                    );
                })}
            </div>

            {/* Desktop context menu */}
            <ContextMenu
                x={desktopMenu.x}
                y={desktopMenu.y}
                isOpen={desktopMenu.isOpen}
                onClose={() => setDesktopMenu({ ...desktopMenu, isOpen: false })}
                items={[
                    { label: "Arrange Icons By", disabled: true },
                    { label: "Refresh", action: () => window.location.reload() },
                    { divider: true },
                    { label: "Paste", disabled: true },
                    { label: "Paste Shortcut", disabled: true },
                    { divider: true },
                    { label: "New Folder", disabled: true },
                    { divider: true },
                    { label: "Properties", action: () => actions.openWindow('settings') },
                ]}
            />

            {/* Icon context menu */}
            <ContextMenu
                x={iconMenu.x}
                y={iconMenu.y}
                isOpen={iconMenu.isOpen}
                onClose={() => setIconMenu({ ...iconMenu, isOpen: false })}
                items={(() => {
                    if (!iconMenu.appId) return [];
                    const app = APPS[iconMenu.appId];
                    if (!app) return [];
                    const id = iconMenu.appId;
                    return [
                        { label: "Open", action: () => { playSound('open'); actions.openWindow(id, app.title); } },
                        { label: "Run as...", disabled: true },
                        { divider: true },
                        { label: "Send to", disabled: true },
                        { label: "Cut", disabled: true },
                        { label: "Copy", disabled: true },
                        { divider: true },
                        { label: "Create Shortcut", disabled: true },
                        {
                            label: "Delete",
                            disabled: id === 'trash',
                            action: () => {
                                if (id === 'trash') return;
                                if (confirm(`Send "${app.title}" to the Recycle Bin?`)) {
                                    actions.deleteIcon(id, app.title, app.iconAsset || '');
                                }
                            }
                        },
                        { label: "Rename", disabled: true },
                        { divider: true },
                        { label: "Properties", action: () => alert(`${app.title}\nType: Application\nSize: 0 bytes`) },
                    ];
                })()}
            />

            {/* Windows Layer */}
            <AnimatePresence>
                {windows.map((win) => (
                    <Window key={win.id} win={win} />
                ))}
            </AnimatePresence>

            {/* Welcome Balloon */}
            {showBalloon && (
                <motion.div
                    initial={{ opacity: 0, y: 50, scale: 0.8 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    transition={{ delay: 1, duration: 0.5 }}
                    className="absolute bottom-12 right-4 w-72 bg-[#FFFFE1] border border-black rounded-lg shadow-xl p-3 z-40 text-black text-xs font-sans origin-bottom-right"
                >
                    <div className="flex justify-between items-start mb-1">
                        <h3 className="font-bold text-sm">Welcome to {SYSTEM.name}</h3>
                        <button
                            onClick={() => setShowBalloon(false)}
                            className="text-gray-500 hover:text-black px-1 leading-none"
                            aria-label="Dismiss"
                        >
                            ×
                        </button>
                    </div>
                    {/*
                      * Wayfinding. The links point at what a visitor actually came for — the old
                      * balloon led with Minesweeper — but the XP balloon styling and voice stay.
                      */}
                    <p>
                        A faithful XP-inspired desktop. Try right-clicking the desktop, or start here:
                    </p>
                    <div className="mt-2 text-blue-800 flex gap-2 flex-wrap">
                        <button className="underline hover:text-blue-600" onClick={() => actions.openWindow('resume')}>Resume</button>
                        <span>|</span>
                        <button className="underline hover:text-blue-600" onClick={() => actions.openWindow('projects')}>My Projects</button>
                        <span>|</span>
                        <button className="underline hover:text-blue-600" onClick={() => actions.openWindow('contact')}>Contact Me</button>
                        <span>|</span>
                        <button className="underline hover:text-blue-600" onClick={() => actions.openWindow('minesweeper')}>Minesweeper</button>
                    </div>
                    <p className="mt-2 text-[11px] text-gray-600">
                        The Command Prompt is real — try <code className="font-mono">ls ~</code>.
                    </p>

                    <div className="absolute -bottom-2 right-8 w-4 h-4 bg-[#FFFFE1] border-b border-r border-black transform rotate-45"></div>
                </motion.div>
            )}

            {/* Taskbar */}
            <Taskbar />
        </div>
    );
}
