"use client";

import { useSystemStore, type AppWindow, type WindowPayload } from '@/store/useSystemStore';
import { APPS } from '@/constants/apps';
import { X, Square } from 'lucide-react';
import { motion, useDragControls } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
import { playSound } from '@/utils/sound';

import AboutApp from '@/components/apps/AboutApp';
import ProjectsApp from '@/components/apps/ProjectsApp';
import SkillsApp from '@/components/apps/SkillsApp';
import ContactApp from '@/components/apps/ContactApp';
import TerminalApp from '@/components/apps/TerminalApp';
import ResumeApp from '@/components/apps/ResumeApp';
import MusicPlayerApp from '@/components/apps/MusicPlayerApp';
import PaintApp from '@/components/apps/PaintApp';
import NotepadApp from '@/components/apps/NotepadApp';
import CalculatorApp from '@/components/apps/CalculatorApp';
import MinesweeperApp from '@/components/apps/MinesweeperApp';
import MyComputerApp from '@/components/apps/MyComputerApp';
import RecycleBinApp from '@/components/apps/RecycleBinApp';
import SettingsApp from '@/components/apps/SettingsApp';
import ImageViewerApp from '@/components/apps/ImageViewerApp';

type AppComponent = React.ComponentType<{ windowId?: string; payload?: WindowPayload }>;

/** id -> component. Must stay in sync with `constants/apps.ts`; see components/apps/CLAUDE.md. */
const APP_COMPONENTS: Record<string, AppComponent> = {
    about: AboutApp,
    projects: ProjectsApp,
    skills: SkillsApp,
    contact: ContactApp,
    terminal: TerminalApp,
    resume: ResumeApp,
    music: MusicPlayerApp,
    paint: PaintApp,
    notepad: NotepadApp,
    calculator: CalculatorApp,
    minesweeper: MinesweeperApp,
    mycomputer: MyComputerApp,
    trash: RecycleBinApp,
    settings: SettingsApp,
    imageviewer: ImageViewerApp,
};

interface WindowProps {
    win: AppWindow;
}

