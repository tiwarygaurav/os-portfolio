"use client";

import { useSystemStore } from '@/store/useSystemStore';
import { APPS } from '@/constants/apps';
import { Power, User, FolderOpen, Settings, LogOut } from 'lucide-react';
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
            className="fixed bottom-12 left-2 w-80 bg-win-bg border-2 border-win-blue shadow-2xl rounded-t-lg overflow-hidden z-[9999] flex flex-col font-sans"
        >
            {/* Header */}
            <div className="bg-gradient-to-r from-blue-700 to-blue-500 p-4 text-white flex items-center gap-3 border-b-2 border-orange-400">
                <div className="w-12 h-12 bg-white/20 rounded border-2 border-white/50 flex items-center justify-center overflow-hidden">
                    <User size={32} />
                </div>
                <span className="font-bold text-lg shadow-black drop-shadow-md">Guest User</span>
            </div>

            {/* Body */}
            <div className="bg-white flex-1 flex">
                {/* Left Column (White) */}
                <div className="w-1/2 p-2 border-r border-gray-200 bg-white">
                    <div className="space-y-1">
                        {Object.values(APPS).filter(app => app.id !== 'recycyle-bin').map((app) => ( // Filter out non-start menu items if any
                            <button
                                key={app.id}
                                onClick={() => handleAppClick(app.id)}
                                className="w-full text-left px-2 py-2 hover:bg-blue-600 hover:text-white rounded flex items-center gap-2 transition-colors group"
                            >
                                <app.icon size={20} className="text-gray-600 group-hover:text-white" />
                                <span className="text-sm font-medium">{app.title}</span>
                                {app.id === 'contact' && <span className="text-xs text-gray-400 group-hover:text-blue-200 ml-auto">New!</span>}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Right Column (Blue-ish) */}
                <div className="w-1/2 bg-blue-50 p-2 space-y-1 border-l border-white">
                    <button className="w-full text-left px-2 py-1 flex items-center gap-2 hover:bg-blue-200 rounded text-sm text-gray-800">
                        <FolderOpen size={16} className="text-blue-500" /> My Documents
                    </button>
                    <button className="w-full text-left px-2 py-1 flex items-center gap-2 hover:bg-blue-200 rounded text-sm text-gray-800">
                        <Settings size={16} className="text-gray-500" /> Settings
                    </button>
                    <div className="h-[1px] bg-gray-300 my-2" />
                    <button className="w-full text-left px-2 py-1 flex items-center gap-2 hover:bg-blue-200 rounded text-sm text-gray-800">
                        Run...
                    </button>
                </div>
            </div>

            {/* Footer */}
            <div className="bg-gradient-to-r from-blue-600 to-blue-800 p-2 flex justify-end gap-2 border-t border-blue-400">
                <button
                    onClick={actions.logout}
                    className="flex items-center gap-1 px-3 py-1 text-white hover:bg-blue-500 rounded transition-colors text-sm"
                >
                    <LogOut size={16} className="text-yellow-400" /> Log Off
                </button>
                <button
                    onClick={actions.shutdown}
                    className="flex items-center gap-1 px-3 py-1 text-white hover:bg-blue-500 rounded transition-colors text-sm"
                >
                    <Power size={16} className="text-red-400" /> Turn Off
                </button>
            </div>
        </motion.div>
    );
}
