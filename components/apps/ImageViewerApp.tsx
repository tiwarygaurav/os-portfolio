"use client";

import { useState } from 'react';
import { ChevronLeft, ChevronRight, ZoomIn, ZoomOut, RotateCw } from 'lucide-react';

const IMAGES = [
    { src: '/wallpapers/Bliss.jpg', name: 'Bliss.jpg' },
    { src: '/icons/profile-picture-chess.png', name: 'Profile.png' },
    { src: '/profile.jpg', name: 'Avatar.jpg' },
    { src: '/icons/windows-xp-logo-black-text.png', name: 'WindowsXP-Logo.png' },
];

export default function ImageViewerApp() {
    const [index, setIndex] = useState(0);
    const [zoom, setZoom] = useState(1);
    const [rotation, setRotation] = useState(0);

    const img = IMAGES[index];

    const prev = () => { setIndex(i => (i - 1 + IMAGES.length) % IMAGES.length); setZoom(1); setRotation(0); };
    const next = () => { setIndex(i => (i + 1) % IMAGES.length); setZoom(1); setRotation(0); };

    return (
        <div className="h-full flex flex-col bg-[#ece9d8] font-sans select-none">
            {/* Image area */}
            <div className="flex-1 bg-gray-700 flex items-center justify-center overflow-hidden relative">
                <img
                    src={img.src}
                    alt={img.name}
                    className="max-w-full max-h-full object-contain transition-transform"
                    style={{ transform: `scale(${zoom}) rotate(${rotation}deg)` }}
                    draggable={false}
                />
                <div className="absolute bottom-2 left-2 bg-black/60 text-white text-xs px-2 py-0.5 rounded">
                    {img.name} — {index + 1} / {IMAGES.length}
                </div>
            </div>

            {/* Toolbar */}
            <div className="bg-[#ece9d8] border-t border-gray-400 p-2 flex items-center justify-center gap-2">
                <ToolButton onClick={prev} title="Previous">
                    <ChevronLeft size={18} />
                </ToolButton>
                <ToolButton onClick={next} title="Next">
                    <ChevronRight size={18} />
                </ToolButton>
                <div className="w-px h-6 bg-gray-400 mx-1" />
                <ToolButton onClick={() => setZoom(z => Math.min(z + 0.25, 3))} title="Zoom In">
                    <ZoomIn size={18} />
                </ToolButton>
                <ToolButton onClick={() => setZoom(z => Math.max(z - 0.25, 0.25))} title="Zoom Out">
                    <ZoomOut size={18} />
                </ToolButton>
                <ToolButton onClick={() => { setZoom(1); setRotation(0); }} title="Actual Size">
                    1:1
                </ToolButton>
                <div className="w-px h-6 bg-gray-400 mx-1" />
                <ToolButton onClick={() => setRotation(r => r + 90)} title="Rotate">
                    <RotateCw size={18} />
                </ToolButton>
                <div className="w-px h-6 bg-gray-400 mx-1" />
                <span className="text-xs">{Math.round(zoom * 100)}%</span>
            </div>
        </div>
    );
}

function ToolButton({ children, onClick, title }: { children: React.ReactNode; onClick: () => void; title: string }) {
    return (
        <button
            onClick={onClick}
            title={title}
            className="w-8 h-8 flex items-center justify-center bg-[#ece9d8] border border-transparent hover:border-gray-500 hover:bg-[#d9d6c4] active:translate-y-px"
        >
            {children}
        </button>
    );
}
