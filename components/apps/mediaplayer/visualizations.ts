/**
 * Media Player visualisations.
 *
 * Every one of them is driven by the track that is actually playing: the player routes its
 * `<audio>` element through a Web Audio `AnalyserNode` and hands each frame's frequency and
 * waveform data to `draw`. Nothing is simulated — pause the track and the bars fall to rest and
 * the animation stops, because there is no sound left to draw.
 *
 * The names are Windows Media Player 9's; the drawings are original code, not its presets.
 */

export type VisId = 'bars' | 'ocean' | 'fire' | 'scope' | 'art';

export const VISUALIZATIONS: { id: VisId; name: string }[] = [
    { id: 'bars', name: 'Bars and Waves: Bars' },
    { id: 'ocean', name: 'Bars and Waves: Ocean Mist' },
    { id: 'fire', name: 'Bars and Waves: Fire Storm' },
    { id: 'scope', name: 'Bars and Waves: Scope' },
    { id: 'art', name: 'Album Art' },
];

export interface AudioFrame {
    /** `getByteFrequencyData`, 0..255 per bin. All zero while nothing plays. */
    freq: Uint8Array<ArrayBuffer>;
    /** `getByteTimeDomainData`, 128 is silence. */
    wave: Uint8Array<ArrayBuffer>;
    sampleRate: number;
}

export interface TrackInfo {
    title: string;
    artist: string;
}

export interface Visualizer {
    /**
     * Draw one frame at `w` x `h` CSS pixels, `dt` milliseconds after the last. Returns whether it
     * still has motion to finish (bars falling, trails fading) once the sound has stopped.
     */
    draw(ctx: CanvasRenderingContext2D, w: number, h: number, frame: AudioFrame, dt: number, track: TrackInfo): boolean;
}

/**
 * Energy in `n` bands spaced logarithmically from 40 Hz to 14 kHz — the way ears hear pitch, so
 * the bass does not take up one bar and the treble thirty. The top stops at 14 kHz because
 * compressed audio carries almost nothing above it, and those bands would sit dead at the edge.
 */
function bands(frame: AudioFrame, n: number, out: Float32Array): Float32Array {
    const nyquist = frame.sampleRate / 2;
    const bins = frame.freq.length;
    const lo = 40;
    const hi = Math.min(14000, nyquist);
    for (let i = 0; i < n; i++) {
        const f0 = lo * Math.pow(hi / lo, i / n);
        const f1 = lo * Math.pow(hi / lo, (i + 1) / n);
        const b0 = Math.min(bins - 1, Math.floor((f0 / nyquist) * bins));
        const b1 = Math.min(bins, Math.max(b0 + 1, Math.ceil((f1 / nyquist) * bins)));
        let peak = 0;
        for (let b = b0; b < b1; b++) peak = Math.max(peak, frame.freq[b]);
        out[i] = peak / 255;
    }
    return out;
}

const silent = (frame: AudioFrame) => {
    for (let i = 0; i < frame.freq.length; i += 8) if (frame.freq[i] > 0) return false;
    return true;
};

/* ------------------------------------------------------------------ Bars */

