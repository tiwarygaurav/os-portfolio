import type { Tile } from './engine';

/**
 * The squares of the minefield, drawn here as original pixel art.
 *
 * winmine.exe blitted its squares from one bitmap strip. This does the same thing the web's way:
 * each square is a 16x16 SVG built once from the bitmaps below and handed to CSS as a data URI,
 * so the 480 squares of an Expert field are 480 plain `div`s sharing sixteen decoded images —
 * not 480 inline SVG trees for React to diff on every click.
 *
 * Every bitmap is a list of rows, one character per pixel; `.` is transparent. The drawing is
 * `shape-rendering="crispEdges"` rectangles, one per horizontal run, so nothing is antialiased.
 */

/** The classic Windows 3-D palette winmine drew with. Colour-scheme independent, as it was in XP. */
export const PAL = {
    face: '#c0c0c0',
    light: '#ffffff',
    shadow: '#808080',
    black: '#000000',
    red: '#ff0000',
} as const;

/** XP's number colours, 1 to 8. */
export const NUMBER_COLOURS = ['#0000ff', '#008000', '#ff0000', '#000080', '#800000', '#008080', '#000000', '#808080'] as const;

type Colours = Record<string, string>;

/** Horizontal runs of each non-transparent character, as SVG rects. */
function bitmap(rows: readonly string[], colours: Colours, ox = 0, oy = 0): string {
    let out = '';
    rows.forEach((row, y) => {
        let x = 0;
        while (x < row.length) {
            const ch = row[x];
            let end = x + 1;
            while (end < row.length && row[end] === ch) end++;
            const fill = colours[ch];
            if (fill) out += `<rect x="${ox + x}" y="${oy + y}" width="${end - x}" height="1" fill="${fill}"/>`;
            x = end;
        }
    });
    return out;
}

const svg = (body: string) =>
    `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16" shape-rendering="crispEdges">${body}</svg>`;

const dataUri = (markup: string) => `url("data:image/svg+xml,${encodeURIComponent(markup)}")`;

/** A covered square: raised, with the 2px bevel meeting on the diagonal at two corners. */
const RAISED = bitmap(
    [
        'WWWWWWWWWWWWWWWG',
        'WWWWWWWWWWWWWWGG',
        'WW............GG',
        'WW............GG',
        'WW............GG',
        'WW............GG',
        'WW............GG',
        'WW............GG',
        'WW............GG',
        'WW............GG',
        'WW............GG',
        'WW............GG',
        'WW............GG',
        'WW............GG',
        'WGGGGGGGGGGGGGGG',
        'GGGGGGGGGGGGGGGG',
    ],
    { W: PAL.light, G: PAL.shadow },
);

/** An uncovered square: flat, with a 1px line on its top and left. Neighbours supply the rest of the grid. */
const FLAT = `<rect x="0" y="0" width="16" height="1" fill="${PAL.shadow}"/><rect x="0" y="1" width="1" height="15" fill="${PAL.shadow}"/>`;

const base = (fill: string = PAL.face) => `<rect width="16" height="16" fill="${fill}"/>`;

/** Chunky 10x12 numerals, drawn from 3px uprights and 2px bars. */
const DIGITS: readonly (readonly string[])[] = [
    [],
    [
        '....###...',
        '...####...',
        '..#####...',
        '....###...',
        '....###...',
        '....###...',
        '....###...',
        '....###...',
        '....###...',
        '....###...',
        '..#######.',
        '..#######.',
    ],
    [
        '.########.',
        '##########',
        '###....###',
        '.......###',
        '.......###',
        '.#########',
        '#########.',
        '###.......',
        '###.......',
        '###.......',
        '##########',
        '##########',
    ],
    [
        '#########.',
        '##########',
        '.......###',
        '.......###',
        '.......###',
        '..#######.',
        '..#######.',
        '.......###',
        '.......###',
        '.......###',
        '##########',
        '#########.',
    ],
    [
        '###....###',
        '###....###',
        '###....###',
        '###....###',
        '###....###',
        '##########',
        '##########',
        '.......###',
        '.......###',
        '.......###',
        '.......###',
        '.......###',
    ],
    [
        '##########',
        '##########',
        '###.......',
        '###.......',
        '###.......',
        '#########.',
        '##########',
        '.......###',
        '.......###',
        '.......###',
        '##########',
        '#########.',
    ],
    [
        '.#########',
        '##########',
        '###.......',
        '###.......',
        '###.......',
        '#########.',
        '##########',
        '###....###',
        '###....###',
        '###....###',
        '##########',
        '.########.',
    ],
    [
        '##########',
        '##########',
        '.......###',
        '.......###',
        '......###.',
        '......###.',
        '.....###..',
        '.....###..',
        '....###...',
        '....###...',
        '....###...',
        '....###...',
    ],
    [
        '.########.',
        '##########',
        '###....###',
        '###....###',
        '###....###',
        '.########.',
        '.########.',
        '###....###',
        '###....###',
        '###....###',
        '##########',
        '.########.',
    ],
];

