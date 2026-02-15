"use client";

import { useSystemStore } from '@/store/useSystemStore';
import { AppConfig } from '@/constants/apps';
import { motion } from 'framer-motion';
import { playSound } from '@/utils/sound';
import { useRef, useState, useEffect } from 'react';
import { cn } from '@/utils/cn';

interface DesktopIconProps {
    appId: string;
    app: AppConfig;
    initialPosition: { x: number; y: number };
    isSelected: boolean;
    onSelect: () => void;
}

export default function DesktopIcon({ appId, app, initialPosition, isSelected, onSelect }: DesktopIconProps) {
    const { actions, desktopIcons } = useSystemStore();
    const iconRef = useRef<HTMLDivElement>(null);

    // Use stored position if available, otherwise initial
    const position = desktopIcons[appId] || initialPosition;

    const handleDoubleClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        playSound('open');
        actions.openWindow(appId, app.title);
        // Optional: Deselect on open? Windows usually keeps selection. 
        // We'll keep it selected.
    };

    const handleClick = (e: React.MouseEvent) => {
        e.stopPropagation(); // Prevent desktop click from deselecting immediately
        onSelect();
    };

    // For better "click away" behavior, we'll let the parent (Desktop) handle the "selectedId" state.
    // Changing approach slightly to be controlled component if possible, or just listen to checks.
    // Let's stick to internal state for drag but maybe lift selection? 
    // Actually, distinct selection is easier if controlled by parent. 
    // Let's update props in a follow-up or just use a shared event listener? 
    // Simpler: Just make it controlled.

    return (
        <motion.div
            ref={iconRef}
            drag
            dragMomentum={false}
            initial={position}
            animate={position}
            onDragEnd={(e, info) => {
                // Snap to grid (assuming 100x100 grid for now, or similar)
                const gridSize = 100;
                const rawX = position.x + info.offset.x;
                const rawY = position.y + info.offset.y;

                // Calculate snapped position relative to parent
                // Note: framer-motion 'drag' modifies the transform. 
                // We need to calculate the new "absolute" position to save it.
                // This is a bit tricky with just offsets. 
                // A better way for grid snapping with controlled position:

                const box = iconRef.current?.getBoundingClientRect();
                if (box) {
                    // This logic is complex because 'info.point' is screen coordinates.
                    // We need coordinates relative to the Desktop container.
                    // For now, let's just let it be free-floating or simple snap visually?
                    // The user asked for "movable". 

                    // Let's implement simple persistent position on drop.
                    // We will update the store with the new delta applied.

                    const newX = Math.round((position.x + info.offset.x) / 10) * 10; // Soft snap
                    const newY = Math.round((position.y + info.offset.y) / 10) * 10;

                    actions.setDesktopIconPosition(appId, newX, newY);
                }
            }}
            // Use standard HTML click handler, but we need to distinguish drag from click.
            // Framer motion handles this well mainly, but let's be careful.
            onDoubleClick={handleDoubleClick}
            onClick={handleClick}
            className={cn(
                "absolute flex flex-col items-center justify-center gap-1 p-2 w-[100px] h-[100px] rounded cursor-default group touch-none",
                isSelected && "bg-blue-700/40 border border-blue-300/50 dotted"
            )}
            style={{
                // We are positioning absolutely from the store state
                left: 0,
                top: 0
                // x and y are handled by motion component 'animate' prop
            }}
        >
            <div className={cn(
                "relative transition-all filter",
                isSelected ? "drop-shadow-none brightness-110" : "drop-shadow-md group-hover:drop-shadow-xl"
            )}>
                {app.iconAsset ? (
                    <img
                        src={app.iconAsset}
                        alt={app.title}
                        className="w-12 h-12 md:w-16 md:h-16 object-contain pointer-events-none"
                        draggable={false}
                    />
                ) : (
                    <app.icon className="w-12 h-12 md:w-16 md:h-16 text-white drop-shadow-md" />
                )}
            </div>

            <span className={cn(
                "text-white text-xs md:text-sm shadow-black text-center line-clamp-2 px-1 rounded",
                isSelected ? "bg-blue-700" : "text-shadow-sm group-hover:bg-blue-700/30"
            )}>
                {app.title}
            </span>
        </motion.div>
    );
}
