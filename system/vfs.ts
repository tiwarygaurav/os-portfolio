/**
 * Virtual filesystem.
 *
 * The tree is generated from `content/` at module load, so the shell and the GUI apps are reading
 * the same data by construction — `cat /home/gaurav/experience/here-technologies.md` cannot drift
 * away from what the Experience window shows.
 *
 * Headless by rule: no React, no DOM, no styling. See `system/CLAUDE.md`.
 */

import {
    ACHIEVEMENTS,
    CERTIFICATIONS,
    EDUCATION,
    LINKS,
    PROFILE,
    PROJECTS,
    RESUME,
    ROLES,
    SKILL_GROUPS,
    SYSTEM,
    availabilityLabel,
    disclosureNote,
    isConfidential,
    type Project,
    type Role,
} from '@/content';
// Pure data, no React and no store: the one module both the persist middleware and this
// generated file read, so what the shell shows a visitor is what is actually saved.
import { PERSISTED_KEYS, PERSISTED_KEY_LABELS } from '@/store/persistence';

/* ------------------------------------------------------------------ types */

export type VMime =
    | 'text/markdown'
    | 'text/plain'
    | 'application/json'
    | 'application/x-link'
    | 'application/x-app'
    | 'image/png'
    | 'image/jpeg';

export interface VFile {
    kind: 'file';
    name: string;
    mime: VMime;
    /** Rendered text, what `cat` prints. */
    content: string;
    /** Launch hint: what `open <path>` (and a future GUI double-click) should do. */
    open?: { appId: string; payload?: Record<string, string> };
    /** For `application/x-link` files: the external target. */
    href?: string;
    /** For images: a URL the browser can load — a public asset or, for a visitor's file, a data: URL. */
    src?: string;
    /** True for files a visitor may overwrite or delete: everything they saved under /home/guest. */
    writable?: boolean;
    /** Last write, ms since the epoch. Visitor files only. */
    modified?: number;
    /** Stored size in bytes (characters), where it is meaningful. */
    size?: number;
}

export interface VDir {
    kind: 'dir';
    name: string;
    children: VNode[];
    /** Shown by `ls -l` style output and in the file browser. */
    description?: string;
    /**
     * Launch hint, exactly as on a file. A directory can represent a window too — `~/projects/<id>`
     * is the Projects window focused on that project. The shell's `open` command used to infer
     * this from a hardcoded `'/projects/'` substring test, which meant the Run dialog and any
     * future explorer would each have had to re-implement the same guess. It is data now, so
     * every surface resolves a path the same way.
     */
    open?: { appId: string; payload?: Record<string, string> };
}

export type VNode = VFile | VDir;

export const isDir = (n: VNode): n is VDir => n.kind === 'dir';
export const isFile = (n: VNode): n is VFile => n.kind === 'file';

/** A live window, projected into `/proc`. Supplied by the caller so the VFS stays headless. */
export interface ProcEntry {
    pid: string;
    appId: string;
    title: string;
    state: 'running' | 'minimized' | 'maximized';
    zIndex: number;
}

/* ------------------------------------------------------------- text render */

const rule = (s: string) => '='.repeat(Math.min(s.length, 72));

const heading = (s: string) => `${s}\n${rule(s)}`;

const bullets = (items: string[]) => items.map((i) => `  - ${i}`).join('\n');

const notes = (...fields: { from: string; note?: string }[]): string[] =>
    fields
        .filter((f) => f.from === 'needs-confirmation' && f.note)
        .map((f) => `[unconfirmed] ${f.note}`);

const renderRole = (r: Role): string =>
    [
        heading(`${r.title.value} — ${r.company}`),
        '',
        `Period    : ${r.period.value}`,
        `Location  : ${r.location.value}`,
        `Status    : ${r.current ? 'current' : 'past'}`,
        `Stack     : ${r.stack.length ? r.stack.join(', ') : '(not supplied yet)'}`,
        '',
        // Conditional inside the spread rather than filtered out afterwards. The old version
        // stripped *every* empty string in order to drop one optional entry, which collapsed the
        // file into an unbroken block: the underline ran into "Period", and "Stack" ran into the
        // highlights. These were the only files in the tree that read as a wall of text.
        ...(r.highlights.length
            ? ['What I worked on', bullets(r.highlights)]
            : ['Details pending — nothing has been recorded for this role yet.']),
        ...(notes(r.title, r.period, r.location).length
            ? ['', ...notes(r.title, r.period, r.location)]
            : []),
    ].join('\n');

