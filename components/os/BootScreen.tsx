"use client";

import { useEffect, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { playSound } from '@/utils/sound';
import { PROFILE, SYSTEM } from '@/content';

interface BootScreenProps {
    onComplete: () => void;
}

const BOOT_MS = 4500;

/**
 * Boot sequence.
 *
 * Two honesty fixes here:
 *
 * 1. It used to say "Press any key or click to boot" while listening only for clicks. Keyboard
 *    now genuinely works — the first interaction in the product no longer lies.
 * 2. It used to print "Copyright (c) Microsoft Corporation". This environment is the owner's own
 *    work; it descends from XP but is not Microsoft's and must not imply otherwise.
 *
 * The gate itself stays: a user gesture is required before the browser will allow audio.
 */
export default function BootScreen({ onComplete }: BootScreenProps) {
    const [hasInteracted, setHasInteracted] = useState(false);
    const reduceMotion = useReducedMotion();

    // Real "press any key" — modifier presses alone don't count.
    useEffect(() => {
        if (hasInteracted) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Shift' || e.key === 'Control' || e.key === 'Alt' || e.key === 'Meta') return;
            setHasInteracted(true);
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [hasInteracted]);

    useEffect(() => {
        if (!hasInteracted) return;
        const timer = setTimeout(() => {
            playSound('startup');
            onComplete();
        }, BOOT_MS);
        return () => clearTimeout(timer);
    }, [onComplete, hasInteracted]);

    if (!hasInteracted) {
        return (
            <button
                type="button"
                className="flex h-full w-full cursor-pointer flex-col items-center justify-center gap-3 bg-black font-sans text-white focus:outline-none"
                onClick={() => setHasInteracted(true)}
                aria-label={`Start ${SYSTEM.name}`}
            >
                <p className="animate-pulse font-mono text-xl text-gray-400">
                    Press any key or click to boot…
                </p>
                <p className="max-w-md text-center text-xs text-gray-600">
                    A key press is required before the browser will let this environment play sound.
                </p>
            </button>
        );
    }

    return (
        <div className="relative flex h-full w-full cursor-wait flex-col items-center justify-center overflow-hidden bg-black font-sans text-white selection:bg-transparent">
            <div className="relative mb-12 flex flex-col items-center">
                <div className="mb-16 flex items-center gap-4">
                    {/* XP-style four-pane flag, drawn in CSS. */}
                    <div className="grid -rotate-6 grid-cols-2 gap-1" aria-hidden>
                        <div className="h-8 w-8 rounded-tl-[2px] rounded-tr-[12px] rounded-bl-[8px] rounded-br-[2px] bg-[#f25c19] shadow-[inset_-2px_-2px_6px_rgba(0,0,0,0.3)]" />
                        <div className="h-8 w-8 rounded-tl-[8px] rounded-tr-[2px] rounded-bl-[2px] rounded-br-[12px] bg-[#83bb22] shadow-[inset_-2px_-2px_6px_rgba(0,0,0,0.3)]" />
                        <div className="h-8 w-8 rounded-tl-[2px] rounded-tr-[8px] rounded-bl-[12px] rounded-br-[2px] bg-[#00a3e8] shadow-[inset_-2px_-2px_6px_rgba(0,0,0,0.3)]" />
                        <div className="h-8 w-8 rounded-tl-[12px] rounded-tr-[2px] rounded-bl-[2px] rounded-br-[8px] bg-[#fdbd10] shadow-[inset_-2px_-2px_6px_rgba(0,0,0,0.3)]" />
                    </div>

                    <div className="relative top-[-5px]">
                        <h1
                            className="text-7xl font-bold leading-none tracking-tighter"
                            style={{ fontFamily: 'Arial, sans-serif' }}
                        >
                            {PROFILE.name}
                            <span className="absolute -right-8 top-0 align-top text-3xl font-normal italic text-[#f25c19]">
                                xp
                            </span>
                        </h1>
                        <p className="mt-1 w-full border-t border-white/20 pt-1 pl-1 text-right text-xl italic tracking-wide text-gray-300 opacity-90">
                            {PROFILE.title}
                        </p>
                    </div>
                </div>

                <div className="relative mt-8 h-5 w-64 overflow-hidden rounded-[5px] border border-gray-500 bg-black p-[3px] shadow-lg">
                    <motion.div
                        className="h-full w-24 rounded-[2px] bg-gradient-to-r from-blue-900 via-blue-500 to-blue-900"
                        initial={{ x: -100 }}
                        animate={reduceMotion ? { x: 80 } : { x: 300 }}
                        transition={
                            reduceMotion
                                ? { duration: 0 }
                                : { repeat: Infinity, duration: 2, ease: 'linear' }
                        }
                    />
                </div>
            </div>

            <div className="absolute bottom-10 flex w-full items-end justify-between px-16 text-xs text-white/60">
                <div>
                    {/*
                      * The XP look is deliberate homage. The copyright line that used to sit here
                      * claimed Microsoft authorship of this build, which is a different thing —
                      * this is the owner's own work and says so.
                      */}
                    <p className="font-semibold">{PROFILE.name}</p>
                    <p>A Windows XP tribute build — not affiliated with Microsoft.</p>
                </div>

                <div className="flex items-start text-2xl font-bold italic tracking-tighter text-white opacity-90">
                    Portfolio
                </div>
            </div>
        </div>
    );
}
