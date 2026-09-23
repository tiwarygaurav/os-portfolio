"use client";

import { useSystemStore } from '@/store/useSystemStore';

/**
 * The XP sound scheme.
 *
 * XP's "Windows Default" scheme was quiet about most of what a desktop does: opening, closing and
 * minimising windows, the Start menu and task buttons made no sound at all. What it did voice was
 * the session (startup, logon, logoff, shutdown), message boxes (Ding, Exclamation, Critical
 * Stop), balloons (Notify), emptying the Recycle Bin, and Explorer's navigation click. This maps
 * the same events.
 *
 * Only `startup` is the original recording, kept by the owner's decision (CLAUDE.md §9). The rest
 * are synthesised here — additive bells and soft pads through a small generated reverb — as
 * approximations in the spirit of XP's scheme, not copies of Microsoft's files.
 */
export type SoundName =
    | 'startup'
    | 'shutdown'
    | 'logon'
    | 'logoff'
    | 'ding'
    | 'exclamation'
    | 'critical'
    | 'notify'
    | 'recycle'
    | 'navigate'
    | 'tada'
    // Names from before the XP scheme, still accepted so no caller breaks. See LEGACY.
    | 'click'
    | 'error'
    | 'open'
    | 'close'
    | 'minimize';

/** XP made no sound for window open/close/minimise; `click` is Explorer's navigation tick. */
const LEGACY: Partial<Record<SoundName, SoundName | null>> = {
    click: 'navigate',
    error: 'critical',
    open: 'navigate',
    close: null,
    minimize: null,
};

type Ctx = AudioContext;
const AudioCtor: (new () => AudioContext) | null =
    typeof window !== 'undefined'
        ? window.AudioContext || (window as unknown as { webkitAudioContext?: new () => AudioContext }).webkitAudioContext || null
        : null;

let ctx: Ctx | null = null;
let reverb: ConvolverNode | null = null;

const effectiveVolume = () => {
    try {
        const { volume, isMuted } = useSystemStore.getState();
        return isMuted ? 0 : volume;
    } catch {
        return 0.5;
    }
};

/** A generated room: stereo noise with an exponential tail. No sample files. */
function makeReverb(c: Ctx): ConvolverNode {
    const seconds = 1.6;
    const len = Math.floor(c.sampleRate * seconds);
    const buf = c.createBuffer(2, len, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
        const data = buf.getChannelData(ch);
        for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2);
    }
    const conv = c.createConvolver();
    conv.buffer = buf;
    return conv;
}

/** Output for one sound: a master gain split into a dry path and a reverb send. */
function bus(c: Ctx, level: number, wet = 0.35): GainNode {
    const master = c.createGain();
    master.gain.value = level;
    master.connect(c.destination);
    if (!reverb) {
        reverb = makeReverb(c);
        reverb.connect(c.destination);
    }
    const send = c.createGain();
    send.gain.value = wet;
    master.connect(send);
    send.connect(reverb);
    return master;
}

interface ToneOpts {
    /** Partials as [ratio, relative gain]. */
    partials?: [number, number][];
    type?: OscillatorType;
    attack?: number;
    gain?: number;
    detune?: number;
}

/** One enveloped note built from partials; higher partials die away faster, like a struck bell. */
function tone(c: Ctx, out: AudioNode, freq: number, at: number, dur: number, opts: ToneOpts = {}) {
    const { partials = [[1, 1]], type = 'sine', attack = 0.006, gain = 0.2, detune = 0 } = opts;
    for (const [ratio, rel] of partials) {
        const osc = c.createOscillator();
        const g = c.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq * ratio, at);
        osc.detune.setValueAtTime(detune, at);
        const peak = gain * rel;
        const life = dur / Math.max(1, ratio * 0.8);
        g.gain.setValueAtTime(0.0001, at);
        g.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), at + attack);
        g.gain.exponentialRampToValueAtTime(0.0001, at + attack + life);
        osc.connect(g);
        g.connect(out);
        osc.start(at);
        osc.stop(at + attack + life + 0.05);
    }
}

const BELL: [number, number][] = [[1, 1], [2, 0.42], [3, 0.2], [4.16, 0.12], [5.43, 0.06]];
const PAD: [number, number][] = [[1, 1], [2, 0.18], [3, 0.06]];

/** Shaped noise, for paper and clicks. */
function noise(c: Ctx, out: AudioNode, at: number, dur: number, opts: { freq: number; q: number; gain: number; crackle?: boolean; type?: BiquadFilterType }) {
    const len = Math.max(1, Math.floor(c.sampleRate * dur));
    const buf = c.createBuffer(1, len, c.sampleRate);
    const data = buf.getChannelData(0);
    let env = 1;
    for (let i = 0; i < len; i++) {
        // Crumpling paper is a run of tiny irregular crackles, not a steady hiss.
        if (opts.crackle && Math.random() < 0.004) env = 0.3 + Math.random() * 0.7;
        env *= opts.crackle ? 0.9993 : 1;
        data[i] = (Math.random() * 2 - 1) * env * (1 - i / len);
    }
    const src = c.createBufferSource();
    src.buffer = buf;
    const filter = c.createBiquadFilter();
    filter.type = opts.type ?? 'bandpass';
    filter.frequency.value = opts.freq;
    filter.Q.value = opts.q;
    const g = c.createGain();
    g.gain.value = opts.gain;
    src.connect(filter);
    filter.connect(g);
    g.connect(out);
    src.start(at);
}

