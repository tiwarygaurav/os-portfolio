import { useSystemStore } from '@/store/useSystemStore';

/**
 * Re-render when the visitor's files change.
 *
 * The virtual filesystem is headless and reads the files the store mounts into it, so a component
 * that lists a folder has no React dependency that changes when a file is saved. Selecting
 * `userFiles` gives it one: the store replaces that object on every write.
 */
export const useFsRevision = () => useSystemStore((s) => s.userFiles);
