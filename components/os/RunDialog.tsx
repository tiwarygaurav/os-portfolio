"use client";

import { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useSystemStore } from '@/store/useSystemStore';
import { APPS, appList } from '@/constants/apps';
import { HOME_PATH, allPaths, lookup, resolvePath, isFile } from '@/system/vfs';
import { prettyPath } from '@/system/shell';
import { playSound } from '@/utils/sound';
import { useProcesses } from '@/utils/processes';

/**
 * The Run dialog (Win+R, or Start > Run).
 *
 * This is XP's own command palette, so it is the honest way to give a visitor one keystroke to
 * everything without importing a modern Ctrl+K palette that would not belong on this desktop.
 *
 * It resolves, in order: a registered app id or alias (`calc`, `cmd`, `mspaint`), a path in the
 * virtual filesystem (`~/projects`, `/etc/system.conf`), or a URL. Every target is real — the
 * suggestion list is derived from the app registry and the filesystem, never hand-maintained,
 * so it cannot list something that does not open.
 */

interface RunTarget {
    label: string;
    detail: string;
    run: () => void;
}

interface RunDialogProps {
    onClose: () => void;
}

export default function RunDialog({ onClose }: RunDialogProps) {
    const actions = useSystemStore((s) => s.actions);
    const procs = useProcesses();
    const [value, setValue] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [highlight, setHighlight] = useState(0);
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        inputRef.current?.focus();
    }, []);

    const openApp = (appId: string) => {
        playSound('open');
        actions.openWindow(appId, APPS[appId].title);
        onClose();
    };

    /** Everything this dialog can open, derived from the registry and the filesystem. */
    const suggestions = useMemo((): RunTarget[] => {
        const q = value.trim().toLowerCase();
        if (!q) return [];

        const apps = appList()
            .filter((a) => a.surfaces.includes('run'))
            .filter((a) =>
                a.id.startsWith(q) ||
                a.title.toLowerCase().includes(q) ||
                (a.aliases ?? []).some((alias) => alias.startsWith(q)),
            )
            .map((a) => ({
                label: a.aliases?.[0] ?? a.id,
                detail: a.title,
                run: () => openApp(a.id),
            }));

        const paths = allPaths(procs)
            .map(prettyPath)
            .filter((p) => p.toLowerCase().includes(q))
            .slice(0, 8)
            .map((p) => ({
                label: p,
                detail: p.endsWith('/') ? 'Folder' : 'File',
                run: () => runPath(p),
            }));

        return [...apps, ...paths].slice(0, 10);
        // `runPath` and `openApp` are stable enough for this ephemeral dialog.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [value, procs]);

    /** Open a filesystem path: its owning app if it has one, otherwise the Command Prompt at it. */
    function runPath(raw: string) {
        const abs = resolvePath(HOME_PATH, raw);
        const node = lookup(abs, procs);
        if (!node) {
            setError(`Cannot find "${raw}". Check the spelling, then try again.`);
            return;
        }
        if (isFile(node) && node.href) {
            window.open(node.href, '_blank', 'noopener,noreferrer');
            onClose();
            return;
        }
        // Files and directories both carry the launch hint, so this resolves a path exactly the
        // way `open <path>` does in the Command Prompt.
        if (node.open) {
            playSound('open');
            actions.openWindow(node.open.appId, APPS[node.open.appId]?.title, node.open.payload);
            onClose();
            return;
        }
        // Nothing owns this path: hand it to the shell, which can at least show it.
        playSound('open');
        actions.openWindow('terminal', APPS.terminal.title);
        onClose();
    }

    const submit = () => {
        const raw = value.trim();
        if (!raw) return;
        setError(null);

        // 1. A registered app, by id or by its XP command name.
        const byName = appList().find(
            (a) =>
                a.surfaces.includes('run') &&
                (a.id === raw.toLowerCase() || (a.aliases ?? []).includes(raw.toLowerCase())),
        );
        if (byName) return openApp(byName.id);

        // 2. A URL.
        if (/^https?:\/\//i.test(raw)) {
            window.open(raw, '_blank', 'noopener,noreferrer');
            onClose();
            return;
        }

        // 3. A path in the virtual filesystem.
        if (raw.startsWith('~') || raw.startsWith('/') || raw.startsWith('.')) return runPath(raw);

        // 4. Whatever the suggestion list is pointing at.
        if (suggestions[highlight]) return suggestions[highlight].run();

        setError(
            `Cannot find "${raw}". Make sure you typed the name correctly, then try again. Type an app name such as "cmd", or a path such as "~/projects".`,
        );
    };

    return (
        <motion.div
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.97 }}
            transition={{ duration: 0.12, ease: 'easeOut' }}
            role="dialog"
            aria-modal="true"
            aria-label="Run"
            className="w-[420px] max-w-[94vw] border border-[#003da8] shadow-2xl"
        >
            <div className="flex h-7 items-center justify-between rounded-t-[6px] bg-gradient-to-b from-[#0058ee] via-[#0073e6] to-[#0058ee] px-2 text-white">
                <span className="text-xs font-bold tracking-wide drop-shadow-md">Run</span>
                <button
                    onClick={onClose}
                    className="flex h-5 w-5 items-center justify-center rounded-[3px] border border-white/40 bg-gradient-to-b from-[#e74e57] to-[#a91b1b] hover:from-[#f47280] hover:to-[#c0252b]"
                    aria-label="Close"
                >
                    <span className="text-[11px] font-bold leading-none">&times;</span>
                </button>
            </div>

            <div className="bg-[#ece9d8] px-5 py-4 font-sans text-black">
                <div className="flex gap-3">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src="/icons/run.png" alt="" className="h-8 w-8 shrink-0 object-contain" />
                    <p className="text-xs leading-relaxed">
                        Type the name of a program or a path in this system, and it will open it for you.
                    </p>
                </div>

                <label htmlFor="run-input" className="mt-4 block text-xs">
                    Open:
                </label>
                <input
                    id="run-input"
                    ref={inputRef}
                    value={value}
                    onChange={(e) => {
                        setValue(e.target.value);
                        setError(null);
                        setHighlight(0);
                    }}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                            e.preventDefault();
                            submit();
                        } else if (e.key === 'ArrowDown') {
                            e.preventDefault();
                            setHighlight((h) => Math.min(h + 1, suggestions.length - 1));
                        } else if (e.key === 'ArrowUp') {
                            e.preventDefault();
                            setHighlight((h) => Math.max(0, h - 1));
                        } else if (e.key === 'Escape') {
                            e.preventDefault();
                            onClose();
                        }
                    }}
                    autoComplete="off"
                    spellCheck={false}
                    className="mt-1 w-full border border-[#7f9db9] bg-white px-2 py-1 font-mono text-xs outline-none focus:border-[#0058ee]"
                    placeholder="cmd"
                />

                {suggestions.length > 0 && (
                    <ul className="mt-1 max-h-40 overflow-auto border border-[#7f9db9] bg-white text-xs">
                        {suggestions.map((s, i) => (
                            <li key={`${s.label}-${i}`}>
                                <button
                                    onMouseEnter={() => setHighlight(i)}
                                    onClick={s.run}
                                    className={`flex w-full items-baseline justify-between gap-3 px-2 py-1 text-left ${
                                        i === highlight ? 'bg-[#316ac5] text-white' : 'hover:bg-[#e8f0fe]'
                                    }`}
                                >
                                    <span className="truncate font-mono">{s.label}</span>
                                    <span className={`shrink-0 text-[10px] ${i === highlight ? 'text-blue-100' : 'text-gray-500'}`}>
                                        {s.detail}
                                    </span>
                                </button>
                            </li>
                        ))}
                    </ul>
                )}

                {error && <p className="mt-2 text-xs leading-relaxed text-[#a91b1b]">{error}</p>}

                <div className="mt-5 flex justify-end gap-2">
                    <RunButton onClick={submit}>OK</RunButton>
                    <RunButton onClick={onClose}>Cancel</RunButton>
                </div>
            </div>
        </motion.div>
    );
}

function RunButton({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
    return (
        <button
            onClick={onClick}
            className="min-w-[75px] rounded-[3px] border border-[#7a7a6d] bg-gradient-to-b from-white via-[#f2f1ea] to-[#dedbc8] px-3 py-1 text-xs shadow-sm hover:border-[#3c7fb1] hover:from-[#fefefe] hover:to-[#e6f1fb] active:translate-y-px"
        >
            {children}
        </button>
    );
}

/** Mount point: centred over the desktop, above windows, never over the taskbar. */
export function RunDialogLayer({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
    return (
        <AnimatePresence>
            {isOpen && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.1 }}
                    className="absolute inset-x-0 bottom-9 top-0 z-[46] flex items-center justify-center bg-black/10"
                    onMouseDown={(e) => {
                        if (e.target === e.currentTarget) onClose();
                    }}
                >
                    <RunDialog onClose={onClose} />
                </motion.div>
            )}
        </AnimatePresence>
    );
}
