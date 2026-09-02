"use client";

import { useState } from 'react';
import { motion } from 'framer-motion';
import { useSystemStore } from '@/store/useSystemStore';
import { PROFILE, SYSTEM } from '@/content';
import { playSound } from '@/utils/sound';
import Image from 'next/image';

interface LoginScreenProps {
    onLogin: () => void;
}

export default function LoginScreen({ onLogin }: LoginScreenProps) {
    const shutdown = useSystemStore((s) => s.actions.shutdown);

    const [isHoveringUser, setIsHoveringUser] = useState(false);
    const [showShutdown, setShowShutdown] = useState(false);
    const [isShuttingDown, setIsShuttingDown] = useState(false);
    const handleLogin = (e?: React.FormEvent) => {
        if (e) e.preventDefault();
        playSound('click');
        // Simulate loading or just login immediately
        onLogin();
    };

    return (
        <div
            className={`w-screen h-screen bg-[#345ea8] text-white flex flex-col font-tahoma relative overflow-hidden transition-all duration-500`}
        >


            <div className={`flex flex-col flex-1 transition-all duration-700 ${isShuttingDown ? "grayscale brightness-[0.65] contrast-90" : ""
                }`}>


                {/* CRT Grain Overlay */}
                <div
                    className="absolute inset-0 pointer-events-none opacity-[0.07] mix-blend-overlay"
                    style={{
                        backgroundImage:
                            "repeating-linear-gradient(0deg, rgba(0,0,0,0.12) 0px, rgba(0,0,0,0.12) 1px, transparent 1px, transparent 3px)"
                    }}
                />
                <div
                    className="absolute inset-0 pointer-events-none opacity-[0.05]"
                    style={{
                        backgroundImage:
                            "radial-gradient(rgba(0,0,0,0.25) 1px, transparent 1px)",
                        backgroundSize: "3px 3px"
                    }}
                />
                <div className="h-[12.5%] bg-[#003b8f] relative">
                    <div className="absolute bottom-0 left-0 w-full h-[4px] bg-gradient-to-r from-transparent via-white/70 to-transparent" />
                </div>


                {/* Center */}
                <div
                    className="flex flex-1"
                    style={{
                        background: `
  radial-gradient(
    circle at -260px -220px,
    rgba(255,255,255,0.45) 0%,
    rgba(255,255,255,0.2) 35%,
    rgba(255,255,255,0) 75%
  )
`
                        ,
                    }}>


                    {/* Left Side */}
                    <div className="w-1/2 flex flex-col justify-center items-end pr-12">
                        <div className="mb-10">
                            <Image
                                src="/icons/windows-xp-logo-white-text-transparent-bg-cropped.png"
                                width={250}
                                height={120}
                                alt="Windows XP"
                                priority
                            />
                        </div>
                        <span className="text-[22px] text-right font-normal">
                            To begin, click on {PROFILE.shortName} to log in
                        </span>
                    </div>
                    <div className="flex items-center justify-center">
                        <div className="w-px h-[60%] bg-gradient-to-b from-transparent via-white/40 to-transparent" />
                    </div>

                    {/* Right Side */}
                    <div className="w-1/2 flex flex-col justify-center items-start pl-10">

                        <div
                            onMouseEnter={() => setIsHoveringUser(true)}
                            onMouseLeave={() => setIsHoveringUser(false)}
                            onClick={handleLogin}
                            className={`flex min-w-[400px] p-4 rounded-lg cursor-pointer transition-all duration-200 ${isHoveringUser
                                ? "bg-gradient-to-r from-[#00489a] to-transparent opacity-100"
                                : "opacity-60"
                                }`}
                        >
                            <div className="w-[80px] h-[80px] mr-6 border-[3px] border-white rounded-md shadow-md overflow-hidden relative">
                                <Image
                                    src="/icons/profile-picture-chess.png"
                                    alt="User"
                                    fill
                                    className="object-cover"
                                />
                            </div>

                            <div>
                                <span className="block text-[22px] mb-2 font-normal">
                                    {PROFILE.shortName}
                                </span>
                                <span className="text-sm text-blue-200">{PROFILE.title}</span>
                            </div>
                        </div>

                    </div>
                </div>

                {/* Bottom Bar */}
                <div className="h-[12.5%] bg-[#003b8f] relative flex items-center justify-between px-12">

                    <div className="absolute top-0 left-0 w-full h-[4px] bg-gradient-to-r from-transparent via-orange-400 to-transparent" />

                    <div
                        className="flex items-center cursor-pointer"
                        onClick={() => {
                            setIsShuttingDown(true);
                            setTimeout(() => setShowShutdown(true), 400);
                        }}
                    >

                        <div className="w-8 h-8 bg-[#da5020] border border-white rounded-md" />
                        <span className="ml-3 text-xl">Turn off computer</span>
                    </div>

                    <span className="text-sm">
                        After you log on, the system&apos;s yours to explore.
                    </span>
                </div>
            </div>


            {isShuttingDown && (
                <div className="absolute inset-0 bg-black/45 transition-opacity duration-700 z-30 pointer-events-none" />
            )}

            {showShutdown && (
                <div className="absolute inset-0 flex items-center justify-center z-50">

                    <div className="w-[420px] shadow-[0_10px_40px_rgba(0,0,0,0.7)] border border-[#001a4a] bg-[#1f4fb0]">
                        <div className="border border-[#003b8f]">

                            {/* Title Bar */}
                            <div className="flex justify-between items-center px-4 py-2 bg-gradient-to-r from-[#0a5bd3] via-[#0f62d6] to-[#003b8f] text-white text-sm font-bold">
                                <span>Turn off {SYSTEM.name}</span>
                                <Image src="/icons/windows.png" width={20} height={20} alt="" />
                            </div>

                            {/* Content */}
                            <div
                                className="pt-8 pb-12 px-10 flex justify-center items-center"
                                style={{
                                    background:
                                        "linear-gradient(to bottom, #6f91d4 0%, #486ec3 100%)"
                                }}
                            >
                                <motion.div
                                    initial={{ scale: 0.9, opacity: 0 }}
                                    animate={{ scale: 1, opacity: 1 }}
                                    transition={{ duration: 0.2 }}
                                    className="flex gap-14"
                                >


                                    {/* Both of these were dead buttons. They now do what they say. */}
                                    <button
                                        type="button"
                                        onClick={() => window.location.reload()}
                                        className="group flex flex-col items-center focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
                                    >
                                        <Image src="/icons/favorite.png" width={48} height={48} alt="" />
                                        <span className="mt-2 text-sm group-hover:underline">Restart</span>
                                    </button>

                                    <button
                                        type="button"
                                        onClick={() => {
                                            playSound('shutdown');
                                            shutdown();
                                        }}
                                        className="group flex flex-col items-center focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
                                    >
                                        <Image src="/icons/log-off.png" width={48} height={48} alt="" />
                                        <span className="mt-2 text-sm group-hover:underline">Turn Off</span>
                                    </button>
                                </motion.div>
                            </div>

                            {/* Footer */}
                            <div className="bg-[#0b3e91] px-4 py-3 flex justify-end">
                                <button
                                    onClick={() => {
                                        setShowShutdown(false);
                                        setIsShuttingDown(false);
                                    }}
                                    className="px-4 py-1 bg-gradient-to-b from-white to-gray-300 text-black rounded border border-gray-400 shadow-inner"
                                >
                                    Cancel
                                </button>
                            </div>

                        </div>
                    </div>
                </div>

            )}


        </div>
    );

}

