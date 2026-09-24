"use client";

import {
    useEffect,
    useId,
    useLayoutEffect,
    useMemo,
    useRef,
    useState,
    type KeyboardEvent as ReactKeyboardEvent,
    type MouseEvent as ReactMouseEvent,
    type PointerEvent as ReactPointerEvent,
    type ReactNode,
} from 'react';
import { useReducedMotion } from 'framer-motion';
import { PROFILE, SYSTEM } from '@/content';
import { useSystemStore } from '@/store/useSystemStore';
import { xpAlert, xpConfirm } from '@/utils/dialog';
import MenuBar, { type MenuDef } from '@/components/ui/MenuBar';
import AppDialog from '@/components/ui/AppDialog';
import { GroupBox, XPButton, XPCheckbox, XPRadio } from '@/components/ui/xp-controls';
import {
    addPoints,
    apply,
    autoPlay,
    canDrop,
    canPick,
    createDeck,
    foundation,
    newGame,
    penalize,
    pileOf,
    recyclesLeft,
    samePile,
    sendHome,
    shuffle,
    tableau,
    timeBonus,
    undo,
    STOCK,
    VEGAS_ANTE,
    type DrawCount,
    type Game,
    type PileRef,
    type Rules,
    type Scoring,
} from './solitaire/engine';
import { CARD_H, CARD_W, dropTargets, geometry, hitTest, layout, overlap, slotRect, type Placed } from './solitaire/layout';
import { BACKS, backUrl, cardCode, cardName, cssUrl, faceImage, faceUrl } from './solitaire/cards';
import { runCascade, type CascadeCard } from './solitaire/cascade';

/**
 * Solitaire — Klondike, played the way Windows XP's sol.exe played it.
 *
 * The rules live in `solitaire/engine.ts` as pure functions and the table geometry in
 * `solitaire/layout.ts`; this file is the view and the input. Every card is one absolutely
 * positioned element keyed by card id, so a move is only a change of transform and the browser
 * animates it — including the snap back from an illegal drop. A new deal changes the keys, so
 * the cards appear in place as XP's did instead of flying across the table.
 */

/** The table itself: sol.exe's felt green, and the darker line it drew round an empty pile. */
const FELT = '#008000';
const FELT_EDGE = '#004d00';
/** Movement before a press becomes a drag, in screen pixels. */
const DRAG_THRESHOLD = 3;
const DOUBLE_CLICK_MS = 500;
/**
 * A card that changes place glides there. A class rather than an inline style, so the
 * reduced-motion media query can switch it off live, without waiting for the window to reopen.
 */
const GLIDE = 'transition-transform duration-[120ms] ease-out motion-reduce:transition-none';

interface Prefs {
    draw: DrawCount;
    scoring: Scoring;
    timed: boolean;
    statusBar: boolean;
    outline: boolean;
    cumulative: boolean;
}

/** XP's defaults. Session only: nothing here is persisted. */
const DEFAULT_PREFS: Prefs = { draw: 3, scoring: 'standard', timed: true, statusBar: true, outline: false, cumulative: false };

const rulesOf = (p: Prefs): Rules => ({ draw: p.draw, scoring: p.scoring });

/** Uniform integer in [0, n) from the platform CSPRNG, rejecting the values that would bias it. */
function randomInt(n: number): number {
    const c = globalThis.crypto;
    if (!c?.getRandomValues) return Math.floor(Math.random() * n);
    const buf = new Uint32Array(1);
    const limit = Math.floor(0x100000000 / n) * n;
    do {
        c.getRandomValues(buf);
    } while (buf[0] >= limit);
    return buf[0] % n;
}

const freshDeck = () => shuffle(createDeck(), randomInt);

/** Pile names in data attributes: "stock", "waste", "f0".."f3", "t0".."t6". */
const pileKey = (ref: PileRef) => (ref.kind === 'foundation' ? `f${ref.index}` : ref.kind === 'tableau' ? `t${ref.index}` : ref.kind);

/** A press on the table, from pointerdown until it resolves into a click or a drag. */
interface Grab {
    pointerId: number;
    x0: number;
    y0: number;
    /** Board units per screen pixel, measured at the press: the board may be scaled. */
    unit: number;
    /** What was pressed; null for bare felt. */
    from: PileRef | null;
    index: number;
    /** The cards that travel if this becomes a drag — empty when the press cannot drag. */
    ids: number[];
    dragging: boolean;
}

