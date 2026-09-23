/**
 * XP's "Animate windows when minimizing and maximizing".
 *
 * XP did not scale or fade the window itself. It drew a caption-bar-shaped ghost — the title bar
 * gradient with the window's title on it — and flew that between the window's title bar and its
 * taskbar button, or between the restored and maximised title bars. The window simply snapped to
 * its new state. This recreates exactly that: a throwaway DOM node animated with the Web
 * Animations API on `transform` alone, removed when it lands.
 *
 * It lives outside React on purpose. The ghost has to outlive the render that triggered it (a
 * minimised window is hidden immediately), and it must never re-render anything on the desktop.
 */

export interface Box {
    left: number;
    top: number;
    width: number;
    height: number;
}

/** Height of `.xp-titlebar` in app/luna.css. */
export const TITLE_BAR_HEIGHT = 29;

const DURATION_MS = 220;

const reducedMotion = () =>
    typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

export function boxOf(el: Element | null | undefined): Box | null {
    if (!el) return null;
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) return null;
    return { left: r.left, top: r.top, width: r.width, height: r.height };
}

/** Where a window's title bar is, or would be — computed from geometry, so it works while hidden. */
export function titleBarBox(geometry: { x: number; y: number; width: number; maximized: boolean }): Box {
    if (geometry.maximized) {
        return { left: 0, top: 0, width: window.innerWidth, height: TITLE_BAR_HEIGHT };
    }
    return { left: geometry.x, top: geometry.y, width: geometry.width, height: TITLE_BAR_HEIGHT };
}

/** The taskbar button for a window pid, if it is on screen. */
export function taskButtonBox(pid: string): Box | null {
    return boxOf(document.querySelector(`[data-task-btn="${CSS.escape(pid)}"]`));
}

/** Fly a caption ghost from one box to another. Resolves when it has landed (or at once). */
export function playCaptionZoom(from: Box | null, to: Box | null, title: string, easing: 'in' | 'out' = 'out'): Promise<void> {
    if (!from || !to || reducedMotion() || typeof document === 'undefined') return Promise.resolve();

    const ghost = document.createElement('div');
    ghost.className = 'xp-zoom-ghost';
    ghost.textContent = title;
    Object.assign(ghost.style, {
        left: `${from.left}px`,
        top: `${from.top}px`,
        width: `${Math.max(1, from.width)}px`,
        height: `${Math.max(1, from.height)}px`,
    });
    document.body.appendChild(ghost);

    const sx = to.width / Math.max(1, from.width);
    const sy = to.height / Math.max(1, from.height);
    const animation = ghost.animate(
        [
            { transform: 'translate(0px, 0px) scale(1, 1)', opacity: 1 },
            { transform: `translate(${to.left - from.left}px, ${to.top - from.top}px) scale(${sx}, ${sy})`, opacity: 0.85 },
        ],
        { duration: DURATION_MS, easing: easing === 'in' ? 'cubic-bezier(0.5, 0, 0.9, 0.6)' : 'cubic-bezier(0.1, 0.4, 0.5, 1)' },
    );

    return new Promise((resolve) => {
        const done = () => {
            ghost.remove();
            resolve();
        };
        animation.onfinish = done;
        animation.oncancel = done;
    });
}
