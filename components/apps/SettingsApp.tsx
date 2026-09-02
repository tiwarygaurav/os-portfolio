"use client";

import { useSystemStore, WALLPAPERS } from '@/store/useSystemStore';
import { useState } from 'react';

const TABS = ['Themes', 'Desktop', 'Screen Saver', 'Appearance', 'Settings'];

/** Honest empty state: say it does not exist rather than rendering controls that do nothing. */
function NotBuiltYet({ title, detail }: { title: string; detail: string }) {
    return (
        <div className="max-w-md space-y-1 border border-dashed border-gray-400 bg-white/50 p-3">
            <p className="font-bold text-gray-700">{title}</p>
            <p className="leading-relaxed text-gray-600">{detail}</p>
        </div>
    );
}

export default function SettingsApp() {
    const wallpaperId = useSystemStore((s) => s.wallpaperId);
    const actions = useSystemStore((s) => s.actions);
    const [tab, setTab] = useState('Desktop');

    const currentWp = WALLPAPERS.find(w => w.id === wallpaperId) || WALLPAPERS[0];

    return (
        <div className="h-full bg-[#ece9d8] flex flex-col font-sans text-xs select-none">
            {/* Tabs */}
            <div className="flex border-b border-gray-500 pt-2 px-2 gap-px">
                {TABS.map(t => (
                    <button
                        key={t}
                        onClick={() => setTab(t)}
                        className={`px-4 py-1 border border-b-0 border-gray-500 ${tab === t ? 'bg-[#ece9d8] -mb-px relative z-10' : 'bg-[#c0c0c0]'}`}
                    >
                        {t}
                    </button>
                ))}
            </div>

            {/* Content */}
            <div className="flex-1 p-3 overflow-y-auto bg-[#ece9d8]">
                {tab === 'Desktop' && (
                    <div className="space-y-3">
                        {/* Preview Monitor */}
                        <div className="flex justify-center">
                            <div className="relative">
                                <div className="w-56 h-44 bg-black p-2 rounded-md shadow-lg border-4 border-gray-300" style={{ boxShadow: '0 8px 16px rgba(0,0,0,0.3)' }}>
                                    <div
                                        className="w-full h-full overflow-hidden"
                                        style={{
                                            background: currentWp.color
                                                ? currentWp.color
                                                : `url('${currentWp.url}') center/cover`
                                        }}
                                    >
                                        <div className="absolute bottom-2 left-2 right-2 h-2 bg-blue-700" />
                                    </div>
                                </div>
                                <div className="w-32 h-2 bg-gray-300 mx-auto -mt-1 rounded-b" />
                                <div className="w-16 h-3 bg-gray-300 mx-auto rounded-b-lg" />
                            </div>
                        </div>

                        <fieldset className="border border-gray-500 p-2">
                            <legend className="px-1 font-normal">Background:</legend>
                            <div className="h-32 overflow-y-auto bg-white border border-gray-500 p-1">
                                {WALLPAPERS.map(w => (
                                    <button
                                        key={w.id}
                                        onClick={() => actions.setWallpaper(w.id)}
                                        className={`w-full text-left px-2 py-0.5 flex items-center gap-2 ${wallpaperId === w.id ? 'bg-[#316ac5] text-white' : 'hover:bg-blue-100'}`}
                                    >
                                        <div
                                            className="w-5 h-4 border border-gray-400"
                                            style={{
                                                background: w.color || `url('${w.url}') center/cover`
                                            }}
                                        />
                                        {w.name}
                                    </button>
                                ))}
                            </div>
                        </fieldset>

                        <button
                            onClick={() => actions.resetDesktopIcons()}
                            className="px-3 py-1 bg-[#ece9d8] border border-gray-500 hover:bg-gray-100"
                            style={{ boxShadow: 'inset 1px 1px 0 #fff, inset -1px -1px 0 #808080' }}
                        >
                            Reset Icon Positions
                        </button>
                    </div>
                )}

                {/*
                  * The theme picker offered "Windows XP — blue / olive / silver" and wrote to a
                  * store field that nothing ever read. Three radio buttons, zero effect. Colours
                  * are still hardcoded per component, so there is nothing for it to drive yet.
                  */}
                {tab === 'Themes' && (
                    <NotBuiltYet
                        title="Themes are not available yet."
                        detail="Colour and chrome values currently live inside individual components. Once they move to a shared token layer, this tab will switch between real themes — until then it would only pretend to."
                    />
                )}

                {/*
                  * Screen Saver offered a dropdown of screensavers that did not exist, and
                  * Appearance was an empty tab. Both now state plainly that they are not built,
                  * instead of presenting controls that lead nowhere.
                  */}
                {tab === 'Screen Saver' && (
                    <NotBuiltYet
                        title="No screen saver is installed."
                        detail="This environment has no idle-timeout behaviour yet. When one exists it will appear here."
                    />
                )}

                {tab === 'Appearance' && (
                    <NotBuiltYet
                        title="Window appearance is not customisable yet."
                        detail="Colours and chrome are still hardcoded per component. A design-token layer is planned, and this tab will drive it."
                    />
                )}

                {tab === 'Settings' && (
                    <div className="space-y-2">
                        <p className="text-gray-600">Display: {typeof window !== 'undefined' ? `${window.screen.width} x ${window.screen.height}` : 'Unknown'}</p>
                        <p className="text-gray-600">Color quality: Highest (32 bit)</p>
                    </div>
                )}
            </div>

            {/*
              * Footer. OK / Cancel / Apply were three dead buttons.
              *
              * Settings here apply the moment you choose them and are persisted, so there is
              * nothing for OK or Apply to do and nothing for Cancel to roll back. Rather than
              * faking a commit model, the panel says what it actually does and offers the one
              * real destructive action: revert to defaults.
              */}
            <div className="flex items-center justify-between gap-2 border-t border-gray-400 bg-[#ece9d8] p-2">
                <span className="text-[11px] text-gray-600">Changes apply immediately and are saved.</span>
                <button
                    onClick={() => {
                        actions.setWallpaper('bliss');

                        actions.resetDesktopIcons();
                    }}
                    className="border border-gray-500 bg-[#ece9d8] px-4 py-1 hover:bg-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                    style={{ boxShadow: 'inset 1px 1px 0 #fff, inset -1px -1px 0 #808080' }}
                >
                    Restore Defaults
                </button>
            </div>
        </div>
    );
}
