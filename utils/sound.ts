"use client";

import { useSystemStore } from '@/store/useSystemStore';

const AudioContext = (typeof window !== 'undefined') ? (window.AudioContext || (window as any).webkitAudioContext) : null;

let audioCtx: AudioContext | null = null;

const getEffectiveVolume = () => {
    try {
        const { volume, isMuted } = useSystemStore.getState();
        return isMuted ? 0 : volume;
    } catch {
        return 0.5;
    }
};

export const playSound = (type: 'startup' | 'shutdown' | 'click' | 'error' | 'open' | 'close' | 'minimize' | 'tada' | 'logoff') => {
    if (!AudioContext) return;
    const vol = getEffectiveVolume();
    if (vol === 0) return;

    try {
        if (!audioCtx) audioCtx = new AudioContext();
        if (audioCtx.state === 'suspended') audioCtx.resume();

        if (type === 'startup') {
            // The XP startup sample. Kept deliberately — it is the signature of the boot sequence.
            const audio = new Audio('/sounds/startup.mp3');
            audio.volume = vol;
            // Autoplay can still be refused; swallow it rather than throwing an unhandled rejection.
            audio.play().catch(() => { });
            return;
        }

        const oscillator = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();
        oscillator.connect(gainNode);
        gainNode.connect(audioCtx.destination);
        const now = audioCtx.currentTime;
        const g = (base: number) => base * vol;

        switch (type) {
            case 'shutdown':
                oscillator.type = 'sine';
                oscillator.frequency.setValueAtTime(440, now);
                oscillator.frequency.exponentialRampToValueAtTime(110, now + 1);
                gainNode.gain.setValueAtTime(g(0.1), now);
                gainNode.gain.exponentialRampToValueAtTime(0.0001, now + 1);
                oscillator.start(now);
                oscillator.stop(now + 1);
                break;

            case 'logoff':
                oscillator.type = 'sine';
                oscillator.frequency.setValueAtTime(660, now);
                oscillator.frequency.exponentialRampToValueAtTime(220, now + 0.6);
                gainNode.gain.setValueAtTime(g(0.08), now);
                gainNode.gain.exponentialRampToValueAtTime(0.0001, now + 0.6);
                oscillator.start(now);
                oscillator.stop(now + 0.6);
                break;

            case 'click':
                oscillator.type = 'triangle';
                oscillator.frequency.setValueAtTime(800, now);
                gainNode.gain.setValueAtTime(g(0.05), now);
                gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
                oscillator.start(now);
                oscillator.stop(now + 0.08);
                break;

            case 'error':
                oscillator.type = 'sawtooth';
                oscillator.frequency.setValueAtTime(150, now);
                gainNode.gain.setValueAtTime(g(0.1), now);
                gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
                oscillator.start(now);
                oscillator.stop(now + 0.3);
                break;

            case 'open':
                oscillator.type = 'sine';
                oscillator.frequency.setValueAtTime(600, now);
                oscillator.frequency.exponentialRampToValueAtTime(1200, now + 0.1);
                gainNode.gain.setValueAtTime(g(0.05), now);
                gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
                oscillator.start(now);
                oscillator.stop(now + 0.2);
                break;

            case 'close':
                oscillator.type = 'sine';
                oscillator.frequency.setValueAtTime(900, now);
                oscillator.frequency.exponentialRampToValueAtTime(300, now + 0.15);
                gainNode.gain.setValueAtTime(g(0.05), now);
                gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
                oscillator.start(now);
                oscillator.stop(now + 0.2);
                break;

            case 'minimize':
                oscillator.type = 'triangle';
                oscillator.frequency.setValueAtTime(500, now);
                oscillator.frequency.linearRampToValueAtTime(250, now + 0.1);
                gainNode.gain.setValueAtTime(g(0.05), now);
                gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
                oscillator.start(now);
                oscillator.stop(now + 0.15);
                break;

            case 'tada':
                [523, 659, 783, 1046].forEach((freq, i) => {
                    if (!audioCtx) return;
                    const o = audioCtx.createOscillator();
                    const g2 = audioCtx.createGain();
                    o.connect(g2);
                    g2.connect(audioCtx.destination);
                    o.type = 'sine';
                    o.frequency.setValueAtTime(freq, now + i * 0.08);
                    g2.gain.setValueAtTime(g(0.08), now + i * 0.08);
                    g2.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.08 + 0.3);
                    o.start(now + i * 0.08);
                    o.stop(now + i * 0.08 + 0.3);
                });
                break;
        }
    } catch {
        /* ignore */
    }
};