const renderProject = (p: Project): string => {
    const links = p.links.length
        ? p.links
            .map((l) => (l.known ? `  ${l.label}: ${l.url}` : `  ${l.label}: (address not recorded)`))
            .join('\n')
        : `  none — ${availabilityLabel(p.availability)}`;

    const disclosure = disclosureNote(p);

    return [
        heading(p.name),
        ...(isConfidential(p) ? ['', '** CONFIDENTIAL / PROPRIETARY **'] : []),
        '',
        p.summary,
        '',
        `Period    : ${p.period}`,
        `Role      : ${p.role}`,
        `Context   : ${p.context ?? 'personal project'}`,
        `Stack     : ${p.stack.join(', ')}`,
        '',
        p.description.join('\n\n'),
        ...(p.problem ? ['', 'Problem', `  ${p.problem}`] : []),
        ...(p.approach ? ['', 'Approach', `  ${p.approach}`] : []),
        ...(p.contribution?.length ? ['', 'My contribution', bullets(p.contribution)] : []),
        ...(p.highlights.length ? ['', 'Highlights', bullets(p.highlights)] : []),
        '',
        'Links',
        links,
        ...(disclosure ? ['', 'Disclosure', `  ${disclosure}`] : []),
    ].join('\n');
};

const renderAbout = (): string =>
    [
        heading(PROFILE.name),
        '',
        PROFILE.title,
        '',
        PROFILE.summary,
        '',
        'Focus',
        bullets([...PROFILE.focus]),
        '',
        `Location  : ${PROFILE.location.value}${PROFILE.location.from === 'needs-confirmation' ? '  (unconfirmed)' : ''}`,
        `Status    : ${PROFILE.availability}`,
        `Email     : ${PROFILE.email}`,
        '',
        'Try `ls ~/projects`, `cat ~/experience/here-technologies.md`, or `open ~/resume.pdf`.',
    ].join('\n');

const renderSkills = (): string =>
    [
        heading('Skills'),
        '',
        'No percentages. Each entry lists where it was actually used — run',
        '`evidence <skill>` to jump to the work that backs it up.',
        '',
        ...SKILL_GROUPS.map((g) =>
            [
                `${g.label}`,
                '-'.repeat(g.label.length),
                ...g.skills.map(
                    (s) =>
                        `  ${s.name.padEnd(34)} ${s.level.padEnd(11)} ${s.evidence.length ? s.evidence.join(', ') : '—'}`,
                ),
                '',
            ].join('\n'),
        ),
    ].join('\n');

const renderEducation = (): string =>
    [
        heading('Education'),
        '',
        ...EDUCATION.map((e) =>
            [
                `${e.qualification}`,
                `${e.institution} — ${e.location}`,
                `${e.period}`,
                '',
                'Coursework',
                bullets(e.coursework),
            ].join('\n'),
        ),
        '',
        heading('Certifications'),
        '',
        ...CERTIFICATIONS.map((c) => `  ${c.name} — ${c.issuer} (${c.status})`),
        '',
        heading('Achievements'),
        '',
        ...ACHIEVEMENTS.map((a) => `  ${a.title} (${a.year})\n    ${a.detail}`),
    ].join('\n');

const renderContact = (): string =>
    [
        heading('Contact'),
        '',
        `Email     : ${PROFILE.email}`,
        ...LINKS.filter((l) => l.label !== 'Email').map(
            (l) => `${l.label.padEnd(10)}: ${l.known ? l.url : '(not recorded)'}`,
        ),
        '',
        'The Contact window composes a message; it does not yet send one by itself.',
        'Email is the reliable path.',
    ].join('\n');

const renderMotd = (): string =>
    [
        `${SYSTEM.name} ${SYSTEM.version} — ${SYSTEM.codename}`,
        SYSTEM.tagline,
        '',
        'This filesystem is generated from the same content the windows render, so nothing here',
        'is faked — every path resolves to real data, and `open` launches the matching window.',
        '',
        'help      list commands',
        'ls ~      look around',
        'open ~/projects/os-portfolio   read about the desktop you are inside',
        'cd /home/guest                 your own folder: what you save there stays in this browser',
    ].join('\n');

