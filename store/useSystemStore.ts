import { create } from 'zustand';
import { persist, createJSONStorage, type StateStorage } from 'zustand/middleware';
import { APPS } from '@/constants/apps';
import { PERSISTED_KEYS, type PersistedKey } from '@/store/persistence';
import { isMobileViewport } from '@/utils/viewport';
import { publish } from '@/system/bus';
import {
    USER_FILES_QUOTA,
    mimeForName,
    mountUserFiles,
    userFilesSize,
    validateUserPath,
    type UserFile,
} from '@/system/vfs';
import {
    DEFAULT_SCREEN_SAVER,
    DEFAULT_THEME,
    isThemeId,
    sanitizeScreenSaver,
    type ScreenSaverSettings,
    type ThemeId,
} from '@/constants/prefs';

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

export interface DialogButton {
    id: string;
    label: string;
    /** Focused on open; Enter chooses it. */
    primary?: boolean;
    /** Escape and the title-bar close button choose it. */
    cancel?: boolean;
}

export interface DialogRequest {
    id: string;
    title: string;
    /** One paragraph per entry. A line starting with two spaces renders monospaced. */
    body: string[];
    icon: 'info' | 'warning' | 'error' | 'question';
    buttons: DialogButton[];
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
    themeId: ThemeId;
    screenSaver: ScreenSaverSettings;
    /** True while the screen saver is on screen. Never persisted. */
    screenSaverActive: boolean;

    windows: AppWindow[];
    activeWindowId: string | null;
    desktopIcons: Record<string, { x: number; y: number }>;

    recycleBin: RecycledItem[];
    deletedAppIds: string[];

    /** Files the visitor saved under /home/guest, keyed by absolute path. Persisted. */
    userFiles: Record<string, UserFile>;

    /** Open XP message boxes, newest last. Never persisted. */
    dialogs: DialogRequest[];

    actions: {
        bootComplete: () => void;
        login: () => void;
        logout: () => void;
        shutdown: () => void;
        cancelShutdown: () => void;

        setVolume: (v: number) => void;
        toggleMute: () => void;
        setWallpaper: (id: string) => void;
        setTheme: (id: ThemeId) => void;
        setScreenSaver: (patch: Partial<ScreenSaverSettings>) => void;
        /** Start or stop the screen saver (Settings > Preview, idle timeout, any input). */
        setScreenSaverActive: (active: boolean) => void;

        openWindow: (appId: string, title?: string, payload?: WindowPayload) => void;
        /**
         * `by` records *why* it closed, for the event log: omitted for an ordinary close, set
         * when the shell's `kill` or the Task Manager's End Task ended it.
         */
        closeWindow: (id: string, by?: 'shell' | 'task-manager') => void;
        minimizeWindow: (id: string) => void;
        maximizeWindow: (id: string) => void;
        /** Un-minimise and raise, preserving the maximised state. */
        restoreWindow: (id: string) => void;
        /** Leave maximised state only. */
        unmaximizeWindow: (id: string) => void;
        focusWindow: (id: string) => void;
        moveWindow: (id: string, position: { x: number; y: number }) => void;
        resizeWindow: (id: string, size: { width: number; height: number }) => void;

        /** Minimise everything. XP's "Show the Desktop". */
        minimizeAll: () => void;
        /** Re-lay the open windows in an XP cascade from the top-left. */
        cascadeWindows: () => void;
        /** @internal The layout half of `cascadeWindows`; kept pure so publishing stays outside `set`. */
        __cascade: () => void;
        /** Force every window maximised when the viewport crosses into the mobile breakpoint. */
        syncViewportBreakpoint: (mobile: boolean) => void;

        setDesktopIconPosition: (id: string, x: number, y: number) => void;
        resetDesktopIcons: () => void;

        deleteIcon: (appId: string, name: string, icon: string) => void;
        restoreItem: (id: string) => void;
        /** Put every deleted desktop icon back. */
        restoreAllItems: () => void;

        /**
         * Create or overwrite a file under /home/guest. Returns why it failed, or null. The mime
         * type follows the extension unless given. Refuses read-only paths and anything that
         * would push the visitor's files past their share of localStorage.
         */
        writeUserFile: (path: string, file: { content: string; mime?: UserFile['mime'] }) => string | null;
        /** Delete a visitor's file. Returns why it failed, or null. */
        deleteUserFile: (path: string) => string | null;

        /** Retitle a window, e.g. "notes.txt - Notepad". */
        setWindowTitle: (id: string, title: string) => void;
        /**
         * Let an app intercept an ordinary close (title-bar X, Alt+F4, File > Exit) to ask about
         * unsaved work. The guard resolves true to allow the close. `kill` and End Task bypass it,
         * as ending a process did in XP. Returns the unregister function.
         */
        registerCloseGuard: (id: string, guard: () => Promise<boolean>) => () => void;
        emptyRecycleBin: () => void;

        /** Show an XP message box. Resolves with the id of the button chosen. */
        openDialog: (request: Omit<DialogRequest, 'id'>) => Promise<string>;
        resolveDialog: (id: string, buttonId: string) => void;
    };
}

