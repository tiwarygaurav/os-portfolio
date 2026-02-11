"use client";

import { useSystemStore } from '@/store/useSystemStore';
import { APPS, DESKTOP_ICONS } from '@/constants/apps';
import Taskbar from './Taskbar';
import Window from './Window';
import { motion } from 'framer-motion';
import { playSound } from '@/utils/sound';
import { useEffect } from 'react';

export default function Desktop() {
    const { windows, actions } = useSystemStore();

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
            {/* Background - Classic Bliss Vibe (CSS Gradient) */}
            <div className="absolute inset-0 bg-gradient-to-br from-blue-400 via-blue-600 to-blue-800" />
            <div className="absolute bottom-0 w-full h-1/3 bg-gradient-to-t from-green-600 to-transparent opacity-50" />

            {/* Desktop Icons Grid */}
            <div className="absolute inset-0 p-4 grid grid-cols-[repeat(auto-fill,100px)] grid-rows-[repeat(auto-fill,100px)] gap-4 content-start">
                {DESKTOP_ICONS.map((appId) => {
                    const app = APPS[appId];
                    if (!app) return null;

                    return (
                        <button
                            key={appId}
                            onDoubleClick={() => {
                                playSound('open');
                                actions.openWindow(appId, app.title);
                            }}
                            className="flex flex-col items-center gap-1 p-2 rounded hover:bg-white/10 focus:bg-blue-700/50 focus:border focus:border-dotted focus:border-white transition-colors group text-shadow-sm w-24 h-24"
                        >
                            <div className="filter drop-shadow-md group-hover:drop-shadow-xl transition-all">
                                <app.icon size={48} className="text-white" />
                            </div>
                            <span className="text-white text-xs font-medium text-center drop-shadow-md line-clamp-2 px-1 rounded bg-black/0 group-focus:bg-blue-800">
                                {app.title}
                            </span>
                        </button>
                    );
                })}
            </div>

            {/* Windows Layer */}
            {windows.map((win) => (
                <Window key={win.id} window={win} />
            ))}

            {/* Taskbar */}
            <Taskbar />
        </div>
    );
}
