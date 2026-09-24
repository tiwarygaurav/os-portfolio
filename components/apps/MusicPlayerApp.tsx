"use client";

import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { useReducedMotion } from 'framer-motion';
import { useSystemStore } from '@/store/useSystemStore';
import { PLAYLIST, formatTime } from './mediaplayer/playlist';
import { VISUALIZATIONS, createVisualizer, type AudioFrame, type Visualizer } from './mediaplayer/visualizations';

/**
 * Windows Media Player, in the manner of version 9's Now Playing view.
 *
 * The playlist and the files are the originals (CLAUDE.md §9). What is new is that the picture
 * above them is real: the `<audio>` element is routed through a Web Audio analyser, and the
 * visualisations draw the frequency and waveform data of the track that is actually playing.
 * Volume and mute are applied after the analyser, so the picture keeps showing the music even
 * with the sound down — as WMP's did — and the drawing loop stops once playback stops and the
 * picture has settled.
 */

/** WMP 9's dark skin. These belong to the player's own skin, not to the Luna chrome. */
const SKIN = {
    body: '#0c1830',
    panel: '#10203f',
    edge: '#27406e',
    text: '#e3ecf8',
    dim: '#8fa6cc',
    accent: '#3d9bff',
};

interface Graph {
    ctx: AudioContext;
    analyser: AnalyserNode;
    gain: GainNode;
}

type AudioContextCtor = typeof AudioContext;

/* ------------------------------------------------------------------ parts */

/** A WMP-style slider: thin groove, blue fill, round thumb. Keyboard and pointer both work. */
function Slider({
    value,
    max,
    onChange,
    label,
    valueText,
    className = '',
}: {
    value: number;
    max: number;
    onChange: (v: number) => void;
    label: string;
    valueText: string;
    className?: string;
}) {
    const ref = useRef<HTMLDivElement>(null);
    const fraction = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0;
    const setFrom = (clientX: number) => {
        const r = ref.current?.getBoundingClientRect();
        if (!r || max <= 0) return;
        onChange(Math.max(0, Math.min(1, (clientX - r.left) / r.width)) * max);
    };
    const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
        if (max <= 0) return;
        e.currentTarget.setPointerCapture(e.pointerId);
        setFrom(e.clientX);
    };
    const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
        const step = max / 20;
        if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') onChange(Math.max(0, value - step));
        else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') onChange(Math.min(max, value + step));
        else if (e.key === 'Home') onChange(0);
        else if (e.key === 'End') onChange(max);
        else return;
        e.preventDefault();
        e.stopPropagation();
    };
    return (
        <div
            ref={ref}
            role="slider"
            aria-label={label}
            aria-valuemin={0}
            aria-valuemax={Math.round(max)}
            aria-valuenow={Math.round(value)}
            aria-valuetext={valueText}
            aria-disabled={max <= 0}
            tabIndex={0}
            onPointerDown={onPointerDown}
            onPointerMove={(e) => {
                if (e.currentTarget.hasPointerCapture(e.pointerId)) setFrom(e.clientX);
            }}
            onKeyDown={onKey}
            className={`relative h-[14px] cursor-pointer touch-none outline-none focus-visible:ring-1 focus-visible:ring-[#3d9bff] ${className}`}
        >
            <div className="absolute inset-x-0 top-1/2 h-[4px] -translate-y-1/2 rounded-full" style={{ background: '#04080f', boxShadow: `inset 0 1px 1px rgba(0,0,0,.8), 0 1px 0 ${SKIN.edge}` }} />
            <div
                className="absolute left-0 top-1/2 h-[4px] -translate-y-1/2 rounded-full"
                style={{ width: `${fraction * 100}%`, background: `linear-gradient(${SKIN.accent}, #1b5fc0)` }}
            />
            <div
                className="absolute top-1/2 h-[12px] w-[12px] -translate-x-1/2 -translate-y-1/2 rounded-full"
                style={{
                    left: `${fraction * 100}%`,
                    background: 'radial-gradient(circle at 35% 30%, #ffffff, #b9c9e2 55%, #6d84aa)',
                    boxShadow: '0 1px 2px rgba(0,0,0,.7)',
                    opacity: max > 0 ? 1 : 0.4,
                }}
            />
        </div>
    );
}

