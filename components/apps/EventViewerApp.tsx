"use client";

import { useMemo, useState, useSyncExternalStore } from 'react';
import { clearLog, getLog, subscribe, type EventLevel, type EventLog, type LogEntry } from '@/system/bus';
import { xpConfirm } from '@/utils/dialog';

/**
 * Event Viewer, over the system event bus (`system/bus.ts`).
 *
 * Every row is something that really happened in this session: a window opened, the shell ran a
 * command, a setting changed, a message box was answered. Nothing is seeded to make the log look
 * busy — a fresh session shows the boot and the logon and nothing else, because that is all that
 * has happened. Open a few windows and come back: the log is how the desktop's parts talk.
 */

const LOGS: EventLog[] = ['Application', 'Security', 'System'];

const LEVEL_LABEL: Record<EventLevel, string> = {
    information: 'Information',
    warning: 'Warning',
    error: 'Error',
};

function LevelIcon({ level }: { level: EventLevel }) {
    if (level === 'warning') {
        return (
            <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden className="shrink-0">
                <path d="M8 1 L15.5 14.5 H0.5 Z" fill="#ffd930" stroke="#8a6d00" strokeWidth="0.8" strokeLinejoin="round" />
                <rect x="7.2" y="5.5" width="1.6" height="5" fill="#3a2f00" />
                <circle cx="8" cy="12.4" r="0.9" fill="#3a2f00" />
            </svg>
        );
    }
    if (level === 'error') {
        return (
            <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden className="shrink-0">
                <circle cx="8" cy="8" r="7" fill="#d13438" />
                <path d="M5.3 5.3 L10.7 10.7 M10.7 5.3 L5.3 10.7" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
        );
    }
    return (
        <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden className="shrink-0">
            <circle cx="8" cy="8" r="7" fill="#1c6fd4" />
            <text x="8" y="12" textAnchor="middle" fontSize="10" fontWeight="bold" fill="#fff" fontFamily="Georgia, serif">i</text>
        </svg>
    );
}

const fmtDate = (t: number) => new Date(t).toLocaleDateString();
const fmtTime = (t: number) => new Date(t).toLocaleTimeString();

export default function EventViewerApp() {
    const log = useSyncExternalStore(subscribe, getLog, getLog);
    const [which, setWhich] = useState<EventLog>('Application');
    const [selected, setSelected] = useState<number | null>(null);

    const counts = useMemo(() => {
        const c: Record<EventLog, number> = { Application: 0, Security: 0, System: 0 };
        for (const e of log) c[e.log]++;
        return c;
    }, [log]);

    // Newest first, the way XP listed them.
    const rows = useMemo(() => log.filter((e) => e.log === which).slice().reverse(), [log, which]);
    const detail: LogEntry | undefined = rows.find((r) => r.seq === selected);

    const clear = async () => {
        const ok = await xpConfirm(
            'Event Viewer',
            [
                'Clear all events from every log?',
                'This empties the in-memory log for this session. It is not saved anywhere, so nothing else is affected.',
            ],
            { confirmLabel: 'Clear', cancelLabel: 'Cancel', icon: 'warning' },
        );
        if (ok) {
            clearLog();
            setSelected(null);
        }
    };

    return (
        <div className="flex h-full flex-col bg-[#ece9d8] font-sans text-xs text-black">
            <div className="flex min-h-0 flex-1 flex-col md:flex-row">
                {/* Log tree */}
                <nav aria-label="Logs" className="shrink-0 border-b border-[#aca899] bg-white p-1 md:w-44 md:border-b-0 md:border-r">
                    <p className="px-1 py-0.5 font-bold text-gray-700">Event Viewer (Local)</p>
                    <ul className="flex gap-1 md:block">
                        {LOGS.map((name) => (
                            <li key={name}>
                                <button
                                    onClick={() => { setWhich(name); setSelected(null); }}
                                    aria-current={which === name}
                                    className={`flex w-full items-center justify-between gap-2 px-2 py-0.5 text-left md:pl-4 ${which === name ? 'bg-[#316ac5] text-white' : 'hover:bg-[#e8f0fe]'}`}
                                >
                                    <span>{name}</span>
                                    <span className={which === name ? 'text-blue-100' : 'text-gray-500'}>{counts[name]}</span>
                                </button>
                            </li>
                        ))}
                    </ul>
                </nav>

                {/* Rows */}
                <div className="min-h-0 flex-1 overflow-auto bg-white">
                    <table className="w-full min-w-[520px] border-collapse">
                        <thead className="sticky top-0 bg-[#ece9d8]">
                            <tr className="border-b border-[#aca899] text-left">
                                <th className="px-2 py-1 font-normal">Type</th>
                                <th className="px-2 py-1 font-normal">Date</th>
                                <th className="px-2 py-1 font-normal">Time</th>
                                <th className="px-2 py-1 font-normal">Source</th>
                                <th className="px-2 py-1 font-normal">Category</th>
                                <th className="px-2 py-1 font-normal">Event</th>
                            </tr>
                        </thead>
                        <tbody>
                            {rows.length === 0 && (
                                <tr>
                                    <td colSpan={6} className="px-2 py-4 text-gray-500">
                                        There are no items to show in this view.
                                    </td>
                                </tr>
                            )}
                            {rows.map((e) => (
                                <tr
                                    key={e.seq}
                                    onClick={() => setSelected(e.seq)}
                                    className={`cursor-default ${selected === e.seq ? 'bg-[#316ac5] text-white' : 'hover:bg-[#e8f0fe]'}`}
                                >
                                    <td className="px-2 py-0.5">
                                        <span className="flex items-center gap-1.5"><LevelIcon level={e.level} />{LEVEL_LABEL[e.level]}</span>
                                    </td>
                                    <td className="whitespace-nowrap px-2 py-0.5">{fmtDate(e.time)}</td>
                                    <td className="whitespace-nowrap px-2 py-0.5">{fmtTime(e.time)}</td>
                                    <td className="px-2 py-0.5">{e.source}</td>
                                    <td className="px-2 py-0.5">{e.category}</td>
                                    <td className="px-2 py-0.5">{e.code}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Event properties */}
            <div className="shrink-0 border-t border-[#aca899] p-2">
                {detail ? (
                    <div className="space-y-1">
                        <p className="font-bold">Event Properties</p>
                        <p className="leading-relaxed">{detail.message}</p>
                        <p className="text-gray-600">
                            {LEVEL_LABEL[detail.level]} · {detail.source} · {detail.category} · event {detail.code} · #{detail.seq}
                        </p>
                    </div>
                ) : (
                    <p className="text-gray-600">
                        Select an event to see what happened. Everything here was recorded by this session — open a
                        window, run a command or change a setting, and it appears.
                    </p>
                )}
                <div className="mt-2 flex items-center justify-between gap-2">
                    <span className="text-gray-600">{rows.length} event(s)</span>
                    <button
                        onClick={() => void clear()}
                        disabled={log.length === 0}
                        className="min-w-[110px] rounded-[3px] border border-[#7a7a6d] bg-gradient-to-b from-white via-[#f2f1ea] to-[#dedbc8] px-3 py-1 hover:border-[#3c7fb1] disabled:text-gray-400 disabled:hover:border-[#7a7a6d]"
                    >
                        Clear all events
                    </button>
                </div>
            </div>
        </div>
    );
}
