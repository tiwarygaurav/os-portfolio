/**
 * The system event bus.
 *
 * Headless, like the rest of `system/`: no React, no DOM, no store. The store, the shell and the
 * apps *publish* what happened; anything interested *subscribes*. Its first real consumer is the
 * Event Viewer, which renders the log — a visitor can watch windows, the shell and the settings
 * panel talk to each other, which is the clearest demonstration that this desktop is a system
 * rather than a set of pages.
 *
 * Rules (see `docs/ROADMAP.md` §3):
 *  - Events describe **what happened**, never what should happen. There is no `openProjects`
 *    event; there is `app:opened`.
 *  - Nothing is invented. Every entry in the log was published by code that really did the thing
 *    it reports.
 *  - The log is bounded. It is a diagnostic, not a database.
 *  - Every subscription returns an unsubscribe and must be torn down on unmount.
 */

/** The three XP Event Viewer logs. */
export type EventLog = 'Application' | 'System' | 'Security';

/** XP's three severities. */
export type EventLevel = 'information' | 'warning' | 'error';

/**
 * Everything that can be published. Keep this a closed union: a new kind of event is a new
 * variant here, and `describe()` below must say what it means in plain words.
 */
export type SystemEvent =
    // Session
    | { type: 'system:boot' }
    | { type: 'system:login' }
    | { type: 'system:logoff' }
    | { type: 'system:shutdown' }
    // Window manager
    | { type: 'app:opened'; appId: string; pid: string; title: string }
    | { type: 'app:closed'; appId: string; pid: string; title: string }
    | { type: 'app:minimized'; pid: string; title: string }
    | { type: 'app:restored'; pid: string; title: string }
    | { type: 'app:killed'; pid: string; title: string; by: 'shell' | 'task-manager' }
    // Shell and filesystem
    | { type: 'shell:command'; input: string; ok: boolean }
    | { type: 'fs:read'; path: string }
    // Settings
    | { type: 'setting:changed'; key: string; value: string }
    // Recycle bin
    | { type: 'recycle:deleted'; name: string }
    | { type: 'recycle:restored'; name: string }
    | { type: 'recycle:emptied'; count: number }
    // Dialogs
    | { type: 'dialog:shown'; title: string }
    | { type: 'dialog:answered'; title: string; button: string }
    // Anything an app wants to record about itself
    | { type: 'app:message'; source: string; level: EventLevel; message: string };

export type SystemEventType = SystemEvent['type'];

/** One row of the log, as the Event Viewer shows it. */
export interface LogEntry {
    /** Monotonic, unique for the lifetime of the page. */
    seq: number;
    /** Milliseconds since the epoch. */
    time: number;
    log: EventLog;
    level: EventLevel;
    /** The component that published it, e.g. "WindowManager". */
    source: string;
    /** A short category, e.g. "Process". */
    category: string;
    /** Stable numeric code per event kind — an identifier inside this system, not a Windows one. */
    code: number;
    /** One-line summary. */
    message: string;
    event: SystemEvent;
}

interface Description {
    log: EventLog;
    level: EventLevel;
    source: string;
    category: string;
    code: number;
    message: string;
}

/**
 * What each event means, in words. Exhaustive: adding a variant to `SystemEvent` without a case
 * here is a compile error, which is what keeps the log from ever printing "[object Object]".
 */
