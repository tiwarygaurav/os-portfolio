import type { Card, Suit } from './engine';

/**
 * Card art, drawn here as SVG — original designs, not Microsoft's.
 *
 * Every face and back is a string, turned into a data URL once and cached. The table paints the
 * URL as a CSS background, and the win cascade draws the same URL through an `Image`, so a card
 * looks identical on the felt and in the bouncing trail. Being vectors, they stay sharp at any
 * device pixel ratio and at any board scale.
 */

const RED = '#d40000';
const BLACK = '#000000';
const GOLD = '#e2a21b';
const GOLD_DARK = '#7a5200';
const BLUE = '#1d3f95';
const CREAM = '#fbf1d0';

const LABELS = ['', 'A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
const RANK_NAMES = ['', 'Ace', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Jack', 'Queen', 'King'];
const SUIT_NAMES = ['Clubs', 'Diamonds', 'Hearts', 'Spades'];
const SUIT_CODES = ['C', 'D', 'H', 'S'];

export const cardName = (card: Pick<Card, 'suit' | 'rank'>) => `${RANK_NAMES[card.rank]} of ${SUIT_NAMES[card.suit]}`;
/** Short code, e.g. "10H" — handy in data attributes. */
export const cardCode = (card: Pick<Card, 'suit' | 'rank'>) => `${LABELS[card.rank]}${SUIT_CODES[card.suit]}`;

const n = (v: number) => String(Math.round(v * 100) / 100);

/** Suit symbols in a 100×100 box. Several shapes per suit, so no fill rule can punch a hole. */
const PIP: Record<Suit, string> = {
    0: '<circle cx="50" cy="27" r="21"/><circle cx="27" cy="58" r="21"/><circle cx="73" cy="58" r="21"/><circle cx="50" cy="52" r="12"/><path d="M45 58C45 76 41 88 31 97H69C59 88 55 76 55 58Z"/>',
    1: '<path d="M50 2C60 20 72 36 88 50C72 64 60 80 50 98C40 80 28 64 12 50C28 36 40 20 50 2Z"/>',
    2: '<path d="M50 94C46 88 36 79 24 68C10 55 3 44 3 30C3 15 14 5 28 5C38 5 46 11 50 20C54 11 62 5 72 5C86 5 97 15 97 30C97 44 90 55 76 68C64 79 54 88 50 94Z"/>',
    3: '<path d="M50 3C58 17 72 29 84 40C94 49 98 57 98 66C98 79 88 87 76 87C67 87 59 83 54 76C55 85 59 92 67 97H33C41 92 45 85 46 76C41 83 33 87 24 87C12 87 2 79 2 66C2 57 6 49 16 40C28 29 42 17 50 3Z"/>',
};

const inkOf = (suit: Suit) => (suit === 1 || suit === 2 ? RED : BLACK);

function pip(suit: Suit, cx: number, cy: number, size: number, flip: boolean, fill = inkOf(suit)): string {
    const flipT = flip ? ' rotate(180 50 50)' : '';
    return `<g fill="${fill}" transform="translate(${n(cx - size / 2)} ${n(cy - size / 2)}) scale(${n(size / 100)})${flipT}">${PIP[suit]}</g>`;
}

// Pip grid for the number cards.
const L = 21;
const C = 35.5;
const R = 50;
const TOP = 19.5;
const MID = 48;
const BOT = 76.5;
const Q = [19.5, 38.5, 57.5, 76.5];
const SIX: [number, number][] = [[L, TOP], [R, TOP], [L, MID], [R, MID], [L, BOT], [R, BOT]];

const PIP_LAYOUT: Record<number, [number, number][]> = {
    2: [[C, TOP], [C, BOT]],
    3: [[C, TOP], [C, MID], [C, BOT]],
    4: [[L, TOP], [R, TOP], [L, BOT], [R, BOT]],
    5: [[L, TOP], [R, TOP], [C, MID], [L, BOT], [R, BOT]],
    6: SIX,
    7: [...SIX, [C, 34]],
    8: [...SIX, [C, 34], [C, 62]],
    9: [[L, Q[0]], [R, Q[0]], [L, Q[1]], [R, Q[1]], [C, MID], [L, Q[2]], [R, Q[2]], [L, Q[3]], [R, Q[3]]],
    10: [[L, Q[0]], [R, Q[0]], [C, 29], [L, Q[1]], [R, Q[1]], [L, Q[2]], [R, Q[2]], [C, 67], [L, Q[3]], [R, Q[3]]],
};

/** Pips below the middle are printed upside down, as on a real card. */
const numberBody = (suit: Suit, rank: number) =>
    PIP_LAYOUT[rank].map(([x, y]) => pip(suit, x, y, 13, y > MID)).join('');

function aceBody(suit: Suit): string {
    if (suit !== 3) return pip(suit, C, MID, 30, false);
    // The Ace of Spades is traditionally the showpiece: a larger pip inside a fine double ring.
    return `<circle cx="35.5" cy="48" r="24" fill="none" stroke="${BLACK}" stroke-width=".6"/><circle cx="35.5" cy="48" r="21.5" fill="none" stroke="${BLACK}" stroke-width=".35"/>${pip(3, C, 47, 34, false)}`;
}

/**
 * Court cards: an original heraldic panel rather than a portrait. Each half carries the rank's
 * headgear — a crown for the King, a tiara with an orb for the Queen, a plumed cap for the Jack —
 * over a shield bearing the suit, and the half is repeated upside down, double-ended like a real
 * court card.
 */
function courtBody(suit: Suit, rank: number): string {
    const ink = suit === 1 || suit === 2 ? RED : '#1b1b1b';
    let headgear: string;
    if (rank === 13) {
        headgear =
            `<path d="M24.5 22V12.5L29.8 17.5L35.5 9.5L41.2 17.5L46.5 12.5V22Z" fill="${GOLD}" stroke="${GOLD_DARK}" stroke-width=".7" stroke-linejoin="round"/>` +
            `<rect x="24.5" y="19.6" width="22" height="2.8" fill="${BLUE}"/>` +
            `<circle cx="35.5" cy="9.8" r="1.5" fill="${RED}"/><circle cx="24.5" cy="12.6" r="1.2" fill="${BLUE}"/><circle cx="46.5" cy="12.6" r="1.2" fill="${BLUE}"/>` +
            `<circle cx="30" cy="21" r=".8" fill="${GOLD}"/><circle cx="35.5" cy="21" r=".8" fill="${RED}"/><circle cx="41" cy="21" r=".8" fill="${GOLD}"/>`;
    } else if (rank === 12) {
        headgear =
            `<path d="M24.5 22V16.5Q30 10.5 35.5 16.5Q41 10.5 46.5 16.5V22Z" fill="${GOLD}" stroke="${GOLD_DARK}" stroke-width=".7" stroke-linejoin="round"/>` +
            `<rect x="24.5" y="19.6" width="22" height="2.8" fill="${BLUE}"/>` +
            `<circle cx="35.5" cy="11.6" r="2.3" fill="${GOLD}" stroke="${GOLD_DARK}" stroke-width=".6"/><path d="M35.5 6.9V9.3M34.3 8.1H36.7" stroke="${GOLD_DARK}" stroke-width=".7"/>` +
            `<circle cx="29.2" cy="15.2" r=".75" fill="#fff"/><circle cx="41.8" cy="15.2" r=".75" fill="#fff"/><circle cx="35.5" cy="21" r=".9" fill="${RED}"/>`;
    } else {
        headgear =
            `<path d="M45 16.5C47 11 50.5 8.2 53.5 8.4C51.8 10.6 50 13.6 47.2 18Z" fill="${GOLD}" stroke="${GOLD_DARK}" stroke-width=".5"/>` +
            `<path d="M24 22C24 15 28.8 12 35.5 12C42.2 12 47 15 47 22Z" fill="${ink}" stroke="${GOLD_DARK}" stroke-width=".6"/>` +
            `<rect x="24" y="19.6" width="23" height="2.8" fill="${GOLD}"/><circle cx="35.5" cy="21" r=".9" fill="${BLUE}"/>`;
    }

    const ribbon = (x: number) => {
        let s = `<rect x="${x}" y="8" width="3.4" height="40" fill="${BLUE}"/>`;
        for (let y = 9.5, i = 0; y < 46; y += 4.4, i++) {
            s += `<rect x="${n(x + 0.7)}" y="${n(y)}" width="2" height="2" fill="${i % 2 ? GOLD : ink}"/>`;
        }
        return s;
    };
    const collar = `<path d="M24.5 23.2H46.5L43.8 27.2L41 23.9L38.2 27.2L35.5 23.9L32.8 27.2L30 23.9L27.2 27.2Z" fill="${GOLD}" stroke="${GOLD_DARK}" stroke-width=".4"/>`;
    const shield =
        `<path d="M25 28.6H46V36.6C46 42.2 41.5 45.3 35.5 47C29.5 45.3 25 42.2 25 36.6Z" fill="${ink}" stroke="${GOLD}" stroke-width="1"/>` +
        pip(suit, C, 36.8, 10.5, false, '#ffffff');
    const half = `${ribbon(15.2)}${ribbon(52.4)}${headgear}${collar}${shield}`;

    return (
        `<rect x="14" y="7" width="43" height="82" rx="1.5" fill="${CREAM}" stroke="${BLUE}"/>` +
        `<g>${half}</g><g transform="rotate(180 35.5 48)">${half}</g>` +
        `<path d="M14.5 48H56.5" stroke="${BLUE}" stroke-width=".8"/>`
    );
}

const SVG_OPEN = '<svg xmlns="http://www.w3.org/2000/svg" width="71" height="96" viewBox="0 0 71 96">';
const EDGE = '<rect x=".5" y=".5" width="70" height="95" rx="4" fill="#fff" stroke="#000"/>';

/** A face as an SVG document: index top left and (rotated) bottom right, pips or a court panel. */
export function cardSvg(card: Pick<Card, 'suit' | 'rank'>): string {
    const { suit, rank } = card;
    const ink = inkOf(suit);
    const squeeze = rank === 10 ? ' textLength="10.4" lengthAdjust="spacingAndGlyphs"' : '';
    const index =
        `<text x="7" y="10.2" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-weight="bold" font-size="10.5" fill="${ink}"${squeeze}>${LABELS[rank]}</text>` +
        pip(suit, 7, 13.6, 6.4, false);
    const body = rank === 1 ? aceBody(suit) : rank <= 10 ? numberBody(suit, rank) : courtBody(suit, rank);
    return `${SVG_OPEN}${EDGE}${body}${index}<g transform="rotate(180 35.5 48)">${index}</g></svg>`;
}

// ---- backs -------------------------------------------------------------------------------------

/** The patterned panel inside the white border; every design is original. */
interface BackDesign {
    name: string;
    panel: string;
}

const P = { x: 4, y: 4, w: 63, h: 88 };
const fillPanel = (fill: string) => `<rect x="${P.x}" y="${P.y}" width="${P.w}" height="${P.h}" fill="${fill}"/>`;
const pattern = (w: number, h: number, body: string, transform = '') =>
    `<defs><pattern id="p" width="${w}" height="${h}" patternUnits="userSpaceOnUse"${transform ? ` patternTransform="${transform}"` : ''}>${body}</pattern></defs>`;
const frame = (stroke: string, inset = 3) =>
    `<rect x="${P.x + inset}" y="${P.y + inset}" width="${P.w - inset * 2}" height="${P.h - inset * 2}" rx="1" fill="none" stroke="${stroke}" stroke-width="1"/>`;

/** A small seeded generator, so decorative scatter is the same on every load. */
function seeded(seed: number) {
    let s = seed;
    return () => {
        s = (s * 1664525 + 1013904223) % 4294967296;
        return s / 4294967296;
    };
}

function nightSky(): string {
    const rnd = seeded(7);
    let stars = '';
    for (let i = 0; i < 34; i++) {
        const x = P.x + 2 + rnd() * (P.w - 4);
        const y = P.y + 2 + rnd() * (P.h - 4);
        stars += `<circle cx="${n(x)}" cy="${n(y)}" r="${n(0.35 + rnd() * 0.7)}" fill="#fff" opacity="${n(0.55 + rnd() * 0.45)}"/>`;
    }
    return (
        '<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#081334"/><stop offset="1" stop-color="#1f3f86"/></linearGradient>' +
        '<mask id="m"><rect width="71" height="96" fill="#000"/><circle cx="46" cy="27" r="10" fill="#fff"/><circle cx="50.5" cy="23.5" r="9" fill="#000"/></mask></defs>' +
        fillPanel('url(#g)') +
        stars +
        '<circle cx="46" cy="27" r="10" fill="#f4e4a6" mask="url(#m)"/>' +
        '<path d="M4 80C16 72 26 76 36 71C46 66 56 70 67 64V92H4Z" fill="#0a1638"/>'
    );
}

function sunburst(): string {
    const cx = 35.5;
    const cy = 48;
    let rays = '';
    for (let i = 0; i < 24; i += 2) {
        const a0 = (i / 24) * Math.PI * 2;
        const a1 = ((i + 1) / 24) * Math.PI * 2;
        const r = 80;
        rays += `<path d="M${cx} ${cy}L${n(cx + r * Math.cos(a0))} ${n(cy + r * Math.sin(a0))}L${n(cx + r * Math.cos(a1))} ${n(cy + r * Math.sin(a1))}Z" fill="#f8b64c"/>`;
    }
    return (
        fillPanel('#ea7d1c') +
        rays +
        `<circle cx="${cx}" cy="${cy}" r="12" fill="#fde2a4" stroke="#b5520c" stroke-width="1"/>` +
        `<circle cx="${cx}" cy="${cy}" r="7" fill="none" stroke="#e98a2a" stroke-width="1.4"/>`
    );
}

/** Topographic contours with a stream: a nod to the owner's geospatial work. */
function contours(): string {
    const rings = [
        'M20 20C30 10 50 12 58 24C66 38 60 52 52 60C44 70 30 72 20 64C10 56 10 32 20 20Z',
        'M24 25C32 17 47 19 53 28C59 39 55 50 48 56C41 63 31 64 24 58C17 51 17 33 24 25Z',
        'M28 30C34 24 44 26 48 32C52 40 49 47 44 51C39 56 32 56 28 52C23 47 23 36 28 30Z',
        'M32 35C36 31 41 32 43 36C45 40 43 44 40 46C37 48 33 48 31 45C29 42 29 38 32 35Z',
        'M10 74C22 68 34 80 46 76C54 73 60 78 67 76',
        'M4 84C18 78 30 90 44 86C52 84 60 88 67 87',
    ];
    return (
        fillPanel('#efe2bf') +
        rings.map((d) => `<path d="${d}" fill="none" stroke="#9a6b3c" stroke-width=".8"/>`).join('') +
        '<path d="M4 62C12 60 14 70 22 70C30 70 32 64 40 66C50 68 52 84 60 92" fill="none" stroke="#3d7fc1" stroke-width="1.6"/>' +
        '<circle cx="37" cy="40" r="1.3" fill="#9a2f2f"/>'
    );
}

const BACK_DESIGNS: BackDesign[] = [
    {
        name: 'Blue lattice',
        panel:
            pattern(8, 8, '<path d="M0 0H8M0 0V8" stroke="#8fb3ee" stroke-width="1.1"/><circle cx="4" cy="4" r="1" fill="#dfe9fb"/>', 'rotate(45)') +
            fillPanel('#1f4fa6') +
            fillPanel('url(#p)') +
            frame('#dfe9fb'),
    },
    {
        name: 'Red rosette',
        panel:
            pattern(9, 9, '<path d="M4.5 1L8 4.5L4.5 8L1 4.5Z" fill="#e8b33a"/><circle cx="4.5" cy="4.5" r="1.1" fill="#a8141c"/>') +
            fillPanel('#a8141c') +
            fillPanel('url(#p)') +
            frame('#f3d9a0'),
    },
    {
        name: 'Green scales',
        panel:
            pattern(10, 10, '<path d="M-5 5A5 5 0 0 0 5 5A5 5 0 0 0 15 5M0 10A5 5 0 0 0 10 10M0 0A5 5 0 0 0 10 0" fill="none" stroke="#86d7a0" stroke-width="1"/>') +
            fillPanel('#17703a') +
            fillPanel('url(#p)') +
            frame('#c9f0d4'),
    },
    { name: 'Night sky', panel: nightSky() },
    { name: 'Sunburst', panel: sunburst() },
    {
        name: 'Circuit board',
        panel:
            pattern(
                21,
                22,
                '<path d="M0 5H7L11 9V16H21M5 22V17L2 14V5M14 0V5L17 8H21" fill="none" stroke="#c9a24a" stroke-width="1.1"/>' +
                    '<circle cx="11" cy="16" r="1.5" fill="#e3c06a"/><circle cx="2" cy="14" r="1.3" fill="#e3c06a"/><circle cx="17" cy="8" r="1.3" fill="#e3c06a"/>',
            ) +
            fillPanel('#0e4a2c') +
            fillPanel('url(#p)') +
            frame('#c9a24a'),
    },
    { name: 'Contour map', panel: contours() },
    {
        name: 'Tartan',
        panel:
            pattern(
                16,
                16,
                '<rect y="5" width="16" height="5" fill="#132a5c" opacity=".75"/><rect x="5" width="5" height="16" fill="#132a5c" opacity=".75"/>' +
                    '<rect y="13" width="16" height="1" fill="#d23a2a"/><rect x="13" width="1" height="16" fill="#d23a2a"/>' +
                    '<rect y="1.5" width="16" height=".6" fill="#f2cf4a"/><rect x="1.5" width=".6" height="16" fill="#f2cf4a"/>',
            ) +
            fillPanel('#1f5a3d') +
            fillPanel('url(#p)') +
            frame('#f2cf4a'),
    },
    {
        name: 'Honeycomb',
        panel:
            pattern(12, 20.78, '<path d="M3 0L0 5.2L3 10.39H9L12 15.59L9 20.78M3 20.78L0 15.59L3 10.39M9 10.39L12 5.2L9 0" fill="none" stroke="#8a5b00" stroke-width="1"/>') +
            fillPanel('#e7a816') +
            fillPanel('url(#p)') +
            frame('#fff1c4'),
    },
    {
        name: 'Waves',
        panel:
            pattern(12, 8, '<path d="M0 5Q3 1.5 6 5T12 5" fill="none" stroke="#e8f4ff" stroke-width="1.1"/>') +
            fillPanel('#1a73b5') +
            fillPanel('url(#p)') +
            frame('#e8f4ff'),
    },
    {
        name: 'Chevrons',
        panel:
            pattern(12, 7, '<path d="M0 5.5L6 1.5L12 5.5" fill="none" stroke="#d6b8f5" stroke-width="1.4"/>') +
            fillPanel('#5a2d86') +
            fillPanel('url(#p)') +
            frame('#d6b8f5'),
    },
    {
        name: 'Polka dots',
        panel:
            pattern(10, 10, '<circle cx="2.5" cy="2.5" r="1.7" fill="#fff"/><circle cx="7.5" cy="7.5" r="1.7" fill="#fff"/>') +
            fillPanel('#c2185b') +
            fillPanel('url(#p)') +
            frame('#fff'),
    },
];

export const BACKS: readonly { name: string }[] = BACK_DESIGNS.map(({ name }) => ({ name }));

export function backSvg(id: number): string {
    const design = BACK_DESIGNS[id] ?? BACK_DESIGNS[0];
    return (
        `${SVG_OPEN}${EDGE}` +
        `<clipPath id="c"><rect x="${P.x}" y="${P.y}" width="${P.w}" height="${P.h}" rx="2"/></clipPath>` +
        `<g clip-path="url(#c)">${design.panel}</g>` +
        `<rect x="${P.x}" y="${P.y}" width="${P.w}" height="${P.h}" rx="2" fill="none" stroke="#000" stroke-opacity=".35" stroke-width=".8"/></svg>`
    );
}

// ---- caches ------------------------------------------------------------------------------------

const urls = new Map<string, string>();
const images = new Map<string, HTMLImageElement>();

const toDataUrl = (svg: string) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

function cached(key: string, build: () => string): string {
    let url = urls.get(key);
    if (!url) {
        url = toDataUrl(build());
        urls.set(key, url);
    }
    return url;
}

export const faceUrl = (card: Pick<Card, 'suit' | 'rank'>) => cached(`f${card.suit}:${card.rank}`, () => cardSvg(card));
export const backUrl = (id: number) => cached(`b${id}`, () => backSvg(id));
export const cssUrl = (url: string) => `url("${url}")`;

/** The same art as an image, for canvas drawing. Browser only. */
export function faceImage(card: Pick<Card, 'suit' | 'rank'>): HTMLImageElement {
    const key = `f${card.suit}:${card.rank}`;
    let img = images.get(key);
    if (!img) {
        img = new Image(71, 96);
        img.decoding = 'async';
        img.src = faceUrl(card);
        images.set(key, img);
    }
    return img;
}