/**
 * Dialog resolvers, keyed by dialog id.
 *
 * Kept beside the store rather than inside it: the state stays plain data (which is what makes it
 * inspectable and safe to log), while the promise each caller is awaiting lives here.
 */
const dialogResolvers = new Map<string, (buttonId: string) => void>();
let dialogCounter = 0;

/** Close guards registered by apps with unsaved work. Functions, so they live outside the state. */
const closeGuards = new Map<string, () => Promise<boolean>>();
const guardsPending = new Set<string>();

/**
 * localStorage that cannot throw. A full or blocked storage used to be able to throw out of
 * `set()`, taking the action that triggered the save down with it. Now the change still applies
 * for this session, and the failure is reported in the Event Viewer instead of silently lost.
 */
const safeLocalStorage: StateStorage = {
    getItem: (name) => {
        try {
            return localStorage.getItem(name);
        } catch {
            return null;
        }
    },
    setItem: (name, value) => {
        try {
            localStorage.setItem(name, value);
        } catch {
            publish({
                type: 'app:message',
                source: 'Storage',
                level: 'error',
                message: 'Settings and files could not be saved: this browser refused the write (storage full or blocked).',
            });
        }
    },
    removeItem: (name) => {
        try {
            localStorage.removeItem(name);
        } catch {
            /* nothing to report: removal only happens on reset */
        }
    },
};

