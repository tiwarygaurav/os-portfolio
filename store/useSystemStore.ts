import { create } from 'zustand';
import { persist, createJSONStorage, type StateStorage } from 'zustand/middleware';
import { APPS } from '@/constants/apps';
import { PERSISTED_KEYS, type PersistedKey } from '@/store/persistence';

/**
 * Launch argument passed to an app when it is opened, e.g. `{ projectId: 'os-portfolio' }` from the
 * shell's `open ~/projects/os-portfolio` or from the Skills window. String-keyed on purpose: payloads
 * cross the shell boundary, so they must stay serialisable.
 */
export type WindowPayload = Record<string, string>;

export interface AppWindow {
    id: string;
    appId: string;
    title: string;
    isMinimized: boolean;
    isMaximized: boolean;
    position: { x: number; y: number };
    size: { width: number; height: number };
    zIndex: number;
    payload?: WindowPayload;
}

export interface RecycledItem {
    id: string;
    name: string;
    icon: string;
    origin: string;
    deletedAt: number;
}

export const WALLPAPERS = [
    { id: 'bliss', name: 'Bliss', url: '/wallpapers/Bliss.jpg' },
    { id: 'bliss-png', name: 'Bliss (Alt)', url: '/wallpapers/bliss.png' },
    { id: 'blue', name: 'Windows Blue', color: '#3a6ea5' },
    { id: 'green', name: 'Olive Green', color: '#5e7e3e' },
    { id: 'silver', name: 'Silver Mist', color: '#9aa3ad' },
    { id: 'red-moon', name: 'Red Moon Desert', color: '#7a3b2c' },
];

interface SystemState {
    isBooting: boolean;
    isShuttingDown: boolean;
    isLoggedIn: boolean;
    audioEnabled: boolean;
    volume: number;
    isMuted: boolean;
    wallpaperId: string;

    windows: AppWindow[];
    activeWindowId: string | null;
    desktopIcons: Record<string, { x: number; y: number }>;

    recycleBin: RecycledItem[];
    deletedAppIds: string[];

    actions: {
        bootComplete: () => void;
        login: () => void;
        logout: () => void;
        shutdown: () => void;
        cancelShutdown: () => void;

        setVolume: (v: number) => void;
        toggleMute: () => void;
        setWallpaper: (id: string) => void;

        openWindow: (appId: string, title?: string, payload?: WindowPayload) => void;
        closeWindow: (id: string) => void;
        minimizeWindow: (id: string) => void;
        maximizeWindow: (id: string) => void;
        /** Un-minimise and raise, preserving the maximised state. */
        restoreWindow: (id: string) => void;
        /** Leave maximised state only. */
        unmaximizeWindow: (id: string) => void;
        focusWindow: (id: string) => void;
        moveWindow: (id: string, position: { x: number; y: number }) => void;
        resizeWindow: (id: string, size: { width: number; height: number }) => void;

        setDesktopIconPosition: (id: string, x: number, y: number) => void;
        resetDesktopIcons: () => void;

        deleteIcon: (appId: string, name: string, icon: string) => void;
        restoreItem: (id: string) => void;
        emptyRecycleBin: () => void;
    };
}

/** Fallback for app ids missing from the registry; every registered app declares its own size. */
const DEFAULT_WINDOW_SIZE = { width: 800, height: 600 };

/**
 * Window ids double as pids in `ps` and `/proc`, so a human has to be able to read one off the
 * screen and type it into `kill`. They were `Math.random().toString(36).slice(2, 11)` — nine
 * opaque characters, which also collided with the `ps` column width and rendered as
 * `l9zk988fnrunning`, making the pid impossible to identify.
 *
 * A short monotonic counter is both readable and unique. Windows are never persisted, so the
 * counter resetting on reload is correct behaviour, not a bug.
 */
let pidCounter = 0;
const nextPid = () => `w${++pidCounter}`;

/** Windows occupy z-indices starting here. The taskbar sits above this band, at z-50. */
const Z_BASE = 10;

/** Height of the taskbar in px; windows and icons must stay above it. */
const TASKBAR_HEIGHT = 36;

/** Footprint of a desktop icon (`DesktopIcon.tsx`: `w-[80px] h-[88px]`). */
const ICON_WIDTH = 80;
const ICON_HEIGHT = 88;

/**
 * Assign every window a z-index from its stack position: the lowest gets `Z_BASE`, the topmost
 * `Z_BASE + n - 1`. This is the *only* way z-indices are produced, so the invariant
 * "the n open windows occupy exactly `Z_BASE..Z_BASE+n-1`" holds after every open, close,
 * focus and restore. There is no free-running counter to ratchet upward — the previous design
 * kept one, and any open/close path that bypassed `focusWindow` (Alt+F4, `kill`, the Start menu)
 * grew it until windows drew over the taskbar at z-50.
 */
