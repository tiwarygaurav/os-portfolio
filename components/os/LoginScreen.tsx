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
            className={`h-viewport w-screen bg-[#345ea8] text-white flex flex-col font-tahoma relative overflow-hidden transition-all duration-500`}
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
                    className="flex flex-1 flex-col md:flex-row"
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
                    <div className="flex w-full flex-col items-center justify-end px-6 pb-4 md:w-1/2 md:items-end md:justify-center md:pb-0 md:pr-12">
                        <div className="mb-6 md:mb-10">
                            <Image
                                src="/icons/windows-xp-logo-white-text-transparent-bg-cropped.png"
                                width={250}
                                height={120}
                                alt="Windows XP"
                                className="h-auto w-[170px] md:w-[250px]"
                                priority
                            />
                        </div>
                        <span className="text-center text-[17px] font-normal md:text-right md:text-[22px]">
                            To begin, click on {PROFILE.shortName} to log in
                        </span>
                    </div>
                    <div className="flex items-center justify-center">
                        <div className="h-px w-[70%] bg-gradient-to-r from-transparent via-white/40 to-transparent md:h-[60%] md:w-px md:bg-gradient-to-b" />
                    </div>

                    {/* Right Side */}
                    <div className="flex w-full flex-col items-center justify-start px-4 pt-4 md:w-1/2 md:items-start md:justify-center md:pl-10 md:pt-0">

                        <div
                            onMouseEnter={() => setIsHoveringUser(true)}
                            onMouseLeave={() => setIsHoveringUser(false)}
                            onClick={handleLogin}
                            className={`flex w-full max-w-[400px] cursor-pointer rounded-lg p-4 transition-all duration-200 md:min-w-[400px] ${isHoveringUser
                                ? "bg-gradient-to-r from-[#00489a] to-transparent opacity-100"
                                : "opacity-60"
                                }`}
                        >
                            <div className="relative mr-4 h-[64px] w-[64px] shrink-0 overflow-hidden rounded-md border-[3px] border-white shadow-md md:mr-6 md:h-[80px] md:w-[80px]">
                                <Image
                                    src="/icons/profile-picture-chess.png"
                                    alt="User"
                                    fill
                                    className="object-cover"
                                />
                            </div>

                            <div>
                                <span className="mb-1 block text-[19px] font-normal md:mb-2 md:text-[22px]">
                                    {PROFILE.shortName}
                                </span>
                                <span className="text-sm text-blue-200">{PROFILE.title}</span>
                            </div>
                        </div>

                    </div>
                </div>

                {/* Bottom Bar */}
                <div className="relative flex h-[12.5%] min-h-[64px] items-center justify-between gap-3 bg-[#003b8f] px-5 md:px-12">

                    <div className="absolute top-0 left-0 w-full h-[4px] bg-gradient-to-r from-transparent via-orange-400 to-transparent" />

                    <div
                        className="flex items-center cursor-pointer"
                        onClick={() => {
                            setIsShuttingDown(true);
                            setTimeout(() => setShowShutdown(true), 400);
                        }}
                    >

                        <div className="w-8 h-8 bg-[#da5020] border border-white rounded-md" />
                        <span className="ml-3 whitespace-nowrap text-base md:text-xl">Turn off computer</span>
                    </div>

                    <span className="hidden text-sm sm:inline">
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