/** A round mine: nine pixels across, four spikes, four studs, and a white glint. */
const MINE = bitmap(
    [
        '......#......',
        '......#......',
        '..#.#####.#..',
        '...#######...',
        '..##WW#####..',
        '..##WW#####..',
        '#############',
        '..#########..',
        '..#########..',
        '...#######...',
        '..#.#####.#..',
        '......#......',
        '......#......',
    ],
    { '#': PAL.black, W: PAL.light },
    2,
    2,
);

/** A red pennant on a black pole and a stepped black base. Sits inside the raised square's bevel. */
const FLAG = bitmap(
    [
        '......RRK.......',
        '....RRRRK.......',
        '...RRRRRK.......',
        '....RRRRK.......',
        '......RRK.......',
        '........K.......',
        '........K.......',
        '......KKKK......',
        '....KKKKKKKK....',
        '....KKKKKKKK....',
    ],
    { R: PAL.red, K: PAL.black },
    0,
    3,
);

const QUESTION_ROWS = [
    '..####..',
    '.##..##.',
    '.....##.',
    '....##..',
    '...##...',
    '...##...',
    '........',
    '...##...',
    '...##...',
];

/** The red cross drawn over a flag that was wrong, corner to corner, two pixels thick. */
function cross(): string {
    let out = '';
    for (let i = 0; i < 10; i++) {
        out += `<rect x="${3 + i}" y="${3 + i}" width="2" height="1" fill="${PAL.red}"/>`;
        out += `<rect x="${11 - i}" y="${3 + i}" width="2" height="1" fill="${PAL.red}"/>`;
    }
    return out;
}

const numberTile = (n: number) => svg(base() + FLAT + bitmap(DIGITS[n], { '#': NUMBER_COLOURS[n - 1] }, 3, 2));

const MARKUP: Record<Tile, string> = {
    covered: svg(base() + RAISED),
    // A held button sinks a covered square to the empty uncovered look, as winmine did.
    pressed: svg(base() + FLAT),
    flag: svg(base() + RAISED + FLAG),
    question: svg(base() + RAISED + bitmap(QUESTION_ROWS, { '#': PAL.black }, 4, 3)),
    'question-pressed': svg(base() + FLAT + bitmap(QUESTION_ROWS, { '#': PAL.black }, 5, 4)),
    'open-0': svg(base() + FLAT),
    'open-1': numberTile(1),
    'open-2': numberTile(2),
    'open-3': numberTile(3),
    'open-4': numberTile(4),
    'open-5': numberTile(5),
    'open-6': numberTile(6),
    'open-7': numberTile(7),
    'open-8': numberTile(8),
    mine: svg(base() + FLAT + MINE),
    // The mine that was stepped on: the same mine on a red square. The grid line stays grey.
    exploded: svg(base(PAL.red) + FLAT + MINE),
    'wrong-flag': svg(base() + FLAT + MINE + cross()),
};

/** CSS `background-image` values, one per tile, built once at module load. */
export const TILE_IMAGES: Readonly<Record<Tile, string>> = Object.fromEntries(
    (Object.keys(MARKUP) as Tile[]).map((t) => [t, dataUri(MARKUP[t])]),
) as Record<Tile, string>;

/** Square size in CSS pixels. XP's squares were 16x16 screen pixels. */
export const CELL = 16;
