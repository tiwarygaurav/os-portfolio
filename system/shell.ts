/**
 * Headless shell.
 *
 * Parses a command line and returns structured output. It never touches React or the DOM — the
 * renderer decides how a `ShellLine` looks. That split is what lets a command be added without
 * editing the terminal component, and what would let this be unit-tested without a browser.
 *
 * Side effects (opening a window, following a link) go through `ShellContext`, supplied by the
 * caller, so the shell has no dependency on the store either.
 */

import { getLog, publish, publishedCount, type LogEntry } from './bus';
import {
    HOME_PATH,
    allPaths,
    isDir,
    isFile,
    listDir,
    lookup,
    renderTree,
    resolvePath,
    searchFiles,
    GUEST_PATH,
    USER_FILES_QUOTA,
    guestUsage,
    recycledUsage,
    type ProcEntry,
    type VNode,
} from './vfs';
import {
    PROFILE,
    PROJECTS,
    ROLES,
    SKILL_GROUPS,
    SYSTEM,
    allSkills,
    isConfidential,
} from '@/content';

/* ------------------------------------------------------------------ types */

export type ShellLine =
    | { kind: 'text'; text: string }
    | { kind: 'muted'; text: string }
    | { kind: 'error'; text: string }
    | { kind: 'success'; text: string }
    | { kind: 'heading'; text: string }
    | { kind: 'pair'; key: string; value: string }
    | { kind: 'entry'; text: string; entry: 'dir' | 'file' | 'link' | 'app' }
    | { kind: 'link'; text: string; href: string }
    | { kind: 'blank' };

export interface ShellResult {
    lines: ShellLine[];
    /** Set when the command changed the working directory. */
    cwd?: string;
    /** `clear` wipes the transcript instead of appending. */
    clear?: boolean;
}

export interface ShellContext {
    cwd: string;
    /**
     * Command history, newest last. A getter, not an array: the renderer owns the list and keeps
     * appending to it, so a snapshot captured when the context was built goes stale immediately —
     * `history` reported "No history yet." for a whole session. Every other live field here is a
     * function for the same reason.
     */
    history: () => string[];
    processes: () => ProcEntry[];
    /** Returns false when no app is registered under that id, so the shell can report honestly. */
    openApp: (appId: string, payload?: Record<string, string>) => boolean;
    /**
     * Close a window. `how` is what the event log records: `kill` is a forced end, `exit` the
     * terminal closing itself the ordinary way.
     */
    closeProcess: (pid: string, how?: 'kill' | 'exit') => boolean;
    openUrl: (url: string) => void;
    /** Registered app ids, for `apps` and for completion. */
    appIds: () => string[];
    /** Create or overwrite a file under /home/guest. Returns why it failed, or null. */
    writeFile: (path: string, content: string) => string | null;
    /** Delete a file under /home/guest. Returns why it failed, or null. */
    deleteFile: (path: string) => string | null;
    /** Make a folder under /home/guest. Returns why it failed, or null. */
    makeDir: (path: string) => string | null;
    /** Rename or move a visitor's file or folder. Returns why it failed, or null. */
    move: (from: string, to: string) => string | null;
    /** Delete a visitor's folder; `recursive` takes its contents too. Returns why it failed, or null. */
    removeDir: (path: string, recursive: boolean) => string | null;
    /** Copy a file, or a visitor's folder with its contents. Returns why it failed, or null. */
    copy: (from: string, to: string) => string | null;
}

interface Command {
    name: string;
    summary: string;
    usage?: string;
    /** Hidden commands work but are not listed by `help`. */
    hidden?: boolean;
    /** `stdin` is the lines piped in from the command before a `|`, when there is one. */
    run: (args: string[], ctx: ShellContext, stdin?: string[]) => ShellResult;
}

/* ---------------------------------------------------------------- helpers */

const text = (t: string): ShellLine => ({ kind: 'text', text: t });
const muted = (t: string): ShellLine => ({ kind: 'muted', text: t });
const error = (t: string): ShellLine => ({ kind: 'error', text: t });
const success = (t: string): ShellLine => ({ kind: 'success', text: t });
const heading = (t: string): ShellLine => ({ kind: 'heading', text: t });
const pair = (k: string, v: string): ShellLine => ({ kind: 'pair', key: k, value: v });
const blank = (): ShellLine => ({ kind: 'blank' });

const out = (...lines: ShellLine[]): ShellResult => ({ lines });

const body = (content: string): ShellLine[] =>
    content.split('\n').map((l) => (l.trim() === '' ? blank() : text(l)));

const entryKind = (n: VNode): 'dir' | 'file' | 'link' | 'app' => {
    if (isDir(n)) return 'dir';
    if (n.mime === 'application/x-link') return 'link';
    if (n.mime === 'application/x-app') return 'app';
    return 'file';
};

const parentPath = (p: string): string => p.slice(0, p.lastIndexOf('/')) || '/';
const baseName = (p: string): string => p.slice(p.lastIndexOf('/') + 1);
const joinPath = (dir: string, name: string): string => `${dir === '/' ? '' : dir}/${name}`;

/**
 * The lines a filter works on: the files named, or else what was piped in. Reading a file is logged
 * as `cat` logs it.
 */
function readInput(name: string, paths: string[], ctx: ShellContext, stdin?: string[]): { lines: string[] } | { error: ShellLine } {
    if (paths.length) {
        const lines: string[] = [];
        for (const arg of paths) {
            const target = resolvePath(ctx.cwd, arg);
            const node = lookup(target, ctx.processes());
            if (!node) return { error: error(`${name}: ${prettyPath(target)}: no such file or directory`) };
            if (isDir(node)) return { error: error(`${name}: ${prettyPath(target)}: is a directory`) };
            publish({ type: 'fs:read', path: prettyPath(target) });
            const own = node.content.split('\n');
            if (own[own.length - 1] === '') own.pop();
            lines.push(...own);
        }
        return { lines };
    }
    if (stdin) return { lines: stdin };
    return { error: error(`${name}: missing operand. Name a file, or pipe something in: ls | ${name}`) };
}

