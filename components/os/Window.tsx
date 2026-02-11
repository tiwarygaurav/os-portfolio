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

// Mapping for dynamic rendering
const APP_COMPONENTS: Record<string, any> = {
    about: AboutApp,
    projects: ProjectsApp,
    skills: SkillsApp,
    contact: ContactApp,
    terminal: TerminalApp,
    resume: ResumeApp,
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
                scale: window.isMaximized ? 1 : 1,
                opacity: 1,
                width: window.isMaximized ? '100%' : window.size.width,
                height: window.isMaximized ? 'calc(100% - 40px)' : window.size.height,
                x: window.isMaximized ? 0 : window.position.x,
                y: window.isMaximized ? 0 : window.position.y,
                top: window.isMaximized ? 0 : undefined,
                left: window.isMaximized ? 0 : undefined
            }}
            style={{
                position: 'absolute',
                zIndex: window.zIndex
            }}
            className={`
        flex flex-col bg-win-gray shadow-2xl rounded-t-lg overflow-hidden border border-blue-800
        ${isActive ? 'ring-1 ring-blue-400/50' : 'opacity-95'}
      `}
            onPointerDown={handlePointerDown}
        >
            {/* Title Bar */}
            <div
                onPointerDown={(e) => {
                    controls.start(e);
                    handlePointerDown();
                }}
                onDoubleClick={() => appConfig.canMaximize && actions.maximizeWindow(window.id)}
                className={`
          flex items-center justify-between px-2 h-8 select-none cursor-default
          ${isActive
                        ? 'bg-gradient-to-r from-blue-700 via-blue-600 to-blue-500 text-white'
                        : 'bg-gradient-to-r from-gray-400 to-gray-500 text-gray-200'}
        `}
            >
                <div className="flex items-center gap-2">
                    <appConfig.icon size={16} className="drop-shadow-md" />
                    <span className="text-xs font-bold tracking-wide drop-shadow-md">{window.title}</span>
                </div>

                <div className="flex items-center gap-1">
                    <button
                        onClick={(e) => { e.stopPropagation(); actions.minimizeWindow(window.id); }}
                        className="w-5 h-5 flex items-center justify-center rounded hover:bg-white/20 active:bg-white/30 transition-colors"
                    >
                        <Minus size={14} />
                    </button>

                    {appConfig.canMaximize && (
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                if (window.isMaximized) actions.restoreWindow(window.id);
                                else actions.maximizeWindow(window.id);
                            }}
                            className="w-5 h-5 flex items-center justify-center rounded hover:bg-white/20 active:bg-white/30 transition-colors"
                        >
                            {window.isMaximized ? <Square size={10} /> : <Maximize2 size={12} />}
                        </button>
                    )}

                    <button
                        onClick={(e) => { e.stopPropagation(); actions.closeWindow(window.id); }}
                        className="w-5 h-5 flex items-center justify-center rounded bg-red-500 hover:bg-red-400 active:bg-red-600 transition-colors ml-1"
                        title="Close"
                    >
                        <X size={14} />
                    </button>
                </div>
            </div>

            {/* Toolbar / Menu Bar (Optional) */}
            <div className="bg-[#ece9d8] border-b border-gray-300 flex text-xs px-2 py-1 gap-4 text-gray-700 cursor-default">
                <span className="hover:underline hover:text-black">File</span>
                <span className="hover:underline hover:text-black">Edit</span>
                <span className="hover:underline hover:text-black">View</span>
                <span className="hover:underline hover:text-black">Help</span>
            </div>

            {/* Content Area */}
            <div className="flex-1 bg-white overflow-auto relative">
                <AppBody windowId={window.id} />
            </div>

            {/* Status Bar (Optional) */}
            <div className="bg-[#ece9d8] border-t border-gray-300 h-6 flex items-center px-2 text-xs text-gray-600 cursor-default">
                {window.appId === 'terminal' ? 'Ready' : `${window.title} ready.`}
            </div>

        </motion.div>
    );
}
