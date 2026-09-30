/**
 * Waking presses. A press that wakes the screen saver or Stand By does only that: the rest of its
 * gesture must not land on whatever is underneath once the cover has gone.
 */

/** After a touch is released, the tap's click arrives as a separate event; wait this long for it. */
const TAP_CLICK_MS = 450;
/** Backstop for the double-click listeners, if no click ever follows the wake. */
const DOUBLE_BACKSTOP_MS = 10_000;

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
 *
 * The gesture ends with the first click after the waking pointer's release (a mouse's own click; a
 * tap's is usually suppressed by its eaten touchend), with a new press after the release (the wake
 * was a scroll or a long-press, which make no click), or with the backstop. Before the release,
 * another finger's click is eaten but does not end it, and a new press from the *same* pointer means
 * its release was lost (it left the window while held), so that ends it too. `pointerId` is null
 * when the wake came from a touch event, not a pointer event: then the first release is the wake's.
 */
export function swallowRestOfGesture(pointerId: number | null, isMouse: boolean): void {
    const rest = ['pointerup', 'pointercancel', 'mouseup', 'touchend', 'click', 'contextmenu', 'auxclick'];
    let released = false;
    let backstop = 0;
    const stop = () => {
        rest.forEach((t) => window.removeEventListener(t, eat, { capture: true }));
        window.removeEventListener('pointerdown', onPress, { capture: true });
        window.clearTimeout(backstop);
    };
    const eat = (e: Event) => {
        // Another pointer's release is another gesture. (Click and contextmenu are pointer events
        // too, but their pointerId is not reliable, so only the raw ones are compared.)
        const raw = e.type === 'pointerup' || e.type === 'pointercancel';
        if (raw && pointerId !== null && (e as PointerEvent).pointerId !== pointerId) return;
        swallow(e);
        if (!released && (raw || (pointerId === null && e.type === 'touchend'))) {
            // A mouse's click and context menu follow its release in the same task; a tap's click
            // comes a moment later.
            released = true;
            window.clearTimeout(backstop);
            backstop = window.setTimeout(stop, isMouse ? 0 : TAP_CLICK_MS);
        } else if (released && e.type === 'click') {
            stop();
        }
    };
    const onPress = (e: Event) => {
        if (released || (pointerId !== null && (e as PointerEvent).pointerId === pointerId)) stop();
    };
    rest.forEach((t) => window.addEventListener(t, eat, { capture: true }));
    window.addEventListener('pointerdown', onPress, { capture: true });
    // In case the release never comes (the pointer left the window while held).
    backstop = window.setTimeout(stop, 10_000);

    /*
     * The next press is a gesture of its own, but the browser still counts the swallowed click, so a
     * quick second press would complete a double-click with it and open the icon underneath. The
     * browser says which: the first click after the wake has detail 2 when it pairs with the waking
     * click, and 1 when the count has started again. Only a double-click completed by that first
     * click is eaten; no clock is involved.
     *
     * The cost, accepted: a double-click begun at once pairs its first click with the waking one
     * (count 2, eaten), and its second becomes count 3, which makes no double-click — so it selects
     * the icon rather than opening it.
     */
    let doubleBackstop = 0;
    const endDouble = () => {
        window.removeEventListener('click', countClick, { capture: true });
        window.removeEventListener('dblclick', eatDouble, { capture: true });
        window.clearTimeout(doubleBackstop);
    };
    const countClick = (e: Event) => {
        // The waking click itself was swallowed (and so default-prevented) just before this.
        if (e.defaultPrevented) return;
        // detail 0 is a click with no press (the keyboard, or a script), which says nothing either way.
        if ((e as MouseEvent).detail === 1) endDouble();
    };
    const eatDouble = (e: Event) => {
        swallow(e);
        endDouble();
    };
    window.addEventListener('click', countClick, { capture: true });
    window.addEventListener('dblclick', eatDouble, { capture: true });
    doubleBackstop = window.setTimeout(endDouble, DOUBLE_BACKSTOP_MS);
}
