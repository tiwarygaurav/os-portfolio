"use client";

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

/** XP waited about half a second before showing a tooltip. */
const SHOW_DELAY_MS = 500;
/** ...and took it down again after a while even if the pointer stayed put. */
const HIDE_AFTER_MS = 5000;
const CURSOR_GAP = 20;

/**
 * XP tooltips for the desktop chrome.
 *
 * A native `title` tooltip is drawn by the visitor's own OS — a Windows 11 or macOS tooltip in
 * the middle of an XP desktop. Chrome elements carry `data-tip` instead, and this single listener
 * draws XP's pale-yellow box under the pointer after the usual delay.
 *
 * Only `data-tip` is read. Stripping `title` attributes from app bodies on hover would mutate DOM
 * that other components and tests select on, so those are left to the browser.
 */
export default function Tooltips() {
    const [tip, setTip] = useState<{ text: string; x: number; y: number } | null>(null);
    const [mounted, setMounted] = useState(false);
    const current = useRef<Element | null>(null);
    const showTimer = useRef<number>();
    const hideTimer = useRef<number>();
    const pointer = useRef({ x: 0, y: 0 });

    useEffect(() => setMounted(true), []);

    useEffect(() => {
        const clear = () => {
            window.clearTimeout(showTimer.current);
            window.clearTimeout(hideTimer.current);
            current.current = null;
            setTip(null);
        };

        const onOver = (e: PointerEvent) => {
            if (e.pointerType === 'touch') return;
            const el = (e.target as Element | null)?.closest?.('[data-tip]') ?? null;
            if (el === current.current) return;
            clear();
            if (!el) return;
            current.current = el;
            showTimer.current = window.setTimeout(() => {
                const text = el.getAttribute('data-tip');
                if (!text || !el.isConnected) return;
                setTip({ text, x: pointer.current.x, y: pointer.current.y });
                hideTimer.current = window.setTimeout(() => setTip(null), HIDE_AFTER_MS);
            }, SHOW_DELAY_MS);
        };
        const onMove = (e: PointerEvent) => {
            pointer.current = { x: e.clientX, y: e.clientY };
        };

        document.addEventListener('pointerover', onOver);
        document.addEventListener('pointermove', onMove, { passive: true });
        document.addEventListener('pointerdown', clear, true);
        document.addEventListener('keydown', clear, true);
        window.addEventListener('blur', clear);
        return () => {
            clear();
            document.removeEventListener('pointerover', onOver);
            document.removeEventListener('pointermove', onMove);
            document.removeEventListener('pointerdown', clear, true);
            document.removeEventListener('keydown', clear, true);
            window.removeEventListener('blur', clear);
        };
    }, []);

    if (!mounted || !tip) return null;

    return createPortal(<TipBox {...tip} />, document.body);
}

/** Below and right of the pointer, flipped when it would leave the screen. */
function TipBox({ text, x, y }: { text: string; x: number; y: number }) {
    const ref = useRef<HTMLDivElement>(null);
    const [pos, setPos] = useState({ left: x, top: y + CURSOR_GAP });

    useEffect(() => {
        const el = ref.current;
        if (!el) return;
        const w = el.offsetWidth;
        const h = el.offsetHeight;
        const left = Math.max(2, Math.min(x, window.innerWidth - w - 2));
        const top = y + CURSOR_GAP + h > window.innerHeight - 2 ? y - h - 6 : y + CURSOR_GAP;
        setPos({ left, top });
    }, [x, y, text]);

    return (
        <div ref={ref} className="xp-tooltip" role="tooltip" style={{ left: pos.left, top: pos.top }}>
            {text}
        </div>
    );
}
