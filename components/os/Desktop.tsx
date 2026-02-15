"use client";

import { useSystemStore } from '@/store/useSystemStore';
import { APPS, DESKTOP_ICONS } from '@/constants/apps';
import Taskbar from './Taskbar';
import Window from './Window';
import { motion } from 'framer-motion';
import { playSound } from '@/utils/sound';
import { useEffect, useState } from 'react';
import DesktopIcon from './DesktopIcon';
import ContextMenu from '@/components/ui/ContextMenu';

export default function Desktop() {
    const { windows, actions } = useSystemStore();
    const [selectedIconId, setSelectedIconId] = useState<string | null>(null);
    const [contextMenu, setContextMenu] = useState({ isOpen: false, x: 0, y: 0 });

    const handleContextMenu = (e: React.MouseEvent) => {
        e.preventDefault();
        setContextMenu({
            isOpen: true,
            x: e.clientX,
            y: e.clientY
        });
    };

    useEffect(() => {
        const konamiCode = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a'];
        let cursor = 0;

        const onKey = (e: KeyboardEvent) => {
            if (e.key === konamiCode[cursor]) {
                cursor++;
                if (cursor === konamiCode.length) {
                    playSound('startup'); // Play sound or unlock something
                    alert("Easter Egg Unlocked! Unlimited Power!");
                    cursor = 0;
                }
            } else {
                cursor = 0;
            }
        };

        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, []);

    return (
        <div className="h-full w-full bg-[#1c55ee] relative font-sans overflow-hidden">
            {/* Background - Classic Bliss Wallpaper */}
            <div
                className="absolute inset-0 bg-cover bg-center bg-no-repeat"
                style={{ backgroundImage: "url('/wallpapers/Bliss.jpg')" }}
            />

            {/* Desktop Icons Grid */}
            <div
                className="absolute inset-0"
                onClick={() => setSelectedIconId(null)}
                onContextMenu={handleContextMenu}
            >
                {DESKTOP_ICONS.map((appId, index) => {
                    const app = APPS[appId];
                    if (!app) return null;

                    // Calculate initial position (Vertical Column Layout)
                    // Windows XP style: Top to bottom, then left to right.
                    // We need window height to determine when to wrap.
                    // Since specific window height might vary, we can estimate or use a ref.
                    // For simplicity, let's assume a safe height or just use flex/grid? 
                    // No, for drag and drop to work with absolute positioning store, 
                    // we need to calculate specific coordinates.

                    // Let's assume a grid cell of 100x100
                    const cellHeight = 100;
                    const cellWidth = 100;
                    const rowsPerColumn = Math.floor((typeof window !== 'undefined' ? window.innerHeight : 800) / cellHeight) - 1; // -1 for taskbar/margin

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
                        />
                    );
                })}
            </div>

            <ContextMenu
                x={contextMenu.x}
                y={contextMenu.y}
                isOpen={contextMenu.isOpen}
                onClose={() => setContextMenu({ ...contextMenu, isOpen: false })}
                items={[
                    { label: "Arrange Icons By", disabled: true },
                    { label: "Refresh", action: () => window.location.reload() },
                    { divider: true },
                    { label: "New", disabled: true },
                    { divider: true },
                    { label: "Properties", disabled: true },
                    { label: "Personalize", action: () => actions.openWindow('settings', 'Settings') }, // Future
                ]}
            />

            {/* Windows Layer */}
            {windows.map((win) => (
                <Window key={win.id} window={win} />
            ))}

            {/* Welcome Balloon */}
            <motion.div
                initial={{ opacity: 0, y: 50, scale: 0.8 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ delay: 1, duration: 0.5 }}
                className="absolute bottom-12 right-4 w-72 bg-[#FFFFE1] border border-black rounded-lg shadow-xl p-3 z-40 text-black text-xs font-sans pointer-events-none origin-bottom-right"
            >
                <div className="flex justify-between items-start mb-1">
                    <h3 className="font-bold text-sm">Welcome to Gaurav's XP</h3>
                    <button className="text-gray-500 hover:text-black">×</button>
                </div>
                <p>A faithful XP-inspired interface, custom-built to showcase my work and attention to detail.</p>
                <div className="mt-2 text-blue-800 underline cursor-pointer hover:text-blue-600 pointer-events-auto flex gap-2">
                    <span>Get Started:</span>
                    <button onClick={() => actions.openWindow('about', 'About Me')}>About Me</button>
                    <span>|</span>
                    <button onClick={() => actions.openWindow('projects', 'My Projects')}>My Projects</button>
                </div>

                {/* Balloon Tail */}
                <div className="absolute -bottom-2 right-8 w-4 h-4 bg-[#FFFFE1] border-b border-r border-black transform rotate-45"></div>
            </motion.div>

            {/* Taskbar */}
            <Taskbar />
        </div>
    );
}