type Phase = 'play' | 'cascade' | 'asking' | 'over';
type DialogKind = 'deck' | 'options' | 'help';

interface SolitaireAppProps {
    windowId?: string;
    payload?: Record<string, string>;
}

export default function SolitaireApp({ windowId }: SolitaireAppProps) {
    const active = useSystemStore((s) => s.activeWindowId === windowId);
    const closeWindow = useSystemStore((s) => s.actions.closeWindow);
    const reduceMotion = !!useReducedMotion();

    const [prefs, setPrefs] = useState<Prefs>(DEFAULT_PREFS);
    const [backId, setBackId] = useState(0);
    const [game, setGame] = useState<Game>(() => newGame(rulesOf(DEFAULT_PREFS), freshDeck()));
    const [dealId, setDealId] = useState(0);
    const [view, setView] = useState({ w: 0, h: 0 });
    const [drag, setDrag] = useState<{ ids: number[]; dx: number; dy: number } | null>(null);
    const [hint, setHint] = useState<string | null>(null);
    const [dialog, setDialog] = useState<DialogKind | null>(null);
    const [phase, setPhase] = useState<Phase>('play');
    const [cascade, setCascade] = useState<{ cards: CascadeCard[]; scale: number } | null>(null);
    const [running, setRunning] = useState(false);
    const [elapsed, setElapsed] = useState(0);

    const rootRef = useRef<HTMLDivElement>(null);
    const viewportRef = useRef<HTMLDivElement>(null);
    const boardRef = useRef<HTMLDivElement>(null);
    // Event handlers can fire twice before React re-renders; they read and write the game here.
    const gameRef = useRef(game);
    const prefsRef = useRef(prefs);
    prefsRef.current = prefs;
    const clockRef = useRef<{ start: number | null; end: number | null }>({ start: null, end: null });
    const penaltiesRef = useRef(0);
    const grabRef = useRef<Grab | null>(null);
    const lastClickRef = useRef<{ id: number; t: number; x: number; y: number } | null>(null);

    const geo = useMemo(() => geometry(view.w, view.h), [view.w, view.h]);
    const placed = useMemo(() => layout(game.board, geo), [game.board, geo]);
    /** Nothing is drawn or hit-tested until the table has a real size to lay out in. */
    const measured = view.w > 0;

    // ---- measuring -------------------------------------------------------------------------------
    // Layout sizes, not bounding boxes: the window's own open animation scales it, and that must
    // not leak into the table. A zero size means the window is minimised; keep the last good one.
    useLayoutEffect(() => {
        const el = viewportRef.current;
        if (!el) return;
        const measure = (w: number, h: number) => {
            if (w > 0 && h > 0) setView((v) => (v.w === w && v.h === h ? v : { w, h }));
        };
        measure(el.clientWidth, el.clientHeight);
        const ro = new ResizeObserver((entries) => {
            const box = entries[0]?.contentRect;
            if (box) measure(box.width, box.height);
        });
        ro.observe(el);
        return () => ro.disconnect();
    }, []);

    // Take the keyboard when the window becomes the active one, so F2 works straight away.
    useEffect(() => {
        const root = rootRef.current;
        if (active && root && !root.contains(document.activeElement)) root.focus({ preventScroll: true });
    }, [active]);

    // ---- the clock -------------------------------------------------------------------------------
    // Runs from the first move to the win. The penalty count advances even when the game is not
    // timed, so switching Timed game back on never charges for the time it was off.
    useEffect(() => {
        if (!running) return;
        const tick = () => {
            const { start, end } = clockRef.current;
            if (start === null || end !== null) return;
            const seconds = Math.floor((Date.now() - start) / 1000);
            setElapsed(seconds);
            const due = Math.floor(seconds / 10) - penaltiesRef.current;
            if (due <= 0) return;
            penaltiesRef.current += due;
            if (!prefsRef.current.timed) return;
            const next = penalize(gameRef.current, 2 * due);
            if (next !== gameRef.current) {
                gameRef.current = next;
                setGame(next);
            }
        };
        const timer = window.setInterval(tick, 250);
        return () => window.clearInterval(timer);
    }, [running]);

    // ---- game actions ----------------------------------------------------------------------------

    const commitGame = (next: Game) => {
        gameRef.current = next;
        setGame(next);
    };

    const deal = (rules: Rules = rulesOf(prefsRef.current)) => {
        const prev = gameRef.current;
        // Cumulative Vegas carries the running total into the next deal, less the $52 ante.
        const carry =
            rules.scoring === 'vegas' && prefsRef.current.cumulative && prev.rules.scoring === 'vegas' ? prev.score - VEGAS_ANTE : undefined;
        commitGame(newGame(rules, freshDeck(), carry));
        setDealId((d) => d + 1);
        clockRef.current = { start: null, end: null };
        penaltiesRef.current = 0;
        setRunning(false);
        setElapsed(0);
        grabRef.current = null;
        lastClickRef.current = null;
        setDrag(null);
        setCascade(null);
        setPhase('play');
    };
    const dealRef = useRef(deal);
    dealRef.current = deal;

    /**
     * The win: XP's bouncing cards, unless the visitor asked for reduced motion. framer's hook
     * reads the preference once, when the window opens, so the live media query is asked too —
     * a visitor who turns the setting on mid-game still gets no cascade.
     */
    const celebrate = (won: Game) => {
        if (reduceMotion || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
            setPhase('asking');
            return;
        }
        const cards: CascadeCard[] = [];
        for (let rank = 13; rank >= 1; rank--) {
            for (let f = 0; f < 4; f++) {
                const card = won.board.foundations[f][rank - 1];
                if (!card) continue;
                const slot = slotRect(geo, foundation(f));
                cards.push({ image: faceImage(card), x: slot.x * geo.scale, y: slot.y * geo.scale });
            }
        }
        setCascade({ cards, scale: geo.scale });
        setPhase('cascade');
    };

    /** Plays a transition. Starts the clock on the first move; stops it, and scores, on the win. */
    const act = (transition: (g: Game) => Game | null): boolean => {
        const before = gameRef.current;
        let next = transition(before);
        if (!next) return false;
        const clock = clockRef.current;
        const now = Date.now();
        if (clock.start === null) {
            clock.start = now;
            setRunning(true);
        }
        if (next.won && !before.won) {
            const seconds = Math.floor((now - clock.start) / 1000);
            clock.end = now;
            setRunning(false);
            setElapsed(seconds);
            if (prefsRef.current.timed && next.rules.scoring === 'standard') next = addPoints(next, timeBonus(seconds));
            celebrate(next);
        }
        commitGame(next);
        return true;
    };

    const takeBack = () => {
        const prev = undo(gameRef.current);
        if (!prev) return;
        // A drag in progress refers to the board being undone; let go of it rather than drop it
        // onto a different one.
        grabRef.current = null;
        setDrag(null);
        lastClickRef.current = null;
        commitGame(prev);
    };

    const endCascade = () => setPhase((p) => (p === 'cascade' ? 'asking' : p));

    // After the cascade (or straight away under reduced motion), XP asked whether to deal again.
    useEffect(() => {
        if (phase !== 'asking') return;
        let live = true;
        void xpConfirm('Game Over', ['Deal again?'], { confirmLabel: 'Yes', cancelLabel: 'No' }).then((yes) => {
            if (!live) return;
            if (yes) dealRef.current();
            else setPhase('over');
        });
        return () => {
            live = false;
        };
    }, [phase]);

    // ---- pointer input ---------------------------------------------------------------------------

    const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
        if (phase === 'cascade') {
            e.preventDefault();
            endCascade();
            return;
        }
        const board = boardRef.current;
        if (e.button !== 0 || grabRef.current || !board || !measured) return;
        e.preventDefault();
        // The board's on-screen box already includes its own scale and any transform on the
        // window, so one ratio converts screen pixels to board units.
        const box = board.getBoundingClientRect();
        const unit = box.width > 0 ? geo.width / box.width : 1;
        const hit = hitTest(placed, geo, (e.clientX - box.left) * unit, (e.clientY - box.top) * unit);
        const from = hit?.pile ?? null;
        const index = hit?.index ?? -1;
        const g = gameRef.current;
        const canDrag = !!from && from.kind !== 'stock' && canPick(g.board, from, index);
        grabRef.current = {
            pointerId: e.pointerId,
            x0: e.clientX,
            y0: e.clientY,
            unit,
            from,
            index,
            ids: canDrag && from ? pileOf(g.board, from).slice(index).map((c) => c.id) : [],
            dragging: false,
        };
        // Keep receiving the pointer when it leaves the window mid-drag. Refused for a pointer
        // that is already gone; the press then simply ends with it.
        try {
            e.currentTarget.setPointerCapture(e.pointerId);
        } catch {
            grabRef.current = null;
        }
    };

    const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
        const grab = grabRef.current;
        if (!grab || e.pointerId !== grab.pointerId) return;
        const dx = e.clientX - grab.x0;
        const dy = e.clientY - grab.y0;
        if (!grab.dragging) {
            if (!grab.ids.length || Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
            grab.dragging = true;
            lastClickRef.current = null;
        }
        setDrag({ ids: grab.ids, dx: dx * grab.unit, dy: dy * grab.unit });
    };

    /** A drag ended: land on the legal target the lead card overlaps most, or snap back. */
    const drop = (grab: Grab, dx: number, dy: number) => {
        const from = grab.from;
        const lead = placed[grab.ids[0]];
        if (!from || !lead) return;
        const board = gameRef.current.board;
        const cards = pileOf(board, from).slice(grab.index);
        const rect = { x: lead.x + dx, y: lead.y + dy, w: CARD_W, h: CARD_H };
        let best: PileRef | null = null;
        let bestArea = 0;
        for (const target of dropTargets(board, geo, placed)) {
            if (samePile(target.ref, from) || !canDrop(board, cards, target.ref)) continue;
            const area = overlap(rect, target.rect);
            if (area > bestArea) {
                bestArea = area;
                best = target.ref;
            }
        }
        const to = best;
        if (to) act((g) => apply(g, { type: 'move', from, index: grab.index, to }));
    };

    /** A press that never became a drag. */
    const click = (grab: Grab, x: number, y: number) => {
        const from = grab.from;
        if (!from) return;
        if (from.kind === 'stock') {
            lastClickRef.current = null;
            act((g) => (g.board.stock.length ? apply(g, { type: 'draw' }) : apply(g, { type: 'recycle' })));
            return;
        }
        const pile = pileOf(gameRef.current.board, from);
        const card = pile[grab.index];
        if (!card) return;
        const isTop = grab.index === pile.length - 1;
        if (from.kind === 'tableau' && !card.faceUp) {
            // XP made you click a face-down card to turn it; that click is not half a double-click.
            lastClickRef.current = null;
            const column = from.index;
            if (isTop) act((g) => apply(g, { type: 'turn', column }));
            return;
        }
        const now = performance.now();
        const last = lastClickRef.current;
        if (last && last.id === card.id && now - last.t < DOUBLE_CLICK_MS && Math.hypot(x - last.x, y - last.y) < 6) {
            lastClickRef.current = null;
            if (isTop) act((g) => sendHome(g, from));
            return;
        }
        lastClickRef.current = { id: card.id, t: now, x, y };
    };

    const onPointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
        const grab = grabRef.current;
        if (!grab || e.pointerId !== grab.pointerId) return;
        grabRef.current = null;
        if (grab.dragging) {
            setDrag(null);
            drop(grab, (e.clientX - grab.x0) * grab.unit, (e.clientY - grab.y0) * grab.unit);
        } else {
            click(grab, e.clientX, e.clientY);
        }
    };

    const cancelGrab = () => {
        grabRef.current = null;
        setDrag(null);
    };

    // Right-click anywhere on the table sends up everything that can go. Not while a press is in
    // progress: on a touch screen that is a long-press, and a held card is not a request.
    const onContextMenu = (e: ReactMouseEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.stopPropagation();
        if (phase === 'cascade') {
            endCascade();
            return;
        }
        if (grabRef.current || phase !== 'play') return;
        lastClickRef.current = null;
        act(autoPlay);
    };

    // ---- keyboard --------------------------------------------------------------------------------

    const onKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
        const handled = () => {
            e.preventDefault();
            e.stopPropagation();
        };
        if (phase === 'cascade') {
            handled();
            endCascade();
            return;
        }
        if (e.key === 'F2' && !e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
            handled();
            deal();
        } else if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 'z') {
            handled();
            takeBack();
        } else if (e.key === 'Escape' && grabRef.current?.dragging) {
            handled();
            cancelGrab();
        }
    };

    // ---- menus and dialogs ----------------------------------------------------------------------

    const closeDialog = () => {
        setDialog(null);
        // Hand the keyboard back to the table, so F2 and Ctrl+Z keep working.
        rootRef.current?.focus({ preventScroll: true });
    };

    const applyOptions = (next: Prefs) => {
        const redeal = next.draw !== prefs.draw || next.scoring !== prefs.scoring;
        prefsRef.current = next;
        setPrefs(next);
        // As in XP, a different draw or scoring rule starts a new game under it.
        if (redeal) deal(rulesOf(next));
        closeDialog();
    };

    const canUndo = game.history.length > 0 && !game.won;

    const menus: MenuDef[] = [
        {
            label: 'Game',
            items: [
                { label: 'Deal', shortcut: 'F2', onSelect: () => deal(), hint: 'Deal a new game' },
                null,
                { label: 'Undo', shortcut: 'Ctrl+Z', onSelect: takeBack, disabled: !canUndo, hint: 'Take back the last move' },
                { label: 'Deck...', accessKey: 'k', onSelect: () => setDialog('deck'), hint: 'Choose a new card back' },
                { label: 'Options...', onSelect: () => setDialog('options'), hint: 'Change the draw, scoring and display options' },
                null,
                {
                    label: 'Exit',
                    accessKey: 'x',
                    onSelect: () => {
                        if (windowId) closeWindow(windowId);
                    },
                    hint: 'Quit Solitaire',
                },
            ],
        },
        {
            label: 'Help',
            items: [
                { label: 'How to Play...', onSelect: () => setDialog('help'), hint: 'The rules, and how to play them here' },
                null,
                {
                    label: 'About Solitaire',
                    onSelect: () => void xpAlert('About Solitaire', ['Solitaire', SYSTEM.name, PROFILE.name]),
                    hint: 'Program information',
                },
            ],
        },
    ];

    // ---- rendering ---------------------------------------------------------------------------

    const dragging = drag && drag.ids.length ? drag : null;
    const follow = dragging && !prefs.outline ? dragging : null;
    const stockEmpty = game.board.stock.length === 0;
    const canRecycle = recyclesLeft(game) > 0;

    let status = '';
    if (game.rules.scoring === 'standard') status = `Score: ${game.score}`;
    if (game.rules.scoring === 'vegas') status = `Score: ${game.score < 0 ? '-' : ''}$${Math.abs(game.score)}`;
    // Non-breaking spaces: the status field is `nowrap`, which would collapse an ordinary pair.
    if (prefs.timed) status += `${status ? '\u00a0\u00a0' : ''}Time: ${elapsed}`;

    const stockSlot = slotRect(geo, STOCK);

    return (
        <div
            ref={rootRef}
            tabIndex={-1}
            onKeyDown={onKeyDown}
            onPointerDownCapture={() => {
                // Any press in the window skips the cascade — the menu bar included — as in XP.
                if (phase === 'cascade') endCascade();
                if (!dialog) rootRef.current?.focus({ preventScroll: true });
            }}
            className="xp-face relative flex h-full select-none flex-col outline-none"
        >
            <MenuBar menus={menus} active={active} onHint={setHint} />

            <div
                ref={viewportRef}
                role="region"
                aria-label="Solitaire table"
                className="relative min-h-0 flex-1 overflow-hidden"
                style={{ background: FELT, touchAction: 'none', isolation: 'isolate' }}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={cancelGrab}
                onLostPointerCapture={(e) => {
                    if (grabRef.current?.pointerId === e.pointerId) cancelGrab();
                }}
                onContextMenu={onContextMenu}
            >
                <div
                    ref={boardRef}
                    className="absolute left-0 top-0"
                    style={{
                        width: geo.width,
                        height: geo.height,
                        transform: geo.scale === 1 ? undefined : `scale(${geo.scale})`,
                        transformOrigin: '0 0',
                    }}
                >
                    {/* Empty-pile outlines. The stock's doubles as its click target once it runs out. */}
                    <div
                        data-pile="stock"
                        data-index="-1"
                        aria-label={stockEmpty ? (canRecycle ? 'Turn the waste over' : 'No passes left') : undefined}
                        className="absolute left-0 top-0 rounded-[4px] border"
                        style={{
                            width: CARD_W,
                            height: CARD_H,
                            borderColor: FELT_EDGE,
                            transform: `translate(${stockSlot.x}px, ${stockSlot.y}px)`,
                        }}
                    >
                        {stockEmpty && <StockMarker canRecycle={canRecycle} />}
                    </div>
                    {[0, 1, 2, 3].map((f) => (
                        <Slot key={`f${f}`} rect={slotRect(geo, foundation(f))} />
                    ))}
                    {[0, 1, 2, 3, 4, 5, 6].map((t) => (
                        <Slot key={`t${t}`} rect={slotRect(geo, tableau(t))} />
                    ))}

                    {measured &&
                        placed.map((p) => {
                            const { card } = p;
                            const lifted = follow ? follow.ids.indexOf(card.id) : -1;
                            const x = p.x + (lifted >= 0 && follow ? follow.dx : 0);
                            const y = p.y + (lifted >= 0 && follow ? follow.dy : 0);
                            const z = lifted >= 0 ? 1000 + lifted : p.z + (game.moved.indexOf(card.id) >= 0 ? 500 : 0);
                            return (
                                <div
                                    key={`${dealId}:${card.id}`}
                                    role="img"
                                    aria-label={card.faceUp ? cardName(card) : 'Face-down card'}
                                    data-pile={pileKey(p.pile)}
                                    data-index={p.index}
                                    data-card={card.faceUp ? cardCode(card) : undefined}
                                    // Cards under the pointer follow it exactly; everything else glides.
                                    className={`absolute left-0 top-0 ${lifted >= 0 || reduceMotion ? '' : GLIDE}`}
                                    style={{
                                        width: CARD_W,
                                        height: CARD_H,
                                        transform: `translate(${x}px, ${y}px)`,
                                        zIndex: z,
                                        backgroundImage: cssUrl(card.faceUp ? faceUrl(card) : backUrl(backId)),
                                        backgroundSize: '100% 100%',
                                    }}
                                />
                            );
                        })}

                    {dragging && prefs.outline && <DragOutline placed={placed} drag={dragging} />}
                </div>

                {cascade && (phase === 'cascade' || phase === 'asking') && (
                    <WinCascade cards={cascade.cards} scale={cascade.scale} running={phase === 'cascade'} onDone={endCascade} />
                )}
            </div>

            {prefs.statusBar && (
                <div className="xp-statusbar shrink-0">
                    <span className="xp-statusbar-field flex-1">{hint ?? ''}</span>
                    {status && <span className="xp-statusbar-field shrink-0">{status}</span>}
                </div>
            )}

            {dialog === 'deck' && (
                <DeckDialog
                    current={backId}
                    onCancel={closeDialog}
                    onChoose={(id) => {
                        setBackId(id);
                        closeDialog();
                    }}
                />
            )}
            {dialog === 'options' && <OptionsDialog prefs={prefs} onCancel={closeDialog} onApply={applyOptions} />}
            {dialog === 'help' && <HelpDialog onClose={closeDialog} />}
        </div>
    );
}

