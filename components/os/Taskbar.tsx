"use client";

import { useSystemStore } from '@/store/useSystemStore';
import { APPS } from '@/constants/apps';
import { useState, useEffect, useRef, useCallback } from 'react';
import StartMenu from './StartMenu';
import ContextMenu, { type MenuItem } from '@/components/ui/ContextMenu';
import XpIcon from '@/components/ui/XpIcon';
import { shortcutName } from '@/utils/shortcut';
import { playCaptionZoom, taskButtonBox, titleBarBox } from './captionZoom';

interface TaskbarProps {
    /** Opens the Run dialog, which the desktop owns. */
    onOpenRun: () => void;
    /** Opens the Log Off / Turn Off Computer dialogs, which the desktop owns. */
    onExit: (kind: 'logoff' | 'shutdown') => void;
}

/** Quick Launch programs after Show Desktop. XP shipped Internet Explorer and Media Player here. */
const QUICK_LAUNCH = ['mycomputer', 'about', 'projects'];

/**
 * The Luna taskbar: the green Start button, Quick Launch, one button per window, and the
 * notification area.
 *
 * XP's default sound scheme was silent for all of this — the Start menu, task buttons and Quick
 * Launch made no noise — so nothing here plays a sound.
 */
export default function Taskbar({ onOpenRun, onExit }: TaskbarProps) {
    const windows = useSystemStore((s) => s.windows);
    const activeWindowId = useSystemStore((s) => s.activeWindowId);
    const actions = useSystemStore((s) => s.actions);
    const volume = useSystemStore((s) => s.volume);
    const isMuted = useSystemStore((s) => s.isMuted);
    const [startOpen, setStartOpen] = useState(false);
    const [time, setTime] = useState(new Date());
    const [trayOpen, setTrayOpen] = useState<'volume' | 'wifi' | 'clock' | null>(null);
    const trayRef = useRef<HTMLDivElement>(null);
    // XP put Cascade, Show the Desktop and Task Manager on the taskbar's own context menu.
    const [barMenu, setBarMenu] = useState({ isOpen: false, x: 0, y: 0 });
    // A task button's right-click menu is the window's own system menu.
    const [taskMenu, setTaskMenu] = useState<{ id: string; x: number; y: number } | null>(null);
    // Handed to StartMenu so its outside-click handler leaves the Start button to `toggleStart`.
    const startButtonRef = useRef<HTMLButtonElement>(null);
    // Windows that Show Desktop minimised, so a second click can bring exactly those back.
    const [desktopShown, setDesktopShown] = useState<string[] | null>(null);

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

    // Opening or focusing any window after Show Desktop ends the toggle, as it did in XP.
    useEffect(() => {
        if (desktopShown && windows.some((w) => !w.isMinimized)) setDesktopShown(null);
    }, [windows, desktopShown]);

    const toggleStart = () => {
        setStartOpen((open) => !open);
        setTrayOpen(null);
    };

    // Stable identity: the clock re-renders this component every second, and StartMenu
    // re-subscribes its document listeners whenever `onClose` changes.
    const closeStart = useCallback(() => setStartOpen(false), []);

    const showDesktop = () => {
        if (desktopShown) {
            for (const id of desktopShown) actions.restoreWindow(id);
            const top = desktopShown[desktopShown.length - 1];
            if (top) actions.focusWindow(top);
            setDesktopShown(null);
            return;
        }
        const visible = [...windows].filter((w) => !w.isMinimized).sort((a, b) => a.zIndex - b.zIndex);
        if (visible.length === 0) return;
        actions.minimizeAll();
        setDesktopShown(visible.map((w) => w.id));
    };

    const onTaskClick = (id: string) => {
        const w = windows.find((x) => x.id === id);
        if (!w) return;
        const isActive = activeWindowId === id && !w.isMinimized;
        const caption = titleBarBox({ x: w.position.x, y: w.position.y, width: w.size.width, maximized: w.isMaximized });
        if (isActive) {
            void playCaptionZoom(caption, taskButtonBox(id), w.title, 'in');
            actions.minimizeWindow(id);
        } else {
            if (w.isMinimized) void playCaptionZoom(taskButtonBox(id), caption, w.title);
            actions.restoreWindow(id);
            actions.focusWindow(id);
        }
    };

    const taskMenuItems = (id: string): MenuItem[] => {
        const w = windows.find((x) => x.id === id);
        if (!w) return [];
        const canMax = !!APPS[w.appId]?.canMaximize;
        return [
            {
                label: 'Restore',
                icon: <i className="xp-sysglyph is-restore" />,
                disabled: !w.isMinimized && !w.isMaximized,
                action: () => {
                    if (w.isMinimized) actions.restoreWindow(id);
                    else actions.unmaximizeWindow(id);
                    actions.focusWindow(id);
                },
            },
            {
                label: 'Minimize',
                icon: <i className="xp-sysglyph is-min" />,
                disabled: w.isMinimized,
                action: () => actions.minimizeWindow(id),
            },
            {
                label: 'Maximize',
                icon: <i className="xp-sysglyph is-max" />,
                disabled: !canMax || (w.isMaximized && !w.isMinimized),
                action: () => {
                    actions.restoreWindow(id);
                    actions.maximizeWindow(id);
                    actions.focusWindow(id);
                },
            },
            { divider: true },
            { label: 'Close', icon: <i className="xp-sysglyph is-close" />, bold: true, accel: 'Alt+F4', action: () => actions.closeWindow(id) },
        ];
    };

    const volumeIcon = isMuted || volume === 0 ? '/icons/xp/tray-volume-muted.svg' : '/icons/xp/tray-volume.svg';
    const clock = time.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    const longDate = time.toLocaleDateString([], { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

    return (
        <>
            {startOpen && (
                <StartMenu
                    onClose={closeStart}
                    triggerRef={startButtonRef}
                    onOpenRun={onOpenRun}
                    onExit={onExit}
                />
            )}

            <ContextMenu
                x={barMenu.x}
                y={barMenu.y}
                isOpen={barMenu.isOpen}
                onClose={() => setBarMenu((m) => ({ ...m, isOpen: false }))}
                items={[
                    {
                        label: 'Cascade Windows',
                        disabled: windows.length === 0,
                        action: () => actions.cascadeWindows(),
                    },
                    {
                        label: desktopShown ? 'Show Open Windows' : 'Show the Desktop',
                        disabled: windows.length === 0,
                        action: showDesktop,
                    },
                    { divider: true },
                    { label: 'Task Manager', action: () => actions.openWindow('taskmgr') },
                ]}
            />

            <ContextMenu
                x={taskMenu?.x ?? 0}
                y={taskMenu?.y ?? 0}
                isOpen={taskMenu !== null}
                onClose={() => setTaskMenu(null)}
                items={taskMenu ? taskMenuItems(taskMenu.id) : []}
            />

            <div
                onContextMenu={(e) => {
                    e.preventDefault();
                    setBarMenu({ isOpen: true, x: e.clientX, y: e.clientY });
                }}
                className="xp-taskbar luna-taskbar"
                data-taskbar=""
                role="toolbar"
                aria-label="Taskbar"
            >
                <button
                    ref={startButtonRef}
                    type="button"
                    onClick={toggleStart}
                    aria-expanded={startOpen}
                    className="xp-start-button"
                    data-tip="Click here to begin."
                >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src="/icons/windows.png" alt="" className="xp-start-flag" draggable={false} />
                    <span>start</span>
                </button>

                <div className="xp-quicklaunch" aria-label="Quick Launch">
                    <button
                        type="button"
                        className="xp-quicklaunch-btn"
                        onClick={showDesktop}
                        aria-label="Show Desktop"
                        data-tip="Show Desktop"
                    >
                        <XpIcon src="/icons/xp/show-desktop.svg" size={16} />
                    </button>
                    {QUICK_LAUNCH.filter((a) => APPS[a]).map((appId) => {
                        const app = APPS[appId];
                        return (
                            <button
                                key={appId}
                                type="button"
                                onClick={() => actions.openWindow(appId, app.title)}
                                className="xp-quicklaunch-btn"
                                aria-label={shortcutName(app.title)}
                                data-tip={shortcutName(app.title)}
                            >
                                {app.iconAsset ? <XpIcon src={app.iconAsset} size={16} /> : <app.icon size={14} />}
                            </button>
                        );
                    })}
                </div>
                <div className="xp-taskbar-sep" aria-hidden />

                <div className="xp-tasks no-scrollbar">
                    {windows.map((win) => {
                        const app = APPS[win.appId];
                        const isActive = activeWindowId === win.id && !win.isMinimized;
                        return (
                            <button
                                key={win.id}
                                type="button"
                                data-task-btn={win.id}
                                onClick={() => onTaskClick(win.id)}
                                onContextMenu={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    setTaskMenu({ id: win.id, x: e.clientX, y: e.clientY });
                                }}
                                className={`xp-task-btn${isActive ? ' is-active' : ''}`}
                                aria-pressed={isActive}
                                data-tip={win.title}
                            >
                                {app?.iconAsset ? <XpIcon src={app.iconAsset} size={16} /> : app && <app.icon size={14} className="shrink-0" />}
                                <span>{win.title}</span>
                            </button>
                        );
                    })}
                </div>

                <div ref={trayRef} className="xp-tray luna-tray relative" aria-label="Notification area">
                    <button
                        type="button"
                        className="xp-tray-btn"
                        onClick={() => setTrayOpen(trayOpen === 'volume' ? null : 'volume')}
                        aria-label="Volume"
                        data-tip={isMuted ? 'Volume (muted)' : 'Volume'}
                    >
                        <XpIcon src={volumeIcon} size={16} />
                    </button>
                    <button
                        type="button"
                        className="xp-tray-btn"
                        onClick={() => setTrayOpen(trayOpen === 'wifi' ? null : 'wifi')}
                        aria-label="Network"
                        data-tip="Network connection"
                    >
                        <XpIcon src="/icons/xp/tray-network.svg" size={16} />
                    </button>
                    <button
                        type="button"
                        className="xp-clock"
                        onClick={() => setTrayOpen(trayOpen === 'clock' ? null : 'clock')}
                        aria-label={`${clock}, ${longDate}`}
                        data-tip={longDate}
                    >
                        {clock}
                    </button>

                    {trayOpen === 'volume' && (
                        <TrayPanel title="Volume" className="w-[92px]">
                            <div className="flex flex-col items-center gap-2 px-2 pb-2 pt-1">
                                <input
                                    type="range"
                                    min={0}
                                    max={100}
                                    value={Math.round((isMuted ? 0 : volume) * 100)}
                                    onChange={(e) => actions.setVolume(parseInt(e.target.value) / 100)}
                                    className="xp-vslider"
                                    aria-label="Volume"
                                />
                                <label className="flex items-center gap-1.5">
                                    <input
                                        type="checkbox"
                                        className="xp-checkbox"
                                        checked={isMuted}
                                        onChange={() => actions.toggleMute()}
                                    />
                                    Mute
                                </label>
                            </div>
                        </TrayPanel>
                    )}

                    {/* Network status — real values from the browser, not invented ones. */}
                    {trayOpen === 'wifi' && <NetworkPopover />}

                    {trayOpen === 'clock' && <CalendarPopover date={time} />}
                </div>
            </div>
        </>
    );
}

/** A notification-area popup: the beige XP face in a thin dark frame, anchored above the tray. */
function TrayPanel({ title, className = '', children }: { title?: string; className?: string; children: React.ReactNode }) {
    return (
        <div
            className={`xp-face absolute bottom-[calc(100%+4px)] right-1 border border-[#7f7c6d] ${className}`}
            style={{ boxShadow: 'inset 1px 1px #fff, 2px 2px 3px rgba(0,0,0,0.35)' }}
        >
            {title && <div className="px-2 pt-1.5 text-center">{title}</div>}
            {children}
        </div>
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
        <TrayPanel className="w-60 p-2">
            <fieldset className="xp-groupbox">
                <legend>Network Connection</legend>
                <Row label="Status">
                    <span className={online ? 'text-green-700' : 'text-red-700'}>{online ? 'Connected' : 'Disconnected'}</span>
                </Row>
                {info ? (
                    <>
                        <Row label="Effective type">{info.type ?? 'unknown'}</Row>
                        <Row label="Speed">{info.downlink != null ? `${info.downlink} Mbps` : 'unknown'}</Row>
                        <Row label="Round trip">{info.rtt != null ? `${info.rtt} ms` : 'unknown'}</Row>
                    </>
                ) : (
                    <p className="mt-1 leading-relaxed text-[#444]">
                        Your browser does not expose connection details, so none are shown.
                    </p>
                )}
            </fieldset>
        </TrayPanel>
    );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div className="flex justify-between gap-2 py-px">
            <span>{label}:</span>
            <span>{children}</span>
        </div>
    );
}

/** The month, laid out like the calendar in XP's Date and Time Properties. */
function CalendarPopover({ date }: { date: Date }) {
    const year = date.getFullYear();
    const month = date.getMonth();
    const today = date.getDate();
    const monthName = date.toLocaleString([], { month: 'long' });

    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    const cells: (number | null)[] = Array(firstDay).fill(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push(d);
    while (cells.length % 7 !== 0) cells.push(null);

    return (
        <TrayPanel className="w-[228px] p-2">
            <fieldset className="xp-groupbox">
                <legend>Date</legend>
                <div className="mb-1.5 flex justify-between">
                    <span>{monthName}</span>
                    <span>{year}</span>
                </div>
                <div className="grid grid-cols-7 border border-[#7f9db9] bg-white text-center">
                    {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
                        <div key={i} className="bg-[#7f9db9] py-px text-white">{d}</div>
                    ))}
                    {cells.map((c, i) => (
                        <div key={i} className={`py-px ${c === today ? 'bg-[#316ac5] text-white' : ''}`}>
                            {c ?? ''}
                        </div>
                    ))}
                </div>
                <div className="mt-2 text-center">{date.toLocaleTimeString()}</div>
            </fieldset>
        </TrayPanel>
    );
}
