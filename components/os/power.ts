/**
 * What happens when "shutting down" finishes.
 *
 * XP's Turn Off and Restart ran the same shutdown sequence and differed only at the very end:
 * the machine either powered off or started again. `ExitWindows` records the choice here, and
 * `app/page.tsx` reads it once the shutdown screen has played. Module state rather than store
 * state on purpose: it is a one-shot instruction between two components, never something to
 * render or persist.
 */
let restartRequested = false;

export const requestRestart = (): void => {
    restartRequested = true;
};

/** Read and clear. */
export const consumeRestart = (): boolean => {
    const r = restartRequested;
    restartRequested = false;
    return r;
};
