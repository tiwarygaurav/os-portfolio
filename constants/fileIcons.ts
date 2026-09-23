import { APPS } from '@/constants/apps';
import { DOCUMENTS_PATH, GUEST_PATH, PICTURES_PATH, SAMPLE_PICTURES_PATH, isDir, type VNode } from '@/system/vfs';

/**
 * XP's icons for what is in a folder: folders, documents, pictures, shortcuts.
 *
 * App icons live on the registry (`iconAsset`); these belong to no app, so they live here, once,
 * and Explorer, My Computer and the Open / Save As dialog draw a file the same way. See
 * `public/CLAUDE.md`.
 */
export const FILE_ICONS = {
    folder: '/icons/xp/folder-closed.png',
    /** The folder a window is showing: the address bar, the Look in list. */
    folderOpen: '/icons/xp/folder-open.png',
    /** The visitor's own folders, which XP drew with the user on them. */
    userFolder: '/icons/xp/my-profile-folder.png',
    pictures: '/icons/xp/my-pictures.png',
    music: '/icons/xp/music.png',
    /** A disk. XP's own drive glyph is not in the set; the computer stands in for it. */
    drive: '/icons/xp/my-computer.png',
    /** XP drew a text document with Notepad's page. */
    text: '/icons/xp/notepad.svg',
    picture: '/icons/xp/picture-viewer.svg',
    /** An Internet shortcut: the portfolio's links to GitHub, LinkedIn and the rest. */
    link: '/icons/xp/connect-to.svg',
    binEmpty: '/icons/xp/recycle-bin-empty.svg',
    binFull: '/icons/xp/recycle-bin-full.svg',
    /** A file that stands for a program with no icon of its own. */
    program: '/icons/xp/explorer.png',
} as const;

/** Folders XP gave an icon of their own. */
const SPECIAL_FOLDERS: Record<string, string> = {
    [GUEST_PATH]: FILE_ICONS.userFolder,
    [DOCUMENTS_PATH]: FILE_ICONS.userFolder,
    [PICTURES_PATH]: FILE_ICONS.pictures,
    [SAMPLE_PICTURES_PATH]: FILE_ICONS.pictures,
};

/**
 * The icon Explorer shows for a node at `path`: a special folder's own, a program shortcut's
 * program's, or the icon for its kind.
 */
export function fileIconFor(node: VNode, path?: string): string {
    if (isDir(node)) return (path && SPECIAL_FOLDERS[path]) || FILE_ICONS.folder;
    if (node.mime === 'application/x-link') return FILE_ICONS.link;
    if (node.mime === 'application/x-app') {
        const appId = node.open?.appId;
        return (appId && APPS[appId]?.iconAsset) || FILE_ICONS.program;
    }
    if (node.src) return FILE_ICONS.picture;
    return FILE_ICONS.text;
}
