import type { Bitmap, Bytes, Rect } from './raster';

/**
 * Undo and Repeat for Paint.
 *
 * Most operations touch a small part of the picture, so an entry stores only the changed region,
 * before and after, rather than two whole pictures. Operations that change the picture's size
 * (Attributes, rotating by 90 degrees, stretch and skew, opening a file) swap whole bitmaps.
 *
 * XP's Paint kept three levels of undo. This keeps as many as fit in a fixed memory budget, which
 * is the kinder choice in a browser tab and costs nothing in fidelity anyone would miss.
 */

export type HistoryEntry =
    | { kind: 'patch'; rect: Rect; before: Bytes; after: Bytes }
    | { kind: 'swap'; before: Bitmap; after: Bitmap };

/** Total bytes of undo data kept before the oldest entries are dropped. */
const BUDGET = 96 * 1024 * 1024;
const MAX_ENTRIES = 200;

const sizeOf = (e: HistoryEntry): number =>
    e.kind === 'patch' ? e.before.byteLength + e.after.byteLength : e.before.data.byteLength + e.after.data.byteLength;

export class History {
    private undoStack: HistoryEntry[] = [];
    private redoStack: HistoryEntry[] = [];
    private bytes = 0;

    get canUndo(): boolean {
        return this.undoStack.length > 0;
    }

    get canRedo(): boolean {
        return this.redoStack.length > 0;
    }

    push(entry: HistoryEntry): void {
        this.undoStack.push(entry);
        this.bytes += sizeOf(entry);
        for (const e of this.redoStack) this.bytes -= sizeOf(e);
        this.redoStack = [];
        while (this.undoStack.length > 1 && (this.bytes > BUDGET || this.undoStack.length > MAX_ENTRIES)) {
            this.bytes -= sizeOf(this.undoStack.shift()!);
        }
    }

    /** The entry to reverse, moved onto the redo stack; null when there is nothing to undo. */
    undo(): HistoryEntry | null {
        const e = this.undoStack.pop();
        if (!e) return null;
        this.redoStack.push(e);
        return e;
    }

    redo(): HistoryEntry | null {
        const e = this.redoStack.pop();
        if (!e) return null;
        this.undoStack.push(e);
        return e;
    }

    clear(): void {
        this.undoStack = [];
        this.redoStack = [];
        this.bytes = 0;
    }
}
