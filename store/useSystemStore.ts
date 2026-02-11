import { create } from 'zustand';

export interface AppWindow {
    id: string;
    appId: string; // 'about', 'projects', etc.
    title: string;
    icon?: any; // Component or string
    isMinimized: boolean;
    isMaximized: boolean;
    position: { x: number; y: number };
    size: { width: number; height: number };
    zIndex: number;
}

interface SystemState {
    isBooting: boolean;
    isShuttingDown: boolean;
    isLoggedIn: boolean;
    audioEnabled: boolean;
    volume: number;

    windows: AppWindow[];
    activeWindowId: string | null;
    nextZIndex: number;

    actions: {
        bootComplete: () => void;
        login: () => void;
        logout: () => void;
        shutdown: () => void;

        openWindow: (appId: string, title: string) => void;
        closeWindow: (id: string) => void;
        minimizeWindow: (id: string) => void;
        maximizeWindow: (id: string) => void;
        restoreWindow: (id: string) => void;
        focusWindow: (id: string) => void;
        moveWindow: (id: string, position: { x: number; y: number }) => void;
    };
}

const DEFAULT_WINDOW_SIZE = { width: 800, height: 600 };

export const useSystemStore = create<SystemState>((set, get) => ({
    isBooting: true,
    isShuttingDown: false,
    isLoggedIn: false,
    audioEnabled: true,
    volume: 0.5,

    windows: [],
    activeWindowId: null,
    nextZIndex: 10, // Start z-index

    actions: {
        bootComplete: () => set({ isBooting: false }),
        login: () => set({ isLoggedIn: true }),
        logout: () => set({ isLoggedIn: false }),
        shutdown: () => set({ isShuttingDown: true }),

        openWindow: (appId, title) => {
            const { windows, nextZIndex } = get();

            // Check if window already open? Windows-style allows multiple instances usually, 
            // but for portfolio maybe one instance per app is cleaner? 
            // Let's allow single instance for now for simplicity, focus if exists.
            const existing = windows.find(w => w.appId === appId);
            if (existing) {
                get().actions.focusWindow(existing.id);
                if (existing.isMinimized) get().actions.restoreWindow(existing.id);
                return;
            }

            const newWindow: AppWindow = {
                id: Math.random().toString(36).substr(2, 9),
                appId,
                title,
                isMinimized: false,
                isMaximized: false,
                position: { x: 50 + (windows.length * 20), y: 50 + (windows.length * 20) }, // Cascade effect
                size: DEFAULT_WINDOW_SIZE,
                zIndex: nextZIndex,
            };

            set({
                windows: [...windows, newWindow],
                activeWindowId: newWindow.id,
                nextZIndex: nextZIndex + 1,
            });
        },

        closeWindow: (id) => set(state => ({
            windows: state.windows.filter(w => w.id !== id),
            activeWindowId: state.activeWindowId === id ? null : state.activeWindowId // Simplification: could focus previous
        })),

        minimizeWindow: (id) => set(state => ({
            windows: state.windows.map(w => w.id === id ? { ...w, isMinimized: true } : w),
            activeWindowId: state.activeWindowId === id ? null : state.activeWindowId
        })),

        maximizeWindow: (id) => set(state => ({
            windows: state.windows.map(w => w.id === id ? { ...w, isMaximized: true } : w)
        })),

        restoreWindow: (id) => set(state => ({
            windows: state.windows.map(w => w.id === id ? { ...w, isMinimized: false, isMaximized: false } : w),
            activeWindowId: id,
            nextZIndex: state.nextZIndex + 1
        })),

        focusWindow: (id) => set(state => {
            const window = state.windows.find(w => w.id === id);
            if (!window || state.activeWindowId === id) return {};

            return {
                activeWindowId: id,
                nextZIndex: state.nextZIndex + 1,
                windows: state.windows.map(w => w.id === id ? { ...w, zIndex: state.nextZIndex } : w)
            };
        }),

        moveWindow: (id, position) => set(state => ({
            windows: state.windows.map(w => w.id === id ? { ...w, position } : w)
        })),
    }
}));