function barsVisualizer(): Visualizer {
    let levels = new Float32Array(0);
    let peaks = new Float32Array(0);
    let holds = new Float32Array(0);
    let scratch = new Float32Array(0);
    return {
        draw(ctx, w, h, frame, dt) {
            const n = Math.max(8, Math.min(48, Math.floor(w / 11)));
            if (levels.length !== n) {
                levels = new Float32Array(n);
                peaks = new Float32Array(n);
                holds = new Float32Array(n);
                scratch = new Float32Array(n);
            }
            const target = bands(frame, n, scratch);
            const fall = dt / 700;
            let moving = false;
            for (let i = 0; i < n; i++) {
                levels[i] = Math.max(target[i], levels[i] - fall);
                if (levels[i] >= peaks[i]) {
                    peaks[i] = levels[i];
                    holds[i] = 320;
                } else if ((holds[i] -= dt) <= 0) {
                    peaks[i] = Math.max(0, peaks[i] - dt / 1400);
                }
                if (levels[i] > 0.001 || peaks[i] > 0.001) moving = true;
            }

            ctx.fillStyle = '#000';
            ctx.fillRect(0, 0, w, h);
            const gap = 2;
            const bw = (w - gap * (n + 1)) / n;
            const grad = ctx.createLinearGradient(0, h, 0, 0);
            grad.addColorStop(0, '#08206b');
            grad.addColorStop(0.55, '#1f6fe0');
            grad.addColorStop(1, '#9fe0ff');
            for (let i = 0; i < n; i++) {
                const x = gap + i * (bw + gap);
                const bh = Math.round(levels[i] * (h - 8));
                ctx.fillStyle = grad;
                ctx.fillRect(x, h - bh, bw, bh);
                if (peaks[i] <= 0.001) continue;
                const py = h - Math.round(peaks[i] * (h - 8)) - 3;
                ctx.fillStyle = '#ffffff';
                ctx.fillRect(x, Math.min(h - 3, py), bw, 2);
            }
            return moving;
        },
    };
}

/* ------------------------------------------------------------ Ocean Mist */

function oceanVisualizer(): Visualizer {
    let levels = new Float32Array(0);
    let scratch = new Float32Array(0);
    let rest = 0;
    return {
        draw(ctx, w, h, frame, dt) {
            const n = 40;
            if (levels.length !== n) {
                levels = new Float32Array(n);
                scratch = new Float32Array(n);
            }
            const target = bands(frame, n, scratch);
            for (let i = 0; i < n; i++) levels[i] += (target[i] - levels[i]) * Math.min(1, dt / 90);

            // Fade the last frame rather than clearing it: that fade is the mist.
            ctx.fillStyle = 'rgba(0, 6, 16, 0.18)';
            ctx.fillRect(0, 0, w, h);
            const mid = h / 2;
            const grad = ctx.createLinearGradient(0, 0, 0, h);
            grad.addColorStop(0, 'rgba(64, 224, 208, 0.0)');
            grad.addColorStop(0.5, 'rgba(90, 200, 255, 0.55)');
            grad.addColorStop(1, 'rgba(64, 224, 208, 0.0)');
            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.moveTo(0, mid);
            for (let x = 0; x <= w; x += 4) {
                const t = (x / w) * (n - 1);
                const i = Math.floor(t);
                const a = levels[i] ?? 0;
                const b = levels[Math.min(n - 1, i + 1)] ?? 0;
                const v = a + (b - a) * (t - i);
                ctx.lineTo(x, mid - v * mid * 0.95);
            }
            for (let x = w; x >= 0; x -= 4) {
                const t = (x / w) * (n - 1);
                const i = Math.floor(t);
                const a = levels[i] ?? 0;
                const b = levels[Math.min(n - 1, i + 1)] ?? 0;
                const v = a + (b - a) * (t - i);
                ctx.lineTo(x, mid + v * mid * 0.95);
            }
            ctx.closePath();
            ctx.fill();
            let energy = 0;
            for (let i = 0; i < n; i++) energy += levels[i];
            // Keep going until the picture has faded, then stop.
            rest = silent(frame) && energy < 0.02 ? rest + dt : 0;
            return rest < 1500;
        },
    };
}

/* ------------------------------------------------------------ Fire Storm */

