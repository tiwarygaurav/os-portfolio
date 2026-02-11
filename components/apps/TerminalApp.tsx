"use client";

import { useState, useRef, useEffect } from 'react';
import { useSystemStore } from '@/store/useSystemStore';
import { APPS } from '@/constants/apps';

interface CommandHistory {
    type: 'input' | 'output';
    content: React.ReactNode;
}

export default function TerminalApp() {
    const { actions } = useSystemStore();
    const [input, setInput] = useState('');
    const [history, setHistory] = useState<CommandHistory[]>([
        { type: 'output', content: 'Welcome to Portfolio OS v1.0.0' },
        { type: 'output', content: 'Type "help" for a list of available commands.' },
    ]);
    const bottomRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    // Auto-scroll to bottom
    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [history]);

    // Focus input on click
    const handleContainerClick = () => {
        inputRef.current?.focus();
    };

    const handleCommand = (e: React.FormEvent) => {
        e.preventDefault();
        const cmd = input.trim();
        if (!cmd) return;

        // Add input to history
        setHistory(prev => [...prev, { type: 'input', content: cmd }]);
        setInput('');

        // Process command
        const args = cmd.toLowerCase().split(' ');
        const command = args[0];

        let output: React.ReactNode = '';

        switch (command) {
            case 'help':
                output = (
                    <div className="grid grid-cols-[100px_1fr] gap-2">
                        <span className="text-yellow-400">help</span> <span>Show this help message</span>
                        <span className="text-yellow-400">clear</span> <span>Clear terminal history</span>
                        <span className="text-yellow-400">ls</span> <span>List available apps</span>
                        <span className="text-yellow-400">open</span> <span>Open an app (e.g. "open projects")</span>
                        <span className="text-yellow-400">whoami</span> <span>Display current user</span>
                        <span className="text-yellow-400">about</span> <span>Summary about me</span>
                    </div>
                );
                break;

            case 'clear':
                setHistory([]);
                return; // Early return to avoid adding output

            case 'whoami':
                output = 'Guest User (Admin)';
                break;

            case 'ls':
                output = Object.values(APPS).map(a => a.id).join('  ');
                break;

            case 'open':
                const appName = args[1];
                if (!appName) {
                    output = 'Usage: open [app_name]';
                } else if (APPS[appName]) {
                    actions.openWindow(APPS[appName].id, APPS[appName].title);
                    output = `Opening ${APPS[appName].title}...`;
                } else {
                    output = `Error: App "${appName}" not found. Type "ls" to see apps.`;
                }
                break;

            case 'about':
                output = 'Alex Developer - Senior Frontend Engineer. Type "open about" to see full profile.';
                break;

            default:
                // Check if it matches an app name directly
                if (APPS[command]) {
                    actions.openWindow(APPS[command].id, APPS[command].title);
                    output = `Opening ${APPS[command].title}...`;
                } else {
                    output = `Command not found: ${command}. Type "help" for assistance.`;
                }
        }

        setHistory(prev => [...prev, { type: 'output', content: output }]);
    };

    return (
        <div
            className="h-full bg-black text-green-400 font-mono text-sm p-2 overflow-auto cursor-text"
            onClick={handleContainerClick}
        >
            {history.map((item, i) => (
                <div key={i} className="mb-1 break-words">
                    {item.type === 'input' ? (
                        <div className="flex gap-2 text-white">
                            <span className="text-blue-400 font-bold">guest@portfolio:~$</span>
                            <span>{item.content}</span>
                        </div>
                    ) : (
                        <div className="text-gray-300 ml-0">{item.content}</div>
                    )}
                </div>
            ))}

            <form onSubmit={handleCommand} className="flex gap-2">
                <span className="text-blue-400 font-bold shrink-0">guest@portfolio:~$</span>
                <input
                    ref={inputRef}
                    type="text"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    className="bg-transparent border-none outline-none text-white flex-1"
                    autoFocus
                    autoComplete="off"
                />
            </form>
            <div ref={bottomRef} />
        </div>
    );
}
