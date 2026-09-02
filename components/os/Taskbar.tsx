"use client";

import { useSystemStore } from '@/store/useSystemStore';
import { APPS } from '@/constants/apps';
import { useState, useEffect, useRef, useCallback } from 'react';
import { Monitor, Volume2, VolumeX, Volume1, Wifi } from 'lucide-react';
import StartMenu from './StartMenu';
import ContextMenu from '@/components/ui/ContextMenu';
import { playSound } from '@/utils/sound';

interface TaskbarProps {
    /** Opens the Run dialog, which the desktop owns. */
    onOpenRun: () => void;
}

export default function Taskbar({ onOpenRun }: TaskbarProps) {
    const windows = useSystemStore((s) => s.windows);
    const activeWindowId = useSystemStore((s) => s.activeWindowId);
    const actions = useSystemStore((s) => s.actions);
    const volume = useSystemStore((s) => s.volume);
    const isMuted = useSystemStore((s) => s.isMuted);
    const [startOpen, setStartOpen] = useState(false);
    const [time, setTime] = useState(new Date());
    const [trayOpen, setTrayOpen] = useState<'volume' | 'wifi' | 'clock' | null>(null);
    const trayRef = useRef<HTMLDivElement>(null);
    // XP put Task Manager, Tile Windows and Show the Desktop on the taskbar's own context menu.
    const [barMenu, setBarMenu] = useState({ isOpen: false, x: 0, y: 0 });
    // Handed to StartMenu so its outside-click handler leaves the Start button to `toggleStart`.
    const startButtonRef = useRef<HTMLButtonElement>(null);

    useEffect(() => {
        const timer = setInterval(() => setTime(new Date()), 1000);
        return () => clearInterval(timer);
    }, []);

    useEffect(() => {
        const onClick = (e: MouseEvent) => {
            if (trayRef.current && !trayRef.current.contains(e.target as Node)) {
                setTrayOpen(null);
            }
        };
        if (trayOpen) document.addEventListener('mousedown', onClick);
        return () => document.removeEventListener('mousedown', onClick);
    }, [trayOpen]);

    const toggleStart = () => {
        playSound('click');
        setStartOpen((open) => !open);
        setTrayOpen(null);
    };

    // Stable identity: the clock re-renders this component every second, and StartMenu
    // re-subscribes its document listeners whenever `onClose` changes.
    const closeStart = useCallback(() => setStartOpen(false), []);

    const VolumeIcon = isMuted || volume === 0 ? VolumeX : volume < 0.5 ? Volume1 : Volume2;

    // Quick launch apps
    const quickLaunch = ['mycomputer', 'about', 'projects'].filter(a => APPS[a]);

    return (
        <>
            {startOpen && <StartMenu onClose={closeStart} triggerRef={startButtonRef} onOpenRun={onOpenRun} />}

            <ContextMenu
                x={barMenu.x}
                y={barMenu.y}
                isOpen={barMenu.isOpen}
                onClose={() => setBarMenu({ ...barMenu, isOpen: false })}
                items={[
                    {
                        label: 'Cascade Windows',
                        disabled: windows.length === 0,
                        action: () => actions.cascadeWindows(),
                    },
                    {
                        label: 'Show the Desktop',
                        disabled: windows.length === 0,
                        action: () => actions.minimizeAll(),
                    },
                    { divider: true },
                    { label: 'Task Manager', action: () => actions.openWindow('taskmgr') },
                ]}
            />

            <div
                onContextMenu={(e) => {
                    e.preventDefault();
                    setBarMenu({ isOpen: true, x: e.clientX, y: e.clientY });
                }}
                className="fixed bottom-0 left-0 right-0 h-9 flex items-center justify-between shadow-lg z-50 text-white select-none"
                style={{
                    background: 'linear-gradient(to bottom, #245edb 0%, #3c83f6 8%, #245edb 25%, #1941a5 100%)',
                    borderTop: '1px solid #4a89ff'
                }}
            >
                {/* Start Button */}
                <button
                    ref={startButtonRef}
                    onClick={toggleStart}
                    aria-expanded={startOpen}
                    className="flex items-center gap-2 px-3 h-full font-bold italic tracking-wide relative"
                    style={{
                        background: startOpen
                            ? 'linear-gradient(to bottom, #1f7e1a 0%, #2f9a26 50%, #1f7e1a 100%)'
                            : 'linear-gradient(to bottom, #3aa635 0%, #5cbf52 50%, #3aa635 100%)',
                        borderRight: '1px solid rgba(0,0,0,0.4)',
                        boxShadow: startOpen
                            ? 'inset 2px 2px 4px rgba(0,0,0,0.4)'
                            : 'inset 0 1px 0 rgba(255,255,255,0.4)',
                        borderTopRightRadius: 16,
                        borderBottomRightRadius: 16,
                        minWidth: 95,
                    }}
                >
                    <div className="w-5 h-5 bg-white rounded-full flex items-center justify-center shadow-sm border border-green-700">
                        <div className="grid grid-cols-2 gap-[1px]">
                            <div className="w-1.5 h-1.5 bg-red-500" />
                            <div className="w-1.5 h-1.5 bg-green-500" />
                            <div className="w-1.5 h-1.5 bg-blue-500" />
                            <div className="w-1.5 h-1.5 bg-yellow-500" />
                        </div>
                    </div>
                    <span className="text-white drop-shadow-md italic text-base pr-1">start</span>
                </button>

                {/* Quick Launch */}
                <div className="flex items-center gap-1 px-2 h-full border-r border-black/20">
                    {quickLaunch.map(appId => {
                        const app = APPS[appId];
                        return (
                            <button
                                key={appId}
                                onClick={() => { playSound('click'); actions.openWindow(appId, app.title); }}
                                className="w-6 h-6 flex items-center justify-center hover:bg-white/20 rounded"
                                title={app.title}
                            >
                                {app.iconAsset ? (
                                    <img src={app.iconAsset} alt={app.title} className="w-4 h-4 object-contain" />
                                ) : (
                                    <app.icon size={14} />
                                )}
                            </button>
                        );
                    })}
                </div>

                {/* Running Apps */}
                <div className="flex-1 flex items-center gap-1 overflow-x-auto no-scrollbar px-1">
                    {windows.map((win) => {
                        const app = APPS[win.appId];
                        const isActive = activeWindowId === win.id && !win.isMinimized;
                        const Icon = app?.icon || Monitor;

                        return (
                            <button
                                key={win.id}
                                onClick={() => {
                                    playSound('click');
                                    if (isActive) actions.minimizeWindow(win.id);
                                    else {
                                        actions.restoreWindow(win.id);
                                        actions.focusWindow(win.id);
                                    }
                                }}
                                className="flex items-center gap-2 px-2 py-1 min-w-[140px] max-w-[180px] h-7 text-xs truncate transition-all rounded-sm"
                                style={{
                                    background: isActive
                                        ? 'linear-gradient(to bottom, #1746a3, #2059ce 50%, #1746a3)'
                                        : 'linear-gradient(to bottom, #4083f5, #2f70e8 50%, #1c5fda)',
                                    boxShadow: isActive
                                        ? 'inset 1px 1px 3px rgba(0,0,0,0.5)'
                                        : 'inset 0 1px 0 rgba(255,255,255,0.3), 0 0 0 1px rgba(0,0,0,0.15)',
                                    fontStyle: isActive ? 'italic' : 'normal',
                                }}
                            >
                                {app?.iconAsset ? (
                                    <img src={app.iconAsset} alt={win.title} className="w-4 h-4 shrink-0 object-contain" />
                                ) : (
                                    <Icon size={14} className="shrink-0" />
                                )}
                                <span className="truncate text-white">{win.title}</span>
                            </button>
                        );
                    })}
                </div>

                {/* System Tray */}
                <div
                    ref={trayRef}
                    className="flex items-center gap-2 px-3 h-full relative"
                    style={{
                        background: 'linear-gradient(to bottom, #1750c4 0%, #15428b 100%)',
                        borderLeft: '1px solid rgba(255,255,255,0.2)',
                    }}
                >
                    <button
                        onClick={() => setTrayOpen(trayOpen === 'volume' ? null : 'volume')}
                        className="hover:text-blue-200"
                        title="Volume"
                    >
                        <VolumeIcon size={14} />
                    </button>
                    <button
                        onClick={() => setTrayOpen(trayOpen === 'wifi' ? null : 'wifi')}
                        className="hover:text-blue-200"
                        title="Network"
                    >
                        <Wifi size={14} />
                    </button>
                    <button
                        onClick={() => setTrayOpen(trayOpen === 'clock' ? null : 'clock')}
                        className="text-xs font-medium ml-1 hover:text-blue-200"
                        title={time.toLocaleDateString()}
                    >
                        {time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </button>

                    {/* Volume popover */}
                    {trayOpen === 'volume' && (
                        <div className="absolute bottom-10 right-2 bg-[#ece9d8] border border-gray-500 shadow-xl p-3 w-44 text-black" style={{ boxShadow: '0 0 0 1px #fff inset, 2px 2px 8px rgba(0,0,0,0.3)' }}>
                            <div className="text-xs font-bold mb-2">Volume</div>
                            <input
                                type="range"
                                min={0}
                                max={100}
                                value={Math.round((isMuted ? 0 : volume) * 100)}
                                onChange={(e) => actions.setVolume(parseInt(e.target.value) / 100)}
                                className="w-full accent-blue-700"
                            />
                            <label className="flex items-center gap-1 text-xs mt-2">
                                <input
                                    type="checkbox"
                                    checked={isMuted}
                                    onChange={() => actions.toggleMute()}
                                />
                                Mute
                            </label>
                        </div>
                    )}

                    {/* Network popover — real values from the browser, not invented ones. */}
                    {trayOpen === 'wifi' && <NetworkPopover />}

                    {/* Clock popover */}
                    {trayOpen === 'clock' && <CalendarPopover date={time} />}
                </div>
            </div>
        </>
    );
}

/**
 * Network status, read from the browser rather than invented.
 *
 * The previous version displayed a fixed "SSID: Gaurav-Home · 867 Mbps · Excellent" — a fake
 * readout in a panel that claims to report system state. Everything below is either real or
 * explicitly marked unavailable.
 */
function NetworkPopover() {
    const [online, setOnline] = useState(true);
    const [info, setInfo] = useState<{ type?: string; downlink?: number; rtt?: number } | null>(null);

    useEffect(() => {
        const sync = () => setOnline(navigator.onLine);
        sync();
        window.addEventListener('online', sync);
        window.addEventListener('offline', sync);

        // Network Information API — Chromium only; absent elsewhere, and we say so.
        const conn = (navigator as Navigator & {
            connection?: { effectiveType?: string; downlink?: number; rtt?: number; addEventListener?: (t: string, f: () => void) => void; removeEventListener?: (t: string, f: () => void) => void };
        }).connection;

        const readConn = () =>
            setInfo(conn ? { type: conn.effectiveType, downlink: conn.downlink, rtt: conn.rtt } : null);
        readConn();
        conn?.addEventListener?.('change', readConn);

        return () => {
            window.removeEventListener('online', sync);
            window.removeEventListener('offline', sync);
            conn?.removeEventListener?.('change', readConn);
        };
    }, []);

    return (
        <div
            className="absolute bottom-10 right-2 w-60 border border-gray-500 bg-[#ece9d8] p-3 text-xs text-black shadow-xl"
            style={{ boxShadow: '0 0 0 1px #fff inset, 2px 2px 8px rgba(0,0,0,0.3)' }}
        >
            <div className="mb-2 border-b border-gray-300 pb-1 font-bold">Network Connection</div>
            <Row label="Status">
                <span className={online ? 'font-medium text-green-700' : 'font-medium text-red-700'}>
                    {online ? 'Online' : 'Offline'}
                </span>
            </Row>
            {info ? (
                <>
                    <Row label="Effective type">{info.type ?? 'unknown'}</Row>
                    <Row label="Downlink">{info.downlink != null ? `${info.downlink} Mb/s` : 'unknown'}</Row>
                    <Row label="Round trip">{info.rtt != null ? `${info.rtt} ms` : 'unknown'}</Row>
                </>
            ) : (
                <p className="mt-2 leading-relaxed text-gray-600">
                    Your browser does not expose connection details, so none are shown.
                </p>
            )}
        </div>
    );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div className="flex justify-between">
            <span>{label}:</span>
            <span>{children}</span>
        </div>
    );
}

