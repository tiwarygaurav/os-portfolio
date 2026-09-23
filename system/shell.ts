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
}

interface Command {
    name: string;
    summary: string;
    usage?: string;
    /** Hidden commands work but are not listed by `help`. */
    hidden?: boolean;
    run: (args: string[], ctx: ShellContext) => ShellResult;
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
        run: (args, ctx) => {
            if (!args[0]) return out(error('cat: missing operand'));
            const target = resolvePath(ctx.cwd, args[0]);
            const node = lookup(target, ctx.processes());
            if (!node) return out(error(`cat: ${prettyPath(target)}: no such file or directory`));
            if (isDir(node)) return out(error(`cat: ${prettyPath(target)}: is a directory`));
            publish({ type: 'fs:read', path: prettyPath(target) });
            const lines = body(node.content);
            if (node.href) lines.push(blank(), { kind: 'link', text: node.href, href: node.href });
            if (node.open)
                lines.push(blank(), muted(`Tip: \`open ${prettyPath(target)}\` opens this in a window.`));
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
                const problem = ctx.writeFile(target, node && isFile(node) && node.writable && !node.src ? node.content : '');
                if (problem) lines.push(error(`touch: cannot touch '${prettyPath(target)}': ${problem}`));
            }
            return out(...lines);
        },
    },

    rm: {
        name: 'rm',
        summary: 'Delete a file you saved in /home/guest.',
        usage: 'rm <file>...',
        run: (args, ctx) => {
            if (!args.length) return out(error('rm: missing operand'));
            const lines: ShellLine[] = [];
            for (const arg of args) {
                const target = resolvePath(ctx.cwd, arg);
                const node = lookup(target, ctx.processes());
                const say = (why: string) => lines.push(error(`rm: cannot remove '${prettyPath(target)}': ${why}`));
                if (!node) say('No such file or directory');
                else if (isDir(node)) say('Is a directory');
                else if (!node.writable) say('Read-only file system. Only files you saved under /home/guest can be removed.');
                else {
                    const problem = ctx.deleteFile(target);
                    if (problem) say(problem);
                }
            }
            return out(...lines);
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
        summary: 'Search every file for a term.',
        usage: 'grep <term>',
        run: (args, ctx) => {
            const term = args.join(' ');
            if (!term) return out(error('grep: missing search term'));
            const hits = searchFiles(term, ctx.processes());
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
function tokenize(input: string): Token[] {
    const tokens: Token[] = [];
    let current = '';
    let quote: '"' | "'" | null = null;
    let wasQuoted = false;
    let started = false;
    for (const ch of input) {
        if (quote) {
            if (ch === quote) quote = null;
            else current += ch;
            continue;
        }
        if (ch === '"' || ch === "'") {
            quote = ch;
            wasQuoted = true;
            started = true;
            continue;
        }
        if (ch === ' ') {
            if (started) tokens.push({ value: current, quoted: wasQuoted });
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
function redirect(tokens: Token[], at: number, ctx: ShellContext): ShellResult {
    const append = tokens[at].value === '>>';
    const targetTok = tokens[at + 1];
    if (!targetTok) return out(error("syntax error near unexpected token `newline'"));
    if (tokens.length > at + 2) return out(error(`syntax error near unexpected token \`${tokens[at + 2].value}'`));

    const result = at === 0 ? { lines: [] } : execute(tokens.slice(0, at).map((t) => t.value), ctx);
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

function execute(tokens: string[], ctx: ShellContext): ShellResult {
    if (!tokens.length) return { lines: [] };
    const [name, ...args] = tokens;
    const command = findCommand(name);
    if (command) return command.run(args, ctx);

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

export function runCommand(input: string, ctx: ShellContext): ShellResult {
    const tokens = tokenize(input.trim());
    if (!tokens.length) return { lines: [] };
    const at = tokens.findIndex((t) => !t.quoted && (t.value === '>' || t.value === '>>'));
    if (at !== -1) return redirect(tokens, at, ctx);
    return execute(tokens.map((t) => t.value), ctx);
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
        } else if (ch === '"' || ch === "'") {
            quote = ch;
        } else if (ch === ' ') {
            start = i + 1;
        }
    }
    const raw = input.slice(start);
    return { start, value: raw.replace(/["']/g, ''), isFirst: input.slice(0, start).trim() === '' };
}

/** How a completion is written back: quoted when it contains a space, left open on folders. */
const quoteCandidate = (value: string, isDirectory: boolean): string =>
    value.includes(' ') ? `"${value}${isDirectory ? '' : '"'}` : value;

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
