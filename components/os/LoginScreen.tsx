"use client";

import { useState } from 'react';
import { motion } from 'framer-motion';
import { User, ArrowRight } from 'lucide-react';
import { playSound } from '@/utils/sound';

interface LoginScreenProps {
    onLogin: () => void;
}

export default function LoginScreen({ onLogin }: LoginScreenProps) {
    const [password, setPassword] = useState('');
    const [error, setError] = useState(false);

    const handleLogin = (e: React.FormEvent) => {
        e.preventDefault();
        playSound('click');
        // Simulate loading or just login immediately
        // For now, accept any password or empty
        onLogin();
    };

    return (
        <div className="h-full w-full flex items-center justify-center relative overflow-hidden font-sans select-none"
            style={{
                background: 'conic-gradient(at 0% 0%, #003399 90deg, transparent 0%) 0 0 / 20px 20px, conic-gradient(at 0% 0%, #4D85E8 90deg, transparent 0%) 0 0 / 20px 20px, #003399',
                // This is an approximation of the checkered pattern
                backgroundImage: 'linear-gradient(45deg, #4d85e8 25%, transparent 25%, transparent 75%, #4d85e8 75%, #4d85e8), linear-gradient(45deg, #4d85e8 25%, transparent 25%, transparent 75%, #4d85e8 75%, #4d85e8)',
                backgroundPosition: '0 0, 10px 10px',
                backgroundSize: '20px 20px',
                backgroundColor: '#003399'
            }}
        >
            <div className="absolute inset-0 bg-blue-600 mix-blend-overlay opacity-50" />

            {/* Top and Bottom Bars (XP Style) */}
            <div className="absolute top-0 w-full h-24 bg-gradient-to-b from-[#003399] to-[#003399]/0 border-b border-orange-500/50" />
            <div className="absolute bottom-0 w-full h-24 bg-gradient-to-t from-[#003399] to-[#003399]/0 border-t border-orange-500/50 flex items-center justify-between px-8 text-white z-20">
                <button className="flex items-center gap-2 hover:brightness-110 active:scale-95 transition-all">
                    <div className="w-8 h-8 rounded bg-gradient-to-b from-green-400 to-green-600 flex items-center justify-center border border-white/30 shadow-md">
                        <div className="w-4 h-4 text-white p-0.5">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M18.36 6.64a9 9 0 1 1-12.73 0" />
                                <line x1="12" y1="2" x2="12" y2="12" />
                            </svg>
                        </div>
                    </div>
                    <span className="font-semibold text-shadow-sm">Restart Jack XP</span>
                </button>
                <div className="text-right">
                    <p className="text-xs font-semibold opacity-90">After you log on, the system's yours to explore.</p>
                    <p className="text-xs opacity-70">Every detail has been built with a purpose.</p>
                </div>
            </div>

            {/* Center Content */}
            <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.5 }}
                className="relative z-10 flex gap-0 items-center divide-x divide-white/20 bg-gradient-to-r from-blue-800/40 to-blue-600/40 backdrop-blur-sm p-8 rounded-xl border border-white/10 shadow-2xl"
            >
                {/* Left Side: Branding */}
                <div className="flex flex-col items-end pr-8 gap-2">
                    {/* Windows Logo simplified */}
                    <div className="grid grid-cols-2 gap-1 transform -rotate-6 mb-2">
                        <div className="w-6 h-6 bg-[#f25c19] rounded-tl-sm rounded-tr-lg rounded-bl-md rounded-br-sm shadow-inner" />
                        <div className="w-6 h-6 bg-[#83bb22] rounded-tl-md rounded-tr-sm rounded-bl-sm rounded-br-lg shadow-inner" />
                        <div className="w-6 h-6 bg-[#00a3e8] rounded-tl-sm rounded-tr-md rounded-bl-lg rounded-br-sm shadow-inner" />
                        <div className="w-6 h-6 bg-[#fdbd10] rounded-tl-lg rounded-tr-sm rounded-bl-sm rounded-br-md shadow-inner" />
                    </div>
                    <h1 className="text-4xl font-bold text-white tracking-tighter drop-shadow-md">
                        Gaurav<span className="text-orange-500 font-normal italic text-xl align-top">xp</span>
                    </h1>
                    <p className="text-sky-200 text-lg tracking-wide font-light">Software Developer</p>

                    <div className="mt-8 text-white/80 text-sm font-medium">
                        To begin, click on Gaurav to log in
                    </div>
                </div>

                {/* Right Side: User Card */}
                <div className="flex items-center gap-4 pl-8 group cursor-pointer" onClick={() => !password && onLogin()}>
                    <div className="w-20 h-20 bg-orange-100 rounded-lg border-4 border-yellow-400 shadow-lg flex items-center justify-center overflow-hidden relative">
                        {/* Avatar Placeholder - simple pixel art styling or just an icon */}
                        <div className="absolute inset-0 bg-blue-200">
                            <User size={60} className="text-blue-500 absolute -bottom-2 -right-2" />
                        </div>
                    </div>

                    <div className="flex flex-col">
                        <h2 className="text-2xl text-white font-medium drop-shadow-md group-hover:underline decoration-orange-400 underline-offset-4">Gaurav</h2>
                        <p className="text-blue-200 text-sm">Software Developer</p>

                        {!password && (
                            <div className="mt-2 text-white/50 text-xs italic">
                                (Click to login)
                            </div>
                        )}

                        {/* Hidden form for potential password future use */}
                        <form onSubmit={handleLogin} className="flex gap-2 relative mt-2 opacity-0 h-0 overflow-hidden">
                            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
                        </form>
                    </div>
                </div>
            </motion.div>
        </div>
    );
}