const renderSystemConf = (): string =>
    [
        '# Real stack of the environment you are running.',
        '# Generated from the repository, not decoration.',
        '',
        '[runtime]',
        'framework      = Next.js 14 (App Router)',
        'ui             = React 18',
        'language       = TypeScript 5 (strict)',
        'rendering      = client-side single route',
        '',
        '[state]',
        'store          = Zustand 4 with persist middleware',
        // Derived from `store/persistence.ts`, which the persist middleware also reads. This line
        // used to name a `theme` key that had been deleted from the store and to omit
        // `deletedAppIds`, which is the one persisted key a visitor can feel.
        `persisted      = ${PERSISTED_KEYS.map((k) => PERSISTED_KEY_LABELS[k]).join(', ')}`,
        'not_persisted  = open windows, focus, session',
        '',
        '[layers]',
        'content        = typed source of truth, headless',
        'system         = virtual filesystem + shell + event bus, headless',
        'components/os  = shell chrome (desktop, window, taskbar, start menu)',
        'components/app = one component per application',
        '',
        '[style]',
        'css            = Tailwind 3',
        'motion         = Framer Motion 11',
        'audio          = WebAudio oscillators, one sampled file',
    ].join('\n');

const renderBootLog = (): string =>
    [
        '# What actually happens between the click and the desktop.',
        '',
        '[    0.000 ] user gesture received — required before any audio may play',
        '[    0.004 ] content/ evaluated — profile, roles, projects, skills frozen into module scope',
        '[    0.006 ] system/vfs — tree built from content; /proc left dynamic',
        '[    0.008 ] system/shell — command table registered',
        '[    0.010 ] zustand store hydrated from localStorage (preferences only)',
        '[    0.012 ] window manager idle — zero processes',
        '[    4.500 ] boot timer elapses (fixed delay, not real loading — see docs/AUDIT.md)',
        '[    4.510 ] startup sample played through the shared AudioContext',
        '[    4.520 ] login surface mounted',
        '',
        '# Honest note: the 4.5s boot is theatre. The real init above takes about 12ms.',
    ].join('\n');

/* --------------------------------------------------------------- builders */

const file = (
    name: string,
    content: string,
    mime: VMime = 'text/markdown',
    open?: VFile['open'],
): VFile => ({ kind: 'file', name, mime, content, open });

const link = (name: string, href: string, label: string): VFile => ({
    kind: 'file',
    name,
    mime: 'application/x-link',
    href,
    content: `${label}\n${href}`,
});

const dir = (
    name: string,
    children: VNode[],
    description?: string,
    open?: VDir['open'],
): VDir => ({
    kind: 'dir',
    name,
    children,
    description,
    open,
});

const projectDir = (p: Project): VDir => {
    const disclosure = disclosureNote(p);
    return dir(
        p.id,
        [
            file('README.md', renderProject(p), 'text/markdown', {
                appId: 'projects',
                payload: { projectId: p.id },
            }),
            file('stack.txt', p.stack.join('\n'), 'text/plain'),
            file(
                'links.txt',
                p.links.length
                    ? p.links.map((l) => `${l.label}\t${l.known ? l.url : '(not recorded)'}`).join('\n')
                    : availabilityLabel(p.availability),
                'text/plain',
            ),
            // Present only where there is something to disclose — an empty file would be noise.
            ...(disclosure ? [file('DISCLOSURE.txt', disclosure, 'text/plain')] : []),
        ],
        `${isConfidential(p) ? '[confidential] ' : ''}${p.summary}`,
        { appId: 'projects', payload: { projectId: p.id } },
    );
};

const HOME = `/home/${PROFILE.handle}`;

/* ------------------------------------------------------------ /home/guest (writable) */

/**
 * The visitor's own folder. The shell prompt has always said `guest@portfolio`; this is guest's
 * home. Everything under `/home/${PROFILE.handle}` is the portfolio and read-only. Files saved here
 * live in the store (`userFiles`), persist in this browser only, and are mounted into the tree
 * with `mountUserFiles` so the shell, Explorer, Notepad and the picture viewer all see the same
 * files. The layout is XP's: My Documents, My Pictures, and Sample Pictures inside My Pictures.
 */
export const GUEST_PATH = '/home/guest';
export const DOCUMENTS_PATH = `${GUEST_PATH}/My Documents`;
export const PICTURES_PATH = `${GUEST_PATH}/My Pictures`;
export const SAMPLE_PICTURES_PATH = `${PICTURES_PATH}/Sample Pictures`;

/** The only folders a visitor can save into. There is no mkdir: the layout is fixed, like XP's. */
export const WRITABLE_DIRS = [GUEST_PATH, DOCUMENTS_PATH, PICTURES_PATH] as const;

/** What the store keeps per visitor file. Images hold a PNG/JPEG data: URL as their content. */
export interface UserFile {
    content: string;
    mime: 'text/plain' | 'text/markdown' | 'image/png' | 'image/jpeg';
    modified: number;
}

