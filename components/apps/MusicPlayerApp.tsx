"use client";

import { useState, useRef } from 'react';
import { Play, Pause, SkipBack, SkipForward, Volume2 } from 'lucide-react';

export default function MusicPlayerApp() {
    const [isPlaying, setIsPlaying] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);
    const audioRef = useRef<HTMLAudioElement | null>(null);

    const togglePlay = () => {
        if (!audioRef.current) return;
        if (isPlaying) {
            audioRef.current.pause();
        } else {
            audioRef.current.play();
        }
        setIsPlaying(!isPlaying);
    };

    return (
        <div className="h-full bg-[#c0c0c0] p-1 flex flex-col font-sans select-none">
            {/* Skin Header */}
            <div className="bg-[#292929] h-20 mb-1 rounded-t-lg relative border-2 border-gray-600 flex items-center justify-center">
                <div className="text-[#00ff00] font-mono text-xl tracking-widest bg-black px-4 py-2 border border-gray-700 shadow-inner">
                    WINAMP 2.91
                </div>
            </div>

            {/* Controls Area */}
            <div className="flex-1 bg-gradient-to-b from-[#4a4a4a] to-[#2b2b2b] p-2 border-2 border-gray-600 relative">
                {/* Visualizer Placeholder */}
                <div className="h-16 bg-black mb-2 border border-gray-700 flex items-end justify-center px-1 gap-0.5">
                    {[...Array(20)].map((_, i) => (
                        <div key={i} className="w-2 bg-green-500" style={{ height: `${Math.random() * 100}%` }} />
                    ))}
                </div>

                <div className="flex justify-center gap-4 mt-4">
                    <button className="text-gray-300 hover:text-white active:scale-95"><SkipBack size={20} /></button>
                    <button onClick={togglePlay} className="text-gray-300 hover:text-white active:scale-95">
                        {isPlaying ? <Pause size={24} /> : <Play size={24} />}
                    </button>
                    <button className="text-gray-300 hover:text-white active:scale-95"><SkipForward size={20} /></button>
                </div>

                <div className="mt-4 flex items-center gap-2 px-4">
                    <Volume2 size={16} className="text-gray-400" />
                    <input type="range" className="w-full h-1 bg-gray-600 rounded-lg appearance-none cursor-pointer" />
                </div>
            </div>

            {/* Playlist (Fake) */}
            <div className="bg-black text-[#00ff00] font-mono text-xs p-2 h-32 overflow-y-auto border-2 border-gray-600 mt-1">
                <div className="hover:bg-[#003300] cursor-pointer p-0.5">1. Linkin Park - Numb.mp3</div>
                <div className="hover:bg-[#003300] cursor-pointer p-0.5">2. Green Day - Boulevard of Broken Dreams.mp3</div>
                <div className="hover:bg-[#003300] cursor-pointer p-0.5">3. Blink-182 - I Miss You.mp3</div>
                <div className="hover:bg-[#003300] cursor-pointer p-0.5">4. Eminem - Lose Yourself.mp3</div>
            </div>

            <audio ref={audioRef} src="/sounds/startup.mp3" onEnded={() => setIsPlaying(false)} />
        </div>
    );
}