const NOTE = {
    Eb4: 311.13, Ab4: 415.3, Bb4: 466.16, C5: 523.25, Eb5: 622.25, E5: 659.25, F5: 698.46, G5: 783.99, Ab5: 830.61, Bb5: 932.33,
    C6: 1046.5, Db6: 1108.73, Eb6: 1244.51, F6: 1396.91, Ab6: 1661.22,
};

export const playSound = (requested: SoundName): void => {
    const name = requested in LEGACY ? LEGACY[requested] : requested;
    if (!name || !AudioCtor) return;
    const vol = effectiveVolume();
    if (vol === 0) return;

    if (name === 'startup') {
        // The XP startup sample. Kept deliberately — it is the signature of the session starting.
        const audio = new Audio('/sounds/startup.mp3');
        audio.volume = vol;
        // Autoplay can still be refused; swallow it rather than throwing an unhandled rejection.
        audio.play().catch(() => { });
        return;
    }

    try {
        if (!ctx) ctx = new AudioCtor();
        if (ctx.state === 'suspended') void ctx.resume();
        const c = ctx;
        const now = c.currentTime + 0.01;

        switch (name) {
            case 'shutdown': {
                // Four notes falling, then a lift on the last: the shape of XP's shutdown.
                const out = bus(c, vol * 0.9, 0.5);
                [[NOTE.Ab5, 0], [NOTE.Eb5, 0.28], [NOTE.Ab4, 0.56], [NOTE.Bb4, 0.9]].forEach(([f, t], i) =>
                    tone(c, out, f, now + t, i === 3 ? 1.9 : 1.1, { partials: PAD, attack: 0.03, gain: 0.13 }),
                );
                break;
            }
            case 'logon': {
                const out = bus(c, vol, 0.45);
                [[NOTE.Eb5, 0], [NOTE.Bb5, 0.13], [NOTE.Eb6, 0.26]].forEach(([f, t], i) =>
                    tone(c, out, f, now + t, i === 2 ? 1.3 : 0.7, { partials: PAD, attack: 0.02, gain: 0.12 }),
                );
                break;
            }
            case 'logoff': {
                const out = bus(c, vol, 0.45);
                [[NOTE.Bb5, 0], [NOTE.Ab5, 0.15], [NOTE.Eb5, 0.3]].forEach(([f, t], i) =>
                    tone(c, out, f, now + t, i === 2 ? 1.2 : 0.6, { partials: PAD, attack: 0.02, gain: 0.12 }),
                );
                break;
            }
            case 'ding': {
                const out = bus(c, vol, 0.3);
                tone(c, out, NOTE.Eb6, now, 0.9, { partials: BELL, gain: 0.12 });
                tone(c, out, NOTE.Ab6, now + 0.01, 0.6, { partials: BELL, gain: 0.05 });
                break;
            }
            case 'exclamation': {
                const out = bus(c, vol, 0.3);
                tone(c, out, NOTE.Db6, now, 0.5, { partials: BELL, gain: 0.11 });
                tone(c, out, NOTE.F6, now + 0.11, 0.8, { partials: BELL, gain: 0.11 });
                break;
            }
            case 'critical': {
                const out = bus(c, vol, 0.25);
                [NOTE.C5, NOTE.Eb5, NOTE.Ab5].forEach((f) => tone(c, out, f, now, 0.4, { partials: PAD, type: 'triangle', gain: 0.09 }));
                [NOTE.Ab4, NOTE.C5, NOTE.F5].forEach((f) => tone(c, out, f, now + 0.16, 0.7, { partials: PAD, type: 'triangle', gain: 0.09 }));
                break;
            }
            case 'notify': {
                const out = bus(c, vol, 0.3);
                tone(c, out, NOTE.C6, now, 0.25, { partials: BELL, gain: 0.07 });
                tone(c, out, NOTE.F6, now + 0.07, 0.45, { partials: BELL, gain: 0.07 });
                break;
            }
            case 'recycle': {
                const out = bus(c, vol, 0.15);
                noise(c, out, now, 0.42, { freq: 1800, q: 0.7, gain: 0.5, crackle: true });
                noise(c, out, now + 0.05, 0.3, { freq: 4200, q: 1.2, gain: 0.25, crackle: true });
                break;
            }
            case 'navigate': {
                const out = bus(c, vol, 0);
                noise(c, out, now, 0.012, { freq: 2600, q: 0.5, gain: 0.35, type: 'highpass' });
                tone(c, out, 1800, now, 0.02, { gain: 0.04 });
                break;
            }
            case 'tada': {
                const out = bus(c, vol, 0.4);
                [NOTE.C5, NOTE.E5, NOTE.G5, NOTE.C6].forEach((f, i) =>
                    tone(c, out, f, now + i * 0.08, 0.5, { partials: BELL, gain: 0.08 }),
                );
                break;
            }
        }
    } catch {
        /* Audio is decoration; never let it break the desktop. */
    }
};
