/**
 * Desktop preferences that a visitor can change in Display Properties.
 *
 * Plain data, no React: the store persists the chosen ids, `globals.css` defines what each theme
 * looks like, and the Settings panel and the screen saver read the lists from here — so none of
 * them keeps its own copy of what exists.
 */

/**
 * The three genuine Windows XP "Luna" colour schemes. The default is Blue. The Olive Green and
 * Silver values in `app/globals.css` are approximations of the originals, written from memory of
 * the schemes rather than sampled from them.
 */
export const THEMES = [
    { id: 'blue', name: 'Windows XP style (Blue)' },
    { id: 'olive', name: 'Olive Green' },
    { id: 'silver', name: 'Silver' },
] as const;

export type ThemeId = (typeof THEMES)[number]['id'];

export const DEFAULT_THEME: ThemeId = 'blue';

export const isThemeId = (v: unknown): v is ThemeId => THEMES.some((t) => t.id === v);

/**
 * Screen savers. The names are XP's own. The implementations (`components/os/ScreenSaver.tsx`)
 * are original canvas code, not ports of the Microsoft ones.
 */
export const SCREEN_SAVERS = [
    { id: 'none', name: '(None)' },
    { id: 'starfield', name: 'Starfield' },
    { id: 'beziers', name: 'Beziers' },
    { id: 'marquee', name: 'Marquee' },
    { id: 'windowsxp', name: 'Windows XP' },
] as const;

export type ScreenSaverId = (typeof SCREEN_SAVERS)[number]['id'];

/** Idle times offered, in minutes. */
export const IDLE_MINUTES = [1, 2, 5, 10, 15] as const;

export interface ScreenSaverSettings {
    kind: ScreenSaverId;
    /** Minutes of no input before it starts. */
    idleMinutes: number;
}

export const DEFAULT_SCREEN_SAVER: ScreenSaverSettings = { kind: 'none', idleMinutes: 5 };

/** Defensive parse of whatever `localStorage` handed back, since it is user-editable. */
export function sanitizeScreenSaver(v: unknown): ScreenSaverSettings {
    if (!v || typeof v !== 'object') return DEFAULT_SCREEN_SAVER;
    const { kind, idleMinutes } = v as Partial<ScreenSaverSettings>;
    return {
        kind: SCREEN_SAVERS.some((s) => s.id === kind) ? (kind as ScreenSaverId) : DEFAULT_SCREEN_SAVER.kind,
        idleMinutes: (IDLE_MINUTES as readonly number[]).includes(idleMinutes as number)
            ? (idleMinutes as number)
            : DEFAULT_SCREEN_SAVER.idleMinutes,
    };
}