/** A round, glossy transport button, drawn the way WMP 9's were. */
function RoundButton({ label, onClick, size = 28, pressed, children }: { label: string; onClick: () => void; size?: number; pressed?: boolean; children: ReactNode }) {
    return (
        <button
            type="button"
            aria-label={label}
            aria-pressed={pressed}
            title={label}
            onClick={onClick}
            className="flex shrink-0 items-center justify-center rounded-full outline-none transition-[filter] duration-150 hover:brightness-125 focus-visible:ring-1 focus-visible:ring-[#3d9bff] active:brightness-90"
            style={{
                width: size,
                height: size,
                background: pressed
                    ? 'radial-gradient(circle at 50% 35%, #7fc4ff, #1f6fe0 60%, #0a3a8a)'
                    : 'radial-gradient(circle at 50% 30%, #f4f8ff, #aebfdb 45%, #50698f 100%)',
                boxShadow: '0 1px 3px rgba(0,0,0,.8), inset 0 1px 1px rgba(255,255,255,.7)',
            }}
        >
            {children}
        </button>
    );
}

const Glyph = ({ d, size = 12, fill = '#10203f' }: { d: string; size?: number; fill?: string }) => (
    <svg width={size} height={size} viewBox="0 0 12 12" aria-hidden>
        <path d={d} fill={fill} />
    </svg>
);

const GLYPHS = {
    play: 'M3 1.5 L10.5 6 L3 10.5 Z',
    pause: 'M2.5 1.5 H5 V10.5 H2.5 Z M7 1.5 H9.5 V10.5 H7 Z',
    stop: 'M2 2 H10 V10 H2 Z',
    prev: 'M1.5 1.5 H3 V10.5 H1.5 Z M3 6 L7 2 V10 Z M7 6 L11 2 V10 Z',
    next: 'M9 1.5 H10.5 V10.5 H9 Z M9 6 L5 2 V10 Z M5 6 L1 2 V10 Z',
    speaker: 'M1 4 H3.5 L7 1 V11 L3.5 8 H1 Z',
    mute: 'M1 4 H3.5 L7 1 V11 L3.5 8 H1 Z M8 4 L11 8 M11 4 L8 8',
    shuffle: 'M1 3 H3.5 L8 9 H10 V7.5 L12 9.5 L10 11.5 V10 H7.5 L3 4 H1 Z M1 9 H3 L4.5 7 L5.3 8 L3.5 10 H1 Z M7.5 2 H10 V0.5 L12 2.5 L10 4.5 V3 H8 L6.8 4.6 L6 3.6 Z',
    repeat: 'M2 5 A3 3 0 0 1 5 2 H9 V0.5 L11.5 2.75 L9 5 V3.5 H5 A1.5 1.5 0 0 0 3.5 5 V6 H2 Z M10 7 A3 3 0 0 1 7 10 H3 V11.5 L0.5 9.25 L3 7 V8.5 H7 A1.5 1.5 0 0 0 8.5 7 V6 H10 Z',
};

/* ------------------------------------------------------------------ player */

