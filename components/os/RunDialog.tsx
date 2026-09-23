"use client";

import { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import XpIcon from '@/components/ui/XpIcon';
import { useSystemStore } from '@/store/useSystemStore';
import { APPS, appList } from '@/constants/apps';
import { HOME_PATH, allPaths, lookup, resolvePath, isFile } from '@/system/vfs';
import { prettyPath } from '@/system/shell';
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
            actions.openWindow(node.open.appId, APPS[node.open.appId]?.title, node.open.payload);
            onClose();
            return;
        }
        // Nothing owns this path: show it in the Explorer, which browses the same tree.
        actions.openWindow('explorer', APPS.explorer.title, { path: prettyPath(abs) });
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
        <div role="dialog" aria-modal="true" aria-label="Run" className="xp-window-frame w-[347px] max-w-[94vw]">
            <div className="xp-titlebar">
                <XpIcon src="/icons/run.png" size={16} className="xp-titlebar-icon" />
                <span className="xp-titlebar-text">Run</span>
                <div className="xp-titlebar-controls">
                    <button type="button" onClick={onClose} className="xp-caption-btn is-close" aria-label="Close" data-tip="Close" />
                </div>
            </div>

            <div className="xp-face px-3 pb-3 pt-4">
                <div className="flex gap-3">
                    <XpIcon src="/icons/run.png" size={32} className="shrink-0" />
                    <p className="leading-[1.45]">
                        Type the name of a program, folder or path in this system, and it will open it for you.
                    </p>
                </div>

                <div className="mt-4 flex items-center gap-2">
                    <label htmlFor="run-input" className="shrink-0">
                        <u>O</u>pen:
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
                        className="xp-input h-[21px] min-w-0 flex-1"
                        placeholder="cmd"
                    />
                </div>

                {suggestions.length > 0 && (
                    <ul className="ml-[38px] mt-px max-h-40 overflow-auto border border-[#7f9db9] bg-white" role="listbox">
                        {suggestions.map((s, i) => (
                            <li key={`${s.label}-${i}`} role="option" aria-selected={i === highlight}>
                                <button
                                    type="button"
                                    onMouseEnter={() => setHighlight(i)}
                                    onClick={s.run}
                                    className={`flex w-full items-baseline justify-between gap-3 px-1.5 py-px text-left ${
                                        i === highlight ? 'bg-[var(--luna-highlight)] text-white' : ''
                                    }`}
                                >
                                    <span className="truncate">{s.label}</span>
                                    <span className={`shrink-0 ${i === highlight ? 'text-white/80' : 'text-[#7f7c6d]'}`}>
                                        {s.detail}
                                    </span>
                                </button>
                            </li>
                        ))}
                    </ul>
                )}

                {error && <p className="mt-2 leading-[1.45] text-[#a91b1b]">{error}</p>}

                <div className="mt-4 flex justify-end gap-1.5">
                    <button type="button" className="xp-button is-default" onClick={submit}>OK</button>
                    <button type="button" className="xp-button" onClick={onClose}>Cancel</button>
                </div>
            </div>
        </div>
    );
}

/**
 * Mount point. XP opened Run at the bottom-left of the screen, just above the Start button that
 * launched it — not centred — so it appears there on a desktop, and centred on a phone.
 */
export function RunDialogLayer({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
    return (
        <AnimatePresence>
            {isOpen && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.1 }}
                    className="absolute inset-x-0 top-0 z-[46] flex items-center justify-center md:items-end md:justify-start md:pb-4 md:pl-3"
                    style={{ bottom: 'var(--xp-taskbar-h)' }}
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