function fireVisualizer(): Visualizer {
    let scratch = new Float32Array(0);
    let rest = 0;
    return {
        draw(ctx, w, h, frame, dt) {
            const n = Math.max(16, Math.floor(w / 6));
            if (scratch.length !== n) scratch = new Float32Array(n);
            const levels = bands(frame, n, scratch);
            // Lift and dim the previous frame, so each spike keeps rising as a flame.
            const lift = Math.max(1, Math.round(dt / 16) * 2);
            ctx.globalCompositeOperation = 'copy';
            ctx.drawImage(ctx.canvas, 0, 0, ctx.canvas.width, ctx.canvas.height, 0, -lift, w, h);
            ctx.globalCompositeOperation = 'source-over';
            ctx.fillStyle = 'rgba(0, 0, 0, 0.12)';
            ctx.fillRect(0, 0, w, h);
            const bw = w / n;
            for (let i = 0; i < n; i++) {
                const v = levels[i];
                if (v <= 0) continue;
                const bh = v * h * 0.45;
                const g = ctx.createLinearGradient(0, h, 0, h - bh);
                g.addColorStop(0, 'rgba(255, 255, 180, 0.95)');
                g.addColorStop(0.35, 'rgba(255, 170, 30, 0.9)');
                g.addColorStop(1, 'rgba(200, 20, 0, 0)');
                ctx.fillStyle = g;
                ctx.fillRect(i * bw, h - bh, bw + 0.5, bh);
            }
            rest = silent(frame) ? rest + dt : 0;
            return rest < 1500;
        },
    };
}

/* ----------------------------------------------------------------- Scope */

function scopeVisualizer(): Visualizer {
    return {
        draw(ctx, w, h, frame) {
            ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
            ctx.fillRect(0, 0, w, h);
            ctx.strokeStyle = '#c8ff4a';
            ctx.lineWidth = 2;
            ctx.shadowColor = '#7dff3c';
            ctx.shadowBlur = 8;
            ctx.beginPath();
            const n = frame.wave.length;
            for (let i = 0; i < n; i += 4) {
                const x = (i / (n - 1)) * w;
                const y = h / 2 + ((frame.wave[i] - 128) / 128) * (h * 0.42);
                if (i === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
            }
            ctx.stroke();
            ctx.shadowBlur = 0;
            return !silent(frame);
        },
    };
}

/* ------------------------------------------------------------- Album Art */

/**
 * No cover art ships with these tracks, so this is what WMP showed in that case: a generic note
 * and the track's own title and artist. Static — it draws once.
 */
function artVisualizer(): Visualizer {
    return {
        draw(ctx, w, h, _frame, _dt, track) {
            const g = ctx.createLinearGradient(0, 0, 0, h);
            g.addColorStop(0, '#1b3f86');
            g.addColorStop(1, '#07142e');
            ctx.fillStyle = g;
            ctx.fillRect(0, 0, w, h);
            const s = Math.min(w, h) * 0.34;
            const cx = w / 2;
            const cy = h / 2 - 12;
            ctx.fillStyle = 'rgba(160, 205, 255, 0.9)';
            // A pair of beamed quavers.
            ctx.beginPath();
            ctx.ellipse(cx - s * 0.3, cy + s * 0.32, s * 0.16, s * 0.11, -0.4, 0, Math.PI * 2);
            ctx.ellipse(cx + s * 0.28, cy + s * 0.22, s * 0.16, s * 0.11, -0.4, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillRect(cx - s * 0.17, cy - s * 0.42, s * 0.05, s * 0.74);
            ctx.fillRect(cx + s * 0.41, cy - s * 0.52, s * 0.05, s * 0.74);
            ctx.beginPath();
            ctx.moveTo(cx - s * 0.17, cy - s * 0.42);
            ctx.lineTo(cx + s * 0.46, cy - s * 0.52);
            ctx.lineTo(cx + s * 0.46, cy - s * 0.38);
            ctx.lineTo(cx - s * 0.17, cy - s * 0.28);
            ctx.closePath();
            ctx.fill();
            ctx.textAlign = 'center';
            ctx.fillStyle = '#e8f1ff';
            ctx.font = 'bold 13px Tahoma, Verdana, sans-serif';
            ctx.fillText(track.title, cx, h - 30, w - 20);
            ctx.fillStyle = '#9db8e0';
            ctx.font = '11px Tahoma, Verdana, sans-serif';
            ctx.fillText(track.artist, cx, h - 14, w - 20);
            return false;
        },
    };
}

export function createVisualizer(id: VisId): Visualizer {
    switch (id) {
        case 'bars':
            return barsVisualizer();
        case 'ocean':
            return oceanVisualizer();
        case 'fire':
            return fireVisualizer();
        case 'scope':
            return scopeVisualizer();
        case 'art':
            return artVisualizer();
    }
}
