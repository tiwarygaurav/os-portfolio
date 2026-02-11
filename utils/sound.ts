"use client";

// Simple sound synthesis to avoid large assets for now, or just placeholders.
// Ideally we would load .mp3 files. For this demo, we'll use a simple beep or check if we can skip actual audio files 
// and just set up the structure. The user asked for "Startup sound (XP-inspired)". 
// I'll create a simple synth function or just log it if no assets.
// But to impress, I should try to generate a simple oscillator sound.

const AudioContext = (typeof window !== 'undefined') ? (window.AudioContext || (window as any).webkitAudioContext) : null;

let audioCtx: AudioContext | null = null;

export const playSound = (type: 'startup' | 'shutdown' | 'click' | 'error' | 'open') => {
    if (!AudioContext) return;
    if (!audioCtx) audioCtx = new AudioContext();

    const oscillator = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(audioCtx.destination);

    const now = audioCtx.currentTime;

    switch (type) {
        case 'startup':
            // startup chord
            oscillator.type = 'sine';
            oscillator.frequency.setValueAtTime(220, now);
            oscillator.frequency.exponentialRampToValueAtTime(440, now + 0.4);
            oscillator.frequency.exponentialRampToValueAtTime(880, now + 0.8);
            gainNode.gain.setValueAtTime(0.1, now);
            gainNode.gain.exponentialRampToValueAtTime(0.01, now + 2);
            oscillator.start(now);
            oscillator.stop(now + 2);
            break;

        case 'shutdown':
            oscillator.type = 'sine';
            oscillator.frequency.setValueAtTime(440, now);
            oscillator.frequency.exponentialRampToValueAtTime(110, now + 1);
            gainNode.gain.setValueAtTime(0.1, now);
            gainNode.gain.exponentialRampToValueAtTime(0.01, now + 1);
            oscillator.start(now);
            oscillator.stop(now + 1);
            break;

        case 'click':
            oscillator.type = 'triangle';
            oscillator.frequency.setValueAtTime(800, now);
            gainNode.gain.setValueAtTime(0.05, now);
            gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
            oscillator.start(now);
            oscillator.stop(now + 0.1);
            break;

        case 'error':
            oscillator.type = 'sawtooth';
            oscillator.frequency.setValueAtTime(150, now);
            gainNode.gain.setValueAtTime(0.1, now);
            gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.3);
            oscillator.start(now);
            oscillator.stop(now + 0.3);
            break;

        case 'open':
            oscillator.type = 'sine';
            oscillator.frequency.setValueAtTime(600, now);
            oscillator.frequency.exponentialRampToValueAtTime(1200, now + 0.1);
            gainNode.gain.setValueAtTime(0.05, now);
            gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.2);
            oscillator.start(now);
            oscillator.stop(now + 0.2);
            break;
    }
};
