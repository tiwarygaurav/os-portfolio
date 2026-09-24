"use client";

import {
    useEffect,
    useLayoutEffect,
    useMemo,
    useRef,
    useState,
    type KeyboardEvent as ReactKeyboardEvent,
    type PointerEvent as ReactPointerEvent,
} from 'react';
import { PROFILE, SYSTEM } from '@/content';
import { useSystemStore } from '@/store/useSystemStore';
import { xpAlert } from '@/utils/dialog';
import { playSound } from '@/utils/sound';
import { taskbarHeight } from '@/utils/viewport';
import MenuBar, { type MenuDef } from '@/components/ui/MenuBar';
import {
    LEVELS,
    chord,
    cycleMark,
    minesLeft,
    neighbours,
    newGame,
    pressable,
    recordBest,
    reveal,
    tileAt,
    type BestTimes,
    type Field,
    type Game,
    type Level,
} from './minesweeper/engine';
import { CELL, PAL, TILE_IMAGES } from './minesweeper/sprites';
import { FaceButton, Led, type Mood } from './minesweeper/Header';
import { BestTimesDialog, CustomFieldDialog, HowToPlayDialog } from './minesweeper/Dialogs';

/**
 * Minesweeper, as Windows XP's winmine.exe.
 *
 * The rules live in `minesweeper/engine.ts` (pure, tested under Node); the squares, counters and
 * face are original pixel art in `minesweeper/`. This file is the window: the mouse model, the
 * clock, the menus, and a window that hugs its field the way winmine's did.
 */

/**
 * What winmine kept in the registry — the level, the custom field, Marks, Color, Sound and the best
 * times — kept here for the life of the page. Module scope, so closing and reopening the window
 * keeps them, as XP's did between runs; a reload starts afresh. Nothing is written to storage.
 */
const session: { level: Level; custom: Field; marks: boolean; color: boolean; sound: boolean; best: BestTimes } = {
    level: 'beginner',
    custom: LEVELS.beginner,
    marks: true,
    color: true,
    sound: false,
    best: {},
};

const fieldFor = (level: Level, custom: Field): Field => (level === 'custom' ? custom : LEVELS[level]);

/** How long a finger must rest on a square before it counts as a right-click. */
const LONG_PRESS_MS = 450;

/** The margin the store keeps around a newly opened window; a resized one keeps the same. */
const VIEWPORT_MARGIN = 16;

/** Mouse buttons as `PointerEvent.buttons` reports them. */
const LEFT = 1;
const RIGHT = 2;
const MIDDLE = 4;

/**
 * A mouse press on the field, from the first button down to the last button up.
 *
 * Browsers report a second button pressed during a press as a `pointermove` with new `buttons`,
 * not as another `pointerdown`, so the press tracks the button set itself. `chord` becomes true
 * once both buttons (or the middle one, or Shift) are involved; `done` once a release has acted,
 * so letting go of the other button afterwards does nothing — as in winmine.
 */
interface MousePress {
    kind: 'mouse';
    id: number;
    buttons: number;
    chord: boolean;
    done: boolean;
    cell: number | null;
}

/** A finger on the field: a tap uncovers (or chords a number), a long press flags. */
interface TouchPress {
    kind: 'touch';
    id: number;
    cell: number | null;
    origin: number | null;
    timer: ReturnType<typeof setTimeout> | null;
    /** The long press fired, so lifting the finger must not also uncover the square. */
    flagged: boolean;
}

type Press = MousePress | TouchPress;

/** The sunken look under a held press: one square, or the 3x3 block of a chord. */
interface Preview {
    cell: number | null;
    chord: boolean;
}

type DialogKind = 'custom' | 'best' | 'help';

interface Clock {
    /** Milliseconds played before the current stretch, which began at `since`. */
    banked: number;
    since: number;
    running: boolean;
    /** The value on the LED, so a tick only sounds when it changes. */
    shown: number;
}

/**
 * winmine's clock reads 1 the instant the first square is uncovered and counts whole seconds from
 * there, stopping at 999. The time a win records is the time on the display.
 */
