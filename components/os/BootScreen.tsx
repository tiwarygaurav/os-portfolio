"use client";

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { playSound } from '@/utils/sound';

interface BootScreenProps {
    onComplete: () => void;
}

export default function BootScreen({ onComplete }: BootScreenProps) {
    const [progress, setProgress] = useState(0);

    useEffect(() => {
        const interval = setInterval(() => {
            setProgress((prev) => {
                if (prev >= 100) {
                    clearInterval(interval);
                    setTimeout(() => {
                        // Assuming playSound is defined elsewhere or passed as a prop
                        // For this example, I'll assume it's a global function or imported.
                        // If not, you'd need to define or import it.
                        // playSound('startup'); // Uncomment if playSound is available
                        onComplete();
                    }, 500); // Small delay after 100%
                    return 100;
                }
                // Randomize speed for "realism"
                return prev + Math.random() * 10;
            });
        }, 200);

        return () => clearInterval(interval);
    }, [onComplete]);

    return (
        <div className="h-full w-full bg-black text-white flex flex-col items-center justify-center font-mono cursor-wait">
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 1 }}
                className="mb-8 text-center"
            >
                <h1 className="text-4xl font-bold mb-2">Portfolio OS</h1>
                <p className="text-gray-400 text-sm">Professional Edition</p>
                <p className="text-gray-500 text-xs mt-1">Copyright © 2024</p>
            </motion.div>

            <div className="w-64 h-4 border border-gray-600 rounded p-0.5 relative">
                <div className="h-full w-full bg-gray-900 absolute top-0 left-0" />
                <motion.div
                    className="h-full bg-win-blue relative z-10"
                    animate={{ width: `${Math.min(progress, 100)}%` }}
                    transition={{ ease: "linear", duration: 0.2 }}
                />

                {/* Retro Glint effect */}
                <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-b from-white/10 to-transparent pointer-events-none z-20" />
            </div>

            <div className="mt-4 text-xs text-gray-500 font-mono">
                <p>BIOS Date 02/11/24 14:02:11 Ver: 08.00.12</p>
                <p>CPU : Intel(R) Core(TM) i9-14900K CPU @ 6.00GHz</p>
                <p>Memory Test : {Math.floor(progress * 640)}K OK</p>
            </div>
        </div>
    );
}
