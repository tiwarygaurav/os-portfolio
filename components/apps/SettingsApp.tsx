"use client";

import { useState } from 'react';
import { useSystemStore, WALLPAPERS } from '@/store/useSystemStore';
import {
    IDLE_MINUTES,
    SCREEN_SAVERS,
    THEMES,
    DEFAULT_SCREEN_SAVER,
    DEFAULT_THEME,
    WALLPAPER_POSITIONS,
    type ThemeId,
    type WallpaperFile,
    type WallpaperPosition,
} from '@/constants/prefs';
import FileDialog, { type FileType } from '@/components/os/FileDialog';
import { PICTURES_PATH } from '@/system/vfs';
import { wallpaperCss } from '@/utils/wallpaper';
import { useFsRevision } from '@/utils/fs';
import { xpAlert } from '@/utils/dialog';

/** XP's Browse... listed every picture first. */
const PICTURE_TYPES: FileType[] = [
    { label: 'All Picture Files', test: (f) => Boolean(f.src) },
    { label: 'PNG (*.png)', test: (f) => /\.png$/i.test(f.name) },
];

const fileName = (path: string) => path.slice(path.lastIndexOf('/') + 1);

/**
 * Display Properties, laid out as XP had it: Themes, Desktop, Screen Saver, Appearance, Settings.
 *
 * Every control here changes something real, applies immediately and is persisted. Three tabs used
 * to say "not built yet" because the colours were hardcoded in forty places; now the Luna chrome
 * lives in CSS variables (`app/globals.css`), so the colour scheme is a real switch, and the screen
 * saver has a real idle timer behind it.
 */

const TABS = ['Themes', 'Desktop', 'Screen Saver', 'Appearance', 'Settings'] as const;
type Tab = (typeof TABS)[number];

/** XP's own theme: Bliss and the Blue scheme. Anything else reads as "Modified Theme". */
const XP_THEME = { wallpaperId: 'bliss', themeId: DEFAULT_THEME };

const bevel = { boxShadow: 'inset 1px 1px 0 #fff, inset -1px -1px 0 #808080' };

function XPButton(props: React.ButtonHTMLAttributes<HTMLButtonElement>) {
    return (
        <button
            {...props}
            className={`border border-gray-500 bg-[#ece9d8] px-3 py-1 hover:bg-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:text-gray-400 disabled:hover:bg-[#ece9d8] ${props.className ?? ''}`}
            style={bevel}
        />
    );
}

/** The little CRT from XP's Display Properties, showing whatever it is given. */
function MonitorPreview({ children }: { children: React.ReactNode }) {
    return (
        <div className="flex justify-center">
            <div className="relative">
                <div className="h-40 w-52 rounded-md border-4 border-gray-300 bg-black p-2 shadow-lg" style={{ boxShadow: '0 8px 16px rgba(0,0,0,0.3)' }}>
                    <div className="relative h-full w-full overflow-hidden">{children}</div>
                </div>
                <div className="mx-auto -mt-1 h-2 w-32 rounded-b bg-gray-300" />
                <div className="mx-auto h-3 w-16 rounded-b-lg bg-gray-300" />
            </div>
        </div>
    );
}

/** A built-in wallpaper swatch, or the current picture wallpaper, drawn exactly as the desktop draws it. */
const wallpaperStyle = (id: string, file: WallpaperFile | null = null) => wallpaperCss(id, file);

/**
 * A miniature active and inactive window in the current scheme. Schemes apply the moment they are
 * chosen, so this shows what is already on screen, at the scale of the little monitor. It sets
 * `data-theme` on its own subtree so it stays correct even where the page root has none (it is
 * mounted inside the desktop, which always sets one, but the component does not rely on that).
 */
function SchemePreview({ themeId, wallpaperId, wallpaperFile }: { themeId: ThemeId; wallpaperId: string; wallpaperFile: WallpaperFile | null }) {
    return (
        <div data-theme={themeId} className="absolute inset-0" style={wallpaperStyle(wallpaperId, wallpaperFile)}>
            <div className="absolute left-3 top-3 w-28 border luna-title-edge bg-[#ece9d8] shadow">
                <div className="luna-title-inactive h-3 px-1 text-[7px] font-bold leading-3 text-white">Inactive Window</div>
                <div className="h-6" />
            </div>
            <div className="absolute left-8 top-9 w-32 border luna-title-edge bg-[#ece9d8] shadow-md">
                <div className="luna-title h-3 px-1 text-[7px] font-bold leading-3 text-white">Active Window</div>
                <div className="flex h-9 items-center justify-center text-[7px] text-gray-700">Window Text</div>
            </div>
            <div className="luna-taskbar absolute bottom-0 left-0 right-0 h-2.5" />
        </div>
    );
}

