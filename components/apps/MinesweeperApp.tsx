"use client";

import { useState, useEffect, useCallback } from 'react';

type Cell = {
    isMine: boolean;
    revealed: boolean;
    flagged: boolean;
    neighborMines: number;
};

const ROWS = 9;
const COLS = 9;
const MINES = 10;

const numberColors = ['', 'text-blue-600', 'text-green-700', 'text-red-600', 'text-purple-800', 'text-yellow-700', 'text-cyan-700', 'text-black', 'text-gray-600'];

function generateBoard(safeRow: number, safeCol: number): Cell[][] {
    const board: Cell[][] = Array.from({ length: ROWS }, () =>
        Array.from({ length: COLS }, () => ({
            isMine: false,
            revealed: false,
            flagged: false,
            neighborMines: 0,
        }))
    );

    let placed = 0;
    while (placed < MINES) {
        const r = Math.floor(Math.random() * ROWS);
        const c = Math.floor(Math.random() * COLS);
        if (board[r][c].isMine) continue;
        if (Math.abs(r - safeRow) <= 1 && Math.abs(c - safeCol) <= 1) continue;
        board[r][c].isMine = true;
        placed++;
    }

    for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
            if (board[r][c].isMine) continue;
            let count = 0;
            for (let dr = -1; dr <= 1; dr++) {
                for (let dc = -1; dc <= 1; dc++) {
                    const nr = r + dr;
                    const nc = c + dc;
                    if (nr >= 0 && nr < ROWS && nc >= 0 && nc < COLS && board[nr][nc].isMine) count++;
                }
            }
            board[r][c].neighborMines = count;
        }
    }

    return board;
}

export default function MinesweeperApp() {
    const [board, setBoard] = useState<Cell[][] | null>(null);
    const [gameState, setGameState] = useState<'idle' | 'playing' | 'won' | 'lost'>('idle');
    const [flagsUsed, setFlagsUsed] = useState(0);
    const [time, setTime] = useState(0);

    useEffect(() => {
        if (gameState !== 'playing') return;
        const t = setInterval(() => setTime(s => Math.min(s + 1, 999)), 1000);
        return () => clearInterval(t);
    }, [gameState]);

    const reset = useCallback(() => {
        setBoard(null);
        setGameState('idle');
        setFlagsUsed(0);
        setTime(0);
    }, []);

    const reveal = (r: number, c: number) => {
        if (gameState === 'lost' || gameState === 'won') return;

        let newBoard = board;
        if (!newBoard) {
            newBoard = generateBoard(r, c);
            setGameState('playing');
        }

        if (newBoard[r][c].flagged || newBoard[r][c].revealed) return;

        const clone = newBoard.map(row => row.map(cell => ({ ...cell })));

        if (clone[r][c].isMine) {
            for (let i = 0; i < ROWS; i++) for (let j = 0; j < COLS; j++) clone[i][j].revealed = true;
            setBoard(clone);
            setGameState('lost');
            return;
        }

        const stack: [number, number][] = [[r, c]];
        while (stack.length) {
            const [cr, cc] = stack.pop()!;
            if (cr < 0 || cr >= ROWS || cc < 0 || cc >= COLS) continue;
            if (clone[cr][cc].revealed || clone[cr][cc].flagged) continue;
            clone[cr][cc].revealed = true;
            if (clone[cr][cc].neighborMines === 0 && !clone[cr][cc].isMine) {
                for (let dr = -1; dr <= 1; dr++)
                    for (let dc = -1; dc <= 1; dc++)
                        if (dr !== 0 || dc !== 0) stack.push([cr + dr, cc + dc]);
            }
        }

        let allClear = true;
        for (let i = 0; i < ROWS; i++) for (let j = 0; j < COLS; j++) {
            if (!clone[i][j].isMine && !clone[i][j].revealed) { allClear = false; break; }
        }
        if (allClear) setGameState('won');
        setBoard(clone);
    };

    const toggleFlag = (e: React.MouseEvent, r: number, c: number) => {
        e.preventDefault();
        if (!board || gameState !== 'playing') return;
        if (board[r][c].revealed) return;
        const clone = board.map(row => row.map(cell => ({ ...cell })));
        clone[r][c].flagged = !clone[r][c].flagged;
        setFlagsUsed(f => f + (clone[r][c].flagged ? 1 : -1));
        setBoard(clone);
    };

    const displayBoard = board || Array.from({ length: ROWS }, () => Array.from({ length: COLS }, () => ({ isMine: false, revealed: false, flagged: false, neighborMines: 0 })));

    return (
        <div className="h-full bg-[#c0c0c0] p-2 flex flex-col items-center font-mono select-none">
            <div
                className="bg-[#c0c0c0] border-2 p-2 mb-2 w-full flex items-center justify-between"
                style={{ borderTopColor: '#ffffff', borderLeftColor: '#ffffff', borderRightColor: '#808080', borderBottomColor: '#808080' }}
            >
                <div className="bg-black text-red-500 font-bold text-lg px-2 border border-gray-600 min-w-[50px] text-center">
                    {String(MINES - flagsUsed).padStart(3, '0')}
                </div>

                <button
                    onClick={reset}
                    className="w-9 h-9 bg-[#c0c0c0] border-2 text-xl flex items-center justify-center active:translate-y-px"
                    style={{ borderTopColor: '#ffffff', borderLeftColor: '#ffffff', borderRightColor: '#808080', borderBottomColor: '#808080' }}
                    title="New Game"
                >
                    {gameState === 'lost' ? '😵' : gameState === 'won' ? '😎' : '🙂'}
                </button>

                <div className="bg-black text-red-500 font-bold text-lg px-2 border border-gray-600 min-w-[50px] text-center">
                    {String(time).padStart(3, '0')}
                </div>
            </div>

            <div
                className="border-2 bg-[#c0c0c0]"
                style={{ borderTopColor: '#808080', borderLeftColor: '#808080', borderRightColor: '#ffffff', borderBottomColor: '#ffffff' }}
            >
                {displayBoard.map((row, r) => (
                    <div key={r} className="flex">
                        {row.map((cell, c) => {
                            const isRevealed = cell.revealed;
                            return (
                                <button
                                    key={c}
                                    onClick={() => reveal(r, c)}
                                    onContextMenu={(e) => toggleFlag(e, r, c)}
                                    className={`w-7 h-7 text-sm font-bold flex items-center justify-center ${isRevealed ? 'bg-[#c0c0c0]' : 'bg-[#c0c0c0]'} ${isRevealed ? 'border border-[#808080]' : 'border-2'} ${cell.neighborMines > 0 && isRevealed ? numberColors[cell.neighborMines] : ''}`}
                                    style={!isRevealed ? {
                                        borderTopColor: '#ffffff',
                                        borderLeftColor: '#ffffff',
                                        borderRightColor: '#808080',
                                        borderBottomColor: '#808080'
                                    } : undefined}
                                >
                                    {isRevealed
                                        ? (cell.isMine ? '💣' : (cell.neighborMines > 0 ? cell.neighborMines : ''))
                                        : (cell.flagged ? '🚩' : '')}
                                </button>
                            );
                        })}
                    </div>
                ))}
            </div>

            <div className="mt-2 text-xs text-black">
                {gameState === 'won' && <span className="font-bold text-green-700">You Win! 🎉</span>}
                {gameState === 'lost' && <span className="font-bold text-red-700">Game Over — click 😵 to retry</span>}
                {gameState === 'idle' && <span>Left click to reveal • Right click to flag</span>}
                {gameState === 'playing' && <span>{MINES - flagsUsed} mines remaining</span>}
            </div>
        </div>
    );
}
