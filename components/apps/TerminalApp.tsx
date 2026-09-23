"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSystemStore } from '@/store/useSystemStore';
import { APPS } from '@/constants/apps';
import { PROFILE, SYSTEM } from '@/content';
import {
    WELCOME,
    applyCompletion,
    complete,
    prettyPath,
    runCommand,
    type ShellContext,
    type ShellLine,
} from '@/system/shell';
import { HOME_PATH, type ProcEntry } from '@/system/vfs';
import { publish } from '@/system/bus';
import { useProcesses } from '@/utils/processes';

/**
 * Terminal — a *renderer* for `system/shell`.
 *
 * All command logic lives in the headless shell; this component owns the transcript, the caret,
 * history recall and tab completion. Adding a command must never require editing this file.
 */

type Entry =
    | { kind: 'prompt'; cwd: string; input: string }
    | { kind: 'output'; line: ShellLine };

export default function TerminalApp() {
    const openWindow = useSystemStore((s) => s.actions.openWindow);
    const closeWindow = useSystemStore((s) => s.actions.closeWindow);
    const writeUserFile = useSystemStore((s) => s.actions.writeUserFile);
    const deleteUserFile = useSystemStore((s) => s.actions.deleteUserFile);
    const actions = useSystemStore((s) => s.actions);
    const windows = useSystemStore((s) => s.windows);
    const procs = useProcesses();

    const [entries, setEntries] = useState<Entry[]>(() =>
        WELCOME.map((line) => ({ kind: 'output', line })),
    );
    const [input, setInput] = useState('');
    const [cwd, setCwd] = useState(HOME_PATH);
    const [historyIndex, setHistoryIndex] = useState<number | null>(null);

    const history = useRef<string[]>([]);
    const inputRef = useRef<HTMLInputElement>(null);
    const scrollRef = useRef<HTMLDivElement>(null);

    /** Live windows, projected as processes for `ps` / `kill` / `/proc`. */
    const processes = useCallback((): ProcEntry[] => procs, [procs]);

    const ctx: ShellContext = useMemo(
        () => ({
            cwd,
            // A getter, so the shell always reads the live list rather than the snapshot that
            // existed when this context was memoised.
            history: () => history.current,
            processes,
            appIds: () => Object.keys(APPS),
            openApp: (appId, payload) => {
                // `APPS` is a plain object literal, so `APPS['constructor']` would otherwise
                // return a truthy inherited value and `open constructor` would report success
                // while creating a window with an undefined title.
                if (!Object.prototype.hasOwnProperty.call(APPS, appId)) return false;
                const app = APPS[appId];
                if (!app) return false;
                openWindow(app.id, app.title, payload);
                return true;
            },
            closeProcess: (pid, how) => {
                if (!windows.some((w) => w.id === pid)) return false;
                // `exit` is the terminal closing itself normally; only `kill` is a forced end.
                closeWindow(pid, how === 'exit' ? undefined : 'shell');
                return true;
            },
            openUrl: (url) => window.open(url, '_blank', 'noopener,noreferrer'),
            writeFile: (path, content) => writeUserFile(path, { content }),
            deleteFile: (path) => deleteUserFile(path),
            makeDir: (path) => actions.createUserFolder(path),
            move: (from, to) => actions.moveUserPath(from, to),
            removeDir: (path, recursive) => actions.deleteUserFolder(path, recursive),
        }),
        [cwd, processes, windows, openWindow, closeWindow, writeUserFile, deleteUserFile, actions],
    );

    useEffect(() => {
        scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
    }, [entries]);

    const submit = (raw: string) => {
        const command = raw.trim();
        setEntries((prev) => [...prev, { kind: 'prompt', cwd, input: raw }]);
        setInput('');
        setHistoryIndex(null);
        if (!command) return;

        // Mutate in place: `ctx.history` is a getter over this ref, and the Up/Down recall below
        // reads the same array.
        history.current.push(command);
        const result = runCommand(command, ctx);
        // What the Event Viewer shows for this command: a failure is one that printed an error.
        publish({ type: 'shell:command', input: command, ok: !result.lines.some((l) => l.kind === 'error') });

        if (result.cwd) setCwd(result.cwd);
        if (result.clear) {
            setEntries([]);
            return;
        }
        setEntries((prev) => [...prev, ...result.lines.map((line) => ({ kind: 'output' as const, line }))]);
    };

    const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        // Keep OS-level shortcuts (Alt+F4, Escape) working while typing.
        if (e.altKey || e.ctrlKey || e.metaKey) return;

        if (e.key === 'Enter') {
            e.preventDefault();
            submit(input);
            return;
        }

        if (e.key === 'Tab') {
            e.preventDefault();
            const matches = complete(input, ctx);
            if (matches.length === 1) {
                // Quote-aware: "My Documents" has a space, so the line cannot be rebuilt by
                // splitting on spaces.
                setInput(applyCompletion(input, matches[0]));
            } else if (matches.length > 1) {
                setEntries((prev) => [
                    ...prev,
                    { kind: 'prompt', cwd, input },
                    ...matches.map((m) => ({
                        kind: 'output' as const,
                        line: { kind: 'muted' as const, text: m },
                    })),
                ]);
            }
            return;
        }

        if (e.key === 'ArrowUp') {
            e.preventDefault();
            if (!history.current.length) return;
            const next = historyIndex === null ? history.current.length - 1 : Math.max(0, historyIndex - 1);
            setHistoryIndex(next);
            setInput(history.current[next]);
            return;
        }

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            if (historyIndex === null) return;
            const next = historyIndex + 1;
            if (next >= history.current.length) {
                setHistoryIndex(null);
                setInput('');
            } else {
                setHistoryIndex(next);
                setInput(history.current[next]);
            }
        }
    };

    const prompt = `${SYSTEM.shellUser}@${SYSTEM.shellHost}:${prettyPath(cwd)}$`;

    return (
        <div
            ref={scrollRef}
            className="h-full overflow-y-auto bg-[#0b0f10] p-3 font-mono text-[13px] leading-relaxed cursor-text"
            onClick={() => inputRef.current?.focus()}
            role="log"
            aria-label="Terminal output"
        >
            {entries.map((entry, i) =>
                entry.kind === 'prompt' ? (
                    <div key={i} className="flex gap-2 break-all">
                        <span className="shrink-0 text-[#5eead4]">
                            {`${SYSTEM.shellUser}@${SYSTEM.shellHost}:${prettyPath(entry.cwd)}$`}
                        </span>
                        <span className="text-slate-100">{entry.input}</span>
                    </div>
                ) : (
                    <Line key={i} line={entry.line} />
                ),
            )}

            <form
                onSubmit={(e) => {
                    e.preventDefault();
                    submit(input);
                }}
                className="flex gap-2"
            >
                <label htmlFor="shell-input" className="shrink-0 text-[#5eead4]">
                    {prompt}
                </label>
                <input
                    id="shell-input"
                    ref={inputRef}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={onKeyDown}
                    className="flex-1 border-none bg-transparent text-slate-100 caret-[#5eead4] outline-none"
                    autoComplete="off"
                    autoCapitalize="off"
                    autoCorrect="off"
                    spellCheck={false}
                    aria-label="Shell command"
                    // eslint-disable-next-line jsx-a11y/no-autofocus -- the window is opened deliberately by the user
                    autoFocus
                />
            </form>
        </div>
    );
}

