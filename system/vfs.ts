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
    /** A folder the visitor made under /home/guest: it can be renamed, moved and deleted. */
    writable?: boolean;
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
 * home. Everything under `/home/${PROFILE.handle}` is the portfolio and read-only. Files and folders
 * made here live in the store (`userFiles`, `userFolders`), persist in this browser only, and are
 * mounted into the tree with `mountUserFiles` so the shell, Explorer, Notepad and the picture viewer
 * all see the same ones. The layout is XP's: My Documents, My Pictures, and Sample Pictures inside
 * My Pictures — and, as in XP, the visitor can make more folders anywhere in it.
 */
export const GUEST_PATH = '/home/guest';
export const DOCUMENTS_PATH = `${GUEST_PATH}/My Documents`;
export const PICTURES_PATH = `${GUEST_PATH}/My Pictures`;
export const SAMPLE_PICTURES_PATH = `${PICTURES_PATH}/Sample Pictures`;

/** The built-in folders a visitor can save into. Folders the visitor makes are writable too. */
export const WRITABLE_DIRS = [GUEST_PATH, DOCUMENTS_PATH, PICTURES_PATH] as const;

/** XP's own limit on a full path was 260 characters. */
export const MAX_PATH = 240;

/** The visitor's files and folders together: what a move or a delete works on. */
export interface UserTree {
    files: Record<string, UserFile>;
    /** Absolute paths of the folders the visitor made. Every one's parent is writable. */
    folders: readonly string[];
}

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
export function validateUserPath(absPath: string, folders: readonly string[] = userFolders): string | null {
    const cut = absPath.lastIndexOf('/');
    const parent = absPath.slice(0, cut) || '/';
    const name = absPath.slice(cut + 1);
    if (!isWritableDir(parent, folders)) {
        if (parent === SAMPLE_PICTURES_PATH || parent.startsWith(SAMPLE_PICTURES_PATH + '/')) return 'Sample Pictures is read-only.';
        if (parent === HOME || parent.startsWith(HOME + '/')) {
            return 'The portfolio is read-only. Save to My Documents or My Pictures instead.';
        }
        if (parent.startsWith(GUEST_PATH + '/')) return `The folder ${parent} does not exist.`;
        return 'You can only save in /home/guest and the folders inside it.';
    }
    const badName = validateName(name);
    if (badName) return badName;
    if (absPath.length > MAX_PATH) return 'The path is too long. Use a shorter name, or a folder nearer the top.';
    const reserved = [DOCUMENTS_PATH, PICTURES_PATH, SAMPLE_PICTURES_PATH];
    if (reserved.includes(absPath) || folders.includes(absPath)) return 'A folder with that name already exists.';
    return null;
}

/**
 * Why `name` cannot be a file or folder name, or null. XP's rules. A rename types a name, and a
 * "/" in it used to be read as a path, silently moving the item into another folder.
 */
export function validateName(name: string): string | null {
    if (!name.trim()) return 'A file name cannot be empty.';
    if (name !== name.trim()) return 'A file name cannot start or end with a space.';
    if (name === '.' || name === '..') return 'That name is reserved.';
    if (name.length > 64) return 'A file name can be at most 64 characters.';
    if (INVALID_NAME.test(name)) return 'A file name cannot contain any of the following characters: \\ / : * ? " < > |';
    return null;
}

/** True for a folder a visitor may save into: a built-in writable one, or one they made. */
export const isWritableDir = (path: string, folders: readonly string[] = userFolders): boolean =>
    (WRITABLE_DIRS as readonly string[]).includes(path) || folders.includes(path);

/**
 * Why `content` cannot be stored at `absPath`, or null. A .png or .jpg name promises a picture, so
 * only a picture's data: URL may be saved under one — `echo hello > photo.png` used to store the
 * text as a "picture" the viewer then drew as a broken image, and `touch new.jpg` made an empty one.
 */
export function validateUserContent(absPath: string, content: string): string | null {
    const mime = mimeForName(absPath);
    if ((mime === 'image/png' || mime === 'image/jpeg') && !content.startsWith('data:image/')) {
        return 'Only pictures can be saved with a .png or .jpg name.';
    }
    return null;
}

