"use client";

import { useEffect, useState } from 'react';
import { useSystemStore } from '@/store/useSystemStore';
import BootScreen from '@/components/os/BootScreen';
import LoginScreen from '@/components/os/LoginScreen';
import Desktop from '@/components/os/Desktop';

export default function Home() {
    const { isBooting, isLoggedIn, actions } = useSystemStore();
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
    }, []);

    if (!mounted) return null; // Avoid hydration mismatch on initial render

    return (
        <main className="h-screen w-screen overflow-hidden bg-black text-white selection:bg-win-blue selection:text-white">
            {isBooting && <BootScreen onComplete={actions.bootComplete} />}
            {!isBooting && !isLoggedIn && <LoginScreen onLogin={actions.login} />}
            {!isBooting && isLoggedIn && <Desktop />}
        </main>
    );
}
