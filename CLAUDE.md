# CLAUDE.md — Project Context

> Long-term memory for this repository. Read this first, every session.
> Keep it **accurate over flattering**. If something is broken, say so here.
> Last structural update: 2026-08-19.

---

## 1. Project identity

**Repo:** `os-portfolio` — https://github.com/tiwarygaurav/os-portfolio
**Owner:** Kumar Gaurav (`tiwarygaurav`) — software engineer; backend, geospatial data, applied ML.
**Deployed:** **no.** `https://os-portfolio.vercel.app` serves an unrelated person's site, and the owner's Vercel account has no project for this repository (checked 2026-09-02). The former "Live" link was removed from `content/projects.ts`; add one only when a deployment exists.

### What it is today

A browser-based Windows XP simulation used as a personal portfolio. Boot screen -> login ->
desktop with draggable icons, taskbar, start menu, and floating windows containing portfolio
content plus toy apps (Minesweeper, Solitaire, Calculator, Notepad, Paint).

### What it is becoming

**The same desktop, working properly.**

> **The Windows XP identity is settled. Do not re-skin, rename, or "evolve" it.**
> The boot screen, login, Bliss wallpaper, XP startup sound, taskbar, beige dialogs, the XP app
> names ("Windows Media Player", "Windows Picture and Fax Viewer", "Display Properties",
> "Recycle Bin", "Resume.pdf") and the media-player playlist are all deliberate and stay.
> This was tried once and reversed on the owner's instruction — see §8, 2026-08-20.

What separates this from the many other XP-clone portfolios is not a different look. It is that
the OS primitives underneath the XP chrome are **real**:

| Generic XP portfolio | This one |
| --- | --- |
| OS chrome is a *skin* over static content | XP chrome sits on real primitives — VFS, process table — and the content lives inside them |
| Terminal fakes ~10 commands | Command Prompt is a shell over the same filesystem the GUI apps read |
| "Skills: React 95%" | Skills name the work that evidences them; clicking one opens that work |
| `ps` is decorative | `ps` lists the actual open windows, and `kill w2` closes one |

So: **XP on the surface, a real system underneath.** Effort goes into functionality, correctness
and honesty — never into replacing the XP identity.

The system name lives in `content/profile.ts` -> `SYSTEM` and nowhere else, so the boot screen,
login, shutdown dialog, shell prompt and welcome balloon all stay in sync from one edit.

### Target audience — two layers, both first-class

- **Layer A — recruiters / non-technical.** Must reach About, Experience, Projects, Skills,
  Resume, Contact, GitHub, LinkedIn within ~20 seconds, without discovering anything.
- **Layer B — engineers.** Rewarded for exploring: shell, process monitor, architecture viewer,
  the process table, the real filesystem, and how the desktop is actually built.

If a change makes Layer B better by making Layer A worse, it is the wrong change.

### Design philosophy

1. Fidelity to Windows XP on the surface — the look, names and sounds are the identity.
2. Interaction over decoration — an effect must communicate state.
3. Real information over filler — **never fabricate** companies, metrics, titles, or results.
4. Five extraordinary details beat fifty mediocre ones.
5. Delight emerges from the system behaving like a real system underneath a familiar surface.

### Technical philosophy

The site is itself the portfolio piece. Its architecture must survive being explained on a
whiteboard in an interview. Prefer real primitives (a filesystem, a process table, an event bus)
over hardcoded simulations of them, because the real version is *less* code and *more*
impressive.

---

## 2. Architecture

| Layer | Choice | Notes |
| --- | --- | --- |
| Framework | Next.js 14.1.0, App Router | Single route: `app/page.tsx` |
| Rendering | Effectively 100% client | `page.tsx` returns `null` until `mounted`; a `<noscript>` block in the layout still gives the name, the summary and the links |
| Language | TypeScript 5, `strict: true` | `any` still present in several contracts |
| State | Zustand 4 + `persist` (localStorage) | `store/useSystemStore.ts`, key `gaurav-xp-os` |
| Styling | Tailwind 3 + `app/luna.css` | `luna.css` is the XP visual style (scheme tokens + `.xp-*` classes); `utils/cn.ts` = clsx + tailwind-merge |
| Animation | Framer Motion 11 | Drag, window transitions, mount fades |
| Icons | `/public/icons/xp/` (PNG + SVG) + lucide-react | XP artwork for identity, rendered by `components/ui/XpIcon`; lucide for controls. See `public/CLAUDE.md` |
| Audio | WebAudio synthesis of XP's sound scheme, `<audio>` for samples | `utils/sound.ts`; `startup.mp3` plays as the desktop appears after logon |
| Data | `content/` -> `system/vfs.ts` | Single source of truth (introduced 2026-08-19) |

### Directory map

```
app/          layout + the single page; boot/login/desktop/shutdown state machine;
              luna.css (the XP visual style) and globals.css
components/
  os/         shell chrome: BootScreen, LoginScreen, Desktop, Window, Taskbar,
              StartMenu, DesktopIcon, ExplorerLayout, ExitWindows (Log Off / Turn Off),
              SessionScreens, Dialog, RunDialog, Tooltips, captionZoom
  apps/       one component per application window
  ui/         shared primitives (ContextMenu, XpIcon, MenuBar, AppDialog, xp-controls, Disclosure)
constants/    apps.ts — the app registry (id, title, icon, default size, capabilities)
content/      Typed source of truth for all portfolio facts. No JSX, no styling.
system/       Headless runtime: virtual filesystem, shell, event bus. No React.
              architecture.generated.ts is built from the source (gitignored).
scripts/      gen-architecture.mjs: the module graph, run before dev / build / tests
store/        Zustand store + window manager
utils/        cn, sound, dialog (XP message boxes), processes (window -> ProcEntry)
tests/        unit/ (node:test over the headless layers) + e2e/ (Playwright over the real UI)
public/       icons, wallpapers, sounds, profile image, resume
docs/         AUDIT.md (standing audit) + ROADMAP.md (forward plan)
```

### Dependency direction (must not be violated)

```
content/  ---->  system/  ---->  components/  ---->  app/
   |                                  ^
   +----------------------------------+   (apps may read content directly)

store/ is a leaf that components/ and system/ may both touch.
```

`content/` and `system/` must never import from `components/`, `app/`, or `react`. Of `store/`,
`system/` reads only `store/persistence.ts` (pure data, no imports) — the store itself pushes into the
VFS instead. `tests/unit/architecture.test.cjs` checks all of this against every import in the tree.

---

## 3. Core systems

### Boot -> login -> desktop -> shutdown

State machine lives in `store/useSystemStore.ts` (`isBooting`, `isLoggedIn`, `isShuttingDown`)
and renders from `app/page.tsx`. Boot starts on its own and is a fixed 4 s timer, not tied to real
loading. The browser's audio gesture is the click on the account at the Welcome screen, which plays
XP's sequence ("Loading your personal settings...", then "welcome") and the startup sound as the
desktop appears — where XP played it. Any future sound before that click would be refused.

Leaving goes through XP's dialogs (`ExitWindows`), over a screen that drains to grey. Log Off,
Turn Off and Restart first call `requestEndSession()`, so each window with unsaved work is brought
forward and asked; the first Cancel keeps the session. Log Off shows "Saving your settings..." and
returns to the Welcome screen. Turn Off shows "... is shutting down..." for 2.8 s and leaves the
machine powered off — a black screen whose one button reloads (`page.tsx` owns that state); Restart
reloads at the same point (`components/os/power.ts` carries the choice). Switch User shows the
Welcome screen over a session that keeps running ("N programs running"). Stand By darkens the screen
until input.

### Window manager (`store/useSystemStore.ts` + `components/os/Window.tsx`)

- One window per `appId` (re-opening focuses the existing one and replaces `payload`).
- Windows are absolutely positioned; drag via Framer `useDragControls` started from the title bar.
- `zIndex` is renormalised to a compact `10..10+n` band on every focus, so windows can never
  climb over the taskbar (`z-50`).
- Resize from every edge and corner (invisible `.xp-resize` handles); `canResize` / `canMaximize`
  come from the app registry.
- XP's window behaviours: the system menu (right-click the title bar or a task button, click the
  title-bar icon; double-click the icon closes), and the caption ghost that flies between a title
  bar and its taskbar button on minimise, restore and maximise (`captionZoom.ts`, transform only).
  Windows appear and close without animation, as XP's did.
- Window ids are readable pids (`w1`, `w2`, …) because `ps` and `kill` expose them to the user.
- `restoreWindow` (un-minimise, keeps maximised) and `unmaximizeWindow` are separate on purpose.
- Positions are clamped so a window can never be dragged fully off-screen.

