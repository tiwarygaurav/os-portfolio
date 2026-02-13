"use client";

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { playSound } from '@/utils/sound';

interface BootScreenProps {
    onComplete: () => void;
}

export default function BootScreen({ onComplete }: BootScreenProps) {
    useEffect(() => {
        // Simulate boot time
        const timer = setTimeout(() => {
            playSound('startup');
            onComplete();
        }, 4500); // 4.5 seconds boot time

        return () => clearTimeout(timer);
    }, [onComplete]);

    return (
        <div className="h-full w-full bg-black text-white flex flex-col items-center justify-center font-sans overflow-hidden relative cursor-wait selection:bg-transparent">

            {/* Main Center Content */}
            <div className="flex flex-col items-center mb-12 relative">

                {/* Logo Area */}
                <div className="flex items-center gap-4 mb-16">
                    {/* XP Flag - Constructed with CSS/Tailwind */}
                    <div className="grid grid-cols-2 gap-1 transform -rotate-6">
                        <div className="w-8 h-8 bg-[#f25c19] rounded-tl-[2px] rounded-tr-[12px] rounded-bl-[8px] rounded-br-[2px] shadow-[inset_-2px_-2px_6px_rgba(0,0,0,0.3)]" />
                        <div className="w-8 h-8 bg-[#83bb22] rounded-tl-[8px] rounded-tr-[2px] rounded-bl-[2px] rounded-br-[12px] shadow-[inset_-2px_-2px_6px_rgba(0,0,0,0.3)]" />
                        <div className="w-8 h-8 bg-[#00a3e8] rounded-tl-[2px] rounded-tr-[8px] rounded-bl-[12px] rounded-br-[2px] shadow-[inset_-2px_-2px_6px_rgba(0,0,0,0.3)]" />
                        <div className="w-8 h-8 bg-[#fdbd10] rounded-tl-[12px] rounded-tr-[2px] rounded-bl-[2px] rounded-br-[8px] shadow-[inset_-2px_-2px_6px_rgba(0,0,0,0.3)]" />
                    </div>

                    {/* Branding Text */}
                    <div className="relative top-[-5px]">
                        <h1 className="text-7xl font-bold tracking-tighter leading-none" style={{ fontFamily: 'Arial, sans-serif' }}>
                            Jack
                            <span className="text-[#f25c19] text-3xl align-top absolute top-0 -right-10 font-normal italic">
                                xp
                            </span>
                        </h1>
                        <p className="text-xl italic text-gray-300 mt-1 pl-1 font-sans tracking-wide opacity-90 border-t border-white/20 pt-1 w-full text-right">
                            Software Developer
                        </p>
                    </div>
                </div>

                {/* Loading Bar Container */}
                <div className="w-64 h-5 border border-gray-500 rounded-[5px] p-[3px] bg-black relative overflow-hidden shadow-lg mt-8">
                    {/* The moving blocks */}
                    <motion.div
                        className="h-full w-24 bg-gradient-to-r from-blue-900 via-blue-500 to-blue-900 rounded-[2px]"
                        initial={{ x: -100 }}
                        animate={{ x: 300 }}
                        transition={{
                            repeat: Infinity,
                            duration: 2,
                            ease: "linear",
                            repeatDelay: 0
                        }}
                    />
                </div>

            </div>

            {/* Footer */}
            <div className="absolute bottom-10 w-full px-16 flex justify-between items-end text-white/60 text-xs font-sans">
                <div>
                    <p className="font-semibold">Copyright © Microsoft Corporation</p>
                    <p>All rights reserved</p>
                </div>

                <div className="text-2xl font-bold italic tracking-tighter opacity-90 text-white flex items-start">
                    Portfolio
                </div>
            </div>

        </div>
    );
}
