"use client";

import { useSystemStore } from '@/store/useSystemStore';
import { APPS } from '@/constants/apps';
import { Power, User, LogOut, ChevronRight, FolderOpen, Mail, Music, Play, PenTool, Layout, TerminalSquare, FileText, Globe, Image as ImageIcon, Instagram, Github, Linkedin } from 'lucide-react';
import { motion } from 'framer-motion';

interface StartMenuProps {
    onClose: () => void;
}

export default function StartMenu({ onClose }: StartMenuProps) {
    const { actions } = useSystemStore();

    const handleAppClick = (appId: string) => {
        const app = APPS[appId];
        if (app) {
            actions.openWindow(app.id, app.title);
            onClose();
        }
    };

    return (
        <motion.div
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 20, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed bottom-12 left-0 w-[380px] bg-white rounded-t-lg overflow-hidden z-[9999] flex flex-col font-sans shadow-2xl rounded-tr-lg rounded-tl-lg"
            style={{
                boxShadow: "2px 2px 10px rgba(0,0,0,0.5), -1px -1px 3px rgba(255,255,255,0.3)"
            }}
        >
            {/* Header */}
            <div className="h-16 bg-gradient-to-b from-[#245dca] to-[#3c82f2] p-2 flex items-center gap-3 border-b-[2px] border-orange-300 relative overflow-hidden rounded-t-lg">
                <div className="absolute top-0 left-0 w-full h-[1px] bg-white/30" />
                <div className="w-12 h-12 rounded border-2 border-white overflow-hidden shrink-0 shadow-md bg-white">
                    <img
                        src="/profile.jpg"
                        alt="Kumar Gaurav"
                        className="w-full h-full object-cover"
                    />
                </div>

                <span className="font-bold text-lg text-white drop-shadow-md select-none">Kumar Gaurav</span>
            </div>

            {/* Body */}
            <div className="flex bg-white border-l border-r border-[#3c82f2]">
                {/* Left Column (Pinned Apps) */}
                <div className="w-1/2 bg-white py-2 flex flex-col">
                    <div className="px-1 text-xs text-gray-400 font-bold mb-1 pl-2 hidden">Pinned</div>

                    <StartMenuItem
                        icon="/icons/Folder Open.ico"
                        label="My Projects"
                        // subLabel="View my work"
                        onClick={() => handleAppClick('projects')}
                        bold
                    />
                    <StartMenuItem
                        icon="/icons/Phone.ico"
                        label="Contact Me"
                        // subLabel="Send me a message"
                        onClick={() => handleAppClick('contact')}
                        bold
                    />

                    <div className="h-[1px] bg-gradient-to-r from-transparent via-gray-300 to-transparent my-1 mx-2" />

                    <StartMenuItem icon="/icons/User Personalization.ico" label="About Me" onClick={() => handleAppClick('about')} />
                    <StartMenuItem icon="/icons/Music.ico" label="Music Player" onClick={() => handleAppClick('music')} />
                    {/* Placeholder for Media Player */}
                    <StartMenuItem icon="/icons/Video.ico" label="Media Player" onClick={() => { }} />
                    <StartMenuItem icon="/icons/Display.ico" label="Paint" onClick={() => handleAppClick('paint')} />
                    <StartMenuItem icon="/icons/Game Controller.ico" label="Valorant" onClick={() => { }} />

                    <div className="mt-auto pt-4 px-2">
                        <div className="h-[1px] bg-gray-200 mb-1" />
                        <button className="w-full flex items-center justify-center gap-1 py-1 hover:bg-[#2f7bf2] hover:text-white transition-colors group">
                            <span className="font-bold text-sm">All Programs</span>
                            <div className="bg-[#2f8b19] rounded-full p-0.5 group-hover:bg-white group-hover:text-[#2f8b19]">
                                <ChevronRight size={10} className="text-white group-hover:text-[#2f8b19]" />
                            </div>
                        </button>
                    </div>
                </div>

                {/* Right Column (System / Recent) */}
                <div className="w-1/2 bg-[#d3e5fa] py-2 border-l border-[#95bdee] flex flex-col text-[#00136b]">
                    <StartMenuLink icon="/icons/instagram.png" label="Instagram" onClick={() => window.open('https://instagram.com/gauravtewaryy', '_blank')} />
                    <StartMenuLink icon="/icons/github.png" label="Github" onClick={() => window.open('https://github.com/tiwarygaurav', '_blank')} />
                    <StartMenuLink icon="/icons/linkedin.png" label="LinkedIn" onClick={() => window.open('https://linkedin.com/gauravtiwary21', '_blank')} />

                    <div className="h-[1px] bg-[#aebad3] my-1 mx-2" />

                    <button className="w-full px-2 py-1 flex items-center gap-2 hover:bg-[#316ac5] hover:text-white text-sm group">
                        <div className="relative">
                            <FileText size={16} className="text-[#00136b] group-hover:text-white" />
                            <div className="absolute -bottom-1 -right-1 bg-white rounded-full p-[1px]"><Music size={8} /></div>
                        </div>
                        <div className="flex flex-col items-start leading-none">
                            <span className="font-bold">Recently Used</span>
                        </div>
                        <ChevronRight size={12} className="ml-auto text-gray-500 group-hover:text-white" />
                    </button>

                    <div className="h-[1px] bg-[#aebad3] my-1 mx-2" />

                    <StartMenuLink icon="/icons/terminal.png" label="Command Prompt" onClick={() => handleAppClick('terminal')} />
                    <StartMenuLink icon="/icons/image.png" label="Image Viewer" onClick={() => { }} />
                    <StartMenuLink icon="/icons/List File.ico" label="My Resume" onClick={() => handleAppClick('resume')} />
                </div>
            </div>

            {/* Footer */}
            <div className="h-10 bg-gradient-to-b from-[#245dca] to-[#3c82f2] flex items-center justify-end gap-3 px-3 border-t-2 border-orange-300">
                <button
                    onClick={actions.logout}
                    className="flex items-center gap-1 px-2 py-1 hover:bg-[#2f7bf2] rounded transition-colors text-white shadow-sm active:translate-y-px"
                    title="Log Off"
                >
                    <div className="bg-[#e7a32b] p-0.5 rounded shadow-sm border border-white/30">
                        <LogOut size={14} className="text-white" />
                    </div>
                    <span className="text-sm font-sans">Log Off</span>
                </button>
                <button
                    onClick={actions.shutdown}
                    className="flex items-center gap-1 px-2 py-1 hover:bg-[#2f7bf2] rounded transition-colors text-white shadow-sm active:translate-y-px"
                    title="Shut Down"
                >
                    <div className="bg-[#d12828] p-0.5 rounded shadow-sm border border-white/30">
                        <Power size={14} className="text-white" />
                    </div>
                    <span className="text-sm font-sans">Shut Down</span>
                </button>
            </div>
        </motion.div>
    );
}