const renormalize = (stacked: AppWindow[]): AppWindow[] =>
    stacked.map((w, i) => (w.zIndex === Z_BASE + i ? w : { ...w, zIndex: Z_BASE + i }));

/** Windows in ascending z order. */
const byZ = (windows: AppWindow[]): AppWindow[] => [...windows].sort((a, b) => a.zIndex - b.zIndex);

/** Re-stack so `id` is on top and the rest keep their relative order. */
const raise = (windows: AppWindow[], id: string): AppWindow[] => {
    const ordered = byZ(windows);
    const target = ordered.find(w => w.id === id);
    if (!target) return renormalize(ordered);
    return renormalize([...ordered.filter(w => w.id !== id), target]);
};

/** The z-index a window appended on top of `windows` receives. */
const topZ = (windows: AppWindow[]) => Z_BASE + windows.length;

/** Keep a grabbable strip of every window inside the viewport. */
const clampToViewport = (
    position: { x: number; y: number },
    size: { width: number; height: number }
) => {
    if (typeof window === 'undefined') return position;
    const KEEP_VISIBLE = 80;   // horizontal strip that must remain reachable
    const maxX = window.innerWidth - KEEP_VISIBLE;
    const maxY = window.innerHeight - TASKBAR_HEIGHT - 28; // title bar stays above the taskbar
    return {
        x: Math.min(Math.max(position.x, KEEP_VISIBLE - size.width), maxX),
        y: Math.min(Math.max(position.y, 0), Math.max(0, maxY)),
    };
};

/**
 * Keep a desktop icon fully inside the desktop area (above the taskbar, inside both edges).
 * Icon positions persist, so an unclamped drop under the taskbar used to survive reload;
 * `DesktopIcon` also applies this at render time so a position saved on a wide monitor is
 * pulled back on-screen when the same browser opens the site on a narrower one.
 */
export const clampIconToViewport = (position: { x: number; y: number }) => {
    if (typeof window === 'undefined') return position;
    const maxX = Math.max(0, window.innerWidth - ICON_WIDTH);
    const maxY = Math.max(0, window.innerHeight - TASKBAR_HEIGHT - ICON_HEIGHT);
    return {
        x: Math.min(Math.max(position.x, 0), maxX),
        y: Math.min(Math.max(position.y, 0), maxY),
    };
};

/**
 * Initial window size: the registry's declared size, capped so the window fits the current
 * viewport with a margin. Small screens are never handed a window larger than the screen.
 */
const initialSize = (appId: string) => {
    const cfg = APPS[appId];
    const width = cfg?.width ?? DEFAULT_WINDOW_SIZE.width;
    const height = cfg?.height ?? DEFAULT_WINDOW_SIZE.height;
    if (typeof window === 'undefined') return { width, height };
    const VIEWPORT_MARGIN = 16;
    return {
        width: Math.min(width, Math.max(1, window.innerWidth - VIEWPORT_MARGIN)),
        height: Math.min(height, Math.max(1, window.innerHeight - TASKBAR_HEIGHT - VIEWPORT_MARGIN)),
    };
};

/** Pick a typed subset of `obj`. Used to derive the persisted slice from `PERSISTED_KEYS`. */
const pick = <T, K extends keyof T>(obj: T, keys: readonly K[]): Pick<T, K> => {
    const out = {} as Pick<T, K>;
    for (const key of keys) out[key] = obj[key];
    return out;
};

