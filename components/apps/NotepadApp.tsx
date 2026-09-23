"use client";

import { useCallback, useEffect, useRef, useState } from 'react';
import { PROFILE, SYSTEM } from '@/content';
import { useSystemStore, type WindowPayload } from '@/store/useSystemStore';
import { xpAlert } from '@/utils/dialog';
import FileDialog, { TEXT_TYPES } from '@/components/os/FileDialog';
import { DOCUMENTS_PATH, isFile, lookup } from '@/system/vfs';

const MENU = ['File', 'Edit', 'Format', 'View', 'Help'];

const WELCOME =
    "Welcome to Notepad.\n\n" +
    "This is the classic Windows XP Notepad, and it saves real files. File > Save As puts your note " +
    "in My Documents (/home/guest/My Documents), where it stays in this browser: Explorer shows it, " +
    "and so does the Command Prompt.\n\n" +
    "Pro tip: try Edit ► Time/Date to insert the current timestamp.\n\n" +
    "In the Command Prompt, try:\n\n" +
    "  ls ~\n" +
    "  cat ~/projects/os-portfolio/README.md\n" +
    "  echo hello > \"/home/guest/My Documents/hello.txt\"";

interface NotepadAppProps {
    /** Supplied by Window.tsx; the window's pid. */
    windowId?: string;
    /** `{ path }` opens that file — from Explorer, Run, or `open <file>` in the shell. */
    payload?: WindowPayload;
}

const baseName = (path: string | null) => (path ? path.slice(path.lastIndexOf('/') + 1) : 'Untitled');

/** Read a text file from the filesystem, or say why not. */
function readText(path: string): { text: string } | { error: string } {
    const node = lookup(path);
    if (!node || !isFile(node)) return { error: `Cannot find the file ${path}.` };
    if (node.src) return { error: `${node.name} is a picture, not a text file. Open it in Windows Picture and Fax Viewer.` };
    return { text: node.content };
}

const isWritable = (path: string | null): boolean => {
    if (!path) return false;
    const node = lookup(path);
    return Boolean(node && isFile(node) && node.writable);
};