// ---- table pieces --------------------------------------------------------------------------------

function Slot({ rect }: { rect: { x: number; y: number } }) {
    return (
        <div
            aria-hidden
            className="absolute left-0 top-0 rounded-[4px] border"
            style={{ width: CARD_W, height: CARD_H, borderColor: FELT_EDGE, transform: `translate(${rect.x}px, ${rect.y}px)` }}
        />
    );
}

/** XP's mark on an empty stock: a ring while the waste can be turned over, an X once it cannot. */
function StockMarker({ canRecycle }: { canRecycle: boolean }) {
    return (
        <svg aria-hidden viewBox="0 0 71 96" className="pointer-events-none absolute inset-0 h-full w-full">
            {canRecycle ? (
                <circle cx="35.5" cy="48" r="18" fill="none" stroke="#3fcf3f" strokeWidth="7" />
            ) : (
                <path d="M21 34L50 63M50 34L21 63" stroke="#d93a2b" strokeWidth="8" strokeLinecap="round" />
            )}
        </svg>
    );
}

/** Outline dragging: the cards stay put and a dotted frame the size of the run follows the pointer. */
function DragOutline({ placed, drag }: { placed: Placed[]; drag: { ids: number[]; dx: number; dy: number } }) {
    const lead = placed[drag.ids[0]];
    const last = placed[drag.ids[drag.ids.length - 1]];
    if (!lead || !last) return null;
    return (
        <div
            aria-hidden
            className="pointer-events-none absolute left-0 top-0 rounded-[4px] border border-dotted border-black"
            style={{
                width: CARD_W,
                height: last.y - lead.y + CARD_H,
                transform: `translate(${lead.x + drag.dx}px, ${lead.y + drag.dy}px)`,
                zIndex: 2000,
                boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.55)',
            }}
        />
    );
}

