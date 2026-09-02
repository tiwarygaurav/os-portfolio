"use client";

import { useEffect, useState } from 'react';
import { MotionConfig } from 'framer-motion';
import { useSystemStore } from '@/store/useSystemStore';
import BootScreen from '@/components/os/BootScreen';
import LoginScreen from '@/components/os/LoginScreen';
import Desktop from '@/components/os/Desktop';
import ErrorBoundary from '@/components/os/ErrorBoundary';
import { SYSTEM } from '@/content';

export default function Home() {
    const { isBooting, isLoggedIn, isShuttingDown, actions } = useSystemStore();
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
    }, []);

    useEffect(() => {
        if (!isShuttingDown) return;
        const t = setTimeout(() => {
            actions.cancelShutdown();
            actions.logout();
        }, 2400);
        return () => clearTimeout(t);
    }, [isShuttingDown, actions]);

    if (!mounted) return null;

    return (
        /*
         * `reducedMotion="user"` makes every Framer animation in the tree honour the visitor's
         * "reduce motion" setting: transform and opacity animations become instant rather than
         * being removed, so nothing loses meaning. The boot progress bar, which is the one thing
         * that loops, already checks the preference itself.
         */
        <MotionConfig reducedMotion="user">
        <ErrorBoundary>
        <main className="h-screen w-screen overflow-hidden bg-black text-white selection:bg-win-blue selection:text-white relative">
            {isBooting && <BootScreen onComplete={actions.bootComplete} />}
            {!isBooting && !isLoggedIn && !isShuttingDown && <LoginScreen onLogin={actions.login} />}
            {!isBooting && isLoggedIn && !isShuttingDown && <Desktop />}

            {isShuttingDown && (
                <div className="absolute inset-0 z-[10000] bg-[#3a6ea5] flex items-center justify-center text-white font-sans flex-col gap-6">
                    <div className="text-3xl font-light tracking-wide">{SYSTEM.name} is shutting down…</div>
                    <div className="w-64 h-2 bg-blue-900/40 rounded-full overflow-hidden">
                        <div className="h-full bg-white/80 animate-pulse" style={{ width: '80%' }} />
                    </div>
                    <div className="absolute bottom-8 text-sm text-blue-100 italic">
                        {SYSTEM.tagline}
                    </div>
                </div>
            )}
        </main>
        </ErrorBoundary>
        </MotionConfig>
    );
}