/** True when a path is one a visitor saved (as opposed to a built-in, read-only file). */
export const isUserPath = (absPath: string): boolean => userFiles[absPath] !== undefined;

let userFiles: Record<string, UserFile> = {};
let userFolders: readonly string[] = [];
/** Characters the Recycle Bin's files hold. Not in the tree, but in the same storage. */
let recycledChars = 0;
let guestCache: VDir | null = null;

/**
 * Mount the visitor's files and folders. Called by the store whenever either changes, and by
 * tests. Both are kept by reference — the store replaces them on every write, never mutates them.
 * `recycled` is what the Recycle Bin holds, so `df` can report the space it takes.
 */
export function mountUserFiles(files: Record<string, UserFile>, folders: readonly string[] = [], recycled = 0): void {
    recycledChars = recycled;
    if (files === userFiles && folders === userFolders) return;
    userFiles = files;
    userFolders = folders;
    guestCache = null;
}

const baseName = (path: string) => path.slice(path.lastIndexOf('/') + 1);
const parentOf = (path: string) => path.slice(0, path.lastIndexOf('/')) || '/';
/** `p` with its leading `from` replaced by `to`, if `p` is `from` or inside it. */
const rebase = (p: string, from: string, to: string) =>
    p === from ? to : p.startsWith(from + '/') ? to + p.slice(from.length) : p;
const inside = (p: string, folder: string) => p.startsWith(folder + '/');

/**
 * The next free "New Folder" name in `parent`, as XP numbered them: New Folder, New Folder (2)...
 */
export function nextFolderName(parent: string, tree: UserTree, base = 'New Folder'): string {
    return nextFreeName(parent, tree, base);
}

/**
 * The next free name in `parent` for a new item, numbered the way XP numbered them — the number
 * goes before the extension: New Text Document.txt, New Text Document (2).txt.
 */
export function nextFreeName(parent: string, tree: UserTree, base: string, ext = ''): string {
    // Taken means something is there — not "the name would be refused". Treating a refusal (a path
    // too long for a deep folder) as taken made every numbered name taken too, and the loop never
    // ended: New Folder froze the tab. Whoever creates the item reports the refusal itself.
    const taken = (name: string) => {
        const path = `${parent === '/' ? '' : parent}/${name}`;
        return tree.files[path] !== undefined || tree.folders.includes(path) || lookup(path) !== null;
    };
    if (!taken(base + ext)) return base + ext;
    for (let n = 2; n < 10_000; n++) if (!taken(`${base} (${n})${ext}`)) return `${base} (${n})${ext}`;
    return base + ext;
}

/**
 * The name a pasted copy takes in \`parent\` if its own is taken there, as XP named them:
 * "Copy of notes.txt", then "Copy (2) of notes.txt".
 */
export function copyName(parent: string, name: string, tree: UserTree): string {
    const free = (n: string) => {
        const path = `${parent === '/' ? '' : parent}/${n}`;
        return tree.files[path] === undefined && !tree.folders.includes(path) && !lookup(path);
    };
    if (free(name)) return name;
    if (free(`Copy of ${name}`)) return `Copy of ${name}`;
    for (let n = 2; ; n++) if (free(`Copy (${n}) of ${name}`)) return `Copy (${n}) of ${name}`;
}

/**
 * Copy a file — the visitor's, or one of the portfolio's — or a folder the visitor made, with
 * everything in it, to \`to\`. Pure, like \`planMove\`. A built-in picture is a file on the site, which
 * the browser's storage cannot hold a copy of, and a built-in folder is the portfolio itself: both
 * are refused with the reason rather than half-copied.
 */
