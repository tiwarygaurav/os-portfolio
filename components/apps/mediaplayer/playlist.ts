/**
 * The Media Player's playlist. The tracks and their order are part of the desktop's identity and
 * stay exactly as they were (see CLAUDE.md §9); the artist names are the ones in the file names.
 */
export interface Track {
    title: string;
    artist: string;
    file: string;
}

export const PLAYLIST: Track[] = [
    { title: 'Startup Sound', artist: 'Windows XP', file: '/sounds/startup.mp3' },
    { title: 'Sabse Piche Khade', artist: 'Mohit Chauhan', file: '/sounds/Mohit Chauhan - Sabse Piche Khade.m4a' },
    { title: 'Lose Yourself', artist: 'Eminem', file: '/sounds/Eminem - Lose Yourself.mp3' },
    { title: 'Kim', artist: 'Eminem', file: '/sounds/Eminem - Kim.mp3' },
    { title: 'Mockingbird', artist: 'Eminem', file: '/sounds/Eminem - Mockingbird.mp3' },
    { title: 'Without Me', artist: 'Eminem', file: '/sounds/Eminem - Without Me.mp3' },
    { title: 'Legacy', artist: 'Eminem', file: '/sounds/Eminem - Legacy.mp3' },
    { title: 'Space Bound', artist: 'Eminem', file: '/sounds/Eminem - Space Bound.mp3' },
];

/** m:ss, as WMP printed times. */
export function formatTime(seconds: number): string {
    if (!Number.isFinite(seconds) || seconds < 0) return '00:00';
    const s = Math.floor(seconds);
    return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}
