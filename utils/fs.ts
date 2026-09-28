import { useMemo, useSyncExternalStore } from 'react';
import { useSystemStore } from '@/store/useSystemStore';
import {
    GUEST_PATH,
    HOME_PATH,
    SAMPLE_PICTURES_PATH,
    copyName,
    isDir,
    lookup,
    nextFolderName,
    validateName,
    type VNode,
} from '@/system/vfs';
import { xpAlert, xpConfirm } from '@/utils/dialog';

/**
 * The visitor's files as the windows handle them: New Folder, Rename, the Cut / Copy / Paste
 * clipboard and moving or copying into a folder, each through the store's pure plans and answering
 * in XP's words, plus the hook that re-renders a folder view when anything in it changes.
 */

/**
 * Re-render when the visitor's files or folders change.
 *
 * The virtual filesystem is headless and reads what the store mounts into it, so a component that
 * lists a folder has no React dependency that changes when a file is saved. Selecting `userFiles`
 * and `userFolders` gives it one: the store replaces each on every write. The token returned is new
 * exactly when either changes, for use in a memo's dependencies.
 */
export const useFsRevision = (): object => {
    const files = useSystemStore((s) => s.userFiles);
    const folders = useSystemStore((s) => s.userFolders);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the token *is* "files or folders changed"
    return useMemo(() => ({}), [files, folders]);
};

const baseName = (path: string) => path.slice(path.lastIndexOf('/') + 1);
const extOf = (name: string) => (/\.([^.]+)$/.exec(name)?.[1] ?? '').toLowerCase();
const within = (path: string, root: string) => path === root || path.startsWith(`${root}/`);

const encoder = new TextEncoder();

/**
 * A file's size in bytes: a text file's UTF-8, a picture's decoded data. Null for a folder, and for
 * a built-in picture — a file on the site that the page never downloaded, so there is nothing to
 * measure. Base64's padding is not data; counting it made every picture a byte or two too big.
 */
export function fileBytes(node: VNode): number | null {
    if (isDir(node)) return null;
    if (!node.src) return encoder.encode(node.content).length;
    if (!node.src.startsWith('data:')) return null;
    const comma = node.src.indexOf(',');
    const data = node.src.slice(comma + 1);
    if (!node.src.slice(0, comma).endsWith(';base64')) {
        try {
            return encoder.encode(decodeURIComponent(data)).length;
        } catch {
            return data.length;
        }
    }
    const padding = data.endsWith('==') ? 2 : data.endsWith('=') ? 1 : 0;
    return Math.floor((data.length * 3) / 4) - padding;
}

/** A folder's name for a sentence; the root has none. */
export const folderLabel = (path: string): string => (path === '/' ? 'the root folder (/)' : baseName(path));

/**
 * Why nothing can be put in the folder at `path`, by where it is — the reason in a refused Paste or
 * drop. It used to say "part of the portfolio" of /proc and /usr/src as well.
 */
export function whyNotWritable(path: string): string {
    // A visitor's folder deleted while Explorer still showed it is not "a system folder".
    if (within(path, GUEST_PATH) && !lookup(path)) return 'it no longer exists. It was moved or deleted';
    if (within(path, HOME_PATH)) return 'it is part of the portfolio';
    if (within(path, '/proc')) return 'it lists the windows that are open, and changes only with them';
    if (within(path, SAMPLE_PICTURES_PATH)) return 'the Sample Pictures are built in, and read-only';
    return 'it is a system folder';
}

/**
 * Make a folder in `parent` named the way XP named them — New Folder, New Folder (2)... — and
 * return its name, or null (having said why in XP's error box).
 */
export async function makeNewFolder(parent: string, title = 'Windows Explorer'): Promise<string | null> {
    const { userFiles, userFolders, actions } = useSystemStore.getState();
    const name = nextFolderName(parent, { files: userFiles, folders: userFolders });
    const problem = actions.createUserFolder(`${parent === '/' ? '' : parent}/${name}`);
    if (!problem) return name;
    await xpAlert(title, ['Unable to create the folder \'New Folder\'.', problem], 'error');
    return null;
}

/**
 * Rename a visitor's file or folder the way Explorer did. An empty or unchanged name keeps the old
 * one; a different extension asks first, in XP's words; a refusal is shown in XP's error box.
 * Resolves with the name the item now has.
 */
