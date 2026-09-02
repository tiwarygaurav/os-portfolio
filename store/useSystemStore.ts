import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { APPS } from '@/constants/apps';

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
    nextZIndex: number;
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

const nextZ = (windowCount: number) => Z_BASE + windowCount;

/**
 * Re-stack so `id` is on top and the rest keep their relative order, using a compact
 * `Z_BASE..Z_BASE+n` range. Bounded by design — see `focusWindow`.
 */
const raise = (windows: AppWindow[], id: string): AppWindow[] => {
    const ordered = [...windows].sort((a, b) => a.zIndex - b.zIndex);
    const rest = ordered.filter(w => w.id !== id);
    const target = ordered.find(w => w.id === id);
    const stacked = target ? [...rest, target] : rest;
    const zById = new Map(stacked.map((w, i) => [w.id, Z_BASE + i]));
    return windows.map(w => ({ ...w, zIndex: zById.get(w.id) ?? w.zIndex }));
};

/** Keep a grabbable strip of every window inside the viewport. */
const clampToViewport = (
    position: { x: number; y: number },
    size: { width: number; height: number }
) => {
    if (typeof window === 'undefined') return position;
    const KEEP_VISIBLE = 80;   // horizontal strip that must remain reachable
    const TASKBAR_HEIGHT = 36;
    const maxX = window.innerWidth - KEEP_VISIBLE;
    const maxY = window.innerHeight - TASKBAR_HEIGHT - 28; // title bar stays above the taskbar
    return {
        x: Math.min(Math.max(position.x, KEEP_VISIBLE - size.width), maxX),
        y: Math.min(Math.max(position.y, 0), Math.max(0, maxY)),
    };
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
            nextZIndex: 10,
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
                    const { windows, nextZIndex } = get();

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

                    const newWindow: AppWindow = {
                        id: nextPid(),
                        appId,
                        // Registry first: callers passing their own literal is how window titles
                        // drifted out of sync with `constants/apps.ts` in the first place.
                        title: title || APPS[appId]?.title || appId,
                        isMinimized: false,
                        isMaximized: false,
                        position: {
                            x: 60 + (windows.length * 24) % 200,
                            y: 40 + (windows.length * 24) % 150
                        },
                        size: DEFAULT_WINDOW_SIZE,
                        zIndex: nextZIndex,
                        payload,
                    };

                    set({
                        windows: [...windows, newWindow],
                        activeWindowId: newWindow.id,
                        nextZIndex: nextZIndex + 1,
                    });
                },

                closeWindow: (id) => set(state => ({
                    windows: state.windows.filter(w => w.id !== id),
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
                    nextZIndex: nextZ(state.windows.length),
                })),

                /** Leave the maximised state only. Split out from `restoreWindow` on purpose. */
                unmaximizeWindow: (id) => set(state => ({
                    windows: state.windows.map(w => w.id === id ? { ...w, isMaximized: false } : w)
                })),

                /**
                 * Raise to the top of the stack.
                 *
                 * z-indices are renormalised to a compact range on every focus rather than
                 * incremented forever. The old version grew without bound while the taskbar sat
                 * at z-50, so after roughly forty focus changes windows began rendering over it.
                 */
                focusWindow: (id) => set(state => {
                    const win = state.windows.find(w => w.id === id);
                    if (!win) return {};
                    if (state.activeWindowId === id && win.zIndex === state.windows.length + Z_BASE - 1) {
                        return {};
                    }
                    return {
                        activeWindowId: id,
                        windows: raise(state.windows, id),
                        nextZIndex: nextZ(state.windows.length),
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

                setDesktopIconPosition: (id, x, y) => set(state => ({
                    desktopIcons: { ...state.desktopIcons, [id]: { x, y } }
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
            } as any))),
            partialize: (state) => ({
                volume: state.volume,
                isMuted: state.isMuted,
                wallpaperId: state.wallpaperId,
                desktopIcons: state.desktopIcons,
                recycleBin: state.recycleBin,
                deletedAppIds: state.deletedAppIds,
            }),
        }
    )
);
