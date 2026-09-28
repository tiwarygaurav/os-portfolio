/**
 * Waking presses. A press that wakes the screen saver or Stand By does only that: the rest of its
 * gesture must not land on whatever is underneath once the cover has gone.
 */

/** After a touch is released, the tap's click arrives as a separate event; wait this long for it. */
const TAP_CLICK_MS = 450;
/** How long a following press can still pair with the waking one into a double-click. */
const DOUBLE_CLICK_MS = 800;

export const swallow = (e: Event): void => {
    e.preventDefault();
    e.stopPropagation();
};

/**
 * Eat the rest of the gesture that began with a swallowed press — its release, and the click, context
 * menu or auxclick that release produces — so none of it lands on whatever is underneath.
 *
 * Tied to the gesture, not a clock. A fixed window let a press held longer through (Windows opens the
 * context menu on release), and swallowed the release of the *next* gesture, so a drag, resize or
 * rubber band begun straight after waking never ended.
 */
export function swallowRestOfGesture(pointerId: number | null, isMouse: boolean): void {
    const rest = ['pointerup', 'pointercancel', 'mouseup', 'touchend', 'click', 'contextmenu', 'auxclick'];
    let backstop = 0;
    const stop = () => {
        rest.forEach((t) => window.removeEventListener(t, eat, { capture: true }));
        window.clearTimeout(backstop);
    };
    const eat = (e: Event) => {
        // Another pointer's release is another gesture. (Click and contextmenu are pointer events
        // too, but their pointerId is not reliable, so only the raw ones are compared.)
        const raw = e.type === 'pointerup' || e.type === 'pointercancel';
        if (raw && pointerId !== null && (e as PointerEvent).pointerId !== pointerId) return;
        swallow(e);
        if (raw || e.type === 'touchend') {
            // A mouse's click and context menu follow its release in the same task; a tap's click
            // comes a moment later. Either way, nothing after that is this gesture.
            window.clearTimeout(backstop);
            backstop = window.setTimeout(stop, isMouse ? 0 : TAP_CLICK_MS);
        } else if (e.type === 'click' && !isMouse) {
            stop();
        }
    };
    rest.forEach((t) => window.addEventListener(t, eat, { capture: true }));
    // In case the release never comes (the pointer left the window while held).
    backstop = window.setTimeout(stop, 10_000);

    // The next press is a gesture of its own, but the browser still counts the swallowed click, so
    // a quick second press would complete a double-click and open the icon underneath.
    const eatDouble = (e: Event) => swallow(e);
    window.addEventListener('dblclick', eatDouble, { capture: true });
    window.setTimeout(() => window.removeEventListener('dblclick', eatDouble, { capture: true }), DOUBLE_CLICK_MS);
}