/** `-n 5`, `-n5` or `-5`: how many lines head and tail take. Null when the number is not one. */
function lineCount(args: string[], fallback: number): { n: number | null; rest: string[] } {
    const rest: string[] = [];
    let n: number | null = fallback;
    for (let i = 0; i < args.length; i++) {
        const a = args[i];
        const value = a === '-n' ? args[++i] : a.startsWith('-n') ? a.slice(2) : /^-\d+$/.test(a) ? a.slice(1) : null;
        if (value === null) {
            rest.push(a);
            continue;
        }
        n = /^\d+$/.test(value ?? '') ? Number(value) : null;
    }
    return { n, rest };
}

/** A shell pattern, matched against a whole name: `*.md`, `README*`, `?.txt`. */
function globMatcher(pattern: string, ignoreCase: boolean): (name: string) => boolean {
    const re = new RegExp(`^${pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.')}$`, ignoreCase ? 'i' : '');
    return (name) => re.test(name);
}

/** `~/projects` reads better than `/home/gaurav/projects` in a prompt. */
export const prettyPath = (p: string): string =>
    p === HOME_PATH ? '~' : p.startsWith(HOME_PATH + '/') ? '~' + p.slice(HOME_PATH.length) : p;

/** `events` / `dmesg`: the tail of the bus log, oldest first, the way a terminal reads. */
function runEvents(args: string[]): ShellResult {
    const requested = args[0] ? Number(args[0]) : 20;
    if (!Number.isInteger(requested) || requested <= 0) {
        return out(error(`events: not a positive count: ${args[0]}`));
    }
    const log = getLog();
    if (!log.length) return out(muted('The event log is empty.'));
    const tail = log.slice(-requested);
    const line = (e: LogEntry) => {
        const time = new Date(e.time).toLocaleTimeString();
        const level = e.level === 'information' ? 'info' : e.level === 'warning' ? 'warn' : 'error';
        return pair(`${time} ${level.padEnd(5)}`, `${e.source}: ${e.message}`);
    };
    return out(
        // The log is bounded and can be cleared, so its length is not the session's total.
        muted(`${tail.length} of ${log.length} event${log.length === 1 ? '' : 's'} in the log (${publishedCount()} published this session)`),
        ...tail.map(line),
        blank(),
        muted('The Event Viewer (Start > Run > eventvwr) shows the same log.'),
    );
}

/* --------------------------------------------------------------- commands */

/**
 * The command table has a null prototype.
 *
 * With a plain object literal, `COMMANDS['constructor']` resolves to `Object`'s own constructor,
 * which passed the `if (command)` guard and then threw `command.run is not a function` out of a
 * React event handler — the terminal printed nothing at all. `__proto__` and `toString` behaved
 * the same way. A null prototype means only the commands defined below exist.
 */
