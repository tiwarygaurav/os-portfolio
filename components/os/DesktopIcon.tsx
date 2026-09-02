"use client";

import { useSystemStore } from '@/store/useSystemStore';
import { AppConfig } from '@/constants/apps';
import { motion } from 'framer-motion';
import { playSound } from '@/utils/sound';
import { useRef } from 'react';
import { cn } from '@/utils/cn';

interface DesktopIconProps {
    appId: string;
    app: AppConfig;
    initialPosition: { x: number; y: number };
    isSelected: boolean;
    onSelect: () => void;
    onContextMenu?: (e: React.MouseEvent) => void;
}

export default function DesktopIcon({ appId, app, initialPosition, isSelected, onSelect, onContextMenu }: DesktopIconProps) {
    const { actions, desktopIcons } = useSystemStore();
    const iconRef = useRef<HTMLDivElement>(null);

    const position = desktopIcons[appId] || initialPosition;

    const handleDoubleClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        playSound('open');
        actions.openWindow(appId, app.title);
    };

    const handleClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        onSelect();
    };

    return (
        <motion.div
            ref={iconRef}
            drag
            dragMomentum={false}
            initial={position}
            animate={position}
            onDragEnd={(_e, info) => {
                const newX = Math.max(0, Math.round((position.x + info.offset.x) / 10) * 10);
                const newY = Math.max(0, Math.round((position.y + info.offset.y) / 10) * 10);
                actions.setDesktopIconPosition(appId, newX, newY);
            }}
            onDoubleClick={handleDoubleClick}
            onClick={handleClick}
            onContextMenu={onContextMenu}
            className={cn(
                "absolute flex flex-col items-center justify-start gap-1 p-1 w-[80px] h-[88px] rounded cursor-default group touch-none",
                isSelected && "bg-blue-700/40"
            )}
            style={{ left: 0, top: 0 }}
        >
            <div className={cn(
                "relative transition-all filter pointer-events-none",
                isSelected ? "drop-shadow-none brightness-110" : "drop-shadow-md group-hover:drop-shadow-xl"
            )}>
                {app.iconAsset ? (
                    <img
                        src={app.iconAsset}
                        alt={app.title}
                        className="w-12 h-12 object-contain"
                        draggable={false}
                    />
                ) : (
                    <app.icon className="w-12 h-12 text-white drop-shadow-md" />
                )}
            </div>

            <span className={cn(
                "text-white text-xs text-center line-clamp-2 px-1 leading-tight max-w-full",
                isSelected ? "bg-[#0a246a] border border-dotted border-yellow-300" : "drop-shadow-[1px_1px_0_rgba(0,0,0,0.9)]"
            )}>
                {app.title}
            </span>
        </motion.div>
    );
}