/**
 * The win cascade's canvas. It stays mounted after the animation stops so the trail remains on
 * screen behind the Game Over box, as XP's did; it goes when the next game is dealt.
 */
function WinCascade({ cards, scale, running, onDone }: { cards: CascadeCard[]; scale: number; running: boolean; onDone: () => void }) {
    const ref = useRef<HTMLCanvasElement>(null);
    const onDoneRef = useRef(onDone);
    onDoneRef.current = onDone;

    useEffect(() => {
        const canvas = ref.current;
        if (!running || !canvas) return;
        let stop: (() => void) | null = null;
        let cancelled = false;
        // Decode first, so the first frames draw the cards rather than blank placeholders.
        void Promise.all(cards.map((c) => c.image.decode().catch(() => undefined))).then(() => {
            if (cancelled) return;
            stop = runCascade(canvas, { cards, cardW: CARD_W * scale, cardH: CARD_H * scale, scale, onDone: () => onDoneRef.current() });
        });
        return () => {
            cancelled = true;
            stop?.();
        };
    }, [running, cards, scale]);

    return <canvas ref={ref} aria-hidden className="absolute inset-0 z-[3000] h-full w-full" />;
}

// ---- dialogs ---------------------------------------------------------------------------------------

function DeckDialog({ current, onCancel, onChoose }: { current: number; onCancel: () => void; onChoose: (id: number) => void }) {
    const [pending, setPending] = useState(current);
    const buttons = useRef<(HTMLButtonElement | null)[]>([]);

    const select = (i: number) => {
        const next = (i + BACKS.length) % BACKS.length;
        setPending(next);
        buttons.current[next]?.focus();
    };
    const perRow = () => {
        const top = buttons.current[0]?.offsetTop;
        return Math.max(1, buttons.current.filter((b) => b && b.offsetTop === top).length);
    };

    return (
        <AppDialog title="Select Card Back" onCancel={onCancel} onOk={() => onChoose(pending)} width={420}>
            {/* XP laid the backs straight on the dialog face and marked the chosen one with the selection colour. */}
            <div role="listbox" aria-label="Card backs" className="grid grid-cols-[repeat(auto-fill,minmax(54px,1fr))] justify-items-center gap-1">
                {BACKS.map((back, i) => (
                    <button
                        key={back.name}
                        ref={(el) => {
                            buttons.current[i] = el;
                        }}
                        type="button"
                        role="option"
                        aria-selected={pending === i}
                        aria-label={back.name}
                        title={back.name}
                        data-autofocus={i === current ? '' : undefined}
                        onClick={() => setPending(i)}
                        onDoubleClick={() => onChoose(i)}
                        onKeyDown={(e) => {
                            const moves: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -perRow(), ArrowDown: perRow() };
                            if (e.key in moves) {
                                e.preventDefault();
                                select(i + moves[e.key]);
                            } else if (e.key === 'Enter') {
                                // Enter is OK, with the focused back chosen — not merely a click on it.
                                e.preventDefault();
                                onChoose(i);
                            }
                        }}
                        className="p-[3px] outline-none focus-visible:outline-1 focus-visible:outline-dotted"
                        style={{ background: pending === i ? 'var(--luna-highlight)' : undefined }}
                    >
                        <span aria-hidden className="block h-[64px] w-[47px]" style={{ backgroundImage: cssUrl(backUrl(i)), backgroundSize: '100% 100%' }} />
                    </button>
                ))}
            </div>
        </AppDialog>
    );
}

