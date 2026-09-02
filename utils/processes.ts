import { useMemo } from 'react';
import { useSystemStore, type AppWindow } from '@/store/useSystemStore';
import type { ProcEntry } from '@/system/vfs';

/**
 * Project the open windows as processes.
 *
 * `/proc`, `ps`, the Task Manager and the Run dialog all need the same view of the window list,
 * and it must be one projection: if the shell and the Task Manager disagreed about what is
 * running, the claim this desktop makes about being a real system would be false.
 */
export const toProcEntry = (w: AppWindow): ProcEntry => ({
    pid: w.id,
    appId: w.appId,
    title: w.title,
    state: w.isMinimized ? 'minimized' : w.isMaximized ? 'maximized' : 'running',
    zIndex: w.zIndex,
});

/** The live process list, recomputed only when the windows change. */
export function useProcesses(): ProcEntry[] {
    const windows = useSystemStore((s) => s.windows);
    return useMemo(() => windows.map(toProcEntry), [windows]);
}
