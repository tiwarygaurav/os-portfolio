# CLAUDE.md — Project Context

> Long-term memory for this repository. Read this first, every session.
> Keep it **accurate over flattering**. If something is broken, say so here.
> Last structural update: 2026-08-19.

---

## 1. Project identity

**Repo:** `os-portfolio` — https://github.com/tiwarygaurav/os-portfolio
**Owner:** Kumar Gaurav (`tiwarygaurav`) — software engineer; backend, geospatial data, applied ML.
**Deployed:** at **https://gauravtiwary.com** (www redirects to it, 308), on Vercel: project `os-portfolio` in the owner's personal account `gaurav-4410` (Hobby) — **not** the CaratSense team the Vercel connector reaches. The domain is registered at Northwest Registered Agent with its nameservers moved to Vercel (`ns1`/`ns2.vercel-dns.com`), so its DNS lives in Vercel (`vercel dns ls gauravtiwary.com`); Northwest's mail records (MX, SPF, DMARC) were copied there, its DKIM record was not (it cannot be read from outside). Git is **not** connected yet (Vercel needs a GitHub login connection on that account), so a push does not deploy: deploy with `vercel deploy --prod` from a clean checkout of `origin/main`, never from the shared tree. `https://os-portfolio.vercel.app` is someone else's site. The Live link in `content/projects.ts` points at gauravtiwary.com.

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
scripts/      gen-architecture.mjs writes the module graph before dev / build / tests;
              architecture.mjs is the analysis, on the TypeScript parser