export const useSystemStore = create<SystemState>()(
    persist(
        (set, get) => ({
            isBooting: true,
            isShuttingDown: false,
            isLoggedIn: false,
            audioEnabled: true,
            volume: 0.5,
            isMuted: false,
            wallpaperId: 'bliss',

            windows: [],
            activeWindowId: null,
            desktopIcons: {},

            recycleBin: [],
            deletedAppIds: [],

            actions: {
                bootComplete: () => set({ isBooting: false }),
                login: () => set({ isLoggedIn: true }),
                logout: () => set({ isLoggedIn: false, windows: [], activeWindowId: null }),
                shutdown: () => set({ isShuttingDown: true }),
                cancelShutdown: () => set({ isShuttingDown: false }),

                setVolume: (v) => set({ volume: Math.max(0, Math.min(1, v)), isMuted: v === 0 }),
                toggleMute: () => set(state => ({ isMuted: !state.isMuted })),
                setWallpaper: (id) => set({ wallpaperId: id }),

                openWindow: (appId, title, payload) => {
                    const { windows } = get();

                    const existing = windows.find(w => w.appId === appId);
                    if (existing) {
                        get().actions.focusWindow(existing.id);
                        if (existing.isMinimized) get().actions.restoreWindow(existing.id);
                        if (payload !== undefined) {
                            set(state => ({
                                windows: state.windows.map(w => w.id === existing.id ? { ...w, payload } : w)
                            }));
                        }
                        return;
                    }

                    // Registry size, capped to the viewport; cascade the position, then clamp
                    // it with the same rule a drag obeys.
                    const size = initialSize(appId);
                    const newWindow: AppWindow = {
                        id: nextPid(),
                        appId,
                        // Registry first: callers passing their own literal is how window titles
                        // drifted out of sync with `constants/apps.ts` in the first place.
                        title: title || APPS[appId]?.title || appId,
                        isMinimized: false,
                        isMaximized: false,
                        position: clampToViewport({
                            x: 60 + (windows.length * 24) % 200,
                            y: 40 + (windows.length * 24) % 150
                        }, size),
                        size,
                        // Every open window already sits in `Z_BASE..Z_BASE+n-1` (see
                        // `renormalize`), so the next slot is the top of the stack.
                        zIndex: topZ(windows),
                        payload,
                    };

                    set({
                        windows: [...windows, newWindow],
                        activeWindowId: newWindow.id,
                    });
                },

                /** Remove and re-pack the survivors so the z band stays `Z_BASE..Z_BASE+n-1`. */
                closeWindow: (id) => set(state => ({
                    windows: renormalize(byZ(state.windows.filter(w => w.id !== id))),
                    activeWindowId: state.activeWindowId === id ? null : state.activeWindowId
                })),

                minimizeWindow: (id) => set(state => ({
                    windows: state.windows.map(w => w.id === id ? { ...w, isMinimized: true } : w),
                    activeWindowId: state.activeWindowId === id ? null : state.activeWindowId
                })),

                maximizeWindow: (id) => set(state => ({
                    windows: state.windows.map(w => w.id === id ? { ...w, isMaximized: true } : w)
                })),

                /**
                 * Un-minimise and raise. Deliberately preserves `isMaximized`: restoring a
                 * maximised window from the taskbar used to silently un-maximise it, so
                 * minimise/restore was not lossless.
                 */
                restoreWindow: (id) => set(state => ({
                    windows: raise(state.windows, id).map(w =>
                        w.id === id ? { ...w, isMinimized: false } : w
                    ),
                    activeWindowId: id,
                })),

                /** Leave the maximised state only. Split out from `restoreWindow` on purpose. */
                unmaximizeWindow: (id) => set(state => ({
                    windows: state.windows.map(w => w.id === id ? { ...w, isMaximized: false } : w)
                })),

                /**
                 * Raise to the top of the stack.
                 *
                 * z-indices are derived from stack position (`renormalize`) rather than
                 * incremented forever. The old version grew without bound while the taskbar sat
                 * at z-50, so after roughly forty focus changes windows began rendering over it.
                 */
                focusWindow: (id) => set(state => {
                    const win = state.windows.find(w => w.id === id);
                    if (!win) return {};
                    if (state.activeWindowId === id && win.zIndex === topZ(state.windows) - 1) {
                        return {};
                    }
                    return {
                        activeWindowId: id,
                        windows: raise(state.windows, id),
                    };
                }),

                /**
                 * Move, clamped so a window can never be dragged fully off-screen. A margin of
                 * the title bar always remains grabbable.
                 */
                moveWindow: (id, position) => set(state => ({
                    windows: state.windows.map(w =>
                        w.id === id ? { ...w, position: clampToViewport(position, w.size) } : w
                    )
                })),

                resizeWindow: (id, size) => set(state => ({
                    windows: state.windows.map(w => w.id === id ? { ...w, size } : w)
                })),

                /** Persisted, so clamped on write: a position under the taskbar must never be saved. */
                setDesktopIconPosition: (id, x, y) => set(state => ({
                    desktopIcons: { ...state.desktopIcons, [id]: clampIconToViewport({ x, y }) }
                })),

                resetDesktopIcons: () => set({ desktopIcons: {} }),

                deleteIcon: (appId, name, icon) => set(state => {
                    if (state.deletedAppIds.includes(appId)) return {};
                    return {
                        deletedAppIds: [...state.deletedAppIds, appId],
                        recycleBin: [
                            ...state.recycleBin,
                            { id: appId, name, icon, origin: 'Desktop', deletedAt: Date.now() }
                        ]
                    };
                }),

                restoreItem: (id) => set(state => ({
                    deletedAppIds: state.deletedAppIds.filter(a => a !== id),
                    recycleBin: state.recycleBin.filter(r => r.id !== id)
                })),

                emptyRecycleBin: () => set({ recycleBin: [] }),
            }
        }),
        {
            name: 'gaurav-xp-os',
            storage: createJSONStorage(() => (typeof window !== 'undefined' ? localStorage : ({
                getItem: () => null, setItem: () => { }, removeItem: () => { }
            } satisfies StateStorage))),
            // Derived from `store/persistence.ts`, which `/etc/system.conf` also renders, so the
            // list the shell shows a visitor cannot drift from what is actually saved.
            partialize: (state): Pick<SystemState, PersistedKey> => pick(state, PERSISTED_KEYS),
        }
    )
);
