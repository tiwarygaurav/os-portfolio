import { useEffect, useState } from 'react';

/**
 * Small-screen detection, shared by the shell.
 *
 * 768px is the same boundary Tailwind's `md:` uses, so a component can style with `md:` classes
 * and this hook will agree with it. Below it the desktop metaphor stops working: a floating
 * window on a 390px screen is wider than the screen, and `body { overflow: hidden }` means the
 * visitor cannot even scroll to the part that is cut off.
 *
 * The response is not a separate mobile site — the roadmap forbids a second copy of any content.
 * Windows simply open maximised and stay that way, so the taskbar becomes the app switcher. That
 * is the same window manager, the same content and the same XP chrome, at a size where a
 * one-window-at-a-time model is the only one that fits.
 */
export const MOBILE_BREAKPOINT = 768;

export function useIsMobile(): boolean {
    // Server and first client render must agree, so start false and correct after mount.
    const [isMobile, setIsMobile] = useState(false);

    useEffect(() => {
        const query = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`);
        const sync = () => setIsMobile(query.matches);
        sync();
        query.addEventListener('change', sync);
        return () => query.removeEventListener('change', sync);
    }, []);

    return isMobile;
}

/** Imperative form, for the store and other non-React callers. */
export const isMobileViewport = (): boolean =>
    typeof window !== 'undefined' && window.innerWidth < MOBILE_BREAKPOINT;