export function describe(e: SystemEvent): Description {
    switch (e.type) {
        case 'system:boot':
            return { log: 'System', level: 'information', source: 'Session', category: 'Boot', code: 1001, message: 'The system started.' };
        case 'system:login':
            return { log: 'Security', level: 'information', source: 'Session', category: 'Logon', code: 1002, message: 'A user logged on.' };
        case 'system:logoff':
            return { log: 'Security', level: 'information', source: 'Session', category: 'Logoff', code: 1003, message: 'The user logged off; all windows were closed.' };
        case 'system:shutdown':
            return { log: 'System', level: 'information', source: 'Session', category: 'Shutdown', code: 1004, message: 'The system is shutting down.' };

        case 'app:opened':
            return { log: 'Application', level: 'information', source: 'WindowManager', category: 'Process', code: 2001, message: `"${e.title}" (${e.pid}) was opened.` };
        case 'app:closed':
            return { log: 'Application', level: 'information', source: 'WindowManager', category: 'Process', code: 2002, message: `"${e.title}" (${e.pid}) was closed.` };
        case 'app:minimized':
            return { log: 'Application', level: 'information', source: 'WindowManager', category: 'Window', code: 2003, message: `"${e.title}" (${e.pid}) was minimized.` };
        case 'app:restored':
            return { log: 'Application', level: 'information', source: 'WindowManager', category: 'Window', code: 2004, message: `"${e.title}" (${e.pid}) was restored.` };
        case 'app:killed':
            return {
                log: 'Application',
                level: 'warning',
                source: e.by === 'shell' ? 'Shell' : 'TaskManager',
                category: 'Process',
                code: 2005,
                message: `"${e.title}" (${e.pid}) was ended ${e.by === 'shell' ? 'from the Command Prompt' : 'with End Task'}.`,
            };

        case 'shell:command':
            return {
                log: 'Application',
                level: e.ok ? 'information' : 'warning',
                source: 'Shell',
                category: 'Command',
                code: e.ok ? 3001 : 3002,
                message: e.ok ? `Ran: ${e.input}` : `Failed: ${e.input}`,
            };
        case 'fs:read':
            return { log: 'System', level: 'information', source: 'Filesystem', category: 'Read', code: 3101, message: `Read ${e.path}.` };

        case 'setting:changed':
            return { log: 'System', level: 'information', source: 'Settings', category: 'Configuration', code: 4001, message: `${e.key} was set to "${e.value}".` };

        case 'recycle:deleted':
            return { log: 'Application', level: 'information', source: 'RecycleBin', category: 'Delete', code: 5001, message: `"${e.name}" was sent to the Recycle Bin.` };
        case 'recycle:restored':
            return { log: 'Application', level: 'information', source: 'RecycleBin', category: 'Restore', code: 5002, message: `"${e.name}" was restored from the Recycle Bin.` };
        case 'recycle:emptied':
            return { log: 'Application', level: 'warning', source: 'RecycleBin', category: 'Delete', code: 5003, message: `The Recycle Bin was emptied (${e.count} item${e.count === 1 ? '' : 's'}).` };

        case 'dialog:shown':
            return { log: 'Application', level: 'information', source: 'Dialogs', category: 'Message box', code: 6001, message: `A message box was shown: "${e.title}".` };
        case 'dialog:answered':
            return { log: 'Application', level: 'information', source: 'Dialogs', category: 'Message box', code: 6002, message: `"${e.title}" was answered with "${e.button}".` };

        case 'app:message':
            return { log: 'Application', level: e.level, source: e.source, category: 'Message', code: 9001, message: e.message };
    }
}

/* ------------------------------------------------------------------ state */

/** Oldest entries are dropped past this. Enough to scroll through, small enough to be free. */
export const LOG_LIMIT = 500;

let seq = 0;
let log: LogEntry[] = [];
const listeners = new Set<() => void>();

/**
 * Publish an event. Synchronous, and safe to call from anywhere — including a store action
 * mid-`set`, since subscribers are notified *after* the log has been updated and never see a
 * half-applied state.
 */
export function publish(event: SystemEvent, now: number = Date.now()): LogEntry {
    const d = describe(event);
    const entry: LogEntry = { seq: ++seq, time: now, ...d, event };
    // A new array every time: `getLog()` is a snapshot, and React's `useSyncExternalStore`
    // decides whether to re-render by comparing snapshots by identity.
    log = log.length >= LOG_LIMIT ? [...log.slice(log.length - LOG_LIMIT + 1), entry] : [...log, entry];
    listeners.forEach((fn) => fn());
    return entry;
}

/** The current log, oldest first. The same array is returned until something is published. */
export const getLog = (): readonly LogEntry[] => log;

/** Subscribe to changes. Returns the unsubscribe. */
export function subscribe(fn: () => void): () => void {
    listeners.add(fn);
    return () => {
        listeners.delete(fn);
    };
}

/** Subscribe to one kind of event, receiving the event itself. Returns the unsubscribe. */
export function on<T extends SystemEventType>(
    type: T,
    fn: (event: Extract<SystemEvent, { type: T }>, entry: LogEntry) => void,
): () => void {
    let last = log.length ? log[log.length - 1].seq : 0;
    return subscribe(() => {
        for (const entry of log) {
            if (entry.seq > last && entry.event.type === type) {
                fn(entry.event as Extract<SystemEvent, { type: T }>, entry);
            }
        }
        last = log.length ? log[log.length - 1].seq : last;
    });
}

/**
 * Empty the log. This is the Event Viewer's "Clear all events" — a real operation on real state.
 * Sequence numbers keep counting, so an entry's `seq` is never reused.
 */
export function clearLog(): void {
    log = [];
    listeners.forEach((fn) => fn());
}