export default function NotepadApp({ windowId, payload }: NotepadAppProps) {
    const actions = useSystemStore((s) => s.actions);
    // Re-evaluate "read-only" when files change (e.g. this file deleted from the shell).
    useSystemStore((s) => s.userFiles);

    // Seeded with "\n", not "\r\n": a textarea normalises line breaks to "\n" and reports
    // `selectionStart` against that, so the status bar's Ln/Col only line up if state matches.
    const [text, setText] = useState(WELCOME);
    /** The text as last opened or saved; the document is dirty when they differ. */
    const [saved, setSaved] = useState(WELCOME);
    const [path, setPath] = useState<string | null>(null);
    const [fileDialog, setFileDialog] = useState<'open' | 'save' | null>(null);
    const [wordWrap, setWordWrap] = useState(true);
    const [statusBar, setStatusBar] = useState(true);
    const [caret, setCaret] = useState(0);
    const [openMenu, setOpenMenu] = useState<string | null>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    /** What to do once a Save As completes — e.g. the New or Exit that asked to save first. */
    const afterSave = useRef<(() => void) | null>(null);
    // The close guard runs outside React's render cycle, so it reads the latest values from refs.
    const live = useRef({ text, saved, path });
    live.current = { text, saved, path };

    const dirty = text !== saved;
    const writable = isWritable(path);

    // "notes.txt - Notepad", as XP titled it.
    useEffect(() => {
        if (windowId) actions.setWindowTitle(windowId, `${baseName(path)} - Notepad`);
    }, [windowId, path, actions]);

    // Real caret position for the status bar — it used to print a literal "Ln 1, Col 1".
    const syncCaret = () => {
        const ta = textareaRef.current;
        if (ta) setCaret(ta.selectionStart);
    };
    const before = text.slice(0, caret);
    const line = before.split('\n').length;
    const col = caret - before.lastIndexOf('\n');

    /* ---------------------------------------------------------------- files */

    const writeTo = useCallback((target: string, content: string): boolean => {
        const problem = actions.writeUserFile(target, { content });
        if (problem) {
            void xpAlert('Notepad', [problem], 'warning');
            return false;
        }
        setPath(target);
        setSaved(content);
        // Synchronously too: a close that was waiting on this save re-runs the close guard before
        // React re-renders, and must see the document as saved rather than ask again.
        live.current = { ...live.current, saved: content, path: target };
        return true;
    }, [actions]);

    /** Save in place; an untitled or read-only document goes to Save As instead. True if saved now. */
    const save = useCallback((): boolean => {
        const { text: current, path: currentPath } = live.current;
        if (currentPath && isWritable(currentPath)) return writeTo(currentPath, current);
        setFileDialog('save');
        return false;
    }, [writeTo]);

    /**
     * XP's question, word for word: Yes saves, No discards, Cancel stays. Resolves true when it is
     * fine to replace the current text now. If Yes needs a Save As first, `then` runs once that
     * save succeeds, and this resolves false.
     */
    const askToSave = useCallback(async (then: () => void): Promise<boolean> => {
        const { text: current, saved: last, path: currentPath } = live.current;
        if (current === last) return true;
        const answer = await actions.openDialog({
            title: 'Notepad',
            body: [`The text in the ${baseName(currentPath)} file has changed.`, 'Do you want to save the changes?'],
            icon: 'warning',
            buttons: [
                { id: 'yes', label: 'Yes', primary: true },
                { id: 'no', label: 'No' },
                { id: 'cancel', label: 'Cancel', cancel: true },
            ],
        });
        if (answer === 'no') return true;
        if (answer === 'cancel') return false;
        if (save()) return true;
        afterSave.current = then;
        return false;
    }, [actions, save]);

    const load = useCallback((target: string) => {
        const result = readText(target);
        if ('error' in result) {
            void xpAlert('Notepad', [result.error], 'warning');
            return;
        }
        setText(result.text);
        setSaved(result.text);
        setPath(target);
        setCaret(0);
    }, []);

    // Opened with a file, or re-targeted at another one by a later `open`.
    const lastPayload = useRef<WindowPayload | undefined>(undefined);
    useEffect(() => {
        if (!payload?.path || payload === lastPayload.current) return;
        lastPayload.current = payload;
        const target = payload.path;
        void askToSave(() => load(target)).then((ok) => {
            if (ok) load(target);
        });
    }, [payload, askToSave, load]);

    // The title-bar close button, Alt+F4 and File > Exit all ask about unsaved changes.
    useEffect(() => {
        if (!windowId) return;
        return actions.registerCloseGuard(windowId, () => askToSave(() => actions.closeWindow(windowId)));
    }, [windowId, actions, askToSave]);

    const newDoc = async () => {
        setOpenMenu(null);
        const reset = () => {
            setText('');
            setSaved('');
            setPath(null);
            setCaret(0);
        };
        if (await askToSave(reset)) reset();
    };

    const openFile = async () => {
        setOpenMenu(null);
        if (await askToSave(() => setFileDialog('open'))) setFileDialog('open');
    };

    const download = () => {
        const blob = new Blob([text], { type: 'text/plain' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = path ? baseName(path) : 'untitled.txt';
        a.click();
        URL.revokeObjectURL(a.href);
        setOpenMenu(null);
    };

    /* ----------------------------------------------------------------- edit */

    const insertAtCursor = (value: string) => {
        const ta = textareaRef.current;
        if (!ta) return;
        const start = ta.selectionStart;
        const end = ta.selectionEnd;
        setText(text.slice(0, start) + value + text.slice(end));
        setTimeout(() => {
            ta.focus();
            ta.selectionStart = ta.selectionEnd = start + value.length;
        }, 0);
    };

    const insertDateTime = () => {
        insertAtCursor(new Date().toLocaleString());
        setOpenMenu(null);
    };

    const selectAll = () => {
        textareaRef.current?.select();
        setOpenMenu(null);
    };

    /*
     * Paste. `document.execCommand('paste')` is refused by every current browser from script, so
     * the old item silently did nothing. The async Clipboard API works where the visitor grants
     * it; where the browser refuses, say so rather than pretend.
     */
    const paste = async () => {
        setOpenMenu(null);
        try {
            const clip = await navigator.clipboard.readText();
            insertAtCursor(clip);
        } catch {
            void xpAlert(
                'Notepad',
                ['Paste is not available here: the browser refused clipboard access.', 'Use Ctrl+V in the editor instead.'],
                'warning',
            );
        }
    };

    const notAvailable = (what: string) => () => {
        void xpAlert('Notepad', `${what} is not available in this build.`);
        setOpenMenu(null);
    };

    const menus: Record<string, { label: string; action?: () => void; shortcut?: string; divider?: boolean; checked?: boolean }[]> = {
        File: [
            { label: 'New', action: () => { void newDoc(); }, shortcut: 'Ctrl+N' },
            { label: 'Open...', action: () => { void openFile(); }, shortcut: 'Ctrl+O' },
            { label: 'Save', action: () => { setOpenMenu(null); save(); }, shortcut: 'Ctrl+S' },
            { label: 'Save As...', action: () => { setOpenMenu(null); setFileDialog('save'); } },
            { divider: true, label: '' },
            // Not an XP item: a copy on the visitor's own disk, which My Documents is not.
            { label: 'Download a Copy...', action: download },
            { label: 'Print...', action: () => { window.print(); setOpenMenu(null); }, shortcut: 'Ctrl+P' },
            { divider: true, label: '' },
            { label: 'Exit', action: () => { setOpenMenu(null); if (windowId) actions.closeWindow(windowId); } },
        ],
        Edit: [
            { label: 'Undo', action: () => { document.execCommand('undo'); setOpenMenu(null); }, shortcut: 'Ctrl+Z' },
            { divider: true, label: '' },
            { label: 'Cut', action: () => { document.execCommand('cut'); setOpenMenu(null); }, shortcut: 'Ctrl+X' },
            { label: 'Copy', action: () => { document.execCommand('copy'); setOpenMenu(null); }, shortcut: 'Ctrl+C' },
            { label: 'Paste', action: () => { void paste(); }, shortcut: 'Ctrl+V' },
            { label: 'Delete', action: () => { insertAtCursor(''); setOpenMenu(null); }, shortcut: 'Del' },
            { divider: true, label: '' },
            { label: 'Select All', action: selectAll, shortcut: 'Ctrl+A' },
            { label: 'Time/Date', action: insertDateTime, shortcut: 'F5' },
        ],
        Format: [
            { label: 'Word Wrap', action: () => { setWordWrap(w => !w); setOpenMenu(null); }, checked: wordWrap },
            { label: 'Font...', action: notAvailable('Font selection') },
        ],
        View: [
            { label: 'Status Bar', action: () => { setStatusBar(s => !s); setOpenMenu(null); }, checked: statusBar },
        ],
        Help: [
            { label: 'Help Topics', action: notAvailable('Help') },
            // Owner and system name come from content/ — nothing personal is hardcoded here, and no
            // year is claimed because none is known.
            {
                label: 'About Notepad',
                action: () => {
                    void xpAlert('About Notepad', ['Notepad', SYSTEM.name, PROFILE.name]);
                    setOpenMenu(null);
                },
            },
        ],
    };

    return (
        <div
            className="relative flex h-full select-none flex-col bg-[#ece9d8] font-sans"
            onKeyDown={(e) => {
                if (fileDialog) return;
                if (e.key === 'F5') { e.preventDefault(); insertDateTime(); return; }
                if (!(e.ctrlKey || e.metaKey)) return;
                const key = e.key.toLowerCase();
                if (key === 's') { e.preventDefault(); save(); }
                if (key === 'o') { e.preventDefault(); void openFile(); }
            }}
        >
            <div className="relative flex border-b border-gray-400 bg-[#ece9d8] text-xs">
                {MENU.map(m => (
                    <button
                        key={m}
                        onMouseDown={(e) => { e.preventDefault(); setOpenMenu(openMenu === m ? null : m); }}
                        onMouseEnter={() => openMenu && setOpenMenu(m)}
                        className={`px-3 py-1 hover:bg-[#316ac5] hover:text-white ${openMenu === m ? 'bg-[#316ac5] text-white' : ''}`}
                    >
                        <u>{m[0]}</u>{m.slice(1)}
                    </button>
                ))}

                {openMenu && (
                    <div
                        className="absolute left-0 top-full z-50 min-w-[200px] select-none border border-gray-500 bg-[#ece9d8] py-1 shadow-lg"
                        style={{ left: MENU.indexOf(openMenu) * 50 }}
                        onMouseLeave={() => setOpenMenu(null)}
                    >
                        {menus[openMenu].map((item, i) =>
                            item.divider ? (
                                <div key={i} className="mx-1 my-1 h-px bg-gray-400" />
                            ) : (
                                <button
                                    key={i}
                                    onClick={item.action}
                                    className="flex w-full items-center justify-between px-4 py-1 text-xs hover:bg-[#316ac5] hover:text-white"
                                >
                                    <span>
                                        {item.checked !== undefined && (
                                            <span className="inline-block w-3">{item.checked ? '✓' : ''}</span>
                                        )}
                                        {item.label}
                                    </span>
                                    {item.shortcut && <span className="ml-6 text-gray-500">{item.shortcut}</span>}
                                </button>
                            )
                        )}
                    </div>
                )}
            </div>

            <textarea
                ref={textareaRef}
                value={text}
                aria-label={`${baseName(path)} - Notepad`}
                onChange={(e) => { setText(e.target.value); setCaret(e.target.selectionStart); }}
                onSelect={syncCaret}
                onKeyUp={syncCaret}
                onClick={syncCaret}
                spellCheck={false}
                wrap={wordWrap ? 'soft' : 'off'}
                className="w-full flex-1 resize-none select-text border-2 border-gray-400 bg-white p-2 font-mono text-sm outline-none"
                style={{ fontFamily: 'Consolas, "Courier New", monospace' }}
            />

            {statusBar && (
                <div className="flex justify-between gap-2 border-t border-gray-400 bg-[#ece9d8] px-2 py-0.5 text-xs text-gray-700">
                    <span>Ln {line}, Col {col}</span>
                    <span className="truncate">
                        {path && !writable ? 'Read-only: Save As to keep a copy · ' : ''}
                        {dirty ? 'Modified · ' : ''}
                        {text.length} chars
                    </span>
                </div>
            )}

            {fileDialog && (
                <FileDialog
                    mode={fileDialog}
                    initialDir={fileDialog === 'save' && path && writable ? path.slice(0, path.lastIndexOf('/')) : DOCUMENTS_PATH}
                    initialName={fileDialog === 'save' ? (path ? baseName(path) : 'Untitled.txt') : ''}
                    types={TEXT_TYPES}
                    onCancel={() => {
                        afterSave.current = null;
                        setFileDialog(null);
                    }}
                    onConfirm={(target) => {
                        if (fileDialog === 'open') {
                            setFileDialog(null);
                            load(target);
                            return;
                        }
                        if (!writeTo(target, live.current.text)) return;
                        setFileDialog(null);
                        const next = afterSave.current;
                        afterSave.current = null;
                        next?.();
                    }}
                />
            )}
        </div>
    );
}
