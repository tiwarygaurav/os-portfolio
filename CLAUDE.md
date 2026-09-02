# CLAUDE.md — Project Context

> Long-term memory for this repository. Read this first, every session.
> Keep it **accurate over flattering**. If something is broken, say so here.
> Last structural update: 2026-08-19.

---

## 1. Project identity

**Repo:** `os-portfolio` — https://github.com/tiwarygaurav/os-portfolio
**Owner:** Kumar Gaurav (`tiwarygaurav`) — software engineer; backend, geospatial data, applied ML.
**Deployed:** not yet confirmed. `ProjectsApp` references `https://os-portfolio.vercel.app` — unverified.

### What it is today

A browser-based Windows XP simulation used as a personal portfolio. Boot screen -> login ->
desktop with draggable icons, taskbar, start menu, and floating windows containing portfolio
content plus toy apps (Minesweeper, Calculator, Notepad, Paint).

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
| Rendering | Effectively 100% client | `page.tsx` returns `null` until `mounted` — see §5 debt |
| Language | TypeScript 5, `strict: true` | `any` still present in several contracts |
| State | Zustand 4 + `persist` (localStorage) | `store/useSystemStore.ts`, key `gaurav-xp-os` |
| Styling | Tailwind 3 + inline `style` for gradients | `utils/cn.ts` = clsx + tailwind-merge |
| Animation | Framer Motion 11 | Drag, window transitions, mount fades |
| Icons | `/public/icons/*.ico\|png` + lucide-react | Custom `.ico`/`.png` for identity; lucide for controls |
| Audio | WebAudio oscillators for UI, `<audio>` for samples | `utils/sound.ts`; `startup.mp3` is the XP boot sound |
| Data | `content/` -> `system/vfs.ts` | Single source of truth (introduced 2026-08-19) |

### Directory map

