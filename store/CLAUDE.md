# store/ — global state and the window manager

`useSystemStore.ts` is a single Zustand store holding session state (boot/login/shutdown), the
window manager, desktop preferences and the recycle bin. All actions live under `state.actions`,
which is created once and is therefore referentially stable — safe to select directly.

## Shape

| Slice | Fields |
| --- | --- |
| Session | `isBooting`, `isLoggedIn`, `isShuttingDown` |
| Audio | `audioEnabled`, `volume`, `isMuted` |
| Appearance | `wallpaperId`, `themeColor` |
| Windows | `windows: AppWindow[]`, `activeWindowId`, `nextZIndex` |
| Desktop | `desktopIcons: Record<id, {x,y}>`, `deletedAppIds` |
| Recycle bin | `recycleBin: RecycledItem[]` |

`AppWindow.id` doubles as the pid in `/proc` and in `ps`. Keep it opaque and stable.

## Persistence

`persist` under the key `gaurav-xp-os`, with `partialize` allowing **only** preferences through:
volume, mute, wallpaper, theme, icon positions, recycle bin, deleted app ids. Windows, focus and
session state are deliberately not persisted — a reload should return to a clean desktop.

Adding a field? Decide explicitly whether it belongs in `partialize`. Anything persisted is a
promise you are making to a visitor's browser for the next year.

## Rules

1. **Always subscribe with a selector.**
   ```ts
   const windows = useSystemStore((s) => s.windows);            // yes
   const open    = useSystemStore((s) => s.actions.openWindow); // yes
   const { windows, actions } = useSystemStore();               // no — re-renders on any change
   ```
   Nine components currently use the bare form (including `DesktopIcon`, so all 13 icons re-render
   on every window focus). Migrate them opportunistically; never add a new one.
2. **Window geometry lives here, not in components.** `Window.tsx` mirrors size into local state
   only for the duration of a resize drag, then commits. Do not add a second source of truth.
3. **Actions must be total.** `closeProcess`-style callers rely on actions being safe to call with
   a stale id.
4. **No content in the store.** Names, links and job titles come from `content/`. The store holds
   *session* state only.
5. **No `any` in new fields.** `AppWindow.payload` is currently `any` and is a known debt item —
   type it as a per-app discriminated union when the apps that use payloads land.

## Window manager internals

`Z_BASE = 10` is the bottom of the window band; the taskbar sits above it at `z-50`.
`raise(windows, id)` re-stacks so the target is on top and everything else keeps its relative
order, renormalised into a compact `Z_BASE..Z_BASE+n` range. **z-indices never grow without
bound** — the previous version incremented forever, and windows began drawing over the taskbar
after roughly forty focus changes.

`clampToViewport` keeps a grabbable strip of every window on screen. Icon positions persist, so
an unclamped drag used to lose an icon permanently.

`restoreWindow` and `unmaximizeWindow` are deliberately separate: restore un-minimises **without**
clearing `isMaximized`, so a minimise/restore round-trip is lossless.

## Fixed in P1 (2026-08-20)

C4 lossy restore · C5 unbounded z-index · C6 restore not raising · C8 off-screen drag ·
A11 dead `themeColor` state (removed entirely — the Themes tab now says theming is not built).

## Known defects still open

| Id | Issue |
| --- | --- |
| A10 | `deletedAppIds` persists, so a visitor can permanently lose the Projects icon with no obvious way back. Consider protecting core portfolio apps from deletion. |
| A3 | `Desktop`, `Taskbar`, `StartMenu`, `DesktopIcon` and `RecycleBinApp` still subscribe with the bare `useSystemStore()`. `Window`, `Settings`, `MyComputer`, `Skills`, `Projects` and `Terminal` have been migrated to selectors. |
| — | `AppWindow` has no `openedAt`, so the future System Monitor cannot show process uptime. Add it when that app lands (`docs/ROADMAP.md` §4). |
