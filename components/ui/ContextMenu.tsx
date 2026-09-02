"use client";

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

/** Height of the taskbar (`h-9` in Taskbar.tsx). A menu must never open underneath it. */
const TASKBAR_HEIGHT = 36;
/** Breathing room between the menu and a viewport edge, in px. */
const EDGE_GAP = 4;

/**
 * Where to draw a menu edge given the pointer coordinate, the menu's size on that axis and the
 * furthest coordinate that still fits. XP flips the menu to the other side of the cursor when
 * it would run off an edge; on a viewport too small for either side, pin it to the edge.
 */
function place(pointer: number, size: number, limit: number): number {
    if (pointer <= limit) return pointer;
    return Math.max(0, Math.min(pointer - size, limit));
}

interface ContextMenuProps {
    x: number;
    y: number;
    isOpen: boolean;
    onClose: () => void;
    items: {
        label?: string;
        action?: () => void;
        divider?: boolean;
        disabled?: boolean;
    }[];
}

export default function ContextMenu({ x, y, isOpen, onClose, items }: ContextMenuProps) {
    const menuRef = useRef<HTMLDivElement>(null);
    // Where the menu is actually drawn. Starts at the pointer; the layout effect below moves it
    // when the measured menu would spill off-screen.
    const [pos, setPos] = useState({ left: x, top: y });

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
                onClose();
            }
        };

        if (isOpen) {
            document.addEventListener('mousedown', handleClickOutside);
        }

        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [isOpen, onClose]);

    // Clamp to the viewport from the menu's real rendered size, not a guessed one. Runs before
    // paint, so the visitor never sees the unclamped position. `offsetWidth`/`offsetHeight`
    // ignore the entry scale transform, which `getBoundingClientRect` would fold in.
    useLayoutEffect(() => {
        if (!isOpen) return;
        const el = menuRef.current;
        if (!el) return;
        const maxLeft = window.innerWidth - el.offsetWidth - EDGE_GAP;
        const maxTop = window.innerHeight - TASKBAR_HEIGHT - el.offsetHeight - EDGE_GAP;
        setPos({
            left: place(x, el.offsetWidth, maxLeft),
            top: place(y, el.offsetHeight, maxTop),
        });
    }, [isOpen, x, y]);

    return (
        <AnimatePresence>
            {isOpen && (
                <motion.div
                    ref={menuRef}
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    transition={{ duration: 0.1 }}
                    className="absolute bg-[#ECE9D8] border border-gray-400 shadow-xl z-[9999] min-w-[160px] py-1"
                    style={{ left: pos.left, top: pos.top }}
                    onContextMenu={(e) => e.preventDefault()} // Prevent native menu on our menu
                >
                    <div className="absolute inset-0 bg-gradient-to-r from-white/80 to-transparent pointer-events-none" />
                    <div className="relative">
                        {items.map((item, index) => (
                            item.divider ? (
                                <div key={index} className="h-[1px] bg-gray-300 my-1 mx-1" />
                            ) : (
                                <button
                                    key={index}
                                    onClick={() => {
                                        if (!item.disabled && item.action) {
                                            item.action();
                                            onClose();
                                        }
                                    }}
                                    disabled={item.disabled}
                                    className={`w-full text-left px-4 py-1 text-xs font-sans text-black hover:bg-[#316AC5] hover:text-white flex items-center gap-2 ${item.disabled ? 'text-gray-400 cursor-default hover:bg-transparent hover:text-gray-400' : 'cursor-pointer'}`}
                                >
                                    {item.label}
                                </button>
                            )
                        ))}
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