export default function SettingsApp() {
    const wallpaperId = useSystemStore((s) => s.wallpaperId);
    const wallpaperFile = useSystemStore((s) => s.wallpaperFile);
    const themeId = useSystemStore((s) => s.themeId);
    // Previews draw the picture wallpaper through the filesystem; re-render if its file changes.
    useFsRevision();
    const [browsing, setBrowsing] = useState(false);
    const screenSaver = useSystemStore((s) => s.screenSaver);
    const deletedCount = useSystemStore((s) => s.deletedAppIds.length);
    const movedCount = useSystemStore((s) => Object.keys(s.desktopIcons).length);
    const actions = useSystemStore((s) => s.actions);
    const [tab, setTab] = useState<Tab>('Desktop');

    const isXpTheme = wallpaperId === XP_THEME.wallpaperId && !wallpaperFile && themeId === XP_THEME.themeId;

    const applyPicture = (path: string, position: WallpaperPosition) => {
        const problem = actions.setWallpaperFile(path, position);
        if (problem) void xpAlert('Display Properties', [problem], 'warning');
    };

    return (
        <div className="relative flex h-full select-none flex-col bg-[#ece9d8] font-sans text-xs">
            {/* Tabs */}
            <div role="tablist" className="flex flex-wrap gap-px border-b border-gray-500 px-2 pt-2">
                {TABS.map((t) => (
                    <button
                        key={t}
                        role="tab"
                        aria-selected={tab === t}
                        onClick={() => setTab(t)}
                        className={`border border-b-0 border-gray-500 px-3 py-1 ${tab === t ? 'relative z-10 -mb-px bg-[#ece9d8]' : 'bg-[#dcd8c8]'}`}
                    >
                        {t}
                    </button>
                ))}
            </div>

            <div className="flex-1 overflow-y-auto bg-[#ece9d8] p-3" role="tabpanel">
                {tab === 'Themes' && (
                    <div className="space-y-3">
                        <p className="leading-relaxed">
                            A theme is a background plus a colour scheme. Choose one to change both at once.
                        </p>
                        <label className="block">
                            <span className="mb-1 block">Theme:</span>
                            {/*
                              * With the XP theme already applied there is nothing to choose, so the
                              * list is disabled and says why rather than offering a no-op.
                              */}
                            <select
                                value={isXpTheme ? 'xp' : 'modified'}
                                disabled={isXpTheme}
                                aria-describedby="theme-note"
                                onChange={(e) => {
                                    if (e.target.value !== 'xp') return;
                                    actions.setWallpaper(XP_THEME.wallpaperId);
                                    actions.setTheme(XP_THEME.themeId);
                                }}
                                className="w-full border border-[#7f9db9] bg-white px-1 py-0.5 disabled:bg-gray-100 disabled:text-gray-600"
                            >
                                <option value="xp">Windows XP</option>
                                {/* Shown only while it is true, as XP did. It cannot be chosen. */}
                                {!isXpTheme && <option value="modified" disabled>Modified Theme</option>}
                            </select>
                            <span id="theme-note" className="mt-0.5 block text-[11px] text-gray-500">
                                {isXpTheme
                                    ? 'Windows XP is the only theme. Change the background or colour scheme and this becomes "Modified Theme", with Windows XP to go back.'
                                    : 'Choose Windows XP to go back to Bliss and the Blue scheme.'}
                            </span>
                        </label>
                        <p className="text-gray-600">Sample:</p>
                        <MonitorPreview>
                            <SchemePreview themeId={themeId} wallpaperId={wallpaperId} wallpaperFile={wallpaperFile} />
                        </MonitorPreview>
                    </div>
                )}

                {tab === 'Desktop' && (
                    <div className="space-y-3">
                        <MonitorPreview>
                            <div className="absolute inset-0" style={wallpaperStyle(wallpaperId, wallpaperFile)}>
                                <div className="luna-taskbar absolute bottom-0 left-0 right-0 h-2.5" />
                            </div>
                        </MonitorPreview>

                        <fieldset className="border border-gray-500 p-2">
                            <legend className="px-1 font-normal">Background:</legend>
                            <div className="h-32 overflow-y-auto border border-gray-500 bg-white p-1">
                                {wallpaperFile && (
                                    // The picture in use: shown selected, not a button — there is nothing to choose.
                                    <div
                                        title={wallpaperFile.path}
                                        className="flex w-full items-center gap-2 bg-[#316ac5] px-2 py-0.5 text-white"
                                    >
                                        <div className="h-4 w-5 border border-gray-400" style={wallpaperStyle(wallpaperId, { ...wallpaperFile, position: 'stretch' })} />
                                        {fileName(wallpaperFile.path)}
                                    </div>
                                )}
                                {WALLPAPERS.map((w) => {
                                    const current = !wallpaperFile && wallpaperId === w.id;
                                    return (
                                        <button
                                            key={w.id}
                                            onClick={() => actions.setWallpaper(w.id)}
                                            aria-pressed={current}
                                            className={`flex w-full items-center gap-2 px-2 py-0.5 text-left ${current ? 'bg-[#316ac5] text-white' : 'hover:bg-blue-100'}`}
                                        >
                                            <div className="h-4 w-5 border border-gray-400" style={wallpaperStyle(w.id)} />
                                            {w.name}
                                        </button>
                                    );
                                })}
                            </div>
                            <div className="mt-2 flex flex-wrap items-center gap-2">
                                <XPButton onClick={() => setBrowsing(true)}>Browse...</XPButton>
                                <label className="flex items-center gap-1">
                                    <span>Position:</span>
                                    <select
                                        aria-label="Picture position"
                                        value={wallpaperFile?.position ?? 'stretch'}
                                        disabled={!wallpaperFile}
                                        title={wallpaperFile ? undefined : 'Only a picture chosen with Browse... can be positioned.'}
                                        onChange={(e) => wallpaperFile && applyPicture(wallpaperFile.path, e.target.value as WallpaperPosition)}
                                        className="border border-[#7f9db9] bg-white px-1 py-0.5 disabled:bg-gray-100 disabled:text-gray-500"
                                    >
                                        {WALLPAPER_POSITIONS.map((p) => (
                                            <option key={p.id} value={p.id}>{p.name}</option>
                                        ))}
                                    </select>
                                </label>
                            </div>
                        </fieldset>

                        <fieldset className="space-y-2 border border-gray-500 p-2">
                            <legend className="px-1 font-normal">Desktop icons:</legend>
                            <div className="flex flex-wrap gap-2">
                                <XPButton
                                    onClick={() => actions.resetDesktopIcons()}
                                    disabled={movedCount === 0}
                                    title={movedCount === 0 ? 'Every icon is already in its default place' : undefined}
                                >
                                    Reset Icon Positions
                                </XPButton>
                                {/*
                                  * Deleted icons persist, so a visitor could lose the Projects icon for
                                  * good without ever thinking to open the Recycle Bin. This puts them all back.
                                  */}
                                <XPButton onClick={() => actions.restoreAllItems()} disabled={deletedCount === 0}>
                                    Restore Deleted Icons{deletedCount ? ` (${deletedCount})` : ''}
                                </XPButton>
                            </div>
                        </fieldset>
                    </div>
                )}

                {tab === 'Screen Saver' && (
                    <div className="space-y-3">
                        <MonitorPreview>
                            <div className="flex h-full items-center justify-center bg-black text-center text-[10px] text-gray-300">
                                {screenSaver.kind === 'none'
                                    ? '(None)'
                                    : SCREEN_SAVERS.find((s) => s.id === screenSaver.kind)?.name}
                            </div>
                        </MonitorPreview>

                        <fieldset className="space-y-2 border border-gray-500 p-2">
                            <legend className="px-1 font-normal">Screen saver</legend>
                            <div className="flex flex-wrap items-center gap-2">
                                <select
                                    aria-label="Screen saver"
                                    value={screenSaver.kind}
                                    onChange={(e) => actions.setScreenSaver({ kind: e.target.value as typeof screenSaver.kind })}
                                    className="min-w-[150px] flex-1 border border-[#7f9db9] bg-white px-1 py-0.5"
                                >
                                    {SCREEN_SAVERS.map((s) => (
                                        <option key={s.id} value={s.id}>{s.name}</option>
                                    ))}
                                </select>
                                <XPButton
                                    onClick={() => actions.setScreenSaverActive(true)}
                                    disabled={screenSaver.kind === 'none'}
                                >
                                    Preview
                                </XPButton>
                            </div>
                            <label className="flex items-center gap-2">
                                <span>Wait:</span>
                                <select
                                    aria-label="Minutes before the screen saver starts"
                                    value={screenSaver.idleMinutes}
                                    onChange={(e) => actions.setScreenSaver({ idleMinutes: Number(e.target.value) })}
                                    disabled={screenSaver.kind === 'none'}
                                    className="border border-[#7f9db9] bg-white px-1 py-0.5 disabled:bg-gray-100"
                                >
                                    {IDLE_MINUTES.map((m) => (
                                        <option key={m} value={m}>{m}</option>
                                    ))}
                                </select>
                                <span>minutes</span>
                            </label>
                            <p className="leading-relaxed text-gray-600">
                                Starts after that long with no mouse, keyboard or touch input on this page. Move the
                                mouse or press a key to return.
                            </p>
                        </fieldset>
                    </div>
                )}

                {tab === 'Appearance' && (
                    <div className="space-y-3">
                        <MonitorPreview>
                            <SchemePreview themeId={themeId} wallpaperId={wallpaperId} wallpaperFile={wallpaperFile} />
                        </MonitorPreview>
                        <label className="block">
                            <span className="mb-1 block">Windows and buttons:</span>
                            <select disabled className="w-full border border-[#7f9db9] bg-gray-100 px-1 py-0.5 text-gray-600" aria-describedby="style-note">
                                <option>Windows XP style</option>
                            </select>
                            <span id="style-note" className="mt-0.5 block text-[11px] text-gray-500">
                                The only style this desktop has, so it is shown rather than offered.
                            </span>
                        </label>
                        <label className="block">
                            <span className="mb-1 block">Color scheme:</span>
                            <select
                                value={themeId}
                                onChange={(e) => actions.setTheme(e.target.value as ThemeId)}
                                className="w-full border border-[#7f9db9] bg-white px-1 py-0.5"
                            >
                                {THEMES.map((t) => (
                                    <option key={t.id} value={t.id}>{t.id === 'blue' ? 'Default (blue)' : t.name}</option>
                                ))}
                            </select>
                        </label>
                        <p className="leading-relaxed text-gray-600">
                            The scheme applies as soon as you choose it and is saved. Olive Green and Silver are
                            approximations of the XP originals.
                        </p>
                    </div>
                )}

                {tab === 'Settings' && (
                    <div className="space-y-2">
                        <p className="text-gray-600">Display: {typeof window !== 'undefined' ? `${window.screen.width} x ${window.screen.height}` : 'Unknown'}</p>
                        {/* Read from the browser, like the resolution above — this line used to be a literal "32 bit". */}
                        <p className="text-gray-600">Color quality: {typeof window !== 'undefined' ? `${window.screen.colorDepth}-bit` : 'Unknown'}</p>
                        <p className="text-gray-600">Pixel ratio: {typeof window !== 'undefined' ? window.devicePixelRatio : 'Unknown'}</p>
                    </div>
                )}
            </div>

            {browsing && (
                <FileDialog
                    mode="open"
                    initialDir={PICTURES_PATH}
                    types={PICTURE_TYPES}
                    onCancel={() => setBrowsing(false)}
                    onConfirm={(path) => {
                        setBrowsing(false);
                        applyPicture(path, wallpaperFile?.position ?? 'stretch');
                    }}
                />
            )}

            {/*
              * Footer. OK / Cancel / Apply were three dead buttons: settings here apply the moment
              * they are chosen and are persisted, so there is nothing for OK to commit or Cancel to
              * roll back. The panel says what it does and offers the one real action: defaults.
              */}
            <div className="flex items-center justify-between gap-2 border-t border-gray-400 bg-[#ece9d8] p-2">
                <span className="text-[11px] text-gray-600">Changes apply immediately and are saved.</span>
                <XPButton
                    onClick={() => {
                        actions.setWallpaper('bliss');
                        actions.setTheme(DEFAULT_THEME);
                        actions.setScreenSaver(DEFAULT_SCREEN_SAVER);
                        actions.resetDesktopIcons();
                    }}
                    className="px-4"
                >
                    Restore Defaults
                </XPButton>
            </div>
        </div>
    );
}