/** Room the visitor's files may take in localStorage, in characters. The browser allows ~5M. */
export const USER_FILES_QUOTA = 2_000_000;

/** Characters XP refused in a file name, plus control characters. */
const INVALID_NAME = /[\\/:*?"<>|\u0000-\u001f]/;

/** Mime type implied by a file name, as XP's file associations would have it. */
export function mimeForName(name: string): UserFile['mime'] {
    const ext = name.toLowerCase().split('.').pop() ?? '';
    if (ext === 'png') return 'image/png';
    if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
    if (ext === 'md') return 'text/markdown';
    return 'text/plain';
}

/**
 * Why `absPath` cannot be written, or null if it can. Headless, so the shell, the store and the
 * Save As dialog all refuse the same paths with the same words.
 */
export function validateUserPath(absPath: string): string | null {
    const cut = absPath.lastIndexOf('/');
    const parent = absPath.slice(0, cut) || '/';
    const name = absPath.slice(cut + 1);
    if (!(WRITABLE_DIRS as readonly string[]).includes(parent)) {
        if (parent === SAMPLE_PICTURES_PATH) return 'Sample Pictures is read-only.';
        if (parent === HOME || parent.startsWith(HOME + '/')) {
            return 'The portfolio is read-only. Save to My Documents or My Pictures instead.';
        }
        return `You can only save in ${WRITABLE_DIRS.map((d) => d.replace(GUEST_PATH, '/home/guest')).join(', ')}.`;
    }
    if (!name.trim()) return 'A file name cannot be empty.';
    if (name !== name.trim()) return 'A file name cannot start or end with a space.';
    if (name === '.' || name === '..') return 'That name is reserved.';
    if (name.length > 64) return 'A file name can be at most 64 characters.';
    if (INVALID_NAME.test(name)) return 'A file name cannot contain any of the following characters: \\ / : * ? " < > |';
    const reserved = [DOCUMENTS_PATH, PICTURES_PATH, SAMPLE_PICTURES_PATH];
    if (reserved.includes(absPath)) return 'A folder with that name already exists.';
    return null;
}

/** True when a path is one a visitor saved (as opposed to a built-in, read-only file). */
export const isUserPath = (absPath: string): boolean => userFiles[absPath] !== undefined;

let userFiles: Record<string, UserFile> = {};
let guestCache: VDir | null = null;

/**
 * Mount the visitor's files. Called by the store whenever `userFiles` changes, and by tests.
 * The object is kept by reference — the store replaces it on every write, never mutates it.
 */
export function mountUserFiles(files: Record<string, UserFile>): void {
    if (files === userFiles) return;
    userFiles = files;
    guestCache = null;
}

const fmtSize = (chars: number) =>
    chars < 1024 ? `${chars} bytes` : `${Math.round(chars / 1024)} KB`;

function userFileNode(absPath: string, f: UserFile): VFile {
    const name = absPath.slice(absPath.lastIndexOf('/') + 1);
    const image = f.mime === 'image/png' || f.mime === 'image/jpeg';
    return {
        kind: 'file',
        name,
        mime: f.mime,
        // An image's content is its data: URL; `cat` and `grep` should see a description instead.
        content: image
            ? `${f.mime === 'image/png' ? 'PNG' : 'JPEG'} image, ${fmtSize(f.content.length)}. Open it to view.`
            : f.content,
        src: image ? f.content : undefined,
        writable: true,
        modified: f.modified,
        size: f.content.length,
        open: image
            ? { appId: 'imageviewer', payload: { path: absPath } }
            : { appId: 'notepad', payload: { path: absPath } },
    };
}

/** Built-in pictures, so My Pictures is not empty on a first visit. Read-only. */
const SAMPLE_PICTURES: { name: string; src: string; mime: VFile['mime']; note: string }[] = [
    { name: 'Bliss.jpg', src: '/wallpapers/Bliss.jpg', mime: 'image/jpeg', note: 'The Windows XP wallpaper.' },
    { name: 'Profile.png', src: '/icons/profile-picture-chess.png', mime: 'image/png', note: 'The logon picture.' },
    { name: 'Avatar.jpg', src: '/profile.jpg', mime: 'image/jpeg', note: `${PROFILE.name}.` },
    { name: 'Windows XP.png', src: '/icons/windows-xp-logo-black-text.png', mime: 'image/png', note: 'The Windows XP logo.' },
];

function guestDir(): VDir {
    if (guestCache) return guestCache;
    const inDir = (d: string) =>
        Object.keys(userFiles)
            .filter((p) => p.slice(0, p.lastIndexOf('/')) === d)
            .sort((a, b) => a.localeCompare(b))
            .map((p) => userFileNode(p, userFiles[p]));

    const samples = dir(
        'Sample Pictures',
        SAMPLE_PICTURES.map((pic) => ({
            kind: 'file' as const,
            name: pic.name,
            mime: pic.mime,
            content: `${pic.mime === 'image/png' ? 'PNG' : 'JPEG'} image. ${pic.note} Open it to view.`,
            src: pic.src,
            open: { appId: 'imageviewer', payload: { path: `${SAMPLE_PICTURES_PATH}/${pic.name}` } },
        })),
        'Built-in pictures (read-only)',
    );

    guestCache = dir(
        'guest',
        [
            dir('My Documents', inDir(DOCUMENTS_PATH), 'Your documents. Saved in this browser.'),
            dir('My Pictures', [samples, ...inDir(PICTURES_PATH)], 'Your pictures. Saved in this browser.'),
            ...inDir(GUEST_PATH),
        ],
        'Your folder. Anything you save here stays in this browser.',
    );
    return guestCache;
}

/** Characters the mounted visitor files take now; what `df` reports. */
export const guestUsage = (): number => userFilesSize(userFiles);

/** Total characters the visitor's files would take if `next` were saved. */
export const userFilesSize = (files: Record<string, UserFile>): number =>
    Object.entries(files).reduce((n, [k, f]) => n + k.length + f.content.length, 0);

const buildRoot = (): VDir =>
    dir('/', [
        dir('home', [
            dir(
                PROFILE.handle,
                [
                    file('README.md', renderMotd(), 'text/markdown'),
                    file('about.md', renderAbout(), 'text/markdown', { appId: 'about' }),
                    dir(
                        'experience',
                        ROLES.map((r) =>
                            file(`${r.id}.md`, renderRole(r), 'text/markdown', { appId: 'about' }),
                        ),
                        'Employment history',
                        { appId: 'about' },
                    ),
                    dir(
                        'projects',
                        PROJECTS.map(projectDir),
                        'Things built, with sources where they exist',
                        { appId: 'projects' },
                    ),
                    file('skills.md', renderSkills(), 'text/markdown', { appId: 'skills' }),
                    file('education.md', renderEducation(), 'text/markdown', { appId: 'about' }),
                    file('contact.md', renderContact(), 'text/markdown', { appId: 'contact' }),
                    file(
                        'resume.pdf',
                        [
                            `The real resume PDF, served from ${RESUME.path}.`,
                            `Generated ${RESUME.asOf}.`,
                            '',
                            RESUME.staleness,
                            '',
                            '`open ~/resume.pdf` opens the Resume window, which can view or download it.',
                        ].join('\n'),
                        'application/x-app',
                        { appId: 'resume' },
                    ),
                    dir(
                        'links',
                        LINKS.filter((l) => l.known).map((l) =>
                            link(l.label.toLowerCase(), l.url, l.label),
                        ),
                        'External profiles',
                    ),
                ],
                `${PROFILE.name} — home`,
            ),
        ]),
        dir(
            'etc',
            [
                file('motd', renderMotd(), 'text/plain'),
                file('system.conf', renderSystemConf(), 'text/plain'),
            ],
            'System configuration',
        ),
        dir('var', [dir('log', [file('boot.log', renderBootLog(), 'text/plain')])]),
    ]);

/**
 * Default associations, the way XP's file types worked: a text file with no window of its own
 * opens in Notepad. Applied once to the static tree, so `open`, Run and Explorer all agree —
 * double-clicking `stack.txt` in Explorer used to show its text in a message box instead.
 */
function associate(node: VNode, path: string): void {
    if (isDir(node)) {
        node.children.forEach((c) => associate(c, `${path === '/' ? '' : path}/${c.name}`));
        return;
    }
    if (node.open || node.href) return;
    if (node.mime === 'text/plain' || node.mime === 'text/markdown' || node.mime === 'application/json') {
        node.open = { appId: 'notepad', payload: { path } };
    }
}

/** Built once — content is static, so rebuilding per call would be waste. */
const ROOT: VDir = buildRoot();
associate(ROOT, '/');

/**
 * The filesystem root for this call: the static tree plus the live `/proc`.
 *
 * Every traversal goes through this one composition. They used to assemble the root separately
 * and `renderTree` forgot `/proc` altogether, so `ls /` listed the process table while `tree /`
 * — the command whose entire job is showing the filesystem at a glance — did not.
 */
const rootFor = (procs: ProcEntry[]): VDir =>
    dir('', [
        ...ROOT.children.map((c) =>
            c.name === 'home' && isDir(c) ? dir('home', [...c.children, guestDir()], c.description) : c,
        ),
        procDir(procs),
    ]);

/* ------------------------------------------------------------- /proc (live) */

const procDir = (procs: ProcEntry[]): VDir =>
    dir(
        'proc',
        procs.map((p) =>
            dir(p.pid, [
                file(
                    'status',
                    [
                        `Pid       : ${p.pid}`,
                        `Name      : ${p.title}`,
                        `App       : ${p.appId}`,
                        `State     : ${p.state}`,
                        `Z-order   : ${p.zIndex}`,
                    ].join('\n'),
                    'text/plain',
                ),
            ]),
        ),
        'Live windows, projected as processes',
    );

/* ------------------------------------------------------------ path helpers */

export const HOME_PATH = HOME;

/** Normalise `.`, `..`, `~`, and relative segments into an absolute path. */
export function resolvePath(cwd: string, input: string): string {
    const raw = input.trim();
    let base: string[];

    if (raw === '~' || raw.startsWith('~/')) {
        base = HOME.split('/').filter(Boolean);
        base.push(...raw.slice(1).split('/').filter(Boolean));
    } else if (raw.startsWith('/')) {
        base = raw.split('/').filter(Boolean);
    } else {
        base = [...cwd.split('/').filter(Boolean), ...raw.split('/').filter(Boolean)];
    }

    const out: string[] = [];
    for (const seg of base) {
        if (seg === '.') continue;
        if (seg === '..') {
            out.pop();
            continue;
        }
        out.push(seg);
    }
    return '/' + out.join('/');
}

/** Look a path up in the tree. `/proc` is resolved against the live process list. */
export function lookup(absPath: string, procs: ProcEntry[] = []): VNode | null {
    const segments = absPath.split('/').filter(Boolean);

    let node: VNode = rootFor(procs);

    for (const seg of segments) {
        if (!isDir(node)) return null;
        const next: VNode | undefined = node.children.find((c) => c.name === seg);
        if (!next) return null;
        node = next;
    }
    return node;
}

/** Children of a directory path, or null if the path is not a directory. */
export function listDir(absPath: string, procs: ProcEntry[] = []): VNode[] | null {
    const node = lookup(absPath, procs);
    return node && isDir(node) ? node.children : null;
}

/** Recursive tree rendering, as `tree` prints it. */
export function renderTree(absPath: string, procs: ProcEntry[] = [], maxDepth = 3): string[] {
    const root = lookup(absPath, procs);
    if (!root) return [];
    const out: string[] = [absPath];

    const walk = (node: VDir, prefix: string, depth: number) => {
        if (depth > maxDepth) return;
        node.children.forEach((child, i) => {
            const last = i === node.children.length - 1;
            out.push(`${prefix}${last ? '└── ' : '├── '}${child.name}${isDir(child) ? '/' : ''}`);
            if (isDir(child)) walk(child, `${prefix}${last ? '    ' : '│   '}`, depth + 1);
        });
    };

    if (isDir(root)) walk(root, '', 1);
    return out;
}

/** Depth-first search over file contents, used by `grep` and the future command palette. */
export function searchFiles(
    term: string,
    procs: ProcEntry[] = [],
): { path: string; line: string }[] {
    const needle = term.toLowerCase();
    const hits: { path: string; line: string }[] = [];

    const walk = (node: VNode, path: string) => {
        if (isDir(node)) {
            node.children.forEach((c) => walk(c, `${path}/${c.name}`.replace('//', '/')));
            return;
        }
        node.content.split('\n').forEach((line) => {
            if (line.toLowerCase().includes(needle)) hits.push({ path, line: line.trim() });
        });
    };

    walk(rootFor(procs), '');
    return hits;
}

/** Every file path in the tree — used for tab completion and search. */
export function allPaths(procs: ProcEntry[] = []): string[] {
    const paths: string[] = [];
    const walk = (node: VNode, path: string) => {
        paths.push(path + (isDir(node) ? '/' : ''));
        if (isDir(node)) node.children.forEach((c) => walk(c, `${path}/${c.name}`));
    };
    rootFor(procs).children.forEach((c) => walk(c, `/${c.name}`));
    return paths;
}
