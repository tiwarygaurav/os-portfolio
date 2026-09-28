/**
 * The Media Player's visualisations, headless: each is a `draw(ctx, w, h, frame, dt)` that reports
 * whether it still has motion to finish, which is what lets the player's animation loop stop once
 * the picture has settled. A recording stand-in for the canvas context is all they need.
 */
const test = require('node:test');
const assert = require('node:assert/strict');

const { createVisualizer, VISUALIZATIONS } = require('../../.test-out/components/apps/mediaplayer/visualizations.js');

/** A 2D context that accepts every call and remembers nothing. */
function fakeContext(w, h) {
    const canvas = { width: w, height: h };
    const noop = () => undefined;
    return new Proxy(
        { canvas, createLinearGradient: () => ({ addColorStop: noop }), createRadialGradient: () => ({ addColorStop: noop }), measureText: () => ({ width: 10 }) },
        {
            get: (target, key) => (key in target ? target[key] : noop),
            set: (target, key, value) => {
                target[key] = value;
                return true;
            },
        },
    );
}

const frameOf = (loud) => {
    const freq = new Uint8Array(1024);
    const wave = new Uint8Array(2048);
    for (let i = 0; i < wave.length; i++) wave[i] = loud ? 128 + Math.round(100 * Math.sin(i / 20)) : 128;
    if (loud) for (let i = 0; i < freq.length; i++) freq[i] = 200 - (i % 50);
    return { freq, wave, sampleRate: 44100 };
};
const track = { title: 'Lose Yourself', artist: 'Eminem' };

/** Frames of silence, 16 ms apart, until `draw` says it is done; Infinity if it never is. */
function framesToSettle(id) {
    const v = createVisualizer(id);
    const ctx = fakeContext(300, 120);
    for (let i = 0; i < 30; i++) v.draw(ctx, 300, 120, frameOf(true), 16, track);
    const quiet = frameOf(false);
    for (let n = 1; n <= 1000; n++) if (!v.draw(ctx, 300, 120, quiet, 16, track)) return n;
    return Infinity;
}

test('Scope keeps fading through half a second of silence before it stops, so no waveform is left frozen', () => {
    const n = framesToSettle('scope');
    // Each frame keeps 65% of the last: stopping at the first silent frame froze a ghost at 65%.
    assert.ok(n > 20, `stopped after ${n} silent frames`);
    assert.ok(n < 60, `still drawing after ${n} silent frames`);
});

test('every visualisation settles in silence, so the animation loop can stop', () => {
    for (const { id } of VISUALIZATIONS) {
        assert.ok(framesToSettle(id) < 400, `${id} never settles`);
    }
});