### App registry (`constants/apps.ts`)

`APPS: Record<string, AppConfig>` is the **single** place an app is declared: id, title, icon,
size, capabilities, the `category` that groups it in All Programs, the `surfaces` it appears on
(desktop / start / run), the Run-dialog `aliases` (`calc`, `cmd`, `mspaint`), and `load` — a
`next/dynamic` import of the window body.

The component map used to be a second table in `components/os/Window.tsx`, so an app added to one
file and not the other failed silently at runtime. `Window` now resolves the body from the
registry and caches it by app id (never build a `dynamic()` during render: it returns a new
component type each call, so the app would remount and lose its state). Because every body is a
dynamic import, the fifteen apps are code-split rather than all landing in the first paint.

### Terminal / shell

`system/shell.ts` is a **headless** command layer: it parses input and returns `ShellLine[]` —
no JSX, no DOM. `components/apps/TerminalApp.tsx` renders that output. Commands operate on the
real VFS (`system/vfs.ts`) and receive a `ShellContext` for side effects (open/close windows,
list processes). Adding a command must not require touching the renderer.

### Virtual filesystem (`system/vfs.ts`)

A tree built at module load from `content/`. `/home/gaurav/**` mirrors the portfolio and is
read-only; `/proc` is generated per call from live window state. Files can carry an `open` hint
`{ appId, payload }` so `open <path>` launches the matching GUI app — this is what keeps shell and
GUI in sync. A text file with no window of its own defaults to Notepad, as XP's associations did.

**`/home/guest` is the visitor's, and writable.** My Documents, My Pictures (with a read-only
Sample Pictures), the guest root, and any folders the visitor makes in them. Files live in the
store's persisted `userFiles` and folders in `userFolders`, together capped at 2,000,000
characters, and the store mounts both into the VFS with `mountUserFiles` on every change — the VFS
stays headless and never imports the store. `validateUserPath` is the one place that decides what
can be written, so Notepad's Save As, the shell's `>`, `mkdir` and `mv`, and the store all refuse
the same paths with the same words. Rename, move and folder delete are pure functions over the tree
(`planMove`, `planRemoveFolder`) that the store applies and the unit tests call directly. Notepad,
the picture viewer, Explorer and the shell all read and write the same files;
`components/os/FileDialog.tsx` is the shared XP Open / Save As dialog, and
`components/ui/RenameField.tsx` the in-place rename box it shares with Explorer.

### Event bus (`system/bus.ts`)

A headless, typed, bounded log. The store, the shell and the apps `publish` what *happened*
(`app:opened`, `shell:command`, `setting:changed`, `recycle:deleted`, `dialog:answered`...); the
Event Viewer app and the shell's `events` command read the same log. `describe()` is an exhaustive
switch, so a new event kind without a human description is a compile error. Store actions publish
*after* `set()`, never inside an updater, and only when something really changed — closing a stale
pid publishes nothing.

### Colour schemes and the screen saver

The Luna chrome colours are CSS variables in `app/luna.css` (`--luna-*`), selected by
`data-theme` on `<html>` (Blue / Olive Green / Silver). Components use `luna-*` classes, never the
hex values. `Desktop` sets the attribute from `themeId`; any subtree can set its own `data-theme`.
Schemes apply the moment they are chosen — Display Properties has no preview-before-apply. The screen saver
(`components/os/ScreenSaver.tsx`) is a real idle timer over pointer/key/wheel/touch input plus four
canvas animations with XP's names; it is the one thing allowed to animate indefinitely.

### Audio (`utils/sound.ts`)

XP's default sound scheme, synthesised through a single lazily-created `AudioContext` (additive
bells and pads through a generated reverb); `startup` is the only sampled file. The scheme voices
the session (startup, logon, logoff, shutdown), message boxes (`utils/dialog.ts` picks Ding,
Exclamation or Critical Stop from the symbol; Question is silent, as in XP), the Recycle Bin, and
Explorer's navigation click — and is silent for opening, closing and minimising windows, as XP was.
Legacy names (`open`, `close`, `click`...) still resolve. Volume/mute read from the store on every
call. Never autoplay before a user gesture.

### Persistence

`partialize` is derived from `store/persistence.ts`: volume, mute, wallpaper, wallpaper picture,
colour scheme, screen saver, the visitor's files, icon positions, recycle bin, deleted app ids. `/etc/system.conf` renders the same list. Windows,
dialogs and session state are deliberately **not** persisted. A `merge` validates what comes back from
localStorage, since a visitor can edit it and older saves lack newer keys.

---

## 4. Design language

**The XP look is defined once, in `app/luna.css`.** Two layers:

- **Scheme tokens** (`--luna-*`, selected by `[data-theme]`): Blue carries the multi-stop gradients
  of the Luna bitmaps — title bar `#0058ee`-based with its darker ends, the 16-stop taskbar from
  `#1f2f86` to `#1941a5`, the lighter tray, the Start menu header and footer — plus `#ece9d8`
  control face and `#316ac5` selection. Olive Green and Silver are approximations, tuned for text
  contrast (Silver takes dark caption text).
- **`.xp-*` component classes**: window frame and caption buttons, taskbar, Start menu, menus,
  buttons, inputs, checkboxes and radios, group boxes, tabs, progress, trackbars, status bars,
  scrollbars, task panes, tooltips, balloons, the logon/boot/exit screens. System chrome and app
  bodies use the same classes (the in-app `MenuBar`, `AppDialog` and `xp-controls` are built on
  them), so an in-app dialog cannot drift from a system one.

Fonts are XP's: Tahoma 11px for UI, Trebuchet MS bold 13px for captions, Franklin Gothic Medium
italic for "start" and "welcome". The taskbar is 30px (36px on phones; `TASKBAR_HEIGHT` /
`taskbarHeight()` in `utils/viewport.ts` and `--xp-taskbar-h` are the same number). Do not add hex
values to components: add a token or a class to `luna.css`. Native `title` tooltips on the chrome
are replaced by `data-tip`, drawn as XP tooltips by `components/os/Tooltips.tsx`.

**Motion:** 120–200 ms, ease-out, transform/opacity only. Nothing loops forever. Motion states a
change; it never decorates. Stated exceptions: the grey fade behind Log Off / Turn Off takes 2.2 s
because XP's did (opacity of a `backdrop-filter` layer); the boot chunks loop only while the boot
screen is up. `prefers-reduced-motion` is honoured via `MotionConfig reducedMotion="user"` in
`app/page.tsx`, by `luna.css` media queries for the CSS animations, and by `captionZoom.ts`.

---

## 4a. Resolved facts (do not re-litigate)

Answered by the owner on 2026-08-20. These are settled; treat contradicting sources as stale.

### Employment

| | |
| --- | --- |
| **Current role** | **Software Developer, CaratSense AI LLP — from 1 May 2026.** No end date. |
| CaratSense details | Responsibilities, stack and location are **not supplied**. `content/experience.ts` carries empty `highlights`/`stack` and a `needs-confirmation` location. The UI renders "details pending". **Do not invent any.** |
| VXO Digital | **Kept verbatim at the owner's instruction**, pending his own correction. Its title/period conflict (About said "Software Engineer · Aug 2025", resume says "Software Developer Trainee Intern · July 2025") is preserved and flagged, not reconciled. Only `current` was changed to `false`, because CaratSense is now the current role. |
| Known inconsistency | VXO's period still reads "July 2025 — present", which conflicts with CaratSense starting May 2026. **No end date has been invented.** Awaiting the owner. |

### Resume

