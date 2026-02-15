"use client";

import { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

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

    // Adjust position if it spills out of viewport (basic implementation)
    // For a robust solution, we'd check window.innerWidth/Height

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
                    style={{ left: x, top: y }}
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