const COMMANDS: Record<string, Command> = Object.assign(Object.create(null) as Record<string, Command>, {
    help: {
        name: 'help',
        summary: 'List commands. `help <command>` for detail.',
        run: (args) => {
            if (args[0]) {
                const cmd = findCommand(args[0]);
                if (!cmd) return out(error(`help: no such command: ${args[0]}`));
                return out(
                    heading(cmd.name),
                    text(cmd.summary),
                    ...(cmd.usage ? [blank(), muted(`usage: ${cmd.usage}`)] : []),
                );
            }
            const visible = Object.values(COMMANDS).filter((c) => !c.hidden);
            return out(
                heading('Commands'),
                ...visible.map((c) => pair(c.name, c.summary)),
                blank(),
                muted('Tab completes commands and paths. Up/Down walks history.'),
                muted('This is a real filesystem — every path below ~ resolves to real content.'),
            );
        },
    },

    ls: {
        name: 'ls',
        summary: 'List directory contents.',
        usage: 'ls [path]',
        run: (args, ctx) => {
            const target = resolvePath(ctx.cwd, args[0] ?? '.');
            const children = listDir(target, ctx.processes());
            if (!children) {
                const node = lookup(target, ctx.processes());
                if (node && isFile(node)) return out(text(node.name));
                return out(error(`ls: ${prettyPath(target)}: no such file or directory`));
            }
            if (children.length === 0) return out(muted('(empty)'));
            return out(
                ...children.map((c) => ({
                    kind: 'entry' as const,
                    text: isDir(c) ? `${c.name}/` : c.name,
                    entry: entryKind(c),
                })),
            );
        },
    },

    cd: {
        name: 'cd',
        summary: 'Change directory.',
        usage: 'cd [path]',
        run: (args, ctx) => {
            const target = resolvePath(ctx.cwd, args[0] ?? '~');
            const node = lookup(target, ctx.processes());
            if (!node) return out(error(`cd: ${prettyPath(target)}: no such file or directory`));
            if (!isDir(node)) return out(error(`cd: ${prettyPath(target)}: not a directory`));
            return { lines: [], cwd: target };
        },
    },

    pwd: {
        name: 'pwd',
        summary: 'Print the working directory.',
        run: (_args, ctx) => out(text(ctx.cwd)),
    },

    cat: {
        name: 'cat',
        summary: 'Print a file.',
        usage: 'cat <path>',
        run: (args, ctx, stdin) => {
            if (!args[0]) return stdin ? out(...stdin.map(text)) : out(error('cat: missing operand'));
            const target = resolvePath(ctx.cwd, args[0]);
            const node = lookup(target, ctx.processes());
            if (!node) return out(error(`cat: ${prettyPath(target)}: no such file or directory`));
            if (isDir(node)) return out(error(`cat: ${prettyPath(target)}: is a directory`));
            publish({ type: 'fs:read', path: prettyPath(target) });
            const lines = body(node.content);
            if (node.href) lines.push(blank(), { kind: 'link', text: node.href, href: node.href });
            if (node.open)
                lines.push(blank(), muted(`Tip: \`open ${shellQuote(prettyPath(target))}\` opens this in a window.`));
            return out(...lines);
        },
    },

    touch: {
        name: 'touch',
        summary: 'Create an empty file in /home/guest, or update its time.',
        usage: 'touch <file>...',
        run: (args, ctx) => {
            if (!args.length) return out(error('touch: missing file operand'));
            const lines: ShellLine[] = [];
            for (const arg of args) {
                const target = resolvePath(ctx.cwd, arg);
                const node = lookup(target, ctx.processes());
                if (node && isDir(node)) continue;
                // An existing file keeps its content — for a visitor's picture that is its data URL
                // (`src`), not the one-line description `content` holds for `cat`.
                const keep = node && isFile(node) && node.writable ? (node.src ?? node.content) : '';
                const problem = ctx.writeFile(target, keep);
                if (problem) lines.push(error(`touch: cannot touch '${prettyPath(target)}': ${problem}`));
            }
            return out(...lines);
        },
    },

    rm: {
        name: 'rm',
        summary: 'Delete a file (or, with -r, a folder) you made in /home/guest.',
        usage: 'rm [-rf] <path>...',
        run: (args, ctx) => {
            // Flags combine as in any shell: -r, -R, -f, -rf, -fr. -f is accepted: there is never a
            // prompt to force past, and a missing file is still reported rather than hidden.
            const isFlag = (a: string) => /^-[rRf]+$/.test(a);
            const recursive = args.some((a) => isFlag(a) && /[rR]/.test(a));
            const paths = args.filter((a) => !isFlag(a));
            if (!paths.length) return out(error('rm: missing operand'));
            const lines: ShellLine[] = [];
            for (const arg of paths) {
                const target = resolvePath(ctx.cwd, arg);
                const node = lookup(target, ctx.processes());
                const say = (why: string) => lines.push(error(`rm: cannot remove '${prettyPath(target)}': ${why}`));
                if (!node) say('No such file or directory');
                else if (isDir(node) && !recursive) say('Is a directory. Use rm -r to remove a folder and everything in it.');
                else if (isDir(node)) {
                    const problem = ctx.removeDir(target, true);
                    if (problem) say(problem);
                }
                else if (!node.writable) say('Read-only file system. Only files you saved under /home/guest can be removed.');
                else {
                    const problem = ctx.deleteFile(target);
                    if (problem) say(problem);
                }
            }
            return out(...lines);
        },
    },

    mkdir: {
        name: 'mkdir',
        summary: 'Make a folder in /home/guest.',
        usage: 'mkdir [-p] <folder>...',
        run: (args, ctx) => {
            const parents = args.includes('-p');
            const names = args.filter((a) => a !== '-p');
            if (!names.length) return out(error('mkdir: missing operand'));
            const lines: ShellLine[] = [];
            for (const arg of names) {
                const target = resolvePath(ctx.cwd, arg);
                const existing = lookup(target, ctx.processes());
                if (existing) {
                    if (!(parents && isDir(existing))) lines.push(error(`mkdir: cannot create directory '${prettyPath(target)}': File exists`));
                    continue;
                }
                // -p makes every missing folder on the way, from the top down.
                const chain: string[] = [target];
                if (parents) {
                    for (let up = parentPath(target); up !== '/' && !lookup(up, ctx.processes()); up = parentPath(up)) chain.unshift(up);
                }
                // Something on the way that is a file, not a folder: say so, rather than "does not exist".
                const onTheWay = lookup(parentPath(chain[0]), ctx.processes());
                if (onTheWay && !isDir(onTheWay)) {
                    lines.push(error(`mkdir: cannot create directory '${prettyPath(target)}': Not a directory`));
                    continue;
                }
                for (const folder of chain) {
                    const problem = ctx.makeDir(folder);
                    if (problem) {
                        lines.push(error(`mkdir: cannot create directory '${prettyPath(folder)}': ${problem}`));
                        break;
                    }
                }
            }
            return out(...lines);
        },
    },

    rmdir: {
        name: 'rmdir',
        summary: 'Remove an empty folder you made in /home/guest.',
        usage: 'rmdir <folder>...',
        run: (args, ctx) => {
            if (!args.length) return out(error('rmdir: missing operand'));
            const lines: ShellLine[] = [];
            for (const arg of args) {
                const target = resolvePath(ctx.cwd, arg);
                const node = lookup(target, ctx.processes());
                const say = (why: string) => lines.push(error(`rmdir: failed to remove '${prettyPath(target)}': ${why}`));
                if (!node) say('No such file or directory');
                else if (!isDir(node)) say('Not a directory');
                else {
                    const problem = ctx.removeDir(target, false);
                    if (problem) say(problem === 'The folder is not empty.' ? 'Directory not empty. rm -r removes it with everything inside.' : problem);
                }
            }
            return out(...lines);
        },
    },

    mv: {
        name: 'mv',
        summary: 'Rename or move a file or folder you made in /home/guest.',
        usage: 'mv <source>... <destination>',
        run: (args, ctx) => {
            if (args.length < 2) return out(error(args.length ? `mv: missing destination file operand after '${args[0]}'` : 'mv: missing file operand'));
            const dest = resolvePath(ctx.cwd, args[args.length - 1]);
            const destNode = lookup(dest, ctx.processes());
            const intoDir = !!destNode && isDir(destNode);
            const sources = args.slice(0, -1);
            if (sources.length > 1 && !intoDir) return out(error(`mv: target '${prettyPath(dest)}' is not a directory`));
            const lines: ShellLine[] = [];
            for (const arg of sources) {
                const from = resolvePath(ctx.cwd, arg);
                const to = intoDir ? joinPath(dest, baseName(from)) : dest;
                if (!lookup(from, ctx.processes())) {
                    lines.push(error(`mv: cannot stat '${prettyPath(from)}': No such file or directory`));
                    continue;
                }
                if (to === from) continue;
                const problem = ctx.move(from, to);
                if (problem) lines.push(error(`mv: cannot move '${prettyPath(from)}' to '${prettyPath(to)}': ${problem}`));
            }
            return out(...lines);
        },
    },

    cp: {
        name: 'cp',
        summary: 'Copy a file — yours or the portfolio\'s — or, with -r, a folder, into /home/guest.',
        usage: 'cp [-r] <source>... <destination>',
        run: (rawArgs, ctx) => {
            const recursive = rawArgs.some((a) => /^-[rR]+$/.test(a));
            const args = rawArgs.filter((a) => !/^-[rR]+$/.test(a));
            if (args.length < 2) return out(error(args.length ? `cp: missing destination file operand after '${args[0]}'` : 'cp: missing file operand'));
            const dest = resolvePath(ctx.cwd, args[args.length - 1]);
            const destNode = lookup(dest, ctx.processes());
            const intoDir = !!destNode && isDir(destNode);
            const sources = args.slice(0, -1);
            if (sources.length > 1 && !intoDir) return out(error(`cp: target '${prettyPath(dest)}' is not a directory`));
            const lines: ShellLine[] = [];
            for (const arg of sources) {
                const from = resolvePath(ctx.cwd, arg);
                const node = lookup(from, ctx.processes());
                const say = (why: string) => lines.push(error(`cp: cannot copy '${prettyPath(from)}': ${why}`));
                if (!node) { say('No such file or directory'); continue; }
                if (isDir(node) && !recursive) { say('Is a directory. Use cp -r to copy a folder.'); continue; }
                const to = intoDir ? joinPath(dest, node.name) : dest;
                if (to === from) { say('it is the same file'); continue; }
                // One rule for what can be copied, shared with Explorer's Copy and Paste: a built-in
                // picture or folder is refused with the reason, and nothing is overwritten.
                const problem = ctx.copy(from, to);
                if (problem) say(problem);
            }
            return out(...lines);
        },
    },

    head: {
        name: 'head',
        summary: 'The first lines of a file, or of what is piped in.',
        usage: 'head [-n N] [file]',
        run: (args, ctx, stdin) => {
            const { n, rest } = lineCount(args, 10);
            if (n === null) return out(error('head: invalid number of lines'));
            const input = readInput('head', rest, ctx, stdin);
            return 'error' in input ? out(input.error) : out(...input.lines.slice(0, n).map(text));
        },
    },

    tail: {
        name: 'tail',
        summary: 'The last lines of a file, or of what is piped in.',
        usage: 'tail [-n N] [file]',
        run: (args, ctx, stdin) => {
            const { n, rest } = lineCount(args, 10);
            if (n === null) return out(error('tail: invalid number of lines'));
            const input = readInput('tail', rest, ctx, stdin);
            return 'error' in input ? out(input.error) : out(...(n ? input.lines.slice(-n) : []).map(text));
        },
    },

    wc: {
        name: 'wc',
        summary: 'Count lines, words and characters.',
        usage: 'wc [-l | -w | -m] [file]',
        run: (args, ctx, stdin) => {
            const flag = args.find((a) => /^-[lwm]$/.test(a));
            const input = readInput('wc', args.filter((a) => !/^-[lwm]$/.test(a)), ctx, stdin);
            if ('error' in input) return out(input.error);
            const lines = input.lines.length;
            const words = input.lines.join(' ').split(/\s+/).filter(Boolean).length;
            const chars = input.lines.reduce((sum, l) => sum + l.length + 1, 0);
            if (flag === '-l') return out(text(String(lines)));
            if (flag === '-w') return out(text(String(words)));
            if (flag === '-m') return out(text(String(chars)));
            return out(text(`${String(lines).padStart(7)} ${String(words).padStart(7)} ${String(chars).padStart(7)}`));
        },
    },

    sort: {
        name: 'sort',
        summary: 'Sort lines: alphabetically, or by number with -n.',
        usage: 'sort [-r] [-n] [file]',
        run: (args, ctx, stdin) => {
            const reverse = args.includes('-r');
            const numeric = args.includes('-n');
            const input = readInput('sort', args.filter((a) => a !== '-r' && a !== '-n'), ctx, stdin);
            if ('error' in input) return out(input.error);
            const sorted = [...input.lines].sort((a, b) =>
                numeric ? (parseFloat(a) || 0) - (parseFloat(b) || 0) || a.localeCompare(b) : a.localeCompare(b),
            );
            return out(...(reverse ? sorted.reverse() : sorted).map(text));
        },
    },

    uniq: {
        name: 'uniq',
        summary: 'Drop repeated lines next to each other; -c counts them.',
        usage: 'uniq [-c] [file]',
        run: (args, ctx, stdin) => {
            const counts = args.includes('-c');
            const input = readInput('uniq', args.filter((a) => a !== '-c'), ctx, stdin);
            if ('error' in input) return out(input.error);
            const runs: { line: string; n: number }[] = [];
            for (const line of input.lines) {
                const last = runs[runs.length - 1];
                if (last && last.line === line) last.n++;
                else runs.push({ line, n: 1 });
            }
            return out(...runs.map((r) => text(counts ? `${String(r.n).padStart(7)} ${r.line}` : r.line)));
        },
    },

    find: {
        name: 'find',
        summary: 'List the files and folders under a folder, optionally by name or kind.',
        usage: 'find [folder] [-name pattern] [-iname pattern] [-type f|d]',
        run: (args, ctx) => {
            let start = '.';
            let match: ((name: string) => boolean) | null = null;
            let kind: 'f' | 'd' | null = null;
            for (let i = 0; i < args.length; i++) {
                const a = args[i];
                if (a === '-name' || a === '-iname') {
                    const pattern = args[++i];
                    if (!pattern) return out(error(`find: missing argument to \`${a}'`));
                    match = globMatcher(pattern, a === '-iname');
                } else if (a === '-type') {
                    const t = args[++i];
                    if (t !== 'f' && t !== 'd') return out(error("find: -type takes f (files) or d (folders)"));
                    kind = t;
                } else if (a.startsWith('-')) {
                    return out(error(`find: unknown predicate '${a}'`));
                } else {
                    start = a;
                }
            }
            const root = resolvePath(ctx.cwd, start);
            const top = lookup(root, ctx.processes());
            if (!top) return out(error(`find: '${start}': No such file or directory`));
            const found: string[] = [];
            const walk = (node: VNode, path: string) => {
                const fits = (!match || match(node.name || '/')) && (!kind || (kind === 'd') === isDir(node));
                if (fits) found.push(prettyPath(path));
                if (isDir(node)) node.children.forEach((c) => walk(c, joinPath(path, c.name)));
            };
            walk(top, root);
            return out(...found.map(text));
        },
    },

    df: {
        name: 'df',
        summary: 'How much room your files in /home/guest are using.',
        run: () => {
            const used = guestUsage();
            const pct = Math.round((used / USER_FILES_QUOTA) * 100);
            const kb = (n: number) => `${Math.round(n / 1024)}K`.padStart(7);
            return out(
                heading('Filesystem     Size    Used   Avail  Use%  Mounted on'),
                text(`localStorage ${kb(USER_FILES_QUOTA)} ${kb(used)} ${kb(USER_FILES_QUOTA - used)}  ${String(pct).padStart(3)}%  ${GUEST_PATH}`),
                text('content/       (built into the page, read-only)       /home/' + HOME_PATH.split('/').pop()),
                blank(),
                ...(recycledUsage() > 0
                    ? [muted(`${recycledUsage() < 1024 ? `${recycledUsage()} bytes` : `${Math.round(recycledUsage() / 1024)}K`} of that is in the Recycle Bin. Empty it to free the space.`)]
                    : []),
                muted('Files you save in /home/guest live in this browser only. Nobody else can see them.'),
            );
        },
    },

    tree: {
        name: 'tree',
        summary: 'Show the filesystem as a tree.',
        usage: 'tree [path]',
        run: (args, ctx) => {
            const target = resolvePath(ctx.cwd, args[0] ?? '.');
            const lines = renderTree(target, ctx.processes());
            if (!lines.length) return out(error(`tree: ${prettyPath(target)}: no such directory`));
            return out(...lines.map((l, i) => (i === 0 ? heading(l) : text(l))));
        },
    },

    grep: {
        name: 'grep',
        summary: 'Search every file for a term — or, after a |, the lines piped in. Case does not matter.',
        usage: 'grep [-v] [-c] <term>',
        run: (args, ctx, stdin) => {
            const invert = args.includes('-v');
            const countOnly = args.includes('-c');
            const term = args.filter((a) => a !== '-v' && a !== '-c' && a !== '-i').join(' ');
            if (!term) return out(error('grep: missing search term'));
            const needle = term.toLowerCase();
            if (stdin) {
                const kept = stdin.filter((l) => l.toLowerCase().includes(needle) !== invert);
                return countOnly ? out(text(String(kept.length))) : out(...kept.map(text));
            }
            if (invert) return out(error('grep: -v filters lines piped in, e.g.  ls | grep -v .md'));
            const hits = searchFiles(term, ctx.processes());
            if (countOnly) return out(text(String(hits.length)));
            if (!hits.length) return out(muted(`No matches for "${term}".`));
            return out(
                muted(`${hits.length} match${hits.length === 1 ? '' : 'es'}`),
                ...hits.slice(0, 40).map((h) => pair(prettyPath(h.path), h.line)),
                ...(hits.length > 40 ? [muted(`… ${hits.length - 40} more`)] : []),
            );
        },
    },

    open: {
        name: 'open',
        summary: 'Open a path or an app in a window.',
        usage: 'open <path|app>',
        run: (args, ctx) => {
            const arg = args[0];
            if (!arg) return out(error('open: missing operand'));

            const target = resolvePath(ctx.cwd, arg);
            const node = lookup(target, ctx.processes());

            if (node && isFile(node)) {
                if (node.href) {
                    ctx.openUrl(node.href);
                    return out(success(`Opening ${node.href}`));
                }
                if (node.open) {
                    return ctx.openApp(node.open.appId, node.open.payload)
                        ? out(success(`Opening ${node.open.appId}…`))
                        : out(error(`open: no app registered as "${node.open.appId}"`));
                }
                return out(muted(`${prettyPath(target)} has no associated window. Use \`cat\`.`));
            }

            if (node && isDir(node)) {
                // A directory can carry the same `open` hint a file does, so this no longer
                // guesses from a hardcoded '/projects/' substring — the VFS says what a path
                // represents, and every surface that resolves paths agrees by construction.
                if (node.open) {
                    return ctx.openApp(node.open.appId, node.open.payload)
                        ? out(success(`Opening ${node.open.appId}…`))
                        : out(error(`open: no app registered as "${node.open.appId}"`));
                }
                return out(muted(`${prettyPath(target)} is a directory. Use \`ls\` or \`tree\`.`));
            }

            // Fall back to treating the argument as an app id.
            return ctx.openApp(arg)
                ? out(success(`Opening ${arg}…`))
                : out(
                    error(`open: ${arg}: no such path, and no app registered under that id`),
                    muted('`apps` lists what can be opened.'),
                );
        },
    },

    ps: {
        name: 'ps',
        summary: 'List running windows as processes.',
        run: (_args, ctx) => {
            const procs = ctx.processes();
            if (!procs.length) return out(muted('No windows open.'));

            /*
             * Column widths are measured, not assumed. A fixed `padEnd(8)` used to run the pid
             * straight into the state for longer ids ("w10running"), which made the pid
             * unreadable and `kill` unusable — the one command that requires copying a value off
             * the screen. `+ 2` guarantees a gap even for the widest entry.
             */
            const pidW = Math.max(3, ...procs.map((p) => p.pid.length)) + 2;
            const stateW = Math.max(5, ...procs.map((p) => p.state.length)) + 2;
            const row = (pid: string, state: string, z: string, name: string) =>
                `${pid.padEnd(pidW)}${state.padEnd(stateW)}${z.padEnd(5)}${name}`;

            return out(
                heading(row('PID', 'STATE', 'Z', 'NAME')),
                ...procs.map((p) => text(row(p.pid, p.state, String(p.zIndex), p.title))),
                blank(),
                muted('These are the actual windows in the window manager, not a simulation.'),
                muted('`kill <pid>` closes one.'),
            );
        },
    },

    kill: {
        name: 'kill',
        summary: 'Close a window by pid.',
        usage: 'kill <pid>',
        run: (args, ctx) => {
            if (!args[0]) return out(error('kill: missing pid'));
            const ok = ctx.closeProcess(args[0], 'kill');
            return ok
                ? out(success(`Closed ${args[0]}.`))
                : out(error(`kill: ${args[0]}: no such process`));
        },
    },

    whoami: {
        name: 'whoami',
        summary: 'Who this environment belongs to.',
        run: () =>
            out(
                heading(PROFILE.name),
                text(PROFILE.title),
                blank(),
                ...PROFILE.focus.map((f) => text(`  · ${f}`)),
                blank(),
                muted('`cat ~/about.md` for the longer answer.'),
            ),
    },

    projects: {
        name: 'projects',
        summary: 'List projects, flagging which are proprietary.',
        run: () =>
            out(
                heading('Projects'),
                ...PROJECTS.flatMap((p) => [
                    pair(p.id, `${isConfidential(p) ? '[confidential] ' : ''}${p.summary}`),
                    muted(
                        `        ${p.stack.slice(0, 4).join(' · ')}${p.context ? `  —  ${p.context}` : ''}`,
                    ),
                ]),
                blank(),
                muted('`cat ~/projects/<id>/README.md` for detail, `open ~/projects/<id>` for the window.'),
                muted('[confidential] means the work is real but its source belongs to an employer.'),
            ),
    },

    experience: {
        name: 'experience',
        summary: 'Employment history.',
        run: () =>
            out(
                heading('Experience'),
                ...ROLES.flatMap((r) => [
                    pair(r.company, `${r.title.value}${r.current ? '  (current)' : ''}`),
                    muted(`        ${r.period.value} · ${r.location.value}`),
                    ...(r.highlights.length === 0
                        ? [muted('        details pending — nothing recorded for this role yet')]
                        : []),
                    ...(r.title.from === 'needs-confirmation' || r.period.from === 'needs-confirmation'
                        ? [muted(`        [unconfirmed — cat ~/experience/${r.id}.md]`)]
                        : []),
                ]),
            ),
    },

    skills: {
        name: 'skills',
        summary: 'Skills, grouped, with the work that evidences them.',
        run: () =>
            out(
                heading('Skills'),
                ...SKILL_GROUPS.flatMap((g) => [
                    blank(),
                    text(g.label),
                    ...g.skills.map((s) =>
                        pair(`  ${s.name}`, `${s.level}${s.evidence.length ? ` — ${s.evidence.join(', ')}` : ''}`),
                    ),
                ]),
                blank(),
                muted('No percentages: `evidence <skill>` shows where each was used.'),
            ),
    },

    evidence: {
        name: 'evidence',
        summary: 'Show where a skill was actually used.',
        usage: 'evidence <skill>',
        run: (args) => {
            const q = args.join(' ').toLowerCase();
            if (!q) return out(error('evidence: name a skill'));
            const matches = allSkills().filter((s) => s.name.toLowerCase().includes(q));
            if (!matches.length) return out(muted(`No skill matching "${q}".`));
            return out(
                ...matches.flatMap((s) => [
                    heading(s.name),
                    pair('level', s.level),
                    ...(s.evidence.length
                        ? s.evidence.map((e) => pair('used in', e))
                        : [muted('  claimed, but not evidenced by anything in this filesystem')]),
                    blank(),
                ]),
            );
        },
    },

    contact: {
        name: 'contact',
        summary: 'How to reach him.',
        run: (_args, ctx) => {
            const node = lookup(`${HOME_PATH}/contact.md`, ctx.processes());
            return out(...(node && isFile(node) ? body(node.content) : [error('contact: unavailable')]));
        },
    },

    resume: {
        name: 'resume',
        summary: 'Open the resume window.',
        run: (_args, ctx) =>
            ctx.openApp('resume')
                ? out(success('Opening resume…'))
                : out(error('resume: no resume app registered')),
    },

    apps: {
        name: 'apps',
        summary: 'List every app that can be opened.',
        run: (_args, ctx) => {
            const ids = ctx.appIds();
            if (!ids.length) return out(muted('No apps registered.'));
            return out(
                heading('Installed'),
                ...ids.map((id) => ({ kind: 'entry' as const, text: id, entry: 'app' as const })),
                blank(),
                muted('`open <id>` launches one.'),
            );
        },
    },

    sysinfo: {
        name: 'sysinfo',
        summary: 'The real stack this environment runs on.',
        run: (_args, ctx) => {
            const node = lookup('/etc/system.conf', ctx.processes());
            return out(...(node && isFile(node) ? body(node.content) : [error('sysinfo: unavailable')]));
        },
    },

    neofetch: {
        name: 'neofetch',
        summary: 'System summary.',
        run: (_args, ctx) => {
            const procs = ctx.processes();
            return out(
                heading(`${SYSTEM.shellUser}@${SYSTEM.shellHost}`),
                pair('OS', `${SYSTEM.name} ${SYSTEM.version} (${SYSTEM.codename})`),
                pair('Ancestor', SYSTEM.ancestor),
                pair('Kernel', 'Next.js 14 · React 18'),
                pair('Shell', 'portfolio-sh 1.0 (headless)'),
                pair('State', 'Zustand 4 + persist'),
                pair('Filesystem', 'generated from content/ at module load'),
                pair('Processes', `${procs.length} window${procs.length === 1 ? '' : 's'}`),
                pair('Owner', PROFILE.name),
                blank(),
                muted('`cat /etc/system.conf` for the full stack, `cat /var/log/boot.log` for init.'),
            );
        },
    },

    events: {
        name: 'events',
        summary: 'The system event log: what this session has actually done.',
        usage: 'events [count]',
        run: (args) => runEvents(args),
    },

    dmesg: {
        name: 'dmesg',
        summary: 'Alias for `events`.',
        hidden: true,
        run: (args) => runEvents(args),
    },

    uname: {
        name: 'uname',
        summary: 'Environment name and version.',
        run: () => out(text(`${SYSTEM.name} ${SYSTEM.version} (${SYSTEM.codename})`)),
    },

    history: {
        name: 'history',
        summary: 'Commands entered this session.',
        run: (_args, ctx) => {
            const entries = ctx.history();
            return entries.length
                ? out(...entries.map((h, i) => pair(String(i + 1).padStart(3), h)))
                : out(muted('No history yet.'));
        },
    },

    date: {
        name: 'date',
        summary: 'Current date and time.',
        run: () => out(text(new Date().toString())),
    },

    echo: {
        name: 'echo',
        summary: 'Print the arguments.',
        usage: 'echo <text>',
        run: (args) => out(text(args.join(' '))),
    },

    clear: {
        name: 'clear',
        summary: 'Clear the transcript.',
        run: () => ({ lines: [], clear: true }),
    },

    sudo: {
        name: 'sudo',
        summary: 'Elevate. (There is something behind this.)',
        hidden: true,
        run: (args) =>
            out(
                muted(`sudo: ${args.join(' ') || '(no command)'}`),
                error('Permission denied.'),
                blank(),
                muted('Root access is not wired up yet — it is the next hidden layer, not a joke.'),
                muted('When it lands it will expose the store, the module graph and legacy XP mode.'),
            ),
    },

    exit: {
        name: 'exit',
        summary: 'Close the terminal window.',
        hidden: true,
        run: (_args, ctx) => {
            const self = ctx.processes().find((p) => p.appId === 'terminal');
            if (self) ctx.closeProcess(self.pid, 'exit');
            return out(muted('Closing.'));
        },
    },
} satisfies Record<string, Command>);

