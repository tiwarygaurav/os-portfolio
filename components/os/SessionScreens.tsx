"use client";

import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import Image from 'next/image';
import { SYSTEM } from '@/content';
import { swallow, swallowRestOfGesture } from './gesture';

/**
 * The full-screen states around a session: "Saving your settings..." and "... is shutting
 * down..." in the Welcome screen's layout, Stand By's dark screen, and the powered-off screen whose
 * one button starts the machine again.
 */

/** One line of status in the Welcome screen's layout: its bands and glow, and the logo. */
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
 * Is the session covered — by the Welcome screen (Switch User), "Saving your settings..." or Stand
 * By? Keyboard handlers for the desktop and its message boxes stand down while it is: what is behind
 * the cover is not there to act on.
 */
export const sessionCovered = (): boolean =>
    typeof document !== 'undefined' && document.querySelector('[data-session-cover]') !== null;

/** Is Stand By on? The screen saver does not start in the dark, and does not count it as idle time. */
export const standingBy = (): boolean =>
    typeof document !== 'undefined' && document.querySelector('[data-session-cover="standby"]') !== null;

/**
 * Stand By: the screen goes dark until the visitor moves the mouse or presses a key. The short
 * grace period stops the click that chose Stand By from waking it straight back up. The waking
 * input itself does nothing else: the key is swallowed, and so is the rest of a waking press — its
 * release, click, context menu or double-click — which would otherwise land on the icon or account
 * tile underneath once the dark screen is gone.
 *
 * Portaled to <body>: the Welcome screen's Stand By would otherwise sit inside that screen's own
 * stacking context, below the screen saver.
 */
export function StandByScreen({ onWake }: { onWake: () => void }) {
    // Held in a ref, so a parent's re-render (a new inline onWake) does not restart the grace period.
    const wakeRef = useRef(onWake);
    wakeRef.current = onWake;

    useEffect(() => {
        const wake = () => wakeRef.current();
        let armed = false;
        const arm = window.setTimeout(() => {
            armed = true;
        }, 700);
        const onMove = () => {
            if (armed) wake();
        };
        const onPress = (e: PointerEvent) => {
            swallow(e);
            if (!armed) return;
            swallowRestOfGesture(e.pointerId, e.pointerType === 'mouse');
            wake();
        };
        const onKey = (e: KeyboardEvent) => {
            swallow(e);
            if (armed) wake();
        };
        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerdown', onPress, true);
        window.addEventListener('keydown', onKey, true);
        return () => {
            window.clearTimeout(arm);
            window.removeEventListener('pointermove', onMove);
            window.removeEventListener('pointerdown', onPress, true);
            window.removeEventListener('keydown', onKey, true);
        };
    }, []);

    return createPortal(
        <div
            className="xp-standby"
            data-session-cover="standby"
            aria-label="Stand by. Move the mouse or press a key to resume."
            role="status"
        />,
        document.body,
    );
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
