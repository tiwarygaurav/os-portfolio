"use client";

import { useState, useRef } from 'react';
import { SYSTEM } from '@/content';

const MENU = ['File', 'Edit', 'Format', 'View', 'Help'];

export default function NotepadApp() {
    const [text, setText] = useState(
        "Welcome to Notepad.\r\n\r\n" +
        "This is the classic Windows XP Notepad — feel free to type away. " +
        "Use the File menu to start a new note or save it as a .txt download.\r\n\r\n" +
        "Pro tip: try Edit ► Time/Date to insert the current timestamp.\r\n\r\n" +
        "One more: the Command Prompt on this desktop runs on a real filesystem. Try:\r\n\r\n" +
        "  ls ~\r\n" +
        "  cat ~/projects/os-portfolio/README.md\r\n" +
        "  ps"
    );
    const [wordWrap, setWordWrap] = useState(true);
    const [openMenu, setOpenMenu] = useState<string | null>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);

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

    const downloadAs = () => {
        const blob = new Blob([text], { type: 'text/plain' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'untitled.txt';
        a.click();
        URL.revokeObjectURL(a.href);
        setOpenMenu(null);
    };

    const newDoc = () => {
        if (text && !confirm('Discard current contents?')) return;
        setText('');
        setOpenMenu(null);
    };

    const insertDateTime = () => {
        insertAtCursor(new Date().toLocaleString());
        setOpenMenu(null);
    };

    const selectAll = () => {
        textareaRef.current?.select();
        setOpenMenu(null);
    };

    const menus: Record<string, { label: string; action?: () => void; shortcut?: string; divider?: boolean; checked?: boolean }[]> = {
        File: [
            { label: 'New', action: newDoc, shortcut: 'Ctrl+N' },
            { label: 'Open...', action: () => { alert('Open dialog is unavailable in this build.'); setOpenMenu(null); }, shortcut: 'Ctrl+O' },
            { label: 'Save', action: downloadAs, shortcut: 'Ctrl+S' },
            { label: 'Save As...', action: downloadAs },
            { divider: true, label: '' },
            { label: 'Print...', action: () => { window.print(); setOpenMenu(null); }, shortcut: 'Ctrl+P' },
            { divider: true, label: '' },
            { label: 'Exit', action: () => setOpenMenu(null) },
        ],
        Edit: [
            { label: 'Undo', action: () => { document.execCommand('undo'); setOpenMenu(null); }, shortcut: 'Ctrl+Z' },
            { divider: true, label: '' },
            { label: 'Cut', action: () => { document.execCommand('cut'); setOpenMenu(null); }, shortcut: 'Ctrl+X' },
            { label: 'Copy', action: () => { document.execCommand('copy'); setOpenMenu(null); }, shortcut: 'Ctrl+C' },
            { label: 'Paste', action: () => { document.execCommand('paste'); setOpenMenu(null); }, shortcut: 'Ctrl+V' },
            { label: 'Delete', action: () => { insertAtCursor(''); setOpenMenu(null); }, shortcut: 'Del' },
            { divider: true, label: '' },
            { label: 'Select All', action: selectAll, shortcut: 'Ctrl+A' },
            { label: 'Time/Date', action: insertDateTime, shortcut: 'F5' },
        ],
        Format: [
            { label: 'Word Wrap', action: () => { setWordWrap(w => !w); setOpenMenu(null); }, checked: wordWrap },
            { label: 'Font...', action: () => { alert('Font selection unavailable.'); setOpenMenu(null); } },
        ],
        View: [
            { label: 'Status Bar', action: () => setOpenMenu(null) },
        ],
        Help: [
            { label: 'Help Topics', action: () => { alert('Help is unavailable. RTFM.'); setOpenMenu(null); } },
            { label: 'About Notepad', action: () => { alert('Notepad — Portfolio XP Edition\\nKumar Gaurav, 2025'); setOpenMenu(null); } },
        ],
    };

    return (
        <div className="h-full flex flex-col bg-[#ece9d8] font-sans select-none">
            {/* Menu Bar - already provided by Window, but Notepad has its own internal */}
            <div className="flex text-xs bg-[#ece9d8] border-b border-gray-400 relative">
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
                        className="absolute top-full left-0 z-50 min-w-[200px] bg-[#ece9d8] border border-gray-500 shadow-lg py-1 select-none"
                        style={{
                            left: MENU.indexOf(openMenu) * 50,
                        }}
                        onMouseLeave={() => setOpenMenu(null)}
                    >
                        {menus[openMenu].map((item, i) =>
                            item.divider ? (
                                <div key={i} className="h-px bg-gray-400 my-1 mx-1" />
                            ) : (
                                <button
                                    key={i}
                                    onClick={item.action}
                                    className="w-full flex justify-between items-center px-4 py-1 text-xs hover:bg-[#316ac5] hover:text-white"
                                >
                                    <span>
                                        {item.checked !== undefined && (
                                            <span className="inline-block w-3">{item.checked ? '✓' : ''}</span>
                                        )}
                                        {item.label}
                                    </span>
                                    {item.shortcut && <span className="text-gray-500 ml-6">{item.shortcut}</span>}
                                </button>
                            )
                        )}
                    </div>
                )}
            </div>

            {/* Editor */}
            <textarea
                ref={textareaRef}
                value={text}
                onChange={(e) => setText(e.target.value)}
                spellCheck={false}
                wrap={wordWrap ? 'soft' : 'off'}
                className="flex-1 w-full p-2 bg-white border-2 border-inset border-gray-400 font-mono text-sm resize-none outline-none select-text"
                style={{ fontFamily: 'Consolas, "Courier New", monospace' }}
            />

            {/* Status Bar */}
            <div className="bg-[#ece9d8] border-t border-gray-400 px-2 py-0.5 text-xs flex justify-between text-gray-700">
                <span>Ln 1, Col 1</span>
                <span>{text.length} chars</span>
            </div>
        </div>
    );
}