export default function Window({ win }: WindowProps) {
    const actions = useSystemStore((s) => s.actions);
    const activeWindowId = useSystemStore((s) => s.activeWindowId);
    const isActive = activeWindowId === win.id;
    const appConfig = APPS[win.appId];
    const AppBody = APP_COMPONENTS[win.appId] || (() => <div className="p-4">App not found</div>);

    const controls = useDragControls();
    const winRef = useRef<HTMLDivElement>(null);
    const [size, setSize] = useState(win.size);
    const [isResizing, setIsResizing] = useState(false);

    useEffect(() => {
        setSize(win.size);
    }, [win.size]);

    const handlePointerDown = () => {
        actions.focusWindow(win.id);
    };

    const startResize = (e: React.PointerEvent) => {
        if (!appConfig?.canResize || win.isMaximized) return;
        e.preventDefault();
        e.stopPropagation();
        setIsResizing(true);
        const startX = e.clientX;
        const startY = e.clientY;
        const startW = size.width;
        const startH = size.height;

        const onMove = (ev: PointerEvent) => {
            const newW = Math.max(280, startW + (ev.clientX - startX));
            const newH = Math.max(220, startH + (ev.clientY - startY));
            setSize({ width: newW, height: newH });
        };
        const onUp = (ev: PointerEvent) => {
            const newW = Math.max(280, startW + (ev.clientX - startX));
            const newH = Math.max(220, startH + (ev.clientY - startY));
            actions.resizeWindow(win.id, { width: newW, height: newH });
            setIsResizing(false);
            document.removeEventListener('pointermove', onMove);
            document.removeEventListener('pointerup', onUp);
        };

        document.addEventListener('pointermove', onMove);
        document.addEventListener('pointerup', onUp);
    };

    if (win.isMinimized) return null;

    return (
        <motion.div
            ref={winRef}
            drag={!win.isMaximized && !isResizing}
            dragControls={controls}
            dragListener={false}
            dragMomentum={false}
            onDragEnd={(_, info) => {
                actions.moveWindow(win.id, {
                    x: win.position.x + info.offset.x,
                    y: win.position.y + info.offset.y,
                });
            }}
            initial={{ scale: 0.92, opacity: 0 }}
            animate={{
                width: win.isMaximized ? '100%' : size.width,
                height: win.isMaximized ? 'calc(100% - 36px)' : size.height,
                x: win.isMaximized ? 0 : win.position.x,
                y: win.isMaximized ? 0 : win.position.y,
                top: win.isMaximized ? 0 : undefined,
                left: win.isMaximized ? 0 : undefined,
                opacity: 1,
                scale: 1,
            }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            style={{
                position: 'absolute',
                zIndex: win.zIndex
            }}
            className={`flex flex-col shadow-2xl overflow-visible ${win.isMaximized ? '' : 'rounded-t-xl rounded-b-md'} ${isActive ? '' : 'opacity-95'}`}
            onPointerDown={handlePointerDown}
        >
            {/* XP Title Bar */}
            <div
                onPointerDown={(e) => {
                    if (!win.isMaximized) controls.start(e);
                    handlePointerDown();
                }}
                onDoubleClick={() => {
                    if (!appConfig.canMaximize) return;
                    if (win.isMaximized) actions.unmaximizeWindow(win.id);
                    else actions.maximizeWindow(win.id);
                }}
                className={`flex items-center justify-between px-2 h-7 select-none cursor-default ${isActive
                    ? 'bg-gradient-to-b from-[#0058ee] via-[#0073e6] to-[#0058ee]'
                    : 'bg-gradient-to-b from-[#7a96df] via-[#9bb4ea] to-[#7a96df]'} text-white border-b border-[#003da8] ${win.isMaximized ? '' : 'rounded-t-lg'}`}
            >
                <div className="flex items-center gap-2 min-w-0">
                    {appConfig.iconAsset ? (
                        <img src={appConfig.iconAsset} alt={win.title} className="w-4 h-4 drop-shadow-md shrink-0" />
                    ) : (
                        appConfig.icon && <appConfig.icon size={16} className="filter drop-shadow-md shrink-0" />
                    )}
                    <span className="text-xs font-bold tracking-wide drop-shadow-md truncate">{win.title}</span>
                </div>

                <div className="flex items-center gap-0.5 shrink-0">
                    <button
                        onClick={(e) => { e.stopPropagation(); playSound('minimize'); actions.minimizeWindow(win.id); }}
                        className="w-5 h-5 flex items-end justify-center pb-0.5 rounded-[3px] bg-gradient-to-b from-[#3d80f1] to-[#0e4cb0] hover:from-[#5fa6f5] hover:to-[#1c63d4] active:from-[#0e4cb0] active:to-[#3d80f1] border border-white/40"
                        title="Minimize"
                    >
                        <span className="block w-2 h-0.5 bg-white" />
                    </button>

                    {appConfig.canMaximize && (
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                if (win.isMaximized) actions.unmaximizeWindow(win.id);
                                else actions.maximizeWindow(win.id);
                            }}
                            className="w-5 h-5 flex items-center justify-center rounded-[3px] bg-gradient-to-b from-[#3d80f1] to-[#0e4cb0] hover:from-[#5fa6f5] hover:to-[#1c63d4] active:from-[#0e4cb0] active:to-[#3d80f1] border border-white/40"
                            title={win.isMaximized ? "Restore" : "Maximize"}
                        >
                            {win.isMaximized ? <Square size={9} strokeWidth={3} /> : <span className="block w-2.5 h-2 border-2 border-white border-t-[3px]" />}
                        </button>
                    )}

                    <button
                        onClick={(e) => { e.stopPropagation(); playSound('close'); actions.closeWindow(win.id); }}
                        className="w-5 h-5 flex items-center justify-center rounded-[3px] bg-gradient-to-b from-[#e74e57] to-[#a91b1b] hover:from-[#f47280] hover:to-[#c0252b] active:from-[#a91b1b] active:to-[#e74e57] border border-white/40 ml-0.5"
                        title="Close"
                    >
                        <X size={12} strokeWidth={3} />
                    </button>
                </div>
            </div>

            {/* Content Area */}
            <div className="flex-1 bg-white overflow-hidden relative border-l-2 border-r-2 border-b-2 border-[#0055ea]">
                <AppBody windowId={win.id} payload={win.payload} />
            </div>

            {/* Resize handle */}
            {appConfig?.canResize && !win.isMaximized && (
                <div
                    onPointerDown={startResize}
                    className="absolute bottom-0 right-0 w-4 h-4 cursor-nwse-resize z-10"
                    style={{
                        background: 'linear-gradient(135deg, transparent 50%, #888 50%, #888 60%, transparent 60%, transparent 70%, #888 70%, #888 80%, transparent 80%)'
                    }}
                />
            )}
        </motion.div>
    );
}