function OptionsDialog({ prefs, onCancel, onApply }: { prefs: Prefs; onCancel: () => void; onApply: (next: Prefs) => void }) {
    const [p, setP] = useState(prefs);
    const id = useId();
    const set = <K extends keyof Prefs>(key: K, value: Prefs[K]) => setP((cur) => ({ ...cur, [key]: value }));
    const redeals = p.draw !== prefs.draw || p.scoring !== prefs.scoring;

    return (
        <AppDialog title="Options" onCancel={onCancel} onOk={() => onApply(p)} width={340}>
            <div className="flex flex-wrap gap-2">
                <GroupBox label="Draw" className="min-w-[120px] flex-1">
                    <div className="flex flex-col gap-1.5 py-0.5">
                        <XPRadio name={`${id}-draw`} checked={p.draw === 1} onChange={() => set('draw', 1)} label="Draw one" />
                        <XPRadio name={`${id}-draw`} checked={p.draw === 3} onChange={() => set('draw', 3)} label="Draw three" />
                    </div>
                </GroupBox>
                <GroupBox label="Scoring" className="min-w-[120px] flex-1">
                    <div className="flex flex-col gap-1.5 py-0.5">
                        <XPRadio name={`${id}-score`} checked={p.scoring === 'standard'} onChange={() => set('scoring', 'standard')} label="Standard" />
                        <XPRadio name={`${id}-score`} checked={p.scoring === 'vegas'} onChange={() => set('scoring', 'vegas')} label="Vegas" />
                        <XPRadio name={`${id}-score`} checked={p.scoring === 'none'} onChange={() => set('scoring', 'none')} label="None" />
                    </div>
                </GroupBox>
            </div>
            <div className="mt-2.5 grid grid-cols-2 gap-x-3 gap-y-1.5 px-1">
                <XPCheckbox checked={p.timed} onChange={(v) => set('timed', v)} label="Timed game" />
                <XPCheckbox checked={p.outline} onChange={(v) => set('outline', v)} label="Outline dragging" />
                <XPCheckbox checked={p.statusBar} onChange={(v) => set('statusBar', v)} label="Status bar" />
                <XPCheckbox
                    checked={p.cumulative}
                    onChange={(v) => set('cumulative', v)}
                    label="Cumulative score"
                    disabled={p.scoring !== 'vegas'}
                />
            </div>
            {redeals && <p className="mt-2.5 px-1">Changing the draw or the scoring deals a new game.</p>}
        </AppDialog>
    );
}

