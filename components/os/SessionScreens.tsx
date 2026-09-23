"use client";

import { useEffect } from 'react';
import Image from 'next/image';
import { SYSTEM } from '@/content';

/**
 * The full-screen states around a session, in the layout XP gave them: the Welcome screen's bands
 * and glow, with the logo and one line of status. "Saving your settings..." when logging off,
 * "... is shutting down..." when turning off.
 */
export function StatusScreen({ message }: { message: string }) {
    return (
        <div className="xp-logon" role="status" aria-live="polite">
            <div className="xp-logon-top" />
            <div className="xp-logon-mid items-center justify-center px-6">
                <div className="flex flex-col items-center gap-6 md:flex-row md:gap-12">
                    <Image
                        src="/icons/windows-xp-logo-white-text-transparent-bg-cropped.png"
                        width={250}
                        height={144}
                        alt="Windows XP"
                        className="h-auto w-[150px] md:w-[210px]"
                        priority
                    />
                    <span className="xp-logon-busy">{message}</span>
                </div>
            </div>
            <div className="xp-logon-bottom" />
        </div>
    );
}

export const shuttingDownMessage = () => `${SYSTEM.name} is shutting down...`;

/**
 * Stand By: the screen goes dark until the visitor moves the mouse or presses a key. The short
 * grace period stops the click that chose Stand By from waking it straight back up.
 */
export function StandByScreen({ onWake }: { onWake: () => void }) {
    useEffect(() => {
        let armed = false;
        const arm = window.setTimeout(() => {
            armed = true;
        }, 700);
        const wake = () => {
            if (armed) onWake();
        };
        window.addEventListener('pointermove', wake);
        window.addEventListener('pointerdown', wake);
        window.addEventListener('keydown', wake, true);
        return () => {
            window.clearTimeout(arm);
            window.removeEventListener('pointermove', wake);
            window.removeEventListener('pointerdown', wake);
            window.removeEventListener('keydown', wake, true);
        };
    }, [onWake]);

    return <div className="xp-standby" aria-label="Stand by. Move the mouse or press a key to resume." role="status" />;
}

/**
 * After Turn Off, the machine is off: a black screen, and the one control that does anything.
 * Pressing it is a real restart — the page reloads and the boot sequence runs again.
 */
export function PoweredOffScreen() {
    return (
        <div className="xp-off">
            <button type="button" className="xp-off-btn" onClick={() => window.location.reload()} autoFocus>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/icons/xp/turn-off.svg" alt="" draggable={false} />
                <span>Turn on {SYSTEM.name}</span>
            </button>
        </div>
    );
}
