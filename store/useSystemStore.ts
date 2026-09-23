import { create } from 'zustand';
import { persist, createJSONStorage, type StateStorage } from 'zustand/middleware';
import { APPS } from '@/constants/apps';
import { PERSISTED_KEYS, type PersistedKey } from '@/store/persistence';
import { isMobileViewport, taskbarHeight } from '@/utils/viewport';
import { publish } from '@/system/bus';
import {
    USER_FILES_QUOTA,
    isFile,
    lookup,
    mimeForName,
    mountUserFiles,
    planCopy,
    planMove,
    planRecycle,
    planRemoveFolder,
    planRestore,
    recycledSize,
    sanitizeFolders,
    userFilesSize,
    validateUserContent,
    validateUserPath,
    type RecycledTree,
    type UserFile,
    type UserTree,
} from '@/system/vfs';
import {
    DEFAULT_SCREEN_SAVER,
    DEFAULT_THEME,
    isThemeId,
    isWallpaperPosition,
    type WallpaperFile,
    type WallpaperPosition,
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

interface RecycledBase {
    id: string;
    name: string;
    /** Where it was deleted from, as the bin's Original Location column shows it. */
    origin: string;
    deletedAt: number;
}

/**
 * What the Recycle Bin holds: a desktop icon (`kind` absent in saves from before files could be
 * recycled), or a visitor's file or folder with everything that was in it.
 */
export type RecycledItem =
    | (RecycledBase & { kind?: 'icon'; icon: string })
    | (RecycledBase & { kind: 'file'; item: RecycledTree });

const recycledTrees = (bin: readonly RecycledItem[]): RecycledTree[] =>
    bin.flatMap((r) => (r.kind === 'file' ? [r.item] : []));
let recycleCounter = 0;

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
    /** A picture from the filesystem shown instead of `wallpaperId`. A path, never a copy. */
    wallpaperFile: WallpaperFile | null;
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
    /** Folders the visitor made under /home/guest, as absolute paths, sorted. Persisted. */
    userFolders: string[];

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
        /**
         * Use a picture from the filesystem as the wallpaper (XP's Desktop > Browse..., and Paint's
         * Set As Background). The picture must already be a file — nothing is copied. Returns why it
         * cannot be used, or null.
         */
        setWallpaperFile: (path: string, position: WallpaperPosition) => string | null;
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
        /** Put a Recycle Bin item back where it was. Returns why it cannot go back, or null. */
        restoreItem: (id: string) => string | null;
        /** Delete one Recycle Bin item for good. */
        purgeRecycledItem: (id: string) => void;
        /**
         * Send a visitor's file, or a folder and everything in it, to the Recycle Bin — what
         * Explorer's Delete does. Returns why it cannot, or null. (`rm` deletes outright.)
         */
        recycleUserPath: (path: string) => string | null;
        /** Put every deleted desktop icon back. Files in the bin stay there. */
        restoreAllItems: () => void;

        /**
         * Create or overwrite a file under /home/guest. Returns why it failed, or null. The mime
         * type follows the extension unless given. Refuses read-only paths and anything that
         * would push the visitor's files past their share of localStorage.
         */
        writeUserFile: (path: string, file: { content: string; mime?: UserFile['mime'] }) => string | null;
        /** Delete a visitor's file. Returns why it failed, or null. */
        deleteUserFile: (path: string) => string | null;
        /** Make a folder under /home/guest. Returns why it failed, or null. */
        createUserFolder: (path: string) => string | null;
        /**
         * Rename or move a visitor's file or folder, with everything inside it. Returns why it
         * failed, or null. A picture wallpaper inside it follows it to the new path.
         */
        moveUserPath: (from: string, to: string) => string | null;
        /**
         * Copy a file (the visitor's, or one of the portfolio's) or a visitor's folder with everything
         * in it. Returns why it cannot, or null. Never overwrites.
         */
        copyUserPath: (from: string, to: string) => string | null;
        /**
         * Delete a folder the visitor made. Without `recursive`, only an empty one (`rmdir`); with
         * it, everything inside goes too (Explorer's Delete, `rm -r`). Returns why it failed, or null.
         */
        deleteUserFolder: (path: string, recursive: boolean) => string | null;

        /** Retitle a window, e.g. "notes.txt - Notepad". */
        setWindowTitle: (id: string, title: string) => void;
        /**
         * Let an app intercept an ordinary close (title-bar X, Alt+F4, File > Exit) to ask about
         * unsaved work. The guard resolves true to allow the close. `kill` and End Task bypass it,
         * as ending a process did in XP. Returns the unregister function.
         */
        registerCloseGuard: (id: string, guard: () => Promise<boolean>) => () => void;
        /**
         * Before Log Off or Turn Off: ask every window with unsaved work, one at a time, as XP did.
         * Resolves false as soon as one says Cancel — the session must then stay.
         */
        requestEndSession: () => Promise<boolean>;
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
/**
 * Whether the last write to localStorage failed. The persist middleware writes after every
 * `set()` — a focus, a dialog, a title — so the failure is reported once when it starts rather than
 * on every click, which used to push every genuine entry out of the 500-entry log.
 */
let persistFailed = false;

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
            persistFailed = false;
        } catch {
            if (!persistFailed) {
                publish({
                    type: 'app:message',
                    source: 'Storage',
                    level: 'error',
                    message: 'Settings and files could not be saved: this browser refused the write (storage full or blocked).',
                });
            }
            persistFailed = true;
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

type StoreSet = (partial: Partial<SystemState>) => void;

/**
 * Replace the visitor's files and folders together. The persist middleware writes synchronously
 * inside `set`; if the browser refused, put the old tree back and say so, rather than show a
 * change that would be gone on reload.
 */
function commitTree(set: StoreSet, next: UserTree, before: UserTree): string | null {
    set({ userFiles: next.files, userFolders: [...next.folders] });
    if (!persistFailed) return null;
    set({ userFiles: before.files, userFolders: [...before.folders] });
    return 'This browser refused to store the change, so it was not made. Site data may be blocked, or storage is full.';
}

/**
 * Recycle Bin entries from storage that are still well-formed. A file entry is only checked for
 * shape here; putting it back re-validates every path, as a live restore does.
 */
function sanitizeRecycleBin(v: unknown): RecycledItem[] {
    if (!Array.isArray(v)) return [];
    const str = (x: unknown): x is string => typeof x === 'string';
    return v.flatMap((r): RecycledItem[] => {
        if (!r || typeof r !== 'object') return [];
        const { id, name, origin, deletedAt, kind } = r as Record<string, unknown>;
        if (!str(id) || !str(name) || !str(origin) || typeof deletedAt !== 'number') return [];
        const base = { id, name, origin, deletedAt };
        if (kind === 'file') {
            const item = (r as { item?: Partial<RecycledTree> }).item;
            if (!item || !str(item.path) || !Array.isArray(item.folders) || !item.folders.every(str)) return [];
            const files = sanitizeUserFiles(item.files, [], true);
            return [{ ...base, kind: 'file', item: { path: item.path, files, folders: item.folders } }];
        }
        const icon = (r as { icon?: unknown }).icon;
        return str(icon) ? [{ ...base, icon }] : [];
    });
}

/** A saved picture wallpaper, if it is still well-formed. Whether the file exists is checked at draw time. */
function sanitizeWallpaperFile(v: unknown): WallpaperFile | null {
    if (!v || typeof v !== 'object') return null;
    const { path, position } = v as Partial<WallpaperFile>;
    if (typeof path !== 'string' || !path.startsWith('/') || !isWallpaperPosition(position)) return null;
    return { path, position };
}

/** Keep only well-formed visitor files from whatever localStorage handed back. */
function sanitizeUserFiles(v: unknown, folders: readonly string[], shapeOnly = false): Record<string, UserFile> {
    if (!v || typeof v !== 'object') return {};
    const out: Record<string, UserFile> = {};
    const mimes: UserFile['mime'][] = ['text/plain', 'text/markdown', 'image/png', 'image/jpeg'];
    for (const [path, f] of Object.entries(v as Record<string, unknown>)) {
        if (!f || typeof f !== 'object') continue;
        const { content, mime, modified } = f as Partial<UserFile>;
        if (typeof content !== 'string' || !mimes.includes(mime as UserFile['mime'])) continue;
        // The same two rules a live write obeys: a visitor can edit localStorage by hand.
        if (!shapeOnly && (validateUserPath(path, folders) || validateUserContent(path, content))) continue;
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
    const maxY = window.innerHeight - taskbarHeight() - 28; // title bar stays above the taskbar
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
    const maxY = Math.max(0, window.innerHeight - taskbarHeight() - ICON_HEIGHT);
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
        height: Math.min(height, Math.max(1, window.innerHeight - taskbarHeight() - VIEWPORT_MARGIN)),
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
            wallpaperFile: null,
            themeId: DEFAULT_THEME,
            screenSaver: DEFAULT_SCREEN_SAVER,
            screenSaverActive: false,

            windows: [],
            activeWindowId: null,
            desktopIcons: {},

            recycleBin: [],
            deletedAppIds: [],
            userFiles: {},
            userFolders: [],
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
                    // Nothing from the old session may survive onto the next desktop: an open
                    // "save the changes?" box, or a guard for a window that no longer exists.
                    const pending = get().dialogs;
                    closeGuards.clear();
                    guardsPending.clear();
                    set({ isLoggedIn: false, windows: [], activeWindowId: null, screenSaverActive: false, dialogs: [] });
                    for (const d of pending) {
                        const cancel = d.buttons.find(b => b.cancel) ?? d.buttons[d.buttons.length - 1];
                        const resolve = dialogResolvers.get(d.id);
                        dialogResolvers.delete(d.id);
                        resolve?.(cancel?.id ?? '');
                    }
                    if (wasLoggedIn) publish({ type: 'system:logoff' });
                },

                requestEndSession: async () => {
                    for (const [id, guard] of Array.from(closeGuards)) {
                        if (!get().windows.some(w => w.id === id)) continue;
                        // Bring the window forward so the visitor sees what the question is about.
                        get().actions.restoreWindow(id);
                        if (!(await guard())) return false;
                    }
                    return true;
                },
                shutdown: () => {
                    set({ isShuttingDown: true });
                    publish({ type: 'system:shutdown' });
                },
                cancelShutdown: () => set({ isShuttingDown: false }),

                setVolume: (v) => {
                    const wasMuted = get().isMuted;
                    set({ volume: Math.max(0, Math.min(1, v)), isMuted: v === 0 });
                    // Dragging to 0 mutes and dragging up unmutes, as the tray slider did in XP. The log
                    // must say so, or its last mute entry contradicts what the visitor hears.
                    const isMuted = get().isMuted;
                    if (isMuted !== wasMuted) publish({ type: 'setting:changed', key: 'mute', value: isMuted ? 'on' : 'off' });
                },
                toggleMute: () => {
                    set(state => ({ isMuted: !state.isMuted }));
                    publish({ type: 'setting:changed', key: 'mute', value: get().isMuted ? 'on' : 'off' });
                },
                setWallpaper: (id) => {
                    const { wallpaperId, wallpaperFile } = get();
                    if (wallpaperId === id && !wallpaperFile) return;
                    // Choosing a built-in background replaces a picture wallpaper, as it did in XP.
                    set({ wallpaperId: id, wallpaperFile: null });
                    publish({ type: 'setting:changed', key: 'wallpaper', value: id });
                },

                setWallpaperFile: (path, position) => {
                    const node = lookup(path);
                    if (!node || !isFile(node) || !node.src) return 'That is not a picture file.';
                    if (!isWallpaperPosition(position)) return 'Unknown picture position.';
                    const current = get().wallpaperFile;
                    if (current && current.path === path && current.position === position) return null;
                    set({ wallpaperFile: { path, position } });
                    publish({ type: 'setting:changed', key: 'wallpaper', value: `${path} (${position})` });
                    return null;
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
                    if (item?.kind === 'file') {
                        const before: UserTree = { files: get().userFiles, folders: get().userFolders };
                        const plan = planRestore(before, item.item);
                        if (typeof plan === 'string') return plan;
                        const refused = commitTree(set, plan, before);
                        if (refused) return refused;
                        set(state => ({ recycleBin: state.recycleBin.filter(r => r.id !== id) }));
                        publish({ type: 'recycle:restored', name: item.name, fromBin: true });
                        return null;
                    }
                    set(state => ({
                        deletedAppIds: state.deletedAppIds.filter(a => a !== id),
                        recycleBin: state.recycleBin.filter(r => r.id !== id)
                    }));
                    if (item) publish({ type: 'recycle:restored', name: item.name, fromBin: true });
                    return null;
                },

                purgeRecycledItem: (id) => {
                    const item = get().recycleBin.find(r => r.id === id);
                    if (!item) return;
                    set(state => ({ recycleBin: state.recycleBin.filter(r => r.id !== id) }));
                    publish({ type: 'recycle:purged', name: item.name });
                },

                recycleUserPath: (path) => {
                    const before: UserTree = { files: get().userFiles, folders: get().userFolders };
                    const plan = planRecycle(before, path);
                    if (typeof plan === 'string') return plan;
                    const name = path.slice(path.lastIndexOf('/') + 1);
                    const entry: RecycledItem = {
                        kind: 'file',
                        id: `file-${Date.now().toString(36)}-${++recycleCounter}`,
                        name,
                        origin: path.slice(0, path.lastIndexOf('/')),
                        deletedAt: Date.now(),
                        item: plan.taken,
                    };
                    const bin = get().recycleBin;
                    // One write: the file leaves the tree and lands in the bin together, so a refusal
                    // by the browser can put both back as they were.
                    set({ userFiles: plan.tree.files, userFolders: [...plan.tree.folders], recycleBin: [...bin, entry] });
                    if (persistFailed) {
                        set({ userFiles: before.files, userFolders: [...before.folders], recycleBin: bin });
                        return 'This browser refused to store the change, so nothing was deleted. Site data may be blocked, or storage is full.';
                    }
                    const wallpaper = get().wallpaperFile;
                    const tookWallpaper = !!wallpaper && (wallpaper.path === path || wallpaper.path.startsWith(path + '/'));
                    if (tookWallpaper) set({ wallpaperFile: null });
                    publish({ type: 'recycle:deleted', name });
                    if (tookWallpaper) publish({ type: 'setting:changed', key: 'wallpaper', value: get().wallpaperId });
                    return null;
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
                    if (deletedAppIds.length === 0 && !recycleBin.some(r => r.kind !== 'file')) return;
                    // Only icons: a file in the bin is not a desktop icon, and must not vanish with them.
                    set({ deletedAppIds: [], recycleBin: recycleBin.filter(r => r.kind === 'file') });
                    deletedAppIds.forEach((id) => {
                        const item = recycleBin.find(r => r.id === id);
                        publish({ type: 'recycle:restored', name: item?.name ?? APPS[id]?.title ?? id, fromBin: Boolean(item) });
                    });
                },

                writeUserFile: (path, { content, mime }) => {
                    const invalid = validateUserPath(path) ?? validateUserContent(path, content);
                    if (invalid) return invalid;
                    const current = get().userFiles;
                    const created = current[path] === undefined;
                    const next = { ...current, [path]: { content, mime: mime ?? mimeForName(path), modified: Date.now() } };
                    if (userFilesSize(next, get().userFolders) + recycledSize(recycledTrees(get().recycleBin)) > USER_FILES_QUOTA) {
                        return 'There is not enough space left in this browser to save that file. Delete something from /home/guest first.';
                    }
                    set({ userFiles: next });
                    // The persist middleware has just tried to store it (synchronously). If the browser
                    // refused, the file would vanish on reload while the save looked successful — so
                    // undo it and say why, rather than report a save that did not happen.
                    if (persistFailed) {
                        set({ userFiles: current });
                        return 'This browser refused to store the file, so it was not saved. Site data may be blocked, or storage is full.';
                    }
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
                    // A deleted picture cannot stay the wallpaper; fall back to the built-in one.
                    const wasWallpaper = get().wallpaperFile?.path === path;
                    set(wasWallpaper ? { userFiles: next, wallpaperFile: null } : { userFiles: next });
                    publish({ type: 'fs:delete', path });
                    if (wasWallpaper) publish({ type: 'setting:changed', key: 'wallpaper', value: get().wallpaperId });
                    return null;
                },

                createUserFolder: (path) => {
                    const { userFiles: files, userFolders: folders } = get();
                    if (files[path] !== undefined) return 'A file with that name already exists.';
                    const invalid = validateUserPath(path, folders);
                    if (invalid) return invalid;
                    const next = [...folders, path].sort();
                    if (userFilesSize(files, next) + recycledSize(recycledTrees(get().recycleBin)) > USER_FILES_QUOTA) {
                        return 'There is not enough space left in this browser. Delete something from /home/guest first.';
                    }
                    const refused = commitTree(set, { files, folders: next }, { files, folders });
                    if (refused) return refused;
                    publish({ type: 'fs:mkdir', path });
                    return null;
                },

                moveUserPath: (from, to) => {
                    const before: UserTree = { files: get().userFiles, folders: get().userFolders };
                    const plan = planMove(before, from, to);
                    if (typeof plan === 'string') return plan;
                    if (plan === before) return null;
                    const refused = commitTree(set, plan, before);
                    if (refused) return refused;
                    // The wallpaper names a file by path; if that file moved, follow it.
                    const wallpaper = get().wallpaperFile;
                    if (wallpaper && (wallpaper.path === from || wallpaper.path.startsWith(from + '/'))) {
                        set({ wallpaperFile: { ...wallpaper, path: to + wallpaper.path.slice(from.length) } });
                    }
                    publish({ type: 'fs:move', from, to });
                    return null;
                },

                copyUserPath: (from, to) => {
                    const before: UserTree = { files: get().userFiles, folders: get().userFolders };
                    const plan = planCopy(before, from, to);
                    if (typeof plan === 'string') return plan;
                    if (userFilesSize(plan.files, plan.folders) + recycledSize(recycledTrees(get().recycleBin)) > USER_FILES_QUOTA) {
                        return 'There is not enough space left in this browser for the copy. Delete something from /home/guest first.';
                    }
                    const refused = commitTree(set, plan, before);
                    if (refused) return refused;
                    publish({ type: 'fs:copy', from, to });
                    return null;
                },

                deleteUserFolder: (path, recursive) => {
                    const before: UserTree = { files: get().userFiles, folders: get().userFolders };
                    const plan = planRemoveFolder(before, path, recursive);
                    if (typeof plan === 'string') return plan;
                    const refused = commitTree(set, plan.tree, before);
                    if (refused) return refused;
                    const wallpaper = get().wallpaperFile;
                    const tookWallpaper = !!wallpaper && wallpaper.path.startsWith(path + '/');
                    if (tookWallpaper) set({ wallpaperFile: null });
                    publish({ type: 'fs:delete', path, folder: true, items: plan.removed });
                    if (tookWallpaper) publish({ type: 'setting:changed', key: 'wallpaper', value: get().wallpaperId });
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
                // Folders first: a file is only kept if the folder it is in survived too.
                const folders = sanitizeFolders(saved.userFolders);
                return {
                    ...current,
                    ...saved,
                    themeId: isThemeId(saved.themeId) ? saved.themeId : DEFAULT_THEME,
                    screenSaver: sanitizeScreenSaver(saved.screenSaver),
                    userFiles: sanitizeUserFiles(saved.userFiles, folders),
                    userFolders: folders,
                    recycleBin: sanitizeRecycleBin(saved.recycleBin),
                    wallpaperFile: sanitizeWallpaperFile(saved.wallpaperFile),
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
const mount = (s: SystemState) => mountUserFiles(s.userFiles, s.userFolders, recycledSize(recycledTrees(s.recycleBin)));
mount(useSystemStore.getState());
useSystemStore.subscribe((state, prev) => {
    if (state.userFiles !== prev.userFiles || state.userFolders !== prev.userFolders || state.recycleBin !== prev.recycleBin) {
        mount(state);
    }
});

/*
 * Another tab of this site wrote the same storage key. Without this, this tab's next ordinary
 * action — the middleware persists after every `set()` — wrote its stale copy back over it, and a
 * file saved in the other tab was gone on reload. Rehydrating keeps both tabs on one truth. The
 * write that follows is byte-identical, so it raises no event of its own and cannot ping-pong.
 */
if (typeof window !== 'undefined') {
    window.addEventListener('storage', (e) => {
        if (e.key === 'gaurav-xp-os') void useSystemStore.persist.rehydrate();
    });
}