export function planCopy(tree: UserTree, from: string, to: string): UserTree | string {
    if (from === '/proc' || from.startsWith('/proc/')) {
        return 'It describes a running window and exists only while that window does. To keep what it says, use cat on it with > into a file.';
    }
    const node = lookup(from);
    if (!node) return `Cannot find ${from}.`;
    if (tree.files[to] !== undefined || tree.folders.includes(to) || lookup(to)) return 'A file or folder with that name already exists.';
    const invalid = validateUserPath(to, tree.folders);
    if (invalid) return invalid;

    if (isDir(node)) {
        if (!tree.folders.includes(from)) {
            const what = from === GUEST_PATH || from.startsWith(GUEST_PATH + '/') ? 'a system folder' : 'part of the portfolio';
            return `${node.name} is ${what}. Its files can be copied one at a time; the folder cannot.`;
        }
        if (inside(to, from)) return 'The destination folder is inside the folder being copied.';
        const files = { ...tree.files };
        for (const [p, f] of Object.entries(tree.files)) if (inside(p, from)) files[rebase(p, from, to)] = f;
        const added = tree.folders.filter((p) => p === from || inside(p, from)).map((p) => rebase(p, from, to));
        if ([...added, ...Object.keys(files)].some((p) => p.length > MAX_PATH)) {
            return 'The path would be too long. Use a shorter name, or a folder nearer the top.';
        }
        return { files, folders: [...tree.folders, ...added].sort() };
    }

    if (node.mime === 'application/x-link' || node.mime === 'application/x-app') {
        return `${node.name} is a shortcut. Shortcuts cannot be copied here.`;
    }
    if (node.src && !node.src.startsWith('data:')) return `${node.name} is a built-in picture. It can be viewed, not copied.`;
    const own = tree.files[from];
    const content = own ? own.content : (node.src ?? node.content);
    const problem = validateUserContent(to, content);
    if (problem) return problem;
    // The copy's name decides its type, as a rename's does.
    return { files: { ...tree.files, [to]: { content, mime: mimeForName(to), modified: own?.modified ?? Date.now() } }, folders: tree.folders };
}

/**
 * Rename or move a visitor's file or folder, with everything inside it. Pure: returns the tree as it
 * would be, or why it cannot be done — the store applies it, the tests check it.
 */
export function planMove(tree: UserTree, from: string, to: string): UserTree | string {
    const isFolder = tree.folders.includes(from);
    const file = tree.files[from];
    if (!isFolder && !file) {
        return lookup(from)
            ? `${baseName(from)} is read-only. Only files and folders you made in /home/guest can be moved or renamed.`
            : `Cannot find ${from}.`;
    }
    if (from === to) return tree;
    if (isFolder && inside(to, from)) {
        return 'The destination folder is inside the folder being moved.';
    }
    if (tree.files[to] !== undefined) return 'A file with that name already exists.';
    const invalid = validateUserPath(to, tree.folders);
    if (invalid) return invalid;
    if (file) {
        const content = validateUserContent(to, file.content);
        if (content) return content;
    }
    const files: Record<string, UserFile> = {};
    for (const [p, f] of Object.entries(tree.files)) {
        const q = rebase(p, from, to);
        if (q.length > MAX_PATH) return 'The path would be too long. Use a shorter name, or a folder nearer the top.';
        // A renamed file takes the type its new name implies, as XP's associations did.
        files[q] = p === from ? { ...f, mime: mimeForName(q) } : f;
    }
    const folders = tree.folders.map((p) => rebase(p, from, to));
    if (folders.some((p) => p.length > MAX_PATH)) return 'The path would be too long. Use a shorter name, or a folder nearer the top.';
    return { files, folders: folders.sort() };
}

/**
 * Delete a folder the visitor made. Without `recursive` only an empty one, as `rmdir` does; with
 * it, everything inside too, as Explorer's delete does. Returns the tree as it would be and how many
 * items went with the folder, or why it cannot be done.
 */
export function planRemoveFolder(tree: UserTree, path: string, recursive: boolean): { tree: UserTree; removed: number } | string {
    if (!tree.folders.includes(path)) {
        return lookup(path)
            ? `${baseName(path)} cannot be deleted. Only folders you made in /home/guest can be.`
            : `Cannot find ${path}.`;
    }
    const files = Object.keys(tree.files).filter((p) => inside(p, path));
    const subfolders = tree.folders.filter((p) => inside(p, path));
    const removed = files.length + subfolders.length;
    if (removed && !recursive) return 'The folder is not empty.';
    const nextFiles = { ...tree.files };
    for (const p of files) delete nextFiles[p];
    return {
        tree: { files: nextFiles, folders: tree.folders.filter((p) => p !== path && !inside(p, path)) },
        removed,
    };
}

/** What a Recycle Bin entry keeps of the visitor's tree: a file, or a folder and everything in it. */
export interface RecycledTree {
    /** Where it was: the file, or the top folder. */
    path: string;
    /** Keyed by the paths they had. */
    files: Record<string, UserFile>;
    folders: string[];
}