store/        Zustand store + window manager
utils/        cn, sound, dialog (XP message boxes), processes (window -> ProcEntry),
              fs (Explorer's file operations and clipboard), scroll (scroll a list, not the window)
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
VFS instead. `scripts/architecture.mjs` checks this through every chain of runtime imports that starts
in `content/` or `system/` (JSX and any npm package count as breaking it too), on every build and unit
run; `tests/unit/architecture.test.cjs` proves the checker on made-up trees and fails if the real one
breaks.

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
| Legacy `.ico` | The chrome loads only `public/icons/xp/` (~350 KB for the set), plus the XP logo bitmaps, the Windows flag and the account picture. A few app bodies (My Computer among them) still reference the old `.ico` files; point them at `icons/xp/` and the `.ico` files can go. |
| Deployment URL | `NEXT_PUBLIC_SITE_URL` is set to `https://gauravtiwary.com` in the Vercel project's production environment, so the Open Graph card points there; nothing is hardcoded. Previews and local builds have no site URL. |
| Not implemented | Keyboard window switching (Alt+Tab is the host OS's; window focus is pointer-driven — desktop icons do take arrows, Enter, Delete and Ctrl+A, message boxes and the exit dialogs trap focus, and the Start menu is driven from the keyboard once reached with Tab and opened with Enter or Space; Ctrl+Esc and the Windows key are not handled, and on Windows the OS takes them first). XP's animated cursors. A phone-width tablet tier and non-tap gestures (long-press) are the remaining mobile gap — see `docs/ROADMAP.md` §9. Files: no rubber-band selection in Explorer (Ctrl, Shift and Ctrl+A select several), no dragging between windows or onto the desktop (within Explorer, dragging onto a folder or the Folders tree works). |

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
4. **Bliss wallpaper** — needs an owned replacement before this is deployed publicly. The owner
   deployed it publicly on 2026-09-29 with Bliss in place; the question stands.
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

### 2026-10-01 - Fixes from the review of 388d8c0, and a pause on menu focus

The files session found no regression in 388d8c0 with the mouse or the keyboard alone, and a few low
follow-ups. This round fixes only what was broken, adds no behaviour, and ends the run of changes to
how menus handle focus: four commits in a row each fixed the last review's findings, and three of
them brought a regression of their own (each caught by review before deployment).
- **A flyout closing under its own opener.** With a pointer-opened flyout that had taken focus by a
  key, moving back onto All Programs closed it at once and reopened it 300 ms later as a fresh panel:
  the at-once close compared the item with the opener a keyboard flyout records, and a pointer one
  records none. It compares the item's flyout kind with the open one's.
- **Tests.** The two new ones failed on a build with their fix reverted: moving back onto All Programs
  leaves the same panel open; and Connect To after All Programs, by the pointer alone, starts with
  nothing selected (which pins the kind in the panel's key; the placement test did not). The
  brushing test moves the mouse back to back to points worked out beforehand, so no actionability
  wait races the 300 ms close.
**Known, not changed:** the panel key `opening:menuKey` could come back to an earlier value within
one opening (All Programs, Connect To, All Programs inside a 100 ms fade), when the fading panel would
return with its old state. Nothing reaches that today: a switch of kind waits on the 300 ms hover
timer, and a click starts a new opening first. Not covered by a test: the focus effect's re-runs under
the taskbar clock, and the gaps listed in the entries below.

### 2026-10-01 - Fixes from the review of 364269c: a flyout placed on screen; focus not taken unrecorded

The files session held 364269c for two regressions against the live 8e0f783, one visible with the
mouse alone.
- **All Programs after Connect To ran off the screen.** 364269c keyed the Start flyout's whole
  ContextMenu by its kind, so switching kinds remounted it already open; its first render returns
  nothing until mounted, so the menu was never measured and stood at its raw position — on a
  1366 x 768 screen, from the button's bottom down past the taskbar. One ContextMenu stays mounted
  again, which is what fixed it, and a `menuKey` prop folds the kind into the panel's own key (a
  fresh panel, with the old kind fading out). The placement also re-measures once the portal exists
  and when the key changes, which changes nothing for today's callers.
- **Focus taken without a note.** Backing out of a submenu focused its opener directly, even when the
  pointer had taken the submenu and focus had never been in the menu: nothing recorded where focus
  came from, so the next close blurred it to `<body>`. The opener is focused directly only when focus
  is already in the menu; otherwise the focus effect moves it there and records the way back.
- **A flyout closed underfoot.** The footer buttons' hover (new in 364269c) starts the flyout's
  300 ms close, as XP did, but the pointer arriving in the flyout never cancelled it: brushing Log
  Off on the way in closed the flyout under the pointer. Arriving in a flyout cancels a pending,
  timed close; that also mends the same brush across the left column, which the earlier site had.
- **The pointer resting on All Programs** reopened a keyboard flyout as a pointer one after the hover
  delay, and it stopped answering Left (as it already did before any of this work): hovering the
  opener of the flyout already open changes nothing.
- **The focus effect** depended on the `onBack` callback itself, a new closure on every parent render
  (every second, with the taskbar clock): it depends on whether there is one.
- **Ctrl+Shift+Esc** closes the menu it passes through, now with a test.
**Tests.** Each failed on a build with its fix reverted (the footer's hover in a build of its own,
since reverting it hides the brushing case): All Programs after Connect To is measured on screen,
its bottom at or above its button's (`toBeVisible` passes for a fixed element off the screen);
Escape as the first key in a submenu the pointer opened, then Escape, returns focus to the list;
brushing Log Off on the way into a flyout; the pointer resting on All Programs leaves Left working;
Ctrl+Shift+Esc closes Explorer's menu; Log Off's own hover, with the pointer brought in over the
header first so the first mouse move after the keyboard is not what acts. The chord test gained a
positive control: with the menu closed, the same chord opens the icon. Not covered: the focus
effect's churn under the clock, and the earlier gaps listed below.

### 2026-10-01 - Fixes from the review of 8e0f783: menus swallow chords again; one selection everywhere

The files session reviewed 8e0f783 after it went live: no mouse-only regression, and five low
findings, all fixed here.
- **Chords.** 8e0f783 let every Ctrl, Alt or Meta chord of a menu key through a menu, so Ctrl+Enter
  or Alt+Enter opened the selected desktop icon behind its menu, Alt+Enter in Explorer opened
  Properties, and Ctrl+Arrow moved the selection. A menu swallows them again, as XP's did; only
  Ctrl+Shift+Esc goes through, and the menu closes as it does.
- **One selection, everywhere.** Pointing at a Start item past a keyboard-opened flyout (the footer
  buttons and a resting pointer included) closes that flyout at once, so it cannot take an Enter
  meant for the item pointed at. Once focus is anywhere in a context menu, it follows the selection
  of whichever panel has the keyboard, so a sibling's submenu the pointer opened takes it too.
- **Tab** does nothing in a menu that holds focus: it used to carry focus out past the menu, out of
  the page, and the window losing focus closed the menu.
- **Backing out of a submenu** focuses its opener before the submenu goes, so focus no longer
  stops on the list for a moment on the way (an extra event for a screen reader, and for the list).
  (As written, it did so even when the pointer had taken the submenu and focus was not in the menu,
  pulling focus in without a note of where it came from, so the next close dropped it to `<body>`.
  Fixed in the entry above.)
- **All Programs and Connect To** are separate menus: the Start flyout is keyed by its kind, so one
  never inherits the other's selection or keyboard state (its arrows were dead after keys in the
  other). (As written, keying the whole ContextMenu remounted it already open, and a menu open from
  its first render was never measured: All Programs after Connect To ran off the bottom of the
  screen, over the taskbar. The entry above folds the kind into the panel's key instead.)
**Tests.** Each failed on a build with its fix reverted: a chord acting behind a menu; focus
following the pointer into a sibling submenu; Tab in a menu; backing out without stopping outside
the menu; Enter after pointing at Log Off past a keyboard flyout; and Connect To's arrows after keys
in All Programs (which needs the flyout's at-once close and its key reverted together, as either
alone covers it). The fade test's last check names the open panel, though a role query already
skipped a closing one. Still
untested: the unmount hand-back on its own, the fallback to an ancestor and the check that focus
landed (the rename test is coverage: Explorer focuses the renamed file itself), the lost-release
wake, the Start menu's key gate apart from its focusin close, the hover suppression, a count-0
click, and a hand-back after an outside click, the window's blur or a resize.

### 2026-10-01 - Fixes from the review of 53949c9: submenus give focus back too; a fade test that holds

The files session reviewed 53949c9: no mouse-only regression against the live 0901d44, with one
narrow keyboard regression and some smaller findings.
- **A submenu closing on its own dropped focus.** In Explorer, pointing into View's submenu, pressing
  Down, then Escape (or Left, or moving the pointer on) closed the submenu with focus inside it, and
  focus fell to `<body>`: the list's keys went dead again. Now backing out of a submenu with a key
  leaves the keys driving its parent, on the item that opened it, as XP did; a panel that already
  holds focus keeps it on its selection whoever moves that selection (so a pointer in a keyed
  submenu moves focus with it); and any panel that unmounts holding focus hands it back as it goes,
  before its node leaves the page. (Not yet one selection everywhere: a sibling's submenu the pointer
  opened, and a Start item pointed at past a keyboard flyout, still split the highlight from Enter.
  The entry above fixed both.)
- **Where focus goes back to** is the element it came from, or, if that has gone, its nearest
  ancestor with a `tabindex`, and it must really land there (a hidden or disabled target takes no
  focus): otherwise focus is let go rather than left in a fading menu.
- **The Start menu:** pointing at an item while a keyboard-opened flyout holds focus moves focus to
  that item, so the flyout closing cannot hand focus back past the pointer. (Only for items that
  call the hover logic; the footer buttons and a resting pointer did not, until the entry above.)
- **Chords pass through menus:** Ctrl+Shift+Esc with a context menu or a flyout open opens Task
  Manager. (This let every Ctrl, Alt or Meta chord of a menu key through, so Alt+Enter or
  Ctrl+Enter acted on the desktop or Explorer behind an open menu; the entry above lets only
  Ctrl+Shift+Esc through.)
- **The fade-out test was flaky, and why.** The 100 ms fade is a Web Animation (framer-motion's
  accelerated path) on the document's real timeline. Playwright's clock gated only its start, and
  stopping the page's own clocks moved that start into the past, finishing it at once. The test now
  stretches any Web Animation made while it is armed to 100 s, so the closing menu stays mid-exit as
  long as the test needs, and finishes it with `finish()`: 24 of 24 under parallel load.
**Tests.** Each failed on a build with its fix reverted: backing out of a submenu lands on its
opener; one selection in a keyed submenu the pointer moves in; pointing at a Start item past a
keyboard flyout; Ctrl+Shift+Esc with a context menu open; and the fade-out right-click. Coverage
that does not pin one fix: a submenu closed by the pointer moving on (the parent taking focus back
and the unmount hand-back each cover it alone), and the rename box (Explorer focuses the renamed item
itself, so the fallback to the place around it is not reached there; it stays as hardening, like the
check that focus really landed). Still not covered: the lost-release wake, the Start menu's key gate
apart from its focusin close, the hover suppression, a count-0 click, and a hand-back after an
outside click, the window's blur or a resize.

### 2026-10-01 - Fixes from the review of d4b2b2d: focus moves only for the keys, and comes back

The files session held d4b2b2d for one regression against the live site, and four small findings.
- **The mouse took focus into menus.** d4b2b2d moved real focus with the selection in any panel that
  "owned the keyboard", and a pointer entering a submenu hands it the keyboard. So choosing View >
  List in Explorer's menu with the mouse pulled focus out of the file list, and chose with a blur to
  `<body>`: the list's arrows, Delete, F2, Ctrl+A and Backspace did nothing until it was clicked
  again. Focus now moves only in a panel the keys are driving: one opened by a key, or one a key has
  been pressed in. The pointer never moves focus into a menu.
- **Focus comes back when the menu closes.** The root panel remembers where focus was when the
  menu first took it. Choosing an item hands it back there (not to `<body>`), and so does every
  other close of the whole menu — Escape, a click outside, the window losing focus — in a layout
  effect as the fade begins, before the page paints. (As shipped, a submenu closing on its own —
  Left, Escape, the pointer moving on — still dropped focus to `<body>`; the entry above fixed it.)
- **N2:** a held Enter on All Programs or Connect To went on into the flyout and launched a program;
  a menu panel ignores a repeating Enter or Space.
- **N3:** a mouse move that stays inside the hovered item now hands it the selection, so only one
  item is lit. **N4:** the Start menu's Escape ignores chords, so Ctrl+Shift+Esc still opens Task
  Manager (with the Start menu itself open; with a context menu or a flyout open, from the entry
  above). **N5:** only a click counted 1 ends the waking double-click watch; a click with no press
  (count 0, from the keyboard or a script) says nothing.
**Tests.** Each of these failed on a build with its fix reverted: the mouse choosing from a
submenu leaves focus in the window (checked while pointing, too, since the hand-back alone would
otherwise hide it); a menu driven by keys hands focus back on Escape, with no `aria-hidden` over
focus; a held Enter on the Start button (the Start menu's own guard) and on All Programs (the
panel's); Escape keeps the desktop's selection; Ctrl+Shift+Esc with the Start menu open; the rename
test, now choosing Arrange Icons By > Name, which moves no focus of its own; and the fade-out
right-click, put on Playwright's clock (which did not hold it: the fade is a Web Animation on the
real timeline, and the test was flaky under load until the entry above). Masking reverts were checked in
separate builds. Still not covered: the lost-release wake, the Start menu's key gate apart from its
focusin close, the hover suppression, and N5.

### 2026-10-01 - Fixes from the review of 0901d44 (the Start menu's keyboard)

The files session reviewed 0901d44 and found it sound, with nine findings to follow up. All are
addressed here.
- **Keys aimed elsewhere.** Enter on the Start button opened the icon selected on the desktop, and
  Delete in the Start menu offered to recycle it. The desktop's icon keys now act only on a key
  aimed at `<body>` or the icon layer. The open Start menu took keys typed into a window after Tab
  had left it: it now takes only keys aimed at itself, its button or nothing, and closes when focus
  moves anywhere else. Its Escape no longer also reaches the desktop's (which deselected the icons).
- **R opens Run.** An underlined letter answers before any item that merely begins with it, as in
  XP; R used to select Resume.pdf.
- **Held keys.** A repeating key no longer activates anything in the Start menu's own items or the
  Turn Off dialog: a held U used to go straight on through Turn Off, and a held Enter on the Start
  button into the first program. Unsaved work was still asked about; the test proves it. (Its
  flyouts still took a held Enter; the entry above closed that.)
- **Screen readers.** The Start menu is `role="menu"` with menu items (it was a group of buttons,
  so a screen reader stayed in browse mode and ate the arrows), and the Start button has
  `aria-haspopup`. A menu panel that owns the keyboard (a submenu opened from the keyboard, or All
  Programs) moves real focus with its selection, so each item is announced, and lets go of focus
  before an item acts. (As shipped, "owns the keyboard" also meant a pointer entering a submenu, so
  the mouse pulled focus out of the window it was in, and closes other than choosing an item left
  focus in the fading menu. "Fixes from the review of d4b2b2d" fixed the first and most of the
  second, and "Fixes from the review of 53949c9" the rest.)
- **A rename in progress** (Explorer's box) was dropped when a menu was chosen over it, since the
  press no longer blurred the box. A press in a menu now ends an edit in progress first.
- **Waking gestures.** If the waking release was lost, a new press by the same pointer ends the
  swallow (it used to take that press's release as the wake's, and a drag begun then never ended).
  The double-click rule has no clock: the next click's `detail` says whether it paired with the
  waking click, which the fixed 800 ms got wrong both ways.
- **One selection.** While the keyboard drives the Start menu, the item under a resting pointer is
  not lit too; moving the mouse hands the selection back, and pointing at an item focuses it.
**Tests.** Each of these failed on a build with its fix reverted: the leak to a selected icon; Tab
out of the menu; R; a held U (which reaches only the Turn Off dialog's guard); focus following a
keyboard submenu and let go before it fades (reverted alone, since reverting focus-following as
well hides it); a double-click once the waking click is counted out (a count Playwright sets). The
rename test, as written here, probably did not: moving into the New submenu took focus and so
committed the name itself; the entry above rewrote it. "Choosing a menu item never moves focus into
the menu" records any focus inside a menu at any moment. The fade-out right-click test still
depended on landing inside the 100 ms fade; two entries above made it deterministic. Connect
To, Escape in a flyout, and Start, U, U with unsaved work are coverage, not regressions. Still not
covered: multi-finger touch wakes, Stand By's grace across a re-render, and XP's Ctrl+Esc and
Windows key.

### 2026-10-01 - The Start menu from the keyboard; fixes from the re-check of e0e9e75

**Why:** XP's Start menu worked entirely from the keyboard, and "Start, U, U" was how many people
turned XP off. Here it had only Escape, and §5 listed it as not built.
**What:** Enter or Space on the Start button opens the menu with its first item selected (a click
with no count is the keyboard's). The arrows move within the white left side, the blue right side
and the footer. Left and Right cross between the sides at the same height, and each side runs down
into its own footer button: Log Off under the left, Turn Off Computer under the right. Home and End
work too. Right or Enter on All Programs or Connect To, or P for All Programs, opens the flyout on
its first item, and Left or Escape closes it back to its button. (Connect To has no letter.) A
letter selects the item it underlines — XP's L (Log Off), U (Turn Off Computer), R (Run) and P (All
Programs), the ones this entry is sure of — or else the items it begins, and opens it when only one
item answers to it. (As first shipped, R also matched Resume.pdf and so only selected; the entry
above made an underlined letter answer first.) The Turn Off
dialog already took U, so "Start, U, U" turns the computer off. The underlines show only once the
keyboard is in use, as XP's keyboard cues did. Escape returns focus to the Start button. Keyboard
position is drawn as the hover highlight, with no focus ring. `components/ui/AccessLabel.tsx` is
the one underlined-label component, shared with the exit dialogs, and `ContextMenu` takes an
`onBack` from an opener that keeps its own keyboard.
**The re-check of e0e9e75** (files session) found no blockers and three low defects. All three are
fixed:
- A clicked menu item took focus, and kept it through the fade under `aria-hidden`, which Chrome
  blocks and logs. A press never moves focus into a menu now, as XP's never took it.
- Touch wakes: another finger's click ended the swallow early, and a wake with no click (a scroll or
  a long-press) ate the next tap's release. The swallow now ends with the first click after the
  waking pointer's release (a tap's own click is usually suppressed by its eaten touchend), at the
  next press, or at the backstop.
- Stand By's grace period restarted on any parent re-render, through an inline `onWake`. It is held
  in a ref.
**Accepted, not fixed:** a double-click begun just after a waking click pairs its first click with
the swallowed one, so it selects the icon rather than opening it. The alternative, letting that
double-click through, opens the icon under a double-press that wakes the screen. (The fixed 800 ms
this shipped with also erred both ways; the entry above replaced it with the browser's own count.)
**Tests.** Stand By's helper now parks the pointer and then chooses Stand By with its S key, so no
move races the grace period. The key-wake test now presses F10 over an active Calculator,
so it fails without the swallow; Notepad was no good for this, as its menu is not the shared
MenuBar. Fixed sleeps before negative checks now have positive controls: the saver starts once
Stand By is over, and the startup sound is polled until it plays, with no fixed wait. New tests
cover a right-click during a menu's fade-out, focus staying out of a chosen menu, and the Start
menu's keyboard. Each of those, and the key-wake test, failed on a build with its fix reverted.
Multi-finger touch wakes and the re-armed grace period have no test.

### 2026-09-29 - The chrome fixes re-checked (7b146df): an inert session, gesture-bound Stand By

The files session re-checked 7b146df. Three fixes were partial, five defects were new, and several
tests could not fail with their fix reverted.
- **The session behind a cover is inert.** While the Welcome screen (Switch User) or "Saving your
  settings..." is up, the desktop's session root carries `inert`: Tab used to reach caption and
  taskbar buttons behind the Welcome screen, where Enter pressed them unseen. The covers, the exit
  dialogs and the screen saver render outside that root. MenuBar's Alt+letter and F10 listen on
  `window` and accept keys aimed at nothing, so a window inside an inert tree now ignores them.
  Stand By is left out: it swallows every key and press itself until it wakes, so it needs no
  inert tree. (This entry first said `inert` would drop the focus the visitor wakes up to; focus is
  always on `<body>` by then, so that was not the reason.)
- **Stand By** swallowed the rest of its waking gesture for a fixed 800 ms. A second press inside
  that window lost its release, so a drag or rubber band never ended. A press held longer leaked
  its release, so a right-press opened the menu underneath. A double-press opened the icon.
  `components/os/gesture.ts` now holds the screen saver's gesture-bound swallow, which also eats
  the double-click, and both covers use it. The saver no longer starts under Stand By or counts
  the time asleep as idle (`standingBy()`). Stand By is portaled to `<body>`, so the Welcome
  screen's Stand By sits above the saver too.
- **Hidden desktop icons** could still be selected with Ctrl+A or the rubber band, then deleted or
  opened. Hiding them clears the selection, and the keys and the band leave them alone.
- **A dialog inside a window** (Save As, Properties) was treated like a desktop message box and
  left the desktop the keyboard. Delete after a click on its blank face offered to recycle the icon
  selected on the desktop.
- **The startup sound:** on a slow load, the primer's `pause()` could land after the real playback
  had started, and silence it. A refused primer was also reused. The primer now stops only while
  unclaimed, and a refusal releases it.
- **Found by the stronger tests:** since a right-click during a menu's exit fade now opens a menu,
  AnimatePresence reused the fading element, with its submenu still open and measured where the
  last menu had stood (off the screen). Each opening now gets its own key, and a closing menu is
  `aria-hidden`.
- **Also:** the five icons with only 48 px originals have 32 px frames, area-averaged down from
  those originals (see public/CLAUDE.md), where before each was a copy of its 48 px file.
  `windows-flag.png`, a copy of `windows.png`, is gone, and the chrome loads the original. The
  calendar's day letters are black over a rule; white on the Olive and Silver edge colour was
  about 2.2:1.
**Tests.** The old Stand By test woke with a left click, which could not reach the icon before the
fix either. The deleted-icon test used Delete, which clears the selection anyway. Each of these
now fails with its fix reverted (checked on a build with the fixes put back): an icon dropped on
the bin is not reopened by Enter; hidden icons; a window's own dialog; Show Desktop after a close;
a pointer in a submenu takes the keyboard; a submenu with no room on either side; a cancelled
rubber band; right-press, double-press and drag after Stand By; the inert Welcome screen; the
saver under Stand By (`tests/e2e/before-logon.spec.ts`, on Playwright's clock); the startup sound
on a slow file; Restore on a phone. The key that wakes Stand By had a test that could not fail;
the entry above rebuilt it so it can. Not covered: Safari's audio unlock, since Playwright's
WebKit does not enforce Safari's gesture rule.

### 2026-09-29 - Fixes from the review of the five apps (7212919)

Twenty-one findings across Paint, the Calculator, the Media Player, Solitaire, Minesweeper and the
shared menu bar and dialog, plus a nit. All are fixed; two did not reproduce as described.
- **Paint.** Pending work counted as nothing. `modified` changed only when something entered the
  history, so a pasted or moved selection, typed text, or a half-drawn curve or polygon was dropped by
  close, New, Open and Log Off without a question, and Set As Background after moving a selection used
  the saved file. The engine's `unsaved` covers them. The close guard follows the store's contract
  (store/CLAUDE.md): Yes waits through Save As and resolves true once written — which also removed the
  "after save" callback that a refused save left armed for the next, unrelated Save As. Stretch/Skew
  is refused past `MAX_SIDE` (an 89° skew of 750 px asked for 26,473) and says what size it would have
  been. Even-sized circles were 2 px narrow: rows were sampled at pixel centres and columns half a
  pixel in. Ellipses now meet all four sides of their box, and a thick outline also carries the
  4-connected edge, so Fill cannot slip through a flat ellipse's corners. Rectangle Select reaches the
  edge columns and rows, and keeps the pixel it started on whichever way it is dragged. A click on a
  resize handle no longer resizes. Copy To leaves Paint's clipboard alone. The Fonts toolbar leaves the
  keyboard in the text box, and a font list only clicked sends typed letters to the text.
- **Menus and dialogs** (`components/ui`). The press that closes a menu is swallowed to its click.
  Only its pointerdown was, so closing Calculator's View menu over the 7 typed 7, and closing
  Minesweeper's Game menu over the face started a new game. The swallow also ends at a key, a cancel
  or a moment after release, so a click that never comes cannot eat a keyboard one later. A press
  inside an open menu hands the keyboard back to the menu after the app's root has taken it, so
  Escape closes the menu instead of clearing the calculation. Alt+letter and F10 do not open a menu
  behind a modal dialog in the window (AppDialog, Save As, Properties) or an XP message box. A press
  on a dialog's unfocusable parts no longer hands the keyboard to Paint behind it, where Ctrl+Z undid
  the picture under an open Save As. AppDialog and Solitaire's deck picker focus without scrolling the
  window. Dropdowns use the live taskbar height.
- **Calculator.** A correct final digit was rounded away from exact integers (1000000000000000 + 1
  showed 1000000000000000); a safe integer is now never snapped. Everything else still snaps a 16th
  digit within one unit of a 15-digit number, because every key stores its result at 16 digits and
  noise from a chain of keys is wider than any window in ulps: a first attempt at a two-ulp window,
  caught by the re-check, showed √3 × √3 as 2.999999999999999. Roots in Hex, Oct and Bin and the
  Statistics Box are exact to the last bit: a root is corrected against the integer, and statistics
  keep each value as entered. Trigonometry reduces degrees and grads to one turn before looking for a
  quarter turn (sin 1.7e17° is sin 80°, not 1). In radians, a small multiple of π/2 counts as a
  quarter turn when the display shows it as one (cos of π ÷ 2 was -3.8e-16); past two turns only the
  exact double does, so sin 1570796.326794897 is computed. The Statistics Box scrolls its own list
  and nothing else.
- **Media Player.** A track that cannot load says so; only `NotAllowedError` means the browser blocked
  playback. A single click on the playlist only selects, playing or paused, and a double-click or
  Enter plays, as in WMP 9; with nothing paused, Play starts the selected song (the track-boundary
  test in window-manager.spec.ts now double-clicks the row it plays). Scope keeps fading through half
  a second of silence before its loop stops.
- **Solitaire** keeps its options and card back for the session, across closing the window, as
  Minesweeper already did. **Minesweeper's** first-click e2e assertion named a tile the engine never
  draws, so it could not fail.

**Two that did not reproduce as described.** The Scope ghost never froze in Chromium. Silence is
judged from smoothed frequency data, which kept the loop running until the ghost had faded anyway.
The fade is now timed rather than left to the smoothing, and a unit test holds it. A typed
9999999999999999 becoming 1.e+16 is a double's own limit: above 2^53 not every integer exists, which
Help already states. The dropped final digit reported with it is fixed.
**The re-check** of the first commit (8816deb) found the ulp window's regression and six smaller
things — the modal and message-box cases, the swallowed press, radians far out, a click while
paused — all fixed in the follow-up, with a test for chained noise over n = 2..200. Its thick-outline
nit stays, explained in `raster.ts`: closing a ring where it meets corner to corner must take a
pixel from the fill or the interior.
**Consequences:** `raster.ts` holds `MAX_SIDE` (the codec re-exports it) and `stretchSkewSize`.
`tests/unit/tsconfig.engines.json` also compiles the visualisations, which gained a unit test. Every
module of the five apps has its own summary in System Information.
**Verified:** 216 unit tests and 131 e2e on a production build. Every new test failed with its fix
reverted, and none of the tests already there was weakened.

### 2026-09-29 - Deployed on Vercel, in the owner's personal account, at gauravtiwary.com

**Decision, the owner's:** deploy to the domain he bought (registrar: Northwest Registered Agent), in
his personal Vercel account `gaurav-4410` — not the CaratSense team that the Vercel connector in these
sessions reaches, which holds client work. **What was done:** project `os-portfolio`, deployed from a
clean `git worktree` of `origin/main` (7b146df) with the Vercel CLI; `NEXT_PUBLIC_SITE_URL` =
`https://gauravtiwary.com` for production; `gauravtiwary.com` and `www.gauravtiwary.com` attached,
www redirecting 308 to the apex. A browser smoke test of the live deployment booted, logged on and ran
a pipeline over `/usr/src` with no page errors or failed requests.
**A trap, recorded:** `vercel project add` creates a project with no framework, and Vercel then
published `public/` as a static site — the resume and sounds served, the page was a 404. `vercel.json`
now says `"framework": "nextjs"`, so every build, from the CLI or from Git, is a Next.js build.
**DNS:** Northwest's DNS editor did not save the owner's records — its own nameservers still served the purchase-day zone — so the nameservers were moved to Vercel instead, after Northwest's MX, SPF and DMARC records were copied into Vercel DNS. The apex certificate was issued with `vercel certs issue`; the live domain then passed the same browser smoke test. **Not yet:** Git auto-deploy, which needs a GitHub login
connection on the Vercel account; until then a push does not deploy. The media (§9) and the Bliss
wallpaper (open question 4) are now public, as the owner chose.

### 2026-09-29 - A review of everything not yet reviewed, and the fixes in the shell, Explorer and the store

**Why:** the owner asked for every change to be reviewed before it was pushed. Eight read-only
reviewers covered what had never had an independent review: 5bf735c, 413692c, the pipes (95cacf4),
drag and drop (60189a5), the XP fidelity pass (8183961), the screen saver (6467378), picture
wallpapers (c5dde69) and the five rebuilt apps (7212919). Each finding went to the session that owns
the file; the ones in the chrome went to that session, the apps' to theirs. `docs/AUDIT.md` has the
tally. These are the fixes in this session's files.
- **The shell tells a command where its output goes.** `run(args, ctx, stdin, io)`: with
  `io.captured`, output is going into a pipe or a file, so cat leaves out its tip and repeated link
  and passes the file through exactly (`raw`), and grep's 40-line screen cap no longer cut what a pipe
  received (`grep a | wc -l` said 40 while `grep -c a` said 231). Short options combine as getopt
  reads them (`grep -vc`, `sort -rn`, `uniq -ci`) and an unknown one is named; they used to be read as
  the search term or a file name. `wc` counts as GNU wc does (a line is a newline; `-m` characters,
  `-c` bytes). `echo | wc -l` is 1. `find` searches every folder named and understands `[classes]`.
  `exit` in a pipeline ends only that subshell. Tab after `ls|gr` completes instead of erasing `|gr`.
- **Drag and drop shows XP's cursors:** copy when the drag holds something read-only, the no-entry
  sign over a folder that takes nothing (it used to say "move" and refuse on the drop), and a path
  dropped into a text box arrives quoted.
- **The dependency-rule checker** follows `require()`, `.js` endings and a stylesheet import rather
  than dropping them unseen; ignores type-only package imports and reads `..` as a folder; reports one
  violation per fault (one bad import had read as "Broken 5 times"); and a comment a file opens with
  is its summary however short. `postinstall` skips the graph when dev dependencies are absent.
- **Explorer:** keys on the folder's background act on the selection (Ctrl+A, Delete); Arrange by
  Size sorts on the bytes the Size column shows; a deleted folder is refused as gone, not as "a system
  folder"; scrolling an item into view clears the Details headings.
- **The store:** the close-guard contract (store/CLAUDE.md) — a guard resolves true once the work is
  saved, waiting through a Save As — so Log Off with unsaved Notepad text, answered Yes, now saves and
  logs off; before, it saved, closed Notepad and silently stayed logged on. Only windows that ask are
  brought forward; a window already asking is not asked twice. `merge` takes back only persisted keys,
  each checked. A wallpaper renamed out of being a picture falls back as a deleted one does. A restore
  from the bin is one write, so it is not refused near the quota when the end state fits. `df` says
  its K are characters and never shows 0% for real use.
**A finding that did not reproduce:** a reviewer traced System Information's Storage as going stale
on an append. In the browser the window re-renders with its parent, so it did not; the window now
subscribes to file changes itself, and its e2e test says it checks the behaviour, not that fix.
**Verified:** 200 unit tests, 88 e2e on a production build; the two new e2e regression tests failed
with their fixes reverted.

### 2026-09-29 - Fixes from the review of the XP chrome (8183961, 5bf735c)

Twenty-four findings in the chrome; the store's end-of-session contract (`requestEndSession`) went
to the files session. The ones that mattered: from the Switch User screen, Turn off computer opened
its dialog *underneath* the Welcome screen — invisible, yet holding the keyboard, so Enter turned
the machine off blind. The exit dialogs now sit above every session cover, and while the Welcome
screen, "Saving your settings..." or Stand By covers the session (`data-session-cover`,
`sessionCovered()`), the desktop and message-box key handlers stand down. Resizing a window by its
top or left edge could leave it drawn behind the taskbar while the store held a clamped position:
the resize now renders the store's answer, as a drag does, and a cancelled pointer puts the window
back. A message box answered keys wherever focus was, so Run's `calc` + Enter answered it; it now
acts only when it holds focus. Unchecking Show Desktop Icons hid the only menu that could bring them
back. Stand By's waking press or key went on to act underneath. Arrange Icons By sorted Notepad as
"Untitled - Notepad" and saved every icon's position, so the grid stopped reflowing — it now sets an
order for the session. The desktop lost its keyboard after answering its own message box. Also:
menus' keyboard and hover no longer fight, a disabled item's submenu stays shut, a flipped submenu
stays on screen; the task button's Restore no longer un-maximises on a phone; Show Desktop's second
click skips closed windows; the taskbar popups follow the colour scheme (`--luna-input-edge`);
menus no longer advertise Alt+F4, which closes the browser on Windows; the startup sound is unlocked
inside the logon click, where Safari needs it. Found while testing these: a menu still took the
pointer during its exit fade, so a right-click just after choosing an item landed on the dying menu
and opened nothing; it lets go as the fade starts. And from the files session's review: when the
`/usr/src` chunk failed to load (offline), Enter on a `/usr/...` path in Run did nothing and left an
unhandled rejection; Run now says the module graph did not load. `tests/e2e/session.spec.ts` and
`chrome.spec.ts` cover Log Off, Turn Off and Switch User. This entry said they covered each
regression above; several could not fail with their fix reverted. The re-check entry above says
which, and what replaced them.

### 2026-09-24 - Fixes from the review of 83545fe: the module graph is parsed, not pattern-matched

The review found System Information's numbers, and the rule it claims to enforce, weaker than they
read. The analysis is now `scripts/architecture.mjs`, on the TypeScript compiler's parser (already a
dev dependency, so rule 10 is not engaged); `gen-architecture.mjs` only reads the tree and writes.
- **The rule follows every chain.** It was checked one import deep. Now every module that
  `content/` or `system/` reaches through runtime imports is held to it (type-only imports are
  erased and do not count), and JSX, any npm package (an allowlist, empty today), the store bar
  `persistence.ts`, and an `import()` whose target cannot be known each break it; a violation names
  the chain. The window reports the modules and distinct imports the check covered — "Imports
  checked" used to count every import in the tree, checked or not.
- **Tested on made-up trees.** The unit tests used to check the generated graph against itself,
  which could only agree. They now hand the analysis small trees whose right answer is known.
- **Exact.** An "import" in a string or a comment is not one; line counts were one too high; the
  generated file is in the graph like any module. A summary is the module's own doc comment: one in
  its opening or standing alone before the first statement, else the default export's, else a
  multi-paragraph overview on a first statement that opens the file or is exported. Taking the first
  comment anywhere labelled the store with its `WindowPayload` type's. The fourteen modules with no
  file-level doc say exactly that. A module nothing imports is "unused", except `app/`, which Next.js
  loads by place.

Elsewhere: selecting a module in a window parked low scrolled the whole desktop, because
`scrollIntoView` and a plain `focus()` scroll `overflow: hidden` ancestors too — `utils/scroll.ts`
moves only the nearest real scrolling list, and Explorer, the rename box, Properties, the file dialog
and Search focus with `preventScroll`. Explorer's keys act on the selection (Delete took a focused item
that a Ctrl+click had just taken out of it), and a right-click no longer leaves the list thinking a
press is under way. Paste takes an item inside a folder that is also going along with the folder,
skips one deleted since the Cut, and after a refusal part-way keeps only what did not move on the
clipboard. Refusals and Properties say what a folder is by where it is (`/proc`, Sample Pictures, the
root, the portfolio); a folder of built-in pictures is "Not known", not "At least 0 bytes"; a nested
selection counts once; Total File Size says what it could not count; base64 padding is not data. New
Text Document could overwrite a file: `nextFreeName` gave up at 10,000 and returned the taken name.
The file dialog mounts `/usr/src` too, and Run fetches it when it opens. System Information names the
colour scheme and counts storage exactly, in characters, as the quota does — and `df` says characters.

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
already active — was in Desktop.tsx and is fixed there: the desktop now holds the keyboard only
while the last press landed in its icon layer (a capture-phase listener, so no app can hide a
press from it), and keys aimed inside a window are ignored outright. `tests/e2e/desktop-keys.spec.ts`
covers it. In the same fix, a context menu stops listening for keys the moment its exit fade starts;
it used to swallow the Enter meant for the rename box its New › Text Document had just opened.

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