/** One line of shell output. The only place `ShellLine` becomes pixels. */
function Line({ line }: { line: ShellLine }) {
    switch (line.kind) {
        case 'blank':
            return <div className="h-3" />;
        case 'heading':
            return <div className="mt-2 font-bold text-[#facc15]">{line.text}</div>;
        case 'muted':
            return <div className="whitespace-pre-wrap text-slate-500">{line.text}</div>;
        case 'error':
            return <div className="whitespace-pre-wrap text-[#f87171]">{line.text}</div>;
        case 'success':
            return <div className="whitespace-pre-wrap text-[#4ade80]">{line.text}</div>;
        case 'pair':
            return (
                <div className="flex gap-3">
                    <span className="w-40 shrink-0 text-[#7dd3fc]">{line.key}</span>
                    <span className="flex-1 whitespace-pre-wrap text-slate-300">{line.value}</span>
                </div>
            );
        case 'entry':
            return (
                <span
                    className={`mr-4 inline-block ${
                        line.entry === 'dir'
                            ? 'font-bold text-[#7dd3fc]'
                            : line.entry === 'link'
                              ? 'text-[#c4b5fd] underline decoration-dotted'
                              : line.entry === 'app'
                                ? 'text-[#4ade80]'
                                : 'text-slate-300'
                    }`}
                >
                    {line.text}
                </span>
            );
        case 'link':
            return (
                <a
                    href={line.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[#c4b5fd] underline hover:text-[#ddd6fe]"
                >
                    {line.text}
                </a>
            );
        default:
            return <div className="whitespace-pre-wrap text-slate-300">{line.text}</div>;
    }
}
