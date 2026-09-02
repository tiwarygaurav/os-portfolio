"use client";

import { Component, type ErrorInfo, type ReactNode } from 'react';

/**
 * The blue screen.
 *
 * An error boundary is a genuine gap in this application — an unhandled render error currently
 * blanks the page — and Windows XP already had exactly the right visual language for it. So this
 * is not a gag: it is the missing boundary, wearing the interface its host would have used.
 *
 * The one rule that keeps it honest: **it shows the real error**. A BSOD with an invented stop
 * code would be decoration, and decoration in place of diagnostics is worse than a blank page.
 */

interface Props {
    children: ReactNode;
}

interface State {
    error: Error | null;
    info: ErrorInfo | null;
}

/** XP stop codes are hex. Derive one from the message so the same fault reads the same way. */
function stopCode(error: Error): string {
    const source = `${error.name}:${error.message}`;
    let hash = 0;
    for (let i = 0; i < source.length; i++) {
        hash = (hash * 31 + source.charCodeAt(i)) >>> 0;
    }
    return `0x${hash.toString(16).toUpperCase().padStart(8, '0')}`;
}

export default class ErrorBoundary extends Component<Props, State> {
    state: State = { error: null, info: null };

    static getDerivedStateFromError(error: Error): Partial<State> {
        return { error };
    }

    componentDidCatch(error: Error, info: ErrorInfo) {
        this.setState({ info });
        // Keep the real diagnostics where a developer expects them.
        console.error('Unhandled error in the desktop:', error, info.componentStack);
    }

    render() {
        const { error, info } = this.state;
        if (!error) return this.props.children;

        const componentStack = (info?.componentStack ?? '')
            .split('\n')
            .map((l) => l.trim())
            .filter(Boolean)
            .slice(0, 6);

        return (
            <div
                className="fixed inset-0 z-[99999] overflow-auto bg-[#0000aa] p-8 font-mono text-sm leading-relaxed text-white"
                role="alert"
            >
                <div className="mx-auto max-w-3xl space-y-4">
                    <p>
                        A problem has been detected and this desktop has been stopped to prevent damage to
                        your session.
                    </p>

                    <p className="uppercase">{error.name || 'RENDER_ERROR'}</p>

                    <p>
                        If this is the first time you have seen this stop error screen, reload the page. If
                        it appears again, the fault is reproducible and worth reporting.
                    </p>

                    <div className="space-y-1">
                        <p>Technical information:</p>
                        <p className="break-words">
                            *** STOP: {stopCode(error)} ({error.message || 'no message'})
                        </p>
                        {componentStack.length > 0 && (
                            <div className="pt-2 text-[#c8c8ff]">
                                {componentStack.map((line, i) => (
                                    <p key={i} className="break-words">
                                        {line}
                                    </p>
                                ))}
                            </div>
                        )}
                    </div>

                    <div className="flex flex-wrap gap-3 pt-4">
                        <button
                            onClick={() => window.location.reload()}
                            className="border border-white/60 px-3 py-1 text-xs hover:bg-white hover:text-[#0000aa]"
                        >
                            Restart
                        </button>
                        <button
                            onClick={() => this.setState({ error: null, info: null })}
                            className="border border-white/60 px-3 py-1 text-xs hover:bg-white hover:text-[#0000aa]"
                        >
                            Try to continue
                        </button>
                    </div>

                    <p className="pt-6 text-xs text-[#a8a8ff]">
                        This is a real error boundary, and the stop code above is derived from the actual
                        exception. It is not a decorative blue screen.
                    </p>
                </div>
            </div>
        );
    }
}