/** Keep only well-formed visitor files from whatever localStorage handed back. */
function sanitizeUserFiles(v: unknown): Record<string, UserFile> {
    if (!v || typeof v !== 'object') return {};
    const out: Record<string, UserFile> = {};
    const mimes: UserFile['mime'][] = ['text/plain', 'text/markdown', 'image/png', 'image/jpeg'];
    for (const [path, f] of Object.entries(v as Record<string, unknown>)) {
        if (!f || typeof f !== 'object') continue;
        const { content, mime, modified } = f as Partial<UserFile>;
        if (typeof content !== 'string' || !mimes.includes(mime as UserFile['mime'])) continue;
        if (validateUserPath(path)) continue;
        out[path] = { content, mime: mime as UserFile['mime'], modified: typeof modified === 'number' ? modified : 0 };
    }
    return out;
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
            themeId: DEFAULT_THEME,
            screenSaver: DEFAULT_SCREEN_SAVER,
            screenSaverActive: false,

            windows: [],
            activeWindowId: null,
            desktopIcons: {},

            recycleBin: [],
            deletedAppIds: [],
            userFiles: {},
            dialogs: [],

            actions: {
                bootComplete: () => {
                    set({ isBooting: false });
                    publish({ type: 'system:boot' });
                },
                login: () => {
                    set({ isLoggedIn: true });
                    publish({ type: 'system:login' });
                },
                logout: () => {
                    // Also called after Turn Off from the logon screen, where nobody was logged on:
                    // the log must not record a logoff for a session that never existed.
                    const wasLoggedIn = get().isLoggedIn;
                    set({ isLoggedIn: false, windows: [], activeWindowId: null, screenSaverActive: false });
                    if (wasLoggedIn) publish({ type: 'system:logoff' });
                },
                shutdown: () => {
                    set({ isShuttingDown: true });
                    publish({ type: 'system:shutdown' });
                },
                cancelShutdown: () => set({ isShuttingDown: false }),

                setVolume: (v) => set({ volume: Math.max(0, Math.min(1, v)), isMuted: v === 0 }),
                toggleMute: () => {
                    set(state => ({ isMuted: !state.isMuted }));
                    publish({ type: 'setting:changed', key: 'mute', value: get().isMuted ? 'on' : 'off' });
                },
                setWallpaper: (id) => {
                    if (get().wallpaperId === id) return;
                    set({ wallpaperId: id });
                    publish({ type: 'setting:changed', key: 'wallpaper', value: id });
                },

                setTheme: (id) => {
                    if (!isThemeId(id) || get().themeId === id) return;
                    set({ themeId: id });
                    publish({ type: 'setting:changed', key: 'colour scheme', value: id });
                },

                setScreenSaver: (patch) => {
                    const prev = get().screenSaver;
                    const next = sanitizeScreenSaver({ ...prev, ...patch });
                    if (next.kind === prev.kind && next.idleMinutes === prev.idleMinutes) return;
                    set({ screenSaver: next });
                    if (next.kind !== prev.kind) {
                        publish({ type: 'setting:changed', key: 'screen saver', value: next.kind });
                    }
                    if (next.idleMinutes !== prev.idleMinutes) {
                        publish({ type: 'setting:changed', key: 'screen saver wait', value: `${next.idleMinutes} min` });
                    }
                },

                setScreenSaverActive: (active) => {
                    if (get().screenSaverActive === active) return;
                    set({ screenSaverActive: active });
                },

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
                    /*
                     * On a phone a floating window is wider than the screen and the body cannot
                     * scroll, so the part that overflows is simply unreachable. Windows open
                     * maximised there and the taskbar becomes the app switcher: the same window
                     * manager, one window at a time. See `utils/viewport.ts`.
                     */
                    const mobile = isMobileViewport();
                    const newWindow: AppWindow = {
                        id: nextPid(),
                        appId,
                        // Registry first: callers passing their own literal is how window titles
                        // drifted out of sync with `constants/apps.ts` in the first place.
                        title: title || APPS[appId]?.title || appId,
                        isMinimized: false,
                        isMaximized: mobile,
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
                    publish({ type: 'app:opened', appId, pid: newWindow.id, title: newWindow.title });
                },

                /** Remove and re-pack the survivors so the z band stays `Z_BASE..Z_BASE+n-1`. */
                closeWindow: (id, by) => {
                    const guard = closeGuards.get(id);
                    if (guard && !by) {
                        // Ask first. Only one prompt at a time per window: a second X while the
                        // first question is open must not stack another.
                        if (guardsPending.has(id)) return;
                        guardsPending.add(id);
                        void guard().then((allow) => {
                            guardsPending.delete(id);
                            if (allow) {
                                closeGuards.delete(id);
                                get().actions.closeWindow(id);
                            }
                        });
                        return;
                    }
                    closeGuards.delete(id);
                    const target = get().windows.find(w => w.id === id);
                    set(state => ({
                        windows: renormalize(byZ(state.windows.filter(w => w.id !== id))),
                        activeWindowId: state.activeWindowId === id ? null : state.activeWindowId
                    }));
                    // Publish only if something was really closed: a stale id is a no-op, and the
                    // log must not report a close that did not happen.
                    if (!target) return;
                    publish(by
                        ? { type: 'app:killed', pid: target.id, title: target.title, by }
                        : { type: 'app:closed', appId: target.appId, pid: target.id, title: target.title });
                },

                minimizeWindow: (id) => {
                    const target = get().windows.find(w => w.id === id);
                    set(state => ({
                        windows: state.windows.map(w => w.id === id ? { ...w, isMinimized: true } : w),
                        activeWindowId: state.activeWindowId === id ? null : state.activeWindowId
                    }));
                    if (target && !target.isMinimized) publish({ type: 'app:minimized', pid: target.id, title: target.title });
                },

                maximizeWindow: (id) => set(state => ({
                    windows: state.windows.map(w => w.id === id ? { ...w, isMaximized: true } : w)
                })),

                /**
                 * Un-minimise and raise. Deliberately preserves `isMaximized`: restoring a
                 * maximised window from the taskbar used to silently un-maximise it, so
                 * minimise/restore was not lossless.
                 */
                restoreWindow: (id) => {
                    const target = get().windows.find(w => w.id === id);
                    set(state => ({
                        windows: raise(state.windows, id).map(w =>
                            w.id === id ? { ...w, isMinimized: false } : w
                        ),
                        activeWindowId: id,
                    }));
                    if (target?.isMinimized) publish({ type: 'app:restored', pid: target.id, title: target.title });
                },

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

                minimizeAll: () => {
                    const changed = get().windows.filter(w => !w.isMinimized);
                    set(state => ({
                        windows: state.windows.map(w => ({ ...w, isMinimized: true })),
                        activeWindowId: null,
                    }));
                    changed.forEach(w => publish({ type: 'app:minimized', pid: w.id, title: w.title }));
                },

                /**
                 * Cascade, un-minimising and un-maximising as XP did, and clamped so a long
                 * cascade cannot push the last window off a short screen.
                 *
                 * On a phone this is a no-op on layout: the shell's whole model below the mobile
                 * breakpoint is one maximised window at a time (see `openWindow` and
                 * `Window.tsx`, which hides the controls that would let a visitor recover from a
                 * floating window there). Cascading into floating boxes with no maximise button,
                 * no drag and no resize grip would strand every one of them.
                 */
                cascadeWindows: () => {
                    const restored = get().windows.filter(w => w.isMinimized);
                    get().actions.__cascade();
                    restored.forEach(w => publish({ type: 'app:restored', pid: w.id, title: w.title }));
                },

                __cascade: () => set(state => {
                    const ordered = byZ(state.windows);
                    if (isMobileViewport()) {
                        return {
                            windows: ordered.map(w => ({ ...w, isMinimized: false, isMaximized: true })),
                            activeWindowId: ordered.length ? ordered[ordered.length - 1].id : null,
                        };
                    }
                    return {
                        windows: renormalize(
                            ordered.map((w, i) => ({
                                ...w,
                                isMinimized: false,
                                isMaximized: false,
                                position: clampToViewport({ x: 30 + i * 26, y: 24 + i * 26 }, w.size),
                            })),
                        ),
                        activeWindowId: ordered.length ? ordered[ordered.length - 1].id : null,
                    };
                }),

                /**
                 * Reconcile every window's geometry with the mobile breakpoint.
                 *
                 * A window's `isMaximized` was previously decided only at open time. Crossing the
                 * breakpoint afterwards — rotating a phone, or resizing a desktop browser across
                 * 768px — left an already-open window with the wrong shape and no way back: on the
                 * mobile side of the crossing, `Window.tsx` hides the maximise control, the resize
                 * grip and dragging, so a window that was floating and desktop-sized when the
                 * crossing happened became permanently stranded, wider than the screen with no
                 * route to fix it. Called from the one resize/orientation listener in `Desktop`.
                 */
                syncViewportBreakpoint: (mobile) => set(state => {
                    if (!mobile) return {};
                    if (state.windows.every(w => w.isMaximized)) return {};
                    return { windows: state.windows.map(w => ({ ...w, isMaximized: true })) };
                }),

                /** Persisted, so clamped on write: a position under the taskbar must never be saved. */
                setDesktopIconPosition: (id, x, y) => set(state => ({
                    desktopIcons: { ...state.desktopIcons, [id]: clampIconToViewport({ x, y }) }
                })),

                resetDesktopIcons: () => {
                    if (Object.keys(get().desktopIcons).length === 0) return;
                    set({ desktopIcons: {} });
                    publish({ type: 'setting:changed', key: 'icon positions', value: 'default' });
                },

                deleteIcon: (appId, name, icon) => {
                    if (get().deletedAppIds.includes(appId)) return;
                    set(state => ({
                        deletedAppIds: [...state.deletedAppIds, appId],
                        recycleBin: [
                            ...state.recycleBin,
                            { id: appId, name, icon, origin: 'Desktop', deletedAt: Date.now() }
                        ]
                    }));
                    publish({ type: 'recycle:deleted', name });
                },

                restoreItem: (id) => {
                    const item = get().recycleBin.find(r => r.id === id);
                    set(state => ({
                        deletedAppIds: state.deletedAppIds.filter(a => a !== id),
                        recycleBin: state.recycleBin.filter(r => r.id !== id)
                    }));
                    if (item) publish({ type: 'recycle:restored', name: item.name, fromBin: true });
                },

                /**
                 * Bring every deleted icon back. `deletedAppIds` persists, so a visitor could
                 * otherwise lose the Projects icon for good and have to think to open the
                 * Recycle Bin to recover it; Display Properties offers this instead.
                 */
                restoreAllItems: () => {
                    // Publish per *deleted icon*, not per bin entry: an icon whose bin entry was
                    // already emptied still comes back, and the log used to say nothing about it.
                    const { recycleBin, deletedAppIds } = get();
                    if (recycleBin.length === 0 && deletedAppIds.length === 0) return;
                    set({ deletedAppIds: [], recycleBin: [] });
                    deletedAppIds.forEach((id) => {
                        const item = recycleBin.find(r => r.id === id);
                        publish({ type: 'recycle:restored', name: item?.name ?? APPS[id]?.title ?? id, fromBin: Boolean(item) });
                    });
                },

                writeUserFile: (path, { content, mime }) => {
                    const invalid = validateUserPath(path);
                    if (invalid) return invalid;
                    const current = get().userFiles;
                    const created = current[path] === undefined;
                    const next = { ...current, [path]: { content, mime: mime ?? mimeForName(path), modified: Date.now() } };
                    if (userFilesSize(next) > USER_FILES_QUOTA) {
                        return 'There is not enough space left in this browser to save that file. Delete something from /home/guest first.';
                    }
                    set({ userFiles: next });
                    publish({ type: 'fs:write', path, created, bytes: content.length });
                    return null;
                },

                deleteUserFile: (path) => {
                    const current = get().userFiles;
                    if (current[path] === undefined) {
                        return validateUserPath(path) ?? 'The file does not exist.';
                    }
                    const next = { ...current };
                    delete next[path];
                    set({ userFiles: next });
                    publish({ type: 'fs:delete', path });
                    return null;
                },

                setWindowTitle: (id, title) => {
                    const target = get().windows.find(w => w.id === id);
                    if (!target || target.title === title) return;
                    set(state => ({ windows: state.windows.map(w => w.id === id ? { ...w, title } : w) }));
                },

                registerCloseGuard: (id, guard) => {
                    closeGuards.set(id, guard);
                    return () => {
                        if (closeGuards.get(id) === guard) closeGuards.delete(id);
                    };
                },

                emptyRecycleBin: () => {
                    const count = get().recycleBin.length;
                    set({ recycleBin: [] });
                    if (count > 0) publish({ type: 'recycle:emptied', count });
                },

                openDialog: (request) => {
                    const id = `dlg${++dialogCounter}`;
                    set(state => ({ dialogs: [...state.dialogs, { ...request, id }] }));
                    publish({ type: 'dialog:shown', title: request.title });
                    return new Promise<string>((resolve) => {
                        dialogResolvers.set(id, resolve);
                    });
                },

                resolveDialog: (id, buttonId) => {
                    const resolve = dialogResolvers.get(id);
                    dialogResolvers.delete(id);
                    const shown = get().dialogs.find(d => d.id === id);
                    if (shown) {
                        const label = shown.buttons.find(b => b.id === buttonId)?.label ?? buttonId;
                        publish({ type: 'dialog:answered', title: shown.title, button: label });
                    }
                    set(state => ({ dialogs: state.dialogs.filter(d => d.id !== id) }));
                    // After the state update, so a caller that opens another dialog in response
                    // does not race the removal of this one.
                    resolve?.(buttonId);
                },
            }
        }),
        {
            name: 'gaurav-xp-os',
            storage: createJSONStorage(() => (typeof window !== 'undefined' ? safeLocalStorage : ({
                getItem: () => null, setItem: () => { }, removeItem: () => { }
            } satisfies StateStorage))),
            // Derived from `store/persistence.ts`, which `/etc/system.conf` also renders, so the
            // list the shell shows a visitor cannot drift from what is actually saved.
            partialize: (state): Pick<SystemState, PersistedKey> => pick(state, PERSISTED_KEYS),
            // localStorage is user-editable, and an older build's save has no theme or screen
            // saver at all. Validate what comes back instead of trusting it.
            merge: (persisted, current) => {
                const saved = (persisted ?? {}) as Partial<SystemState>;
                return {
                    ...current,
                    ...saved,
                    themeId: isThemeId(saved.themeId) ? saved.themeId : DEFAULT_THEME,
                    screenSaver: sanitizeScreenSaver(saved.screenSaver),
                    userFiles: sanitizeUserFiles(saved.userFiles),
                };
            },
        }
    )
);

/*
 * Keep the virtual filesystem's view of /home/guest in step with the store. The VFS is headless
 * and must not import the store, so the store pushes to it: once now, and on every change —
 * including the rehydration from localStorage, which arrives as an ordinary state change.
 */
mountUserFiles(useSystemStore.getState().userFiles);
useSystemStore.subscribe((state, prev) => {
    if (state.userFiles !== prev.userFiles) mountUserFiles(state.userFiles);
});
