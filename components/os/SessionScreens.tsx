"use client";

import { useEffect } from 'react';
import Image from 'next/image';
import { SYSTEM } from '@/content';

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

/** After a waking press, the rest of that gesture must not land on whatever is underneath. */
const GESTURE_TAIL = ['pointerup', 'mouseup', 'click', 'auxclick', 'contextmenu'] as const;

/**
 * Stand By: the screen goes dark until the visitor moves the mouse or presses a key. The short
 * grace period stops the click that chose Stand By from waking it straight back up. The waking
 * input itself does nothing else: the key is swallowed, and so is the rest of a waking press — its
 * release, click, and on a right-press the context menu — which would otherwise land on the icon
 * or account tile underneath once the dark screen is gone.
 */
export function StandByScreen({ onWake }: { onWake: () => void }) {
    useEffect(() => {
        let armed = false;
        let tailTimer = 0;
        const arm = window.setTimeout(() => {
            armed = true;
        }, 700);
        const swallow = (e: Event) => {
            e.preventDefault();
            e.stopPropagation();
        };
        const stopSwallowing = () => GESTURE_TAIL.forEach((t) => window.removeEventListener(t, swallow, true));
        const onMove = () => {
            if (armed) onWake();
        };
        const onPress = (e: PointerEvent) => {
            swallow(e);
            if (!armed) return;
            GESTURE_TAIL.forEach((t) => window.addEventListener(t, swallow, true));
            tailTimer = window.setTimeout(stopSwallowing, 800);
            onWake();
        };
        const onKey = (e: KeyboardEvent) => {
            swallow(e);
            if (armed) onWake();
        };
        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerdown', onPress, true);
        window.addEventListener('keydown', onKey, true);
        return () => {
            window.clearTimeout(arm);
            window.removeEventListener('pointermove', onMove);
            window.removeEventListener('pointerdown', onPress, true);
            window.removeEventListener('keydown', onKey, true);
            // The tail outlives the dark screen by design; it removes itself once the gesture is over.
            if (!tailTimer) stopSwallowing();
        };
    }, [onWake]);

    return (
        <div
            className="xp-standby"
            data-session-cover=""
            aria-label="Stand by. Move the mouse or press a key to resume."
            role="status"
        />
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