function CalendarPopover({ date }: { date: Date }) {
    const year = date.getFullYear();
    const month = date.getMonth();
    const today = date.getDate();
    const monthName = date.toLocaleString('default', { month: 'long' });

    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    const cells: (number | null)[] = Array(firstDay).fill(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push(d);
    while (cells.length % 7 !== 0) cells.push(null);

    return (
        <div className="absolute bottom-10 right-2 bg-[#ece9d8] border border-gray-500 shadow-xl p-3 w-64 text-black text-xs" style={{ boxShadow: '0 0 0 1px #fff inset, 2px 2px 8px rgba(0,0,0,0.3)' }}>
            <div className="text-center font-bold mb-2">{monthName} {year}</div>
            <div className="grid grid-cols-7 gap-px text-center">
                {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map(d => (
                    <div key={d} className="font-bold text-blue-700">{d}</div>
                ))}
                {cells.map((c, i) => (
                    <div
                        key={i}
                        className={`p-1 ${c === today ? 'bg-blue-700 text-white rounded' : c === null ? 'text-gray-300' : 'hover:bg-blue-100 rounded'}`}
                    >
                        {c ?? ''}
                    </div>
                ))}
            </div>
            <div className="text-center mt-2 font-mono text-sm">
                {date.toLocaleTimeString()}
            </div>
        </div>
    );
}
