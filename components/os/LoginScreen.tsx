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
        <div className="h-full w-full bg-win-bg flex items-center justify-center relative overflow-hidden">
            {/* Background Gradient */}
            <div className="absolute inset-0 bg-gradient-to-tr from-blue-700 via-blue-500 to-blue-300" />

            {/* Top and Bottom Bars (XP Style) */}
            <div className="absolute top-0 w-full h-24 bg-blue-800/50 backdrop-blur-sm border-b border-white/20" />
            <div className="absolute bottom-0 w-full h-24 bg-blue-900/50 backdrop-blur-sm border-t border-white/20 flex items-center justify-between px-8 text-white">
                <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded bg-white/10 flex items-center justify-center">
                        <div className="w-4 h-4 bg-yellow-400 rounded-full" />
                    </div>
                    <span className="font-semibold">Turn Off Computer</span>
                </div>
                <p className="text-sm opacity-70">After you log on, you can add or change accounts.</p>
            </div>

            <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.5 }}
                className="relative z-10 flex gap-8 items-center"
            >
                {/* Left Side: Users List (Just one for now) */}
                <div className="flex flex-col items-center gap-4">
                    <div className="w-1 bg-white/20 h-40 absolute left-1/2 -ml-[1px" />
                </div>

                {/* User Card */}
                <div className="flex items-center gap-4 p-4 rounded-lg hover:bg-white/10 transition-colors cursor-pointer group">
                    <div className="w-24 h-24 bg-yellow-400 rounded-lg border-2 border-white/50 shadow-lg flex items-center justify-center overflow-hidden">
                        <User size={48} className="text-yellow-700" />
                    </div>

                    <div className="flex flex-col">
                        <h2 className="text-2xl text-white font-medium mb-2 drop-shadow-md">Guest User</h2>

                        <form onSubmit={handleLogin} className="flex gap-2 relative">
                            <input
                                type="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                placeholder="Type password"
                                className="px-2 py-1 rounded text-black text-sm border-none shadow-inner w-32 focus:ring-2 focus:ring-green-400 outline-none"
                            />
                            <button
                                type="submit"
                                className="bg-green-500 hover:bg-green-400 text-white rounded p-1 shadow-md border border-green-600 flex items-center justify-center w-8 h-8 transition-all active:scale-95"
                            >
                                <ArrowRight size={16} />
                            </button>
                        </form>
                        {error && <p className="text-red-300 text-xs mt-1">Incorrect password</p>}
                    </div>
                </div>
            </motion.div>
        </div>
    );
}
