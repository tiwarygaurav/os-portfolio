import { useMemo, useSyncExternalStore } from 'react';
import { useSystemStore } from '@/store/useSystemStore';
import { copyName, nextFolderName, validateName } from '@/system/vfs';
import { xpAlert, xpConfirm } from '@/utils/dialog';

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

/**
 * Move or copy `paths` into `dest`, one at a time, as Explorer's Paste and a drop did. Moving an
 * item into the folder it is already in does nothing; a copy whose name is taken there becomes
 * "Copy of ...". Stops at the first refusal and says why in XP's error box. Resolves with where the
 * items are now.
 */
export async function transferInto(dest: string, paths: string[], mode: 'move' | 'copy'): Promise<string[]> {
    const done: string[] = [];
    for (const from of paths) {
        // Read fresh for each item: the one before it has just changed the tree.
        const { userFiles, userFolders, actions } = useSystemStore.getState();
        const name = baseName(from);
        if (mode === 'move' && parentOf(from) === dest) {
            done.push(from);
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
        done.push(to);
    }
    return done;
}

/**
 * Paste the clipboard into `dest`: a Cut moves (and is used up once everything on it has moved), a
 * Copy copies. Resolves with where the pasted items are now.
 */
export async function pasteInto(dest: string): Promise<string[]> {
    const c = clip;
    if (!c) return [];
    const done = await transferInto(dest, c.paths, c.cut ? 'move' : 'copy');
    if (c.cut && done.length === c.paths.length) setFileClipboard(null);
    return done;
}
