"use client";

import { useEffect, useRef } from 'react';
import { useReducedMotion } from 'framer-motion';
import { useSystemStore } from '@/store/useSystemStore';
import { PROFILE } from '@/content';
import type { ScreenSaverId } from '@/constants/prefs';

/**
 * The screen saver: an idle timer and four canvas animations with XP's names.
 *
 * The idle timer is real — any pointer, key, wheel or touch input resets it — and the wait comes
 * from Display Properties. The animations are original code: they carry XP's names, not ports of
 * Microsoft's implementations.
 *
 * It is the one thing on the desktop that animates indefinitely, which the project's motion rule
 * otherwise forbids. That is what a screen saver *is*, and it stops on the first input. With
 * "reduce motion" set, it draws a single still frame instead.
 */

/** Input that counts as "the visitor is here". */
const ACTIVITY_EVENTS = ['pointermove', 'pointerdown', 'keydown', 'wheel', 'touchstart'] as const;

/** Input this soon after starting does not dismiss it (it is still swallowed), so the release of the
 *  Preview click, or a key already on its way, cannot close the saver the instant it opens. */
const GRACE_MS = 500;
/** After a pointer wake, keep swallowing the rest of that gesture — the tap's click, the
 *  right-click's context menu — for this long, so it cannot land on whatever is underneath. */
const SWALLOW_MS = 450;

/** Focus inside an embedded document (Paint's iframe, the resume's PDF) hides input from us. */
const focusIsEmbedded = () => {
    const el = typeof document !== 'undefined' ? document.activeElement : null;
    return !!el && ['IFRAME', 'OBJECT', 'EMBED'].includes(el.tagName);
};
/** A pointer must travel this far to dismiss; a jittery mouse should not. */
const MOVE_THRESHOLD = 6;

export default function ScreenSaver() {
    const kind = useSystemStore((s) => s.screenSaver.kind);
    const idleMinutes = useSystemStore((s) => s.screenSaver.idleMinutes);
    const active = useSystemStore((s) => s.screenSaverActive);
    const setActive = useSystemStore((s) => s.actions.setScreenSaverActive);

    // ---- idle timer ----------------------------------------------------------------------------
    useEffect(() => {
        if (kind === 'none') return;
        let last = Date.now();
        const touch = () => { last = Date.now(); };
        /*
         * Capture phase, registered before the saver's own listener: the key or click that wakes
         * the saver is stopped by it, and a bubble-phase listener here never saw that event — so
         * the idle clock was never reset and the saver came straight back within five seconds.
         * Listeners on the same target and phase all run even after stopPropagation.
         */
        ACTIVITY_EVENTS.forEach((t) => window.addEventListener(t, touch, { capture: true, passive: true }));
        const timer = window.setInterval(() => {
            const state = useSystemStore.getState();
            if (state.screenSaverActive) {
                last = Date.now();
                return;
            }
            // Drawing in Paint or scrolling the resume PDF happens inside an embedded document
            // whose events never reach this window. While one has focus, count it as activity.
            if (focusIsEmbedded()) {
                last = Date.now();
                return;
            }
            if (Date.now() - last >= idleMinutes * 60_000) setActive(true);
        }, 5_000);
        return () => {
            ACTIVITY_EVENTS.forEach((t) => window.removeEventListener(t, touch, { capture: true }));
            window.clearInterval(timer);
        };
    }, [kind, idleMinutes, setActive]);

    if (!active) return null;
    // Preview with "(None)" selected is disabled in Settings; guard anyway.
    return <Saver kind={kind === 'none' ? 'starfield' : kind} onDismiss={() => setActive(false)} />;
}

