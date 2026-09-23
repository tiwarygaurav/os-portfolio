"use client";

import { useEffect, useState } from 'react';
import { MotionConfig } from 'framer-motion';
import { useSystemStore } from '@/store/useSystemStore';
import BootScreen from '@/components/os/BootScreen';
import LoginScreen from '@/components/os/LoginScreen';
import Desktop from '@/components/os/Desktop';
import ErrorBoundary from '@/components/os/ErrorBoundary';
import { PoweredOffScreen, StatusScreen, shuttingDownMessage } from '@/components/os/SessionScreens';
import { consumeRestart } from '@/components/os/power';

/** How long "... is shutting down..." shows — long enough for the shutdown sound to play. */
const SHUTDOWN_MS = 2800;

export default function Home() {
    const isBooting = useSystemStore((s) => s.isBooting);
    const isLoggedIn = useSystemStore((s) => s.isLoggedIn);
    const isShuttingDown = useSystemStore((s) => s.isShuttingDown);
    const actions = useSystemStore((s) => s.actions);
    const [mounted, setMounted] = useState(false);
    // Turn Off ends with the machine off. Only the power button (a real reload) leaves this state.
    const [poweredOff, setPoweredOff] = useState(false);

    useEffect(() => {
        setMounted(true);
    }, []);

    useEffect(() => {
        if (!isShuttingDown) return;
        const t = setTimeout(() => {
            // Restart and Turn Off run the same shutdown and differ only here, as they did in XP.
            if (consumeRestart()) {
                window.location.reload();
                return;
            }
            actions.cancelShutdown();
            actions.logout();
            setPoweredOff(true);
        }, SHUTDOWN_MS);
        return () => clearTimeout(t);
    }, [isShuttingDown, actions]);

    if (!mounted) return null;

    return (
        /*
         * `reducedMotion="user"` makes every Framer animation in the tree honour the visitor's
         * "reduce motion" setting: transform and opacity animations become instant rather than
         * being removed, so nothing loses meaning. The CSS animations in app/luna.css (the boot
         * chunks, the grey fade behind Turn Off) carry their own prefers-reduced-motion rules.
         */
        <MotionConfig reducedMotion="user">
        <ErrorBoundary>
        <main className="h-viewport relative w-screen overflow-hidden bg-black text-white selection:bg-win-blue selection:text-white">
            {poweredOff ? (
                <PoweredOffScreen />
            ) : (
                <>
                    {isBooting && <BootScreen onComplete={actions.bootComplete} />}
                    {!isBooting && !isLoggedIn && !isShuttingDown && <LoginScreen onLogin={actions.login} />}
                    {!isBooting && isLoggedIn && !isShuttingDown && <Desktop />}
                    {isShuttingDown && (
                        <div className="absolute inset-0 z-[10000]">
                            <StatusScreen message={shuttingDownMessage()} />
                        </div>
                    )}
                </>
            )}
        </main>
        </ErrorBoundary>
        </MotionConfig>
    );
}