export async function renameUserPath(from: string, typed: string): Promise<string> {
    const oldName = baseName(from);
    const name = typed.trim();
    if (!name || name === oldName) return oldName;
    // A name, not a path: "Sub/notes.txt" used to move the file into Sub instead of being refused.
    const badName = validateName(name);
    if (badName) {
        await xpAlert('Error Renaming File or Folder', [badName], 'error');
        return oldName;
    }
    const isFolder = useSystemStore.getState().userFolders.includes(from);
    if (!isFolder && extOf(name) !== extOf(oldName)) {
        const ok = await xpConfirm(
            'Rename',
            ['If you change a file name extension, the file may become unusable.', 'Are you sure you want to change it?'],
            { confirmLabel: 'Yes', cancelLabel: 'No', icon: 'warning' },
        );
        if (!ok) return oldName;
    }
    const to = `${from.slice(0, from.lastIndexOf('/'))}/${name}`;
    const problem = useSystemStore.getState().actions.moveUserPath(from, to);
    if (!problem) return name;
    await xpAlert(`Error Renaming ${isFolder ? 'Folder' : 'File'}`, [`Cannot rename ${oldName}: ${problem}`], 'error');
    return oldName;
}

/* ------------------------------------------------------------------ clipboard */

/** Explorer's Cut / Copy: the selected paths, and whether Paste moves them (Cut) or copies them. */
export type FileClip = { paths: string[]; cut: boolean } | null;

let clip: FileClip = null;
const clipListeners = new Set<() => void>();
const subscribeClip = (listener: () => void) => {
    clipListeners.add(listener);
    return () => clipListeners.delete(listener);
};

/** What is on the file clipboard. It lasts for the session, across Explorer windows, as XP's did. */
export const getFileClipboard = (): FileClip => clip;

export function setFileClipboard(next: FileClip): void {
    clip = next;
    clipListeners.forEach((l) => l());
}

export const useFileClipboard = (): FileClip => useSyncExternalStore(subscribeClip, getFileClipboard, () => null);

const parentOf = (path: string) => path.slice(0, path.lastIndexOf('/')) || '/';
const join = (dir: string, name: string) => `${dir === '/' ? '' : dir}/${name}`;

/** One item a Paste or a drop dealt with: where it was, and where it is now. */
export interface Transferred {
    from: string;
    to: string;
}

/**
 * The items a Paste or a drop acts on: each once, and not one inside a folder that is also going —
 * moving the folder takes it along, and moving it again afterwards would fail on a path that has
 * gone. Nor anything that is no longer there (deleted since it was cut or copied). `/proc` is read
 * live, so it is left for the store to refuse in its own words.
 */
function transferable(paths: string[]): string[] {
    const unique = Array.from(new Set(paths));
    return unique.filter(
        (p) => !unique.some((q) => q !== p && p.startsWith(`${q}/`)) && (p.startsWith('/proc/') || lookup(p) !== null),
    );
}

/**
 * Move or copy `paths` into `dest`, one at a time, as Explorer's Paste and a drop did. Moving an
 * item into the folder it is already in does nothing; a copy whose name is taken there becomes
 * "Copy of ...". Stops at the first refusal and says why in XP's error box. Resolves with each item
 * dealt with — so a caller can tell which were not.
 */
export async function transferInto(dest: string, paths: string[], mode: 'move' | 'copy'): Promise<Transferred[]> {
    const done: Transferred[] = [];
    for (const from of transferable(paths)) {
        // Read fresh for each item: the one before it has just changed the tree.
        const { userFiles, userFolders, actions } = useSystemStore.getState();
        const name = baseName(from);
        if (mode === 'move' && parentOf(from) === dest) {
            done.push({ from, to: from });
            continue;
        }
        const to = join(dest, mode === 'move' ? name : copyName(dest, name, { files: userFiles, folders: userFolders }));
        const problem = mode === 'move' ? actions.moveUserPath(from, to) : actions.copyUserPath(from, to);
        if (problem) {
            await xpAlert(
                mode === 'move' ? 'Error Moving File or Folder' : 'Error Copying File or Folder',
                [`Cannot ${mode} ${name}: ${problem}`],
                'error',
            );
            break;
        }
        done.push({ from, to });
    }
    return done;
}

/**
 * Paste the clipboard into `dest`: a Copy copies, a Cut moves. What a Cut moved is used up, so the
 * clipboard keeps only what did not move (after a refusal) — pasting again used to try to move the
 * ones already gone. Resolves with each item pasted.
 */
export async function pasteInto(dest: string): Promise<Transferred[]> {
    const c = clip;
    if (!c) return [];
    const done = await transferInto(dest, c.paths, c.cut ? 'move' : 'copy');
    if (c.cut) {
        const moved = new Set(done.map((d) => d.from));
        const left = transferable(c.paths).filter((p) => !moved.has(p));
        // Only if nothing else was put on the clipboard while the error box was open.
        if (clip === c) setFileClipboard(left.length ? { paths: left, cut: true } : null);
    }
    return done;
}