/** Look up a command by name. Returns undefined for anything not defined in the table. */
const findCommand = (name: string): Command | undefined => COMMANDS[name.toLowerCase()];

/* ----------------------------------------------------------------- runtime */

export const WELCOME: ShellLine[] = [
    heading(`${SYSTEM.name} ${SYSTEM.version} — ${SYSTEM.codename}`),
    muted(SYSTEM.tagline),
    blank(),
    text('This shell reads the same data the windows do. Nothing here is faked.'),
    muted('Type `help`, or try `ls ~`, `tree ~/projects`, `sysinfo`.'),
    blank(),
];

interface Token {
    value: string;
    /** Any part of it was quoted. A quoted ">" is text, never a redirection. */
    quoted: boolean;
}

/** Split a command line, honouring double and single quotes. */
/**
 * Does the character at `i` open a quote? A double quote always does (an unclosed one is left open
 * on purpose, so Tab can keep completing inside `"My Documents/`). A single quote only does when a
 * closing one follows — otherwise it is an apostrophe: `echo I'm done > note.txt` used to open a
 * quote that swallowed the rest of the line, redirect included.
 */
const opensQuote = (input: string, i: number): boolean =>
    input[i] === '"' || (input[i] === "'" && input.indexOf("'", i + 1) !== -1);

