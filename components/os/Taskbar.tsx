"use client";

import { useSystemStore } from '@/store/useSystemStore';
import { APPS } from '@/constants/apps';
import { useState, useEffect } from 'react';
import { Monitor, Volume2, Wifi } from 'lucide-react';
import StartMenu from './StartMenu';
import { playSound } from '@/utils/sound';

export default function Taskbar() {
    const { windows, activeWindowId, actions } = useSystemStore();
    const [startOpen, setStartOpen] = useState(false);
    const [time, setTime] = useState(new Date());

    useEffect(() => {
        const timer = setInterval(() => setTime(new Date()), 1000);
        return () => clearInterval(timer);
    }, []);

    const toggleStart = () => {
        playSound('click');
        setStartOpen(!startOpen);
    };

    return (
        <>
            {startOpen && <StartMenu onClose={() => setStartOpen(false)} />}

            <div className="fixed bottom-0 left-0 right-0 h-10 bg-win-taskbar flex items-center justify-between px-2 shadow-lg z-50 border-t-2 border-white/30 text-white select-none">

                {/* Start Button */}
                <button
                    onClick={toggleStart}
                    className={`
            flex items-center gap-2 px-3 py-1 rounded-sm shadow-md font-bold italic tracking-wide transition-all
            ${startOpen
                            ? 'bg-gradient-to-b from-green-700 to-green-500 inset-shadow-sm'
                            : 'bg-gradient-to-b from-green-500 to-green-600 hover:brightness-110 active:brightness-90'}
          `}
                    style={{
                        boxShadow: startOpen ? 'inset 2px 2px 4px rgba(0,0,0,0.4)' : '1px 1px 0px rgba(255,255,255,0.4), inset 1px 1px 0px rgba(255,255,255,0.2)'
                    }}
                >
                    <div className="w-5 h-5 bg-white rounded-full flex items-center justify-center shadow-sm">
                        {/* Windows Logo simplified */}
                        <div className="grid grid-cols-2 gap-[1px]">
                            <div className="w-1.5 h-1.5 bg-red-500" />
                            <div className="w-1.5 h-1.5 bg-green-500" />
                            <div className="w-1.5 h-1.5 bg-blue-500" />
                            <div className="w-1.5 h-1.5 bg-yellow-500" />
                        </div>
                    </div>
                    <span className="text-white drop-shadow-md">Start</span>
                </button>

                {/* Divider */}
                <div className="w-[2px] h-6 mx-2 bg-black/20 border-r border-white/10" />

                {/* Running Apps */}
                <div className="flex-1 flex items-center gap-1 overflow-x-auto no-scrollbar">
                    {windows.map((win) => {
                        const app = Object.values(APPS).find(a => a.id === win.appId);
                        const isActive = activeWindowId === win.id && !win.isMinimized;
                        const Icon = app?.icon || Monitor;

                        return (
                            <button
                                key={win.id}
                                onClick={() => {
                                    playSound('click');
                                    if (isActive) actions.minimizeWindow(win.id);
                                    else {
                                        actions.restoreWindow(win.id);
                                        actions.focusWindow(win.id);
                                    }
                                }}
                                className={`
                   flex items-center gap-2 px-2 py-1 min-w-[120px] max-w-[200px] h-8 rounded-sm text-xs truncate transition-all
                   ${isActive
                                        ? 'bg-blue-800/80 shadow-inner text-white font-medium italic'
                                        : 'bg-blue-600/50 hover:bg-blue-500/50 text-white/90 shadow-sm'}
                 `}
                                style={{
                                    boxShadow: isActive ? 'inset 1px 1px 3px rgba(0,0,0,0.4)' : '1px 1px 0px rgba(255,255,255,0.2)'
                                }}
                            >
                                {app?.iconAsset ? (
                                    <img src={app.iconAsset} alt={win.title} className="w-3.5 h-3.5 shrink-0" />
                                ) : (
                                    <Icon size={14} className="shrink-0" />
                                )}
                                <span className="truncate">{win.title}</span>
                            </button>
                        );
                    })}
                </div>

                {/* System Tray */}
                <div className="flex items-center gap-3 px-3 py-1 bg-blue-400/20 rounded-sm border border-blue-300/10 inset-shadow-sm ml-2">
                    <Volume2 size={14} className="hover:text-blue-200 cursor-pointer" />
                    <Wifi size={14} className="hover:text-blue-200 cursor-pointer" />
                    <div className="text-xs font-mono ml-1">
                        {time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </div>
                </div>

            </div>
        </>
    );
}