/** Characters a set of Recycle Bin entries holds in storage. */
export const recycledSize = (entries: readonly RecycledTree[]): number =>
    entries.reduce((n, e) => n + e.path.length + userFilesSize(e.files, e.folders), 0);

/**
 * Take a visitor's file, or a folder with everything in it, out of the tree for the Recycle Bin.
 * Pure: returns the tree without it and what was taken, or why it cannot be.
 */
export function planRecycle(tree: UserTree, path: string): { tree: UserTree; taken: RecycledTree } | string {
    const isFolder = tree.folders.includes(path);
    const file = tree.files[path];
    if (!isFolder && !file) {
        return lookup(path)
            ? `${baseName(path)} cannot be deleted. Only files and folders you made in /home/guest can be.`
            : `Cannot find ${path}.`;
    }
    if (!isFolder) {
        const files = { ...tree.files };
        delete files[path];
        return { tree: { files, folders: tree.folders }, taken: { path, files: { [path]: file }, folders: [] } };
    }
    const files: Record<string, UserFile> = {};
    const takenFiles: Record<string, UserFile> = {};
    for (const [p, f] of Object.entries(tree.files)) (inside(p, path) ? takenFiles : files)[p] = f;
    const takenFolders = tree.folders.filter((p) => p === path || inside(p, path));
    return {
        tree: { files, folders: tree.folders.filter((p) => !takenFolders.includes(p)) },
        taken: { path, files: takenFiles, folders: takenFolders },
    };
}

/**
 * Put a Recycle Bin entry back where it was. Folders on the way that have gone since are made
 * again, and a folder of the same name already there is merged into, as XP did. A file now
 * standing at one of its paths stops it — nothing is overwritten — and the reason names what is
 * in the way. Its files are held to the same rules as a live save, since the entry came from
 * storage a visitor can edit.
 */
export function planRestore(tree: UserTree, taken: RecycledTree): UserTree | string {
    const name = baseName(taken.path);
    const folders = [...tree.folders];
    const inTheWay = (p: string) =>
        `Cannot restore ${name}: there is already a file or folder named ${baseName(p)} in ${parentOf(p)}. Rename or move it, then try again.`;

    const missing: string[] = [];
    for (let up = parentOf(taken.path); up.startsWith(GUEST_PATH + '/') && !isWritableDir(up, folders); up = parentOf(up)) {
        missing.unshift(up);
    }
    // An entry only ever holds its own item: anything outside it was added by hand, not by the bin.
    const own = (p: string) => p === taken.path || inside(p, taken.path);
    if (![...taken.folders, ...Object.keys(taken.files)].every(own)) return `Cannot restore ${name}: the entry is damaged.`;
    for (const p of [...missing, ...[...taken.folders].sort((a, b) => a.length - b.length)]) {
        if (tree.files[p] !== undefined) return inTheWay(p);
        // A folder of that name already there is merged into, as XP did — it used to refuse, so
        // restoring a file from a deleted folder before the folder itself stranded the rest.
        if (folders.includes(p)) continue;
        const invalid = validateUserPath(p, folders);
        if (invalid) return `Cannot restore ${name}: ${invalid}`;
        folders.push(p);
    }
    const files = { ...tree.files };
    for (const [p, f] of Object.entries(taken.files)) {
        if (files[p] !== undefined || folders.includes(p)) return inTheWay(p);
        const invalid = validateUserPath(p, folders) ?? validateUserContent(p, f.content);
        if (invalid) return `Cannot restore ${name}: ${invalid}`;
        files[p] = f;
    }
    return { files, folders: folders.sort() };
}

/**
 * The folders from storage that are still valid, parents before children. A visitor can edit
 * localStorage by hand, so every one is checked against the same rules a live mkdir obeys.
 */
