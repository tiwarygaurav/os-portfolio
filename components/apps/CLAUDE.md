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

## Registering an app — one file

Add an entry to `APPS` in `constants/apps.ts`. It carries the metadata *and* the component:

```ts
load: () => import('@/components/apps/YourApp'),
category: 'accessory',          // groups it in All Programs
surfaces: ['desktop', 'start', 'run'],
aliases: ['yourapp.exe'],       // extra names the Run dialog accepts
```

`surfaces` is what puts it on the desktop, in the Start menu and in the Run dialog, so there is
no second list to update anywhere. `load` is a `next/dynamic` import, so the app is code-split
and fetched the first time it opens.

There used to be a second table in `components/os/Window.tsx`, and forgetting it failed silently
at runtime with "App not found". That table is gone. `Window` caches the dynamic component by
app id — never build one during render, because `dynamic()` returns a new component type each
call and the app would remount and lose its state.

To make an app reachable from the shell, add a file in `system/vfs.ts` carrying
`open: { appId, payload }`. Then `open <path>` and a double-click do the same thing.

## Rules

1. **Read facts from `@/content`.** Never hardcode a name, job title, link, stack list or date in
   this directory. Every content-drift bug in `docs/AUDIT.md` §3 came from ignoring this.
2. **No dead controls.** A button that does nothing must be implemented, visibly disabled with a
   reason, or deleted. This directory currently holds ~25 inert controls — do not add more.
3. **No `alert()` / `confirm()`.** They shatter the illusion harder than a missing feature. Use
   `xpAlert` / `xpConfirm` from `@/utils/dialog`; both return promises and render as XP message
   boxes. There are no native dialogs left in the tree — do not reintroduce one.
4. **No invented data.** No proficiency percentages, no fabricated metrics, no placeholder
   companies. If a value is unknown, render it as unknown.
5. **Selectors, not the bare store.** See `store/CLAUDE.md`.
6. **Own your cleanup.** Timers, listeners, audio and animation frames must be torn down on
   unmount — an app can be closed at any moment.
7. **Menus and in-window dialogs come from `components/ui/`.** `MenuBar` (access keys, F10,
   status-bar hints, dropdowns that overhang the window) and `AppDialog` (focus trapped, then handed
   back) carry XP's keyboard behaviour; `xp-controls` wraps the `app/luna.css` buttons, inputs and
   group boxes. Do not hand-roll another.

## Current inventory

| App | State | Notes |
| --- | --- | --- |
| `TerminalApp` | **Rebuilt** on `system/shell` | Real VFS, history recall, Tab completion, `ps`/`kill` over live windows. Renderer only. |
| `ProjectsApp` | **Migrated** | Reads `content/`; accepts `payload.projectId` so `open ~/projects/<id>` lands on that project; confidential work uses the disclosure pattern. |
| `AboutApp` | **Migrated** | Reads `content/`; real photo; unconfirmed fields labelled; roles with no details say so. |
| `SkillsApp` | **Rewritten** | Evidence model replaced invented percentages; selecting a skill opens the work that demonstrates it. |
| `ResumeApp` | **Fixed** | Real PDF verified with a HEAD request, plus a document generated from `content/`. Download and open-in-tab both work. |
| `ContactApp` | **Fixed** | `mailto:` hand-off with validation and a clipboard fallback. Never claims delivery. |
| `MusicPlayerApp` | **WMP 9** | Now Playing over the original XP playlist and files (`mediaplayer/`). Transport follows the audio element's own events; volume and mute are a gain node after an `AnalyserNode`, so the visualisations show the music with the sound down; shuffle, repeat, WMP's keys; failures are reported. |
| `MinesweeperApp` | **winmine** | Beginner / Intermediate / Expert / Custom, chording, Marks, Color, Sound, best times for the session, a window that hugs the field. Rules in `minesweeper/engine.ts` (pure, unit-tested). |
| `SolitaireApp` | **New** | Klondike as sol.exe: Draw One / Three, Standard / Vegas / None scoring, Deck and Options, auto-play, undo, the win cascade. Rules in `solitaire/engine.ts` (pure, unit-tested). Settings last the session. |
| `CalculatorApp` | **calc.exe** | Standard (left to right) and Scientific (precedence, parentheses); Hex / Dec / Oct / Bin with exact BigInt word sizes; Inv / Hyp; Statistics Box; paste as keystrokes; the window fits each view. Engine in `calculator/` (pure, unit-tested). Decimals are doubles to 16 digits, and Help says so. |
| `SettingsApp` | **Complete** | Every tab is real: Themes (Windows XP / Modified), Desktop (wallpaper, Browse... for a picture with Center / Tile / Stretch, icon reset, restore deleted icons), Screen Saver (four savers, wait, Preview), Appearance (Blue / Olive Green / Silver, applied as soon as chosen), Settings (read from the browser). |
| `EventViewerApp` | **New** | Application / Security / System logs over `system/bus.ts`. Nothing seeded; Clear all events is real. |
| `MyComputerApp` | **XP layout** | Luna task pane (`components/ui/TaskPane`) and XP icons; selects on a click, opens on a double-click (a tap on a phone), Details describes the selection. Volumes report real counts from `content/`. View system information opens System Information. |
| `NotepadApp` | **Real files** | Open / Save / Save As over the VFS through `FileDialog`; `payload.path` opens a file; XP's "save the changes?" on New, Open, Exit and the title-bar X (a store close guard); read-only portfolio files open with Save redirected to Save As; titled `<name> - Notepad`. |
| `TaskManagerApp` | **New** | Applications / Processes / Performance over the live window list. End Task really closes. No metric is drawn that the browser cannot supply — a minimised window shows "Minimized", never a fabricated "Not Responding". |
| `ImageViewerApp` | **Real folder** | Shows the pictures in the opened picture's folder (Sample Pictures by default); Previous/Next walk the same files Explorer lists; Delete sends a visitor's picture to the Recycle Bin (Shift+Delete for good); built-in ones cannot be deleted and the button says why. |
| `RecycleBinApp` | **Files too** | Desktop icons and the visitor's files and folders. Select, then Restore this item / Restore all items from the task pane; Delete removes one for good; Empty asks first. A restore remakes missing folders and refuses rather than overwrite. |
| `PaintApp` | **Rebuilt** | XP's Paint on an aliased pixel engine (`paint/`): sixteen tools, the colour box and Edit Colors, the Image menu, text, undo. Open / Save into My Pictures through `FileDialog`, a close guard, Set As Background, Open / Save to Computer; `payload.path` opens a picture. |
| `ExplorerApp` | **Full** | Windows Explorer over `system/vfs.ts`. Folders navigate; a file's `open` hint launches its app, same as the shell. Back/Forward/Up/address bar; Tiles / Icons / List / Details (`explorer/FileList`); right-click menus, Cut/Copy/Paste, New Folder / Text Document, F2 rename, Delete to the bin, drag onto a folder; Properties; the Search Companion (`explorer/SearchPane`); the Folders tree (`explorer/FolderTree`); multiple selection (Ctrl, Shift, Ctrl+A) with Delete, Cut/Copy, drag and a summed Properties. Selection is keyed by path. |
| `SystemInfoApp` | **New** | XP's System Information (msinfo32). System Summary / Components from what the browser reports, "Not reported" otherwise; Running Tasks; Loaded Modules and Packages from the build-time module graph (`system/source.ts`), with imports and importers linked; Dependency Rule checked against every import; msinfo32's Find bar. |
