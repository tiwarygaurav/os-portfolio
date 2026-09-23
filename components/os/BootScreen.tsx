"use client";

import { useEffect } from 'react';
import { PROFILE, SYSTEM } from '@/content';

interface BootScreenProps {
    onComplete: () => void;
}

const BOOT_MS = 4000;

/**
 * The XP boot screen: black, the flag and wordmark, and the progress box with its three blue
 * chunks travelling left to right.
 *
 * It starts on its own, as XP did. It used to wait for "Press any key or click to boot…",
 * because browsers refuse to play audio before a user gesture and the startup sound played at the
 * end of boot. XP played that sound when the desktop appeared after logging on, so it moved there
 * (`LoginScreen`) — and the click on the account supplies the gesture, so the gate is gone.
 *
 * Two lines stay the owner's own. The wordmark carries the owner's name where XP said "Windows",
 * and the corner says what this is: a tribute build, not Microsoft's.
 */
export default function BootScreen({ onComplete }: BootScreenProps) {
    useEffect(() => {
        const timer = setTimeout(onComplete, BOOT_MS);
        return () => clearTimeout(timer);
    }, [onComplete]);

    return (
        <div className="xp-boot" role="status" aria-label={`Starting ${SYSTEM.name}`}>
            <div className="mb-[8vh] flex flex-col items-center">
                <div className="flex items-center gap-3 sm:gap-4">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                        src="/icons/windows.png"
                        alt=""
                        className="h-auto w-[52px] sm:w-[78px]"
                        style={{ filter: 'drop-shadow(0 0 6px rgba(255,255,255,0.08))' }}
                        draggable={false}
                    />
                    <div className="relative pr-8 sm:pr-10">
                        <h1
                            className="whitespace-nowrap font-bold leading-none tracking-tight text-[clamp(30px,7vw,64px)]"
                            style={{ fontFamily: "'Franklin Gothic Medium', 'Franklin Gothic', Arial, sans-serif" }}
                        >
                            {PROFILE.name}
                        </h1>
                        <span
                            className="absolute right-0 top-0 italic leading-none text-[clamp(18px,3.4vw,32px)]"
                            style={{
                                fontFamily: "'Franklin Gothic Medium', Arial, sans-serif",
                                background: 'linear-gradient(to bottom, #ffb036, #f25c19 60%, #d9300e)',
                                WebkitBackgroundClip: 'text',
                                backgroundClip: 'text',
                                color: 'transparent',
                            }}
                        >
                            xp
                        </span>
                        <p className="mt-1 text-right text-[clamp(13px,2vw,19px)] text-white/90">{PROFILE.title}</p>
                    </div>
                </div>

                <div className="xp-boot-bar mt-[9vh]" aria-hidden>
                    <div className="xp-boot-chunks">
                        <i />
                        <i />
                        <i />
                    </div>
                </div>
            </div>

            <div className="absolute bottom-6 left-0 right-0 flex items-end justify-between gap-4 px-6 text-[11px] text-white/70 sm:bottom-10 sm:px-16">
                {/*
                  * The XP look is deliberate homage. The copyright line that used to sit here
                  * claimed Microsoft authorship of this build, which is a different thing —
                  * this is the owner's own work and says so.
                  */}
                <div>
                    <p className="font-semibold text-white/80">{PROFILE.name}</p>
                    <p>A Windows XP tribute build — not affiliated with Microsoft.</p>
                </div>
                <div
                    className="text-xl font-bold italic tracking-tight text-white/90 sm:text-2xl"
                    style={{ fontFamily: "'Franklin Gothic Medium', Arial, sans-serif" }}
                >
                    Portfolio
                </div>
            </div>
        </div>
    );
}
