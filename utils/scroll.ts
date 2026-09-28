/**
 * Bring an element into view inside its own scrolling list, and move nothing else.
 *
 * `scrollIntoView()` and a plain `focus()` scroll every ancestor that can scroll, and a box with
 * `overflow: hidden` can still be scrolled by script. The desktop and each window's frame are such
 * boxes, so selecting a module in System Information, or focusing an item in Explorer, in a window
 * that sat low on the screen shifted the whole window up inside its frame and pushed its title bar
 * out of reach. These move only the nearest ancestor that is a real scrolling list (`overflow` auto
 * or scroll), which is what XP's list views did.
 */

const scrolls = (el: Element) => {
    const s = getComputedStyle(el);
    return /(auto|scroll)/.test(`${s.overflowY} ${s.overflowX}`);
};

/** The nearest ancestor of `el` that is a scrolling list, or null. */
export function scrollParentOf(el: Element): HTMLElement | null {
    for (let at = el.parentElement; at && at !== document.body; at = at.parentElement) {
        if (scrolls(at)) return at;
    }
    return null;
}

/** One axis of 'nearest': the change in scroll that shows [start, end] inside [min, max]. */
const nearest = (start: number, end: number, min: number, max: number) => {
    if (start < min) return start - min;
    // Too tall to fit: show its start rather than its end.
    if (end > max) return Math.min(end - max, start - min);
    return 0;
};

/** Scroll `el`'s own list so all of `el` shows, if it can, and nothing else. */
export function revealInList(el: HTMLElement): void {
    const list = scrollParentOf(el);
    if (!list) return;
    const box = list.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    // A sticky header covers the top of the list: a table's `thead` (System Information), or a row
    // marked `data-sticky-header` (Explorer's Details column headings, which are not a table).
    const header = list.querySelector<HTMLElement>('thead, [data-sticky-header]');
    const covered = header && getComputedStyle(header).position === 'sticky' ? header.getBoundingClientRect().height : 0;
    const top = box.top + list.clientTop + covered;
    const left = box.left + list.clientLeft;
    list.scrollTop += nearest(r.top, r.bottom, top, box.top + list.clientTop + list.clientHeight);
    list.scrollLeft += nearest(r.left, r.right, left, left + list.clientWidth);
}

/** Focus `el` without scrolling the page, then show it in its own list. */
export function focusInList(el: HTMLElement | null | undefined): void {
    if (!el) return;
    el.focus({ preventScroll: true });
    revealInList(el);
}