```
app/          layout + the single page; boot/login/desktop/shutdown state machine
components/
  os/         shell chrome: BootScreen, LoginScreen, Desktop, Window, Taskbar,
              StartMenu, DesktopIcon, ExplorerLayout
  apps/       one component per application window
  ui/         shared primitives (currently only ContextMenu)
constants/    apps.ts — the app registry (id, title, icon, default size, capabilities)
content/      Typed source of truth for all portfolio facts. No JSX, no styling.
system/       Headless runtime: virtual filesystem, shell. No React.
store/        Zustand store + window manager
utils/        cn, sound
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

`content/` and `system/` must never import from `components/`, `app/`, or `react`.

---

## 3. Core systems

### Boot -> login -> desktop -> shutdown

State machine lives in `store/useSystemStore.ts` (`isBooting`, `isLoggedIn`, `isShuttingDown`)
and renders from `app/page.tsx`. Boot gates on a click (required for the browser audio autoplay
policy — do not remove that gate without replacing the gesture). Boot is a fixed 4.5 s timer,
not tied to real loading. Shutdown is a 2.4 s overlay that returns to the login screen.

### Window manager (`store/useSystemStore.ts` + `components/os/Window.tsx`)

- One window per `appId` (re-opening focuses the existing one and replaces `payload`).
- Windows are absolutely positioned; drag via Framer `useDragControls` started from the title bar.
- `zIndex` is renormalised to a compact `10..10+n` band on every focus, so windows can never
  climb over the taskbar (`z-50`).
- Resize via a manual pointer-event handler on the bottom-right grip; `canResize` / `canMaximize`
  come from the app registry.
- Window ids are readable pids (`w1`, `w2`, …) because `ps` and `kill` expose them to the user.
- `restoreWindow` (un-minimise, keeps maximised) and `unmaximizeWindow` are separate on purpose.
- Positions are clamped so a window can never be dragged fully off-screen.

### App registry (`constants/apps.ts`)

`APPS: Record<string, AppConfig>` is the single source for id/title/icon/size/capabilities, and
`DESKTOP_ICONS` orders the desktop. **The component mapping lives separately** in
`components/os/Window.tsx` (`APP_COMPONENTS`) — two places to edit per app. Consolidating these
is a known task.

### Terminal / shell

`system/shell.ts` is a **headless** command layer: it parses input and returns `ShellLine[]` —
no JSX, no DOM. `components/apps/TerminalApp.tsx` renders that output. Commands operate on the
real VFS (`system/vfs.ts`) and receive a `ShellContext` for side effects (open/close windows,
list processes). Adding a command must not require touching the renderer.

### Virtual filesystem (`system/vfs.ts`)

A tree built at module load from `content/`. `/home/gaurav/**` mirrors the portfolio; `/proc` is
generated per call from live window state. Files can carry an `open` hint `{ appId, payload }`
so `open <path>` launches the matching GUI app — this is what keeps shell and GUI in sync.

### Audio (`utils/sound.ts`)

Synthesised UI sounds via a single lazily-created `AudioContext`; `startup` is the only sampled
file. Volume/mute read from the store on every call. Never autoplay before a user gesture.

### Persistence

`partialize` persists only: volume, mute, wallpaper, theme colour, icon positions, recycle bin,
deleted app ids. Windows and session state are deliberately **not** persisted.

---

## 4. Design language

**Current (XP-literal):** `#245edb` taskbar blue, `#ece9d8` control beige, `#316ac5` selection,
title-bar gradient `#0058ee -> #0073e6`, Tahoma/Verdana, 3-D bevels via inset box-shadows,
XP-style green start button, windows at `rounded-t-xl`.

**Target: the same palette, defined once.** The XP look is the identity and does not change. What
should change is that these values live inline in ~40 components, so nothing can be adjusted
consistently and the Display Properties Themes tab has nothing to drive. Moving them into
`tailwind.config.ts` + CSS variables — **with exactly the values above** — is a consolidation, not
a redesign: the desktop looks identical afterwards, and Blue / Olive Green / Silver become
implementable as real XP themes.

Until that migration lands, do not add new hardcoded hex values to components; reuse the existing
ones. Any new surface must adopt the XP grammar so it looks like it shipped with the rest.

**Motion:** 120–200 ms, ease-out, transform/opacity only. Nothing loops forever. Motion states a
change; it never decorates. All of it must respect `prefers-reduced-motion` (not yet implemented).

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
Minesweeper (complete, correct first-click-safe generation) - Calculator (complete, incl.
memory) - Notepad (edit, word-wrap, save-as-download, insert date) - Image viewer - Display
Properties (wallpaper switch, icon reset) - Media player (real playback, real playlist).

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
| 4 px gap under maximised windows | Maximise height matches the 36 px taskbar |
| `window` prop shadowed the global in `Window.tsx` | Renamed to `win` |
| `npm run lint` prompted interactively | `.eslintrc.json`; 0 errors |
| `ps` pids ran into the STATE column (`l9zk988fnrunning`), so `kill` was unusable | Readable `w1`, `w2`… pids and measured column widths |

**Dead controls removed:** ExplorerLayout Back/Forward/Search/Folders/Go + editable address ·
MyComputer Back/Forward/Up/Refresh/Search/Folders/Go · Settings OK/Cancel/Apply · Settings
Screen Saver dropdown · Resume "Find…" box and "1 / 1" page counter · MyComputer sidebar links
that fired `alert('Not implemented')`.

### Still broken / not built

| Item | Detail |
| --- | --- |
| Media licensing | The playlist and XP assets ship by the owner's decision — see §9. Repo is ~53 MB as a result. Not a bug; do not "fix" it. |
| Paint | Still an `<iframe>` to `jspaint.app` — not the owner's work, blockable by the host. |
| `alert()` / `confirm()` | 10 remaining uses (icon delete, Konami, Notepad menus). They work, but a native browser dialog breaks the XP illusion — an in-world XP-styled dialog would be better. |
| Desktop icon layout | Still computed once from `window.innerHeight` with no resize listener (C10). |
| Notepad `execCommand` | Deprecated; Paste is blocked by browsers (C12). |
| `deletedAppIds` | Still persisted — a visitor can permanently lose the Projects icon (A10). |
| Bundle | All 15 apps still statically imported into the initial bundle (P4). |
| Icon weight | `.ico` files up to 465 KB rendered at 48 px; ~2 MB on first desktop paint. Re-export at 2x display size — keep the same artwork. |
| Not implemented | Mobile/touch model · desktop keyboard navigation · focus trapping · reduced motion · SEO metadata / OG image / favicon · error boundary · tests. |

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
4. **Keep the tree runnable.** Every commit must `npm run build` clean.
5. **Type safety.** No new `any`. Prefer discriminated unions over optional-field soup.
6. **`system/` and `content/` stay headless** — no React, no DOM, no styling. This is what makes
   the shell testable and the architecture explainable.
7. **Zustand: subscribe with selectors.** `useSystemStore(s => s.windows)`, never bare
   `useSystemStore()` in new code — the bare form re-renders on every unrelated state change.
8. **Transform/opacity only** for animation. No layout-animating loops. Nothing runs forever.
9. **Use the existing asset system.** Do not replace custom `.ico` / `.png` icons with lucide
   glyphs. Lucide is for controls and UI affordances, not for identity.
10. **No new dependencies** without recording why in §8.
11. **Test interaction-heavy components by hand** after changing them: drag, resize, maximize,
    minimize, restore, close, taskbar round-trip, keyboard.
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