const clockSeconds = (c: Clock) =>
    Math.min(999, 1 + Math.floor((c.banked + (c.running ? performance.now() - c.since : 0)) / 1000));

export default function MinesweeperApp({ windowId }: { windowId?: string; payload?: Record<string, string> }) {
    const active = useSystemStore((s) => s.activeWindowId === windowId);
    const closeWindow = useSystemStore((s) => s.actions.closeWindow);
    const resizeWindow = useSystemStore((s) => s.actions.resizeWindow);
    const moveWindow = useSystemStore((s) => s.actions.moveWindow);
    const maximized = useSystemStore((s) => s.windows.find((w) => w.id === windowId)?.isMaximized ?? false);
    const minimized = useSystemStore((s) => s.windows.find((w) => w.id === windowId)?.isMinimized ?? false);

    const [level, setLevel] = useState<Level>(session.level);
    const [custom, setCustom] = useState<Field>(session.custom);
    const [marks, setMarks] = useState(session.marks);
    const [color, setColor] = useState(session.color);
    const [sound, setSound] = useState(session.sound);
    const [best, setBest] = useState<BestTimes>(session.best);
    const [game, setGame] = useState<Game>(() => newGame(fieldFor(session.level, session.custom)));
    const [seconds, setSeconds] = useState(0);
    const [preview, setPreview] = useState<Preview | null>(null);
    const [dialog, setDialog] = useState<DialogKind | null>(null);
    const [box, setBox] = useState({ areaW: 0, areaH: 0, panelW: 0, panelH: 0, rootH: 0 });
    const [capped, setCapped] = useState(false);

    const rootRef = useRef<HTMLDivElement>(null);
    const areaRef = useRef<HTMLDivElement>(null);
    const panelRef = useRef<HTMLDivElement>(null);
    const gridRef = useRef<HTMLDivElement>(null);
    // Pointer events can arrive twice before React re-renders; handlers read and write the game here.
    const gameRef = useRef(game);
    const pressRef = useRef<Press | null>(null);
    const clockRef = useRef<Clock>({ banked: 0, since: 0, running: false, shown: 0 });
    const chromeRef = useRef<{ w: number; h: number } | null>(null);
    // Latest settings for callbacks that outlive a render (the clock, the long-press timer).
    const live = useRef({ marks, sound, level });
    live.current = { marks, sound, level };

    // ---- the game --------------------------------------------------------------------------------

    /** Apply a move, and whatever it set off: the clock, a sound, a best time. */
    const commit = (next: Game) => {
        const prev = gameRef.current;
        if (next === prev) return;
        gameRef.current = next;
        setGame(next);
        const c = clockRef.current;
        if (prev.status === 'ready' && next.status !== 'ready') {
            c.banked = 0;
            c.shown = 1;
            setSeconds(1);
        }
        if (next.status === 'lost' && prev.status !== 'lost') {
            if (live.current.sound) playSound('error');
        }
        if (next.status === 'won' && prev.status !== 'won') {
            const final = clockSeconds(c);
            c.shown = final;
            setSeconds(final);
            if (live.current.sound) playSound('tada');
            const result = recordBest(session.best, live.current.level, final);
            if (result.improved) {
                session.best = result.best;
                setBest(result.best);
                // XP asked for a name here and then showed the table; this shows the table.
                setDialog('best');
            }
        }
    };

    const cancelPress = () => {
        const p = pressRef.current;
        if (p?.kind === 'touch' && p.timer) clearTimeout(p.timer);
        pressRef.current = null;
        setPreview(null);
    };

    const restart = (field: Field) => {
        cancelPress();
        const c = clockRef.current;
        c.banked = 0;
        c.shown = 0;
        const g = newGame(field);
        gameRef.current = g;
        setGame(g);
        setSeconds(0);
    };

    const chooseLevel = (next: Level, customField?: Field) => {
        const nextCustom = next === 'custom' && customField ? customField : custom;
        session.level = next;
        session.custom = nextCustom;
        setLevel(next);
        setCustom(nextCustom);
        restart(fieldFor(next, nextCustom));
    };

    // ---- the clock -------------------------------------------------------------------------------
    // Runs while a game is in play and the window is on screen. winmine paused its clock while
    // minimised, so a game left in the taskbar does not run up a time nobody played.
    useEffect(() => {
        if (game.status !== 'playing' || minimized) return;
        const c = clockRef.current;
        c.since = performance.now();
        c.running = true;
        let timer: ReturnType<typeof setTimeout> | undefined;
        const schedule = () => {
            const ms = c.banked + performance.now() - c.since;
            timer = setTimeout(tick, 1000 - (ms % 1000) + 5);
        };
        const tick = () => {
            const s = clockSeconds(c);
            if (s !== c.shown) {
                c.shown = s;
                setSeconds(s);
                if (live.current.sound) playSound('click');
            }
            if (s < 999) schedule();
        };
        schedule();
        return () => {
            if (timer !== undefined) clearTimeout(timer);
            c.banked += performance.now() - c.since;
            c.running = false;
        };
    }, [game.status, minimized]);

    // A pending long-press timer must not outlive the window.
    useEffect(
        () => () => {
            const p = pressRef.current;
            if (p?.kind === 'touch' && p.timer) clearTimeout(p.timer);
        },
        [],
    );

    // ---- fitting the window to the field ---------------------------------------------------------

    // Sizes for scaling and for the help pane. Layout sizes, so a transform never feeds back in;
    // a zero size means the window is minimised, and the last good one is kept.
    useLayoutEffect(() => {
        const root = rootRef.current;
        const area = areaRef.current;
        const panel = panelRef.current;
        if (!root || !area || !panel) return;
        const measure = () => {
            if (root.clientWidth === 0) return;
            const next = { areaW: area.clientWidth, areaH: area.clientHeight, panelW: panel.offsetWidth, panelH: panel.offsetHeight, rootH: root.clientHeight };
            setBox((b) =>
                b.areaW === next.areaW && b.areaH === next.areaH && b.panelW === next.panelW && b.panelH === next.panelH && b.rootH === next.rootH
                    ? b
                    : next,
            );
        };
        measure();
        const ro = new ResizeObserver(measure);
        ro.observe(root);
        ro.observe(area);
        ro.observe(panel);
        return () => ro.disconnect();
    }, []);

    /*
     * winmine's window was exactly as big as its field, and changing the level resized it. Here the
     * field is measured as laid out, the window's frame is measured rather than assumed — the
     * store's size less this body's size, taken once while the two are known to agree — and the
     * window is resized to the sum. Like winmine, a window pushed past the screen edge by a bigger
     * field is pulled back on.
     *
     * A maximised window (always, on a phone) is not resized: the field is centred in it instead,
     * and scaled down if it does not fit.
     */
    useLayoutEffect(() => {
        if (!windowId || maximized || minimized) return;
        const root = rootRef.current;
        const area = areaRef.current;
        const panel = panelRef.current;
        if (!root || !area || !panel || root.clientWidth === 0) return;
        const win = useSystemStore.getState().windows.find((w) => w.id === windowId);
        if (!win || win.isMaximized) return;

        // Measured on the first pass only: after a resize the store runs a render ahead of the
        // frame, and the difference between them would not be the chrome.
        if (!chromeRef.current) chromeRef.current = { w: win.size.width - root.clientWidth, h: win.size.height - root.clientHeight };
        const chrome = chromeRef.current;
        const menu = root.clientHeight - area.clientHeight;
        const want = { width: panel.offsetWidth + chrome.w, height: panel.offsetHeight + menu + chrome.h };
        const room = {
            width: window.innerWidth - VIEWPORT_MARGIN,
            height: window.innerHeight - taskbarHeight() - VIEWPORT_MARGIN,
        };
        const size = { width: Math.min(want.width, room.width), height: Math.min(want.height, room.height) };
        setCapped(size.width < want.width || size.height < want.height);
        if (size.width !== win.size.width || size.height !== win.size.height) resizeWindow(windowId, size);

        const pos = {
            x: Math.max(0, Math.min(win.position.x, window.innerWidth - size.width)),
            y: Math.max(0, Math.min(win.position.y, window.innerHeight - taskbarHeight() - size.height)),
        };
        if (pos.x !== win.position.x || pos.y !== win.position.y) moveWindow(windowId, pos);
    }, [windowId, game.rows, game.cols, maximized, minimized, resizeWindow, moveWindow]);

    /*
     * 1 whenever the window hugs the field. Otherwise the field is fitted to the space: scaled down
     * when it does not fit, and in a maximised window — a phone — scaled up to at most twice size,
     * because a 16px square is too small a target for a finger. The squares are SVG, so a larger
     * field stays sharp.
     */
    const fit = box.panelW > 0 && box.panelH > 0 ? Math.min(box.areaW / box.panelW, box.areaH / box.panelH) : 1;
    const scale = maximized ? Math.min(2, fit) : capped ? Math.min(1, fit) : 1;

    // Take the keyboard when the window becomes the active one, so F2 works straight away.
    useEffect(() => {
        const root = rootRef.current;
        if (active && root && !root.contains(document.activeElement)) root.focus({ preventScroll: true });
    }, [active]);

    // ---- the mouse, the finger -------------------------------------------------------------------

    /** The square under a point, through any scaling; null off the field. */
    const cellAt = (x: number, y: number): number | null => {
        const grid = gridRef.current;
        if (!grid) return null;
        const g = gameRef.current;
        const r = grid.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) return null;
        const col = Math.floor(((x - r.left) / r.width) * g.cols);
        const row = Math.floor(((y - r.top) / r.height) * g.rows);
        if (col < 0 || col >= g.cols || row < 0 || row >= g.rows) return null;
        return row * g.cols + col;
    };

    const isRevealed = (cell: number | null) => cell !== null && gameRef.current.cells[cell]?.state === 'revealed';

    /** Show what a press would act on. Only a left or middle button sinks squares; a right one never. */
    const show = (p: Press) => {
        let next: Preview | null = null;
        if (p.kind === 'mouse') {
            if (!p.done && p.buttons & (LEFT | MIDDLE)) next = { cell: p.cell, chord: p.chord };
        } else if (!p.flagged) {
            next = { cell: p.cell, chord: isRevealed(p.cell) };
        }
        setPreview((cur) => (cur && next && cur.cell === next.cell && cur.chord === next.chord ? cur : next));
    };

    /** The button set changed. The first release acts; anything after it in the same press does not. */
    const buttonsChanged = (p: MousePress, now: number) => {
        const before = p.buttons;
        p.buttons = now;
        if (p.done) return;
        const added = now & ~before;
        const released = before & ~now;
        if (added && ((now & (LEFT | RIGHT)) === (LEFT | RIGHT) || added & MIDDLE)) p.chord = true;
        if (!released) return;
        p.done = true;
        if (p.cell === null) return;
        const g = gameRef.current;
        if (p.chord) commit(chord(g, p.cell));
        else if (released & LEFT) commit(reveal(g, p.cell));
    };

    const longPress = (p: TouchPress) => {
        if (pressRef.current !== p) return;
        p.timer = null;
        const g = gameRef.current;
        if (p.cell === null || p.cell !== p.origin || isRevealed(p.cell)) return;
        p.flagged = true;
        commit(cycleMark(g, p.cell, live.current.marks));
        show(p);
    };

    const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
        const g = gameRef.current;
        if (g.status === 'won' || g.status === 'lost' || pressRef.current) return;
        if (e.pointerType !== 'touch' && e.button > 2) return;
        // No text selection, no middle-button autoscroll, no touch panning: the press is ours.
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);
        const cell = cellAt(e.clientX, e.clientY);

        if (e.pointerType === 'touch') {
            const p: TouchPress = { kind: 'touch', id: e.pointerId, cell, origin: cell, timer: null, flagged: false };
            p.timer = setTimeout(() => longPress(p), LONG_PRESS_MS);
            pressRef.current = p;
            show(p);
            return;
        }

        const p: MousePress = {
            kind: 'mouse',
            id: e.pointerId,
            buttons: e.buttons,
            chord: e.button === 1 || (e.button === 0 && (e.shiftKey || (e.buttons & RIGHT) !== 0)),
            done: false,
            cell,
        };
        pressRef.current = p;
        // winmine flagged on the right button going down, not on its release.
        if (e.button === 2 && cell !== null) commit(cycleMark(g, cell, live.current.marks));
        show(p);
    };

    const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
        const p = pressRef.current;
        if (!p || p.id !== e.pointerId) return;
        const cell = cellAt(e.clientX, e.clientY);
        if (p.kind === 'touch') {
            // Sliding to another square turns a long press back into a tap there.
            if (cell !== p.origin && p.timer) {
                clearTimeout(p.timer);
                p.timer = null;
            }
            p.cell = cell;
        } else {
            p.cell = cell;
            if (e.buttons !== p.buttons) buttonsChanged(p, e.buttons);
        }
        show(p);
    };

    const onPointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
        const p = pressRef.current;
        if (!p || p.id !== e.pointerId) return;
        pressRef.current = null;
        setPreview(null);
        const cell = cellAt(e.clientX, e.clientY);
        if (p.kind === 'touch') {
            if (p.timer) clearTimeout(p.timer);
            if (p.flagged || cell === null) return;
            const g = gameRef.current;
            commit(isRevealed(cell) ? chord(g, cell) : reveal(g, cell));
            return;
        }
        p.cell = cell;
        buttonsChanged(p, 0);
    };

    const onPointerAbort = (e: ReactPointerEvent<HTMLDivElement>) => {
        if (pressRef.current?.id === e.pointerId) cancelPress();
    };

    // ---- keyboard, menus, dialogs ----------------------------------------------------------------

    const onKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
        if (e.key === 'F2' && !e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
            e.preventDefault();
            e.stopPropagation();
            restart(gameRef.current);
        }
    };

    const closeDialog = () => {
        setDialog(null);
        rootRef.current?.focus({ preventScroll: true });
    };

    const toggle = (key: 'marks' | 'color' | 'sound', value: boolean, set: (v: boolean) => void) => {
        session[key] = value;
        set(value);
    };

    const menus: MenuDef[] = [
        {
            label: 'Game',
            items: [
                { label: 'New', shortcut: 'F2', onSelect: () => restart(gameRef.current) },
                null,
                { label: 'Beginner', radio: true, checked: level === 'beginner', onSelect: () => chooseLevel('beginner') },
                { label: 'Intermediate', radio: true, checked: level === 'intermediate', onSelect: () => chooseLevel('intermediate') },
                { label: 'Expert', radio: true, checked: level === 'expert', onSelect: () => chooseLevel('expert') },
                { label: 'Custom...', radio: true, checked: level === 'custom', onSelect: () => setDialog('custom') },
                null,
                { label: 'Marks (?)', checked: marks, onSelect: () => toggle('marks', !marks, setMarks) },
                { label: 'Color', accessKey: 'l', checked: color, onSelect: () => toggle('color', !color, setColor) },
                { label: 'Sound', checked: sound, onSelect: () => toggle('sound', !sound, setSound) },
                null,
                { label: 'Best Times...', accessKey: 't', onSelect: () => setDialog('best') },
                null,
                {
                    label: 'Exit',
                    accessKey: 'x',
                    onSelect: () => {
                        if (windowId) closeWindow(windowId);
                    },
                },
            ],
        },
        {
            label: 'Help',
            items: [
                { label: 'How to Play...', onSelect: () => setDialog('help') },
                null,
                {
                    label: 'About Minesweeper',
                    onSelect: () => void xpAlert('About Minesweeper', ['Minesweeper', SYSTEM.name, PROFILE.name]),
                },
            ],
        },
    ];

    // ---- rendering ---------------------------------------------------------------------------------

    const sunk = useMemo(() => {
        const out = new Set<number>();
        if (!preview || preview.cell === null) return out;
        const cells = preview.chord ? [preview.cell, ...neighbours(game, preview.cell)] : [preview.cell];
        for (const i of cells) if (pressable(game, i)) out.add(i);
        return out;
    }, [preview, game]);

    const mood: Mood = game.status === 'won' ? 'cool' : game.status === 'lost' ? 'dead' : preview ? 'oh' : 'smile';
    const mono = !color;
    const raised = `${PAL.light} ${PAL.shadow} ${PAL.shadow} ${PAL.light}`;
    const sunken = `${PAL.shadow} ${PAL.light} ${PAL.light} ${PAL.shadow}`;

    return (
        <div
            ref={rootRef}
            tabIndex={-1}
            onKeyDown={onKeyDown}
            onPointerDownCapture={() => {
                if (!dialog) rootRef.current?.focus({ preventScroll: true });
            }}
            // winmine had no context menu anywhere; the right button belongs to the game.
            onContextMenu={(e) => e.preventDefault()}
            className="xp-face relative flex h-full select-none flex-col outline-none"
        >
            <MenuBar menus={menus} active={active} />

            <div
                ref={areaRef}
                className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden"
                style={{ background: PAL.face }}
            >
                <div
                    ref={panelRef}
                    className="shrink-0"
                    style={{
                        background: PAL.face,
                        borderStyle: 'solid',
                        borderWidth: 3,
                        borderColor: raised,
                        padding: 6,
                        // Color off: winmine's monochrome look.
                        filter: mono ? 'grayscale(1)' : undefined,
                        transform: scale !== 1 ? `scale(${scale})` : undefined,
                    }}
                >
                    <div
                        className="flex items-center justify-between"
                        style={{ height: 37, padding: '0 5px', borderStyle: 'solid', borderWidth: 2, borderColor: sunken }}
                    >
                        <Led value={minesLeft(game)} mono={mono} label="Mines left" />
                        <FaceButton mood={mood} onNewGame={() => restart(gameRef.current)} />
                        <Led value={seconds} mono={mono} label="Seconds" />
                    </div>

                    <div style={{ marginTop: 6, borderStyle: 'solid', borderWidth: 3, borderColor: sunken }}>
                        <div
                            ref={gridRef}
                            role="img"
                            aria-label={`Minefield, ${game.rows} by ${game.cols}, ${game.mines} mines`}
                            data-status={game.status}
                            data-rows={game.rows}
                            data-cols={game.cols}
                            onPointerDown={onPointerDown}
                            onPointerMove={onPointerMove}
                            onPointerUp={onPointerUp}
                            onPointerCancel={onPointerAbort}
                            onLostPointerCapture={onPointerAbort}
                            onMouseDown={(e) => {
                                // Belt and braces for the middle button's autoscroll.
                                if (e.button === 1) e.preventDefault();
                            }}
                            style={{
                                display: 'grid',
                                gridTemplateColumns: `repeat(${game.cols}, ${CELL}px)`,
                                gridAutoRows: `${CELL}px`,
                                width: game.cols * CELL,
                                height: game.rows * CELL,
                                touchAction: 'none',
                                WebkitTouchCallout: 'none',
                            }}
                        >
                            {game.cells.map((_, i) => {
                                const tile = tileAt(game, i, sunk.has(i));
                                return (
                                    <div
                                        key={i}
                                        data-cell={`${Math.floor(i / game.cols)},${i % game.cols}`}
                                        data-tile={tile}
                                        style={{ backgroundImage: TILE_IMAGES[tile] }}
                                    />
                                );
                            })}
                        </div>
                    </div>
                </div>
            </div>

            {dialog === 'custom' && (
                <CustomFieldDialog
                    field={game}
                    onCancel={closeDialog}
                    onApply={(field) => {
                        closeDialog();
                        chooseLevel('custom', field);
                    }}
                />
            )}
            {dialog === 'best' && (
                <BestTimesDialog
                    best={best}
                    onClose={closeDialog}
                    onReset={() => {
                        session.best = {};
                        setBest({});
                    }}
                />
            )}
            {dialog === 'help' && (
                // What the dialog's frame, padding and OK row leave of the window's height.
                <HowToPlayDialog paneHeight={Math.max(72, Math.min(260, box.rootH - 112))} onClose={closeDialog} />
            )}
        </div>
    );
}