export function sanitizeFolders(v: unknown): string[] {
    if (!Array.isArray(v)) return [];
    const accepted: string[] = [];
    const candidates = v.filter((p): p is string => typeof p === 'string').sort((a, b) => a.length - b.length);
    for (const p of candidates) if (!accepted.includes(p) && validateUserPath(p, accepted) === null) accepted.push(p);
    return accepted.sort();
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
    /** What the visitor put in `d`: their folders first, then their files, as Explorer sorts. */
    const inDir = (d: string): VNode[] => [
        ...userFolders
            .filter((p) => parentOf(p) === d)
            .sort((a, b) => a.localeCompare(b))
            .map((p): VDir => ({ ...dir(baseName(p), inDir(p), 'A folder you made. Saved in this browser.'), writable: true })),
        ...Object.keys(userFiles)
            .filter((p) => parentOf(p) === d)
            .sort((a, b) => a.localeCompare(b))
            .map((p) => userFileNode(p, userFiles[p])),
    ];

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

/** Characters the mounted visitor files and folders take now, with the Recycle Bin; what `df` reports. */
export const guestUsage = (): number => userFilesSize(userFiles, userFolders) + recycledChars;

/** Of `guestUsage()`, the characters the Recycle Bin holds. */
export const recycledUsage = (): number => recycledChars;

/** Total characters the visitor's files (and folders) would take if they were saved. */
export const userFilesSize = (files: Record<string, UserFile>, folders: readonly string[] = []): number =>
    Object.entries(files).reduce((n, [k, f]) => n + k.length + f.content.length, 0) +
    folders.reduce((n, p) => n + p.length, 0);

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
const rootFor = (procs: ProcEntry[]): VDir => {
    const usr = sourceDir();
    return dir('', [
        ...ROOT.children.map((c) =>
            c.name === 'home' && isDir(c) ? dir('home', [...c.children, guestDir()], c.description) : c,
        ),
        ...(usr ? [usr] : []),
        procDir(procs),
    ]);
};

/* ------------------------------------------------------------ /usr/src */

/**
 * This application's own module graph, as `scripts/gen-architecture.mjs` measured it from the source
 * at build time. The shape is declared here, not imported, so the VFS does not depend on a generated
 * file: whoever needs `/usr/src` loads the data and mounts it (`system/source.ts`), which keeps the
 * graph out of the first page load.
 */
export interface SourceModule {
    path: string;
    layer: string;
    lines: number;
    summary: string | null;
    imports: { to: string; typeOnly: boolean; lazy: boolean }[];
    packages: string[];
}

export interface SourceMap {
    commit: string | null;
    modules: SourceModule[];
    violations: { from: string; to: string; rule: string }[];
}

export const SOURCE_PATH = '/usr/src';

let sourceMap: SourceMap | null = null;
let sourceCache: VDir | null = null;

/** Mount the module graph at /usr/src. Idempotent. */
export function mountSource(map: SourceMap): void {
    if (map === sourceMap) return;
    sourceMap = map;
    sourceCache = null;
}

/** Who imports each module, the other half of the graph. */
export function importersOf(map: SourceMap): Map<string, SourceModule[]> {
    const by = new Map<string, SourceModule[]>();
    for (const m of map.modules) for (const i of m.imports) by.set(i.to, [...(by.get(i.to) ?? []), m]);
    return by;
}

function renderModule(m: SourceModule, importers: SourceModule[]): string {
    const how = (i: { typeOnly: boolean; lazy: boolean }) =>
        i.typeOnly ? '  (types only)' : i.lazy ? '  (loaded when first needed)' : '';
    return [
        heading(m.path),
        '',
        `Layer     : ${m.layer}`,
        `Lines     : ${m.lines.toLocaleString()}`,
        '',
        m.summary ?? '(This module has no doc comment of its own.)',
        '',
        `Imports (${m.imports.length})`,
        ...(m.imports.length ? m.imports.map((i) => `  ${i.to}${how(i)}`) : ['  nothing in this repository']),
        ...(m.packages.length ? ['', `Packages  : ${m.packages.join(', ')}`] : []),
        '',
        `Imported by (${importers.length})`,
        ...(importers.length
            ? importers.map((f) => `  ${f.path}${how(f.imports.find((i) => i.to === m.path)!)}`)
            : ['  nothing — an entry point, or loaded by Next.js itself']),
    ].join('\n');
}

function renderSourceReadme(map: SourceMap): string {
    const layers = new Map<string, number>();
    for (const m of map.modules) layers.set(m.layer, (layers.get(m.layer) ?? 0) + 1);
    return [
        heading('/usr/src'),
        '',
        'This is not the source itself. Each file here describes one module of this desktop, and was',
        'generated from the source when this build was made (scripts/gen-architecture.mjs): its layer,',
        'its line count, the first paragraph of its own doc comment, what it imports and what imports it.',
        '',
        `Build     : ${map.commit ?? 'commit not recorded'}`,
        `Modules   : ${map.modules.length}`,
        ...Array.from(layers.entries()).sort().map(([layer, n]) => `  ${layer.padEnd(16)} ${n}`),
        '',
        'The dependency rule (CLAUDE.md): content/ and system/ never import components/, app/, the',
        'store or React.',
        map.violations.length
            ? `Broken ${map.violations.length} time(s):\n${map.violations.map((v) => `  ${v.from} -> ${v.to}  (${v.rule})`).join('\n')}`
            : 'Checked against every import in this build: it holds.',
        '',
        'System Information (Start > Run > msinfo32) draws the same graph.',
    ].join('\n');
}

function sourceDir(): VDir | null {
    if (!sourceMap) return null;
    if (sourceCache) return sourceCache;
    const map = sourceMap;
    const importers = importersOf(map);
    const root = dir('src', [], 'This desktop\'s own modules, measured from its source at build time');
    for (const m of map.modules) {
        const parts = m.path.split('/');
        let at = root;
        for (const part of parts.slice(0, -1)) {
            let next = at.children.find((c): c is VDir => isDir(c) && c.name === part);
            if (!next) {
                next = dir(part, []);
                at.children.push(next);
            }
            at = next;
        }
        at.children.push(
            file(parts[parts.length - 1], renderModule(m, importers.get(m.path) ?? []), 'text/plain', {
                appId: 'sysinfo',
                payload: { module: m.path },
            }),
        );
    }
    root.children.unshift(file('README', renderSourceReadme(map), 'text/plain', { appId: 'notepad', payload: { path: `${SOURCE_PATH}/README` } }));
    sourceCache = dir('usr', [root], 'Programs and their sources');
    return sourceCache;
}

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

/** What XP's Search Companion asked for. Any criterion left empty matches everything. */
export interface FindQuery {
    /** "All or part of the file name". `*` and `?` work as in XP; without them, any part matches. */
    name?: string;
    /** "A word or phrase in the file". Files only; case does not matter. */
    text?: string;
    /** "Look in": the folder to search, with everything under it. */
    under: string;
}

export interface FindHit {
    path: string;
    node: VNode;
    /** For a text search, the first line that matched. */
    line?: string;
}

/** A name pattern as XP read it: `*.txt`, `re?ume*`, or plain text matching any part of the name. */
function nameMatcher(pattern: string): (name: string) => boolean {
    const p = pattern.trim().toLowerCase();
    if (!p) return () => true;
    if (!/[*?]/.test(p)) return (name) => name.toLowerCase().includes(p);
    const re = new RegExp(`^${p.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.')}$`);
    return (name) => re.test(name.toLowerCase());
}

/**
 * XP's "Search for files or folders": everything under `query.under` whose name matches and, if a
 * phrase is given, whose text contains it. Folders match by name only. At most `limit` hits, in
 * tree order; the caller says when there were more.
 */
export function findFiles(query: FindQuery, procs: ProcEntry[] = [], limit = 200): { hits: FindHit[]; more: boolean } {
    const start = lookup(query.under, procs);
    const matchesName = nameMatcher(query.name ?? '');
    const phrase = (query.text ?? '').trim().toLowerCase();
    const hits: FindHit[] = [];
    let more = false;
    const walk = (node: VNode, path: string) => {
        if (more) return;
        if (path !== query.under && matchesName(node.name)) {
            if (!phrase) hits.push({ path, node });
            else if (isFile(node)) {
                const line = node.content.split('\n').find((l) => l.toLowerCase().includes(phrase));
                if (line !== undefined) hits.push({ path, node, line: line.trim() });
            }
            if (hits.length > limit) {
                hits.pop();
                more = true;
                return;
            }
        }
        if (isDir(node)) node.children.forEach((c) => walk(c, `${path === '/' ? '' : path}/${c.name}`));
    };
    if (start) walk(start, query.under);
    return { hits, more };
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