function Saver({ kind, onDismiss }: { kind: Exclude<ScreenSaverId, 'none'>; onDismiss: () => void }) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const reduceMotion = useReducedMotion();

    // ---- dismissal ----------------------------------------------------------------------------
    useEffect(() => {
        // Take focus back from an embedded document, so the waking key reaches us rather than
        // editing a drawing in Paint underneath the saver.
        if (focusIsEmbedded()) (document.activeElement as HTMLElement).blur();
        canvasRef.current?.focus();

        const started = Date.now();
        let origin: { x: number; y: number } | null = null;
        const swallow = (e: Event) => {
            e.preventDefault();
            e.stopPropagation();
        };
        /** Eat the remainder of a pointer gesture that woke the saver: its click, contextmenu, up. */
        const swallowRestOfGesture = () => {
            const rest = ['click', 'contextmenu', 'mouseup', 'pointerup', 'touchend', 'auxclick'];
            rest.forEach((t) => window.addEventListener(t, swallow, { capture: true }));
            window.setTimeout(() => rest.forEach((t) => window.removeEventListener(t, swallow, { capture: true })), SWALLOW_MS);
        };
        const dismiss = (e: Event) => {
            const isPress = e.type === 'keydown' || e.type === 'pointerdown' || e.type === 'touchstart';
            // The key or click that wakes the screen must never act on the desktop underneath —
            // including during the grace period, when it does not dismiss.
            if (isPress) swallow(e);
            if (Date.now() - started < GRACE_MS) return;
            if (e instanceof PointerEvent && e.type === 'pointermove') {
                if (!origin) { origin = { x: e.clientX, y: e.clientY }; return; }
                if (Math.hypot(e.clientX - origin.x, e.clientY - origin.y) < MOVE_THRESHOLD) return;
            }
            if (e.type === 'pointerdown' || e.type === 'touchstart') swallowRestOfGesture();
            onDismiss();
        };
        ACTIVITY_EVENTS.forEach((t) => window.addEventListener(t, dismiss, { capture: true }));
        return () => ACTIVITY_EVENTS.forEach((t) => window.removeEventListener(t, dismiss, { capture: true }));
    }, [onDismiss]);

    // ---- drawing ------------------------------------------------------------------------------
    useEffect(() => {
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext('2d');
        if (!canvas || !ctx) return;

        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const draw = RENDERERS[kind](ctx);
        /** With reduced motion: one representative frame, not a simulation run from its start. */
        const still = () => STILLS[kind](ctx, window.innerWidth, window.innerHeight, draw);
        const resize = () => {
            canvas.width = Math.floor(window.innerWidth * dpr);
            canvas.height = Math.floor(window.innerHeight * dpr);
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            ctx.fillStyle = '#000';
            ctx.fillRect(0, 0, window.innerWidth, window.innerHeight);
            // Resizing clears the canvas; with no animation loop to repaint it, redraw the still.
            if (reduceMotion) still();
        };
        resize();
        window.addEventListener('resize', resize);

        let frame = 0;
        let prev = performance.now();
        const loop = (now: number) => {
            const dt = Math.min(64, now - prev);
            prev = now;
            draw(window.innerWidth, window.innerHeight, dt);
            if (!reduceMotion) frame = requestAnimationFrame(loop);
        };
        if (!reduceMotion) frame = requestAnimationFrame(loop);

        return () => {
            cancelAnimationFrame(frame);
            window.removeEventListener('resize', resize);
        };
    }, [kind, reduceMotion]);

    return (
        <canvas
            ref={canvasRef}
            role="img"
            aria-label="Screen saver. Move the mouse or press a key to return to the desktop."
            tabIndex={-1}
            className="fixed inset-0 z-[20000] h-full w-full cursor-none bg-black outline-none"
        />
    );
}

/* ================================================================================ renderers */

type Draw = (w: number, h: number, dt: number) => void;

/**
 * Reduced-motion stills. Most savers settle into a fair picture after a short run; Marquee and the
 * logo do not (the text starts off-screen, the logo starts invisible), so they draw a composed frame.
 */
const STILLS: Record<Exclude<ScreenSaverId, 'none'>, (ctx: CanvasRenderingContext2D, w: number, h: number, draw: Draw) => void> = {
    starfield: (_ctx, w, h, draw) => { for (let i = 0; i < 90; i++) draw(w, h, 16); },
    beziers: (_ctx, w, h, draw) => { for (let i = 0; i < 90; i++) draw(w, h, 16); },
    marquee: (ctx, w, h) => {
        const text = `${PROFILE.name}  —  ${PROFILE.title}`;
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, w, h);
        ctx.font = 'bold 40px Tahoma, Verdana, sans-serif';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#fff';
        ctx.fillText(text, Math.max(8, (w - ctx.measureText(text).width) / 2), h / 2);
    },
    windowsxp: (_ctx, w, h, draw) => draw(w, h, 5_000 / 2),
};

const RENDERERS: Record<Exclude<ScreenSaverId, 'none'>, (ctx: CanvasRenderingContext2D) => Draw> = {
    starfield: starfield,
    beziers: beziers,
    marquee: marquee,
    windowsxp: windowsLogo,
};

/** Stars fly outward from the centre, faster and brighter as they approach. */
function starfield(ctx: CanvasRenderingContext2D): Draw {
    const N = 320;
    const stars = Array.from({ length: N }, () => ({ x: rand(-1, 1), y: rand(-1, 1), z: Math.random() }));
    return (w, h, dt) => {
        ctx.fillStyle = 'rgba(0,0,0,0.35)';
        ctx.fillRect(0, 0, w, h);
        const cx = w / 2;
        const cy = h / 2;
        const scale = Math.max(w, h) * 0.5;
        for (const s of stars) {
            s.z -= dt * 0.00035;
            if (s.z <= 0.02) {
                s.x = rand(-1, 1);
                s.y = rand(-1, 1);
                s.z = 1;
            }
            const px = cx + (s.x / s.z) * scale * 0.5;
            const py = cy + (s.y / s.z) * scale * 0.5;
            if (px < 0 || px > w || py < 0 || py > h) {
                s.z = 1;
                continue;
            }
            const size = Math.max(0.6, (1 - s.z) * 2.6);
            const light = Math.floor(120 + (1 - s.z) * 135);
            ctx.fillStyle = `rgb(${light},${light},${light})`;
            ctx.fillRect(px, py, size, size);
        }
    };
}

