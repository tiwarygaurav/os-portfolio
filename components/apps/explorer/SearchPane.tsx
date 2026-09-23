"use client";

import { useEffect, useRef } from 'react';
import { DOCUMENTS_PATH, GUEST_PATH, HOME_PATH } from '@/system/vfs';
import { prettyPath } from '@/system/shell';
import { TaskPane, TaskSection, TaskText } from '@/components/ui/TaskPane';

/**
 * XP's Search Companion — "Search for files or folders" — in Explorer's left pane.
 *
 * The same three questions XP asked: part of the name (with `*` and `?`), a word or phrase in the
 * file, and where to look. It searches the real tree (`findFiles`), so it finds the portfolio's
 * files by what they say — "python", "geospatial" — as well as anything the visitor saved. No dog.
 */

export interface SearchState {
    name: string;
    text: string;
    under: string;
    /** Null until a search has run. */
    found: number | null;
    more: boolean;
}

interface SearchPaneProps {
    state: SearchState;
    /** The folder Explorer was showing when Search opened: the first place to look. */
    current: string;
    onChange: (patch: Partial<SearchState>) => void;
    onSearch: () => void;
    onClose: () => void;
    className?: string;
}

const button =
    'min-w-[64px] rounded-[3px] border border-[#003c74] bg-gradient-to-b from-white via-[#f2f1ea] to-[#dedbc8] px-2 py-0.5 text-[11px] hover:border-[#3c7fb1]';
const field = 'mt-0.5 w-full border border-[#7f9db9] bg-white px-1 py-0.5 text-[11px] outline-none focus:border-[#0058ee]';

export default function SearchPane({ state, current, onChange, onSearch, onClose, className = '' }: SearchPaneProps) {
    const first = useRef<HTMLInputElement>(null);
    useEffect(() => first.current?.focus(), []);

    const places = [
        { path: current, label: prettyPath(current) },
        { path: HOME_PATH, label: 'The portfolio (~)' },
        { path: DOCUMENTS_PATH, label: 'My Documents' },
        { path: GUEST_PATH, label: 'Your folder (/home/guest)' },
        { path: '/', label: 'Local Disk (C:)' },
    ].filter((p, i, all) => all.findIndex((q) => q.path === p.path) === i);

    return (
        <TaskPane className={className}>
            <TaskSection title="Search Companion" special>
                <form
                    className="space-y-2"
                    onSubmit={(e) => {
                        e.preventDefault();
                        onSearch();
                    }}
                    onKeyDown={(e) => {
                        if (e.key === 'Escape') {
                            e.stopPropagation();
                            onClose();
                        }
                    }}
                >
                    <TaskText>Search by any or all of the criteria below.</TaskText>
                    <label className="block xp-taskpane-text">
                        All or part of the file name:
                        <input
                            ref={first}
                            value={state.name}
                            onChange={(e) => onChange({ name: e.target.value })}
                            className={field}
                            spellCheck={false}
                            autoComplete="off"
                        />
                    </label>
                    <label className="block xp-taskpane-text">
                        A word or phrase in the file:
                        <input
                            value={state.text}
                            onChange={(e) => onChange({ text: e.target.value })}
                            className={field}
                            spellCheck={false}
                            autoComplete="off"
                        />
                    </label>
                    <label className="block xp-taskpane-text">
                        Look in:
                        <select value={state.under} onChange={(e) => onChange({ under: e.target.value })} className={field}>
                            {places.map((p) => (
                                <option key={p.path} value={p.path}>{p.label}</option>
                            ))}
                        </select>
                    </label>
                    <div className="flex justify-end gap-2">
                        <button type="button" onClick={onClose} className={button}>Back</button>
                        <button type="submit" className={button}>Search</button>
                    </div>
                    {state.found !== null && (
                        <TaskText>
                            {state.found === 0
                                ? 'Search is complete. There are no results to display.'
                                : `Search is complete. There ${state.found === 1 ? 'is 1 result' : `are ${state.found} results`} to display.`}
                            {state.more && ' Only the first ones are shown — narrow the search to see the rest.'}
                        </TaskText>
                    )}
                </form>
            </TaskSection>
        </TaskPane>
    );
}