function StartMenuItem({ icon, label, subLabel, onClick, bold }: { icon: string, label: string, subLabel?: string, onClick: () => void, bold?: boolean }) {
    return (
        <button
            onClick={onClick}
            className="w-full text-left px-2 py-1.5 hover:bg-[#316ac5] hover:text-white flex items-center gap-2 group transition-colors"
        >
            <img
                src={icon}
                alt={label}
                className="w-6 h-6 object-contain shrink-0"
            />
            <div className="flex flex-col items-start leading-tight">
                <span className={`text-sm text-gray-800 group-hover:text-white ${bold ? 'font-bold' : ''}`}>
                    {label}
                </span>
                {subLabel && <span className="text-[10px] text-gray-500 group-hover:text-blue-100">{subLabel}</span>}
            </div>
        </button>
    );
}

function StartMenuLink({
    icon,
    label,
    onClick
}: {
    icon: string,
    label: string,
    onClick: () => void
}) {
    return (
        <button
            onClick={onClick}
            className="w-full text-left px-2 py-1 hover:bg-[#316ac5] hover:text-white flex items-center gap-2 group transition-colors"
        >
            <img
                src={icon}
                alt={label}
                className="w-4 h-4 object-contain shrink-0"
            />
            <span className="text-sm font-medium">{label}</span>
        </button>
    );
}

