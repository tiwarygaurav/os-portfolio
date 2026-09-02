"use client";

import { useSystemStore } from '@/store/useSystemStore';
import { APPS } from '@/constants/apps';
import { Power, LogOut, ChevronRight, Music, Instagram, Github, Linkedin, Mail, Calculator, StickyNote, HardDrive, TerminalSquare, Image as ImageIcon, Monitor, FolderOpen, Globe } from 'lucide-react';
import { motion } from 'framer-motion';
import { useState, useRef, useEffect } from 'react';
import { playSound } from '@/utils/sound';
import { LINKS, PROFILE } from '@/content';

interface StartMenuProps {
    onClose: () => void;
    /**
     * The element that opened the menu (the Start button). A mousedown on it is not "outside":
     * the button toggles the menu itself, and closing here first made the toggle re-open it.
     */
    triggerRef?: React.RefObject<HTMLElement>;
}

/** Glyph for a social link label. Falls back to a globe for anything unrecognised. */
function SOCIAL_ICONS({ l }: { l: string }) {
    if (l === 'GitHub') return <Github size={16} />;
    if (l === 'LinkedIn') return <Linkedin size={16} />;
    if (l === 'Instagram') return <Instagram size={16} />;
    return <Globe size={16} />;
}

export default function StartMenu({ onClose, triggerRef }: StartMenuProps) {
    const actions = useSystemStore((s) => s.actions);
    const [allProgramsOpen, setAllProgramsOpen] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const onMouseDown = (e: MouseEvent) => {
            const target = e.target as Node;
            if (menuRef.current?.contains(target)) return;
            if (triggerRef?.current?.contains(target)) return;
            onClose();
        };
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        document.addEventListener('mousedown', onMouseDown);
        document.addEventListener('keydown', onKeyDown);
        return () => {
            document.removeEventListener('mousedown', onMouseDown);
            document.removeEventListener('keydown', onKeyDown);
        };
    }, [onClose, triggerRef]);

    const handleAppClick = (appId: string) => {
        const app = APPS[appId];
        if (app) {
            playSound('open');
            actions.openWindow(app.id, app.title);
            onClose();
        }
    };

    const handleLogout = () => {
        playSound('logoff');
        actions.logout();
    };

    const handleShutdown = () => {
        playSound('shutdown');
        actions.shutdown();
        onClose();
    };

    const programGroups: { title: string; apps: { id: string; label: string }[] }[] = [
        {
            title: 'Accessories',
            apps: [
                { id: 'notepad', label: 'Notepad' },
                { id: 'calculator', label: 'Calculator' },
                { id: 'paint', label: 'Paint' },
                { id: 'terminal', label: 'Command Prompt' },
                { id: 'imageviewer', label: 'Picture Viewer' },
            ]
        },
        {
            title: 'Games',
            apps: [{ id: 'minesweeper', label: 'Minesweeper' }]
        },
        {
            title: 'Portfolio',
            apps: [
                { id: 'about', label: 'About Me' },
                { id: 'projects', label: 'My Projects' },
                { id: 'skills', label: 'Skills' },
                { id: 'resume', label: 'Resume' },
                { id: 'contact', label: 'Contact Me' },
            ]
        },
        {
            title: 'System',
            apps: [
                { id: 'mycomputer', label: 'My Computer' },
                { id: 'settings', label: 'Display Properties' },
                { id: 'trash', label: 'Recycle Bin' },
                { id: 'music', label: 'Media Player' },
            ]
        },
    ];

    return (
        <motion.div
            ref={menuRef}
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 20, opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="fixed bottom-9 left-0 w-[380px] bg-white overflow-visible z-[9999] flex flex-col font-sans"
            style={{
                boxShadow: "2px 2px 12px rgba(0,0,0,0.5), -1px -1px 3px rgba(255,255,255,0.3)",
                borderTopLeftRadius: 8,
                borderTopRightRadius: 8,
            }}
        >
            {/* Header */}
            <div className="h-16 bg-gradient-to-b from-[#245dca] to-[#3c82f2] p-2 flex items-center gap-3 border-b-[2px] border-orange-300 relative overflow-hidden rounded-t-lg">
                <div className="absolute top-0 left-0 w-full h-[1px] bg-white/30" />
                <div className="w-12 h-12 rounded border-2 border-white overflow-hidden shrink-0 shadow-md bg-white">
                    <img
                        src="/profile.jpg"
                        alt={PROFILE.name}
                        className="w-full h-full object-cover"
                    />
                </div>
                <span className="font-bold text-lg text-white drop-shadow-md select-none">{PROFILE.name}</span>
            </div>

            {/* Body */}
            <div className="flex bg-white border-l border-r border-[#3c82f2] relative">
                {/* Left Column */}
                <div className="w-1/2 bg-white py-2 flex flex-col">
                    <StartMenuItem
                        icon="/icons/Folder Open.ico"
                        label="My Projects"
                        onClick={() => handleAppClick('projects')}
                        bold
                    />
                    <StartMenuItem
                        icon="/icons/Phone.ico"
                        label="Contact Me"
                        onClick={() => handleAppClick('contact')}
                        bold
                    />

                    <div className="h-[1px] bg-gradient-to-r from-transparent via-gray-300 to-transparent my-1 mx-2" />

                    <StartMenuItem icon="/icons/User Personalization.ico" label="About Me" onClick={() => handleAppClick('about')} />
                    <StartMenuItem icon="/icons/media-player.png" label="Media Player" onClick={() => handleAppClick('music')} />
                    <StartMenuItem icon="/icons/paint.png" label="Paint" onClick={() => handleAppClick('paint')} />
                    <StartMenuItem icon="/icons/Minesweeper.ico" label="Minesweeper" onClick={() => handleAppClick('minesweeper')} />
                    <StartMenuItem fallback={<Calculator size={20} />} label="Calculator" onClick={() => handleAppClick('calculator')} />
                    <StartMenuItem fallback={<StickyNote size={20} />} label="Notepad" onClick={() => handleAppClick('notepad')} />

                    <div className="mt-auto pt-4 px-2 relative">
                        <div className="h-[1px] bg-gray-200 mb-1" />
                        <button
                            onMouseEnter={() => setAllProgramsOpen(true)}
                            onClick={() => setAllProgramsOpen(v => !v)}
                            className="w-full flex items-center justify-center gap-1 py-1 hover:bg-[#2f7bf2] hover:text-white transition-colors group"
                        >
                            <span className="font-bold text-sm">All Programs</span>
                            <div className="bg-[#2f8b19] rounded-full p-0.5 group-hover:bg-white">
                                <ChevronRight size={10} className="text-white group-hover:text-[#2f8b19]" />
                            </div>
                        </button>

                        {allProgramsOpen && (
                            <div
                                className="absolute bottom-0 left-full ml-0 w-56 bg-white border border-gray-500 shadow-2xl py-1 z-[10000]"
                                onMouseLeave={() => setAllProgramsOpen(false)}
                            >
                                {programGroups.map((group, gi) => (
                                    <div key={group.title} className="relative group">
                                        <div className="flex items-center justify-between px-3 py-1.5 text-xs font-bold hover:bg-[#316ac5] hover:text-white cursor-pointer">
                                            <span>{group.title}</span>
                                            <ChevronRight size={12} />
                                        </div>
                                        <div
                                            className="absolute top-0 left-full bg-white border border-gray-500 shadow-2xl py-1 w-52 hidden group-hover:block"
                                        >
                                            {group.apps.map(a => (
                                                <button
                                                    key={a.id}
                                                    onClick={() => { handleAppClick(a.id); setAllProgramsOpen(false); }}
                                                    className="w-full text-left px-3 py-1 text-xs hover:bg-[#316ac5] hover:text-white flex items-center gap-2"
                                                >
                                                    {APPS[a.id]?.iconAsset && (
                                                        <img src={APPS[a.id].iconAsset!} alt="" className="w-4 h-4 object-contain" />
                                                    )}
                                                    {a.label}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                {/* Right Column */}
                <div className="w-1/2 bg-[#d3e5fa] py-2 border-l border-[#95bdee] flex flex-col text-[#00136b]">
                    <StartMenuLink fallback={<HardDrive size={16} />} icon="/icons/My Computer.ico" label="My Computer" onClick={() => handleAppClick('mycomputer')} />
                    <StartMenuLink fallback={<FolderOpen size={16} />} icon="/icons/documents.png" label="My Documents" onClick={() => handleAppClick('resume')} />
                    <StartMenuLink fallback={<Music size={16} />} icon="/icons/Music.ico" label="My Music" onClick={() => handleAppClick('music')} />

                    <div className="h-[1px] bg-[#aebad3] my-1 mx-2" />

                    <StartMenuLink fallback={<Monitor size={16} />} icon="/icons/control-panel.png" label="Control Panel" onClick={() => handleAppClick('settings')} />
                    <StartMenuLink fallback={<TerminalSquare size={16} />} icon="/icons/278.ico" label="Command Prompt" onClick={() => handleAppClick('terminal')} />
                    <StartMenuLink fallback={<ImageIcon size={16} />} icon="/icons/Display.ico" label="Picture Viewer" onClick={() => handleAppClick('imageviewer')} />

                    <div className="h-[1px] bg-[#aebad3] my-1 mx-2" />

                    {/* URLs come from `@/content` — they were duplicated here before. */}
                    <div className="px-2 text-[10px] text-gray-600 font-bold pb-1">CONNECT WITH ME</div>
                    {LINKS.filter((l) => l.known && l.label !== 'Email').map((l) => (
                        <StartMenuLink
                            key={l.url}
                            fallback={<SOCIAL_ICONS l={l.label} />}
                            label={l.label}
                            onClick={() => window.open(l.url, '_blank', 'noopener,noreferrer')}
                        />
                    ))}
                    <StartMenuLink fallback={<Mail size={16} />} label="Email" onClick={() => handleAppClick('contact')} />
                </div>
            </div>

            {/* Footer */}
            <div
                className="h-10 flex items-center justify-end gap-3 px-3 border-t-2 border-orange-300 rounded-b-lg"
                style={{
                    background: 'linear-gradient(to bottom, #245dca 0%, #3c82f2 100%)',
                }}
            >
                <button
                    onClick={handleLogout}
                    className="flex items-center gap-1 px-2 py-1 hover:bg-[#2f7bf2] rounded transition-colors text-white shadow-sm active:translate-y-px"
                    title="Log Off"
                >
                    <div className="bg-[#e7a32b] p-0.5 rounded shadow-sm border border-white/30">
                        <LogOut size={14} className="text-white" />
                    </div>
                    <span className="text-sm">Log Off</span>
                </button>
                <button
                    onClick={handleShutdown}
                    className="flex items-center gap-1 px-2 py-1 hover:bg-[#2f7bf2] rounded transition-colors text-white shadow-sm active:translate-y-px"
                    title="Shut Down"
                >
                    <div className="bg-[#d12828] p-0.5 rounded shadow-sm border border-white/30">
                        <Power size={14} className="text-white" />
                    </div>
                    <span className="text-sm">Turn Off Computer</span>
                </button>
            </div>
        </motion.div>
    );
}

function StartMenuItem({ icon, label, onClick, bold, fallback }: { icon?: string, label: string, onClick: () => void, bold?: boolean, fallback?: React.ReactNode }) {
    return (
        <button
            onClick={onClick}
            className="w-full text-left px-2 py-1.5 hover:bg-[#316ac5] hover:text-white flex items-center gap-2 group transition-colors"
        >
            {icon ? (
                <img
                    src={icon}
                    alt={label}
                    className="w-6 h-6 object-contain shrink-0"
                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                />
            ) : (
                <div className="w-6 h-6 flex items-center justify-center shrink-0 text-gray-700 group-hover:text-white">{fallback}</div>
            )}
            <span className={`text-sm text-gray-800 group-hover:text-white ${bold ? 'font-bold' : ''}`}>
                {label}
            </span>
        </button>
    );
}

function StartMenuLink({ icon, label, onClick, fallback }: { icon?: string, label: string, onClick: () => void, fallback?: React.ReactNode }) {
    const [iconBroken, setIconBroken] = useState(false);
    const showFallback = !icon || iconBroken;

    return (
        <button
            onClick={onClick}
            className="w-full text-left px-2 py-1 hover:bg-[#316ac5] hover:text-white flex items-center gap-2 group transition-colors"
        >
            <div className="w-5 h-5 flex items-center justify-center shrink-0">
                {showFallback ? (
                    <div className="text-[#00136b] group-hover:text-white">{fallback}</div>
                ) : (
                    <img
                        src={icon}
                        alt={label}
                        className="w-4 h-4 object-contain"
                        onError={() => setIconBroken(true)}
                    />
                )}
            </div>
            <span className="text-sm font-medium">{label}</span>
        </button>
    );
}
