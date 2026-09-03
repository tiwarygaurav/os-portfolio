"use client";

import { useEffect, useState } from 'react';
import { useSystemStore } from '@/store/useSystemStore';
import { APPS } from '@/constants/apps';
import { xpConfirm } from '@/utils/dialog';

/**
 * Windows Task Manager.
 *
 * The most literal possible demonstration that this desktop is a system rather than a set of
 * pages: every row is a real window in the window manager, End Task really closes it, and the
 * same rows are what `ps` prints and what `/proc` contains in the shell.
 *
 * **Nothing here is invented.** Where the browser does not expose a number, this says so instead
 * of drawing a plausible bar. That rule is the whole point of the app: the previous version of
 * this portfolio had a network panel reporting a fixed "867 Mbps".
 */

type Tab = 'Applications' | 'Processes' | 'Performance';

const TABS: Tab[] = ['Applications', 'Processes', 'Performance'];

/** `performance.memory` is a non-standard Chromium extra. Absent elsewhere, and we say so. */
interface MemoryInfo {
    usedJSHeapSize: number;
    totalJSHeapSize: number;
    jsHeapSizeLimit: number;
}

const mb = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;

export default function TaskManagerApp({ windowId }: { windowId?: string }) {
    const windows = useSystemStore((s) => s.windows);
    const activeWindowId = useSystemStore((s) => s.activeWindowId);
    const actions = useSystemStore((s) => s.actions);

    const [tab, setTab] = useState<Tab>('Applications');
    const [selected, setSelected] = useState<string | null>(null);
    const [memory, setMemory] = useState<MemoryInfo | null>(null);
    const [uptime, setUptime] = useState(0);

    // Sample the real heap where the browser exposes it. One second, matching XP's default.
    useEffect(() => {
        const read = () => {
            const perf = performance as Performance & { memory?: MemoryInfo };
            setMemory(perf.memory ? { ...perf.memory } : null);
            setUptime(Math.floor(performance.now() / 1000));
        };
        read();
        const timer = setInterval(read, 1000);
        return () => clearInterval(timer);
    }, []);

    const endTask = async (id: string) => {
        const target = windows.find((w) => w.id === id);
        if (!target) return;
        const ok = await xpConfirm(
            'Windows Task Manager',
            [
                `End "${target.title}"?`,
                'If the application has unsaved work, it will be lost. This is the same action as `kill` in the Command Prompt.',
            ],
            { confirmLabel: 'End Task', cancelLabel: 'Cancel', icon: 'warning' },
        );
        if (ok) actions.closeWindow(id);
    };

    const selectedIsSelf = selected === windowId;

    return (
        <div className="flex h-full flex-col bg-[#ece9d8] font-sans text-black">
            {/* Tab strip */}
            <div className="flex gap-0.5 border-b border-[#aca899] px-2 pt-2">
                {TABS.map((name) => (
                    <button
                        key={name}
                        onClick={() => setTab(name)}
                        className={`rounded-t-[3px] border border-b-0 px-3 py-1 text-xs ${
                            tab === name
                                ? 'border-[#aca899] bg-[#ece9d8] font-bold'
                                : 'border-[#c4c0b4] bg-[#dcd8c8] text-gray-700 hover:bg-[#e6e2d3]'
                        }`}
                    >
                        {name}
                    </button>
                ))}
            </div>

            <div className="flex-1 overflow-auto p-2">
                {tab === 'Applications' && (
                    <div className="flex h-full flex-col">
                        <div className="flex-1 overflow-auto border border-[#7f9db9] bg-white">
                            <table className="w-full text-xs">
                                <thead className="sticky top-0 bg-[#ece9d8]">
                                    <tr className="border-b border-[#aca899] text-left">
                                        <th className="px-2 py-1 font-normal">Task</th>
                                        <th className="w-24 px-2 py-1 font-normal">Status</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {windows.length === 0 && (
                                        <tr>
                                            <td colSpan={2} className="px-2 py-3 text-gray-500">
                                                No tasks are running.
                                            </td>
                                        </tr>
                                    )}
                                    {windows.map((w) => {
                                        const app = APPS[w.appId];
                                        return (
                                            <tr
                                                key={w.id}
                                                onClick={() => setSelected(w.id)}
                                                onDoubleClick={() => {
                                                    actions.restoreWindow(w.id);
                                                    actions.focusWindow(w.id);
                                                }}
                                                className={`cursor-default ${selected === w.id ? 'bg-[#316ac5] text-white' : 'hover:bg-[#e8f0fe]'}`}
                                            >
                                                <td className="flex items-center gap-2 px-2 py-1">
                                                    {app?.iconAsset && (
                                                        // eslint-disable-next-line @next/next/no-img-element
                                                        <img src={app.iconAsset} alt="" className="h-4 w-4 object-contain" />
                                                    )}
                                                    {w.title}
                                                </td>
                                                <td className="px-2 py-1">
                                                    {w.isMinimized ? 'Minimized' : activeWindowId === w.id ? 'Running (active)' : 'Running'}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>

                        <div className="mt-2 flex justify-end gap-2">
                            <XPButton
                                disabled={!selected || !windows.some((w) => w.id === selected)}
                                onClick={() => selected && void endTask(selected)}
                            >
                                End Task
                            </XPButton>
                            <XPButton
                                disabled={!selected || !windows.some((w) => w.id === selected)}
                                onClick={() => {
                                    if (!selected) return;
                                    actions.restoreWindow(selected);
                                    actions.focusWindow(selected);
                                }}
                            >
                                Switch To
                            </XPButton>
                        </div>
                        {selectedIsSelf && (
                            <p className="mt-1 text-right text-[10px] text-gray-600">
                                That is this window. Ending it closes the Task Manager.
                            </p>
                        )}
                    </div>
                )}

                {tab === 'Processes' && (
                    <div className="h-full overflow-auto border border-[#7f9db9] bg-white">
                        <table className="w-full text-xs">
                            <thead className="sticky top-0 bg-[#ece9d8]">
                                <tr className="border-b border-[#aca899] text-left">
                                    <th className="px-2 py-1 font-normal">PID</th>
                                    <th className="px-2 py-1 font-normal">Image Name</th>
                                    <th className="px-2 py-1 font-normal">State</th>
                                    <th className="px-2 py-1 font-normal">Z</th>
                                </tr>
                            </thead>
                            <tbody className="font-mono">
                                {windows.map((w) => (
                                    <tr key={w.id} className="hover:bg-[#e8f0fe]">
                                        <td className="px-2 py-0.5">{w.id}</td>
                                        <td className="px-2 py-0.5">{w.appId}</td>
                                        <td className="px-2 py-0.5">
                                            {w.isMinimized ? 'minimized' : w.isMaximized ? 'maximized' : 'running'}
                                        </td>
                                        <td className="px-2 py-0.5">{w.zIndex}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        <p className="border-t border-[#dcd8c8] p-2 font-sans text-[10px] leading-relaxed text-gray-600">
                            These are the same rows the Command Prompt prints for <span className="font-mono">ps</span>, and
                            the same entries you can read at <span className="font-mono">/proc/&lt;pid&gt;/status</span>.
                            The pid is short so you can type it into <span className="font-mono">kill</span>.
                        </p>
                    </div>
                )}

                {tab === 'Performance' && (
                    <div className="space-y-3 text-xs">
                        <Panel title="Processes">
                            <Row label="Open windows" value={String(windows.length)} />
                            <Row label="Session uptime" value={`${Math.floor(uptime / 60)}m ${uptime % 60}s`} />
                        </Panel>

                        <Panel title="JavaScript heap">
                            {memory ? (
                                <>
                                    <Row label="Used" value={mb(memory.usedJSHeapSize)} />
                                    <Row label="Allocated" value={mb(memory.totalJSHeapSize)} />
                                    <Row label="Limit" value={mb(memory.jsHeapSizeLimit)} />
                                    <div className="mt-2 h-4 w-full border border-[#7f9db9] bg-black/80 p-[1px]">
                                        <div
                                            className="h-full bg-[#00d000]"
                                            style={{
                                                width: `${Math.min(100, (memory.usedJSHeapSize / memory.jsHeapSizeLimit) * 100).toFixed(2)}%`,
                                            }}
                                        />
                                    </div>
                                </>
                            ) : (
                                <p className="leading-relaxed text-gray-600">
                                    Your browser does not expose heap statistics to pages, so none are shown.
                                    Chromium exposes <span className="font-mono">performance.memory</span>; Firefox and
                                    Safari do not. Nothing is drawn here in their place.
                                </p>
                            )}
                        </Panel>

                        <p className="leading-relaxed text-gray-600">
                            There is no CPU graph because a web page cannot measure CPU. A graph here would be a
                            drawing, not a reading.
                        </p>
                    </div>
                )}
            </div>

            {/* XP status bar */}
            <div className="flex justify-between border-t border-[#aca899] bg-[#ece9d8] px-2 py-0.5 text-[10px] text-gray-700">
                <span>Processes: {windows.length}</span>
                <span>{memory ? `Mem Usage: ${mb(memory.usedJSHeapSize)}` : 'Mem Usage: unavailable'}</span>
            </div>
        </div>
    );
}

function XPButton({ children, onClick, disabled }: { children: React.ReactNode; onClick: () => void; disabled?: boolean }) {
    return (
        <button
            onClick={onClick}
            disabled={disabled}
            className="min-w-[80px] rounded-[3px] border border-[#7a7a6d] bg-gradient-to-b from-white via-[#f2f1ea] to-[#dedbc8] px-3 py-1 text-xs shadow-sm hover:border-[#3c7fb1] active:translate-y-px disabled:cursor-default disabled:text-gray-400 disabled:hover:border-[#7a7a6d]"
        >
            {children}
        </button>
    );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <fieldset className="border border-[#aca899] px-3 pb-2">
            <legend className="px-1 text-[11px] font-bold">{title}</legend>
            {children}
        </fieldset>
    );
}

function Row({ label, value }: { label: string; value: string }) {
    return (
        <div className="flex justify-between border-b border-dotted border-[#d6d2c4] py-0.5 last:border-b-0">
            <span>{label}</span>
            <span className="font-mono">{value}</span>
        </div>
    );
}
