# components/apps/ — one component per application window

Each file here renders the *inside* of a window. The chrome (title bar, buttons, drag, resize) is
owned by `components/os/Window.tsx`; an app must never draw its own title bar or close button.

## The app contract

```tsx
interface AppProps {
  windowId?: string;                     // pid — also the key in /proc
  payload?: Record<string, string>;      // launch argument, e.g. { projectId: 'os-portfolio' }
}
```

An app fills `h-full`, scrolls internally, and assumes nothing about its size — every app can be
resized or maximised unless its registry entry says otherwise.

## Registering an app — two files, both required

1. `constants/apps.ts` -> add to `APPS` (id, title, icon, `iconAsset`, default size,
   `canResize` / `canMaximize`) and optionally to `DESKTOP_ICONS`.
2. `components/os/Window.tsx` -> add to `APP_COMPONENTS`.

Forgetting step 2 fails silently at runtime with "App not found". This split is known debt
(`docs/AUDIT.md` A2) — collapsing the two into one registry with `next/dynamic` is a P4 task that
also fixes the "all 15 apps in the initial bundle" problem.

To make an app reachable from the shell, add a file in `system/vfs.ts` carrying
`open: { appId, payload }`. Then `open <path>` and a double-click do the same thing.

## Rules

1. **Read facts from `@/content`.** Never hardcode a name, job title, link, stack list or date in
   this directory. Every content-drift bug in `docs/AUDIT.md` §3 came from ignoring this.
2. **No dead controls.** A button that does nothing must be implemented, visibly disabled with a
   reason, or deleted. This directory currently holds ~25 inert controls — do not add more.
3. **No `alert()` / `confirm()`.** They shatter the illusion harder than a missing feature. Use an
   in-world dialog.
4. **No invented data.** No proficiency percentages, no fabricated metrics, no placeholder
   companies. If a value is unknown, render it as unknown.
5. **Selectors, not the bare store.** See `store/CLAUDE.md`.
6. **Own your cleanup.** Timers, listeners, audio and animation frames must be torn down on
   unmount — an app can be closed at any moment.

## Current inventory

| App | State | Notes |
| --- | --- | --- |
| `TerminalApp` | **Rebuilt** on `system/shell` | Real VFS, history recall, Tab completion, `ps`/`kill` over live windows. Renderer only. |
| `ProjectsApp` | **Migrated** | Reads `content/`; accepts `payload.projectId` so `open ~/projects/<id>` lands on that project; confidential work uses the disclosure pattern. |
| `AboutApp` | **Migrated** | Reads `content/`; real photo; unconfirmed fields labelled; roles with no details say so. |
| `SkillsApp` | **Rewritten** | Evidence model replaced invented percentages; selecting a skill opens the work that demonstrates it. |
| `ResumeApp` | **Fixed** | Real PDF verified with a HEAD request, plus a document generated from `content/`. Download and open-in-tab both work. |
| `ContactApp` | **Fixed** | `mailto:` hand-off with validation and a clipboard fallback. Never claims delivery. |
| `MusicPlayerApp` | **Fixed** | Keeps the original XP playlist and files. `isPlaying` now follows the audio element's own events, taskbar volume + mute apply, and failures are reported. |
| `MinesweeperApp` | Complete | First-click-safe generation, flood fill, flagging, win detection. Correct. |
| `CalculatorApp` | Complete | Incl. memory, `sqrt`, `%`, `1/x`, backspace. |
| `SettingsApp` | Partial, honest | Wallpaper + icon reset work. Themes / Screen Saver / Appearance now state plainly that they are not built. |
| `MyComputerApp` | Partial, honest | Inert toolbar removed; volumes report real counts from `content/`. |
| `NotepadApp` | Works | Built on deprecated `document.execCommand`; Paste is blocked by browsers. |
| `ImageViewerApp` | Works | Zoom/rotate/navigate. Image list still hardcoded. |
| `RecycleBinApp` | Works | Real state, restore + empty. |
| `PaintApp` | **Third-party** | An `<iframe>` to `jspaint.app`. Not the owner's work, and blockable by the host. Unresolved. |