The real PDF exists and now ships. Located at `~/Downloads/Kumar_Gaurav_Resume.pdf` (PDF author
"Gaurav Tiwary"; verified against the repo's email/GitHub/LinkedIn), copied to
**`public/resume/kumar-gaurav-resume.pdf`** on 2026-08-20. The path lives in `content/profile.ts`
-> `RESUME` and nowhere else. It was generated **February 2026** and therefore predates the
CaratSense role — `ResumeApp` states this rather than implying the PDF is current, and offers the
live-generated document alongside it.

### Confidential projects

`bypass-lane-graph` (HERE) and `enterprise-modules` (VXO) are **employer-confidential**. They are
presented, not hidden, using the disclosure-safe pattern: problem, approach, contribution,
technologies, plus an explicit statement of why no source is available. Never expose source
links, repository names, internal datasets, proprietary architecture, or invented business
impact for these.

---

## 5. Current state (honest)

### Works

Boot/login/shutdown flow - window open/close/min/max/restore/drag/resize - taskbar + tray
popovers (volume, network, calendar) - start menu incl. All Programs flyout - desktop icon drag
with persisted positions - context menus - recycle bin (delete/restore/empty, persisted) -
Minesweeper (winmine's levels, Custom, chording) - Solitaire (Klondike, Draw One/Three, Vegas) -
Calculator (Standard and Scientific, radix and word size) - Paint (sixteen tools, saves into My
Pictures) - Notepad (edit, word-wrap, save-as-download, insert date) - Image viewer - Display
Properties (wallpaper switch, icon reset) - Media player (real playback, real playlist,
visualisations driven by the audio).

### Fixed in the P1 honesty pass (2026-08-20)

| Was | Now |
| --- | --- |
| Resume download 404'd | Real PDF ships at `public/resume/`; `ResumeApp` verifies it with a HEAD request and falls back to a live-generated document if it ever goes missing |
| Contact form faked "Sent!" | `mailto:` hand-off with validation, copy-to-clipboard fallback, and wording that never claims delivery |
| Boot said "Press any key" with no key handler | Real `keydown` listener |
| Boot printed "Copyright (c) Microsoft Corporation" | Owner's own attribution plus an explicit non-affiliation line. The XP wordmark, logo bitmaps, startup sound and playlist all stay — see §8 |
| Login Restart / Log Off were dead | Restart reloads; Turn Off triggers real shutdown |
| ~25 dead controls | Removed or made real — see the list below |
| Invented skill percentages | Evidence model: every skill names the roles/projects that demonstrate it, and clicking one opens that work |
| About contradicted the resume | Both read `content/`; contradiction is now structurally impossible |
| Projects had dead demo/source links | Links only render when the URL is real; otherwise the reason is stated |
| Fake network readout (`867 Mbps`, `SSID: Gaurav-Home`) | Real `navigator.onLine` + Network Information API, "unavailable" where the browser does not expose it |
| Fake drive capacities (`18 GB free of 40 GB`) | Volumes report real counts from `content/` |
| `themeColor` dead state | Removed from the store; the Themes tab says plainly that theming is not built yet, and will return once the XP palette lives in tokens |
| Media player desynced from reality | `isPlaying` now driven by the audio element's own `play`/`pause` events, the taskbar volume and mute actually apply, and load/blocked-playback failures are reported |
| Unbounded z-index (windows drew over the taskbar after ~40 focuses) | z-order renormalised to a compact band on every focus |
| Restore un-maximised a minimised window | `restoreWindow` / `unmaximizeWindow` split; minimise-restore is lossless |
| Windows draggable off-screen (persisted) | Clamped so a grabbable strip always remains |
| 4 px gap under maximised windows | Maximise height matches the taskbar (`--xp-taskbar-h`) |
| `window` prop shadowed the global in `Window.tsx` | Renamed to `win` |
| `npm run lint` prompted interactively | `.eslintrc.json`; 0 errors |
| `ps` pids ran into the STATE column (`l9zk988fnrunning`), so `kill` was unusable | Readable `w1`, `w2`… pids and measured column widths |

**Dead controls removed:** ExplorerLayout Back/Forward/Search/Folders/Go + editable address ·
MyComputer Back/Forward/Up/Refresh/Search/Folders/Go · Settings OK/Cancel/Apply · Settings
Screen Saver dropdown · Resume "Find…" box and "1 / 1" page counter · MyComputer sidebar links
that fired `alert('Not implemented')`.

### Fixed in the P1 follow-up pass (2026-09-03)

An eight-dimension adversarial review of the committed P1 work confirmed 30 defects. All are
fixed and verified — headless for the shell, a real browser for the UI. Full table in
`docs/AUDIT.md`. The load-bearing ones: minimising a window no longer unmounts (and destroys) its
app; windows finally open at their registry size; the media player plays a playlist through;
`history`, `constructor`, Tab completion and `tree /` behave; `/etc/system.conf` is generated from
the same list the persist middleware uses; clamped drags actually render; and dropping a desktop
icon on the Recycle Bin deletes it, which is what the bin already claimed.

### Still broken / not built

| Item | Detail |
| --- | --- |
| Media licensing | The playlist and XP assets ship by the owner's decision — see §9. Repo is ~53 MB as a result. Not a bug; do not "fix" it. |
| `deletedAppIds` | Still persisted by design (A10). Recoverable from the Recycle Bin, or all at once with Display Properties > Desktop > Restore Deleted Icons. |
| Legacy `.ico` | The chrome now loads only `public/icons/xp/` (~430 KB for the set). A few app bodies (My Computer among them) still reference the old `.ico` files; point them at `icons/xp/` and the `.ico` files can go. |
| Deployment URL | `NEXT_PUBLIC_SITE_URL` must be set at build time for the Open Graph card to resolve. Nothing is hardcoded, because there is no deployment yet. |
| Not implemented | Keyboard window switching (Alt+Tab is the host OS's; window focus is pointer-driven — desktop icons do take arrows, Enter, Delete and Ctrl+A, and message boxes and the exit dialogs trap focus). Start menu keyboard navigation. XP's animated cursors. A phone-width tablet tier and non-tap gestures (long-press) are the remaining mobile gap — see `docs/ROADMAP.md` §9. Files: no rubber-band selection in Explorer (Ctrl, Shift and Ctrl+A select several), no dragging between windows or onto the desktop (within Explorer, dragging onto a folder or the Folders tree works). |

---

## 6. Direction

### Chosen

**Keep the XP desktop; make everything under it real.** Phased, incremental, never leaving the
tree unrunnable.

- **P0 Foundation** *(done)* — `content/` single source of truth; `system/vfs.ts`; headless
  `system/shell.ts`; Command Prompt rebuilt on top of them; ESLint restored.
- **P1 Honesty pass** *(done, except the git-history question — see §9)* — About / Skills /
  Projects / Resume migrated to `content/`; ~25 dead controls removed; real resume PDF; working
  contact; fabricated skill percentages and fake system readouts replaced with real data;
  window-manager defects fixed.
- **P2 Functionality depth** — see **`docs/ROADMAP.md`**: registry unification (also enables code
  splitting), command palette, event bus, System Monitor, filesystem explorer, project artifacts,
  architecture viewer, workspaces, mobile shell.
- **P3 Consolidation** — move the existing XP colour values into tokens *without changing them*,
  then reinstate the Display Properties Themes tab as a real control (Blue / Olive Green /
  Silver).
- **P4 Reach** — accessibility pass, performance pass (code splitting, icon assets), SEO/OG.

### Rejected

- **Re-skinning away from Windows XP, or renaming the environment.** Tried and reversed on the
  owner's instruction. The XP look, the XP app names, the XP startup sound and the media-player
  playlist are the identity. See §8, 2026-08-20.
- Replacing the Bliss wallpaper with something non-XP.
- Rebuilding the entire app from scratch — the window manager and the toy apps are genuinely fine.
- Removing the window metaphor for a tiled/spatial UI — throws away working, familiar structure.
- AI chatbot assistant — a trend, not an expression of this owner's work.
- Fabricated metrics/dashboards ("99.9 % uptime") — dishonest and instantly detectable.

### Open questions for the owner

1. **VXO Digital** — the entry is preserved verbatim by instruction, but its period still says
   "present" while CaratSense started May 2026. Needs the owner's correction (§4a).
2. **CaratSense AI LLP** — no responsibilities, stack or location supplied. The UI shows "details
   pending" until they are.
3. **Git history rewrite** — proposed in §9, awaiting approval before execution.
4. **Bliss wallpaper** — needs an owned replacement before this is deployed publicly.
5. **Phone number** — `PROFILE.phone` is rendered publicly in the resume. Keep or remove?

---

## 7. Development rules

1. **Never fabricate facts.** No invented companies, metrics, clients, awards, or results. If a
   value is unknown, model it as unknown and render it as unknown.
2. **Single source of truth.** Portfolio facts live in `content/`. App metadata lives in
   `constants/apps.ts`. Never duplicate a title, icon path, or URL into a component.
3. **A button that does nothing must not exist.** Either implement it, disable it visibly with a
   reason, or delete it.
4. **Keep the tree runnable.** Every commit must `npm run build` clean, and `npm test` must pass
   (`npm run test:unit`, then `npm run test:e2e` against a production build).
5. **Type safety.** No new `any`. Prefer discriminated unions over optional-field soup.
6. **`system/` and `content/` stay headless** — no React, no DOM, no styling. This is what makes
   the shell testable and the architecture explainable.
7. **Zustand: subscribe with selectors.** `useSystemStore(s => s.windows)`, never bare
   `useSystemStore()` in new code — the bare form re-renders on every unrelated state change.
8. **Transform/opacity only** for animation. No layout-animating loops. Nothing runs forever.
9. **Use the existing asset system.** Do not replace custom `.ico` / `.png` icons with lucide
   glyphs. Lucide is for controls and UI affordances, not for identity.
10. **No new dependencies** without recording why in §8.
11. **Test interaction-heavy components in the browser** after changing them: drag, resize,
    maximize, minimize, restore, close, taskbar round-trip, keyboard. If a bug was found by hand,
    add the Playwright test that would have caught it to `tests/e2e/`.
12. **Do not report a feature as complete because its UI exists.**

---

## 9. Media licensing — known and accepted

**Status: the owner has chosen to keep the media.** This section exists so nobody re-opens it as
if it were an oversight.

`public/sounds/` ships eight commercial tracks (seven Eminem, one Mohit Chauhan) plus the Windows
XP `startup.mp3`, together about 51 MB — roughly 97% of the repository. They are also in git
history (commits `00a3efd` and `b4c6562`), so `.git` is ~53 MB and every clone pulls them.

**The risk, stated once:** these are not the owner's to redistribute, and a public portfolio
serving them is a takedown risk and a slow first load. `public/icons/windows-xp-logo-*.png`,
`windows.png` and the Bliss wallpaper are Microsoft assets under the same heading.

**The decision:** keep them. They are part of what makes the desktop feel like Windows XP, which
is the point of the project. Do not remove them again without the owner asking.

**If the owner ever changes their mind**, the cleanup is: delete from the working tree, then
`git filter-repo --invert-paths --path-glob 'public/sounds/*.mp3' ...` on a fresh mirror clone,
then force-push. Single-author repo, one branch, no forks, so the risk is low — but every commit
SHA after the first affected commit changes, and any existing clone must be re-cloned.

**Mitigation available without touching the media:** the media player currently sets
`<audio src>` eagerly for the selected track only, so the other tracks are not fetched until
selected. That is already the cheap win; nothing else is needed unless the files go.

---

## 8. Decision log

Append newest first. Format: date - decision - why - alternatives - consequences.

### 2026-09-24 - Pipes, and the text tools that make them useful

A shell over a real filesystem without `|` is the first thing an engineer notices is missing. An
unquoted `|` now splits a command line (with or without spaces); each command's text output — what
`>` would write — is the next one's input, and errors from any stage still show, as stderr does. A
pipeline runs as a subshell does in bash: `cd` inside one changes nothing, and only the last command
may be redirected. `grep` filters what is piped in (`-v`, `-c`; still a plain, case-insensitive text
match, not a regular expression), `cat` passes it through, and new `head`, `tail`, `wc`, `sort` and
`uniq` read either a file or the pipe; `find [folder] -name / -iname / -type` walks the tree with
shell patterns. Tab completes a command name after a `|`. Commands receive `stdin` as a third
argument, so a new filter is still one entry in the command table.

### 2026-09-24 - Several at once: multiple selection in Explorer

XP's selection rules: a click selects one, Ctrl+click adds or removes one, Shift+click takes the range
from the last plain click, Ctrl+A takes everything. An action on an item that is part of the selection
applies to all of it — Delete ("Confirm Multiple File Delete", "these 3 items"), Cut, Copy, drag, and
Properties, which sums them ("2 Files", "All of type Text Document", "All in My Documents", one size)
— while Rename and Open act on the item itself. Right-clicking inside the selection keeps it. The
clipboard and a drag carry a list of paths, and Paste and a drop go through one `transferInto` in
`utils/fs.ts`, which stops at the first refusal and says why. A press no longer selects on focus, so
Ctrl+click is not undone by the focus that comes before it; keyboard focus (Tab) still selects.

### 2026-09-24 - Fixes from the review of 05d1226..0eae3c1

Thirteen findings. The serious one: New Folder and New Text Document in a folder deeper than ~220
characters froze the tab — `nextFreeName` counted "path too long" as "name taken", so every
numbered name was taken and the loop never ended. A name is now taken only when something is
there, the loop is bounded, and the create reports the real reason. Also: search results were a
frozen snapshot (a deleted result stayed listed and every action on it failed) — they are kept as
paths and re-read on every change; restoring a file from a deleted folder before the folder
itself stranded the folder's other files, because restore refused an existing folder — it now
merges into it, as XP did, and still refuses a file in the way; a "/" typed into a rename moved the
item into another folder — names go through `validateName`; My Documents' Properties said
"Read-only, part of the portfolio"; a folder's size counted unknown pictures as zero; sizes counted
UTF-16 characters, not bytes, and an empty file said 1 KB; moves skipped the storage quota; a
hand-edited bin entry could restore text as a "picture" or smuggle in extra files; `cp` kept the
source's type while `mv` took the new name's; `rm -rf` read `-rf` as a file name; `mkdir -p` over a
file said "does not exist"; Properties and `cp` on `/proc` did nothing or said "Cannot find". One
finding — Delete and Enter leaking from a window to a selected desktop icon when that window was
already active — is in Desktop.tsx and went to the chrome session.

### 2026-09-24 - Explorer's Folders pane

XP's Folders button swapped the task pane for the folder tree; here it does the same. The tree shows
folders only, with XP's [+] / [-] boxes, opens down to wherever Explorer is (the address bar, Back,
a double-click, a search result) with that folder selected, re-lists when the visitor makes or
renames one, and takes drops like a folder in the file list. Search and Folders take turns, as they
did in XP. The root is "Local Disk (C:)", which is what My Computer already calls `/`.

### 2026-09-24 - The architecture viewer is XP's System Information (msinfo32)

**Why:** ROADMAP §7 asked for a rendered graph of this application's own modules, generated from
the repository so it cannot rot — the piece that lets an engineer see how the desktop is built
without cloning it. XP already had the window for "what is loaded on this machine": System
Information, with Software Environment > Loaded Modules. Inventing an "Architecture" program would
have broken the identity rule.
**Design:** `scripts/gen-architecture.mjs` (Node's fs and regular expressions, no dependency) reads
every module under app/, components/, constants/, content/, store/, system/ and utils/: its layer,
lines, imports (type-only and lazy ones marked), npm packages, and the first paragraph of its own doc
comment. It checks CLAUDE.md's dependency rule against every import. It runs on `postinstall`,
`predev`, `prebuild` and `pretest:unit`, and its output (`system/architecture.generated.ts`) is
gitignored — generated, never committed, so it describes exactly the code being built. The VFS
declares the shape and exposes `mountSource`; `system/source.ts` loads the data and mounts it at
`/usr/src`, and only the lazily loaded Command Prompt, Explorer and System Information import it, so
the graph (~6 KB gzipped) stays out of the first page load. `/usr/src/<path>` is one file per
module (what it imports and what imports it); double-clicking one opens System Information on it.
**The window:** System Summary and Components show only what the browser reports (screen, pointer,
processors, heap, storage), and say "Not reported by this browser" otherwise; Running Tasks is the
process table; Loaded Modules is the graph with linked imports and importers; Packages lists npm
packages by use; Dependency Rule shows the check. msinfo32's Find bar narrows any list. My
Computer's "View system information" opens it — it used to open Display Properties.
**Enforced, not just shown:** `tests/unit/architecture.test.cjs` fails if content/ or system/ ever
imports components/, app/, the store or React.

### 2026-09-24 - Five apps rebuilt as their XP originals: Paint, Solitaire, Minesweeper, Calculator, Media Player

**Why:** the toy apps are what most visitors actually touch, and each fell short of the rule that the
surface is XP and the substance is real. Paint was an `<iframe>` of jspaint.app — not the owner's
work, blockable by the host, and an empty grey box in every headless run. Minesweeper drew emoji,
had one level and no chording. Calculator had no Scientific view. The media player's picture was
decoration. There was no Solitaire, the single most recognisable XP program.
**What each is now:**
- **Paint** (`components/apps/paint/`): all sixteen tools with their option box, the 28-colour box and
  Edit Colors (XP's 48 basic colours and 0–240 Hue/Sat/Lum), undo/repeat, Flip/Rotate, Stretch/Skew,
  Invert, Attributes, the text tool and its Fonts toolbar, View Bitmap, Print. Open / Save / Save As
  go through `FileDialog` into My Pictures (PNG or JPEG) and the title reads "name - Paint"; a close
  guard asks "Save changes to name?"; Set As Background (Tiled / Centered) points the wallpaper at the
  saved file; Open from Computer / Save to Computer read and write real files, including a hand-written
  24-bit BMP encoder. `payload.path` opens a picture handed over by the shell or another window.
- **Solitaire** (`components/apps/solitaire/`): Klondike as sol.exe played it — Draw One/Three,
  Standard/Vegas/None scoring with the time bonus, Deck and Options dialogs, double-click and
  right-click auto-play, undo, and the bouncing-card cascade on a win. Card art is original.
- **Minesweeper** (`components/apps/minesweeper/`): winmine's levels and Custom Field, LED counters,
  the four faces, Marks, Color, Sound, chording (middle button, both buttons, Shift), session best
  times, and a window resized to hug its field. Pixel art is original SVG.
- **Calculator** (`components/apps/calculator/`): Standard and Scientific views, radix and word size
  with exact BigInt integer maths, Inv/Hyp, precedence and parentheses, the Statistics Box, paste as
  keystrokes, and a window that fits each view. The display carries `data-calc-display`.
- **Windows Media Player**: WMP 9's Now Playing view over the unchanged playlist (§9).
**A real decision point (Paint):** the pixel engine (`paint/raster.ts`) writes whole pixels rather than
drawing canvas 2D paths. Canvas paths are anti-aliased, and a flood fill stops at the half-tone fringe
they leave, so Fill With Color would never have met a line. Text is rasterised through a canvas and
thresholded for the same reason. It is also what XP's Paint did. The document engine is a class React
reads through two `useSyncExternalStore` snapshots (UI state, pointer), so pointer-rate drawing never
re-renders the window.
**A real decision point (Media Player):** the visualisations are driven by a Web Audio `AnalyserNode`
on the playing track, not animated for effect. Volume and mute are a gain node *after* the analyser,
so the picture shows the music with the sound down, as WMP's did, and the loop stops once playback
stops and the bars settle — asserted by counting animation-frame requests in e2e.
**Shared primitives:** `components/ui/MenuBar.tsx` (portaled dropdowns that overhang the window, the
dismissing click swallowed inside its own window, access-key underlines only in keyboard use, status
hints), `AppDialog.tsx` (an in-window modal that hands focus back on close — the Ctrl+Z-after-a-dialog
bug the browser pass found), `xp-controls.tsx`. They emit only `app/luna.css` classes, so an app's
dialog cannot drift from a system one. Do not hand-roll another menu.
**Honest limits:** menus list only shortcuts a browser tab can receive (Ctrl+N, Ctrl+T, Ctrl+W,
Ctrl+Shift+N and Ctrl+PgUp/PgDn belong to the browser). Paint's undo is a memory budget rather than
XP's three levels, pictures are capped at 2000 x 2000 (larger files are scaled and the visitor told),
and My Pictures holds PNG and JPEG only. Solitaire and Minesweeper settings and best times last the
page's lifetime and are not persisted. Calculator's decimal maths is IEEE-754 doubles rounded to 16
significant digits where XP's was arbitrary-precision to 32; its Help says so. Qword's F12 is not
advertised, because browsers keep F12 for their developer tools.
**Consequences:** the pure engines (Paint's raster, history, palette and tools; Solitaire; Minesweeper;
Calculator) are unit-tested in `tests/unit/`, whose base tsconfig stays DOM-free as the check that
they, `system/` and `content/` are headless. Paint's document engine and codec need DOM types
(`ImageData`, canvas), so they compile under a second `tsconfig.engines.json`. Each app has an e2e
spec, each assertion mutation-checked to fail with its fix reverted. The window-manager size test
moved from Calculator to Notepad, since Calculator and Minesweeper now size themselves as XP's did.

### 2026-09-24 - Drag and drop onto a folder in Explorer

XP's rule, which people relied on without knowing it: dragging within a drive moved, dragging from
somewhere read-only (a CD) copied, and Ctrl forced a copy. Here the visitor's own files and folders
move, the portfolio's are copied, and Ctrl copies either — through the same `planMove` /
`planCopy` as the menus and the shell, so a drop refuses exactly what Paste would, with the same
words. A folder of the portfolio takes nothing, and says so. The drag carries the path as
`text/plain` too, so a file dropped into a text box types its path, as XP's did. The Open / Save
As dialog now draws XP's icons from `constants/fileIcons.ts`, like Explorer.

### 2026-09-24 - Explorer's Search Companion

**Why:** the fastest way for anyone — a recruiter looking for "Python", an engineer for a file —
to find something in the portfolio is to search it, and XP's Explorer had a Search button for
exactly that. The shell's `grep` could, but a visitor who never opens the Command Prompt could not.
**What:** the toolbar's Search opens XP's Search Companion in place of the task pane: part of the
name (with XP's `*` and `?`), a word or phrase in the file, and Look in. It runs the pure
`findFiles` over the real tree, so it finds the portfolio by what its files say and the visitor's
own files by theirs, capped at 200 with a note when there were more. Results show in Details with
XP's In Folder column, and open, rename, copy and delete like any other item — which is why
Explorer's selection is now keyed by path, not name: two results can share a name. Opening a
folder, Back or Forward closes the search, as they did in XP. No dog.

### 2026-09-24 - Explorer's right-click menus, Cut / Copy / Paste, views and Properties

**Why:** Explorer could browse, rename and delete, but a visitor who right-clicked got nothing, there
was no way to copy a portfolio file into their own folder from the GUI, and every folder was one
fixed grid. XP's Explorer is mostly its menus.
**What:** an item's menu (Open, Cut, Copy, Delete, Rename, Properties) and the folder's (View,
Arrange Icons By, Paste, New ▸ Folder / Text Document, Properties), through the chrome's
`ContextMenu`. Ctrl+X / C / V, Alt+Enter, Backspace for Up. The clipboard lives in `utils/fs.ts`
for the session, across windows, and a cut item is drawn faded until it is pasted. Paste copies as
"Copy of x" when the name is taken, through the same pure `planCopy` as `cp`; Cut is refused for
the portfolio with the reason. Tiles (XP's default), Icons, List and Details views, from the menu
or the toolbar's Views button — Details with XP's Name / Size / Type / Date Modified columns, whose
headers sort. `components/os/PropertiesDialog.tsx` is XP's General tab, and measures everything it
shows: a picture's decoded bytes, a folder's contents added up; a built-in picture's size is a file
the page never downloaded, and it says so rather than guess.

### 2026-09-24 - Deleted files go to the Recycle Bin; XP's task pane on My Computer, the bin and Explorer

**Why:** XP's Delete never destroyed a file: it went to the Recycle Bin, which could put it back
where it came from; Shift+Delete was the way to skip it. Here a deleted file was gone at once, and
the bin only ever held desktop icons.
**Design:** a bin entry is now either a desktop icon or a `RecycledTree` — the file, or the folder
with everything that was in it, keyed by the paths they had. Taking and restoring are pure VFS
functions (`planRecycle`, `planRestore`). A restore makes again any folder on the way that has gone
since, as XP did, and refuses — naming what is in the way — rather than overwrite anything. What
the bin holds counts toward the same storage quota, and `df` says how much of it is the bin.
Explorer and the picture viewer delete to the bin; Shift+Delete and the shell's `rm` do not (`del`
never did). Display Properties' Restore Deleted Icons still brings back only icons.
**Also:** My Computer, the Recycle Bin and Explorer drew their own blue task panes with lucide
glyphs. They now use the `.xp-taskpane` / `.xp-addressbar` / `.xp-toolbar` classes through
`components/ui/TaskPane.tsx`, and XP's own icons: `constants/fileIcons.ts` is the one place a file,
folder or drive gets its icon. My Computer selects on a click and opens on a double-click (a tap on
a phone), as XP did. The bin selects a row and restores from the task pane; its per-row Restore
buttons are gone. The store's window and icon clamps read the live taskbar height. The shell's `cp`
gained `-r` and now goes through the pure `planCopy` (a visitor's folder with its contents, or a
portfolio text file; never overwriting), with `copyUserPath` in the store. The e2e `win()` helper
matches the title bar only.

### 2026-09-24 - Folders: New Folder, Rename, and a shell that can move things

**Why:** /home/guest had a fixed layout, so a visitor who saved three files had nowhere to put a
fourth but beside them, and nothing could be renamed. Explorer's File and Folder Tasks — Make a new
folder, Rename, Delete — and F2 are among the most-used things in XP.
**Design:** folders are a list of paths in the store (`userFolders`), not a second shape inside
`userFiles`, so every existing file reader was untouched. An empty folder still exists, as it must.
`validateUserPath` learned that a folder the visitor made is writable, which is all Notepad and
Paint needed to save into one. Rename, move and folder delete are pure (`planMove`,
`planRemoveFolder`) so the store, the shell's stub in the unit tests and any future caller get the
same answers; a move takes everything inside, refuses to overwrite, and cannot put a folder inside
itself. XP's words throughout: "New Folder (2)", "If you change a file name extension, the file may
become unusable", "Are you sure you want to remove the folder ... and all its contents?".
**Consequences:** the shell gained `mkdir [-p]`, `rmdir`, `mv`, `cp` and `rm -r`; Save As and Open
gained Create New Folder; a picture wallpaper follows its file when the file moves. `useFsRevision`
now tracks folders as well as files. `cp` refuses a built-in picture rather than store a stub,
since localStorage cannot hold a copy of a file on the site.
**Not done:** drag-and-drop between folders; copying a folder; deleted files skip the Recycle Bin.

### 2026-09-24 - The XP fidelity pass: Luna drawn properly, high-res icons, XP's own behaviours

**Why:** the owner asked for the desktop to be "exactly like" Windows XP — the feel, high-resolution
icons, and XP's specialities. The chrome was a skin of approximations: a four-stop taskbar, lucide
glyphs in the caption buttons, italic active task buttons, an All Programs flyout that rendered as an
empty box, 48 px icons blurred on 2x screens, several apps showing another app's icon (Calculator and
the picture viewer had the Display icon, Command Prompt a gear window), and a web-toy blip on every
window open and close.
**Decisions:**
- **`app/luna.css` is the XP visual style**, imported before `globals.css` so a Tailwind utility can
  still override it. `--luna-*` scheme tokens keep their names and `[data-theme]` selectors; Blue now
  carries the multi-stop gradients of the Luna bitmaps (title bar, taskbar, tray, Start menu), and
  Olive/Silver were refined for contrast (Silver takes dark caption text). `.xp-*` classes — window
  frame, caption buttons, menus, buttons, inputs, checkboxes, tabs, group boxes, progress, trackbars,
  scrollbars, task panes, tooltips, balloons — are one contract for system chrome and app bodies;
  the in-app MenuBar, AppDialog and xp-controls in components/ui are built on it.
- **The taskbar is Luna's 30 px** (phones keep 36 so task buttons stay tappable).
  `TASKBAR_HEIGHT` / `taskbarHeight()` in `utils/viewport.ts` and `--xp-taskbar-h` are the two halves
  of one number.
- **Icons live in `public/icons/xp/`** (see `public/CLAUDE.md`). The existing XP artwork was
  re-exported from its `.ico` 256 px frames (128 px master + the file's own hand-tuned 32 px frame);
  the missing ones — Recycle Bin empty and full, Command Prompt, Notepad, Calculator, Solitaire, Task
  Manager, Event Viewer, Picture Viewer, the Turn Off / Log Off buttons, Show Desktop, Connect To and
  the tray glyphs — were drawn as SVG in XP's style. ~430 KB for the set, against ~3 MB of `.ico`.
  `XpIcon` picks the right file by display size.
- **The boot gate is gone.** It existed only because the startup sound played at the end of boot and
  browsers refuse audio before a gesture. XP played that sound when the desktop appeared after
  logging on, so it moved there, and the click on the account is the gesture.
- **XP's default sound scheme**: session sounds, message-box Ding / Exclamation / Critical Stop, the
  Recycle Bin, Explorer's navigation click — and silence for opening, closing and minimising windows,
  as XP was. Synthesised; `startup.mp3` stays the only recording. Legacy sound names still work.
- **XP's behaviours, not just its colours:** the system menu (right-click a title bar or a task
  button, or click the title-bar icon; double-click the icon closes); resizing from every edge;
  the caption ghost that flies to the taskbar on minimise; Show Desktop toggles back; rubber-band
  multi-select, Ctrl+click, Ctrl+A and arrow keys on the desktop; Arrange Icons By Name / Type and
  Show Desktop Icons; Refresh redraws instead of reloading the page (it used to reboot the OS);
  the Recycle Bin shows its full artwork and its menu can empty it; Log Off and Turn Off open XP's
  dialogs over a screen that drains to grey; Stand By darkens until input; Switch User keeps the
  session behind the Welcome screen, which says "N programs running"; Log Off shows "Saving your
  settings..."; Turn Off ends powered off, with one button that restarts; XP's yellow tooltips
  replace native ones on the chrome (`data-tip`); message boxes centre their buttons and ding and
  flash when clicked beside; Run opens bottom-left, where XP opened it. Shortcuts show the program's
  name ("Notepad"), while its window keeps the document title ("Untitled - Notepad").
**Alternatives rejected:** downloading high-resolution XP icon packs or more XP sound files (their
provenance is unknown, and they would widen the licensing exposure §9 accepted for a fixed list of
files); a library such as XP.css (a new dependency that styles bare elements globally, restyling
every app body at once); stripping native `title` attributes page-wide to replace their tooltips
(it would mutate attributes other components and the tests select on).
**Motion, stated:** the grey fade behind Turn Off takes 2.2 s because XP's did; it animates opacity
of a `backdrop-filter` layer only. The caption ghost is 220 ms of transform. The boot chunks loop
only while the boot screen is up. Windows appear and close instantly, as XP's did — the old
scale-in is gone. `prefers-reduced-motion` skips all of it.
**Consequences:** `components/os/` gained `ExitWindows`, `SessionScreens`, `Tooltips`,
`captionZoom` and `power`; `ContextMenu` became a portaled XP menu with bold default items,
shortcut text and cascading submenus. `page.tsx` owns the powered-off state. Log Off, Turn Off and Restart call `requestEndSession()` first, so unsaved work is asked about before the session ends.

### 2026-09-24 - Fixes from the review of e7c7906

Sixteen findings across files, the shell and the viewers. The one that lost data: two tabs of the site
each wrote their own copy of the store, so a file saved in one tab was gone after the other tab did
anything at all; the store now re-reads storage when another tab writes it. A save the browser refused
to keep is rolled back and reported rather than shown as saved, and that refusal is logged once, not
on every click. `requestEndSession` asks each window with unsaved work in turn, for Log Off and Turn
Off to call (Log Off, Turn Off and Restart now call it before ending the session), and a logoff
clears any prompt left open. `touch` no longer turned a picture
into text, and a `.png` name only takes a picture. Delete and Enter pressed in Explorer, the picture viewer or a file
dialog no longer reach the desktop and offer to recycle a desktop icon. Explorer's history was
doubled when opened on a path. The viewer walked up out of an emptied folder.

### 2026-09-24 - Picture wallpapers point at files

**Why:** XP's Display Properties > Desktop had Browse... and Center / Tile / Stretch, and Paint had
Set As Background. Both need a wallpaper that is a picture file.
**Design:** `wallpaperFile: { path, position }` in the store, never a copy of the image — the file
already lives in `userFiles` (or is a Sample Picture), and a second copy would spend the same
localStorage quota twice. `utils/wallpaper.ts` is the one place a background becomes CSS, used by the
desktop and every Settings preview. Deleting the picture drops the wallpaper back to the built-in
choice (logged); a file that vanished some other way falls back at draw time rather than drawing a
broken image. Choosing a built-in background clears the picture, as in XP.

### 2026-09-24 - A writable /home/guest, and Notepad saves real files

**Why:** every file on the desktop was read-only, so Notepad's Save was a download and Open said "not
available", the picture viewer cycled a hardcoded list of four images, and nothing a visitor made
could be found again. The shell prompt has always said `guest@portfolio`; guest now has a home.
**Design:** files live in the store (persisted, validated on hydration, capped), and the store pushes
them into the headless VFS rather than the VFS importing the store. One validator for every writer.
XP's own layout — My Documents, My Pictures, Sample Pictures — and XP's own words for the
"save the changes?" and "already exists" prompts. Built-in files stay read-only; Notepad opens them
and says so, and Save becomes Save As.
**Consequences:** the shell gained `>`/`>>` redirection (a quoted `">"` is text), `touch`, `rm` and
`df`; Tab completion quotes names with spaces. Notepad registers a close guard with the store, so
the title-bar X and Alt+F4 ask about unsaved work (`kill` and End Task bypass it, as ending a
process did in XP). The picture viewer shows the pictures in a real folder. First-load JS grew by
~4 kB because the store now imports the VFS to validate and mount files. A full or blocked
localStorage no longer throws out of `set()`: the write is reported in the Event Viewer instead.
**Not done:** no rename, no mkdir, no drag-and-drop between folders; Paint's Save / Set As Background
over these files is portfolio-ce's.

### 2026-09-24 - Fixes from the adversarial review of 12f97f7

Thirty-three confirmed findings, about twenty distinct. The ones that mattered: waking the screen
saver with a key never reset the idle clock (the key was stopped before the bubble-phase idle
listener saw it), so it returned within five seconds; the click or tap that woke it went on to act on
whatever was underneath; input inside Paint's iframe or the PDF was invisible to the idle timer.
`on()` re-delivered an event to a handler that published. The log recorded a logoff for a session
that never logged on, missed Show the Desktop and Cascade, and said nothing when Restore Deleted
Icons brought back an icon the bin had already emptied. `exit` was logged as a kill. Four e2e tests
could not fail with their fix reverted (z-order, the kill row, the Run error, the phone taskbar
width); they now can. Display Properties' "preview before applying" claim was untrue and is gone.
Findings in the chrome (caption buttons and task panes under Olive/Silver, caption contrast) went to
the session that owns those files.

### 2026-09-23 - The verification harness moves into the repo as a test suite

**Why:** twice, the scratchpad probe and Playwright harness were deleted by the OS cleaning its temp
folder, and every session rebuilt them from memory. They were the only thing standing between a
change and a regression like "minimising unmounts the app", and "tests" was listed under Not
implemented. **New dependency (rule 10):** `@playwright/test` as a devDependency. It ships no code
to visitors; the alternative — a hand-rolled driver on the `playwright` library — is the same
dependency with less tooling. The unit tests use Node's built-in `node:test` and the project's own
`tsc`, so they add nothing.
**Consequences:** `npm run test:unit` compiles `content/` + `system/` + `store/persistence.ts` to
`.test-out/` and runs them headless; `npm run test:e2e` drives a production build on port 3111
(desktop and iPhone-13 projects). `tests/` is excluded from the app's `tsconfig`, so test code
never affects `next build`. Assertions on colours check that tokens *apply*, not specific gradient
stops, because the Blue values are being refined towards the real Luna bitmaps.

### 2026-09-23 - A system event bus, and the Event Viewer as its first consumer

**Why:** interop was one-directional (a caller passes a payload), and nothing let a visitor *see*
the parts of the desktop talking. XP already shipped the right window for it: Event Viewer, with
Application / Security / System logs. Naming it anything else would have been inventing a program.
**Rules it enforces:** every entry was published by code that really did the thing; nothing is
seeded to make the log look busy; the log is bounded (500) and in memory only. `closeWindow` takes
an optional `by` so a close from `kill` or End Task is logged as such.
**Consequences:** `system/bus.ts` (headless), `EventViewerApp`, and an `events` shell command over
the same log. Store actions publish after `set()` — never inside an updater, which must stay pure.

### 2026-09-23 - Luna colour tokens, real Themes / Screen Saver / Appearance tabs

**Why:** three Display Properties tabs said "not built yet" because the chrome colours were
hardcoded inline in forty places. The P3 plan was always to move them into tokens *without
changing them*, then make the Themes tab real.
**Consequences:** `--luna-*` variables in `globals.css`, Blue first with the values the components
used, Olive Green and Silver as approximations (stated as such in the CSS and in the Appearance tab).
Themes offers XP's own "Windows XP" theme and shows "Modified Theme" only while that is true;
Appearance holds the colour scheme, as it did in XP. The screen saver is a real idle timer with a
real wait setting. `themeId` and `screenSaver` are persisted and validated on hydration. The
Desktop tab gained Restore Deleted Icons, which finally signposts A10.
**Known limit:** another session is refining the Blue values towards the real Luna bitmaps; the
token *names* and the `data-theme` mechanism are the stable contract.

### 2026-09-03 - Windows Explorer, and folders navigate rather than launch

**Why:** the shell had proven the filesystem was real, but a non-technical visitor will never type
`ls`. Explorer over `system/vfs.ts` is the bridge — the same tree, the same live `/proc`.
**A real decision point:** several directories (`~`, `~/projects`, a specific project) carry an
`open` launch hint for the shell's `open <path>` command and the Run dialog. The first draft of
Explorer honoured that hint on directories too, so double-clicking a project folder launched the
Projects window instead of browsing into it — which meant a visitor could never see the individual
files (`README.md`, `stack.txt`, `links.txt`) inside. Real Windows Explorer always navigates into a
folder on double-click; it does not have folders that launch something else instead. Explorer now
does exactly that, unconditionally. The `open` hint keeps meaning what it always meant for the
shell and Run — "jump straight to the window for this path" — and a visitor gets the identical
jump from inside Explorer by opening the project's own `README.md`, which already carries the
same file-level hint. The two behaviours were never actually in conflict; the first draft applied
the wrong one to directories.
**Consequences:** `constants/apps.ts` gained `explorer`; `My Computer`'s drives and sidebar link
into it; the Run dialog hands off to it for any path with no owning app.

### 2026-09-03 - A message box must swallow every key it sees, immediately

**Why:** an adversarial review of the dialog work found that Enter answered the message box *and*
reached Desktop's own keydown listener underneath, because the handler returned early on Enter
when the default button already had focus (which the mount effect guarantees) — without calling
`stopPropagation` first. Deleting a desktop icon and pressing Enter also launched the app the
confirmation was about, and Alt+F4 still closed the window behind an open dialog.
**Fix:** every branch of the dialog's key handler now stops propagation before doing anything else,
a stacked dialog checks it is the topmost before acting, and Desktop's own shortcut handlers bail
out immediately when `dialogs.length > 0` as a second line of defence. Also fixed in the same pass:
Task Manager reported every minimised window as "Not Responding", a value nothing measures, when
`Minimized` is what `ps` and `/proc` already say; a window opened wide on a desktop browser was
stranded once the viewport crossed into the mobile breakpoint (rotation, or a resize) with no
maximise control left to recover it — `Desktop` now calls a `syncViewportBreakpoint` action on that
crossing; Cascade Windows on a phone dropped every window into an unmanageable floating box, so it
is now a no-op on layout below the mobile breakpoint; and the shell root used `100vh`, which is the
*largest* a mobile browser's viewport ever gets with its toolbar showing, so the bottom of a
maximised window sat behind the browser chrome — a `.h-viewport` utility uses `100dvh` with a
`100vh` fallback.

### 2026-09-03 - The Run dialog is the command palette

**Why:** Layer A's worst problem is wayfinding — thirteen equally-weighted desktop icons give a
recruiter no route to "resume" except reading all of them. The obvious fix is a Ctrl+K palette,
but that is a 2020s affordance on a 2001 desktop, and the XP identity is settled. XP already
shipped the same idea: Start > Run, which took a program name or a path.
**Consequences:** `components/os/RunDialog.tsx` resolves, in order, a registered app id or alias
(`calc`, `cmd`, `mspaint`, `winmine`), a path in the virtual filesystem, or a URL. Its suggestion
list is derived from the app registry and `allPaths()`, never hand-maintained, so it cannot offer
something that does not open. An unknown name reports itself in XP's own wording instead of
failing silently.
**Consequence for the VFS:** `VDir` gained the `open` hint that `VFile` already had. The shell's
`open` command used to detect project directories with a hardcoded `'/projects/'` substring test,
which the Run dialog would have had to re-implement. It is data now, so both surfaces resolve a
path identically — and so will the explorer when it lands.
**Known limit, deliberately unadvertised:** Win+R and Ctrl+Shift+Esc are claimed by the host OS
before a web page sees them. The handlers exist for environments that pass them through, but no
text anywhere promises those keys work. The routes that always work are Start > Run and the
taskbar's right-click menu.

### 2026-09-03 - XP message boxes replace every native dialog

**Why:** `alert()` and `confirm()` fired at exactly the moments the desktop was most convincing —
deleting an icon, finishing the Konami code, an About box — and a browser chrome dialog announces
"this is a web page" louder than any missing feature announces "this is unfinished".
**Consequences:** `store` holds a `dialogs` queue; `utils/dialog.ts` exposes `xpAlert` and
`xpConfirm`, which are callable from outside React so they drop in where the native calls were.
The one behavioural difference is that they return promises rather than blocking, so a couple of
call sites became `async`. The resolvers live in a module-level Map, not in the store, so the
state stays plain data. Focus is trapped, Enter takes the default, Escape cancels.
**Consequence:** dialogs unblocked the Task Manager's End Task confirmation, and they are what
the future in-world Properties windows will be built on.

### 2026-09-03 - Task Manager, built only on measurable state

**Why:** the roadmap called this a "System Monitor", but XP already had the app, and the process
table it would display is real — the same rows `ps` prints and `/proc` contains. Naming it
anything else would have been inventing a program XP did not ship.
**Rule it enforces:** nothing is drawn that the browser cannot measure. The Performance tab shows
the JavaScript heap where `performance.memory` exists and says plainly that it does not elsewhere;
there is no CPU graph, because a web page cannot measure CPU, and the tab says so. This is the
app that most directly disproves the fabricated `867 Mbps` readout the P1 pass removed.

### 2026-09-03 - One registry, lazily loaded

**Why:** an app was declared in two files — metadata in `constants/apps.ts`, component in a table
inside `Window.tsx` — and forgetting the second failed silently at runtime. The same static import
list also forced all fifteen apps into the first paint.
**Consequences:** `AppConfig` gained `load` (a `next/dynamic` import), `category`, `surfaces` and
`aliases`. The Start menu's All Programs flyout and the desktop icon list are now derived from
`surfaces` rather than hand-written, which removed two more copies of the app list. First-load JS
went from 182 kB to 169 kB while gaining two new apps. `Window` caches the dynamic component by
app id — building one during render returns a fresh component type each time and remounts the app.

### 2026-09-03 - Verify with both a headless probe and a real browser

**Why:** the P1 pass was verified with a Node probe that drove the shell against a stub context,
and it missed the `ps`/`kill` pid collision because the stub `closeProcess` accepted any id. The
follow-up review then found that minimising a window unmounted its app — invisible to any
non-browser check, and directly contradicted by what both memory files claimed.
**Consequences:** two harnesses, both in the scratchpad, neither committed. The probe compiles
`content/` + `system/` + `store/persistence.ts` to CommonJS and rewrites the `@/` alias; the UI
harness drives Playwright through boot, login and the desktop. The rule: a change to `system/`
needs the probe, a change to `components/` or `store/` needs the browser, and most changes need
both. Findings that survive only one of them are not verified.

### 2026-09-03 - `store/persistence.ts`: one list, two readers

**Why:** `/etc/system.conf` hand-listed the persisted store keys and drifted — it advertised a
`theme` key that had been deleted and omitted `deletedAppIds`, the one persisted key a visitor can
actually feel. It did this inside a file whose own header says it is generated from the
repository, which is worse than not claiming it.
**Alternatives:** import the store into `system/` (breaks the no-React, no-store rule that makes
the shell testable); delete the line (loses real information an engineer wants).
**Consequences:** a new leaf module with no imports at all, so `system/` may read it without
gaining a dependency on React or the store. `partialize` is derived from the same list. Adding a
persisted field is now one edit, and the file the shell shows cannot disagree with what is saved.

### 2026-09-03 - A minimised window is hidden, not unmounted

**Why:** `Window` returned null while minimised, which unmounted the whole app subtree. Minimising
Minesweeper reset the board, Notepad lost unsaved text, the terminal lost its scrollback and
working directory, and the media player's `<audio>` element left the document mid-track. Both
`CLAUDE.md` and `store/CLAUDE.md` asserted the opposite: the *store* round-trip was lossless, the
rendered app was not.
**Alternatives:** lift each app's state into the store (fifteen migrations, a second source of
truth for things like a Minesweeper board, and it would still not keep an `<audio>` element
alive); serialise and restore per app (same cost, more code).
**Consequences:** one line of CSS fixes all fifteen apps, and it is what XP did. Windows stay in
the DOM while minimised, so anything measuring the document sees them — the drag test had to close
windows before dragging a desktop icon underneath one.

### 2026-08-20 - Window ids are readable pids

**Why:** window ids double as pids in `ps`, `/proc` and `kill`. They were
`Math.random().toString(36).slice(2, 11)` — nine opaque characters that also overflowed the `ps`
column width, rendering as `l9zk988fnrunning`. A visitor could not tell where the pid ended, so
`kill` — the one command requiring a value copied off the screen — was unusable.
**Found by:** driving the real UI in headless Chromium. The headless shell probe missed it
because its stub `closeProcess` accepted any id; only a live run surfaced it.
**Consequences:** ids are now a monotonic `w1`, `w2`, … counter, and `ps` measures its column
widths from the data instead of assuming them. Windows are never persisted, so the counter
resetting on reload is correct.

### 2026-08-20 - Contact uses `mailto:`, not a backend

**Why:** the form previously faked delivery. Of the honest options, `mailto:` needs no server, no
third-party form service, no API key and no spam handling — and this site has no other
server-side requirement, so adding one only for a contact form would be architecture for its own
sake.
**Alternatives:** a Next.js route handler plus an email provider (real delivery confirmation, but
introduces secrets, rate limiting and abuse handling for a portfolio that gets a handful of
messages); a hosted form service (a third-party dependency and another privacy policy).
**Consequences:** delivery cannot be confirmed, so the UI says "handed to your mail client", never
"sent". A clipboard fallback covers visitors with no mail client configured. If a real endpoint is
added later, only `submit()` changes.

### 2026-08-20 - ~~Media player runs on synthesis instead of files~~ (REVERTED same day)

Briefly replaced the playlist with in-browser synthesis to remove the licensed audio. **Reverted
on the owner's instruction** — the songs and the startup sound are part of the desktop and stay.
`utils/synth.ts` was deleted. The licensing exposure is documented in §9 and accepted by the
owner.

What was kept from that pass is the *functional* half: the player no longer flips `isPlaying`
optimistically while `play()`'s promise goes unhandled, it now honours the taskbar volume and mute
(which it previously ignored entirely), and it reports a real failure state when a track cannot
load or the browser blocks playback.

### 2026-08-20 - `lucide-react.d.ts` shim: removed, then restored

**What happened:** the shim is a hand-written `declare module 'lucide-react'` that shadows the
library's own types. It was deleted during this pass (the package ships `dist/lucide-react.d.ts`
and declares `typings`, so nothing needs it) — and was then restored outside the session, with the
newly-used icons added by hand.
**Current state:** the shim is present and the tree typechecks. `AppConfig.icon` is `LucideIcon`
rather than `any`, which is the real win and survives either way.
**Standing caveat:** while the shim exists, **every new lucide icon must be declared in it by hand
or the build fails**. If that friction bites, deleting the file resolves all icons immediately.

### 2026-08-20 - Confidential work is presented, not hidden

**Why:** the HERE and VXO work is the strongest engineering evidence the owner has. Omitting it
would misrepresent his experience; linking a dead "Source" button implies the project is fake.
**Consequences:** `Project` gained `problem` / `approach` / `contribution`, and
`components/ui/Disclosure.tsx` renders them with an explicit statement of why no source exists.
The absence of code reads as professional judgement rather than as a broken link.

### 2026-08-20 - REVERSED: the Windows XP identity stays (supersedes "BEARING")

**Decision by the owner.** An earlier session had begun re-branding the desktop away from Windows
XP to an original identity ("BEARING"): renamed apps, a new wordmark on boot and login, the XP
startup sample replaced with a synthesised chime, and the media-player playlist replaced with
generated audio. **All of that is reverted.** The owner's instruction: *"Do not change windows xp,
names, songs etc — keep how it was these things, the startup sounds etc, just work on
functionality, rest it should feel maximum like windows xp."*

**Restored:** `SYSTEM.name` = "Gaurav XP" · XP app titles ("Windows Media Player", "Windows
Picture and Fax Viewer", "Display Properties", "Resume.pdf") · the XP logo bitmaps on the login
screen and in the shutdown dialog · `startup.mp3` as the boot sound · the full media-player
playlist and its audio files · the XP boot wordmark · the XP welcome balloon · the XP logo in the
picture gallery · `guest@portfolio` as the shell prompt. `utils/synth.ts` was deleted as it is no
longer used.

**Not restored, deliberately:** the "Copyright (c) Microsoft Corporation" line on the boot screen.
The owner had separately asked for Microsoft legal residue to be removed, and claiming Microsoft
authorship of this build is a different thing from XP homage. It now reads as the owner's own work
plus a non-affiliation note.

**Standing rule for future sessions:** the XP look, names, sounds and assets are the product
identity. Work goes into functionality, correctness and honesty. Do not propose re-skinning again.

**Known consequence the owner has accepted:** the media playlist is commercial music the owner
does not hold redistribution rights to, and it is ~51 MB of the repository plus its git history.
Flagged in §9; kept at the owner's explicit instruction.

### 2026-08-19 - `content/` + `system/` as headless layers

**Why:** the terminal, GUI apps, and future process/architecture views must agree on one dataset.
Splitting headless data/runtime from React makes the shell testable and lets `open <path>` and a
GUI double-click resolve to the same action.
**Alternatives:** keep per-app hardcoded arrays (the status quo — already caused the
About/Resume contradiction); a CMS (over-engineering for one author).
**Consequences:** two new top-level directories with a strict no-React rule; apps migrate to
reading `content/` incrementally.

### 2026-08-19 - ESLint config added

**Why:** `npm run lint` had no config and prompted interactively, so linting had never run.
**Consequences:** `.eslintrc.json` extends `next/core-web-vitals`. Expect a first-run backlog of
`@next/next/no-img-element` warnings — those are tracked under the P4 performance pass, not
suppressed.
