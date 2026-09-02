"use client";

import { useState, useRef, useEffect } from 'react';
import { useSystemStore } from '@/store/useSystemStore';
import { Play, Pause, SkipBack, SkipForward, Volume2 } from 'lucide-react';

const PLAYLIST = [
    { title: "Startup Sound", file: "/sounds/startup.mp3" },
    { title: "Sabse Piche Khade", file: "/sounds/Mohit Chauhan - Sabse Piche Khade.m4a" },
    { title: "Lose Yourself", file: "/sounds/Eminem - Lose Yourself.mp3" },
    { title: "Kim", file: "/sounds/Eminem - Kim.mp3" },
    { title: "Mockingbird", file: "/sounds/Eminem - Mockingbird.mp3" },
    { title: "Without Me", file: "/sounds/Eminem - Without Me.mp3" },
    { title: "Legacy", file: "/sounds/Eminem - Legacy.mp3" },
    { title: "Space Bound", file: "/sounds/Eminem - Space Bound.mp3" },
];

export default function MusicPlayerApp() {
    const audioRef = useRef<HTMLAudioElement | null>(null);

    const [currentTrack, setCurrentTrack] = useState(0);
    const [isPlaying, setIsPlaying] = useState(false);
    const [progress, setProgress] = useState(0);
    const [duration, setDuration] = useState(0);
    const [volume, setVolume] = useState(0.7);
    const [playbackError, setPlaybackError] = useState<string | null>(null);

    const systemVolume = useSystemStore((s) => s.volume);
    const isMuted = useSystemStore((s) => s.isMuted);

    /*
     * Play / pause.
     *
     * `isPlaying` used to be flipped optimistically while `play()`'s promise went unhandled, so a
     * browser that refused playback left the UI claiming to play silence — and threw an unhandled
     * rejection. The flag is now driven by the element's own `play` / `pause` events (see the
     * `<audio>` handlers below), and a refusal is caught and surfaced.
     */
    const togglePlay = () => {
        const audio = audioRef.current;
        if (!audio) return;

        if (audio.paused) {
            audio.play().catch(() => setPlaybackError('Playback was blocked by the browser.'));
        } else {
            audio.pause();
        }
    };

    // Next Track
    const nextTrack = () => {
        setCurrentTrack((prev) => (prev + 1) % PLAYLIST.length);
    };

    // Previous Track
    const prevTrack = () => {
        setCurrentTrack((prev) =>
            prev === 0 ? PLAYLIST.length - 1 : prev - 1
        );
    };

    // Update progress
    const handleTimeUpdate = () => {
        if (!audioRef.current) return;
        setProgress(audioRef.current.currentTime);
    };

    // Load metadata
    const handleLoadedMetadata = () => {
        if (!audioRef.current) return;
        setDuration(audioRef.current.duration);
    };

    // Seek
    const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!audioRef.current) return;
        audioRef.current.currentTime = Number(e.target.value);
        setProgress(Number(e.target.value));
    };

    // Volume
    const handleVolume = (e: React.ChangeEvent<HTMLInputElement>) => {
        const vol = Number(e.target.value);
        setVolume(vol);
        // The effect below applies it together with the system volume.
    };

    // Auto play when track changes
    useEffect(() => {
        const audio = audioRef.current;
        if (!audio) return;

        audio.load();
        if (isPlaying) {
            audio.play().catch(() => setPlaybackError('Playback was blocked by the browser.'));
        }
        // `isPlaying` is intentionally not a dependency: this should fire on track change only,
        // otherwise pausing would reload and restart the track.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [currentTrack]);

    /*
     * Honour the taskbar volume and mute. The tray slider used to have no effect here at all —
     * the system claimed a global volume control that this app quietly ignored.
     */
    useEffect(() => {
        const audio = audioRef.current;
        if (!audio) return;
        audio.volume = isMuted ? 0 : volume * systemVolume;
    }, [volume, systemVolume, isMuted]);

    return (
        <div className="h-full bg-[#c0c0c0] p-1 flex flex-col font-sans select-none">

            {/* Header */}
            <div className="bg-[#292929] h-20 mb-1 rounded-t-lg border-2 border-gray-600 flex items-center justify-center">
                <div className="text-[#00ff00] font-mono text-xl tracking-widest bg-black px-4 py-2 border border-gray-700 shadow-inner">
                    {PLAYLIST[currentTrack].title}
                </div>
            </div>

            {/* Controls */}
            <div className="flex-1 bg-gradient-to-b from-[#4a4a4a] to-[#2b2b2b] p-3 border-2 border-gray-600">

                {/* Progress Bar */}
                <input
                    type="range"
                    min="0"
                    max={duration}
                    value={progress}
                    onChange={handleSeek}
                    className="w-full mb-3"
                />

                {/* Buttons */}
                <div className="flex justify-center gap-6 mt-4">
                    <button onClick={prevTrack} className="text-gray-300 hover:text-white active:scale-95">
                        <SkipBack size={22} />
                    </button>

                    <button onClick={togglePlay} className="text-gray-300 hover:text-white active:scale-95">
                        {isPlaying ? <Pause size={26} /> : <Play size={26} />}
                    </button>

                    <button onClick={nextTrack} className="text-gray-300 hover:text-white active:scale-95">
                        <SkipForward size={22} />
                    </button>
                </div>

                {/* Volume */}
                <div className="mt-6 flex items-center gap-2 px-2">
                    <Volume2 size={18} className="text-gray-400" />
                    <input
                        type="range"
                        min="0"
                        max="1"
                        step="0.01"
                        value={volume}
                        onChange={handleVolume}
                        className="w-full"
                        aria-label="Player volume"
                    />
                </div>

                {/* Real failure states, rather than a play button that silently does nothing. */}
                {isMuted && (
                    <p className="mt-2 text-center text-[10px] text-amber-300">
                        System volume is muted — unmute from the taskbar.
                    </p>
                )}
                {playbackError && (
                    <p role="alert" className="mt-1 text-center text-[10px] text-red-400">
                        {playbackError}
                    </p>
                )}
            </div>

            {/* Playlist */}
            <div className="bg-black text-[#00ff00] font-mono text-xs p-2 h-32 overflow-y-auto border-2 border-gray-600 mt-1">
                {PLAYLIST.map((track, index) => (
                    <div
                        key={index}
                        onClick={() => setCurrentTrack(index)}
                        className={`cursor-pointer p-0.5 ${currentTrack === index ? "bg-[#003300]" : "hover:bg-[#003300]"
                            }`}
                    >
                        {index + 1}. {track.title}
                    </div>
                ))}
            </div>

            <audio
                ref={audioRef}
                src={PLAYLIST[currentTrack].file}
                onTimeUpdate={handleTimeUpdate}
                onLoadedMetadata={handleLoadedMetadata}
                onEnded={nextTrack}
                // The element is the source of truth for transport state, not local optimism.
                onPlay={() => { setIsPlaying(true); setPlaybackError(null); }}
                onPause={() => setIsPlaying(false)}
                onError={() => { setIsPlaying(false); setPlaybackError('This track could not be loaded.'); }}
            />
        </div>
    );
}
