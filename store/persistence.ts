/**
 * The store keys that survive a reload.
 *
 * Pure data, no imports: `system/vfs.ts` renders this list into `/etc/system.conf`, and
 * `system/` must stay free of React and of the store itself. The store's `partialize` reads the
 * same list, so the file the shell shows a visitor cannot drift from what is actually persisted.
 */
export const PERSISTED_KEYS = [
    'volume',
    'isMuted',
    'wallpaperId',
    'desktopIcons',
    'recycleBin',
    'deletedAppIds',
] as const;

export type PersistedKey = (typeof PERSISTED_KEYS)[number];

/** Human wording for `/etc/system.conf`. */
export const PERSISTED_KEY_LABELS: Record<PersistedKey, string> = {
    volume: 'volume',
    isMuted: 'mute',
    wallpaperId: 'wallpaper',
    desktopIcons: 'icon positions',
    recycleBin: 'recycle bin',
    deletedAppIds: 'deleted desktop icons',
};
