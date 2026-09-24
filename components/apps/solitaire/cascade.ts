/**
 * The win cascade: the cards leave the foundations one at a time and bounce down the window.
 *
 * The canvas is never cleared, so every position a card has ever been drawn at stays on screen —
 * that trail is the whole effect. The physics runs in fixed 1/60 s steps fed by real elapsed
 * time, so the trail is equally dense at 30 Hz or 144 Hz and a slow frame never makes a card
 * jump. Every card moves sideways at no less than MIN_VX per step, so each one leaves through a
 * side within a bounded number of steps and the whole animation ends by itself.
 *
 * No React, and nothing global besides the canvas it is given and requestAnimationFrame.
 */

export interface CascadeCard {
    image: HTMLImageElement;
    /** Launch position, in canvas CSS pixels. */
    x: number;
    y: number;
}

export interface CascadeOptions {
    /** In launch order. */
    cards: CascadeCard[];
    cardW: number;
    cardH: number;
    /** The board's scale: speeds and gravity shrink with it, so a small board bounces the same way. */
    scale: number;
    onDone: () => void;
    random?: () => number;
}

const STEP_MS = 1000 / 60;
/** Most steps simulated per animation frame; the rest of a long stall is dropped, not replayed. */
const MAX_STEPS_PER_FRAME = 8;
const GRAVITY = 0.75;
const BOUNCE = 0.75;
const MIN_VX = 3;
const MAX_VX = 8;
const MAX_LIFT = 9;
/** Belt and braces: no card is simulated for more than 20 seconds of steps. */
const MAX_STEPS_PER_CARD = 60 * 20;

interface Flying {
    image: HTMLImageElement;
    x: number;
    y: number;
    vx: number;
    vy: number;
    steps: number;
}

/** Starts the cascade. Returns a function that stops it without calling `onDone`. */
export function runCascade(canvas: HTMLCanvasElement, options: CascadeOptions): () => void {
    const { cards, cardW, cardH, scale, onDone } = options;
    const random = options.random ?? Math.random;
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    const ctx = canvas.getContext('2d');

    let frame = 0;
    let stopped = false;
    const finish = () => {
        if (stopped) return;
        stopped = true;
        onDone();
    };

    if (!ctx || !cards.length || width <= 0 || height <= 0) {
        frame = requestAnimationFrame(finish);
        return () => {
            stopped = true;
            cancelAnimationFrame(frame);
        };
    }

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const g = GRAVITY * scale;
    const launch = (i: number): Flying => {
        const c = cards[i];
        const speed = (MIN_VX + random() * (MAX_VX - MIN_VX)) * scale;
        return { image: c.image, x: c.x, y: c.y, vx: random() < 0.5 ? -speed : speed, vy: -random() * MAX_LIFT * scale, steps: 0 };
    };

    const draw = (f: Flying) => {
        if (f.image.complete && f.image.naturalWidth > 0) {
            ctx.drawImage(f.image, f.x, f.y, cardW, cardH);
        } else {
            // Not decoded yet: a plain card keeps the trail unbroken rather than skipping a frame.
            ctx.fillStyle = '#fff';
            ctx.strokeStyle = '#000';
            ctx.fillRect(f.x, f.y, cardW, cardH);
            ctx.strokeRect(f.x + 0.5, f.y + 0.5, cardW - 1, cardH - 1);
        }
    };

    let index = 0;
    let current = launch(0);
    draw(current);

    /** One fixed step. False once the last card has left. */
    const step = (): boolean => {
        const f = current;
        f.vy += g;
        f.x += f.vx;
        f.y += f.vy;
        if (f.y + cardH > height) {
            f.y = height - cardH;
            f.vy = -f.vy * BOUNCE;
        }
        f.steps++;
        draw(f);
        if (f.x + cardW < 0 || f.x > width || f.steps > MAX_STEPS_PER_CARD) {
            index++;
            if (index >= cards.length) return false;
            current = launch(index);
            draw(current);
        }
        return true;
    };

    let last = performance.now();
    let pending = 0;
    const tick = (now: number) => {
        if (stopped) return;
        pending += now - last;
        last = now;
        let steps = 0;
        while (pending >= STEP_MS && steps < MAX_STEPS_PER_FRAME) {
            pending -= STEP_MS;
            steps++;
            if (!step()) {
                finish();
                return;
            }
        }
        if (steps === MAX_STEPS_PER_FRAME) pending = Math.min(pending, STEP_MS);
        frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);

    return () => {
        stopped = true;
        cancelAnimationFrame(frame);
    };
}