export default function MusicPlayerApp({ windowId }: { windowId?: string }) {
    const audioRef = useRef<HTMLAudioElement | null>(null);
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const graph = useRef<Graph | null>(null);
    const visualizer = useRef<Visualizer | null>(null);

    const [currentTrack, setCurrentTrack] = useState(0);
    /**
     * WMP's own transport states, as its status line named them. Set only from the audio
     * element's events (and Stop), so the words cannot claim a state the element is not in.
     */
    const [transport, setTransport] = useState<'ready' | 'playing' | 'paused' | 'stopped'>('ready');
    const isPlaying = transport === 'playing';
    /** Stop pauses the element, and the pause event that follows must read as Stopped. */
    const stopping = useRef(false);
    const [progress, setProgress] = useState(0);
    const [duration, setDuration] = useState(0);
    const [volume, setVolume] = useState(0.7);
    const [muted, setMuted] = useState(false);
    const [shuffle, setShuffle] = useState(false);
    const [repeat, setRepeat] = useState(true);
    const [playbackError, setPlaybackError] = useState<string | null>(null);
    const [visIndex, setVisIndex] = useState(0);
    /** False when the browser has no Web Audio: playback still works, the picture cannot. */
    const [canVisualize, setCanVisualize] = useState(true);

    const systemVolume = useSystemStore((s) => s.volume);
    const systemMuted = useSystemStore((s) => s.isMuted);
    const minimized = useSystemStore((s) => s.windows.find((w) => w.id === windowId)?.isMinimized ?? false);
    const active = useSystemStore((s) => s.activeWindowId === windowId);
    const reduceMotion = useReducedMotion();
    const rootRef = useRef<HTMLDivElement>(null);

    // Take the keyboard when this becomes the active window, so WMP's shortcuts work at once.
    useEffect(() => {
        const root = rootRef.current;
        if (active && root && !root.contains(document.activeElement)) root.focus({ preventScroll: true });
    }, [active]);

    // With reduced motion the player opens on the still Album Art view instead of a moving one.
    const [visTouched, setVisTouched] = useState(false);
    const vis = VISUALIZATIONS[!visTouched && reduceMotion ? VISUALIZATIONS.length - 1 : visIndex];
    const track = PLAYLIST[currentTrack];

    /*
     * What the *user* wants, as opposed to what the element is doing right now. When a track
     * ends the browser fires `pause` before `ended`, so `isPlaying` alone cannot decide whether
     * the next track should start; this ref records intent (Play pressed, or a track ending
     * while playing) and the track-change effect consults it.
     */
    const wantsPlay = useRef(false);

    /** Build the analyser graph on first play — an AudioContext may only start on a gesture. */
    const ensureGraph = (): Graph | null => {
        if (graph.current) return graph.current;
        const audio = audioRef.current;
        const Ctor = (window.AudioContext ?? (window as unknown as { webkitAudioContext?: AudioContextCtor }).webkitAudioContext) as AudioContextCtor | undefined;
        if (!audio || !Ctor) {
            setCanVisualize(false);
            return null;
        }
        try {
            const ctx = new Ctor();
            const source = ctx.createMediaElementSource(audio);
            const analyser = ctx.createAnalyser();
            analyser.fftSize = 2048;
            analyser.smoothingTimeConstant = 0.72;
            const gain = ctx.createGain();
            source.connect(analyser);
            analyser.connect(gain);
            gain.connect(ctx.destination);
            graph.current = { ctx, analyser, gain };
            return graph.current;
        } catch {
            setCanVisualize(false);
            return null;
        }
    };

    const startPlayback = (audio: HTMLAudioElement) => {
        const g = ensureGraph();
        void g?.ctx.resume();
        audio.play().catch((err: unknown) => {
            // A `load()` for the next track interrupts a pending `play()` with AbortError. That is
            // not a refusal — intent stands.
            if (err instanceof DOMException && err.name === 'AbortError') return;
            wantsPlay.current = false;
            setPlaybackError('Playback was blocked by the browser.');
        });
    };

    const togglePlay = () => {
        const audio = audioRef.current;
        if (!audio) return;
        if (audio.paused) {
            wantsPlay.current = true;
            startPlayback(audio);
        } else {
            wantsPlay.current = false;
            audio.pause();
        }
    };

    const stop = () => {
        const audio = audioRef.current;
        if (!audio) return;
        wantsPlay.current = false;
        if (audio.paused) setTransport((t) => (t === 'ready' ? t : 'stopped'));
        else stopping.current = true;
        audio.pause();
        audio.currentTime = 0;
        setProgress(0);
    };

    const pickNext = (from: number) => {
        if (shuffle && PLAYLIST.length > 1) {
            let n = from;
            while (n === from) n = Math.floor(Math.random() * PLAYLIST.length);
            return n;
        }
        return (from + 1) % PLAYLIST.length;
    };

    const nextTrack = () => setCurrentTrack((prev) => pickNext(prev));
    const prevTrack = () => setCurrentTrack((prev) => (prev === 0 ? PLAYLIST.length - 1 : prev - 1));

    const handleEnded = () => {
        // The end of the list stops playback unless Repeat is on — WMP's rule.
        const last = !shuffle && currentTrack === PLAYLIST.length - 1;
        if (last && !repeat) {
            wantsPlay.current = false;
            setTransport('stopped');
            return;
        }
        wantsPlay.current = true;
        nextTrack();
    };

    const seek = (t: number) => {
        const audio = audioRef.current;
        if (!audio || !Number.isFinite(t)) return;
        audio.currentTime = t;
        setProgress(t);
    };

    // Track change: reload, clear the old track's position, and keep playing only if wanted.
    useEffect(() => {
        const audio = audioRef.current;
        if (!audio) return;
        setProgress(0);
        setDuration(0);
        setPlaybackError(null);
        setTransport('ready');
        audio.load();
        if (wantsPlay.current) startPlayback(audio);
        // Fires on track change only; `startPlayback` is a stable closure over refs and setters.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [currentTrack]);

    /*
     * Volume: the player's own slider and mute, times the taskbar volume and mute. With the graph
     * in place the element plays at full level into the analyser and the gain node does the
     * attenuation, so the visualisation reads the music itself rather than the volume setting.
     */
    useEffect(() => {
        const audio = audioRef.current;
        const level = systemMuted || muted ? 0 : volume * systemVolume;
        if (graph.current) {
            if (audio) audio.volume = 1;
            graph.current.gain.gain.value = level;
        } else if (audio) {
            audio.volume = level;
        }
    }, [volume, muted, systemVolume, systemMuted, isPlaying]);

    // Release the audio graph with the window.
    useEffect(
        () => () => {
            void graph.current?.ctx.close();
            graph.current = null;
        },
        [],
    );

    /* ---------------------------------------------------------- drawing */

    useEffect(() => {
        visualizer.current = createVisualizer(vis.id);
    }, [vis.id]);

    useEffect(() => {
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext('2d');
        if (!canvas || !ctx) return;
        const g = graph.current;
        const size = { w: canvas.clientWidth, h: canvas.clientHeight };
        const fit = () => {
            const dpr = Math.min(window.devicePixelRatio || 1, 2);
            size.w = canvas.clientWidth;
            size.h = canvas.clientHeight;
            canvas.width = Math.max(1, Math.round(size.w * dpr));
            canvas.height = Math.max(1, Math.round(size.h * dpr));
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        };
        fit();

        const bins = g?.analyser.frequencyBinCount ?? 1024;
        const frame: AudioFrame = {
            freq: new Uint8Array(bins),
            wave: new Uint8Array(bins * 2).fill(128),
            sampleRate: g?.ctx.sampleRate ?? 44100,
        };
        const live = isPlaying && !minimized && !!g;
        let raf = 0;
        let last = performance.now();
        const tick = (now: number) => {
            raf = 0;
            const dt = Math.min(100, now - last);
            last = now;
            if (live && g) {
                g.analyser.getByteFrequencyData(frame.freq);
                g.analyser.getByteTimeDomainData(frame.wave);
            } else {
                frame.freq.fill(0);
                frame.wave.fill(128);
            }
            const moving = visualizer.current?.draw(ctx, size.w, size.h, frame, dt, track) ?? false;
            // Run while there is sound to draw, or motion to finish; then stop — no idle loop.
            if ((live && vis.id !== 'art') || (moving && !minimized)) raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);

        const observer = new ResizeObserver(() => {
            fit();
            if (!raf) raf = requestAnimationFrame(tick);
        });
        observer.observe(canvas);
        return () => {
            cancelAnimationFrame(raf);
            observer.disconnect();
        };
    }, [isPlaying, minimized, vis.id, track]);

    /* ---------------------------------------------------------- keyboard */

    // WMP's own shortcuts.
    const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
        const ctrl = e.ctrlKey || e.metaKey;
        let handled = true;
        if (ctrl && e.key.toLowerCase() === 'p') togglePlay();
        else if (ctrl && e.key.toLowerCase() === 's') stop();
        else if (ctrl && e.key.toLowerCase() === 'b') prevTrack();
        else if (ctrl && e.key.toLowerCase() === 'f') nextTrack();
        else if (ctrl && e.key.toLowerCase() === 'h') setShuffle((v) => !v);
        else if (e.key === 'F7') setMuted((v) => !v);
        else if (e.key === 'F8') setVolume((v) => Math.max(0, v - 0.1));
        else if (e.key === 'F9') setVolume((v) => Math.min(1, v + 0.1));
        else handled = false;
        if (handled) {
            e.preventDefault();
            e.stopPropagation();
        }
    };

    const cycleVis = (dir: 1 | -1) => {
        setVisTouched(true);
        setVisIndex((VISUALIZATIONS.indexOf(vis) + dir + VISUALIZATIONS.length) % VISUALIZATIONS.length);
    };

    const status =
        playbackError ??
        { playing: `Playing: ${track.title}`, paused: 'Paused', stopped: 'Stopped', ready: 'Ready' }[transport];

    return (
        <div
            ref={rootRef}
            tabIndex={-1}
            onKeyDown={onKeyDown}
            onPointerDownCapture={(e) => {
                const t = e.target as HTMLElement;
                if (!t.closest('button, [role="slider"], [role="option"]')) e.currentTarget.focus({ preventScroll: true });
            }}
            className="flex h-full select-none flex-col text-[11px] outline-none"
            style={{ background: SKIN.body, color: SKIN.text, fontFamily: 'Tahoma, Verdana, sans-serif' }}
        >
            {/* Now Playing header */}
            <div
                className="flex h-[24px] shrink-0 items-center justify-between px-2"
                style={{ background: `linear-gradient(${SKIN.edge}, ${SKIN.panel})`, borderBottom: '1px solid #000' }}
            >
                <span className="font-bold tracking-wide">Now Playing</span>
                <span style={{ color: SKIN.dim }}>{formatTime(progress)} / {formatTime(duration)}</span>
            </div>

            {/* Visualisation: 176px in the desktop window, sharing any extra height on a tall screen. */}
            <div className="relative bg-black" style={{ flex: '1 1 176px', minHeight: 176, maxHeight: 360 }}>
                <canvas
                    ref={canvasRef}
                    role="img"
                    aria-label={`${vis.name}${isPlaying ? `, showing ${track.title}` : ''}`}
                    className="h-full w-full cursor-pointer"
                    onClick={() => cycleVis(1)}
                    title="Click for the next visualization"
                />
                {!canVisualize && (
                    <p className="absolute inset-x-0 bottom-2 px-3 text-center" style={{ color: SKIN.dim }}>
                        This browser does not provide Web Audio, so there is nothing to visualize. Playback still works.
                    </p>
                )}
            </div>

            {/* Visualisation picker, as WMP had it under the pane */}
            <div className="flex h-[22px] shrink-0 items-center gap-1 px-1" style={{ background: SKIN.panel, borderBottom: `1px solid ${SKIN.edge}` }}>
                <button type="button" aria-label="Previous visualization" title="Previous visualization" onClick={() => cycleVis(-1)} className="px-1 hover:text-white" style={{ color: SKIN.dim }}>
                    ◄
                </button>
                <button type="button" aria-label="Next visualization" title="Next visualization" onClick={() => cycleVis(1)} className="px-1 hover:text-white" style={{ color: SKIN.dim }}>
                    ►
                </button>
                <span className="truncate" style={{ color: SKIN.dim }}>
                    {vis.name}
                </span>
            </div>

            {/* Track, seek and transport */}
            <div className="shrink-0 px-2 pb-1.5 pt-1.5" style={{ background: `linear-gradient(${SKIN.panel}, ${SKIN.body})` }}>
                <div className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-[12px] font-bold">{track.title}</span>
                    <span className="shrink-0" style={{ color: SKIN.dim }}>
                        {track.artist}
                    </span>
                </div>
                <Slider
                    className="mt-1"
                    label="Seek"
                    value={progress}
                    max={duration}
                    onChange={seek}
                    valueText={`${formatTime(progress)} of ${formatTime(duration)}`}
                />
                <div className="mt-1 flex items-center gap-1.5">
                    <RoundButton label="Stop" onClick={stop}>
                        <Glyph d={GLYPHS.stop} size={10} />
                    </RoundButton>
                    <RoundButton label="Previous" onClick={prevTrack}>
                        <Glyph d={GLYPHS.prev} />
                    </RoundButton>
                    <RoundButton label={isPlaying ? 'Pause' : 'Play'} onClick={togglePlay} size={38} pressed={isPlaying}>
                        <Glyph d={isPlaying ? GLYPHS.pause : GLYPHS.play} size={16} fill={isPlaying ? '#ffffff' : '#10203f'} />
                    </RoundButton>
                    <RoundButton label="Next" onClick={nextTrack}>
                        <Glyph d={GLYPHS.next} />
                    </RoundButton>
                    <div className="ml-1 flex items-center gap-1">
                        <RoundButton label={shuffle ? 'Turn shuffle off' : 'Turn shuffle on'} onClick={() => setShuffle((v) => !v)} size={22} pressed={shuffle}>
                            <Glyph d={GLYPHS.shuffle} size={11} fill={shuffle ? '#fff' : '#10203f'} />
                        </RoundButton>
                        <RoundButton label={repeat ? 'Turn repeat off' : 'Turn repeat on'} onClick={() => setRepeat((v) => !v)} size={22} pressed={repeat}>
                            <Glyph d={GLYPHS.repeat} size={11} fill={repeat ? '#fff' : '#10203f'} />
                        </RoundButton>
                    </div>
                    <div className="ml-auto flex items-center gap-1">
                        <RoundButton label={muted ? 'Unmute' : 'Mute'} onClick={() => setMuted((v) => !v)} size={22} pressed={muted}>
                            <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden>
                                <path d={GLYPHS.speaker} fill={muted ? '#fff' : '#10203f'} />
                                {muted && <path d="M8 4 L11 8 M11 4 L8 8" stroke="#fff" strokeWidth="1.4" />}
                            </svg>
                        </RoundButton>
                        <Slider
                            className="w-[64px]"
                            label="Volume"
                            value={volume}
                            max={1}
                            onChange={setVolume}
                            valueText={`${Math.round(volume * 100)}%`}
                        />
                    </div>
                </div>
            </div>

            {/* Status line: real states, never a play button that silently does nothing */}
            <div className="flex h-[18px] shrink-0 items-center justify-between px-2" style={{ background: SKIN.panel, borderTop: `1px solid ${SKIN.edge}`, borderBottom: `1px solid ${SKIN.edge}` }}>
                <span role="status" className="truncate" style={{ color: playbackError ? '#ff8a80' : SKIN.dim }}>
                    {status}
                </span>
                {systemMuted && <span className="shrink-0 text-[#ffd166]">System sound is muted</span>}
            </div>

            {/* Playlist */}
            <ul role="listbox" aria-label="Playlist" className="min-h-0 overflow-y-auto py-0.5" style={{ flex: '1 1 120px' }}>
                {PLAYLIST.map((t, i) => {
                    const on = i === currentTrack;
                    return (
                        <li key={t.file} role="none">
                            <button
                                type="button"
                                role="option"
                                aria-selected={on}
                                onClick={() => setCurrentTrack(i)}
                                onDoubleClick={() => {
                                    wantsPlay.current = true;
                                    if (i === currentTrack && audioRef.current) startPlayback(audioRef.current);
                                    else setCurrentTrack(i);
                                }}
                                className="flex w-full items-center gap-2 px-2 py-[2px] text-left hover:bg-[#1b3566]"
                                style={on ? { background: '#1f4f9c', color: '#fff' } : undefined}
                            >
                                <span className="w-4 shrink-0 text-right" style={{ color: on ? '#cfe4ff' : SKIN.dim }}>
                                    {i + 1}
                                </span>
                                <span className="min-w-0 flex-1 truncate">{t.title}</span>
                                <span className="shrink-0" style={{ color: on ? '#cfe4ff' : SKIN.dim }}>
                                    {t.artist}
                                </span>
                            </button>
                        </li>
                    );
                })}
            </ul>

            <audio
                ref={audioRef}
                src={track.file}
                preload="metadata"
                onTimeUpdate={() => audioRef.current && setProgress(audioRef.current.currentTime)}
                onLoadedMetadata={() => audioRef.current && setDuration(audioRef.current.duration)}
                onEnded={handleEnded}
                // The element is the truth for the transport state; intent lives in `wantsPlay`.
                onPlay={() => {
                    setTransport('playing');
                    setPlaybackError(null);
                }}
                onPause={() => {
                    const stopped = stopping.current;
                    stopping.current = false;
                    setTransport((t) => (stopped ? 'stopped' : t === 'playing' ? 'paused' : t));
                }}
                onError={() => {
                    // A track that cannot load must not auto-advance into the next one on its own.
                    wantsPlay.current = false;
                    setTransport('ready');
                    setPlaybackError('This track could not be loaded.');
                }}
            />
        </div>
    );
}