/** Quote a path for display in a command the visitor may copy, when it needs quoting. */
export const shellQuote = (path: string): string => (/[\s']/.test(path) ? `"${path}"` : path);

function tokenize(input: string): Token[] {
    const tokens: Token[] = [];
    let current = '';
    let quote: '"' | "'" | null = null;
    let wasQuoted = false;
    let started = false;
    for (let i = 0; i < input.length; i++) {
        const ch = input[i];
        if (quote) {
            if (ch === quote) quote = null;
            else current += ch;
            continue;
        }
        if ((ch === '"' || ch === "'") && opensQuote(input, i)) {
            quote = ch;
            wasQuoted = true;
            started = true;
            continue;
        }
        if (ch === ' ' || ch === '|') {
            if (started) tokens.push({ value: current, quoted: wasQuoted });
            // A pipe separates commands even with no spaces around it: ls|grep md.
            if (ch === '|') tokens.push({ value: '|', quoted: false });
            current = '';
            wasQuoted = false;
            started = false;
            continue;
        }
        current += ch;
        started = true;
    }
    if (started) tokens.push({ value: current, quoted: wasQuoted });
    return tokens;
}

/** The text a line contributes when output is redirected to a file. Hints and errors do not. */
function lineText(l: ShellLine): string | null {
    switch (l.kind) {
        case 'muted':
        case 'error':
            return null;
        case 'blank':
            return '';
        case 'pair':
            return `${l.key}  ${l.value}`;
        default:
            return l.text;
    }
}

/**
 * `command > file` and `command >> file`. Only files under /home/guest can be written, and the
 * refusal says so; errors from the command itself still print, as stderr would.
 */
function redirect(tokens: Token[], at: number, ctx: ShellContext, stdin?: string[]): ShellResult {
    const append = tokens[at].value === '>>';
    const targetTok = tokens[at + 1];
    if (!targetTok) return out(error("syntax error near unexpected token `newline'"));
    if (tokens.length > at + 2) return out(error(`syntax error near unexpected token \`${tokens[at + 2].value}'`));

    const result = at === 0 ? { lines: [] } : execute(tokens.slice(0, at).map((t) => t.value), ctx, stdin);
    const stderr = result.lines.filter((l) => l.kind === 'error');
    const body = result.lines.map(lineText).filter((t): t is string => t !== null);
    while (body.length && body[body.length - 1] === '') body.pop();

    const target = resolvePath(ctx.cwd, targetTok.value);
    const existing = lookup(target, ctx.processes());
    if (existing && isDir(existing)) return { ...result, lines: [...stderr, error(`${prettyPath(target)}: Is a directory`)] };
    if (append && existing && isFile(existing) && existing.src) {
        return { ...result, lines: [...stderr, error(`${prettyPath(target)}: cannot append text to an image`)] };
    }

    const before = append && existing && isFile(existing) ? existing.content : '';
    const joined = body.length ? body.join('\n') + '\n' : '';
    const content = before && !before.endsWith('\n') && joined ? `${before}\n${joined}` : before + joined;
    const problem = ctx.writeFile(target, content);
    return {
        ...result,
        clear: false,
        lines: [...stderr, ...(problem ? [error(`${prettyPath(target)}: ${problem}`)] : [])],
    };
}

function execute(tokens: string[], ctx: ShellContext, stdin?: string[]): ShellResult {
    if (!tokens.length) return { lines: [] };
    const [name, ...args] = tokens;
    const command = findCommand(name);
    if (command) return command.run(args, ctx, stdin);

    // Bare path? Treat it as `cat`/`cd` so exploring is forgiving.
    if (name.startsWith('/') || name.startsWith('~') || name.startsWith('.')) {
        const target = resolvePath(ctx.cwd, name);
        const node = lookup(target, ctx.processes());
        if (node) return COMMANDS[isDir(node) ? 'cd' : 'cat'].run([name], ctx);
    }

    return out(
        error(`${name}: command not found`),
        muted('Type `help` for the list.'),
    );
}

const isRedirect = (t: Token) => !t.quoted && (t.value === '>' || t.value === '>>');

/** What a command's output is as text, for the next command in a pipeline: what `>` would write. */
function outputLines(result: ShellResult): string[] {
    const lines = result.lines.map(lineText).filter((t): t is string => t !== null);
    while (lines.length && lines[lines.length - 1] === '') lines.pop();
    return lines;
}

export function runCommand(input: string, ctx: ShellContext): ShellResult {
    const tokens = tokenize(input.trim());
    if (!tokens.length) return { lines: [] };

    // Split on unquoted |. A quoted "|" is just text.
    const stages: Token[][] = [[]];
    for (const t of tokens) {
        if (!t.quoted && t.value === '|') stages.push([]);
        else stages[stages.length - 1].push(t);
    }
    if (stages.some((stage) => stage.length === 0)) return out(error("syntax error near unexpected token `|'"));

    if (stages.length === 1) {
        const at = tokens.findIndex(isRedirect);
        if (at !== -1) return redirect(tokens, at, ctx);
        return execute(tokens.map((t) => t.value), ctx);
    }

    /*
     * A pipeline: each command's text output is the next one's input. What a command reports as an
     * error still shows, as stderr would. It runs as a subshell does in bash — a cd inside it changes
     * nothing, and clear does not clear — and only the last command may be redirected.
     */
    const errors: ShellLine[] = [];
    let stdin: string[] | undefined;
    for (const stage of stages.slice(0, -1)) {
        if (stage.some(isRedirect)) return out(error('Only the last command in a pipeline can be redirected with > or >>.'));
        const result = execute(stage.map((t) => t.value), ctx, stdin);
        errors.push(...result.lines.filter((l) => l.kind === 'error'));
        stdin = outputLines(result);
    }
    const last = stages[stages.length - 1];
    const at = last.findIndex(isRedirect);
    const result = at !== -1 ? redirect(last, at, ctx, stdin) : execute(last.map((t) => t.value), ctx, stdin);
    return { lines: [...errors, ...result.lines] };
}

/**
 * Where the argument being completed starts in `input`, respecting quotes, and its unquoted value.
 * Names such as "My Documents" contain a space, so splitting on spaces is not enough.
 */
function lastArgument(input: string): { start: number; value: string; isFirst: boolean } {
    let quote: string | null = null;
    let start = 0;
    for (let i = 0; i < input.length; i++) {
        const ch = input[i];
        if (quote) {
            if (ch === quote) quote = null;
        } else if ((ch === '"' || ch === "'") && opensQuote(input, i)) {
            quote = ch;
        } else if (ch === ' ') {
            start = i + 1;
        }
    }
    // Unquote with the tokenizer itself, so an apostrophe in a name survives completion.
    const value = tokenize(input.slice(start))[0]?.value ?? '';
    const before = input.slice(0, start).trim();
    // After a |, the next word is a command again.
    return { start, value, isFirst: before === '' || before.endsWith('|') };
}

/** How a completion is written back: quoted when it has a space or apostrophe, left open on folders. */
const quoteCandidate = (value: string, isDirectory: boolean): string =>
    /[\s']/.test(value) ? `"${value}${isDirectory ? '' : '"'}` : value;

/** Replace the argument being completed with `candidate` (as returned by `complete`). */
export function applyCompletion(input: string, candidate: string): string {
    return input.slice(0, lastArgument(input).start) + candidate;
}

/** Tab completion: command names at position 0, filesystem paths after. */
export function complete(input: string, ctx: ShellContext): string[] {
    const { value: last, isFirst } = lastArgument(input);
    const first = tokenize(input)[0]?.value ?? '';

    if (isFirst) {
        return Object.keys(COMMANDS).filter((c) => c.startsWith(last.toLowerCase()));
    }

    /*
     * Split the argument into the directory it names and the leaf being completed. An empty
     * argument (`ls ` + Tab) completes against the working directory — it used to resolve to
     * `/` and offer root entries that did not exist relative to where the user actually was.
     */
    const cut = last.lastIndexOf('/');
    const head = cut === -1 ? '' : last.slice(0, cut + 1);
    const leaf = cut === -1 ? last : last.slice(cut + 1);
    const absPrefix = resolvePath(ctx.cwd, head || '.');
    const children = listDir(absPrefix, ctx.processes()) ?? [];

    const paths = children
        .filter((c) => c.name.startsWith(leaf))
        .map((c) => quoteCandidate(head + c.name + (isDir(c) ? '/' : ''), isDir(c)));

    // `open ter<tab>` should also reach app ids, which are not filesystem entries.
    if (first === 'open') {
        paths.push(...ctx.appIds().filter((id) => id.startsWith(last) && !paths.includes(id)));
    }

    return paths;
}

export const commandNames = (): string[] =>
    Object.values(COMMANDS)
        .filter((c) => !c.hidden)
        .map((c) => c.name);

export { allPaths };
