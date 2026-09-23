"use client";

import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { PROFILE } from '@/content';
import { playSound } from '@/utils/sound';
import ExitWindows from './ExitWindows';
import { StandByScreen } from './SessionScreens';

interface LoginScreenProps {
    onLogin: () => void;
    /**
     * Set when a session is still running behind this screen — XP's Switch User. The tile then
     * says how many programs are open, and logging in returns to them instead of starting fresh.
     */
    session?: { programs: number };
    /**
     * Turn Off / Restart with that session still running: the desktop takes over, so each window
     * with unsaved work can be asked first where the visitor can see it.
     */
    onTurnOff?: (restart: boolean) => void;
}

/** "Loading your personal settings...", then the full-screen "welcome", then the desktop. */
const LOADING_MS = 800;
const WELCOME_MS = 1100;

type Phase = 'idle' | 'loading' | 'welcome';

/**
 * The XP Welcome screen: dark bands top and bottom with their light and orange rules, the glow in
 * the top-left corner, the logo and prompt on the left of the divider and the account on the
 * right.
 *
 * Clicking the account plays XP's own sequence. That click is also the user gesture the browser
 * requires before it will play audio, which is why the startup sound belongs here — at the moment
 * the desktop appears, where XP played it — and why the boot screen no longer needs a gate.
 */
export default function LoginScreen({ onLogin, session, onTurnOff }: LoginScreenProps) {
    const [phase, setPhase] = useState<Phase>('idle');
    const [exitOpen, setExitOpen] = useState(false);
    const [standby, setStandby] = useState(false);
    const timers = useRef<number[]>([]);

    useEffect(() => () => timers.current.forEach((t) => window.clearTimeout(t)), []);

    const logIn = () => {
        if (phase !== 'idle') return;
        setPhase('loading');
        if (session) {
            // Returning to a running session: XP went straight back, with the logon chime.
            timers.current.push(window.setTimeout(() => {
                playSound('logon');
                onLogin();
            }, 450));
            return;
        }
        timers.current.push(window.setTimeout(() => setPhase('welcome'), LOADING_MS));
        timers.current.push(window.setTimeout(() => {
            playSound('startup');
            onLogin();
        }, LOADING_MS + WELCOME_MS));
    };

    const status =
        phase === 'loading'
            ? 'Loading your personal settings...'
            : session
                ? `${session.programs} program${session.programs === 1 ? '' : 's'} running`
                : PROFILE.title;

    return (
        <div className="xp-logon h-viewport w-screen">
            <div className="xp-logon-top" />

            {phase === 'welcome' ? (
                <div className="xp-logon-mid items-center justify-center">
                    <span className="xp-logon-welcome">welcome</span>
                </div>
            ) : (
                <div className="xp-logon-mid flex-col md:flex-row">
                    <div className="flex flex-1 flex-col items-center justify-end gap-4 px-6 pb-5 md:items-end md:justify-center md:pb-0 md:pr-10">
                        <Image
                            src="/icons/windows-xp-logo-white-text-transparent-bg-cropped.png"
                            width={250}
                            height={144}
                            alt="Windows XP"
                            className="h-auto w-[150px] md:w-[230px]"
                            priority
                        />
                        <span className="xp-logon-prompt">
                            To begin, click {PROFILE.shortName} to log in
                        </span>
                    </div>

                    <div className="xp-logon-divider hidden md:block" />
                    <div className="mx-auto h-px w-3/4 bg-gradient-to-r from-transparent via-white/60 to-transparent md:hidden" />

                    <div className="flex flex-1 flex-col items-center justify-start px-4 pt-5 md:items-start md:justify-center md:pl-10 md:pt-0">
                        <button
                            type="button"
                            data-logon-user=""
                            className={`xp-logon-user${phase === 'loading' ? ' is-selected' : ''}`}
                            onClick={logIn}
                            disabled={phase !== 'idle'}
                        >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                                src="/icons/profile-picture-chess.png"
                                alt={PROFILE.shortName}
                                className="xp-logon-avatar"
                                draggable={false}
                            />
                            <span>
                                <span className="xp-logon-name">{PROFILE.shortName}</span>
                                <span className="xp-logon-status">{status}</span>
                            </span>
                        </button>
                    </div>
                </div>
            )}

            <div className="xp-logon-bottom">
                {phase === 'idle' ? (
                    <>
                        <button type="button" className="xp-logon-power" onClick={() => setExitOpen(true)}>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src="/icons/xp/turn-off.svg" alt="" draggable={false} />
                            <span>Turn off computer</span>
                        </button>
                        <span className="xp-logon-hint hidden sm:block">
                            After you log on, the system&apos;s yours to explore.
                        </span>
                    </>
                ) : (
                    <span />
                )}
            </div>

            {exitOpen && (
                <ExitWindows
                    kind="shutdown"
                    onCancel={() => setExitOpen(false)}
                    onTurnOff={onTurnOff}
                    onStandBy={() => {
                        setExitOpen(false);
                        setStandby(true);
                    }}
                />
            )}
            {standby && <StandByScreen onWake={() => setStandby(false)} />}
        </div>
    );
}
