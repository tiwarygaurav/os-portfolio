# store/ — global state and the window manager

`useSystemStore.ts` is a single Zustand store holding session state (boot/login/shutdown), the
window manager, desktop preferences and the recycle bin. All actions live under `state.actions`,
which is created once and is therefore referentially stable — safe to select directly.

`persistence.ts` sits beside it and holds nothing but data: `PERSISTED_KEYS` and their human
labels. It has no imports, so `system/vfs.ts` can read it to generate `/etc/system.conf` without
`system/` gaining a dependency on the store. Adding a persisted field means editing that list;
both the middleware and the file the shell shows a visitor follow from it.

## Shape

| Slice | Fields |
| --- | --- |
| Session | `isBooting`, `isLoggedIn`, `isShuttingDown` |
| Audio | `audioEnabled`, `volume`, `isMuted` |
| Appearance | `wallpaperId`, `wallpaperFile` (`{ path, position }` — a picture file, never a copy), `themeId` (Luna scheme), `screenSaver` (`{ kind, idleMinutes }`), `screenSaverActive` (never persisted) |
| Dialogs | `dialogs: DialogRequest[]` (never persisted; resolvers live in a module-level Map) |
| Windows | `windows: AppWindow[]`, `activeWindowId` |
| Desktop | `desktopIcons: Record<id, {x,y}>`, `deletedAppIds` |
| Recycle bin | `recycleBin: RecycledItem[]` |

`AppWindow.id` doubles as the pid in `/proc` and in `ps`. Keep it **short and human-typable**: a
visitor reads one off the screen and types it into `kill`. It used to be nine random characters,
which both overflowed the `ps` column and made the pid impossible to identify.

## Persistence

`persist` under the key `gaurav-xp-os`. `partialize` is derived from `PERSISTED_KEYS`, so the
persisted slice is exactly: volume, mute, wallpaper, colour scheme, screen saver, icon positions,
recycle bin, deleted app ids. `merge` validates `themeId` and `screenSaver` on the way back in —
localStorage is user-editable, and a save from an older build has neither key.
Windows, focus and session state are deliberately not persisted — a reload should return to a
clean desktop.

Adding a field? Decide explicitly whether it belongs in `PERSISTED_KEYS`. Anything persisted is a
promise you are making to a visitor's browser for the next year.

## Rules

1. **Always subscribe with a selector.**
   ```ts
   const windows = useSystemStore((s) => s.windows);            // yes
   const open    = useSystemStore((s) => s.actions.openWindow); // yes
   const { windows, actions } = useSystemStore();               // no — re-renders on any change
   ```
2. **Window geometry lives here, not in components.** `Window.tsx` mirrors size into local state
   only for the duration of a resize drag, then commits. Do not add a second source of truth.
3. **Actions must be total.** `closeProcess`-style callers rely on actions being safe to call with
   a stale id.
4. **No content in the store.** Names, links and job titles come from `content/`. The store holds
   *session* state only.
5. **No `any`.** `AppWindow.payload` is `WindowPayload` (`Record<string, string>`) because payloads
   cross the shell boundary and must stay serialisable. Typing it as a per-app discriminated union
   is the remaining debt.

## Visitor files

`userFiles: Record<path, { content, mime, modified }>` and `userFolders: string[]` are persisted and
sanitised on hydration — folders first, parents before children, then files against the folders that
survived (anything failing `validateUserPath` or with the wrong shape is dropped). `writeUserFile`,
`deleteUserFile`, `createUserFolder`, `moveUserPath` and `deleteUserFolder` return the refusal reason
or null, enforce `USER_FILES_QUOTA` (folder paths count toward it), roll back if the browser refused
to store the change, and publish `fs:write` / `fs:delete` / `fs:mkdir` / `fs:move`. A move or delete
is computed by the VFS's pure `planMove` / `planRemoveFolder`; the store only applies it, and moves a
picture wallpaper along with its file. After every change the store calls `mountUserFiles` so the
headless VFS sees the same files and folders. Storage itself goes through `safeLocalStorage`, which cannot throw: a full or
blocked localStorage is reported as an Event Viewer error instead of breaking the action.

`registerCloseGuard(id, guard)` lets an app answer "may I close?" asynchronously (Notepad asks about
unsaved work). An ordinary `closeWindow(id)` runs the guard; `closeWindow(id, 'shell' | 'task-manager')`
bypasses it. `setWindowTitle` retitles a window (`notes.txt - Notepad`).

## Events

Actions publish to `system/bus.ts` **after** `set()`, never inside a `set` updater (updaters must be
pure — React may call them twice). They publish only real changes: `closeWindow` on a stale pid,
`minimizeWindow` on an already-minimised window and a no-op `setTheme` all publish nothing.

## Window manager internals

`Z_BASE = 10` is the bottom of the window band; the taskbar sits above it at `z-50`. **Every
z-index is derived from stack position** by `renormalize`, so the invariant "the n open windows
occupy exactly `Z_BASE..Z_BASE+n-1`" holds after every open, close, focus and restore. There is no
free-running counter: the previous design kept one, and any path that bypassed `focusWindow`
(Alt+F4, `kill`, opening from the Start menu) ratcheted it upward until windows drew over the
taskbar.

`clampToViewport` keeps a grabbable strip of every window on screen; `clampIconToViewport` keeps a
desktop icon fully inside the desktop area. Icon positions persist, so the icon clamp is applied
both on write **and** at render in `DesktopIcon` — a position saved on a wide monitor would
otherwise put the icon off-screen forever on a laptop.

`openWindow` reads the size from `constants/apps.ts` and caps it to the viewport. For a long time
it ignored the registry entirely and opened everything at 800x600, which stretched the Calculator's
button grid across a window it was also forbidden to resize.

`restoreWindow` and `unmaximizeWindow` are deliberately separate: restore un-minimises **without**
clearing `isMaximized`.

**A minimised window is hidden, not unmounted.** `Window.tsx` sets `display: none` rather than
returning null. Returning null destroyed every app's local state on minimise — a Minesweeper game,
unsaved Notepad text, the terminal's scrollback and working directory, and the media player's
`<audio>` element mid-track. The store round-trip was always lossless; the rendered app was not.

**Clamped positions must be written back into the motion values.** `Window` and `DesktopIcon` own
their `x`/`y` as `useMotionValue`s. Framer-motion diffs an `animate` target against the previous
*target*, not against where a drag actually left the element, so dragging off the same edge twice
produced an identical clamped value, framer skipped it, and the element stayed off-screen while
the store believed otherwise.

## Fixed in P1 (2026-08-20)

C4 lossy restore · C5 unbounded z-index · C6 restore not raising · C8 off-screen drag (windows
*and* icons) · A11 dead `themeColor` state (removed; theming returned on 2026-09-23 as a real
`themeId` backed by the Luna CSS tokens).

## Known defects still open

| Id | Issue |
| --- | --- |
| A10 | `deletedAppIds` persists by design. Mitigated: `restoreAllItems`, surfaced as Display Properties > Desktop > Restore Deleted Icons. |
| — | `AppWindow` has no `openedAt`, so the future System Monitor cannot show process uptime. Add it when that app lands (`docs/ROADMAP.md` §4). |