function HelpSection({ title, children }: { title: string; children: ReactNode }) {
    return (
        <section>
            <h3 className="font-bold" style={{ color: 'var(--luna-groupbox-text)' }}>
                {title}
            </h3>
            <p className="mt-0.5">{children}</p>
        </section>
    );
}

function HelpDialog({ onClose }: { onClose: () => void }) {
    return (
        <AppDialog
            title="How to Play"
            onCancel={onClose}
            onOk={onClose}
            width={440}
            footer={
                <div className="mt-3 flex justify-end">
                    <XPButton data-ok isDefault onClick={onClose}>
                        OK
                    </XPButton>
                </div>
            }
        >
            {/*
              * The rules scroll inside their own read-only pane rather than scrolling the dialog, so
              * it opens at the top of the text with OK in view. (Focusing OK in a scrolling face
              * scrolled the face to the bottom.)
              */}
            <div className="xp-input max-h-[240px] overflow-y-auto">
                <div className="space-y-2 p-1.5 leading-[1.45]">
                    <HelpSection title="The goal">
                        Move all 52 cards onto the four foundations at the top right, building each one up in a single suit from Ace to
                        King.
                    </HelpSection>
                    <HelpSection title="The tableau">
                        Build the seven columns down in alternating colours: a red six on a black seven. Dragging a face-up card takes
                        every card on top of it along. Click a face-down card at the bottom of a column to turn it over. Only a King, or a
                        run headed by one, can fill an empty column.
                    </HelpSection>
                    <HelpSection title="The deck">
                        Click the deck to turn over one card, or three with Draw three (Game &gt; Options). Only the top card of the
                        turned pile can be played. When the deck runs out, click the green ring to turn the pile back over; an X means no
                        passes are left, which happens only under Vegas scoring.
                    </HelpSection>
                    <HelpSection title="Shortcuts">
                        Double-click a card to send it to a foundation. Right-click the table to send up every card that can go. F2 deals a
                        new game and Ctrl+Z takes back a move.
                    </HelpSection>
                    <HelpSection title="Scoring">
                        Standard: 10 points for every card played to a foundation, 5 for a card from the deck to the tableau and for
                        turning a card over, minus 15 for taking a card back off a foundation, and a penalty for each pass through the
                        deck. A timed game loses 2 points every 10 seconds and earns a bonus for a finish over 30 seconds. Vegas: the game
                        costs $52 and every card on a foundation pays $5.
                    </HelpSection>
                </div>
            </div>
        </AppDialog>
    );
}
