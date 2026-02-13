"use client";

import { useSystemStore, AppWindow } from '@/store/useSystemStore';
import { APPS } from '@/constants/apps';
import { X, Minus, Square, Maximize2 } from 'lucide-react';
import { motion, useDragControls } from 'framer-motion';
import { useState, useRef, useEffect } from 'react';

// Import apps lazily or directly if small
import AboutApp from '@/components/apps/AboutApp';
import ProjectsApp from '@/components/apps/ProjectsApp';
import SkillsApp from '@/components/apps/SkillsApp';
import ContactApp from '@/components/apps/ContactApp';
import TerminalApp from '@/components/apps/TerminalApp';
import ResumeApp from '@/components/apps/ResumeApp';
import MusicPlayerApp from '@/components/apps/MusicPlayerApp';
import PaintApp from '@/components/apps/PaintApp';

// Mapping for dynamic rendering
const APP_COMPONENTS: Record<string, any> = {
    about: AboutApp,
    projects: ProjectsApp,
    skills: SkillsApp,
    contact: ContactApp,
    terminal: TerminalApp,
    resume: ResumeApp,
    music: MusicPlayerApp,
    paint: PaintApp,
};

interface WindowProps {
    window: AppWindow;
}

export default function Window({ window }: WindowProps) {
    const { actions, activeWindowId } = useSystemStore();
    const isActive = activeWindowId === window.id;
    const appConfig = APPS[window.appId];
    const AppBody = APP_COMPONENTS[window.appId] || (() => <div className="p-4">App not found</div>);

    const controls = useDragControls();

    const handlePointerDown = () => {
        actions.focusWindow(window.id);
    };

    if (window.isMinimized) return null;

    return (
        <motion.div
            drag={!window.isMaximized}
            dragControls={controls}
            dragListener={false} // Only drag from header
            dragMomentum={false}
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{
                width: window.isMaximized ? '100%' : window.size.width,
                height: window.isMaximized ? 'calc(100% - 40px)' : window.size.height,
                x: window.isMaximized ? 0 : window.position.x,
                y: window.isMaximized ? 0 : window.position.y,
                top: window.isMaximized ? 0 : undefined,
                left: window.isMaximized ? 0 : undefined,
                opacity: 1,
                scale: 1,
            }}
            style={{
                position: 'absolute',
                zIndex: window.zIndex
            }}
            className={`
        flex flex-col shadow-2xl overflow-hidden
        ${window.isMaximized ? '' : 'rounded-t-xl rounded-b-md'}
        ${isActive ? 'z-50' : 'z-0 opacity-95'}
      `}
            onPointerDown={handlePointerDown}
        >
            {/* XP Title Bar */}
            <div
                onPointerDown={(e) => {
                    controls.start(e);
                    handlePointerDown();
                }}
                onDoubleClick={() => appConfig.canMaximize && actions.maximizeWindow(window.id)}
                className={`
          flex items-center justify-between px-3 h-8 select-none cursor-default
          bg-gradient-to-b from-[#0058ee] via-[#0073e6] to-[#0058ee]
          text-white text-shadow-md border-b border-[#003da8]
          ${window.isMaximized ? '' : 'rounded-t-lg'}
        `}
            >
                <div className="flex items-center gap-2">
                    {appConfig.iconAsset ? (
                        <img src={appConfig.iconAsset} alt={window.title} className="w-4 h-4 drop-shadow-md" />
                    ) : (
                        appConfig.icon && <appConfig.icon size={16} className="filter drop-shadow-md" />
                    )}
                    <span className="text-xs font-bold tracking-wide drop-shadow-md font-sans">{window.title}</span>
                </div>

                <div className="flex items-center gap-1">
                    <button
                        onClick={(e) => { e.stopPropagation(); actions.minimizeWindow(window.id); }}
                        className="w-5 h-5 flex items-center justify-center rounded-[3px] bg-[#0058ee] hover:bg-[#2f7bf2] active:bg-[#004dc2] border border-white/30 shadow-inner transition-colors"
                        title="Minimize"
                    >
                        <Minus size={12} strokeWidth={3} className="mb-1" />
                    </button>

                    {appConfig.canMaximize && (
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                if (window.isMaximized) actions.restoreWindow(window.id);
                                else actions.maximizeWindow(window.id);
                            }}
                            className="w-5 h-5 flex items-center justify-center rounded-[3px] bg-[#0058ee] hover:bg-[#2f7bf2] active:bg-[#004dc2] border border-white/30 shadow-inner transition-colors"
                            title={window.isMaximized ? "Restore" : "Maximize"}
                        >
                            {window.isMaximized ? <Square size={10} strokeWidth={3} /> : <Maximize2 size={12} strokeWidth={3} />}
                        </button>
                    )}

                    <button
                        onClick={(e) => { e.stopPropagation(); actions.closeWindow(window.id); }}
                        className="w-5 h-5 flex items-center justify-center rounded-[3px] bg-[#e81123] hover:bg-[#f44a56] active:bg-[#bf0e1d] border border-white/30 shadow-inner transition-colors ml-1"
                        title="Close"
                    >
                        <X size={14} strokeWidth={3} />
                    </button>
                </div>
            </div>

            {/* Menu Bar (Standard XP Gray) */}
            <div className="bg-[#ece9d8] border-l-4 border-r-4 border-[#0055ea] flex text-xs px-2 py-0.5 gap-4 text-black cursor-default font-sans">
                <span className="hover:bg-[#316ac5] hover:text-white px-2 py-0.5">File</span>
                <span className="hover:bg-[#316ac5] hover:text-white px-2 py-0.5">Edit</span>
                <span className="hover:bg-[#316ac5] hover:text-white px-2 py-0.5">View</span>
                <span className="hover:bg-[#316ac5] hover:text-white px-2 py-0.5">Favorites</span>
                <span className="hover:bg-[#316ac5] hover:text-white px-2 py-0.5">Tools</span>
                <span className="hover:bg-[#316ac5] hover:text-white px-2 py-0.5">Help</span>
            </div>

            {/* Content Area - Thick Blue Borders */}
            <div className="flex-1 bg-white overflow-hidden relative border-l-4 border-r-4 border-b-4 border-[#0055ea]">
                <AppBody windowId={window.id} />
            </div>

        </motion.div>
    );
}