/** Coloured Bezier curves whose control points drift and bounce, leaving fading trails. */
function beziers(ctx: CanvasRenderingContext2D): Draw {
    const pts = Array.from({ length: 4 }, () => ({
        x: rand(0, window.innerWidth),
        y: rand(0, window.innerHeight),
        vx: rand(-0.18, 0.18),
        vy: rand(-0.18, 0.18),
    }));
    let hue = rand(0, 360);
    return (w, h, dt) => {
        ctx.fillStyle = 'rgba(0,0,0,0.06)';
        ctx.fillRect(0, 0, w, h);
        for (const p of pts) {
            p.x += p.vx * dt;
            p.y += p.vy * dt;
            // Clamp as well as bounce: after the screen shrinks a point can be far outside, and
            // flipping the direction every frame would pin it there, jittering off-screen forever.
            if (p.x < 0) { p.x = 0; p.vx = Math.abs(p.vx); } else if (p.x > w) { p.x = w; p.vx = -Math.abs(p.vx); }
            if (p.y < 0) { p.y = 0; p.vy = Math.abs(p.vy); } else if (p.y > h) { p.y = h; p.vy = -Math.abs(p.vy); }
        }
        hue = (hue + dt * 0.02) % 360;
        ctx.strokeStyle = `hsl(${hue},90%,60%)`;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(pts[0].x, pts[0].y);
        ctx.bezierCurveTo(pts[1].x, pts[1].y, pts[2].x, pts[2].y, pts[3].x, pts[3].y);
        ctx.stroke();
    };
}

/** The owner's name and title scrolling across, on a random line each pass — XP's Marquee. */
function marquee(ctx: CanvasRenderingContext2D): Draw {
    const text = `${PROFILE.name}  —  ${PROFILE.title}`;
    let x = window.innerWidth;
    let y = rand(80, Math.max(120, window.innerHeight - 80));
    return (w, h, dt) => {
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, w, h);
        ctx.font = 'bold 40px Tahoma, Verdana, sans-serif';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#ffffff';
        ctx.fillText(text, x, y);
        x -= dt * 0.15;
        if (x < -ctx.measureText(text).width) {
            x = w;
            y = rand(80, Math.max(120, h - 80));
        }
    };
}

/** The four-pane flag from the boot screen, fading in and out at a new place each time. */
function windowsLogo(ctx: CanvasRenderingContext2D): Draw {
    const PANES = ['#f25c19', '#83bb22', '#00a3e8', '#fdbd10'];
    const CYCLE = 5_000;
    let t = 0;
    let pos = { x: rand(0.2, 0.8), y: rand(0.2, 0.8) };
    return (w, h, dt) => {
        t += dt;
        if (t > CYCLE) {
            t = 0;
            pos = { x: rand(0.2, 0.8), y: rand(0.2, 0.8) };
        }
        // Fade in for the first quarter, hold, fade out for the last quarter.
        const phase = t / CYCLE;
        const alpha = phase < 0.25 ? phase / 0.25 : phase > 0.75 ? (1 - phase) / 0.25 : 1;

        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, w, h);
        ctx.save();
        ctx.globalAlpha = alpha;
        const size = Math.min(w, h) * 0.07;
        const gap = size * 0.12;
        const ox = pos.x * w - size - gap / 2;
        const oy = pos.y * h - size - gap / 2;
        ctx.translate(ox + size, oy + size);
        ctx.rotate(-0.1);
        ctx.translate(-(ox + size), -(oy + size));
        PANES.forEach((colour, i) => {
            ctx.fillStyle = colour;
            const col = i % 2;
            const row = Math.floor(i / 2);
            roundRect(ctx, ox + col * (size + gap), oy + row * (size + gap), size, size, size * 0.18);
        });
        ctx.restore();

        ctx.save();
        ctx.globalAlpha = alpha;
        const textX = ox + size * 2 + gap + size * 0.45;
        ctx.fillStyle = '#fff';
        ctx.font = `bold ${Math.round(size * 0.9)}px Arial, sans-serif`;
        ctx.textBaseline = 'middle';
        ctx.fillText('Windows', textX, oy + size + gap / 2);
        const wordWidth = ctx.measureText('Windows').width;
        ctx.fillStyle = '#f25c19';
        ctx.font = `italic ${Math.round(size * 0.55)}px Arial, sans-serif`;
        ctx.fillText('xp', textX + wordWidth + size * 0.08, oy + size * 0.55);
        ctx.restore();
    };
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
    ctx.fill();
}

function rand(min: number, max: number) {
    return min + Math.random() * (max - min);
}
